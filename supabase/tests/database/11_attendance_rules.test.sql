-- Phase 2 criteria 49, 50, 53, 58, 59, 60 and 62: daily status, earliest time in, leave and sales
-- on payslips, team leader face enrollment, probation, and who reads the audit trail.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000011' || n)::uuid, 'a' || n || '@example.test', 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
from unnest(array['01', '02', '03', '04', '05', '06', '07']) n;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000011' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
-- Monday two weeks ago, and a local Manila time on a day relative to it.
create function pg_temp.d(p_offset int) returns date language sql as $$
  select (date_trunc('week', current_date - 14) + make_interval(days => p_offset))::date
$$;
create function pg_temp.at(p_offset int, p_time time) returns timestamptz language sql as $$
  select (pg_temp.d(p_offset) + p_time) at time zone 'Asia/Manila'
$$;
create function pg_temp.embedding(seed int, wobble float8) returns real[] language sql as $$
  select array_agg((sin(i * 0.37) + wobble * sin(i * seed * 1.7))::real order by i) from generate_series(1, 128) i
$$;
grant execute on function pg_temp.id(text), pg_temp.d(int), pg_temp.at(int, time), pg_temp.embedding(int, float8) to authenticated;

select pg_temp.login('01');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Rules Co', 'sample-rules', 'Uma Sample', 'Asia/Manila', 'PHP', 'field'));
reset role;
update public.org_features set enabled = false where org_id = pg_temp.id('org') and feature = 'geofence';

create function pg_temp.add(p_key text, p_user text, p_role text) returns void language sql as $$
  with m as (
    insert into public.memberships (org_id, user_id, display_name, role_id, hired_on)
    select pg_temp.id('org'), ('00000000-0000-0000-0000-0000000011' || p_user)::uuid, initcap(p_key) || ' Sample', r.id, pg_temp.d(0) - 60
    from public.roles r where r.org_id = pg_temp.id('org') and r.name = p_role returning id)
  insert into ids select p_key, id from m
$$;
select pg_temp.add('hr', '02', 'HR Manager');
select pg_temp.add('pia', '03', 'Staff');
select pg_temp.add('rio', '04', 'Staff');
select pg_temp.add('lead', '05', 'Team Leader');
select pg_temp.add('far', '06', 'Staff');
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Central') returning id) insert into ids select 'site', id from s;
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Outer') returning id) insert into ids select 'outer', id from s;
insert into public.member_sites (membership_id, site_id, is_leader) values
  (pg_temp.id('pia'), pg_temp.id('site'), false), (pg_temp.id('rio'), pg_temp.id('site'), false),
  (pg_temp.id('lead'), pg_temp.id('site'), true), (pg_temp.id('far'), pg_temp.id('outer'), false);

-- Pia's two weeks. Start 08:00, grace 15, absent after 60 minutes, full day 360, half day 240, Monday to Saturday.
insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
select pg_temp.id('org'), pg_temp.id('pia'), pg_temp.id('site'), pg_temp.d(o), pg_temp.at(o, i), pg_temp.at(o, i) + make_interval(mins => w), 'closed', w
from (values (0, time '07:55', 545), (1, '08:20', 500), (2, '09:30', 450), (3, '08:00', 270), (4, '08:00', 180)) v (o, i, w);

insert into ids select 'sick', id from public.leave_types where org_id = pg_temp.id('org') and name = 'Sick';
insert into ids select 'emergency', id from public.leave_types where org_id = pg_temp.id('org') and name = 'Emergency';
insert into public.leave_requests (org_id, membership_id, leave_type_id, starts_on, ends_on, days, status, reviewed_by, reviewed_at) values
  (pg_temp.id('org'), pg_temp.id('pia'), pg_temp.id('sick'), pg_temp.d(7), pg_temp.d(7), 1, 'approved', pg_temp.id('hr'), now());

-- Criterion 50.
create function pg_temp.status(p_member text, p_offset int) returns text language sql as $$
  select status from public.attendance_days(pg_temp.id('org'), pg_temp.d(0), pg_temp.d(13))
  where membership_id = pg_temp.id(p_member) and day = pg_temp.d(p_offset)
$$;
grant execute on function pg_temp.status(text, int) to authenticated;

select pg_temp.login('02');
set local role authenticated;
select is(pg_temp.status('pia', 0), 'present', 'in at 7:55 is present');
select is(pg_temp.status('pia', 1), 'late', 'in at 8:20, after the 15 grace minutes, is late');
select is((select late_minutes from public.attendance_days(pg_temp.id('org'), pg_temp.d(1), pg_temp.d(1)) where membership_id = pg_temp.id('pia')),
  20, 'and late by 20 minutes');
