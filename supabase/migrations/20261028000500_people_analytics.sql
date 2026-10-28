-- Invitations, demo account protection, output tracking and workforce analytics.

------------------------------------------------------------------------------
-- Invitations: a people manager invites by email; the token is shown once and stored hashed.
------------------------------------------------------------------------------

create function public.invite_member(
  p_org uuid, p_email text, p_display_name text, p_role uuid,
  p_manager uuid default null, p_employment_type public.employment_type default 'regular'
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform private.require_permission(p_org, 'people.manage');
  insert into public.memberships (org_id, display_name, role_id, manager_id, employment_type, status)
  values (p_org, trim(p_display_name), p_role, p_manager, p_employment_type, 'invited')
  returning id into v_member;
  insert into public.invitations (org_id, membership_id, email, token_hash)
  values (p_org, v_member, lower(trim(p_email)), encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

create function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invitations;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into i from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0001';
  end if;
  if lower((select email from auth.users where id = auth.uid())) <> i.email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  update public.memberships set user_id = auth.uid(), status = 'active' where id = i.membership_id;
  update public.invitations set accepted_at = now() where id = i.id;
  return i.org_id;
end $$;

revoke execute on function public.invite_member, public.accept_invitation from public, anon;
grant execute on function public.invite_member, public.accept_invitation to authenticated;

create policy "people managers see invitations" on public.invitations
  for select to authenticated using (private.has_permission(org_id, 'people.manage'));
grant select (id, org_id, membership_id, email, expires_at, accepted_at) on public.invitations to authenticated;

------------------------------------------------------------------------------
-- Demo accounts (app_metadata.demo = true) can't change their email or password.
------------------------------------------------------------------------------

create function private.protect_demo_users()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((old.raw_app_meta_data ->> 'demo')::boolean, false)
     and (new.email is distinct from old.email or new.encrypted_password is distinct from old.encrypted_password)
     and current_setting('app.seeding', true) is distinct from 'on' then
    raise exception 'Demo accounts can''t change their email or password' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger protect_demo_users before update on auth.users
  for each row execute function private.protect_demo_users();

------------------------------------------------------------------------------
-- Output tracking (optional feature): a count the business defines, logged per day.
------------------------------------------------------------------------------

create table public.output_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  work_date date not null,
  metric text not null check (length(trim(metric)) between 2 and 40),
  quantity numeric(10, 2) not null check (quantity >= 0),
  note text,
  created_at timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade
);
create index output_records_member_date on public.output_records (membership_id, work_date);

create table public.output_targets (
  org_id uuid not null references public.organizations (id) on delete cascade,
  metric text not null,
  employment_type public.employment_type not null,
  per_month numeric(10, 2) not null check (per_month > 0),
  primary key (org_id, metric, employment_type)
);

-- Output can be logged or changed only on the day it belongs to (in the business's timezone).
create function private.guard_output()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date;
begin
  -- The demo seed writes past days; nothing else can set this flag (it's set inside a security definer function).
  if current_setting('app.seeding', true) = 'on' then return coalesce(new, old); end if;
  -- Removed because the whole business is being deleted.
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = old.org_id) then return old; end if;
  select (now() at time zone timezone)::date into v_today from public.org_settings
  where org_id = coalesce(new.org_id, old.org_id);
  if coalesce(new.work_date, old.work_date) <> v_today or (tg_op = 'UPDATE' and new.work_date <> old.work_date) then
    raise exception 'Output can only be logged or changed on the same day' using errcode = 'P0001';
  end if;
  if not private.feature_enabled(coalesce(new.org_id, old.org_id), 'output_tracking') then
    raise exception 'The output tracking feature is switched off for this business' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger output_records_same_day before insert or update or delete on public.output_records
  for each row execute function private.guard_output();

alter table public.output_records enable row level security;
alter table public.output_targets enable row level security;
revoke all on public.output_records, public.output_targets from anon, authenticated;
grant select, insert, update, delete on public.output_records to authenticated;
grant select on public.output_targets to authenticated;
grant insert, update, delete on public.output_targets to authenticated;

create policy "see output you may see" on public.output_records
  for select to authenticated using (private.can_see_member(membership_id));
create policy "log your own output, or your team's" on public.output_records
  for all to authenticated
  using (membership_id = private.my_membership(org_id) or private.can_act_on_member(membership_id, 'time.edit'))
  with check (membership_id = private.my_membership(org_id) or private.can_act_on_member(membership_id, 'time.edit'));
create policy "members see targets" on public.output_targets
  for select to authenticated using (private.is_member(org_id));
create policy "settings managers set targets" on public.output_targets
  for all to authenticated using (private.has_permission(org_id, 'settings.manage'))
  with check (private.has_permission(org_id, 'settings.manage'));

------------------------------------------------------------------------------
-- Analytics. security_invoker views and functions: row-level security applies to the reader,
-- so a manager's figures can only ever include people they're allowed to see.
------------------------------------------------------------------------------

-- One row per member per day that had a shift or worked time.
create view public.member_day_facts with (security_invoker = true) as
with worked as (
  select e.org_id, e.membership_id, e.work_date as day,
    sum(e.worked_minutes)::int as worked_minutes,
    min(e.clock_in) as first_in,
    count(*) filter (where e.status = 'missing_out')::int as missing_outs,
    count(*)::int as entries,
    count(*) filter (where e.edited)::int as edited_entries,
    count(*) filter (where e.flagged)::int as flagged_entries
  from public.time_entries e
  where e.status in ('closed', 'missing_out')
  group by 1, 2, 3
),
sched as (
  select sh.org_id, sh.membership_id,
    (sh.starts_at at time zone coalesce(s.timezone, os.timezone))::date as day,
    min(sh.starts_at) as shift_start,
    sum(extract(epoch from (sh.ends_at - sh.starts_at)) / 60)::int as scheduled_minutes
  from public.shifts sh
  join public.org_settings os on os.org_id = sh.org_id
  left join public.sites s on s.id = sh.site_id
  group by 1, 2, 3
)
select
  coalesce(w.org_id, sc.org_id) as org_id,
  coalesce(w.membership_id, sc.membership_id) as membership_id,
  coalesce(w.day, sc.day) as day,
  coalesce(sc.scheduled_minutes, 0) as scheduled_minutes,
  coalesce(w.worked_minutes, 0) as worked_minutes,
  greatest(coalesce(w.worked_minutes, 0) - os.regular_minutes_per_day, 0) as overtime_minutes,
  case
    when w.first_in is null then null
    when sc.shift_start is not null then greatest(floor(extract(epoch from (w.first_in - sc.shift_start)) / 60)::int, 0)
    else greatest(floor(extract(epoch from ((w.first_in at time zone os.timezone)::time - os.default_start_time)) / 60)::int, 0)
  end as late_minutes,
  os.grace_minutes,
  sc.shift_start is not null as scheduled,
  coalesce(w.worked_minutes, 0) > 0 as worked,
  coalesce(w.missing_outs, 0) as missing_outs,
  coalesce(w.entries, 0) as entries,
  coalesce(w.edited_entries, 0) as edited_entries,
  coalesce(w.flagged_entries, 0) as flagged_entries
from worked w
full join sched sc on sc.membership_id = w.membership_id and sc.day = w.day
join public.org_settings os on os.org_id = coalesce(w.org_id, sc.org_id);

grant select on public.member_day_facts to authenticated;

-- Measures per member for a date range. "enough_data" is false under 10 days, and the app shows
-- "not enough data" instead of a number that looks precise.
create function public.member_metrics(p_org uuid, p_from date, p_to date)
returns table (
  membership_id uuid, display_name text, manager_id uuid, employment_type public.employment_type,
  days_scheduled int, days_worked int, days_absent int,
  attendance_rate numeric, on_time_rate numeric, median_late_minutes numeric,
  worked_minutes bigint, scheduled_minutes bigint, hours_vs_schedule numeric, overtime_share numeric,
  missing_out_rate numeric, correction_rate numeric, verification_failure_rate numeric,
  punches int, enough_data boolean
)
language sql stable security invoker set search_path = '' as $$
  with f as (
    select * from public.member_day_facts where org_id = p_org and day between p_from and p_to and day < current_date + 1
  ),
  per as (
    select f.membership_id,
      count(*) filter (where f.scheduled)::int as days_scheduled,
      count(*) filter (where f.worked)::int as days_worked,
      count(*) filter (where f.scheduled and not f.worked and f.day < current_date)::int as days_absent,
      count(*) filter (where f.worked and coalesce(f.late_minutes, 0) <= f.grace_minutes)::int as on_time_days,
      percentile_cont(0.5) within group (order by f.late_minutes) filter (where f.late_minutes > f.grace_minutes) as median_late,
      sum(f.worked_minutes) as worked_minutes,
      sum(f.scheduled_minutes) as scheduled_minutes,
      sum(f.overtime_minutes) as overtime_minutes,
      sum(f.missing_outs) as missing_outs,
      sum(f.entries) as entries,
      sum(f.edited_entries) as edited
    from f group by f.membership_id
  ),
  ev as (
    select ce.membership_id, count(*)::int as punches,
      count(*) filter (where not ce.accepted or ce.flagged)::int as failures
    from public.clock_events ce
    where ce.org_id = p_org and ce.kind in ('in', 'out')
      and (ce.server_time at time zone (select timezone from public.org_settings where org_id = p_org))::date between p_from and p_to
    group by ce.membership_id
  )
  select m.id, m.display_name, m.manager_id, m.employment_type,
    coalesce(per.days_scheduled, 0), coalesce(per.days_worked, 0), coalesce(per.days_absent, 0),
    round(case when per.days_scheduled > 0 then 1 - per.days_absent::numeric / per.days_scheduled end, 4),
    round(case when per.days_worked > 0 then per.on_time_days::numeric / per.days_worked end, 4),
    round(per.median_late::numeric, 1),
    coalesce(per.worked_minutes, 0), coalesce(per.scheduled_minutes, 0),
    round(case when per.scheduled_minutes > 0 then per.worked_minutes::numeric / per.scheduled_minutes end, 4),
    round(case when per.worked_minutes > 0 then per.overtime_minutes::numeric / per.worked_minutes end, 4),
    round(case when per.entries > 0 then per.missing_outs::numeric / per.entries end, 4),
    round(case when per.entries > 0 then per.edited::numeric / per.entries end, 4),
    round(case when ev.punches > 0 then ev.failures::numeric / ev.punches end, 4),
    coalesce(ev.punches, 0),
    coalesce(greatest(per.days_worked, per.days_scheduled), 0) >= 10
  from public.memberships m
  left join per on per.membership_id = m.id
  left join ev on ev.membership_id = m.id
  where m.org_id = p_org and m.status <> 'inactive' and private.can_see_member(m.id)
    and private.has_permission(p_org, 'analytics.view')
$$;

-- Daily totals for a team or business, used for trends and the forecast.
create function public.daily_totals(p_org uuid, p_from date, p_to date)
returns table (day date, worked_minutes bigint, people_worked int, people_scheduled int, late_people int)
language sql stable security invoker set search_path = '' as $$
  select d.day::date,
    coalesce(sum(f.worked_minutes), 0),
    count(*) filter (where f.worked)::int,
    count(*) filter (where f.scheduled)::int,
    count(*) filter (where f.late_minutes > f.grace_minutes)::int
  from generate_series(p_from, p_to, interval '1 day') d(day)
  left join public.member_day_facts f on f.day = d.day::date and f.org_id = p_org and private.can_see_member(f.membership_id)
  where private.has_permission(p_org, 'analytics.view')
  group by d.day order by d.day
$$;

revoke execute on function public.member_metrics, public.daily_totals from public, anon;
grant execute on function public.member_metrics, public.daily_totals to authenticated;
