-- Invitations: who may invite, hashed one-time tokens, matching email, expiry.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000001a1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000001a2', 'new.hire@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000001a3', 'someone.else@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table vals (k text primary key, v text);
grant all on vals to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.val(p text) returns text language sql as $$ select v from vals where k = p $$;
grant execute on function pg_temp.val(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000001a1');
set local role authenticated;
insert into vals values ('org', public.create_organization('Sample Hotel Linen', 'sample-hotel', 'Hope Sample')::text);
insert into vals values ('token', public.invite_member(pg_temp.val('org')::uuid, 'New.Hire@example.test', 'Nico Sample',
  (select id from public.roles where org_id = pg_temp.val('org')::uuid and name = 'Employee')));
select is(length(pg_temp.val('token')), 48, 'the owner gets a 48-character token');
select is((select count(*)::int from public.invitations), 1, 'the owner can see the invitation');
reset role;

select is((select count(*)::int from public.invitations where token_hash = pg_temp.val('token')), 0, 'the token itself is not stored');
select is((select status::text from public.memberships where display_name = 'Nico Sample'), 'invited', 'a membership waits in the invited state');

-- The wrong person can't use it.
select pg_temp.login('00000000-0000-0000-0000-0000000001a3');
set local role authenticated;
select throws_ok($$ select public.accept_invitation(pg_temp.val('token')) $$, '42501', 'This invitation was sent to a different email address', 'another account cannot accept it');
select throws_ok($$ select public.invite_member(pg_temp.val('org')::uuid, 'x@example.test', 'X Sample', gen_random_uuid()) $$, '42501', null, 'a non-member cannot invite');
reset role;

-- The invited person accepts once.
select pg_temp.login('00000000-0000-0000-0000-0000000001a2');
set local role authenticated;
select is(public.accept_invitation(pg_temp.val('token')), pg_temp.val('org')::uuid, 'the invited person joins');
select is((select status::text from public.memberships where user_id = '00000000-0000-0000-0000-0000000001a2'), 'active', 'and is now active');
select throws_ok($$ select public.accept_invitation(pg_temp.val('token')) $$, 'P0001', null, 'the token cannot be used twice');
-- As an employee, they can't invite anyone.
select throws_ok($$ select public.invite_member(pg_temp.val('org')::uuid, 'y@example.test', 'Y Sample',
  (select id from public.roles where org_id = pg_temp.val('org')::uuid and name = 'Employee')) $$, '42501', null, 'an employee cannot invite');
reset role;

-- Expired invitations fail.
select pg_temp.login('00000000-0000-0000-0000-0000000001a1');
set local role authenticated;
insert into vals values ('late', public.invite_member(pg_temp.val('org')::uuid, 'someone.else@example.test', 'Lou Sample',
  (select id from public.roles where org_id = pg_temp.val('org')::uuid and name = 'Employee')));
reset role;
update public.invitations set expires_at = now() - interval '1 minute' where email = 'someone.else@example.test';
select pg_temp.login('00000000-0000-0000-0000-0000000001a3');
set local role authenticated;
select throws_ok($$ select public.accept_invitation(pg_temp.val('late')) $$, 'P0001', 'This invitation is invalid or has expired', 'an expired invitation fails');
reset role;

select * from finish();
rollback;
