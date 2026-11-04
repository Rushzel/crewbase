-- Acceptance criteria 22 to 26 and 28, face check version 2 (docs/FACE-V2.md): challenges with a
-- colour sequence, checks recorded only by the server, punches that need a passed, unused check.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e2', 'gia@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e3', 'hal@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated, service_role;
-- Made-up 128-number embeddings: one person's face with a small, seeded wobble, and another person.
create function pg_temp.face(seed int) returns real[] language sql as $$
  select array_agg((sin(i * 0.37) + 0.03 * sin(i * seed * 1.7))::real order by i) from generate_series(1, 128) i
$$;
create function pg_temp.other_face() returns real[] language sql as $$
  select array_agg(cos(i * 1.31)::real order by i) from generate_series(1, 128) i
$$;
grant execute on function pg_temp.face(int), pg_temp.other_face() to authenticated, service_role;
-- The server's call, as the service role: what /api/face/check does after checking the frames.
create function pg_temp.record(p_key text, p_user uuid, p_passed boolean, p_embedding real[], p_model text default 'sface-test')
returns jsonb language sql as $$
  select public.record_face_check(pg_temp.id(p_key), p_user, p_passed, case when p_passed then null else 'no blink seen' end,
    p_embedding, '{"still_frames": 3}'::jsonb, p_model)
$$;
grant execute on function pg_temp.record(text, uuid, boolean, real[], text) to service_role;
create function pg_temp.challenge(p_purpose text default 'clock', p_member uuid default null, p_consent boolean default false)
returns uuid language sql as $$
  select (public.issue_face_challenge(pg_temp.id('org'), p_purpose, p_member, p_consent) ->> 'id')::uuid
$$;
grant execute on function pg_temp.challenge(text, uuid, boolean) to authenticated;

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

-- Criterion 28: consent first, and only your own face.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select throws_ok($$ select pg_temp.challenge('enroll', pg_temp.id('gia'), false) $$, 'P0001', 'Consent is required before enrolling a face',
  'enrollment needs consent');
select throws_ok($$ select pg_temp.challenge('enroll', pg_temp.id('hal'), true) $$, '42501', null, 'an employee cannot enroll someone else''s face');
select throws_ok($$ select pg_temp.challenge('clock', pg_temp.id('hal')) $$, '42501', null, 'a time-in check is always your own');
insert into ids values ('e1', pg_temp.challenge('enroll', null, true));
select is(jsonb_array_length(public.face_challenge(pg_temp.id('e1')) -> 'colors'), 5, 'a challenge carries five screen colours');
reset role;
select ok((select count(distinct c) >= 4 from public.clock_challenges, unnest(colors) c where id = pg_temp.id('e1'))
  and not exists (select 1 from public.clock_challenges ch, generate_subscripts(ch.colors, 1) i
                  where ch.id = pg_temp.id('e1') and i > 1 and ch.colors[i] = ch.colors[i - 1]),
  'at least four different colours, never the same twice in a row');

-- The phone can't record a result: only the server's secret key can.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select throws_ok($$ select public.record_face_check(pg_temp.id('e1'), '00000000-0000-0000-0000-0000000000e2', true, null,
  pg_temp.face(1), '{}', 'sface-test') $$, '42501', null, 'a signed-in person cannot record a face check');
select throws_ok($$ insert into public.face_checks (challenge_id, membership_id, passed, model_version)
  values (pg_temp.id('e1'), pg_temp.id('gia'), true, 'x') $$, '42501', null, 'or write one directly');
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
select throws_ok($$ select public.face_challenge(pg_temp.id('e1')) $$, 'P0002', null, 'someone else cannot use your challenge');
reset role;

set local role service_role;
select throws_ok($$ select pg_temp.record('e1', '00000000-0000-0000-0000-0000000000e3', true, pg_temp.face(1)) $$,
  '42501', null, 'the server records a check only for the person who asked for it');
select is(pg_temp.record('e1', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(1)) ->> 'passed', 'true',
  'a passed enrollment check stores the face');
select throws_ok($$ select pg_temp.record('e1', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(1)) $$,
  'P0001', 'This challenge was already checked', 'a challenge is checked once');
reset role;

-- Criterion 22: nobody can read the enrolled face.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select throws_ok($$ select embedding from public.face_enrollments $$, '42501', null, 'the enrollment table cannot be read');
select throws_ok($$ select * from public.face_checks $$, '42501', null, 'nor can the checks');
select is((select enrolled from public.face_status(pg_temp.id('gia'))), true, 'face_status says enrolled');
reset role;
select is((select enrolled_by from public.face_enrollments where membership_id = pg_temp.id('gia')),
  '00000000-0000-0000-0000-0000000000e2'::uuid, 'the enrollment records who did it');

