-- Phase 2 criteria 47 and 61: role templates, area leaders and team visibility.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000008' || n)::uuid, 'u' || n || '@example.test', 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08', '09']) n;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000008' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;

-- Criterion 61: the field template.
select pg_temp.login('01');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Field Co', 'sample-field', 'Owen Sample', 'Asia/Manila', 'PHP', 'field'));
insert into ids values ('small', public.create_organization('Sample Small Co', 'sample-small', 'Owen Sample'));
select throws_ok($$ select public.create_organization('Sample Bad Co', 'sample-bad', 'Owen Sample', 'Asia/Manila', 'PHP', 'huge') $$,
  '22023', null, 'an unknown template is refused');
reset role;

select results_eq(
  $$ select name || ':' || scope from public.roles where org_id = pg_temp.id('org') order by name $$,
  array['Employee:own', 'Finance:all', 'Human Resources:all', 'Leader:team', 'Owner:all'],
  'the field template creates five roles, named by function, with their scopes');
select results_eq(
  $$ select name from public.roles where org_id = pg_temp.id('small') order by name $$,
  array['Employee', 'Manager', 'Owner'], 'the small template keeps three roles');

create function pg_temp.perms(p_role text) returns text[] language sql as $$
  select array_agg(rp.permission::text order by rp.permission::text)
  from public.role_permissions rp join public.roles r on r.id = rp.role_id
  where r.org_id = pg_temp.id('org') and r.name = p_role
$$;
select is(pg_temp.perms('Employee'), array['analytics.view', 'sales.log', 'time.clock'], 'employees can time in and log sales');
select is(pg_temp.perms('Leader'), array['analytics.view', 'face.enroll_others', 'requests.review', 'sales.log', 'time.clock', 'time.edit'],
  'leaders also approve their team''s corrections, edit their time and enroll faces');
select ok('sales.review' = any(pg_temp.perms('Finance')) and 'payroll.run' = any(pg_temp.perms('Finance'))
  and not 'people.manage' = any(pg_temp.perms('Finance')),
  'finance approves sales and runs payroll, but does not manage people');
select ok('people.manage' = any(pg_temp.perms('Human Resources')) and 'sites.manage' = any(pg_temp.perms('Human Resources'))
  and 'audit.view' = any(pg_temp.perms('Human Resources')) and not 'payroll.run' = any(pg_temp.perms('Human Resources')),
  'human resources manages people, areas and the audit trail, but does not run payroll');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
           where r.org_id = pg_temp.id('org') and r.is_owner),
  (select count(*)::int from unnest(enum_range(null::public.app_permission))), 'the owner has every permission');
select ok((select enabled from public.org_features where org_id = pg_temp.id('org') and feature = 'sales'), 'sales is on for field teams');
select ok(not (select enabled from public.org_features where org_id = pg_temp.id('small') and feature = 'sales'), 'and off for small teams');
select ok((select enabled from public.org_features where org_id = pg_temp.id('small') and feature = 'leave'), 'leave is on by default');

-- People: a leader of North, employees in North and South, a report of the leader with no area,
-- another North member who is not a leader, and someone in Finance (who sees everyone).
create function pg_temp.add(p_key text, p_user text, p_name text, p_role text, p_manager text default null) returns void
language sql as $$
  with m as (
    insert into public.memberships (org_id, user_id, display_name, role_id, manager_id)
    select pg_temp.id('org'), ('00000000-0000-0000-0000-0000000008' || p_user)::uuid, p_name, r.id, pg_temp.id(p_manager)
    from public.roles r where r.org_id = pg_temp.id('org') and r.name = p_role
    returning id)
  insert into ids select p_key, m.id from m
$$;
select pg_temp.add('lead', '02', 'Lea Sample', 'Leader');
select pg_temp.add('north', '03', 'Nat Sample', 'Employee');
select pg_temp.add('south', '04', 'Sol Sample', 'Employee');
select pg_temp.add('report', '05', 'Rey Sample', 'Employee', 'lead');
select pg_temp.add('peer', '06', 'Pia Sample', 'Leader');
select pg_temp.add('ops', '07', 'Oda Sample', 'Finance');
insert into ids select 'owner', id from public.memberships where org_id = pg_temp.id('org') and user_id = '00000000-0000-0000-0000-000000000801';

with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'North') returning id) insert into ids select 'n_site', id from s;
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'South') returning id) insert into ids select 's_site', id from s;
insert into public.member_sites (membership_id, site_id, is_leader) values
  (pg_temp.id('lead'), pg_temp.id('n_site'), true),
  (pg_temp.id('north'), pg_temp.id('n_site'), false),
  (pg_temp.id('peer'), pg_temp.id('n_site'), false),
  (pg_temp.id('south'), pg_temp.id('s_site'), false);

select is((select org_id from public.member_sites where membership_id = pg_temp.id('north')), pg_temp.id('org'),
  'an area assignment takes its business from the area');

