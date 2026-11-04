-- Sites, geofences and the location check used by every punch.

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  address text,
  timezone text,
  active boolean not null default true,
  unique (org_id, name),
  unique (id, org_id)
);

-- A circle is stored with its centre and radius and also as a polygon, so one check covers both kinds.
create table public.geofences (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  kind text not null check (kind in ('circle', 'polygon')),
  area extensions.geography(polygon, 4326) not null,
  center extensions.geography(point, 4326),
  radius_m numeric(7, 1) check (radius_m is null or radius_m between 10 and 5000),
  check ((kind = 'circle') = (center is not null and radius_m is not null))
);
create index geofences_area_idx on public.geofences using gist (area);

-- Who works in which area, and who leads it. org_id is filled from the site by a trigger;
-- the two composite keys then guarantee the person and the area belong to the same business.
create table public.member_sites (
  membership_id uuid not null,
  site_id uuid not null,
  is_leader boolean not null default false,
  org_id uuid not null,
  primary key (membership_id, site_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (site_id, org_id) references public.sites (id, org_id) on delete cascade
);
create index member_sites_site_idx on public.member_sites (site_id) include (membership_id, is_leader);

create function private.fill_member_site_org()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.org_id := (select org_id from public.sites where id = new.site_id);
  return new;
end $$;
create trigger fill_org before insert or update of site_id on public.member_sites
  for each row execute function private.fill_member_site_org();

------------------------------------------------------------------------------
-- Who may see whose records.
------------------------------------------------------------------------------

-- The memberships whose records the caller may see, across every business they belong to:
--   themself;
--   everyone in the business (scope all);
--   people whose manager chain leads to them, and people in the areas they lead (scope team).
-- Policies use `membership_id in (select private.visible_members())`. The subquery doesn't depend
-- on the row, so it runs once per query; the old per-row check walked the manager chain for every row.
create function private.visible_members()
returns setof uuid language sql stable security definer set search_path = '' as $$
  with recursive me as (
    select m.id, m.org_id, r.scope
    from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.status = 'active'
  ),
  reports as (
    select m.id, 1 as depth
    from public.memberships m join me on me.scope = 'team' and m.manager_id = me.id
    union
    select m.id, r.depth + 1
    from public.memberships m join reports r on m.manager_id = r.id
    where r.depth < 50
  )
  select me.id from me
  union
  select m.id from public.memberships m join me on me.scope = 'all' and m.org_id = me.org_id
  union
  select reports.id from reports
  union
  select ms.membership_id
  from public.member_sites led
  join me on me.scope = 'team' and led.membership_id = me.id and led.is_leader
  join public.member_sites ms on ms.site_id = led.site_id
$$;

create function private.can_see_member(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.visible_members() v where v = p_member)
$$;

-- True when the caller has a permission and may see the member (used for edits).
create function private.can_act_on_member(p_member uuid, p_permission public.app_permission)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_see_member(p_member)
     and private.has_permission((select org_id from public.memberships where id = p_member), p_permission)
$$;

grant execute on function private.visible_members(), private.can_see_member(uuid),
  private.can_act_on_member(uuid, public.app_permission) to authenticated;

create function private.site_timezone(p_site uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(s.timezone, os.timezone)
  from public.sites s join public.org_settings os on os.org_id = s.org_id
  where s.id = p_site
$$;

-- Circles: build the polygon from centre and radius (64 segments is accurate to well under a metre at these sizes).
create function private.fill_circle()
returns trigger language plpgsql as $$
begin
  if new.kind = 'circle' then
    new.area := extensions.st_buffer(new.center, new.radius_m::float8, 'quad_segs=16')::extensions.geography;
  end if;
  return new;
end $$;

create trigger geofences_fill_circle before insert or update on public.geofences
  for each row execute function private.fill_circle();

-- Add or replace a site's geofences (sites.manage only).
create function public.add_circle_geofence(p_site uuid, p_lat float8, p_lng float8, p_radius_m numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_permission((select org_id from public.sites where id = p_site), 'sites.manage');
  insert into public.geofences (site_id, kind, center, radius_m, area)
  values (p_site, 'circle',
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, p_radius_m,
          -- placeholder, replaced by the trigger
          extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, 10)::extensions.geography)
  returning id into v_id;
  return v_id;
end $$;

-- p_points is a JSON array of [lat, lng] pairs, the order a map editor produces.
create function public.add_polygon_geofence(p_site uuid, p_points jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_wkt text;
begin
  perform private.require_permission((select org_id from public.sites where id = p_site), 'sites.manage');
  if jsonb_array_length(p_points) < 3 then
    raise exception 'A polygon needs at least 3 points' using errcode = '22023';
  end if;
  select string_agg(format('%s %s', p ->> 1, p ->> 0), ', ' order by ord)
    into v_wkt from jsonb_array_elements(p_points) with ordinality as t(p, ord);
  v_wkt := format('POLYGON((%s, %s %s))', v_wkt, p_points -> 0 ->> 1, p_points -> 0 ->> 0);
  if not extensions.st_isvalid(extensions.st_geomfromtext(v_wkt, 4326)) then
    raise exception 'The polygon''s edges cross each other' using errcode = '22023';
  end if;
  insert into public.geofences (site_id, kind, area)
  values (p_site, 'polygon', extensions.st_geogfromtext('SRID=4326;' || v_wkt))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.add_circle_geofence, public.add_polygon_geofence from public, anon;
grant execute on function public.add_circle_geofence, public.add_polygon_geofence to authenticated;

-- The location check. Returns the verdict and the numbers behind it, so they can be stored as evidence.
--   inside_fence:      the point is inside at least one of the site's geofences
--   distance_to_edge:  metres from the point to the nearest fence edge (positive inside, negative outside)
--   result:            'pass', or the reason it failed
create function private.check_location(
  p_site uuid, p_lat float8, p_lng float8, p_accuracy_m float8, p_age_s float8
) returns table (inside_fence boolean, distance_to_edge_m float8, result text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_point extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_settings public.org_settings;
  v_inside boolean;
  v_edge float8;
begin
  select os.* into v_settings from public.org_settings os join public.sites s on s.org_id = os.org_id where s.id = p_site;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return query select false, null::float8, 'no location reading';
    return;
  end if;

  select bool_or(extensions.st_covers(g.area, v_point)),
         max(case when extensions.st_covers(g.area, v_point)
                  then extensions.st_distance(extensions.st_exteriorring(g.area::extensions.geometry)::extensions.geography, v_point)
                  else -extensions.st_distance(g.area, v_point) end)
    into v_inside, v_edge
  from public.geofences g where g.site_id = p_site;

  if v_inside is null then
    return query select false, null::float8, 'this site has no geofence';
  elsif p_age_s is null or p_age_s > 30 then
    return query select v_inside, v_edge, 'location reading is too old';
  elsif p_accuracy_m is null or p_accuracy_m > v_settings.location_max_accuracy_m then
    return query select v_inside, v_edge, 'location not accurate enough';
  elsif v_settings.location_mode = 'strict' and v_edge < p_accuracy_m then
    -- Strict: the whole accuracy circle must sit inside the fence.
    return query select v_inside, v_edge, 'too close to the edge for this location accuracy';
  elsif v_settings.location_mode = 'balanced' and v_edge < -p_accuracy_m then
    -- Balanced: the point may be outside only by less than its accuracy radius.
    return query select v_inside, v_edge, 'outside the site';
  else
    return query select v_inside, v_edge, 'pass';
  end if;
end $$;

grant execute on function private.check_location to authenticated;

alter table public.sites enable row level security;
alter table public.geofences enable row level security;
alter table public.member_sites enable row level security;
revoke all on public.sites, public.geofences, public.member_sites from anon, authenticated;
grant select on public.sites, public.geofences, public.member_sites to authenticated;
grant insert, update, delete on public.sites, public.member_sites to authenticated;
grant delete on public.geofences to authenticated;

create policy "members read sites" on public.sites
  for select to authenticated using (org_id in (select private.my_orgs()));
create policy "site managers write sites" on public.sites
  for all to authenticated using (private.has_permission(org_id, 'sites.manage'))
  with check (private.has_permission(org_id, 'sites.manage'));

create policy "members read geofences" on public.geofences
  for select to authenticated using (site_id in (select s.id from public.sites s));
create policy "site managers delete geofences" on public.geofences
  for delete to authenticated using (private.has_permission((select org_id from public.sites s where s.id = site_id), 'sites.manage'));

create policy "members read site assignments" on public.member_sites
  for select to authenticated using (org_id in (select private.my_orgs()));
create policy "people managers assign sites" on public.member_sites
  for all to authenticated
  using (private.has_permission(org_id, 'people.manage'))
  with check (private.has_permission(org_id, 'people.manage'));

create trigger audit_sites after insert or update or delete on public.sites for each row execute function private.audit_row();
create trigger audit_member_sites after insert or update or delete on public.member_sites for each row execute function private.audit_row();
