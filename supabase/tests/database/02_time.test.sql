-- Acceptance criteria 7 to 14 and 29 to 32 (time entries, evidence, corrections, team visibility).
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c3', 'eli@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c4', 'fay@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Gamma Foods', 'sample-gamma', 'Olivia Sample'));
reset role;

-- Plain time tracking for these tests: no geofence or face checks.
update public.org_features set enabled = false where org_id = pg_temp.id('org') and feature in ('geofence', 'face_verification');
insert into ids select 'owner', id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1';
with m as (
  insert into public.memberships (org_id, user_id, display_name, role_id, manager_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000c2', 'Max Sample', r.id, pg_temp.id('owner')
  from public.roles r where r.org_id = pg_temp.id('org') and r.name = 'Manager' returning id)
insert into ids select 'manager', id from m;
with m as (
  insert into public.memberships (org_id, user_id, display_name, role_id, manager_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000c3', 'Eli Sample', r.id, pg_temp.id('manager')
  from public.roles r where r.org_id = pg_temp.id('org') and r.name = 'Employee' returning id)
insert into ids select 'eli', id from m;
with m as (
  insert into public.memberships (org_id, user_id, display_name, role_id, manager_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000c4', 'Fay Sample', r.id, pg_temp.id('owner')
  from public.roles r where r.org_id = pg_temp.id('org') and r.name = 'Employee' returning id)
insert into ids select 'fay', id from m;
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Kitchen') returning id)
insert into ids select 'site', id from s;
insert into public.member_sites (membership_id, site_id)
select v, pg_temp.id('site') from ids where k in ('owner', 'manager', 'eli', 'fay');

-- Criteria 8 to 10: punches use server time; one open entry; no direct writes.
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select ok((public.clock_in(pg_temp.id('site')) ->> 'ok')::boolean, 'Eli times in');
select is((select clock_in from public.time_entries where membership_id = pg_temp.id('eli')), now(), 'time in is the server''s time');
select throws_ok($$ select public.clock_in(pg_temp.id('site')) $$, 'P0001', null, 'a second time in is rejected');
select throws_ok($$ insert into public.time_entries (org_id, membership_id, work_date, clock_in)
  values (pg_temp.id('org'), pg_temp.id('eli'), current_date, now() - interval '1 hour') $$, '42501', null, 'members cannot insert entries');
select throws_ok($$ update public.time_entries set clock_in = now() - interval '9 hours' $$, '42501', null, 'members cannot update entries');
select throws_ok($$ delete from public.time_entries $$, '42501', null, 'members cannot delete entries');
select throws_ok($$ insert into public.breaks (entry_id, break_start) select id, now() from public.time_entries $$, '42501', null, 'members cannot insert breaks');
select throws_ok($$ insert into public.clock_events (org_id, membership_id, kind, accepted) values (pg_temp.id('org'), pg_temp.id('eli'), 'in', true) $$,
  '42501', null, 'members cannot write evidence');
select lives_ok($$ select public.start_break(pg_temp.id('org')) $$, 'Eli starts a break');
select is((select status::text from public.time_entries where membership_id = pg_temp.id('eli')), 'on_break', 'entry is on break');
select lives_ok($$ select public.end_break(pg_temp.id('org')) $$, 'Eli ends the break');
select ok((public.clock_out(pg_temp.id('org')) ->> 'ok')::boolean, 'Eli times out');
select is((select status::text from public.time_entries where membership_id = pg_temp.id('eli')), 'closed', 'entry is closed');
-- Criterion 12: one evidence row per punch.
select is((select count(*)::int from public.clock_events where membership_id = pg_temp.id('eli')), 4, 'four punches wrote four evidence rows');
reset role;

-- Criterion 13: evidence and change log are append-only for everyone.
select throws_ok($$ update public.clock_events set accepted = false $$, '42501', null, 'evidence cannot be updated, even by the owner role');
select throws_ok($$ delete from public.clock_events $$, '42501', null, 'evidence cannot be deleted');

-- Older history for Eli (inserted as the database owner, the way the seed does).
delete from public.time_entries where membership_id = pg_temp.id('eli');
with e as (
  insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes)
  values (pg_temp.id('org'), pg_temp.id('eli'), pg_temp.id('site'), current_date - 3,
          (current_date - 3) + time '09:00', (current_date - 3) + time '17:00', 'closed', 60, 420) returning id)
insert into ids select 'e1', id from e;
with e as (
  insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
  values (pg_temp.id('org'), pg_temp.id('eli'), pg_temp.id('site'), current_date - 3,
          (current_date - 3) + time '18:00', (current_date - 3) + time '20:00', 'closed', 120) returning id)
insert into ids select 'e2', id from e;
insert into public.breaks (entry_id, break_start, break_end)
values (pg_temp.id('e1'), (current_date - 3) + time '12:00', (current_date - 3) + time '13:00');

-- Criteria 29 and 30: requests are checked for overlap; one pending request per entry.
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select throws_ok($$ select public.submit_request('change_times', pg_temp.id('e1'), 'Stayed late for stock count',
  (current_date - 3) + time '09:00', (current_date - 3) + time '19:00', 60) $$, '23P01', null, 'a request overlapping another entry is rejected');
insert into ids values ('r1', public.submit_request('change_times', pg_temp.id('e1'), 'Started early for a delivery',
  (current_date - 3) + time '08:00', (current_date - 3) + time '17:00', 60));
select throws_ok($$ select public.submit_request('change_times', pg_temp.id('e1'), 'Another try at it',
  (current_date - 3) + time '08:30', (current_date - 3) + time '17:00', 60) $$, '23505', null, 'a second pending request on one entry is rejected');
select throws_ok($$ select public.approve_request(pg_temp.id('r1')) $$, '42501', null, 'members cannot approve their own requests');
select throws_ok($$ select public.admin_edit_entry(pg_temp.id('e1'), now() - interval '2 hours', now() - interval '1 hour', 0, 'x') $$,
  '42501', null, 'members cannot edit entries directly');
reset role;

-- Criterion 31: approval applies the change and writes exactly one change log row.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select lives_ok($$ select public.approve_request(pg_temp.id('r1'), 'Delivery confirmed') $$, 'Eli''s manager approves');
select is((select clock_in from public.time_entries where id = pg_temp.id('e1')), ((current_date - 3) + time '08:00')::timestamptz, 'new time in applied');
select is((select worked_minutes from public.time_entries where id = pg_temp.id('e1')), 480, 'worked minutes recalculated (9 hours less a 60 minute break)');
select is((select count(*)::int from public.change_log where request_id = pg_temp.id('r1')), 1, 'exactly one change log row for the request');
select ok(not (select self_approved from public.change_log where request_id = pg_temp.id('r1')), 'not marked as self-approved');
-- Criterion 7 (team scope): the manager sees Eli but not Fay.
select ok((select count(*) > 0 from public.time_entries where membership_id = pg_temp.id('eli')), 'manager sees their report''s entries');
reset role;
insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
values (pg_temp.id('org'), pg_temp.id('fay'), pg_temp.id('site'), current_date - 2,
        (current_date - 2) + time '09:00', (current_date - 2) + time '17:00', 'closed', 480);
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select is((select count(*)::int from public.time_entries where membership_id = pg_temp.id('fay')), 0, 'manager does not see people outside their team');
select throws_ok($$ select public.admin_add_entry(pg_temp.id('fay'), pg_temp.id('site'), now() - interval '5 hours', now() - interval '4 hours', 0, 'Forgot to clock') $$,
  '42501', null, 'manager cannot add time for people outside their team');
reset role;

-- Fay sees only herself.
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select is((select count(*)::int from public.time_entries where membership_id <> pg_temp.id('fay')), 0, 'an employee sees only their own entries');
reset role;

-- Self-approval is marked when an owner approves their own request.
with e as (
  insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
  values (pg_temp.id('org'), pg_temp.id('owner'), pg_temp.id('site'), current_date - 4,
          (current_date - 4) + time '09:00', (current_date - 4) + time '12:00', 'closed', 180) returning id)
insert into ids select 'oe', id from e;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
insert into ids values ('r2', public.submit_request('change_times', pg_temp.id('oe'), 'Worked the afternoon too',
  (current_date - 4) + time '09:00', (current_date - 4) + time '15:00', 0));
select lives_ok($$ select public.approve_request(pg_temp.id('r2')) $$, 'the owner approves their own request');
select ok((select self_approved from public.change_log where request_id = pg_temp.id('r2')), 'self-approval is marked');
select throws_ok($$ select public.reject_request(pg_temp.id('r2'), 'late') $$, 'P0001', null, 'a decided request cannot be decided again');

-- Criterion 32: deleting an entry deletes its breaks, and the deletion is logged with a reason.
select throws_ok($$ select public.admin_delete_entry(pg_temp.id('e1'), '') $$, '22023', null, 'a reason is required');
select lives_ok($$ select public.admin_delete_entry(pg_temp.id('e1'), 'Duplicate of a paper record') $$, 'the owner deletes an entry');
reset role;
select is((select count(*)::int from public.breaks where entry_id = pg_temp.id('e1')), 0, 'its breaks are gone');
select is((select count(*)::int from public.change_log where entry_id = pg_temp.id('e1') and action = 'delete'), 1, 'the deletion is logged');

-- Criterion 14: an entry left open past its day becomes missing_out with 0 hours.
insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, status)
values (pg_temp.id('org'), pg_temp.id('fay'), pg_temp.id('site'), current_date - 1, (current_date - 1) + time '09:00', 'working');
select is(private.close_missing_out(), 1, 'the scheduled job closes one entry');
select is((select status::text from public.time_entries where membership_id = pg_temp.id('fay') and work_date = current_date - 1),
  'missing_out', 'it is marked missing_out');
select is((select worked_minutes from public.time_entries where membership_id = pg_temp.id('fay') and work_date = current_date - 1),
  0, 'it counts 0 minutes');

-- A missing time out can be corrected by request.
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select lives_ok($$ select public.submit_request('missing_time_out',
  (select id from public.time_entries where membership_id = pg_temp.id('fay') and work_date = current_date - 1),
  'Phone died before time out', null, (current_date - 1) + time '17:30', 30) $$, 'Fay requests her missing time out');
reset role;

select * from finish();
rollback;
