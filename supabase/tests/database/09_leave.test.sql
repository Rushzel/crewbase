-- Phase 2 criteria 51 and 52: requesting and reviewing leave.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000009' || n)::uuid, 'v' || n || '@example.test', 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
from unnest(array['01', '02', '03', '04', '05']) n;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000009' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;

select pg_temp.login('01');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Leave Co', 'sample-leave', 'Odin Sample', 'Asia/Manila', 'PHP', 'field'));
reset role;

-- Mondays to Saturdays are working days by default.
create function pg_temp.add(p_key text, p_user text, p_role text) returns void language sql as $$
  with m as (
    insert into public.memberships (org_id, user_id, display_name, role_id)
    select pg_temp.id('org'), ('00000000-0000-0000-0000-0000000009' || p_user)::uuid, initcap(p_key) || ' Sample', r.id
    from public.roles r where r.org_id = pg_temp.id('org') and r.name = p_role returning id)
  insert into ids select p_key, id from m
$$;
select pg_temp.add('hr', '02', 'HR Manager');
select pg_temp.add('sam', '03', 'Staff');
select pg_temp.add('tia', '04', 'Staff');
insert into ids select 'sick', id from public.leave_types where org_id = pg_temp.id('org') and name = 'Sick';
insert into ids select 'emergency', id from public.leave_types where org_id = pg_temp.id('org') and name = 'Emergency';

select is((select count(*)::int from public.leave_types where org_id = pg_temp.id('org')), 3, 'a new business gets three leave types');

-- A Monday next week, so every date below is in the future and working days are predictable.
create function pg_temp.mon(p_offset int default 0) returns date language sql as $$
  select (date_trunc('week', current_date + 7) + make_interval(days => p_offset))::date
$$;
grant execute on function pg_temp.mon(int) to authenticated;

-- Criterion 51.
select pg_temp.login('03');
set local role authenticated;
insert into ids values ('r1', public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(0), pg_temp.mon(1), 'Flu'));
select is((select days from public.leave_requests where id = pg_temp.id('r1')), 2::smallint, 'Monday to Tuesday is 2 working days');
select is(private.working_days(pg_temp.id('org'), pg_temp.mon(5), pg_temp.mon(6)), 1, 'Saturday counts and Sunday does not');
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('emergency'), pg_temp.mon(1), pg_temp.mon(2)) $$,
  'P0001', 'You already have leave pending or approved on some of these days', 'overlapping leave is refused');
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(7), pg_temp.mon(10)) $$,
  'P0001', 'This would use 6 of 5 days allowed this year (2 already used or pending)', 'the yearly allowance includes pending days');
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(6), pg_temp.mon(6)) $$,
  '22023', 'There are no working days in these dates', 'a Sunday alone is not leave');
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), current_date - 40, current_date - 40) $$,
  '22023', null, 'leave cannot be filed more than 30 days late');
select throws_ok($$ insert into public.leave_requests (org_id, membership_id, leave_type_id, starts_on, ends_on, days)
  values (pg_temp.id('org'), pg_temp.id('tia'), pg_temp.id('sick'), current_date, current_date, 1) $$,
  '42501', null, 'nobody writes requests directly');
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(14), pg_temp.mon(14), null,
  pg_temp.id('org') || '/' || pg_temp.id('tia') || '/note.pdf') $$,
  '42501', 'The attachment must be one you uploaded', 'an attachment must be in your own folder');
select is((select count(*)::int from public.leave_requests), 1, 'staff see only their own leave');
select throws_ok($$ select public.review_leave(pg_temp.id('r1'), true) $$, '42501', null, 'staff cannot approve leave');
reset role;

-- An attachment can be required.
update public.leave_types set needs_attachment = true where id = pg_temp.id('emergency');
select pg_temp.login('04');
set local role authenticated;
select throws_ok($$ select public.request_leave(pg_temp.id('org'), pg_temp.id('emergency'), pg_temp.mon(0), pg_temp.mon(0)) $$,
  '22023', 'Emergency leave needs an attachment', 'a required attachment is enforced');
insert into ids values ('r2', public.request_leave(pg_temp.id('org'), pg_temp.id('emergency'), pg_temp.mon(0), pg_temp.mon(0), null,
  pg_temp.id('org') || '/' || pg_temp.id('tia') || '/letter.pdf'));
select ok(pg_temp.id('r2') is not null, 'with an attachment in their folder, the request goes in');
reset role;

-- Criterion 52.
select pg_temp.login('02');
set local role authenticated;
select is((select count(*)::int from public.leave_requests), 2, 'HR sees everyone''s leave');
select throws_ok($$ select public.review_leave(pg_temp.id('r2'), false) $$, '22023', 'Say why the request is rejected',
  'a rejection needs a reason');
select lives_ok($$ select public.review_leave(pg_temp.id('r2'), false, 'Letter is unreadable') $$, 'HR rejects with a reason');
select lives_ok($$ select public.review_leave(pg_temp.id('r1'), true, 'Get well') $$, 'HR approves');
select throws_ok($$ select public.review_leave(pg_temp.id('r1'), false, 'Changed my mind') $$, 'P0001', null, 'a decision is final');
reset role;
select is((select status::text || '/' || review_note from public.leave_requests where id = pg_temp.id('r1')), 'approved/Get well',
  'the decision and note are stored');
select is((select remaining from public.leave_balances(pg_temp.id('sam')) where name = 'Sick'), 3, 'the balance shows 3 sick days left');

-- Nobody reviews their own leave, even with the permission.
select pg_temp.login('02');
set local role authenticated;
insert into ids values ('own', public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(2), pg_temp.mon(2)));
select throws_ok($$ select public.review_leave(pg_temp.id('own'), true) $$, '42501', 'You cannot review your own leave',
  'HR cannot approve their own leave');
reset role;

-- Approval re-checks the allowance: lower it after the request was made.
select pg_temp.login('04');
set local role authenticated;
insert into ids values ('r3', public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(7), pg_temp.mon(9)));
reset role;
update public.leave_types set yearly_days = 2 where id = pg_temp.id('sick');
select pg_temp.login('02');
set local role authenticated;
select throws_ok($$ select public.review_leave(pg_temp.id('r3'), true) $$, 'P0001', null, 'approval re-checks the allowance');
reset role;
update public.leave_types set yearly_days = 5 where id = pg_temp.id('sick');

-- Locked pay periods.
insert into public.pay_periods (org_id, starts_on, ends_on, status) values (pg_temp.id('org'), pg_temp.mon(7), pg_temp.mon(13), 'locked');
select pg_temp.login('02');
set local role authenticated;
select throws_ok($$ select public.review_leave(pg_temp.id('r3'), true) $$, 'P0001', 'These dates are in a locked pay period',
  'leave in a locked pay period cannot be approved');
reset role;

-- Withdrawing.
select pg_temp.login('03');
set local role authenticated;
select lives_ok($$ select public.withdraw_leave(pg_temp.id('r1')) $$, 'future approved leave can be withdrawn');
select throws_ok($$ select public.withdraw_leave(pg_temp.id('r3')) $$, 'P0002', null, 'but not someone else''s');
insert into ids values ('again', public.request_leave(pg_temp.id('org'), pg_temp.id('sick'), pg_temp.mon(0), pg_temp.mon(1)));
select ok(pg_temp.id('again') is not null, 'withdrawn days are free again');
reset role;

select ok((select count(*) from public.audit_log where table_name = 'leave_requests' and org_id = pg_temp.id('org')) >= 3,
  'decisions and withdrawals are audited');

select * from finish();
rollback;
