-- Time entries, breaks, punch evidence, face enrollment, liveness challenges,
-- correction requests and the change log. Members never write these tables directly:
-- every change goes through a function that uses server time and checks the rules.

create type public.entry_status as enum ('working', 'on_break', 'closed', 'missing_out');
create type public.entry_source as enum ('app', 'manual');
create type public.punch_kind as enum ('in', 'out', 'break_start', 'break_end');
create type public.request_kind as enum ('change_times', 'missing_time_out', 'missing_entry', 'delete_entry');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  site_id uuid,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  status public.entry_status not null default 'working',
  break_minutes int not null default 0 check (break_minutes >= 0),
  worked_minutes int not null default 0 check (worked_minutes >= 0),
  source public.entry_source not null default 'app',
  edited boolean not null default false,
  flagged boolean not null default false,
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (site_id, org_id) references public.sites (id, org_id),
  check (clock_out is null or clock_out >= clock_in),
  check ((status in ('working', 'on_break')) = (clock_out is null)),
  check (status <> 'missing_out' or (worked_minutes = 0 and clock_out = clock_in)),
  check (clock_out is null or break_minutes * interval '1 minute' <= clock_out - clock_in),
  -- No two entries for one member may overlap. An open entry's range is unbounded, so nothing
  -- can be added after it until it's closed; a missing time out is stored as an empty range.
  exclude using gist (membership_id with =, tstzrange(clock_in, clock_out, '[)') with &&)
);
create unique index time_entries_one_open on public.time_entries (membership_id) where clock_out is null;
create index time_entries_member_date on public.time_entries (membership_id, work_date);
create index time_entries_org_date on public.time_entries (org_id, work_date);

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.time_entries (id) on delete cascade,
  break_start timestamptz not null,
  break_end timestamptz,
  check (break_end is null or break_end >= break_start)
);
create unique index breaks_one_open on public.breaks (entry_id) where break_end is null;

-- Server-issued liveness challenge: two actions in a random order, usable once, for 60 seconds.
create table public.clock_challenges (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  actions text[] not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  used_at timestamptz
);

-- The enrolled face embedding. No policy grants select on this table to anyone:
-- only security definer functions read it, and none of them return it.
create table public.face_enrollments (
  membership_id uuid primary key references public.memberships (id) on delete cascade,
  embedding real[] not null check (cardinality(embedding) between 64 and 2048),
  model_version text not null,
  frames_used smallint not null check (frames_used between 1 and 20),
  consent_at timestamptz not null,
  enrolled_by uuid not null default auth.uid(),
  enrolled_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Hashes of live embeddings already used, to reject a replayed number list.
create table public.embedding_fingerprints (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  hash text not null,
  seen_at timestamptz not null default now(),
  primary key (membership_id, hash)
);

-- Evidence for every punch attempt, including blocked ones (entry_id is null when blocked).
create table public.clock_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  entry_id uuid references public.time_entries (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  kind public.punch_kind not null,
  server_time timestamptz not null default now(),
  accepted boolean not null,
  flagged boolean not null default false,
  reason text,
  location extensions.geography(point, 4326),
  accuracy_m real,
  reading_age_s real,
  inside_fence boolean,
  distance_to_edge_m real,
  location_result text,
  travel_kmh real,
  face_similarity real,
  liveness_passed boolean,
  challenge_id uuid references public.clock_challenges (id) on delete set null,
  face_result text,
  user_agent text
);
create index clock_events_member_time on public.clock_events (membership_id, server_time desc);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  entry_id uuid references public.time_entries (id) on delete set null,
  kind public.request_kind not null,
  work_date date not null,
  old_clock_in timestamptz,
  old_clock_out timestamptz,
  old_break_minutes int,
  requested_in timestamptz,
  requested_out timestamptz,
  requested_break_minutes int check (requested_break_minutes is null or requested_break_minutes >= 0),
  site_id uuid references public.sites (id),
  reason text not null check (length(trim(reason)) >= 5),
  evidence_link text check (evidence_link is null or evidence_link ~* '^https?://'),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.memberships (id),
  reviewed_at timestamptz,
  review_note text,
  self_approved boolean not null default false,
  created_at timestamptz not null default now(),
  check (kind = 'missing_entry' or entry_id is not null or status <> 'pending'),
  check (kind in ('delete_entry', 'missing_time_out') or (requested_in is not null and requested_out is not null)),
  check (requested_out is null or requested_in is null or requested_out > requested_in),
  check (status <> 'rejected' or length(trim(coalesce(review_note, ''))) > 0)
);
create unique index correction_requests_one_pending on public.correction_requests (entry_id) where status = 'pending';