select is(pg_temp.status('pia', 2), 'absent', 'in at 9:30, after the absent cut-off, is absent');
select is(pg_temp.status('pia', 3), 'half_day', '4h 30m is a half day');
select is(pg_temp.status('pia', 4), 'absent', '3h is under the half-day minimum');
select is(pg_temp.status('pia', 5), 'absent', 'an expected Saturday with no time is absent');
select is(pg_temp.status('pia', 6), null, 'Sunday is not a working day, so it has no row');
select is(pg_temp.status('pia', 7), 'on_leave', 'approved leave shows as leave');
reset role;

-- Rio has a Sunday shift, so the working days don't apply that week.
insert into public.shifts (org_id, membership_id, site_id, starts_at, ends_at) values
  (pg_temp.id('org'), pg_temp.id('rio'), pg_temp.id('site'), pg_temp.at(6, '09:00'), pg_temp.at(6, '17:00'));
select pg_temp.login('02');
set local role authenticated;
select is(pg_temp.status('rio', 6), 'absent', 'a missed Sunday shift is absent');
select is(pg_temp.status('rio', 2), null, 'and weekdays without a shift that week are not expected');
select is(pg_temp.status('rio', 9), 'absent', 'the next week, without shifts, uses the working days again');
reset role;

select pg_temp.login('03');
set local role authenticated;
select is((select count(distinct membership_id)::int from public.attendance_days(pg_temp.id('org'), pg_temp.d(0), pg_temp.d(13))), 1,
  'staff see only their own days');
reset role;
select pg_temp.login('07');
set local role authenticated;
select is((select count(*)::int from public.attendance_days(pg_temp.id('org'), pg_temp.d(0), pg_temp.d(13))), 0,
  'a stranger sees nothing');
reset role;

-- The business's own rules change the result.
update public.org_settings set grace_minutes = 30 where org_id = pg_temp.id('org');
select pg_temp.login('02');
set local role authenticated;
select is(pg_temp.status('pia', 1), 'present', 'with 30 grace minutes, 8:20 is on time');
reset role;
update public.org_settings set grace_minutes = 15 where org_id = pg_temp.id('org');

-- Criterion 49: the earliest time in uses server time in the site's timezone.
update public.org_settings set earliest_clock_in = '23:59:59' where org_id = pg_temp.id('org');
update public.org_features set enabled = false where org_id = pg_temp.id('org') and feature = 'face_verification';
select pg_temp.login('05');
set local role authenticated;
select throws_ok($$ select public.clock_in(pg_temp.id('site')) $$, 'P0001', 'Time in opens at 11:59 PM', 'time in before the earliest time is refused');
reset role;
update public.org_settings set earliest_clock_in = null where org_id = pg_temp.id('org');
update public.org_features set enabled = true where org_id = pg_temp.id('org') and feature = 'face_verification';

-- Criteria 53 and 58: leave and sales on payslips.
insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from) values
  (pg_temp.id('org'), pg_temp.id('pia'), 'hourly', 10000, pg_temp.d(0) - 30),
  (pg_temp.id('org'), pg_temp.id('rio'), 'daily', 60000, pg_temp.d(0) - 30);
with p as (insert into public.pay_periods (org_id, starts_on, ends_on) values (pg_temp.id('org'), pg_temp.d(0), pg_temp.d(13)) returning id)
insert into ids select 'period', id from p;

with p as (insert into public.products (org_id, name, price_minor, incentive_minor) values (pg_temp.id('org'), 'Kit', 100000, 20000) returning id)
insert into ids select 'kit', id from p;
insert into public.customer_applications (org_id, membership_id, product_id, customer_name, customer_email, status, price_minor,
  incentive_minor, decided_at, decided_by)
select pg_temp.id('org'), pg_temp.id('pia'), pg_temp.id('kit'), n, 'c@example.test', 'approved', 100000, i, at, pg_temp.id('hr')
from (values ('Ann Sample', 20000, pg_temp.at(1, '10:00')), ('Bo Sample', 5000, pg_temp.at(8, '15:00')),
             ('Cy Sample', 20000, pg_temp.at(20, '10:00'))) v (n, i, at);

create function pg_temp.line(p_member text, p_label text) returns text language sql as $$
  select l.quantity || ' ' || l.unit || ' = ' || l.amount_minor
  from public.payslip_lines l join public.payslips ps on ps.id = l.payslip_id
  where ps.period_id = pg_temp.id('period') and ps.membership_id = pg_temp.id(p_member) and l.label like p_label
$$;

