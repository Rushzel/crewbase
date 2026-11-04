-- The demo business: a made-up company whose field agents sell packages door to door,
-- organised the way JedSkies organised field teams. Every person and customer is invented.
--
--   Owner, General Manager, HR Manager, Operations Manager
--   3 areas, each with a team leader and 3 agents; 2 agents not yet assigned to an area
--   Man-days pay (daily rate, no shifts), Monday to Saturday, start 9:00, absent after 10:00
--   Customer applications at every stage, leave, corrections, a finalized pay period

create function private.seed_demo_company()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.demo_uuid('demo-org');
  v_tz text := 'Asia/Manila';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_owner_role uuid; v_role uuid;
  v_roles jsonb := '{}';
  tpl record;
  v_areas uuid[];
  v_area_names text[] := array['Pasig East', 'Marikina', 'Cainta'];
  -- Polygons around made-up territories (longitude latitude, closed rings).
  v_shapes text[] := array[
    'POLYGON((121.0790 14.5700, 121.0960 14.5690, 121.1000 14.5820, 121.0880 14.5890, 121.0770 14.5810, 121.0790 14.5700))',
    'POLYGON((121.0900 14.6300, 121.1100 14.6280, 121.1150 14.6450, 121.0980 14.6520, 121.0880 14.6420, 121.0900 14.6300))',
    'POLYGON((121.1080 14.5680, 121.1270 14.5660, 121.1300 14.5830, 121.1150 14.5900, 121.1060 14.5800, 121.1080 14.5680))'];
  v_names text[] := array[
    'Celia Ramirez', 'Victor Agustin', 'Nora Palma', 'Ramon de Vera',            -- owner, general manager, HR, operations
    'Lito Ferrer', 'Jen Manzano', 'Oscar Tolentino',                            -- team leaders
    'Abby Cruzado', 'Mark Ilagan', 'Toni Reyes', 'Kris Dela Paz', 'Ely Sarmiento', 'Rina Gatdula',
    'Benjie Salonga', 'Pam Quiambao', 'Noel Arceo', 'Shiela Bernal', 'Dom Pangilinan'];
  v_titles text[] := array['Owner', 'General Manager', 'HR Manager', 'Operations Manager',
    'Team Leader', 'Team Leader', 'Team Leader', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff', 'Staff'];
  -- People with a demo sign-in (role key used in the email), by position.
  v_logins text[] := array['owner', 'general-manager', 'hr', 'operations', 'team-leader', null, null, 'staff'];
  v_m uuid[] := '{}';
  v_ops uuid;
  v_customers text[] := array['Andrea', 'Bernard', 'Carmina', 'Danilo', 'Erika', 'Ferdie', 'Gemma', 'Hector', 'Iris', 'Jomar',
    'Karla', 'Leo', 'Minda', 'Nilo', 'Ofelia', 'Percy', 'Queenie', 'Rolly', 'Sandra', 'Tomas'];
  v_surnames text[] := array['Abad', 'Basa', 'Carpio', 'Dimaculangan', 'Espiritu', 'Florido', 'Garces', 'Hilario', 'Ignacio', 'Jacinto'];
  v_products uuid[];
  m uuid; d date; i int; n int := 0; k int;
  v_area int; v_in timestamptz; v_out timestamptz; v_minutes int; v_entry uuid; v_bias float8;
  v_created timestamptz; v_prod uuid; p public.products; v_status public.application_status; v_age float8; v_roll float8;
  v_period_a uuid; v_start_a date; v_end_a date;
begin
  perform setseed(0.33);

  insert into public.organizations (id, slug, name, brand_color, is_demo)
  values (v_org, 'demo-company', 'Demo Company', '#0f766e', true);
  insert into public.org_settings (org_id, timezone, currency, pay_frequency, overtime_multiplier, default_start_time, grace_minutes,
    earliest_clock_in, absent_after_minutes, full_day_minutes, half_day_minutes, face_fail_policy, location_fail_policy,
    liveness_required, location_mode, area_label, area_label_plural, follow_up_hours, probation_months)
  values (v_org, v_tz, 'PHP', 'semimonthly', 1.25, '09:00', 15, '05:00', 60, 360, 240, 'block', 'flag',
    true, 'balanced', 'Area', 'Areas', 72, 6);
  insert into public.org_features (org_id, feature, enabled)
    select v_org, f, f not in ('output_tracking', 'scheduling') from unnest(enum_range(null::public.feature_key)) f;

  insert into public.roles (org_id, name, scope, is_owner) values (v_org, 'Owner', 'all', true) returning id into v_owner_role;
  insert into public.role_permissions select v_owner_role, p2 from unnest(enum_range(null::public.app_permission)) p2;
  v_roles := jsonb_build_object('Owner', v_owner_role);
  for tpl in select * from private.role_template('field') loop
    insert into public.roles (org_id, name, scope) values (v_org, tpl.name, tpl.scope) returning id into v_role;
    insert into public.role_permissions (role_id, permission) select v_role, unnest(tpl.permissions);
    v_roles := v_roles || jsonb_build_object(tpl.name, v_role);
  end loop;

  for i in 1 .. 3 loop
    insert into public.sites (org_id, name, address) values (v_org, v_area_names[i], 'Sample territory, ' || v_area_names[i])
    returning id into m;
    v_areas := v_areas || m;
    insert into public.geofences (site_id, kind, area)
    values (m, 'polygon', extensions.st_geogfromtext('SRID=4326;' || v_shapes[i]));
  end loop;

  -- People. Managers report up the chain; agents report to their area's team leader.
  for i in 1 .. 18 loop
    m := private.demo_user('demo-person-' || i,
      coalesce(v_logins[i], 'sample' || i) || '@demo.crewbase.example',
      case when v_logins[i] is not null then 'crewbase-demo' end);
    v_area := case when i between 5 and 7 then i - 4 when i between 8 and 16 then 1 + (i - 8) / 3 end;
    insert into public.memberships (id, org_id, user_id, display_name, employee_code, role_id, manager_id, employment_type, status, hired_on)
    values (private.demo_uuid('demo-member-' || i), v_org, m, v_names[i], 'SAMPLE-' || lpad(i::text, 3, '0'),
      (v_roles ->> v_titles[i])::uuid,
      case when i = 1 then null when i in (2, 3) then private.demo_uuid('demo-member-1')
           when i = 4 then private.demo_uuid('demo-member-2') when i between 5 and 7 then private.demo_uuid('demo-member-4')
           when i between 8 and 16 then private.demo_uuid('demo-member-' || (4 + v_area)) else private.demo_uuid('demo-member-4') end,
      (case when i in (15, 16, 18) then 'provisional' else 'regular' end)::public.employment_type, 'active',
      case when i in (15, 16) then v_today - 120 when i = 18 then v_today - 45 else v_today - (60 * i + 240) end)
    returning id into m;
    v_m := v_m || m;
    if v_area is not null then
      insert into public.member_sites (membership_id, site_id, is_leader) values (m, v_areas[v_area], i between 5 and 7);
    end if;
    if i >= 5 then
      insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from)
      values (v_org, m, 'daily', case when i <= 7 then 80000 else 64500 end, v_today - 400);
    end if;
  end loop;
  v_ops := v_m[4];

  insert into public.deduction_rules (org_id, name, kind, value, is_sample) values
    (v_org, 'Social security', 'percent', 4.5, true), (v_org, 'Health insurance', 'percent', 2.5, true),
    (v_org, 'Housing fund', 'fixed', 20000, true);

  insert into public.products (org_id, name, description, price_minor, incentive_minor, needs_verification, auto_approve, sort) values
    (v_org, 'Starter package', 'Equipment and installation', 4500000, 150000, true, false, 1),
    (v_org, 'Upgrade add-on', 'Add-on for an existing package', 2800000, 80000, true, false, 2),
    (v_org, 'Basic package', 'Entry-level package, approved once the customer confirms', 350000, 15000, true, true, 3),
    (v_org, 'Consultation booking', 'Free consultation, paid to the agent as a lead', 0, 10000, false, false, 4);
  select array_agg(id order by sort) into v_products from public.products where org_id = v_org;

  -- Leave first, so nobody has time on a day they were on leave.
  insert into public.leave_requests (org_id, membership_id, leave_type_id, starts_on, ends_on, days, reason, status, reviewed_by, review_note, reviewed_at)
  select v_org, v_m[x.i], lt.id, x.d_from, x.d_to, private.working_days(v_org, x.d_from, x.d_to), x.reason, x.st::public.leave_status,
    case when x.st <> 'pending' then v_m[3] end, x.note, case when x.st <> 'pending' then now() - interval '2 days' end
  from (values
      (9,  'Sick',      private.next_workday(v_org, v_today - 10), private.next_workday(v_org, v_today - 10), 'Fever', 'approved', null),
      (12, 'Vacation',  private.next_workday(v_org, v_today - 20), private.next_workday(v_org, v_today - 19), 'Town fiesta', 'approved', 'Noted'),
      (14, 'Emergency', private.next_workday(v_org, v_today - 6),  private.next_workday(v_org, v_today - 6),  'Flooded street at home', 'approved', null),
      (11, 'Vacation',  private.next_workday(v_org, v_today - 30), private.next_workday(v_org, v_today - 30), 'Errands', 'rejected', 'Area launch day, everyone needed'),
      (10, 'Sick',      private.next_workday(v_org, v_today + 3),  private.next_workday(v_org, v_today + 3),  'Medical check-up', 'pending', null),
      (13, 'Vacation',  private.next_workday(v_org, v_today + 9),  private.next_workday(v_org, v_today + 10), 'Family visit', 'pending', null)
    ) x (i, type, d_from, d_to, reason, st, note)
  join public.leave_types lt on lt.org_id = v_org and lt.name = x.type;

  -- Eight weeks of time for team leaders and agents, Monday to Saturday, and their sales.
  for i in 5 .. 18 loop
    m := v_m[i];
    v_area := coalesce(case when i between 5 and 7 then i - 4 when i between 8 and 16 then 1 + (i - 8) / 3 end, 1 + i % 3);
    v_bias := case when i in (9, 13) then 28 when i = 17 then 12 else 0 end;   -- two habitually late agents, one sometimes
    for d in select gs::date from generate_series(v_today - 56, v_today, interval '1 day') gs loop
      continue when extract(isodow from d) = 7;
      continue when exists (select 1 from public.leave_requests lr where lr.membership_id = m and lr.status = 'approved' and d between lr.starts_on and lr.ends_on);
      continue when random() < case when i = 17 then 0.09 else 0.035 end;     -- absent

      v_in := ((d + time '09:00') at time zone v_tz) + make_interval(mins => round(random() * 30 - 22 + v_bias * random() * 1.6)::int);
      v_minutes := case when random() < 0.03 then 250 + round(random() * 60)::int else 480 + round(random() * 70 - 10)::int end;
      v_out := v_in + make_interval(mins => v_minutes + 60);

      if d = v_today then
        continue when v_in > now();
        if v_out > now() then
          insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, status)
          values (v_org, m, v_areas[v_area], d, v_in, 'working') returning id into v_entry;
          perform private.seed_punch(v_org, m, v_entry, v_areas[v_area], 'in', v_in);
          continue;
        end if;
      end if;

      insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes)
      values (v_org, m, v_areas[v_area], d, v_in, v_out, 'closed', 60, v_minutes) returning id into v_entry;
      insert into public.breaks (entry_id, break_start, break_end) values (v_entry, v_in + interval '3 hours', v_in + interval '4 hours');
      perform private.seed_punch(v_org, m, v_entry, v_areas[v_area], 'in', v_in);
      perform private.seed_punch(v_org, m, v_entry, v_areas[v_area], 'out', v_out);

      -- Sales: agents most days, team leaders now and then.
      for k in 1 .. 2 loop
        continue when random() > case when i <= 7 then 0.08 when k = 1 then 0.42 else 0.12 end;
        n := n + 1;
        v_roll := random();
        v_prod := v_products[case when v_roll < 0.35 then 1 when v_roll < 0.5 then 2 when v_roll < 0.8 then 3 else 4 end];
        select * into p from public.products where id = v_prod;
        v_created := v_in + make_interval(mins => 60 + round(random() * 360)::int);
        continue when v_created > now();
        v_age := extract(epoch from (now() - v_created)) / 86400;
        v_roll := random();
        v_status := case
          when v_roll < 0.05 then 'cancelled'
          when not p.needs_verification then case when v_age > 2 then 'approved' else 'for_approval' end
          when v_age <= 3 then case when v_roll < 0.45 then 'awaiting_verification' when p.auto_approve then 'approved' else 'for_approval' end
          when v_roll < 0.15 then 'follow_up'
          when p.auto_approve then 'approved'
          when v_roll < 0.22 then 'rejected'
          when v_roll < 0.28 and v_age < 6 then 'for_approval'
          else 'approved' end;
        insert into public.customer_applications (org_id, membership_id, site_id, product_id, customer_name, customer_email, customer_phone,
          address, status, price_minor, incentive_minor, token_hash, token_expires_at, verification_sent_at, verified_at,
          decided_by, decided_at, decision_note, created_at)
        values (v_org, m, v_areas[v_area], p.id,
          v_customers[1 + n % 20] || ' ' || v_surnames[1 + (n / 20) % 10],
          lower(v_customers[1 + n % 20] || '.' || v_surnames[1 + (n / 20) % 10]) || n || '@example.test',
          '0917 555 ' || lpad((n % 10000)::text, 4, '0'),
          'Sample street ' || (1 + n % 90) || ', ' || v_area_names[v_area],
          v_status, p.price_minor,
          case when v_status = 'approved' then p.incentive_minor else 0 end,
          case when v_status in ('awaiting_verification', 'follow_up') then encode(extensions.digest('demo-' || n || '-' || random(), 'sha256'), 'hex') end,
          case when v_status in ('awaiting_verification', 'follow_up') then v_created + interval '7 days' end,
          case when p.needs_verification then v_created end,
          case when v_status in ('for_approval', 'approved', 'rejected') and p.needs_verification then v_created + interval '5 hours' end,
          case when v_status = 'rejected' or (v_status = 'approved' and not p.auto_approve) then v_ops end,
          case when v_status in ('approved', 'rejected') then least(v_created + interval '1 day' + make_interval(hours => round(random() * 30)::int), now()) end,
          case when v_status = 'rejected' then 'Customer is outside our service area'
               when v_status = 'cancelled' then 'Customer changed their mind'
               when v_status = 'approved' and p.auto_approve then 'Approved automatically after the customer confirmed' end,
          v_created);
      end loop;
    end loop;
  end loop;

  -- A few blocked attempts: a failed face check and readings from outside the area.
  insert into public.clock_events (org_id, membership_id, site_id, kind, server_time, accepted, reason, location_result, face_result)
  select v_org, v_m[8 + (x % 9)], v_areas[1 + x % 3], 'in', now() - make_interval(days => x * 4, hours => 2), false,
    case when x % 3 = 0 then 'face does not match' else 'outside the site' end,
    case when x % 3 = 0 then 'pass' else 'outside the site' end,
    case when x % 3 = 0 then 'face does not match' else 'pass' end
  from generate_series(1, 7) x;

  -- Corrections: two waiting for a decision.
  insert into public.correction_requests (org_id, membership_id, entry_id, kind, work_date, old_clock_in, old_clock_out, old_break_minutes,
    requested_in, requested_out, requested_break_minutes, site_id, reason, status, created_at)
  select v_org, e.membership_id, e.id, 'change_times', e.work_date, e.clock_in, e.clock_out, e.break_minutes,
    (e.work_date + time '08:50') at time zone v_tz, e.clock_out, e.break_minutes, e.site_id,
    'Arrived on time but had no signal at the meeting point', 'pending', now() - interval '20 hours'
  from public.time_entries e
  where e.org_id = v_org and e.status = 'closed' and e.work_date between v_today - 4 and v_today - 1
    and e.membership_id in (v_m[9], v_m[13]) and e.clock_in > (e.work_date + time '09:15') at time zone v_tz
  order by e.work_date desc limit 2;

  -- Pay: the last complete half-month finalized with payslips, the current one open.
  v_end_a := case when extract(day from v_today) > 15 then date_trunc('month', v_today)::date + 14
                  else (date_trunc('month', v_today) - interval '1 day')::date end;
  v_start_a := case when extract(day from v_end_a) = 15 then date_trunc('month', v_end_a)::date else date_trunc('month', v_end_a)::date + 15 end;
  insert into public.pay_periods (org_id, starts_on, ends_on) values (v_org, v_start_a, v_end_a) returning id into v_period_a;
  insert into public.pay_periods (org_id, starts_on, ends_on) values (v_org, v_end_a + 1,
    case when extract(day from v_end_a + 1) = 1 then (v_end_a + 1) + 14 else (date_trunc('month', v_end_a + 1) + interval '1 month - 1 day')::date end);
  insert into public.timesheet_approvals (period_id, membership_id, approved_by, approved_at)
  select v_period_a, mm, v_ops, now() - interval '3 days' from private.period_members(v_period_a) mm where mm <> v_ops;
  update public.pay_periods set status = 'locked', locked_by = v_m[1], locked_at = now() - interval '2 days' where id = v_period_a;
  perform private.build_payslip(v_period_a, mm) from private.period_members(v_period_a) mm;
  update public.payslips set status = 'final' where period_id = v_period_a;
  update public.pay_periods set status = 'finalized', finalized_by = v_m[1], finalized_at = now() - interval '2 days' where id = v_period_a;

  return v_org;
