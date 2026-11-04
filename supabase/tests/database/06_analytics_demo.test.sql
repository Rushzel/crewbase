-- Acceptance criteria 41 to 43 (analytics) and 45 to 46 (demo accounts and reset).
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a9', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b9', 'lead@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Golf Repairs', 'sample-golf', 'Gus Sample'));
reset role;
insert into ids select 'owner', id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a9';
with m as (insert into public.memberships (org_id, user_id, display_name, role_id, manager_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000b9', 'Lea Sample', id, pg_temp.id('owner')
  from public.roles where org_id = pg_temp.id('org') and name = 'Manager' returning id)
insert into ids select 'lead', id from m;
insert into public.memberships (org_id, display_name, role_id, manager_id, status)
select pg_temp.id('org'), n, (select id from public.roles where org_id = pg_temp.id('org') and name = 'Employee'),
  case when n = 'Kit Sample' then pg_temp.id('lead') else pg_temp.id('owner') end, 'invited'
from unnest(array['Kit Sample', 'Rio Sample']) n;
insert into ids select lower(split_part(display_name, ' ', 1)), id from public.memberships where display_name in ('Kit Sample', 'Rio Sample');

-- Kit: 12 scheduled weekdays from 1 September 2026 with 8:00 shifts.
-- Worked 10 of them; on time on 7 (8:00 to 8:10), late on 3 (8:20, 8:30, 8:40); absent on 2.
-- 8 h each, except one 10 h day.
insert into public.shifts (org_id, membership_id, starts_at, ends_at)
select pg_temp.id('org'), pg_temp.id('kit'), (d::date + time '08:00') at time zone 'Asia/Manila', (d::date + time '17:00') at time zone 'Asia/Manila'
from generate_series('2026-09-01'::date, '2026-09-16'::date, interval '1 day') d where extract(isodow from d) < 6;
insert into public.time_entries (org_id, membership_id, work_date, clock_in, clock_out, status, worked_minutes)
select pg_temp.id('org'), pg_temp.id('kit'), day, (day + start) at time zone 'Asia/Manila',
  (day + start + make_interval(mins => mins)) at time zone 'Asia/Manila', 'closed', mins
from (values
  ('2026-09-01'::date, time '08:00', 480), ('2026-09-02', '08:05', 480), ('2026-09-03', '08:10', 480),
  ('2026-09-04', '08:20', 480), ('2026-09-07', '08:00', 600), ('2026-09-08', '08:30', 480),
  ('2026-09-09', '08:00', 480), ('2026-09-10', '08:40', 480), ('2026-09-11', '08:00', 480), ('2026-09-14', '08:00', 480)
) t(day, start, mins);
-- Rio: 3 days only (too few for a reliable measure).
insert into public.time_entries (org_id, membership_id, work_date, clock_in, clock_out, status, worked_minutes)
select pg_temp.id('org'), pg_temp.id('rio'), d, (d + time '08:00') at time zone 'Asia/Manila', (d + time '16:00') at time zone 'Asia/Manila', 'closed', 480
from unnest(array['2026-09-01'::date, '2026-09-02', '2026-09-03']) d;

-- Criterion 41: measures match the hand-calculated values.
select pg_temp.login('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
create temp table km as select * from public.member_metrics(pg_temp.id('org'), '2026-09-01', '2026-09-16') where membership_id = pg_temp.id('kit');
select is((select days_scheduled from km), 12, 'Kit had 12 scheduled days');
select is((select days_worked from km), 10, 'Kit worked 10');
select is((select days_absent from km), 2, 'Kit was absent 2 days');
select is((select attendance_rate from km), round(10 / 12.0, 4), 'attendance rate is 10 / 12');
select is((select on_time_rate from km), 0.7000, 'on time on 7 of 10 days (15 minute grace)');
select is((select median_late_minutes from km), 30.0, 'median lateness on late days is 30 minutes');
select is((select hours_vs_schedule from km), round(4920 / 6480.0, 4), 'hours against schedule: 82 h of 108 h');
select is((select overtime_share from km), round(120 / 4920.0, 4), 'overtime share: 2 h of 82 h');
select ok((select enough_data from km), 'Kit has enough data');
-- Criterion 42: fewer than 10 days is marked.
select ok(not (select enough_data from public.member_metrics(pg_temp.id('org'), '2026-09-01', '2026-09-16') where membership_id = pg_temp.id('rio')),
  'Rio''s 3 days are marked as not enough data');
reset role;

-- Criterion 43: a manager's analytics include only their team.
select pg_temp.login('00000000-0000-0000-0000-0000000000b9');
set local role authenticated;
select is((select count(*)::int from public.member_metrics(pg_temp.id('org'), '2026-09-01', '2026-09-16') where membership_id = pg_temp.id('rio')), 0,
  'the manager''s analytics leave out Rio, who is not in their team');
select is((select count(*)::int from public.member_metrics(pg_temp.id('org'), '2026-09-01', '2026-09-16') where membership_id = pg_temp.id('kit')), 1,
  'and include Kit, who is');
select is((select sum(people_worked)::int from public.daily_totals(pg_temp.id('org'), '2026-09-01', '2026-09-16')), 10, 'daily totals count only Kit''s days');
select is((select count(*)::int from public.member_day_facts where membership_id = pg_temp.id('rio')), 0, 'the facts view hides Rio too');
reset role;

-- Criterion 45: demo accounts can't change email or password.
select throws_ok($$ update auth.users set email = 'stolen@example.test' where email = 'staff@demo.crewbase.example' $$,
  '42501', 'Demo accounts can''t change their email or password', 'a demo account''s email is protected');
select throws_ok($$ update auth.users set encrypted_password = 'x' where email = 'owner@demo.crewbase.example' $$,
  '42501', null, 'a demo account''s password is protected');
select lives_ok($$ update auth.users set email = 'changed@example.test' where id = '00000000-0000-0000-0000-0000000000a9' $$, 'ordinary accounts can change email');

-- Criterion 46: the reset rebuilds the demo business and leaves real ones alone.
select is((select count(*)::int from public.organizations where is_demo), 1, 'one demo business exists');
update public.organizations set name = 'Vandalised by a visitor' where slug = 'demo-company';
select lives_ok($$ select private.reset_demo_data() $$, 'the reset runs');
select is((select name from public.organizations where slug = 'demo-company'), 'Demo Company', 'the demo business is restored');
select is((select count(*)::int from public.organizations where is_demo), 1, 'still exactly one demo business');
select is((select name from public.organizations where id = pg_temp.id('org')), 'Sample Golf Repairs', 'a real business is untouched');
select is((select count(*)::int from public.time_entries where org_id = pg_temp.id('org')), 13, 'and so is its time');

select * from finish();
rollback;
