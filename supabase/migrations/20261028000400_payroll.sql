-- Shifts, pay rates, pay periods, timesheet approval, deductions and payslips.
-- Money is stored in the smallest currency unit (bigint); each line is rounded half-up.

create type public.pay_basis as enum ('hourly', 'daily', 'monthly');
create type public.period_status as enum ('open', 'in_review', 'locked', 'finalized');
create type public.deduction_kind as enum ('fixed', 'percent', 'bracket');
create type public.payslip_status as enum ('draft', 'final', 'void');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  site_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (site_id, org_id) references public.sites (id, org_id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours'),
  exclude using gist (membership_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);
create index shifts_member_start on public.shifts (membership_id, starts_at);

create table public.pay_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  basis public.pay_basis not null,
  amount_minor bigint not null check (amount_minor > 0),
  effective_from date not null,
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  unique (membership_id, effective_from)
);

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status public.period_status not null default 'open',
  locked_by uuid references public.memberships (id),
  locked_at timestamptz,
  lock_override_reason text,
  finalized_by uuid references public.memberships (id),
  finalized_at timestamptz,
  check (ends_on >= starts_on and ends_on - starts_on <= 31),
  exclude using gist (org_id with =, daterange(starts_on, ends_on, '[]') with &&)
);

create table public.timesheet_approvals (
  period_id uuid not null references public.pay_periods (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  approved_by uuid not null references public.memberships (id),
  approved_at timestamptz not null default now(),
  note text,
  primary key (period_id, membership_id)
);

-- brackets: [{"up_to_minor": 2000000, "rate_percent": 0, "fixed_minor": 0}, {"up_to_minor": null, ...}]
create table public.deduction_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  kind public.deduction_kind not null,
  value numeric(12, 4),
  brackets jsonb,
  active boolean not null default true,
  is_sample boolean not null default false,
  check (kind = 'bracket' or value is not null),
  check (kind <> 'percent' or value between 0 and 100),
  check (kind <> 'bracket' or jsonb_typeof(brackets) = 'array')
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  period_id uuid not null references public.pay_periods (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  regular_minutes int not null default 0,
  overtime_minutes int not null default 0,
  late_minutes int not null default 0,
  absent_days int not null default 0,
  gross_minor bigint not null default 0,
  deductions_minor bigint not null default 0,
  net_minor bigint not null default 0,
  status public.payslip_status not null default 'draft',
  rates_snapshot jsonb not null default '{}',
  void_reason text,
  generated_at timestamptz not null default now(),
  check (net_minor = gross_minor - deductions_minor),
  check (status <> 'void' or length(trim(coalesce(void_reason, ''))) > 0)
);
create unique index payslips_one_live on public.payslips (period_id, membership_id) where status <> 'void';

create table public.payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  position smallint not null,
  kind text not null check (kind in ('earning', 'deduction')),
  label text not null,
  quantity numeric(12, 2),
  unit text,
  rate_minor bigint,
  amount_minor bigint not null check (amount_minor >= 0)
);

------------------------------------------------------------------------------
-- Locks.
------------------------------------------------------------------------------

create function private.period_locked(p_org uuid, p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pay_periods
    where org_id = p_org and p_date between starts_on and ends_on and status in ('locked', 'finalized'))
$$;

create function private.guard_locked_entries()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and private.period_locked(old.org_id, old.work_date)
     and exists (select 1 from public.organizations where id = old.org_id) then
    raise exception 'This day is in a locked pay period' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and private.period_locked(new.org_id, new.work_date) then
    raise exception 'This day is in a locked pay period' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger time_entries_period_lock before insert or update or delete on public.time_entries
  for each row execute function private.guard_locked_entries();

-- Payslips: drafts can be replaced; final ones only move to void, through void_payslip.
create function private.guard_payslips()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.organizations where id = old.org_id) then
      raise exception 'Final payslips can''t be deleted; void them instead' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status = 'final' then
    if new.status = 'void' and current_setting('app.voiding', true) = 'on'
       and (to_jsonb(new) - 'status' - 'void_reason') = (to_jsonb(old) - 'status' - 'void_reason') then
      return new;
    end if;
    raise exception 'Final payslips can''t be changed' using errcode = '42501';
  end if;
  if old.status = 'void' then
    raise exception 'Void payslips can''t be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger payslips_guard before update or delete on public.payslips
  for each row execute function private.guard_payslips();

