-- Phase 2 criteria 54 to 57: products and customer applications.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000010' || n)::uuid, 's' || n || '@example.test', 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
from unnest(array['01', '02', '03', '04', '05']) n;

create temp table ids (k text primary key, v text);
grant all on ids to authenticated;
create function pg_temp.login(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000010' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v::uuid from ids where k = p $$;
create function pg_temp.val(p text) returns text language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text), pg_temp.val(text) to authenticated, anon;
grant select on ids to anon;

select pg_temp.login('01');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Sales Co', 'sample-sales', 'Ora Sample', 'Asia/Manila', 'PHP', 'field'));
reset role;

create function pg_temp.add(p_key text, p_user text, p_role text) returns void language sql as $$
  with m as (
    insert into public.memberships (org_id, user_id, display_name, role_id)
    select pg_temp.id('org'), ('00000000-0000-0000-0000-0000000010' || p_user)::uuid, initcap(p_key) || ' Sample', r.id
    from public.roles r where r.org_id = pg_temp.id('org') and r.name = p_role returning id)
  insert into ids select p_key, id from m
$$;
select pg_temp.add('ops', '02', 'Finance');
select pg_temp.add('ana', '03', 'Employee');
select pg_temp.add('ben', '04', 'Employee');
select pg_temp.add('hr', '05', 'Human Resources');
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'East') returning id)
insert into ids select 'east', id from s;
insert into public.member_sites (membership_id, site_id) values (pg_temp.id('ana'), pg_temp.id('east'));

-- Products: only products.manage.
select pg_temp.login('02');
set local role authenticated;
with p as (insert into public.products (org_id, name, price_minor, incentive_minor) values (pg_temp.id('org'), 'Starter kit', 150000, 20000) returning id)
insert into ids select 'manual', id from p;
with p as (insert into public.products (org_id, name, price_minor, incentive_minor, auto_approve) values (pg_temp.id('org'), 'Basic plan', 90000, 10000, true) returning id)
insert into ids select 'auto', id from p;
with p as (insert into public.products (org_id, name, price_minor, incentive_minor, needs_verification) values (pg_temp.id('org'), 'Walk-in sale', 50000, 5000, false) returning id)
insert into ids select 'walkin', id from p;
select throws_ok($$ insert into public.products (org_id, name, price_minor, auto_approve, needs_verification)
  values (pg_temp.id('org'), 'Bad', 1, true, false) $$, '23514', null, 'automatic approval needs customer confirmation');
reset role;

select pg_temp.login('03');
set local role authenticated;
select throws_ok($$ insert into public.products (org_id, name, price_minor) values (pg_temp.id('org'), 'Mine', 1) $$,
  '42501', null, 'employees cannot add products');

-- Criterion 54.
insert into ids select 'a1', r ->> 'id' from (select public.log_application(pg_temp.id('org'), pg_temp.id('manual'), 'Carla Sample', 'Carla@Example.test', '0917 000 0000') r) x;
insert into ids select 'a2_token', r ->> 'token' from (select public.log_application(pg_temp.id('org'), pg_temp.id('auto'), 'Dino Sample', 'dino@example.test') r) x;
reset role;
-- Read the second application's id back as the database owner.
insert into ids select 'a2', id from public.customer_applications where customer_name = 'Dino Sample';

select is((select status::text || '/' || price_minor || '/' || customer_email || '/' || site_id from public.customer_applications where id = pg_temp.id('a1')),
  'awaiting_verification/150000/carla@example.test/' || pg_temp.val('east'),
  'a new application waits for the customer, with the product''s price and the agent''s area');
select is(length(pg_temp.val('a2_token')), 48, 'the agent gets a 48-character link token');
select is((select count(*)::int from public.customer_applications where token_hash = pg_temp.val('a2_token')), 0, 'the token itself is not stored');
select is((select incentive_minor from public.customer_applications where id = pg_temp.id('a1')), 0::bigint, 'no incentive before approval');

select pg_temp.login('03');
set local role authenticated;
select throws_ok($$ select token_hash from public.customer_applications $$, '42501', null, 'nobody can read token hashes');
select throws_ok($$ update public.customer_applications set price_minor = 1 $$, '42501', null, 'nobody edits applications directly');
reset role;

select pg_temp.login('05');
set local role authenticated;
select throws_ok($$ select public.log_application(pg_temp.id('org'), pg_temp.id('manual'), 'Eve Sample', 'eve@example.test') $$,
  '42501', null, 'people without sales.log cannot log sales');
reset role;

-- Criterion 55 and 57: the auto-approve product approves itself on confirmation.
select is(public.verify_application(pg_temp.val('a2_token')) ->> 'status', 'approved', 'confirming an auto-approve product approves it');
select is((select incentive_minor from public.customer_applications where id = pg_temp.id('a2')), 10000::bigint,
  'the incentive is copied when approved');