create table public.change_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  entry_id uuid,
  action text not null check (action in ('edit', 'add', 'delete', 'approve_request')),
  old_value jsonb,
  new_value jsonb,
  reason text not null check (length(trim(reason)) > 0),
  request_id uuid references public.correction_requests (id),
  changed_by uuid not null references public.memberships (id),
  self_approved boolean not null default false,
  changed_at timestamptz not null default now()
);

create trigger clock_events_append_only before update or delete on public.clock_events
  for each row execute function private.block_change();
create trigger change_log_append_only before update or delete on public.change_log
  for each row execute function private.block_change();

------------------------------------------------------------------------------
-- Calculations.
------------------------------------------------------------------------------

create function private.local_date(p_site uuid, p_at timestamptz)
returns date language sql stable security definer set search_path = '' as $$
  select (p_at at time zone coalesce(private.site_timezone(p_site), 'UTC'))::date
$$;

-- Recalculate an entry's break and worked minutes from its breaks.
create function private.recalc_entry(p_entry uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.time_entries;
  v_break int;
begin
  select * into e from public.time_entries where id = p_entry;
  if e.status = 'missing_out' or e.edited then return; end if;
  select coalesce(sum(floor(extract(epoch from (coalesce(b.break_end, e.clock_out, now()) - b.break_start)) / 60)), 0)::int
    into v_break from public.breaks b where b.entry_id = p_entry;
  update public.time_entries set
    break_minutes = v_break,
    worked_minutes = case when clock_out is null then 0
      else greatest(0, floor(extract(epoch from (clock_out - clock_in)) / 60)::int - v_break) end
  where id = p_entry;
end $$;

create function private.cosine_similarity(a real[], b real[])
returns float8 language sql immutable as $$
  select case when cardinality(a) <> cardinality(b) then -1
    else sum(x * y) / nullif(sqrt(sum(x * x)) * sqrt(sum(y * y)), 0) end
  from unnest(a, b) as t(x, y)
$$;

------------------------------------------------------------------------------
-- Face enrollment and liveness challenges.
------------------------------------------------------------------------------

-- p_embeddings: JSON array of embeddings (arrays of numbers) from the guided capture.
create function public.enroll_face(p_member uuid, p_embeddings jsonb, p_model_version text, p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_dims int;
  v_avg real[];
  v_count int := jsonb_array_length(p_embeddings);
  v_is_demo boolean;
begin
  select m.org_id, o.is_demo into v_org, v_is_demo
  from public.memberships m join public.organizations o on o.id = m.org_id where m.id = p_member;
  if v_org is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform private.require_feature(v_org, 'face_verification');
  if private.my_membership(v_org) is distinct from p_member
     and not private.can_act_on_member(p_member, 'face.enroll_others') then
    raise exception 'You can only enroll your own face' using errcode = '42501';
  end if;
  if p_consent is not true then
    raise exception 'Consent is required before enrolling a face' using errcode = 'P0001';
  end if;
  if v_count < 3 then
    raise exception 'Enrollment needs at least 3 captures' using errcode = '22023';
  end if;
  v_dims := jsonb_array_length(p_embeddings -> 0);
  if exists (select 1 from jsonb_array_elements(p_embeddings) e where jsonb_array_length(e) <> v_dims) then
    raise exception 'Captures have different sizes' using errcode = '22023';
  end if;

  select array_agg(avg_value order by dim) into v_avg from (
    select (d.ord) as dim, avg((d.value)::real) as avg_value
    from jsonb_array_elements(p_embeddings) e, jsonb_array_elements_text(e) with ordinality d(value, ord)
    group by d.ord
  ) t;

  insert into public.face_enrollments (membership_id, embedding, model_version, frames_used, consent_at, expires_at)
  values (p_member, v_avg, p_model_version, v_count, now(),
          case when v_is_demo then now() + interval '24 hours' end)
  on conflict (membership_id) do update set
    embedding = excluded.embedding, model_version = excluded.model_version, frames_used = excluded.frames_used,
    consent_at = excluded.consent_at, enrolled_by = auth.uid(), enrolled_at = now(), expires_at = excluded.expires_at;
end $$;

-- Whether a member is enrolled; never returns the embedding.
create function public.face_status(p_member uuid)
returns table (enrolled boolean, enrolled_at timestamptz, model_version text)
language sql stable security definer set search_path = '' as $$
  select f.membership_id is not null, f.enrolled_at, f.model_version
  from (select p_member as id) m
  left join public.face_enrollments f on f.membership_id = m.id and (f.expires_at is null or f.expires_at > now())
  where private.can_see_member(p_member)
$$;

create function public.issue_clock_challenge(p_org uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member uuid := private.my_membership(p_org);
  v_actions text[];
  v_row public.clock_challenges;
begin
  if v_member is null then raise exception 'Not a member of this business' using errcode = '42501'; end if;
  select array_agg(a order by random()) into v_actions
  from (select a from unnest(array['blink', 'turn_left', 'turn_right', 'smile']) a order by random() limit 2) t;
  insert into public.clock_challenges (membership_id, actions) values (v_member, v_actions) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'actions', to_jsonb(v_row.actions), 'expires_at', v_row.expires_at);
end $$;

------------------------------------------------------------------------------
-- Verification shared by time in and time out.
------------------------------------------------------------------------------

create type private.verdict as (
  blocked boolean, flagged boolean, reason text,
  inside_fence boolean, distance_to_edge_m float8, location_result text, travel_kmh float8,
  face_similarity float8, liveness_passed boolean, face_result text
);

-- p_liveness: {"passed": bool, "actions": ["blink", ...], "duration_ms": n} from the browser.
create function private.verify_punch(
  p_member uuid, p_site uuid, p_lat float8, p_lng float8, p_accuracy_m float8, p_age_s float8,
  p_challenge uuid, p_embedding real[], p_liveness jsonb
) returns private.verdict
language plpgsql volatile security definer set search_path = '' as $$
declare
  v private.verdict := row(false, false, null, null, null, null, null, null, null, null)::private.verdict;
  s public.org_settings;
  v_org uuid;
  v_loc record;
  v_last record;
  v_enrolled public.face_enrollments;
  c public.clock_challenges;
  v_hash text;
  v_problems text[] := '{}';
begin
  select m.org_id into v_org from public.memberships m where m.id = p_member;
  select * into s from public.org_settings where org_id = v_org;

  -- Location.
  if private.feature_enabled(v_org, 'geofence') then
    select * into v_loc from private.check_location(p_site, p_lat, p_lng, p_accuracy_m, p_age_s);
    v.inside_fence := v_loc.inside_fence;
    v.distance_to_edge_m := v_loc.distance_to_edge_m;
    v.location_result := v_loc.result;
    if v_loc.result <> 'pass' then
      if s.location_fail_policy = 'block' then v.blocked := true; else v.flagged := true; end if;
      v_problems := v_problems || v_loc.result;
    end if;

    -- Impossible travel since the member's previous located punch.
    select ce.location, ce.server_time into v_last
    from public.clock_events ce
    where ce.membership_id = p_member and ce.location is not null and ce.accepted
    order by ce.server_time desc limit 1;
    if v_last.location is not null and p_lat is not null then
      v.travel_kmh := extensions.st_distance(v_last.location,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000.0
        / greatest(extract(epoch from (now() - v_last.server_time)) / 3600.0, 1.0 / 3600);
      if v.travel_kmh > 200 then
        v.flagged := true;
        v_problems := v_problems || format('travel of %s km/h since the last punch', round(v.travel_kmh::numeric));
      end if;
    end if;
  end if;

  -- Face and liveness.
  if private.feature_enabled(v_org, 'face_verification') then
    select * into v_enrolled from public.face_enrollments
    where membership_id = p_member and (expires_at is null or expires_at > now());

    if v_enrolled.membership_id is null then
      v.face_result := 'not enrolled';
    elsif p_embedding is null then
      v.face_result := 'no face captured';
    else
      v.face_similarity := private.cosine_similarity(p_embedding, v_enrolled.embedding);
      v_hash := md5(array_to_string(p_embedding, ','));
      if exists (select 1 from public.embedding_fingerprints where membership_id = p_member and hash = v_hash) then
        v.face_result := 'replayed face data';
      elsif v.face_similarity < s.face_threshold then
        v.face_result := 'face does not match';
      end if;
      insert into public.embedding_fingerprints (membership_id, hash) values (p_member, v_hash) on conflict do nothing;
    end if;

    if s.liveness_required then
      select * into c from public.clock_challenges where id = p_challenge and membership_id = p_member for update;
      v.liveness_passed := c.id is not null
        and c.used_at is null
        and c.expires_at > now()
        and coalesce((p_liveness ->> 'passed')::boolean, false)
        and coalesce(p_liveness -> 'actions', '[]'::jsonb) = to_jsonb(c.actions)
        and coalesce((p_liveness ->> 'duration_ms')::int, 0) >= 600 * cardinality(c.actions);
      if c.id is not null then
        update public.clock_challenges set used_at = now() where id = c.id and used_at is null;
      end if;
      if not v.liveness_passed and v.face_result is null then
        v.face_result := case
          when c.id is null then 'no liveness challenge'
          when c.used_at is not null then 'liveness challenge already used'
          when c.expires_at <= now() then 'liveness challenge expired'
          else 'liveness check failed' end;
      end if;
    end if;

    if v.face_result is not null then
      if s.face_fail_policy = 'block' then v.blocked := true; else v.flagged := true; end if;
      v_problems := v_problems || v.face_result;
    else
      v.face_result := 'pass';
    end if;
  end if;

  v.reason := nullif(array_to_string(v_problems, '; '), '');
  return v;
end $$;

create function private.record_event(
  p_member uuid, p_entry uuid, p_site uuid, p_kind public.punch_kind, p_accepted boolean, v private.verdict,
  p_lat float8, p_lng float8, p_accuracy_m float8, p_age_s float8, p_challenge uuid, p_user_agent text
) returns void language sql security definer set search_path = '' as $$
  insert into public.clock_events (
    org_id, membership_id, entry_id, site_id, kind, accepted, flagged, reason, location, accuracy_m, reading_age_s,
    inside_fence, distance_to_edge_m, location_result, travel_kmh, face_similarity, liveness_passed, challenge_id,
    face_result, user_agent)
  select m.org_id, p_member, p_entry, p_site, p_kind, p_accepted, coalesce(v.flagged, false), v.reason,
    case when p_lat is not null and p_lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end,
    p_accuracy_m, p_age_s, v.inside_fence, v.distance_to_edge_m, v.location_result, v.travel_kmh,
    v.face_similarity, v.liveness_passed, p_challenge, v.face_result, left(p_user_agent, 300)
  from public.memberships m where m.id = p_member
$$;

------------------------------------------------------------------------------
-- Punches. All times come from now(); the browser never sends a time.
------------------------------------------------------------------------------

create function public.clock_in(
  p_site uuid, p_lat float8 default null, p_lng float8 default null, p_accuracy_m float8 default null,
  p_age_s float8 default null, p_challenge uuid default null, p_embedding real[] default null,
  p_liveness jsonb default null, p_user_agent text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid := (select org_id from public.sites where id = p_site and active);
  v_member uuid;
  v private.verdict;
  v_entry uuid;
begin
  if v_org is null then raise exception 'Site not found or inactive' using errcode = 'P0002'; end if;
  v_member := private.my_membership(v_org);
  if v_member is null then raise exception 'Not an active member of this business' using errcode = '42501'; end if;
  perform private.require_feature(v_org, 'time_tracking');
  perform private.require_permission(v_org, 'time.clock');
  if not exists (select 1 from public.member_sites where membership_id = v_member and site_id = p_site) then
    raise exception 'You are not assigned to this site' using errcode = '42501';
  end if;
  if exists (select 1 from public.time_entries where membership_id = v_member and clock_out is null) then
    raise exception 'You already have an open entry. Time out first.' using errcode = 'P0001';
  end if;

  v := private.verify_punch(v_member, p_site, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_embedding, p_liveness);

  if v.blocked then
    perform private.record_event(v_member, null, p_site, 'in', false, v, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_user_agent);
    return jsonb_build_object('ok', false, 'reason', v.reason);
  end if;

  insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, flagged)
  values (v_org, v_member, p_site, private.local_date(p_site, now()), now(), v.flagged)
  returning id into v_entry;
  perform private.record_event(v_member, v_entry, p_site, 'in', true, v, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_user_agent);
  return jsonb_build_object('ok', true, 'entry_id', v_entry, 'flagged', v.flagged, 'reason', v.reason);
end $$;

create function public.clock_out(
  p_org uuid, p_lat float8 default null, p_lng float8 default null, p_accuracy_m float8 default null,
  p_age_s float8 default null, p_challenge uuid default null, p_embedding real[] default null,
  p_liveness jsonb default null, p_user_agent text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member uuid := private.my_membership(p_org);
  e public.time_entries;
  v private.verdict;
begin
  if v_member is null then raise exception 'Not an active member of this business' using errcode = '42501'; end if;
  select * into e from public.time_entries where membership_id = v_member and clock_out is null for update;
  if e.id is null then raise exception 'You have no open entry' using errcode = 'P0001'; end if;

  v := private.verify_punch(v_member, e.site_id, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_embedding, p_liveness);
  if v.blocked then
    perform private.record_event(v_member, e.id, e.site_id, 'out', false, v, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_user_agent);
    return jsonb_build_object('ok', false, 'reason', v.reason);
  end if;

  update public.breaks set break_end = now() where entry_id = e.id and break_end is null;
  update public.time_entries set clock_out = now(), status = 'closed', flagged = flagged or v.flagged where id = e.id;
  perform private.recalc_entry(e.id);
  perform private.record_event(v_member, e.id, e.site_id, 'out', true, v, p_lat, p_lng, p_accuracy_m, p_age_s, p_challenge, p_user_agent);
  return jsonb_build_object('ok', true, 'entry_id', e.id, 'flagged', v.flagged, 'reason', v.reason);
end $$;

create function public.start_break(p_org uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member uuid := private.my_membership(p_org);
  e public.time_entries;
begin
  perform private.require_feature(p_org, 'breaks');
  select * into e from public.time_entries where membership_id = v_member and clock_out is null for update;
  if e.id is null then raise exception 'You have no open entry' using errcode = 'P0001'; end if;
  if e.status = 'on_break' then raise exception 'You are already on a break' using errcode = 'P0001'; end if;
  insert into public.breaks (entry_id, break_start) values (e.id, now());
  update public.time_entries set status = 'on_break' where id = e.id;
  perform private.record_event(v_member, e.id, e.site_id, 'break_start', true, null, null, null, null, null, null, null);
end $$;

create function public.end_break(p_org uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member uuid := private.my_membership(p_org);
  e public.time_entries;
begin
  select * into e from public.time_entries where membership_id = v_member and clock_out is null for update;
  if e.id is null or e.status <> 'on_break' then raise exception 'You are not on a break' using errcode = 'P0001'; end if;
  update public.breaks set break_end = now() where entry_id = e.id and break_end is null;
  update public.time_entries set status = 'working' where id = e.id;
  perform private.recalc_entry(e.id);
  perform private.record_event(v_member, e.id, e.site_id, 'break_end', true, null, null, null, null, null, null, null);
end $$;

-- Entries still open after their site's day has ended count 0 hours until corrected.
create function private.close_missing_out()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.breaks b set break_end = e.clock_in
  from public.time_entries e
  where b.entry_id = e.id and b.break_end is null and e.clock_out is null
    and e.work_date < private.local_date(e.site_id, now());
  update public.time_entries e set status = 'missing_out', clock_out = clock_in, worked_minutes = 0, break_minutes = 0
  where e.clock_out is null and e.work_date < private.local_date(e.site_id, now());
  get diagnostics v_count = row_count;
  return v_count;
end $$;

------------------------------------------------------------------------------
-- Corrections and manager edits.
------------------------------------------------------------------------------

create function private.minutes_between(a timestamptz, b timestamptz)
returns int language sql immutable as $$ select floor(extract(epoch from (b - a)) / 60)::int $$;

create function private.check_times(p_member uuid, p_except uuid, p_in timestamptz, p_out timestamptz, p_break int)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_in is null or p_out is null or p_out <= p_in then
    raise exception 'Time out must be after time in' using errcode = '22023';
  end if;
  if p_out > now() then
    raise exception 'Times can''t be in the future' using errcode = '22023';
  end if;
  if coalesce(p_break, 0) < 0 or coalesce(p_break, 0) >= private.minutes_between(p_in, p_out) then
    raise exception 'The break must be shorter than the entry' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.time_entries
    where membership_id = p_member and id is distinct from p_except
      and tstzrange(clock_in, clock_out, '[)') && tstzrange(p_in, p_out, '[)')
  ) then
    raise exception 'These times overlap another entry' using errcode = '23P01';
  end if;
end $$;

-- Apply times to an entry as a manual correction (breaks become one total).
create function private.apply_times(p_entry uuid, p_in timestamptz, p_out timestamptz, p_break int)
returns void language sql security definer set search_path = '' as $$
  delete from public.breaks where entry_id = p_entry;
  update public.time_entries set clock_in = p_in, clock_out = p_out, break_minutes = coalesce(p_break, 0),
    worked_minutes = greatest(0, private.minutes_between(p_in, p_out) - coalesce(p_break, 0)),
    status = 'closed', edited = true, work_date = private.local_date(site_id, p_in)
  where id = p_entry;
$$;

create function private.entry_json(p_entry uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('clock_in', clock_in, 'clock_out', clock_out, 'break_minutes', break_minutes,
    'worked_minutes', worked_minutes, 'status', status, 'work_date', work_date)
  from public.time_entries where id = p_entry
$$;

create function public.submit_request(
  p_kind public.request_kind, p_entry uuid, p_reason text,
  p_requested_in timestamptz default null, p_requested_out timestamptz default null,
  p_requested_break int default null, p_site uuid default null, p_evidence_link text default null,
  p_org uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.time_entries;
  v_org uuid;
  v_member uuid;
  v_id uuid;
begin
  if p_entry is not null then
    select * into e from public.time_entries where id = p_entry;
    v_org := e.org_id;
  else
    v_org := p_org;
  end if;
  v_member := private.my_membership(v_org);
  if v_member is null or (p_entry is not null and e.membership_id <> v_member) then
    raise exception 'You can only request changes to your own entries' using errcode = '42501';
  end if;
  perform private.require_feature(v_org, 'corrections');
  if p_kind = 'missing_entry' and p_entry is not null then
    raise exception 'A missing day has no entry yet' using errcode = '22023';
  end if;
  if p_kind <> 'missing_entry' and p_entry is null then
    raise exception 'Choose the entry to correct' using errcode = '22023';
  end if;
  if p_kind = 'missing_time_out' then
    p_requested_in := e.clock_in;
  end if;
  if p_kind <> 'delete_entry' then
    perform private.check_times(v_member, p_entry, p_requested_in, p_requested_out, p_requested_break);
  end if;

  insert into public.correction_requests (
    org_id, membership_id, entry_id, kind, work_date, old_clock_in, old_clock_out, old_break_minutes,
    requested_in, requested_out, requested_break_minutes, site_id, reason, evidence_link)
  values (
    v_org, v_member, p_entry, p_kind,
    coalesce(e.work_date, private.local_date(p_site, p_requested_in)),
    e.clock_in, nullif(e.clock_out, case when e.status = 'missing_out' then e.clock_out end), e.break_minutes,
    p_requested_in, p_requested_out, p_requested_break, coalesce(p_site, e.site_id), trim(p_reason), p_evidence_link)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'This entry already has a pending request' using errcode = '23505';
end $$;

create function public.approve_request(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.correction_requests;
  v_reviewer uuid;
  v_old jsonb;
  v_entry uuid;
begin
  select * into r from public.correction_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'This request is no longer pending' using errcode = 'P0001'; end if;
  if not private.can_act_on_member(r.membership_id, 'requests.review') then
    raise exception 'You can''t review this request' using errcode = '42501';
  end if;
  v_reviewer := private.my_membership(r.org_id);
  v_old := private.entry_json(r.entry_id);

  if r.kind = 'delete_entry' then
    delete from public.time_entries where id = r.entry_id;
    v_entry := r.entry_id;
  elsif r.kind = 'missing_entry' then
    -- Re-check now, in case the member added an entry since asking.
    perform private.check_times(r.membership_id, null, r.requested_in, r.requested_out, r.requested_break_minutes);
    insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, source)
    values (r.org_id, r.membership_id, r.site_id, r.work_date, r.requested_in, r.requested_out, 'closed', 'manual')
    returning id into v_entry;
    perform private.apply_times(v_entry, r.requested_in, r.requested_out, r.requested_break_minutes);
  else
    perform private.check_times(r.membership_id, r.entry_id, r.requested_in, r.requested_out, r.requested_break_minutes);
    perform private.apply_times(r.entry_id, r.requested_in, r.requested_out,
      coalesce(r.requested_break_minutes, r.old_break_minutes));
    v_entry := r.entry_id;
  end if;

  update public.correction_requests set status = 'approved', reviewed_by = v_reviewer, reviewed_at = now(),
    review_note = p_note, self_approved = (v_reviewer = r.membership_id), entry_id = v_entry
  where id = r.id;
  insert into public.change_log (org_id, membership_id, entry_id, action, old_value, new_value, reason, request_id, changed_by, self_approved)
  values (r.org_id, r.membership_id, v_entry, 'approve_request', v_old, private.entry_json(v_entry),
          r.reason, r.id, v_reviewer, v_reviewer = r.membership_id);
end $$;

create function public.reject_request(p_request uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.correction_requests;
begin
  select * into r from public.correction_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'This request is no longer pending' using errcode = 'P0001'; end if;
  if not private.can_act_on_member(r.membership_id, 'requests.review') then
    raise exception 'You can''t review this request' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why the request is rejected' using errcode = '22023';
  end if;
  update public.correction_requests set status = 'rejected', reviewed_by = private.my_membership(r.org_id),
    reviewed_at = now(), review_note = trim(p_note)
  where id = r.id;
end $$;

create function public.withdraw_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.correction_requests;
begin
  select * into r from public.correction_requests where id = p_request for update;
  if r.id is null or r.membership_id is distinct from private.my_membership(r.org_id) then
    raise exception 'You can only withdraw your own requests' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'This request is no longer pending' using errcode = 'P0001'; end if;
  update public.correction_requests set status = 'withdrawn' where id = r.id;
end $$;

create function public.admin_edit_entry(p_entry uuid, p_in timestamptz, p_out timestamptz, p_break int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.time_entries;
  v_old jsonb;
begin
  select * into e from public.time_entries where id = p_entry for update;
  if e.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if not private.can_act_on_member(e.membership_id, 'time.edit') then
    raise exception 'You can''t edit this person''s time' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.check_times(e.membership_id, e.id, p_in, p_out, p_break);
  v_old := private.entry_json(e.id);
  perform private.apply_times(e.id, p_in, p_out, p_break);
  insert into public.change_log (org_id, membership_id, entry_id, action, old_value, new_value, reason, changed_by)
  values (e.org_id, e.membership_id, e.id, 'edit', v_old, private.entry_json(e.id), trim(p_reason), private.my_membership(e.org_id));
end $$;

create function public.admin_add_entry(p_member uuid, p_site uuid, p_in timestamptz, p_out timestamptz, p_break int, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (select org_id from public.memberships where id = p_member);
  v_entry uuid;
begin
  if not private.can_act_on_member(p_member, 'time.edit') then
    raise exception 'You can''t add time for this person' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.check_times(p_member, null, p_in, p_out, p_break);
  insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, source)
  values (v_org, p_member, p_site, private.local_date(p_site, p_in), p_in, p_out, 'closed', 'manual')
  returning id into v_entry;
  perform private.apply_times(v_entry, p_in, p_out, p_break);
  insert into public.change_log (org_id, membership_id, entry_id, action, new_value, reason, changed_by)
  values (v_org, p_member, v_entry, 'add', private.entry_json(v_entry), trim(p_reason), private.my_membership(v_org));
  return v_entry;
end $$;

create function public.admin_delete_entry(p_entry uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.time_entries;
begin
  select * into e from public.time_entries where id = p_entry for update;
  if e.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if not private.can_act_on_member(e.membership_id, 'time.edit') then
    raise exception 'You can''t delete this person''s time' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  insert into public.change_log (org_id, membership_id, entry_id, action, old_value, reason, changed_by)
  values (e.org_id, e.membership_id, e.id, 'delete', private.entry_json(e.id), trim(p_reason), private.my_membership(e.org_id));
  delete from public.time_entries where id = e.id;
end $$;

------------------------------------------------------------------------------
-- Row-level security and grants. Members read; nobody writes directly.
------------------------------------------------------------------------------

alter table public.time_entries enable row level security;
alter table public.breaks enable row level security;
alter table public.clock_challenges enable row level security;
alter table public.face_enrollments enable row level security;
alter table public.embedding_fingerprints enable row level security;
alter table public.clock_events enable row level security;
alter table public.correction_requests enable row level security;
alter table public.change_log enable row level security;

revoke all on public.time_entries, public.breaks, public.clock_challenges, public.face_enrollments,
  public.embedding_fingerprints, public.clock_events, public.correction_requests, public.change_log
  from anon, authenticated;
grant select on public.time_entries, public.breaks, public.clock_events, public.correction_requests, public.change_log
  to authenticated;

create policy "see entries you may see" on public.time_entries
  for select to authenticated using (private.can_see_member(membership_id));
create policy "see breaks of entries you may see" on public.breaks
  for select to authenticated
  using (private.can_see_member((select membership_id from public.time_entries e where e.id = entry_id)));
create policy "see evidence you may see" on public.clock_events
  for select to authenticated using (private.can_see_member(membership_id));
create policy "see requests you may see" on public.correction_requests
  for select to authenticated using (private.can_see_member(membership_id));
create policy "see changes you may see" on public.change_log
  for select to authenticated using (private.can_see_member(membership_id));

do $$
declare f text;
begin
  foreach f in array array[
    'enroll_face(uuid, jsonb, text, boolean)', 'face_status(uuid)', 'issue_clock_challenge(uuid)',
    'clock_in(uuid, float8, float8, float8, float8, uuid, real[], jsonb, text)',
    'clock_out(uuid, float8, float8, float8, float8, uuid, real[], jsonb, text)',
    'start_break(uuid)', 'end_break(uuid)',
    'submit_request(public.request_kind, uuid, text, timestamptz, timestamptz, int, uuid, text, uuid)',
    'approve_request(uuid, text)', 'reject_request(uuid, text)', 'withdraw_request(uuid)',
    'admin_edit_entry(uuid, timestamptz, timestamptz, int, text)',
    'admin_add_entry(uuid, uuid, timestamptz, timestamptz, int, text)', 'admin_delete_entry(uuid, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.close_missing_out() from authenticated, public;

-- Run the missing time out check every 15 minutes (each site's own midnight).
create extension if not exists pg_cron;
select cron.schedule('close-missing-out', '*/15 * * * *', 'select private.close_missing_out()');
