-- Geofence outlines as [lat, lng] pairs for the map editor. security invoker: row-level security on
-- geofences applies, so only members of the business can read its outlines.
create function public.site_geofences(p_org uuid)
returns table (id uuid, site_id uuid, kind text, radius_m numeric, ring jsonb)
language sql stable security invoker set search_path = '' as $$
  select g.id, g.site_id, g.kind, g.radius_m,
    (select jsonb_agg(jsonb_build_array(c -> 1, c -> 0) order by ord)
     from jsonb_array_elements((extensions.st_asgeojson(g.area)::jsonb -> 'coordinates' -> 0)) with ordinality as t(c, ord))
  from public.geofences g
  join public.sites s on s.id = g.site_id
  where s.org_id = p_org
$$;

revoke execute on function public.site_geofences from public, anon;
grant execute on function public.site_geofences to authenticated;
