-- Acceptance criteria 22 to 26 and 28 (face enrollment, matching, liveness challenges, replays).
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e2', 'gia@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e3', 'hal@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create temp table vals (k text primary key, j jsonb);
grant all on vals to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;
-- A made-up 128-number embedding: a base direction plus a small, seeded wobble.
create function pg_temp.embedding(seed int, wobble float8) returns real[] language sql as $$
  select array_agg((sin(i * 0.37) + wobble * sin(i * seed * 1.7))::real order by i) from generate_series(1, 128) i
$$;
grant execute on function pg_temp.embedding(int, float8) to authenticated;
create function pg_temp.liveness(challenge jsonb) returns jsonb language sql as $$
  select jsonb_build_object('passed', true, 'actions', challenge -> 'actions', 'duration_ms', 2400)
$$;
grant execute on function pg_temp.liveness(jsonb) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Echo Clinic', 'sample-echo', 'Erin Sample'));
reset role;
update public.org_features set enabled = false where org_id = pg_temp.id('org') and feature = 'geofence';
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Front desk') returning id) insert into ids select 'site', id from s;
with m as (insert into public.memberships (org_id, user_id, display_name, role_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000e2', 'Gia Sample', id from public.roles where org_id = pg_temp.id('org') and name = 'Employee' returning id)
insert into ids select 'gia', id from m;
with m as (insert into public.memberships (org_id, user_id, display_name, role_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000e3', 'Hal Sample', id from public.roles where org_id = pg_temp.id('org') and name = 'Employee' returning id)
insert into ids select 'hal', id from m;
insert into public.member_sites select v, pg_temp.id('site') from ids where k in ('gia', 'hal');

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
-- Criterion 28: no enrollment without consent.
select throws_ok($$ select public.enroll_face(pg_temp.id('gia'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', false) $$, 'P0001', 'Consent is required before enrolling a face', 'enrollment needs consent');
select throws_ok($$ select public.enroll_face(pg_temp.id('hal'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', true) $$, '42501', null, 'an employee cannot enroll someone else''s face');
select lives_ok($$ select public.enroll_face(pg_temp.id('gia'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(1, 0.02)), to_jsonb(pg_temp.embedding(2, 0.02)), to_jsonb(pg_temp.embedding(3, 0.02))),
  'test-model-1', true) $$, 'Gia enrolls her own face with consent');

-- Criterion 22: nobody can read the enrolled embedding.
select throws_ok($$ select embedding from public.face_enrollments $$, '42501', null, 'the enrollment table cannot be read');
select is((select enrolled from public.face_status(pg_temp.id('gia'))), true, 'face_status says enrolled');
reset role;
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and pg_get_function_result(p.oid) ~* 'real\[\]'), 0,
  'no public function returns an embedding');

-- A successful clock in: matching face, correct liveness actions, fresh challenge.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
insert into vals values ('c1', public.issue_clock_challenge(pg_temp.id('org')));
select is(jsonb_array_length((select j from vals where k = 'c1') -> 'actions'), 2, 'a challenge has two actions');
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c1') ->> 'id')::uuid,
  pg_temp.embedding(4, 0.02), pg_temp.liveness((select j from vals where k = 'c1'))) ->> 'ok')::boolean, true, 'matching face with liveness clocks in');
select is((select face_result from public.clock_events order by id desc limit 1), 'pass', 'evidence records the pass');
select ok((select face_similarity from public.clock_events order by id desc limit 1) > 0.9, 'evidence records the similarity');
reset role;
delete from public.time_entries where membership_id = pg_temp.id('gia');

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
-- Criterion 23: a challenge works once.
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c1') ->> 'id')::uuid,
  pg_temp.embedding(5, 0.02), pg_temp.liveness((select j from vals where k = 'c1'))) ->> 'reason'), 'liveness challenge already used', 'a used challenge fails');

-- Liveness actions in the wrong order fail.
insert into vals values ('c2', public.issue_clock_challenge(pg_temp.id('org')));
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c2') ->> 'id')::uuid,
  pg_temp.embedding(6, 0.02),
  jsonb_build_object('passed', true, 'duration_ms', 2400,
    'actions', jsonb_build_array((select j from vals where k = 'c2') -> 'actions' -> 1, (select j from vals where k = 'c2') -> 'actions' -> 0)))
  ->> 'reason'), 'liveness check failed', 'actions in the wrong order fail');

