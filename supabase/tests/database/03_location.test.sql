-- Acceptance criteria 11 and 15 to 21 (geofences and the location check).
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d2', 'walker@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;
-- Metres north of a latitude, as degrees (good to well under a metre at these distances).
create function pg_temp.north(lat float8, metres float8) returns float8 language sql as $$ select lat + metres / 111320.0 $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Delta Couriers', 'sample-delta', 'Dana Sample'));
reset role;
update public.org_features set enabled = false where org_id = pg_temp.id('org') and feature = 'face_verification';

with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Depot') returning id) insert into ids select 'depot', id from s;
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Warehouse') returning id) insert into ids select 'warehouse', id from s;
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'No fence') returning id) insert into ids select 'nofence', id from s;

-- Only sites.manage may add geofences.
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
-- Depot: a 100 m circle. Warehouse: a square about 200 m on each side.
select lives_ok($$ select public.add_circle_geofence(pg_temp.id('depot'), 14.5547, 121.0244, 100) $$, 'owner adds a circle geofence');
select lives_ok($$ select public.add_polygon_geofence(pg_temp.id('warehouse'),
  '[[14.6000, 121.0000], [14.6000, 121.0019], [14.6018, 121.0019], [14.6018, 121.0000]]'::jsonb) $$, 'owner adds a polygon geofence');
select throws_ok($$ select public.add_polygon_geofence(pg_temp.id('warehouse'),
  '[[14.60, 121.00], [14.61, 121.01], [14.60, 121.01], [14.61, 121.00]]'::jsonb) $$, '22023', null, 'a self-crossing polygon is rejected');
reset role;

-- Criterion 15: inside and accurate passes.
select is((select result from private.check_location(pg_temp.id('depot'), 14.5547, 121.0244, 10, 2)), 'pass', 'centre of the circle passes');
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 80), 121.0244, 10, 2)), 'pass', '80 m from the centre passes');
-- Criterion 16: outside fails.
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 300), 121.0244, 10, 2)), 'outside the site', '300 m away fails');
-- Criterion 17: poor accuracy fails (limit 50 m).
select is((select result from private.check_location(pg_temp.id('depot'), 14.5547, 121.0244, 200, 2)), 'location not accurate enough', 'accuracy of 200 m fails');
-- Criterion 19: old readings fail.
select is((select result from private.check_location(pg_temp.id('depot'), 14.5547, 121.0244, 10, 45)), 'location reading is too old', 'a 45 second old reading fails');
select is((select result from private.check_location(pg_temp.id('nofence'), 14.5547, 121.0244, 10, 2)), 'this site has no geofence', 'a site without a fence fails clearly');

-- Criterion 18: strict versus balanced near the edge.
-- 95 m from the centre of a 100 m circle (5 m inside the edge) with 20 m accuracy.
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 95), 121.0244, 20, 2)), 'pass', 'balanced: 5 m inside with 20 m accuracy passes');
-- 110 m from the centre (10 m outside) with 20 m accuracy: balanced passes, because the person may well be inside.
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 110), 121.0244, 20, 2)), 'pass', 'balanced: 10 m outside with 20 m accuracy passes');
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 130), 121.0244, 20, 2)), 'outside the site', 'balanced: 30 m outside with 20 m accuracy fails');
update public.org_settings set location_mode = 'strict' where org_id = pg_temp.id('org');
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 95), 121.0244, 20, 2)),
  'too close to the edge for this location accuracy', 'strict: 5 m inside with 20 m accuracy fails');
select is((select result from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 50), 121.0244, 20, 2)), 'pass', 'strict: 50 m inside with 20 m accuracy passes');
update public.org_settings set location_mode = 'balanced' where org_id = pg_temp.id('org');

-- Criterion 21: circle and polygon answers match a reference calculation for points around the edge.
select is(
  (select count(*)::int from generate_series(-20, 20) as d(off)
   where ((select inside_fence from private.check_location(pg_temp.id('depot'), pg_temp.north(14.5547, 100 + off), 121.0244, 5, 1)))
      <> extensions.st_dwithin(
           extensions.st_setsrid(extensions.st_makepoint(121.0244, pg_temp.north(14.5547, 100 + off)), 4326)::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(121.0244, 14.5547), 4326)::extensions.geography, 100)
     and abs(off) > 1),
  0, 'circle edge matches the reference distance to within 1 m');
select is((select inside_fence from private.check_location(pg_temp.id('warehouse'), 14.6009, 121.00095, 5, 1)), true, 'polygon: the middle is inside');
select is((select inside_fence from private.check_location(pg_temp.id('warehouse'), 14.6030, 121.00095, 5, 1)), false, 'polygon: north of it is outside');
select ok((select distance_to_edge_m from private.check_location(pg_temp.id('warehouse'), 14.6009, 121.00095, 5, 1)) between 90 and 115,
  'polygon: distance to the edge from the middle is about 100 m');

-- Criteria 11 and 16: through clock_in, with assignment and the flag or block policy.
insert into public.memberships (org_id, user_id, display_name, role_id)
select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000d2', 'Wes Sample', id from public.roles where org_id = pg_temp.id('org') and name = 'Employee';
insert into public.member_sites select id, pg_temp.id('depot') from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2';

select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select throws_ok($$ select public.clock_in(pg_temp.id('warehouse'), 14.6009, 121.00095, 5, 1) $$, '42501', 'You are not assigned to this site', 'clock in at an unassigned site is refused');
-- Default policy for location is flag: the punch is accepted but flagged.
select is((public.clock_in(pg_temp.id('depot'), pg_temp.north(14.5547, 300), 121.0244, 10, 2) ->> 'flagged')::boolean, true, 'outside the fence with the flag policy: accepted and flagged');
reset role;
select ok((select flagged from public.time_entries where membership_id = (select id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2')), 'the entry is flagged for review');
select is((select location_result from public.clock_events where membership_id = (select id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2')),
  'outside the site', 'the evidence records why');

delete from public.time_entries where membership_id = (select id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2');
update public.org_settings set location_fail_policy = 'block' where org_id = pg_temp.id('org');
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select is((public.clock_in(pg_temp.id('depot'), pg_temp.north(14.5547, 300), 121.0244, 10, 2) ->> 'ok')::boolean, false, 'with the block policy the punch is refused');
select is((select count(*)::int from public.time_entries), 0, 'no entry was created');
select is((select count(*)::int from public.clock_events where not accepted), 1, 'the refused attempt is still recorded as evidence');
reset role;

-- Criterion 20: impossible travel is flagged. An accepted punch in Manila, then one 600 km away a minute later.
insert into public.clock_events (org_id, membership_id, site_id, kind, accepted, location, server_time)
select pg_temp.id('org'), id, pg_temp.id('depot'), 'out', true,
  extensions.st_setsrid(extensions.st_makepoint(123.9, 10.3), 4326)::extensions.geography, now() - interval '1 minute'
from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2';
update public.org_settings set location_fail_policy = 'flag' where org_id = pg_temp.id('org');
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select ok((public.clock_in(pg_temp.id('depot'), 14.5547, 121.0244, 10, 2) ->> 'reason') like 'travel of %', 'a jump of 600 km in a minute is flagged as impossible travel');
reset role;

select * from finish();
rollback;