select throws_ok($$ select public.verify_application(pg_temp.val('a2_token')) $$, 'P0001', 'This link is invalid or has expired',
  'a link works only once');
select throws_ok($$ select public.verify_application('not-a-token') $$, 'P0001', null, 'a made-up token fails');

-- A manual product: new link, confirm, then a reviewer decides.
select pg_temp.login('03');
set local role authenticated;
insert into ids values ('a1_new', public.resend_verification(pg_temp.id('a1')));
select throws_ok($$ select public.decide_application(pg_temp.id('a1'), true) $$, '42501', null, 'employees cannot approve sales');
reset role;
set local role anon;
select is(public.verify_application(pg_temp.val('a1_new')) ->> 'status', 'for_approval', 'the customer confirms without signing in');
reset role;

select pg_temp.login('02');
set local role authenticated;
select throws_ok($$ select public.decide_application(pg_temp.id('a1'), false) $$, '22023', null, 'a rejection needs a reason');
select lives_ok($$ select public.decide_application(pg_temp.id('a1'), true, 'Documents checked') $$, 'finance approves');
select throws_ok($$ select public.decide_application(pg_temp.id('a1'), false, 'Oops') $$, 'P0001', null, 'a decision is final');
reset role;
select is((select status::text || '/' || incentive_minor from public.customer_applications where id = pg_temp.id('a1')), 'approved/20000',
  'approved with the product''s incentive');

-- Products without confirmation go straight to approval; expired links fail.
select pg_temp.login('04');
set local role authenticated;
insert into ids select 'w1', r ->> 'id' from (select public.log_application(pg_temp.id('org'), pg_temp.id('walkin'), 'Fred Sample', 'fred@example.test') r) x;
insert into ids select 'b1_token', r ->> 'token' from (select public.log_application(pg_temp.id('org'), pg_temp.id('manual'), 'Gina Sample', 'gina@example.test') r) x;
select is((select status::text from public.customer_applications where id = pg_temp.id('w1')), 'for_approval',
  'a product without confirmation is ready for approval at once');
select is((select count(*)::int from public.customer_applications), 2, 'employees see only their own applications');
reset role;
update public.customer_applications set token_expires_at = now() - interval '1 minute' where customer_name = 'Gina Sample';
select throws_ok($$ select public.verify_application(pg_temp.val('b1_token')) $$, 'P0001', null, 'an expired link fails');

-- Criterion 56: follow-up after the business's hours.
update public.customer_applications set verification_sent_at = now() - interval '73 hours' where customer_name = 'Gina Sample';
select is(private.move_to_follow_up(), 1, 'one stale application moves to follow-up');
select is((select status::text from public.customer_applications where customer_name = 'Gina Sample'), 'follow_up', 'and it is marked for follow-up');
update public.org_settings set follow_up_hours = 100 where org_id = pg_temp.id('org');
update public.customer_applications set status = 'awaiting_verification' where customer_name = 'Gina Sample';
select is(private.move_to_follow_up(), 0, 'the hours are the business''s setting');

-- Corrections and cancelling.
select pg_temp.login('04');
set local role authenticated;
insert into ids select 'g', id from public.customer_applications where customer_name = 'Gina Sample';
select ok(public.update_application(pg_temp.id('g'), 'Gina Sample', 'gina.new@example.test') is not null,
  'a new email address needs a new confirmation');
select is(public.update_application(pg_temp.id('g'), 'Gina R Sample', 'gina.new@example.test'), null,
  'other corrections keep the current link');
select throws_ok($$ select public.cancel_application(pg_temp.id('g'), '') $$, '22023', null, 'cancelling needs a reason');
select lives_ok($$ select public.cancel_application(pg_temp.id('g'), 'Customer changed their mind') $$, 'the agent cancels');
select throws_ok($$ select public.cancel_application(pg_temp.id('a1'), 'Not mine') $$, 'P0002', null, 'but not someone else''s sale');
reset role;

-- Nobody approves their own sale, even with sales.review.
insert into public.role_permissions (role_id, permission)
select id, 'sales.log' from public.roles where org_id = pg_temp.id('org') and name = 'Finance';
select pg_temp.login('02');
set local role authenticated;
insert into ids select 'own', r ->> 'id' from (select public.log_application(pg_temp.id('org'), pg_temp.id('walkin'), 'Hugo Sample', 'hugo@example.test') r) x;
select throws_ok($$ select public.decide_application(pg_temp.id('own'), true) $$, '42501', 'You cannot approve your own sale',
  'a reviewer cannot approve their own sale');
reset role;

select ok((select count(*) from public.audit_log where table_name = 'customer_applications' and org_id = pg_temp.id('org')) >= 5,
  'application changes are audited');
select is((select count(*)::int from public.audit_log where table_name = 'customer_applications' and new_value ? 'token_hash'), 0,
  'without token hashes');

select * from finish();
rollback;
