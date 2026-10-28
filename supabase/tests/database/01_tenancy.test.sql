-- Acceptance criteria 1, 2, 3, 5, 6 (businesses, isolation, owners, features, roles).
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'employee.a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;

-- Criterion 2: creating a business makes settings, roles and an owner.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into ids values ('a', public.create_organization('Sample Alpha Café', 'sample-alpha', 'Ana Sample'));
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into ids values ('b', public.create_organization('Sample Beta Logistics', 'sample-beta', 'Ben Sample'));
reset role;

select is((select count(*)::int from public.org_settings where org_id = (select v from ids where k = 'a')), 1, 'settings row created');
select is((select count(*)::int from public.roles where org_id = (select v from ids where k = 'a')), 3, 'three default roles created');
select ok((select r.is_owner from public.memberships m join public.roles r on r.id = m.role_id
           where m.user_id = '00000000-0000-0000-0000-0000000000a1'), 'creator is the owner');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
           where r.org_id = (select v from ids where k = 'a') and r.is_owner),
          (select count(*)::int from unnest(enum_range(null::public.app_permission))), 'owner holds every permission');
select ok(not (select enabled from public.org_features where org_id = (select v from ids where k = 'a') and feature = 'output_tracking'),
          'output tracking starts switched off');

-- An employee in business A.
insert into public.memberships (org_id, user_id, display_name, role_id)
select (select v from ids where k = 'a'), '00000000-0000-0000-0000-0000000000a2', 'Eli Sample', id
from public.roles where org_id = (select v from ids where k = 'a') and name = 'Employee';

insert into ids select 'a_employee', id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a2';

-- Criterion 1: business B sees nothing of business A, in any table.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select is((select count(*)::int from public.organizations), 1, 'B sees only its own business');
select is((select count(*)::int from public.memberships where org_id = (select v from ids where k = 'a')), 0, 'B sees no members of A');
select is((select count(*)::int from public.org_settings where org_id = (select v from ids where k = 'a')), 0, 'B sees no settings of A');
select is((select count(*)::int from public.roles where org_id = (select v from ids where k = 'a')), 0, 'B sees no roles of A');
with u as (update public.organizations set name = 'Taken over' where id = (select v from ids where k = 'a') returning 1)
select is((select count(*)::int from u), 0, 'B cannot rename A');
with u as (update public.org_settings set grace_minutes = 99 where org_id = (select v from ids where k = 'a') returning 1)
select is((select count(*)::int from u), 0, 'B cannot change A''s settings');
select throws_ok($$ insert into public.memberships (org_id, user_id, display_name, role_id)
  values ((select v from ids where k = 'a'), '00000000-0000-0000-0000-0000000000b1', 'Intruder', gen_random_uuid()) $$,
  '42501', null, 'B cannot add itself to A');
select throws_ok($$ select public.save_member((select v from ids where k = 'a_employee'), 'X', gen_random_uuid(), null, 'regular', 'active') $$,
  '42501', null, 'save_member is refused for members outside the business');
reset role;

-- Every table in public has row-level security switched on.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
  'row-level security is on for every public table');

-- Criterion 3: the last active owner can't be deactivated.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($$
  select public.save_member(m.id, m.display_name, m.role_id, null, 'regular', 'inactive', null)
  from public.memberships m where m.user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  'P0001', 'A business needs at least one active owner', 'the last owner cannot be deactivated');
select throws_ok($$
  select public.save_member(m.id, m.display_name,
    (select id from public.roles where name = 'Employee' and org_id = m.org_id), null, 'regular', 'active', null)
  from public.memberships m where m.user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  'P0001', 'A business needs at least one active owner', 'the last owner cannot demote themself');
select throws_ok($$ delete from public.role_permissions where role_id = (select id from public.roles where is_owner and org_id = (select v from ids where k = 'a')) $$,
  'P0001', null, 'owner permissions cannot be removed');
reset role;

-- Criterion 6: a role without the permission can't use it, even by calling the function directly.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select throws_ok($$ select public.save_member(m.id, 'Eli Promoted', (select id from public.roles where is_owner and org_id = m.org_id),
  null, 'regular', 'active', null) from public.memberships m where m.user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'an employee cannot promote themself');
with u as (update public.org_settings set grace_minutes = 60 returning 1)
select is((select count(*)::int from u), 0, 'an employee cannot change settings');
with u as (update public.org_features set enabled = false returning 1)
select is((select count(*)::int from u), 0, 'an employee cannot switch features');
select is((select count(*)::int from public.audit_log), 0, 'an employee sees no audit log rows');
reset role;

-- Criterion 5: switching a feature off makes its functions refuse calls.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
update public.org_features set enabled = false where org_id = (select v from ids where k = 'a') and feature = 'time_tracking';
select ok((select not enabled from public.org_features where org_id = (select v from ids where k = 'a') and feature = 'time_tracking'),
  'the owner switched time tracking off');
reset role;
with s as (insert into public.sites (org_id, name) values ((select v from ids where k = 'a'), 'Main branch') returning id)
insert into ids select 'site_a', id from s;
insert into public.member_sites (membership_id, site_id)
select m.id, (select v from ids where k = 'site_a') from public.memberships m where m.org_id = (select v from ids where k = 'a');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select throws_ok($$ select public.clock_in((select v from ids where k = 'site_a')) $$,
  'P0001', 'The time tracking feature is switched off for this business', 'clock in is refused when time tracking is off');
reset role;

select ok((select count(*) > 0 from public.audit_log where table_name = 'org_features'), 'switching a feature is audited');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'the audit log is append-only, even for the database owner');

select * from finish();
rollback;
