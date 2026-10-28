-- Made-up demo businesses, rebuilt nightly. Every person here is invented sample data.

create function private.demo_uuid(p_key text) returns uuid language sql immutable as $$
  select md5('crewbase-demo-' || p_key)::uuid
$$;

-- Creates (or keeps) a demo sign-in. Only the three role accounts per business get a known password.
create function private.demo_user(p_key text, p_email text, p_password text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := private.demo_uuid(p_key);
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt(coalesce(p_password, encode(extensions.gen_random_bytes(18), 'base64')), extensions.gen_salt('bf')),
    now(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'demo', true), '{}',
    now(), now(), '', '', '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (v_id, v_id, v_id::text, 'email', jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now())
  on conflict do nothing;
  return v_id;
end $$;

create function private.seed_demo_business(
  p_key text, p_name text, p_brand text, p_basis public.pay_basis, p_face boolean, p_output boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner_role uuid; v_manager_role uuid; v_employee_role uuid;
  v_sites uuid[];
  v_members uuid[] := '{}';
  v_manager uuid; v_owner uuid;
  v_names text[];
  v_tz text := 'Asia/Manila';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_now_local time := (now() at time zone 'Asia/Manila')::time;
  v_shift_start time;
  m uuid; d date; i int;
  v_in timestamptz; v_out timestamptz; v_break int; v_site uuid; v_entry uuid;
  v_late_bias float8; v_flag boolean;
  v_period_a uuid; v_period_b uuid;
  v_start_a date; v_end_a date;
begin
  perform setseed(case p_key when 'harbor' then 0.11 else 0.22 end);

  insert into public.organizations (id, slug, name, brand_color, is_demo)
  values (private.demo_uuid(p_key || '-org'), p_key || case when p_key = 'harbor' then '-lane' else '' end, p_name, p_brand, true)
  returning id into v_org;
  insert into public.org_settings (org_id, timezone, currency, pay_frequency, overtime_multiplier, default_start_time,
    face_fail_policy, location_fail_policy, liveness_required)
  values (v_org, v_tz, 'PHP', 'semimonthly', 1.25, case when p_key = 'harbor' then time '07:00' else time '08:00' end,
    'block', 'flag', true);
  insert into public.org_features (org_id, feature, enabled)
    select v_org, f, case
      when f = 'face_verification' then p_face
      when f = 'output_tracking' then p_output
      else true end
    from unnest(enum_range(null::public.feature_key)) f;

  insert into public.roles (org_id, name, scope, is_owner) values (v_org, 'Owner', 'all', true) returning id into v_owner_role;
  insert into public.roles (org_id, name, scope) values (v_org, case when p_key = 'harbor' then 'Shift lead' else 'Team leader' end, 'team')
    returning id into v_manager_role;
  insert into public.roles (org_id, name, scope) values (v_org, case when p_key = 'harbor' then 'Barista' else 'Field staff' end, 'own')
    returning id into v_employee_role;
  insert into public.role_permissions select v_owner_role, p from unnest(enum_range(null::public.app_permission)) p;
  insert into public.role_permissions (role_id, permission) values
    (v_manager_role, 'time.clock'), (v_manager_role, 'time.edit'), (v_manager_role, 'requests.review'),
    (v_manager_role, 'schedule.manage'), (v_manager_role, 'analytics.view'), (v_manager_role, 'face.enroll_others'),
    (v_employee_role, 'time.clock'), (v_employee_role, 'analytics.view');

  -- Sites and geofences (made-up businesses at public landmarks' approximate coordinates).
  if p_key = 'harbor' then
    insert into public.sites (org_id, name, address) values
      (v_org, 'Makati branch', 'Sample address, Makati'), (v_org, 'Taguig branch', 'Sample address, Taguig');
    select array_agg(id order by name) into v_sites from public.sites where org_id = v_org;
    insert into public.geofences (site_id, kind, center, radius_m, area) values
      (v_sites[1], 'circle', extensions.st_setsrid(extensions.st_makepoint(121.0244, 14.5547), 4326)::extensions.geography, 80,
       extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(121.0244, 14.5547), 4326)::extensions.geography, 80)::extensions.geography),
      (v_sites[2], 'circle', extensions.st_setsrid(extensions.st_makepoint(121.0503, 14.5509), 4326)::extensions.geography, 80,
       extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(121.0503, 14.5509), 4326)::extensions.geography, 80)::extensions.geography);
    v_names := array['Mara Villanueva', 'Joel Santiago', 'Tess Aquino', 'Rafa Domingo', 'Ina Castillo', 'Paolo Ramos',
                     'Liza Navarro', 'Dino Mercado', 'Kaye Soriano', 'Arnel Bautista', 'Bea Lorenzo', 'Gabby Torres'];
  else
    insert into public.sites (org_id, name, address) values
      (v_org, 'Pasig hub', 'Sample address, Pasig'), (v_org, 'Valenzuela warehouse', 'Sample address, Valenzuela');
    select array_agg(id order by name) into v_sites from public.sites where org_id = v_org;
    insert into public.geofences (site_id, kind, center, radius_m, area) values
      (v_sites[1], 'circle', extensions.st_setsrid(extensions.st_makepoint(121.0851, 14.5764), 4326)::extensions.geography, 120,
       extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(121.0851, 14.5764), 4326)::extensions.geography, 120)::extensions.geography),
      (v_sites[2], 'polygon', null, null,
       extensions.st_geogfromtext('SRID=4326;POLYGON((120.9790 14.6990, 120.9815 14.6990, 120.9815 14.7010, 120.9790 14.7010, 120.9790 14.6990))'));
    v_names := array['Nestor Galang', 'Cris Valdez', 'Rhea Manalo', 'Jun Pascual', 'Lorna Dizon', 'Edgar Salazar',
                     'Mylene Cruz', 'Ronnie Yap', 'Aileen Fajardo', 'Teddy Ocampo', 'Grace Lim', 'Bong Estrada'];
  end if;

  -- People: owner, manager, then employees reporting to the manager. Names are invented; codes mark them as samples.
  for i in 1 .. 12 loop
    m := private.demo_user(p_key || '-person-' || i,
      case i when 1 then 'owner.' || p_key || '@crewbase.example'
             when 2 then 'manager.' || p_key || '@crewbase.example'
             when 3 then 'employee.' || p_key || '@crewbase.example'
             else 'sample' || i || '.' || p_key || '@crewbase.example' end,
      case when i <= 3 then 'crewbase-demo' end);
    insert into public.memberships (id, org_id, user_id, display_name, employee_code, role_id, manager_id, employment_type, status, hired_on)
    values (private.demo_uuid(p_key || '-member-' || i), v_org, m, v_names[i], 'SAMPLE-' || lpad(i::text, 3, '0'),
      case i when 1 then v_owner_role when 2 then v_manager_role else v_employee_role end,
      case when i = 1 then null when i = 2 then private.demo_uuid(p_key || '-member-1') else private.demo_uuid(p_key || '-member-2') end,
      (case when i in (11, 12) then 'provisional' else 'regular' end)::public.employment_type, 'active', v_today - (30 * i + 200))
    returning id into m;
    v_members := v_members || m;
    insert into public.member_sites select m, s from unnest(v_sites) s;
    insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from)
    values (v_org, m, p_basis,
      case when p_basis = 'hourly' then 9000 + (i % 4) * 1000 + case when i <= 2 then 4000 else 0 end
           else 61000 + (i % 5) * 2000 + case when i <= 2 then 25000 else 0 end end,
      v_today - 400);
  end loop;
  v_owner := v_members[1];
  v_manager := v_members[2];

  -- A raise for one person three weeks ago, so payslips show a mid-period rate change somewhere.
  insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from)
  select v_org, v_members[4], basis, amount_minor + case when p_basis = 'hourly' then 1000 else 4000 end, v_today - 21
  from public.pay_rates where membership_id = v_members[4] limit 1;

  -- Sample deduction rules, clearly labelled as illustrative rates.
  insert into public.deduction_rules (org_id, name, kind, value, is_sample) values
    (v_org, 'Social security', 'percent', 4.5, true),
    (v_org, 'Health insurance', 'percent', 2.5, true),
    (v_org, 'Housing fund', 'fixed', 20000, true);
  insert into public.deduction_rules (org_id, name, kind, brackets, is_sample) values
    (v_org, 'Withholding tax', 'bracket',
     '[{"up_to_minor": 1041700, "rate_percent": 0}, {"up_to_minor": 1666700, "rate_percent": 15}, {"up_to_minor": null, "rate_percent": 20, "fixed_minor": 93750}]', true);

  -- Eight weeks of shifts and time, plus two weeks of upcoming shifts.
  for i in 1 .. 12 loop
    m := v_members[i];
    v_late_bias := case when i in (5, 9) then 18 when i in (7) then 9 else 2 end;   -- a few habitually late people
    for d in select gs::date from generate_series(v_today - 56, v_today + 14, interval '1 day') gs loop
      continue when extract(isodow from d) = 7;                                       -- closed Sundays
      continue when extract(isodow from d) = 6 and (p_key <> 'harbor' or i % 2 = 0); -- café: half work Saturdays
      continue when (i + extract(doy from d)::int) % 11 = 0;                           -- rest days
      v_site := v_sites[1 + (i % 2)];
      v_shift_start := case when p_key = 'harbor' then case when i % 3 = 0 then time '11:00' else time '07:00' end else time '08:00' end;
      insert into public.shifts (org_id, membership_id, site_id, starts_at, ends_at)
      values (v_org, m, v_site, (d + v_shift_start) at time zone v_tz, (d + v_shift_start + interval '9 hours') at time zone v_tz);

      continue when d > v_today;
      continue when random() < 0.05;                                                   -- absent on 5% of shifts

      v_in := ((d + v_shift_start) at time zone v_tz)
        + make_interval(mins => greatest(-15, round(v_late_bias * random() * 2 - 8 + random() * 6))::int);
      v_break := case when random() < 0.8 then 60 else 30 end;
      v_out := v_in + make_interval(mins => v_break + 480 + case when p_key = 'harbor' then round(random() * 40 - 15)::int
                                                                 else round(random() * 150 - 10)::int end);
      v_flag := random() < 0.04;

      if d = v_today then
        -- Today: people already in are working or on a break; nobody has timed out yet unless their shift ended.
        continue when (d + v_shift_start) at time zone v_tz > now() or v_in > now() or random() < 0.15;
        if v_out <= now() then
          null;  -- treat as a normal closed day below
        else
          insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, status, flagged)
          values (v_org, m, v_site, d, v_in, (case when i % 4 = 0 and v_in + interval '4 hours' < now() then 'on_break' else 'working' end)::public.entry_status, v_flag)
          returning id into v_entry;
          if i % 4 = 0 and v_in + interval '4 hours' < now() then
            insert into public.breaks (entry_id, break_start) values (v_entry, v_in + interval '4 hours');
          end if;
          insert into public.clock_events (org_id, membership_id, entry_id, site_id, kind, server_time, accepted, flagged, reason,
            location, accuracy_m, reading_age_s, inside_fence, location_result, face_result, liveness_passed, face_similarity)
          select v_org, m, v_entry, v_site, 'in', v_in, true, v_flag, case when v_flag then 'outside the site' end,
            extensions.st_setsrid(extensions.st_makepoint(
              extensions.st_x(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.0004,
              extensions.st_y(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.0004), 4326)::extensions.geography,
            8 + random() * 20, random() * 5, not v_flag, case when v_flag then 'outside the site' else 'pass' end,
            case when p_face then 'pass' end, case when p_face then true end, case when p_face then 0.78 + random() * 0.15 end
          from public.geofences g where g.site_id = v_site limit 1;
          continue;
        end if;
      end if;

      if random() < 0.012 and d < v_today then
        -- A forgotten time out: counts 0 hours until corrected.
        insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes, break_minutes)
        values (v_org, m, v_site, d, v_in, v_in, 'missing_out', 0, 0);
        continue;
      end if;

      insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes, flagged)
      values (v_org, m, v_site, d, v_in, v_out, 'closed', v_break,
        floor(extract(epoch from (v_out - v_in)) / 60)::int - v_break, v_flag)
      returning id into v_entry;
      insert into public.breaks (entry_id, break_start, break_end)
      values (v_entry, v_in + interval '4 hours', v_in + interval '4 hours' + make_interval(mins => v_break));
      insert into public.clock_events (org_id, membership_id, entry_id, site_id, kind, server_time, accepted, flagged, reason,
        location, accuracy_m, reading_age_s, inside_fence, location_result, face_result, liveness_passed, face_similarity)
      select v_org, m, v_entry, v_site, k, t, true, v_flag and k = 'in', case when v_flag and k = 'in' then 'outside the site' end,
        extensions.st_setsrid(extensions.st_makepoint(
          extensions.st_x(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.0004,
          extensions.st_y(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.0004), 4326)::extensions.geography,
        8 + random() * 20, random() * 5, not (v_flag and k = 'in'), case when v_flag and k = 'in' then 'outside the site' else 'pass' end,
        case when p_face then 'pass' end, case when p_face then true end, case when p_face then 0.78 + random() * 0.15 end
      from public.geofences g, (values ('in'::public.punch_kind, v_in), ('out'::public.punch_kind, v_out)) as ev(k, t)
      where g.site_id = v_site
      limit 2;

      if p_output then
        insert into public.output_records (org_id, membership_id, work_date, metric, quantity)
        values (v_org, m, d, 'Parcels sorted', round((140 + random() * 80 - case when i in (11, 12) then 30 else 0 end)::numeric, 0));
      end if;
    end loop;
  end loop;

  -- A few blocked attempts (failed face or location checks) for the analytics.
  insert into public.clock_events (org_id, membership_id, site_id, kind, server_time, accepted, reason, location_result, face_result)
  select v_org, v_members[1 + (n % 12)], v_sites[1], 'in', now() - make_interval(days => n * 3), false,
    case when p_face and n % 2 = 0 then 'face does not match' else 'location not accurate enough' end,
    case when p_face and n % 2 = 0 then 'pass' else 'location not accurate enough' end,
    case when p_face and n % 2 = 0 then 'face does not match' end
  from generate_series(1, 6) n;

  if p_output then
    insert into public.output_targets (org_id, metric, employment_type, per_month) values
      (v_org, 'Parcels sorted', 'regular', 3800), (v_org, 'Parcels sorted', 'provisional', 3200);
  end if;

  -- Correction requests: three pending, two decided.
  insert into public.correction_requests (org_id, membership_id, entry_id, kind, work_date, old_clock_in, old_clock_out, old_break_minutes,
    requested_in, requested_out, requested_break_minutes, site_id, reason, status, created_at)
  select v_org, e.membership_id, e.id, 'change_times', e.work_date, e.clock_in, e.clock_out, e.break_minutes,
    e.clock_in - interval '20 minutes', e.clock_out, e.break_minutes, e.site_id,
    (array['Started early to receive a delivery', 'Opened the store before my shift', 'Phone clock-in failed at the door'])[row_number() over ()],
    'pending', now() - interval '1 day'
  from public.time_entries e
  where e.org_id = v_org and e.status = 'closed' and e.work_date between v_today - 5 and v_today - 1
    and e.membership_id in (v_members[4], v_members[6], v_members[8])
  order by e.work_date desc limit 3;
  insert into public.correction_requests (org_id, membership_id, entry_id, kind, work_date, old_clock_in, old_clock_out, old_break_minutes,
    requested_out, requested_in, site_id, reason, status)
  select v_org, e.membership_id, e.id, 'missing_time_out', e.work_date, e.clock_in, null, 0,
    (e.work_date + time '17:00') at time zone v_tz, e.clock_in, e.site_id, 'Forgot to time out after closing', 'pending'
  from public.time_entries e where e.org_id = v_org and e.status = 'missing_out' and e.work_date >= v_today - 14
  order by e.work_date desc limit 1;

  -- Pay periods: the last complete half-month finalized with payslips, the current one open.
  v_end_a := case when extract(day from v_today) > 15 then date_trunc('month', v_today)::date + 14
                  else (date_trunc('month', v_today) - interval '1 day')::date end;
  v_start_a := case when extract(day from v_end_a) = 15 then date_trunc('month', v_end_a)::date else date_trunc('month', v_end_a)::date + 15 end;
  insert into public.pay_periods (org_id, starts_on, ends_on) values (v_org, v_start_a, v_end_a) returning id into v_period_a;
  insert into public.pay_periods (org_id, starts_on, ends_on) values (v_org, v_end_a + 1,
    case when extract(day from v_end_a + 1) = 1 then (v_end_a + 1) + 14 else (date_trunc('month', v_end_a + 1) + interval '1 month - 1 day')::date end)
  returning id into v_period_b;

  -- Decided requests inside the finalized period must exist before it locks.
  update public.correction_requests set status = 'approved', reviewed_by = v_manager, reviewed_at = now() - interval '2 days'
  where org_id = v_org and status = 'pending' and work_date between v_start_a and v_end_a;

  insert into public.timesheet_approvals (period_id, membership_id, approved_by, approved_at)
  select v_period_a, mm, v_manager, now() - interval '3 days' from private.period_members(v_period_a) mm;
  update public.pay_periods set status = 'locked', locked_by = v_owner, locked_at = now() - interval '2 days' where id = v_period_a;
  perform private.build_payslip(v_period_a, mm) from private.period_members(v_period_a) mm;
  update public.payslips set status = 'final' where period_id = v_period_a;
  update public.pay_periods set status = 'finalized', finalized_by = v_owner, finalized_at = now() - interval '2 days' where id = v_period_a;

  return v_org;
end $$;

create function private.seed_demo()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.seeding', 'on', true);
  perform private.seed_demo_business('harbor', 'Harbor Lane Café', '#b45309', 'hourly', false, false);
  perform private.seed_demo_business('northgate', 'Northgate Logistics', '#0f766e', 'daily', true, true);
  perform set_config('app.seeding', 'off', true);
end $$;

-- Deletes the demo businesses (and only those) and builds them again. Demo sign-ins are kept.
create function private.reset_demo_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.face_enrollments f using public.memberships m, public.organizations o
  where f.membership_id = m.id and m.org_id = o.id and o.is_demo;
  delete from public.organizations where is_demo;
  perform private.seed_demo();
end $$;

revoke execute on function private.seed_demo, private.reset_demo_data, private.seed_demo_business,
  private.demo_user from public, authenticated;

select cron.schedule('reset-demo-data', '0 19 * * *', 'select private.reset_demo_data()');   -- 03:00 in Manila
-- Visitor face enrollments in demo businesses expire after 24 hours; clear them hourly.
select cron.schedule('expire-demo-faces', '5 * * * *', 'delete from public.face_enrollments where expires_at < now()');