-- The same-business rule is a foreign key, not a policy, so it holds even for the database owner.
with s as (insert into public.sites (org_id, name) values (pg_temp.id('small'), 'Elsewhere') returning id) insert into ids select 'other_site', id from s;
select throws_ok($$ insert into public.member_sites (membership_id, site_id) values (pg_temp.id('north'), pg_temp.id('other_site')) $$,
  '23503', null, 'a person cannot be assigned to another business''s area');

-- One closed entry per person, so visibility can be counted.
insert into public.time_entries (org_id, membership_id, work_date, clock_in, clock_out, status, worked_minutes)
select pg_temp.id('org'), v, current_date - 1, (current_date - 1) + time '08:00', (current_date - 1) + time '17:00', 'closed', 540
from ids where k in ('owner', 'lead', 'north', 'south', 'report', 'peer', 'ops');

create function pg_temp.seen() returns text[] language sql as $$
  select array_agg(i.k order by i.k) from public.time_entries e join ids i on i.v = e.membership_id
$$;
grant execute on function pg_temp.seen() to authenticated;

-- Criterion 47.
select pg_temp.login('02');
set local role authenticated;
select is(pg_temp.seen(), array['lead', 'north', 'peer', 'report'],
  'a leader sees their area and their reports, and not other areas');
select ok(private.can_see_member(pg_temp.id('north')) and not private.can_see_member(pg_temp.id('south')),
  'the helper used by functions agrees');

-- Separation of duties: a manager permission never works on your own record.
select throws_ok($$ select public.admin_edit_entry((select id from public.time_entries where membership_id = pg_temp.id('lead')),
  (current_date - 1) + time '07:00', (current_date - 1) + time '19:00', 0, 'Paying myself more') $$,
  '42501', null, 'a leader cannot edit their own hours');
select throws_ok($$ select public.admin_add_entry(pg_temp.id('lead'), pg_temp.id('n_site'),
  (current_date - 2) + time '08:00', (current_date - 2) + time '17:00', 0, 'An extra day for me') $$,
  '42501', null, 'or add hours for themself');
select ok(not private.can_act_on_member(pg_temp.id('lead'), 'requests.review'),
  'or approve their own corrections or timesheet');
select lives_ok($$ select public.admin_edit_entry((select id from public.time_entries where membership_id = pg_temp.id('north')),
  (current_date - 1) + time '08:10', (current_date - 1) + time '17:00', 0, 'Arrived 08:10, confirmed by the gate log') $$,
  'but can edit a team member''s hours, with a reason');
reset role;
select pg_temp.login('01');
set local role authenticated;
select ok(private.can_act_on_member(pg_temp.id('owner'), 'time.edit'), 'the owner, who is the business, can act on their own record');
reset role;

select pg_temp.login('06');
set local role authenticated;
select is(pg_temp.seen(), array['peer'], 'a leader who does not lead the area sees only themself');
reset role;

select pg_temp.login('03');
set local role authenticated;
select is(pg_temp.seen(), array['north'], 'employees see only themself');
reset role;

select pg_temp.login('07');
set local role authenticated;
select is(pg_temp.seen(), array['lead', 'north', 'ops', 'owner', 'peer', 'report', 'south'], 'finance sees everyone');
reset role;

-- Leading stops when the flag is removed.
update public.member_sites set is_leader = false where membership_id = pg_temp.id('lead');
select pg_temp.login('02');
set local role authenticated;
select is(pg_temp.seen(), array['lead', 'report'], 'removing the leader flag removes the area from their team');
reset role;

-- Someone outside the business sees nothing.
select pg_temp.login('09');
set local role authenticated;
select is(pg_temp.seen(), null::text[], 'a stranger sees no entries');
select is((select count(*)::int from public.member_sites), 0, 'or area assignments');
reset role;

select is((select count(*)::int from public.audit_log where table_name = 'member_sites' and org_id = pg_temp.id('org')), 5,
  'area assignments are audited');

-- Permission changes are audited one by one, with the role's name; creating the business isn't.
select is((select count(*)::int from public.audit_log where table_name = 'role_permissions' and org_id = pg_temp.id('org')), 0,
  'creating a business does not log every permission');
select pg_temp.login('01');
set local role authenticated;
insert into public.role_permissions (role_id, permission)
select id, 'leave.review' from public.roles where org_id = pg_temp.id('org') and name = 'Leader';
delete from public.role_permissions
where role_id = (select id from public.roles where org_id = pg_temp.id('org') and name = 'Leader') and permission = 'sales.log';
reset role;
select results_eq(
  $$ select action || ':' || (coalesce(new_value, old_value) ->> 'role') || ':' || (coalesce(new_value, old_value) ->> 'permission')
     from public.audit_log where table_name = 'role_permissions' and org_id = pg_temp.id('org') order by id $$,
  array['insert:Leader:leave.review', 'delete:Leader:sales.log'],
  'adding and removing a permission are both audited');

select * from finish();
rollback;