create function private.guard_payslip_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.payslip_status;
begin
  select status into v_status from public.payslips where id = coalesce(new.payslip_id, old.payslip_id);
  if v_status in ('final', 'void') then
    raise exception 'Lines of a final payslip can''t be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger payslip_lines_guard before insert or update or delete on public.payslip_lines
  for each row execute function private.guard_payslip_lines();

-- Totals must equal the sum of the lines (checked at commit, after all lines are written).
create function private.check_payslip_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.payslips;
begin
  select * into p from public.payslips
  where id = case when tg_table_name = 'payslips' then new.id else (to_jsonb(new) ->> 'payslip_id')::uuid end;
  if p.id is null then return null; end if;
  if p.gross_minor <> coalesce((select sum(amount_minor) from public.payslip_lines where payslip_id = p.id and kind = 'earning'), 0)
     or p.deductions_minor <> coalesce((select sum(amount_minor) from public.payslip_lines where payslip_id = p.id and kind = 'deduction'), 0) then
    raise exception 'Payslip totals don''t match its lines' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger payslips_totals after insert or update on public.payslips
  deferrable initially deferred for each row execute function private.check_payslip_totals();
create constraint trigger payslip_lines_totals after insert or update on public.payslip_lines
  deferrable initially deferred for each row execute function private.check_payslip_totals();

------------------------------------------------------------------------------
-- Shifts.
------------------------------------------------------------------------------

create function public.save_shift(p_member uuid, p_site uuid, p_starts timestamptz, p_ends timestamptz, p_shift uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select org_id from public.memberships where id = p_member);
  v_id uuid;
begin
  perform private.require_feature(v_org, 'scheduling');
  if not private.can_act_on_member(p_member, 'schedule.manage') then
    raise exception 'You can''t schedule this person' using errcode = '42501';
  end if;
  if p_shift is null then
    insert into public.shifts (org_id, membership_id, site_id, starts_at, ends_at)
    values (v_org, p_member, p_site, p_starts, p_ends) returning id into v_id;
  else
    update public.shifts set site_id = p_site, starts_at = p_starts, ends_at = p_ends
    where id = p_shift and membership_id = p_member returning id into v_id;
  end if;
  return v_id;
exception when exclusion_violation then
  raise exception 'This shift overlaps another shift for the same person' using errcode = '23P01';
end $$;

create function public.delete_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_act_on_member((select membership_id from public.shifts where id = p_shift), 'schedule.manage') then
    raise exception 'You can''t change this schedule' using errcode = '42501';
  end if;
  delete from public.shifts where id = p_shift;
end $$;

------------------------------------------------------------------------------
-- Pay periods.
------------------------------------------------------------------------------