-- A result reported too fast to be real fails.
insert into vals values ('c3', public.issue_clock_challenge(pg_temp.id('org')));
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c3') ->> 'id')::uuid,
  pg_temp.embedding(7, 0.02), (select j from vals where k = 'c3') || jsonb_build_object('passed', true, 'duration_ms', 300)
    - 'id' - 'expires_at') ->> 'reason'), 'liveness check failed', 'a challenge completed in 0.3 seconds fails');

-- Criterion 25: a different face fails.
insert into vals values ('c4', public.issue_clock_challenge(pg_temp.id('org')));
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c4') ->> 'id')::uuid,
  (select array_agg(cos(i * 1.3)::real order by i) from generate_series(1, 128) i),
  pg_temp.liveness((select j from vals where k = 'c4'))) ->> 'reason'), 'face does not match', 'a different face fails');

-- Criterion 26: an embedding already used is rejected as a replay.
insert into vals values ('c5', public.issue_clock_challenge(pg_temp.id('org')));
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'c5') ->> 'id')::uuid,
  pg_temp.embedding(4, 0.02), pg_temp.liveness((select j from vals where k = 'c5'))) ->> 'reason'), 'replayed face data', 'a replayed embedding fails');
select is((select count(*)::int from public.time_entries), 0, 'none of the failed attempts created an entry (face policy is block)');
select is((select count(*)::int from public.clock_events where not accepted), 5, 'all five failed attempts are recorded');
reset role;

-- Criterion 24: an expired challenge fails.
insert into public.clock_challenges (id, membership_id, actions, issued_at, expires_at)
values ('00000000-0000-0000-0000-00000000c0de', pg_temp.id('gia'), array['blink', 'smile'], now() - interval '2 minutes', now() - interval '1 minute');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, '00000000-0000-0000-0000-00000000c0de',
  pg_temp.embedding(8, 0.02), '{"passed": true, "actions": ["blink", "smile"], "duration_ms": 2400}') ->> 'reason'),
  'liveness challenge expired', 'an expired challenge fails');
-- Someone else's challenge can't be used.
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
insert into vals values ('h1', public.issue_clock_challenge(pg_temp.id('org')));
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'h1') ->> 'id')::uuid,
  pg_temp.embedding(9, 0.02), pg_temp.liveness((select j from vals where k = 'h1'))) ->> 'reason'), 'no liveness challenge', 'another person''s challenge cannot be used');
-- Hal is not enrolled.
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
insert into vals values ('h2', public.issue_clock_challenge(pg_temp.id('org')));
select is((public.clock_in(pg_temp.id('site'), null, null, null, null, ((select j from vals where k = 'h2') ->> 'id')::uuid,
  pg_temp.embedding(10, 0.02), pg_temp.liveness((select j from vals where k = 'h2'))) ->> 'reason'), 'not enrolled', 'an unenrolled member is told to enroll');
reset role;

-- A manager with face.enroll_others can enroll someone in their team (supervised enrollment).
update public.memberships set manager_id = (select id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e1')
where id = pg_temp.id('hal');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select lives_ok($$ select public.enroll_face(pg_temp.id('hal'),
  jsonb_build_array(to_jsonb(pg_temp.embedding(11, 0.02)), to_jsonb(pg_temp.embedding(12, 0.02)), to_jsonb(pg_temp.embedding(13, 0.02))),
  'test-model-1', true) $$, 'the owner enrolls Hal under supervision');
reset role;

select * from finish();
rollback;
