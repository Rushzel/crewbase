-- Daily attendance status and probation.
--
-- JedSkies stored one status per day when the person timed in or out, with fixed times
-- (present before 9:15, late until 10:00, absent after, half day under 6 hours).
-- Here the status is calculated from the time entries and the business's own rules, so a
-- corrected entry or an approved leave changes the status without anyone editing it.

-- One row per person per day that matters: expected working days, and any day with time or leave.
-- A day is expected when it has a shift, or, for people with no shift that week, when it is one
-- of the business's working days. Days before someone was hired are skipped.
create function public.attendance_days(p_org uuid, p_from date, p_to date)
returns table (
  membership_id uuid, display_name text, day date, expected boolean, status text,
  first_in timestamptz, last_out timestamptz, worked_minutes int, late_minutes int, leave_type text, working boolean
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select os.*, (now() at time zone os.timezone)::date as today from public.org_settings os
    where os.org_id = p_org and p_org in (select private.my_orgs()) and p_to >= p_from and p_to - p_from <= 92
  ),
  people as (
    select m.id, m.display_name, coalesce(m.hired_on, (m.created_at at time zone s.timezone)::date) as since
    from public.memberships m, s
    where m.org_id = p_org and m.status = 'active' and m.id in (select private.visible_members())
  ),
  days as (
    select p.id, p.display_name, d::date as day
    from people p, s, generate_series(greatest(p_from, p.since), p_to, interval '1 day') d
  ),
  worked as (
    select e.membership_id, e.work_date,
      sum(e.worked_minutes)::int as minutes, min(e.clock_in) as first_in, max(e.clock_out) as last_out,
      bool_or(e.clock_out is null) as open
    from public.time_entries e
    where e.org_id = p_org and e.work_date between p_from and p_to
    group by 1, 2
  ),
  shifts as (
    select sh.membership_id, (sh.starts_at at time zone s.timezone)::date as day, min(sh.starts_at) as starts_at
    from public.shifts sh, s
    where sh.org_id = p_org and sh.starts_at >= p_from - 7 and sh.starts_at < p_to + 8
    group by 1, 2
  ),
  leave as (
    select lr.membership_id, lr.starts_on, lr.ends_on, lt.name
    from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.org_id = p_org and lr.status = 'approved' and lr.starts_on <= p_to and lr.ends_on >= p_from
  ),
  facts as (
    select dd.id, dd.display_name, dd.day,
      coalesce(w.minutes, 0) as minutes, w.first_in, w.last_out, coalesce(w.open, false) as open,
      lv.name as leave_type,
      coalesce(sh.starts_at, (dd.day + s.default_start_time) at time zone s.timezone) as starts_at,
      sh.starts_at is not null
        or (extract(dow from dd.day)::smallint = any (s.work_days)
            and not exists (select 1 from shifts x where x.membership_id = dd.id
                            and x.day between date_trunc('week', dd.day)::date and date_trunc('week', dd.day)::date + 6)) as expected
    from days dd
    cross join s
    left join worked w on w.membership_id = dd.id and w.work_date = dd.day
    left join shifts sh on sh.membership_id = dd.id and sh.day = dd.day
    left join leave lv on lv.membership_id = dd.id and dd.day between lv.starts_on and lv.ends_on
  )
  select f.id, f.display_name, f.day, f.expected,
    case
      when f.leave_type is not null and f.minutes = 0 and not f.open then 'on_leave'
      when f.first_in is null then
        case when not f.expected then 'rest_day'
             when f.day < s.today or (f.day = s.today and now() > f.starts_at + make_interval(mins => s.absent_after_minutes)) then 'absent'
             else 'not_yet' end
      when f.first_in > f.starts_at + make_interval(mins => s.absent_after_minutes) then 'absent'
      -- Hour minimums only once the day is over.
      when f.day < s.today and not f.open and f.minutes < s.half_day_minutes then 'absent'
      when f.day < s.today and not f.open and f.minutes < s.full_day_minutes then 'half_day'
      when f.first_in > f.starts_at + make_interval(mins => s.grace_minutes) then 'late'
      else 'present'
    end,
    f.first_in, f.last_out, f.minutes,
    case when f.first_in > f.starts_at + make_interval(mins => s.grace_minutes)
         then floor(extract(epoch from (f.first_in - f.starts_at)) / 60)::int else 0 end,
    f.leave_type, f.open
  from facts f cross join s
  where f.expected or f.first_in is not null or f.leave_type is not null
  order by f.display_name, f.day
$$;
revoke execute on function public.attendance_days from public, anon;
grant execute on function public.attendance_days to authenticated;

-- Nightly: provisional staff whose probation is over become regular. Each change is audited
-- with the reason, so the promotion is visible in the audit trail.
create function private.promote_provisional()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  perform set_config('app.reason', 'Probation completed', true);
  update public.memberships m set employment_type = 'regular'
  from public.org_settings os
  where os.org_id = m.org_id and m.employment_type = 'provisional' and m.status = 'active'
    and m.hired_on is not null
    and m.hired_on + make_interval(months => os.probation_months) <= (now() at time zone os.timezone)::date;
  get diagnostics v_count = row_count;
  perform set_config('app.reason', '', true);
  return v_count;
end $$;
select cron.schedule('promote-provisional', '15 16 * * *', 'select private.promote_provisional()');   -- 00:15 in Manila

-- Accepted and blocked time-in locations for a day, as latitude and longitude for maps.
-- security invoker: the caller sees only the evidence row-level security lets them see.
create function public.time_in_points(p_org uuid, p_day date)
returns table (membership_id uuid, server_time timestamptz, accepted boolean, flagged boolean, reason text, lat float8, lng float8)
language sql stable security invoker set search_path = '' as $$
  select ce.membership_id, ce.server_time, ce.accepted, ce.flagged, ce.reason,
    extensions.st_y(ce.location::extensions.geometry), extensions.st_x(ce.location::extensions.geometry)
  from public.clock_events ce
  join public.org_settings os on os.org_id = ce.org_id
  where ce.org_id = p_org and ce.kind = 'in' and ce.location is not null
    and (ce.server_time at time zone os.timezone)::date = p_day
  order by ce.server_time
$$;
revoke execute on function public.time_in_points from public, anon;
grant execute on function public.time_in_points to authenticated;

-- The active people the caller can see (themself, their team or everyone), for pickers and lists.
create function public.my_team(p_org uuid)
returns table (membership_id uuid, display_name text, role_name text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, r.name
  from public.memberships m join public.roles r on r.id = m.role_id
  where m.org_id = p_org and m.status = 'active' and m.id in (select private.visible_members())
  order by m.display_name
$$;
revoke execute on function public.my_team from public, anon;
grant execute on function public.my_team to authenticated;