select ok(private.build_payslip(pg_temp.id('period'), pg_temp.id('pia')) is not null, 'Pia gets a payslip');
select is(pg_temp.line('pia', 'Paid leave'), '1.00 days = 80000', 'a paid sick day is paid as 8 hours at 100.00');
select is(pg_temp.line('pia', 'Sales incentives'), '2.00 sales = 25000', 'two sales approved in the period add their incentives');
select is((select gross_minor from public.payslips where period_id = pg_temp.id('period') and membership_id = pg_temp.id('pia')),
  (select sum(amount_minor) from public.payslip_lines l join public.payslips ps on ps.id = l.payslip_id
   where ps.period_id = pg_temp.id('period') and ps.membership_id = pg_temp.id('pia') and l.kind = 'earning')::bigint,
  'gross is still the sum of the earning lines');

-- Rio, paid daily, has shifts in week two: worked Monday, unpaid leave Tuesday.
insert into public.shifts (org_id, membership_id, site_id, starts_at, ends_at)
select pg_temp.id('org'), pg_temp.id('rio'), pg_temp.id('site'), pg_temp.at(o, '08:00'), pg_temp.at(o, '17:00') from unnest(array[7, 8]) o;
insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
values (pg_temp.id('org'), pg_temp.id('rio'), pg_temp.id('site'), pg_temp.d(7), pg_temp.at(7, '08:00'), pg_temp.at(7, '16:00'), 'closed', 480);
insert into public.leave_requests (org_id, membership_id, leave_type_id, starts_on, ends_on, days, status, reviewed_by, reviewed_at) values
  (pg_temp.id('org'), pg_temp.id('rio'), pg_temp.id('emergency'), pg_temp.d(8), pg_temp.d(8), 1, 'approved', pg_temp.id('hr'), now());
select ok(private.build_payslip(pg_temp.id('period'), pg_temp.id('rio')) is not null, 'Rio gets a payslip');
select is(pg_temp.line('rio', 'Basic pay'), '3.00 days = 180000', 'basic pay covers the three scheduled days');
select is(pg_temp.line('rio', 'Unpaid leave%'), '1.00 days = 60000', 'the unpaid leave day is deducted as leave');
select is(pg_temp.line('rio', 'Absences%'), '1.00 days = 60000', 'only the missed Sunday is an absence');

-- Criterion 59: a team leader enrolls faces in their area only, and only with consent.
select pg_temp.login('05');
set local role authenticated;
select throws_ok($$ select public.enroll_face(pg_temp.id('pia'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', false) $$, 'P0001', null, 'not without consent');
select lives_ok($$ select public.enroll_face(pg_temp.id('pia'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', true) $$, 'the team leader enrolls someone in their area');
select throws_ok($$ select public.enroll_face(pg_temp.id('far'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', true) $$, '42501', null, 'but not someone in another area');
reset role;

-- Criterion 60: probation.
update public.memberships set employment_type = 'provisional', hired_on = current_date - interval '7 months' where id = pg_temp.id('far');
update public.memberships set employment_type = 'provisional', hired_on = current_date - interval '5 months' where id = pg_temp.id('rio');
select ok(private.promote_provisional() >= 1, 'the job promotes people whose probation is over (the demo businesses have some too)');
select is((select count(*)::int from public.audit_log where org_id = pg_temp.id('org') and reason = 'Probation completed'), 1,
  'in this business, one person has finished probation');
select is((select employment_type::text from public.memberships where id = pg_temp.id('far')), 'regular', 'they are now regular');
select is((select employment_type::text from public.memberships where id = pg_temp.id('rio')), 'provisional', 'the other is still provisional');
select is((select reason from public.audit_log where table_name = 'memberships' and row_id = pg_temp.id('far')::text
           and new_value ->> 'employment_type' = 'regular'), 'Probation completed', 'the promotion is in the audit log with its reason');

-- The owner changes the phase 2 rules through the API role; staff can't.
select pg_temp.login('01');
set local role authenticated;
select lives_ok($$ update public.org_settings set area_label = 'Branch', area_label_plural = 'Branches', earliest_clock_in = '06:00',
  absent_after_minutes = 45, full_day_minutes = 420, half_day_minutes = 210, work_days = '{1,2,3,4,5}', probation_months = 3,
  follow_up_hours = 48 where org_id = pg_temp.id('org') $$, 'the owner can change every new setting');
reset role;
select is((select area_label || '/' || work_days::text from public.org_settings where org_id = pg_temp.id('org')), 'Branch/{1,2,3,4,5}', 'and the change is saved');
select pg_temp.login('03');
set local role authenticated;
update public.org_settings set area_label = 'Hacked' where org_id = pg_temp.id('org');
reset role;
select is((select area_label from public.org_settings where org_id = pg_temp.id('org')), 'Branch', 'staff can''t change settings');

-- Criterion 62: the audit trail.
select pg_temp.login('02');
set local role authenticated;
select ok((select count(*) from public.audit_log) > 0, 'HR, with audit.view, reads the audit trail');
reset role;
select pg_temp.login('05');
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'a team leader does not');
reset role;
select pg_temp.login('03');
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'nor does staff');
reset role;

select * from finish();
rollback;