create function public.create_pay_period(p_org uuid, p_starts date, p_ends date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_feature(p_org, 'payroll');
  perform private.require_permission(p_org, 'payroll.run');
  insert into public.pay_periods (org_id, starts_on, ends_on) values (p_org, p_starts, p_ends) returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'This period overlaps another pay period' using errcode = '23P01';
end $$;

create function public.start_review(p_period uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pay_periods;
begin
  select * into p from public.pay_periods where id = p_period for update;
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'open' then raise exception 'Only an open period can go to review' using errcode = 'P0001'; end if;
  if p.ends_on >= (now() at time zone (select timezone from public.org_settings where org_id = p.org_id))::date then
    raise exception 'The period hasn''t ended yet' using errcode = 'P0001';
  end if;
  update public.pay_periods set status = 'in_review' where id = p_period;
end $$;

-- Members with time or shifts in the period, who need a timesheet approval.
create function private.period_members(p_period uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct m.id from public.pay_periods p
  join public.memberships m on m.org_id = p.org_id
  where p.id = p_period and (
    exists (select 1 from public.time_entries e where e.membership_id = m.id and e.work_date between p.starts_on and p.ends_on)
    or exists (select 1 from public.shifts s where s.membership_id = m.id
               and (s.starts_at at time zone coalesce(private.site_timezone(s.site_id), 'UTC'))::date between p.starts_on and p.ends_on))
$$;

create function public.approve_timesheet(p_period uuid, p_member uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pay_periods;
begin
  select * into p from public.pay_periods where id = p_period;
  if p.status <> 'in_review' then raise exception 'Timesheets are approved while the period is in review' using errcode = 'P0001'; end if;
  if not private.can_act_on_member(p_member, 'requests.review') then
    raise exception 'You can''t approve this timesheet' using errcode = '42501';
  end if;
  if exists (select 1 from public.correction_requests r where r.membership_id = p_member and r.status = 'pending'
             and r.work_date between p.starts_on and p.ends_on) then
    raise exception 'Decide this person''s pending requests first' using errcode = 'P0001';
  end if;
  insert into public.timesheet_approvals (period_id, membership_id, approved_by, note)
  values (p_period, p_member, private.my_membership(p.org_id), p_note)
  on conflict (period_id, membership_id) do update set approved_by = excluded.approved_by, approved_at = now(), note = excluded.note;
end $$;

create function public.lock_period(p_period uuid, p_override_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_periods;
  v_missing int;
begin
  select * into p from public.pay_periods where id = p_period for update;
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'in_review' then raise exception 'Only a period in review can be locked' using errcode = 'P0001'; end if;
  select count(*) into v_missing from private.period_members(p_period) m
  where not exists (select 1 from public.timesheet_approvals a where a.period_id = p_period and a.membership_id = m);
  if v_missing > 0 and length(trim(coalesce(p_override_reason, ''))) = 0 then
    raise exception '% timesheet(s) still need approval', v_missing using errcode = 'P0001';
  end if;
  update public.pay_periods set status = 'locked', locked_by = private.my_membership(p.org_id), locked_at = now(),
    lock_override_reason = case when v_missing > 0 then trim(p_override_reason) end
  where id = p_period;
end $$;

create function public.unlock_period(p_period uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pay_periods;
begin
  select * into p from public.pay_periods where id = p_period for update;
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'locked' then raise exception 'Only a locked (not finalized) period can be unlocked' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform set_config('app.reason', trim(p_reason), true);
  delete from public.payslips where period_id = p_period and status = 'draft';
  update public.pay_periods set status = 'in_review', locked_by = null, locked_at = null where id = p_period;
end $$;

------------------------------------------------------------------------------
-- Payslip calculation.
------------------------------------------------------------------------------

create function private.round_minor(x numeric) returns bigint language sql immutable as $$
  select round(x, 0)::bigint   -- numeric round is half away from zero, i.e. half-up for positive amounts
$$;

create function private.periods_per_year(f public.pay_frequency) returns int language sql immutable as $$
  select case f when 'weekly' then 52 when 'biweekly' then 26 when 'semimonthly' then 24 else 12 end
$$;

-- Hourly and daily equivalents of a rate, given the business's regular day.
create function private.hourly_equivalent(p_basis public.pay_basis, p_amount bigint, p_regular_minutes int)
returns numeric language sql immutable as $$
  select case p_basis
    when 'hourly' then p_amount::numeric
    when 'daily' then p_amount / (p_regular_minutes / 60.0)
    else p_amount * 12.0 / 261 / (p_regular_minutes / 60.0) end   -- 261 working days a year
$$;

-- Builds one draft payslip, day by day, using the rate in force on each day.
-- Returns null when the member had no worked time (no attendance, no payslip).
create function private.build_payslip(p_period uuid, p_member uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_periods;
  s public.org_settings;
  v_id uuid;
  v_last public.pay_rates;
  v_has_shifts boolean;
  v_reg int := 0; v_ot int := 0; v_late int := 0; v_absent int := 0; v_paid_days int := 0;
  v_reg_pay numeric := 0; v_ot_pay numeric := 0; v_base_pay numeric := 0; v_absent_pay numeric := 0; v_late_pay numeric := 0;
  v_rates int;
  v_pos int := 0;
  v_gross bigint := 0; v_ded bigint := 0; v_amount bigint;
  v_hourly numeric; v_daily numeric; v_day_reg int; v_day_ot int; v_day_late int;
  d record;
  r public.deduction_rules;
  b jsonb; v_prev bigint;
begin
  select * into p from public.pay_periods where id = p_period;
  select * into s from public.org_settings where org_id = p.org_id;
  select * into v_last from public.pay_rates where membership_id = p_member and effective_from <= p.ends_on
  order by effective_from desc limit 1;
  if v_last.id is null then return null; end if;
  select count(distinct pr.id) into v_rates from public.pay_rates pr
  where pr.membership_id = p_member and pr.effective_from <= p.ends_on
    and pr.effective_from >= coalesce((select max(effective_from) from public.pay_rates where membership_id = p_member and effective_from <= p.starts_on), p.starts_on);

  v_has_shifts := exists (select 1 from public.shifts sh where sh.membership_id = p_member
    and (sh.starts_at at time zone coalesce(private.site_timezone(sh.site_id), s.timezone))::date between p.starts_on and p.ends_on);

  for d in
    with days as (select gs::date as day from generate_series(p.starts_on, p.ends_on, interval '1 day') gs),
    worked as (
      select e.work_date as day, sum(e.worked_minutes)::int as minutes, min(e.clock_in) as first_in
      from public.time_entries e
      where e.membership_id = p_member and e.work_date between p.starts_on and p.ends_on and e.status in ('closed', 'missing_out')
      group by e.work_date),
    sched as (
      select (sh.starts_at at time zone coalesce(private.site_timezone(sh.site_id), s.timezone))::date as day, min(sh.starts_at) as starts_at
      from public.shifts sh where sh.membership_id = p_member group by 1)
    select dd.day, coalesce(w.minutes, 0) as minutes, w.first_in, sc.starts_at, rt.basis, rt.amount_minor
    from days dd
    left join worked w on w.day = dd.day
    left join sched sc on sc.day = dd.day
    left join lateral (select r2.basis, r2.amount_minor from public.pay_rates r2
      where r2.membership_id = p_member and r2.effective_from <= dd.day order by r2.effective_from desc limit 1) rt on true
    order by dd.day
  loop
    continue when d.basis is null;
    v_hourly := private.hourly_equivalent(d.basis, d.amount_minor, s.regular_minutes_per_day);
    v_daily := v_hourly * s.regular_minutes_per_day / 60.0;
    v_day_reg := least(d.minutes, s.regular_minutes_per_day);
    v_day_ot := greatest(d.minutes - s.regular_minutes_per_day, 0);
    v_day_late := 0;
    -- Late only when beyond the grace minutes; then counted from the shift start.
    if d.minutes > 0 and d.starts_at is not null and d.first_in > d.starts_at + make_interval(mins => s.grace_minutes) then
      v_day_late := floor(extract(epoch from (d.first_in - d.starts_at)) / 60)::int;
    end if;

    v_reg := v_reg + v_day_reg;
    v_ot := v_ot + v_day_ot;
    v_ot_pay := v_ot_pay + v_day_ot / 60.0 * v_hourly * s.overtime_multiplier;

    if d.basis = 'hourly' then
      v_reg_pay := v_reg_pay + v_day_reg / 60.0 * v_hourly;
    else
      -- Daily and monthly staff: paid per scheduled day (or per worked day without schedules),
      -- with absences and tardiness deducted.
      if (v_has_shifts and d.starts_at is not null) or (not v_has_shifts and d.minutes > 0) then
        v_paid_days := v_paid_days + 1;
        v_base_pay := v_base_pay + v_daily;
      end if;
      if d.starts_at is not null and d.minutes = 0 and d.starts_at < now() then
        v_absent := v_absent + 1;
        v_absent_pay := v_absent_pay + v_daily;
      end if;
      v_late := v_late + v_day_late;
      v_late_pay := v_late_pay + v_day_late / 60.0 * v_hourly;
    end if;
  end loop;

  if v_reg + v_ot = 0 then return null; end if;

  insert into public.payslips (org_id, period_id, membership_id) values (p.org_id, p_period, p_member) returning id into v_id;

  -- Earnings.
  if v_reg_pay > 0 then
    v_amount := private.round_minor(v_reg_pay); v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, quantity, unit, rate_minor, amount_minor)
    values (v_id, v_pos, 'earning', 'Regular hours', round(v_reg / 60.0, 2), 'h',
            case when v_rates = 1 then v_last.amount_minor end, v_amount);
    v_gross := v_gross + v_amount;
  end if;
  if v_base_pay > 0 then
    v_amount := private.round_minor(v_base_pay); v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, quantity, unit, rate_minor, amount_minor)
    values (v_id, v_pos, 'earning', 'Basic pay', v_paid_days, 'days',
            case when v_rates = 1 then private.round_minor(private.hourly_equivalent(v_last.basis, v_last.amount_minor, s.regular_minutes_per_day) * s.regular_minutes_per_day / 60.0) end,
            v_amount);
    v_gross := v_gross + v_amount;
  end if;
  if v_ot > 0 then
    v_amount := private.round_minor(v_ot_pay); v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, quantity, unit, rate_minor, amount_minor)
    values (v_id, v_pos, 'earning', format('Overtime (x%s)', s.overtime_multiplier), round(v_ot / 60.0, 2), 'h', null, v_amount);
    v_gross := v_gross + v_amount;
  end if;

  -- Time-based deductions.
  if v_absent > 0 then
    v_amount := least(private.round_minor(v_absent_pay), v_gross); v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, quantity, unit, amount_minor)
    values (v_id, v_pos, 'deduction', format('Absences, %s day%s', v_absent, case when v_absent = 1 then '' else 's' end), v_absent, 'days', v_amount);
    v_ded := v_ded + v_amount;
  end if;
  if v_late > 0 then
    v_amount := least(private.round_minor(v_late_pay), v_gross - v_ded); v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, quantity, unit, amount_minor)
    values (v_id, v_pos, 'deduction', format('Tardiness, %s min', v_late), v_late, 'min', v_amount);
    v_ded := v_ded + v_amount;
  end if;

  -- Business deduction rules, applied to gross pay.
  for r in select * from public.deduction_rules where org_id = p.org_id and active order by name loop
    if r.kind = 'fixed' then
      v_amount := r.value::bigint;
    elsif r.kind = 'percent' then
      v_amount := private.round_minor(v_gross * r.value / 100);
    else
      v_amount := 0; v_prev := 0;
      for b in select value from jsonb_array_elements(r.brackets) loop
        if (b ->> 'up_to_minor') is null or v_gross <= (b ->> 'up_to_minor')::bigint then
          v_amount := coalesce((b ->> 'fixed_minor')::bigint, 0)
            + private.round_minor((v_gross - v_prev) * coalesce((b ->> 'rate_percent')::numeric, 0) / 100);
          exit;
        end if;
        v_prev := (b ->> 'up_to_minor')::bigint;
      end loop;
    end if;
    v_amount := least(greatest(v_amount, 0), v_gross - v_ded);
    continue when v_amount = 0;
    v_pos := v_pos + 1;
    insert into public.payslip_lines (payslip_id, position, kind, label, amount_minor)
    values (v_id, v_pos, 'deduction', r.name || case when r.is_sample then ' (sample rate)' else '' end, v_amount);
    v_ded := v_ded + v_amount;
  end loop;

  update public.payslips set
    regular_minutes = v_reg, overtime_minutes = v_ot, late_minutes = v_late, absent_days = v_absent,
    gross_minor = v_gross, deductions_minor = v_ded, net_minor = v_gross - v_ded,
    rates_snapshot = jsonb_build_object(
      'rates', (select jsonb_agg(jsonb_build_object('basis', r3.basis, 'amount_minor', r3.amount_minor, 'effective_from', r3.effective_from) order by r3.effective_from)
                from public.pay_rates r3 where r3.membership_id = p_member and r3.effective_from <= p.ends_on),
      'regular_minutes_per_day', s.regular_minutes_per_day, 'overtime_multiplier', s.overtime_multiplier,
      'grace_minutes', s.grace_minutes, 'pay_frequency', s.pay_frequency,
      'deduction_rules', (select coalesce(jsonb_agg(to_jsonb(dr) - 'org_id'), '[]') from public.deduction_rules dr where dr.org_id = p.org_id and dr.active))
  where id = v_id;
  return v_id;
end $$;


create function public.generate_payslips(p_period uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_periods;
  v_count int := 0;
  m uuid;
begin
  select * into p from public.pay_periods where id = p_period for update;
  perform private.require_feature(p.org_id, 'payroll');
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'locked' then raise exception 'Lock the period before generating payslips' using errcode = 'P0001'; end if;
  delete from public.payslips where period_id = p_period and status = 'draft';
  for m in select private.period_members(p_period) loop
    if private.build_payslip(p_period, m) is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

create function public.finalize_period(p_period uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pay_periods;
begin
  select * into p from public.pay_periods where id = p_period for update;
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'locked' then raise exception 'Only a locked period can be finalized' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.payslips where period_id = p_period and status = 'draft') then
    raise exception 'Generate payslips first' using errcode = 'P0001';
  end if;
  update public.payslips set status = 'final' where period_id = p_period and status = 'draft';
  update public.pay_periods set status = 'finalized', finalized_by = private.my_membership(p.org_id), finalized_at = now()
  where id = p_period;
end $$;

create function public.void_payslip(p_payslip uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := (select org_id from public.payslips where id = p_payslip);
begin
  perform private.require_permission(v_org, 'payroll.run');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform set_config('app.voiding', 'on', true);
  update public.payslips set status = 'void', void_reason = trim(p_reason) where id = p_payslip and status = 'final';
  perform set_config('app.voiding', 'off', true);
  if not found then raise exception 'Only final payslips can be voided' using errcode = 'P0001'; end if;
end $$;

-- After a void: issue a corrected final payslip for that member (the period stays finalized).
create function public.reissue_payslip(p_period uuid, p_member uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_periods;
  v_id uuid;
begin
  select * into p from public.pay_periods where id = p_period;
  perform private.require_permission(p.org_id, 'payroll.run');
  if p.status <> 'finalized' then raise exception 'Reissuing is for finalized periods' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payslips where period_id = p_period and membership_id = p_member and status <> 'void') then
    raise exception 'Void the current payslip first' using errcode = 'P0001';
  end if;
  v_id := private.build_payslip(p_period, p_member);
  if v_id is null then raise exception 'No worked time in this period' using errcode = 'P0001'; end if;
  update public.payslips set status = 'final' where id = v_id;
  return v_id;
end $$;

-- Members with worked shifts or entries but no payslip, so "no attendance, no payslip" is a visible decision.
create function public.period_without_payslip(p_period uuid)
returns table (membership_id uuid, display_name text, reason text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name,
    case when not exists (select 1 from public.pay_rates r where r.membership_id = m.id) then 'no pay rate'
         else 'no worked time' end
  from public.memberships m
  join public.pay_periods p on p.id = p_period and p.org_id = m.org_id
  where private.has_permission(p.org_id, 'payroll.run') and m.status <> 'inactive'
    and not exists (select 1 from public.payslips ps where ps.period_id = p_period and ps.membership_id = m.id and ps.status <> 'void')
$$;

------------------------------------------------------------------------------
-- Row-level security and grants.
------------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.pay_rates enable row level security;
alter table public.pay_periods enable row level security;
alter table public.timesheet_approvals enable row level security;
alter table public.deduction_rules enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_lines enable row level security;

revoke all on public.shifts, public.pay_rates, public.pay_periods, public.timesheet_approvals,
  public.deduction_rules, public.payslips, public.payslip_lines from anon, authenticated;
grant select on public.shifts, public.pay_rates, public.pay_periods, public.timesheet_approvals,
  public.deduction_rules, public.payslips, public.payslip_lines to authenticated;
grant insert, delete on public.pay_rates to authenticated;
grant insert, update, delete on public.deduction_rules to authenticated;

create policy "see shifts you may see" on public.shifts
  for select to authenticated using (private.can_see_member(membership_id));

create policy "see your own rate, or all with payroll" on public.pay_rates
  for select to authenticated
  using (membership_id = private.my_membership(org_id) or private.has_permission(org_id, 'payroll.run'));
create policy "payroll sets rates" on public.pay_rates
  for insert to authenticated
  with check (private.has_permission(org_id, 'payroll.run')
    and org_id = (select m.org_id from public.memberships m where m.id = membership_id));
create policy "payroll removes future rates" on public.pay_rates
  for delete to authenticated using (private.has_permission(org_id, 'payroll.run') and effective_from > current_date);

create policy "members see pay periods" on public.pay_periods
  for select to authenticated using (private.is_member(org_id));
create policy "see approvals you may see" on public.timesheet_approvals
  for select to authenticated using (private.can_see_member(membership_id));

create policy "members see deduction rules" on public.deduction_rules
  for select to authenticated using (private.is_member(org_id));
create policy "payroll manages deduction rules" on public.deduction_rules
  for all to authenticated using (private.has_permission(org_id, 'payroll.run'))
  with check (private.has_permission(org_id, 'payroll.run'));

create policy "see your own payslips, or all with payroll" on public.payslips
  for select to authenticated
  using (membership_id = private.my_membership(org_id) or private.has_permission(org_id, 'payroll.run'));
create policy "see lines of payslips you may see" on public.payslip_lines
  for select to authenticated
  using (exists (select 1 from public.payslips p where p.id = payslip_id));

create trigger audit_pay_rates after insert or delete on public.pay_rates for each row execute function private.audit_row();
create trigger audit_deduction_rules after insert or update or delete on public.deduction_rules for each row execute function private.audit_row();
create trigger audit_pay_periods after update on public.pay_periods for each row execute function private.audit_row();

do $$
declare f text;
begin
  foreach f in array array[
    'save_shift(uuid, uuid, timestamptz, timestamptz, uuid)', 'delete_shift(uuid)',
    'create_pay_period(uuid, date, date)', 'start_review(uuid)', 'approve_timesheet(uuid, uuid, text)',
    'lock_period(uuid, text)', 'unlock_period(uuid, text)', 'generate_payslips(uuid)', 'finalize_period(uuid)',
    'void_payslip(uuid, text)', 'reissue_payslip(uuid, uuid)', 'period_without_payslip(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.close_missing_out() from authenticated, public;