-- A failed liveness check never stores a face.
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
insert into ids values ('e2', pg_temp.challenge('enroll', null, true));
reset role;
set local role service_role;
select is(pg_temp.record('e2', '00000000-0000-0000-0000-0000000000e3', false, null) ->> 'reason', 'no blink seen',
  'a failed check keeps the server''s reason');
reset role;
select is((select count(*)::int from public.face_enrollments where membership_id = pg_temp.id('hal')), 0,
  'so a photo held to the camera can''t be enrolled');

-- Criteria 23 to 26: time in needs a passed, unused, recent check of the enrolled face.
create function pg_temp.clock(p_key text) returns jsonb language sql as $$
  select public.clock_in(pg_temp.id('site'), null, null, null, null, pg_temp.id(p_key))
$$;
grant execute on function pg_temp.clock(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
insert into ids values ('c1', pg_temp.challenge());
reset role;
set local role service_role;
select is(pg_temp.record('c1', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(2)) ->> 'passed', 'true',
  'the database matches the server''s embedding with the enrolled face');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is((pg_temp.clock('c1') ->> 'ok')::boolean, true, 'with a passed check, time in works');
reset role;
select is((select face_result from public.clock_events order by id desc limit 1), 'pass', 'evidence records the pass');
select ok((select face_similarity from public.clock_events order by id desc limit 1) > 0.9, 'and the similarity');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is(public.clock_out(pg_temp.id('org'), null, null, null, null, pg_temp.id('c1')) ->> 'reason', 'face check already used',
  'a check can be used once only, so time out needs a new one');
insert into ids values ('c1b', pg_temp.challenge());
reset role;
set local role service_role;
select pg_temp.record('c1b', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(4));
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is((public.clock_out(pg_temp.id('org'), null, null, null, null, pg_temp.id('c1b')) ->> 'ok')::boolean, true,
  'with a new passed check, time out works');
reset role;

-- Someone else's face.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
insert into ids values ('c2', pg_temp.challenge());
reset role;
set local role service_role;
select is(pg_temp.record('c2', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.other_face()) ->> 'reason', 'face does not match',
  'a different face does not match');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is(pg_temp.clock('c2') ->> 'reason', 'face does not match', 'and time in is blocked with that reason');

-- A failed liveness check.
insert into ids values ('c3', pg_temp.challenge());
reset role;
set local role service_role;
select pg_temp.record('c3', '00000000-0000-0000-0000-0000000000e2', false, null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is(pg_temp.clock('c3') ->> 'reason', 'no blink seen', 'a failed liveness check blocks time in');

-- A challenge that was never checked, and no challenge at all.
insert into ids values ('c4', pg_temp.challenge());
select is(pg_temp.clock('c4') ->> 'reason', 'no face check', 'a challenge the server never checked doesn''t count');
select is(public.clock_in(pg_temp.id('site')) ->> 'reason', 'no face check', 'nor does no challenge');
reset role;

-- Stale checks and expired challenges.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
insert into ids values ('c5', pg_temp.challenge());
insert into ids values ('c6', pg_temp.challenge());
reset role;
set local role service_role;
select pg_temp.record('c5', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(3));
reset role;
update public.face_checks set checked_at = now() - interval '3 minutes' where challenge_id = pg_temp.id('c5');
update public.clock_challenges set expires_at = now() - interval '1 second' where id = pg_temp.id('c6');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is(pg_temp.clock('c5') ->> 'reason', 'face check expired', 'a check older than 2 minutes is refused');
reset role;
set local role service_role;
select throws_ok($$ select pg_temp.record('c6', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(3)) $$,
  'P0001', 'This face check has expired; start again', 'frames for an expired challenge are refused');
reset role;

-- Not enrolled, and enrolled with an older model.
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
insert into ids values ('h1', pg_temp.challenge());
reset role;
set local role service_role;
select is(pg_temp.record('h1', '00000000-0000-0000-0000-0000000000e3', true, pg_temp.face(1)) ->> 'reason', 'not enrolled',
  'someone not enrolled fails the check');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
insert into ids values ('g1', pg_temp.challenge());
reset role;
set local role service_role;
select is(pg_temp.record('g1', '00000000-0000-0000-0000-0000000000e2', true, pg_temp.face(1), 'sface-newer') ->> 'reason',
  'enrolled with an older face model; enroll again', 'a face enrolled with another model must be enrolled again');
reset role;

select is((select count(*)::int from public.time_entries where org_id = pg_temp.id('org')), 1, 'only the one passed check created an entry (face policy is block)');
select ok((select count(*) from public.clock_events where not accepted and org_id = pg_temp.id('org')) >= 6, 'every refused attempt is recorded as evidence');

select * from finish();
rollback;