end $$;

-- The first working day on or after a date.
create function private.next_workday(p_org uuid, p_day date)
returns date language sql stable security definer set search_path = '' as $$
  select min(d)::date from generate_series(p_day, p_day + 7, interval '1 day') d
  join public.org_settings os on os.org_id = p_org
  where extract(dow from d)::smallint = any (os.work_days)
$$;

-- An accepted punch inside the area, as the app would have recorded it.
create function private.seed_punch(p_org uuid, p_member uuid, p_entry uuid, p_site uuid, p_kind public.punch_kind, p_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.clock_events (org_id, membership_id, entry_id, site_id, kind, server_time, accepted, flagged,
    location, accuracy_m, reading_age_s, inside_fence, location_result, face_result, liveness_passed, face_similarity)
  select p_org, p_member, p_entry, p_site, p_kind, p_at, true, false,
    extensions.st_setsrid(extensions.st_makepoint(
      extensions.st_x(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.004,
      extensions.st_y(extensions.st_centroid(g.area::extensions.geometry)) + (random() - 0.5) * 0.004), 4326)::extensions.geography,
    6 + random() * 18, random() * 4, true, 'pass', 'pass', true, 0.76 + random() * 0.16
  from public.geofences g where g.site_id = p_site limit 1
$$;

revoke execute on function private.seed_demo_company, private.next_workday, private.seed_punch from public, authenticated;
