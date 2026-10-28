-- Businesses, settings, features, roles, memberships and the audit log.
-- Every business-owned row carries org_id and is protected by row-level security.
-- Helper functions live in the "private" schema, which the Data API does not expose.

create extension if not exists btree_gist with schema extensions;
create extension if not exists postgis with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- Fixed permission list. Businesses build roles from these; they can't invent new ones.
create type public.app_permission as enum (
  'time.clock',
  'time.edit',
  'requests.review',
  'schedule.manage',
  'payroll.run',
  'people.manage',
  'sites.manage',
  'settings.manage',
  'analytics.view',
  'face.enroll_others'
);

-- How far a role can see: only the member themself, their reporting line, or everyone.
create type public.role_scope as enum ('own', 'team', 'all');

create type public.feature_key as enum (
  'time_tracking', 'face_verification', 'geofence', 'breaks', 'corrections',
  'scheduling', 'payroll', 'analytics', 'output_tracking'
);

create type public.membership_status as enum ('invited', 'active', 'inactive');
create type public.employment_type as enum ('regular', 'provisional', 'contract');
create type public.pay_frequency as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');
create type public.location_mode as enum ('strict', 'balanced');
create type public.fail_policy as enum ('block', 'flag');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (length(trim(name)) between 2 and 80),
  logo_path text,
  brand_color text not null default '#0a84ff' check (brand_color ~ '^#[0-9a-f]{6}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  timezone text not null default 'Asia/Manila',
  currency char(3) not null default 'PHP',
  week_start smallint not null default 1 check (week_start between 0 and 6),
  pay_frequency public.pay_frequency not null default 'semimonthly',
  grace_minutes smallint not null default 15 check (grace_minutes between 0 and 120),
  regular_minutes_per_day smallint not null default 480 check (regular_minutes_per_day between 60 and 1440),
  overtime_multiplier numeric(4, 2) not null default 1.25 check (overtime_multiplier between 1 and 4),
  default_start_time time not null default '08:00',
  face_threshold numeric(4, 3) not null default 0.600 check (face_threshold between 0.3 and 0.99),
  liveness_required boolean not null default true,
  location_max_accuracy_m smallint not null default 50 check (location_max_accuracy_m between 5 and 500),
  location_mode public.location_mode not null default 'balanced',
  face_fail_policy public.fail_policy not null default 'block',
  location_fail_policy public.fail_policy not null default 'flag',
  keep_audit_frames boolean not null default false
);

create table public.org_features (
  org_id uuid not null references public.organizations (id) on delete cascade,
  feature public.feature_key not null,
  enabled boolean not null default true,
  primary key (org_id, feature)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 40),
  scope public.role_scope not null default 'own',
  is_owner boolean not null default false,
  unique (org_id, name),
  unique (id, org_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission public.app_permission not null,
  primary key (role_id, permission)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  employee_code text,
  role_id uuid not null,
  manager_id uuid,
  employment_type public.employment_type not null default 'regular',
  status public.membership_status not null default 'active',
  hired_on date,
  created_at timestamptz not null default now(),
  unique (org_id, user_id),
  unique (org_id, employee_code),
  unique (id, org_id),
  foreign key (role_id, org_id) references public.roles (id, org_id) deferrable initially deferred,
  foreign key (manager_id, org_id) references public.memberships (id, org_id) deferrable initially deferred,
  check (manager_id is distinct from id),
  check (status = 'invited' or user_id is not null)
);
create index memberships_user_idx on public.memberships (user_id);
create index memberships_manager_idx on public.memberships (manager_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

-- Append-only record of configuration changes (settings, roles, rates, sites, periods).
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor uuid default auth.uid(),
  action text not null,
  table_name text not null,
  row_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, at desc);

------------------------------------------------------------------------------
-- Helpers. security definer so policies can call them without recursion;
-- search_path is empty so every name is schema-qualified.
------------------------------------------------------------------------------

-- The caller's active membership in a business, or null.
create function private.my_membership(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

create function private.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.my_membership(p_org) is not null
$$;

create function private.has_permission(p_org uuid, p_permission public.app_permission)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and rp.permission = p_permission
  )
$$;

create function private.my_scope(p_org uuid)
returns public.role_scope language sql stable security definer set search_path = '' as $$
  select r.scope from public.memberships m join public.roles r on r.id = m.role_id
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

-- True when the caller may see a member's records: themself, everyone (scope all),
-- or anyone whose manager chain leads to the caller (scope team).
create function private.can_see_member(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with target as (select id, org_id from public.memberships where id = p_member),
  me as (select private.my_membership(t.org_id) as id, private.my_scope(t.org_id) as scope from target t)
  select case
    when (select id from me) is null then false
    when (select id from me) = p_member then true
    when (select scope from me) = 'all' then true
    when (select scope from me) = 'team' then exists (
      with recursive chain as (
        select m.id, m.manager_id, 1 as depth from public.memberships m where m.id = p_member
        union all
        select m.id, m.manager_id, c.depth + 1 from public.memberships m
        join chain c on m.id = c.manager_id where c.depth < 50
      )
      select 1 from chain where manager_id = (select id from me)
    )
    else false
  end
$$;

-- True when the caller has a permission and may see the member (used for edits).
create function private.can_act_on_member(p_member uuid, p_permission public.app_permission)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_see_member(p_member)
     and private.has_permission((select org_id from public.memberships where id = p_member), p_permission)
$$;

create function private.feature_enabled(p_org uuid, p_feature public.feature_key)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.org_features where org_id = p_org and feature = p_feature), false)
$$;

create function private.require_feature(p_org uuid, p_feature public.feature_key)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.feature_enabled(p_org, p_feature) then
    raise exception 'The % feature is switched off for this business', replace(p_feature::text, '_', ' ')
      using errcode = 'P0001';
  end if;
end $$;

create function private.require_permission(p_org uuid, p_permission public.app_permission)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_org, p_permission) then
    raise exception 'You do not have the % permission', p_permission using errcode = '42501';
  end if;
end $$;

grant execute on all functions in schema private to authenticated;

------------------------------------------------------------------------------
-- Audit and append-only enforcement.
------------------------------------------------------------------------------

-- Append-only tables. The one exception: rows may go when their whole business is deleted
-- (the cascade runs after the business row is gone), so a demo business can be reset.
create function private.block_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = old.org_id) then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.block_change();

create function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  v_org := coalesce((v_new ->> 'org_id')::uuid, (v_old ->> 'org_id')::uuid, (v_new ->> 'id')::uuid);
  -- Rows removed because their whole business is being deleted need no audit entry.
  if not exists (select 1 from public.organizations where id = v_org) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (org_id, action, table_name, row_id, old_value, new_value, reason)
  values (v_org, lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_org::text),
          v_old, v_new, nullif(current_setting('app.reason', true), ''));
  return coalesce(new, old);
end $$;

create function private.check_timezone()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

create trigger org_settings_timezone before insert or update of timezone on public.org_settings
  for each row execute function private.check_timezone();

create trigger audit_settings after update on public.org_settings for each row execute function private.audit_row();
create trigger audit_features after update on public.org_features for each row execute function private.audit_row();
create trigger audit_roles after insert or update or delete on public.roles for each row execute function private.audit_row();
create trigger audit_memberships after update on public.memberships for each row execute function private.audit_row();

-- A business must always keep at least one active owner.
create function private.keep_an_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_was_owner boolean;
  v_remaining int;
begin
  select r.is_owner into v_was_owner from public.roles r where r.id = old.role_id;
  if not coalesce(v_was_owner, false) or old.status <> 'active' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.status = 'active'
     and (select is_owner from public.roles where id = new.role_id) then
    return new;
  end if;
  -- Deleting the business itself cascades here; allow that.
  if not exists (select 1 from public.organizations where id = old.org_id) then
    return coalesce(new, old);
  end if;
  select count(*) into v_remaining
  from public.memberships m join public.roles r on r.id = m.role_id
  where m.org_id = old.org_id and m.status = 'active' and r.is_owner and m.id <> old.id;
  if v_remaining = 0 then
    raise exception 'A business needs at least one active owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_keep_owner before update or delete on public.memberships
  for each row execute function private.keep_an_owner();

-- Owner roles always hold every permission and can see everyone.
create function private.protect_owner_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'role_permissions' then
    if exists (select 1 from public.roles where id = old.role_id and is_owner) then
      raise exception 'Owner permissions can''t be removed' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.is_owner and (new.is_owner is distinct from true or new.scope <> 'all') then
    raise exception 'The owner role must keep full access' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger role_permissions_protect_owner before delete on public.role_permissions
  for each row execute function private.protect_owner_role();
create trigger roles_protect_owner before update on public.roles
  for each row execute function private.protect_owner_role();

------------------------------------------------------------------------------
-- Creating a business.
------------------------------------------------------------------------------

create function public.create_organization(
  p_name text, p_slug text, p_display_name text,
  p_timezone text default 'Asia/Manila', p_currency text default 'PHP'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_owner_role uuid;
  v_manager_role uuid;
  v_employee_role uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug) values (trim(p_name), lower(trim(p_slug)))
  returning id into v_org;
  insert into public.org_settings (org_id, timezone, currency) values (v_org, p_timezone, upper(p_currency));
  insert into public.org_features (org_id, feature)
    select v_org, f from unnest(enum_range(null::public.feature_key)) f;
  update public.org_features set enabled = false where org_id = v_org and feature = 'output_tracking';

  insert into public.roles (org_id, name, scope, is_owner) values (v_org, 'Owner', 'all', true)
    returning id into v_owner_role;
  insert into public.roles (org_id, name, scope) values (v_org, 'Manager', 'team')
    returning id into v_manager_role;
  insert into public.roles (org_id, name, scope) values (v_org, 'Employee', 'own')
    returning id into v_employee_role;

  insert into public.role_permissions (role_id, permission)
    select v_owner_role, p from unnest(enum_range(null::public.app_permission)) p;
  insert into public.role_permissions (role_id, permission) values
    (v_manager_role, 'time.clock'), (v_manager_role, 'time.edit'), (v_manager_role, 'requests.review'),
    (v_manager_role, 'schedule.manage'), (v_manager_role, 'analytics.view'), (v_manager_role, 'face.enroll_others'),
    (v_employee_role, 'time.clock'), (v_employee_role, 'analytics.view');

  insert into public.memberships (org_id, user_id, display_name, role_id, status)
  values (v_org, auth.uid(), trim(p_display_name), v_owner_role, 'active');

  return v_org;
end $$;

revoke execute on function public.create_organization from public, anon;
grant execute on function public.create_organization to authenticated;

-- Changing a member's role, manager, type or status (people.manage only).
create function public.save_member(
  p_member uuid, p_display_name text, p_role uuid, p_manager uuid,
  p_employment_type public.employment_type, p_status public.membership_status, p_employee_code text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.memberships where id = p_member;
  if v_org is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform private.require_permission(v_org, 'people.manage');
  update public.memberships set
    display_name = trim(p_display_name), role_id = p_role, manager_id = p_manager,
    employment_type = p_employment_type, status = p_status, employee_code = nullif(trim(p_employee_code), '')
  where id = p_member;
end $$;

revoke execute on function public.save_member from public, anon;
grant execute on function public.save_member to authenticated;

------------------------------------------------------------------------------
-- Row-level security and explicit grants.
------------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.org_settings enable row level security;
alter table public.org_features enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.organizations, public.org_settings, public.org_features, public.roles,
  public.role_permissions, public.memberships, public.invitations, public.audit_log from anon, authenticated;

grant select on public.organizations, public.org_settings, public.org_features, public.roles,
  public.role_permissions, public.memberships to authenticated;
grant update (name, logo_path, brand_color) on public.organizations to authenticated;
grant update (timezone, currency, week_start, pay_frequency, grace_minutes, regular_minutes_per_day,
  overtime_multiplier, default_start_time, face_threshold, liveness_required, location_max_accuracy_m,
  location_mode, face_fail_policy, location_fail_policy, keep_audit_frames) on public.org_settings to authenticated;
grant update (enabled) on public.org_features to authenticated;
grant insert, delete on public.role_permissions to authenticated;
grant insert, delete on public.roles to authenticated;
grant update (name, scope) on public.roles to authenticated;
grant select on public.audit_log to authenticated;

create policy "members read their business" on public.organizations
  for select to authenticated using (private.is_member(id));
create policy "settings managers rename and rebrand" on public.organizations
  for update to authenticated using (private.has_permission(id, 'settings.manage'))
  with check (private.has_permission(id, 'settings.manage'));

create policy "members read settings" on public.org_settings
  for select to authenticated using (private.is_member(org_id));
create policy "settings managers change settings" on public.org_settings
  for update to authenticated using (private.has_permission(org_id, 'settings.manage'))
  with check (private.has_permission(org_id, 'settings.manage'));

create policy "members read features" on public.org_features
  for select to authenticated using (private.is_member(org_id));
create policy "settings managers switch features" on public.org_features
  for update to authenticated using (private.has_permission(org_id, 'settings.manage'))
  with check (private.has_permission(org_id, 'settings.manage'));

create policy "members read roles" on public.roles
  for select to authenticated using (private.is_member(org_id));
create policy "settings managers add roles" on public.roles
  for insert to authenticated with check (private.has_permission(org_id, 'settings.manage') and not is_owner);
create policy "settings managers edit roles" on public.roles
  for update to authenticated using (private.has_permission(org_id, 'settings.manage'))
  with check (private.has_permission(org_id, 'settings.manage'));
create policy "settings managers delete non-owner roles" on public.roles
  for delete to authenticated using (private.has_permission(org_id, 'settings.manage') and not is_owner);

create policy "members read role permissions" on public.role_permissions
  for select to authenticated using (private.is_member((select org_id from public.roles r where r.id = role_id)));
create policy "settings managers grant permissions" on public.role_permissions
  for insert to authenticated
  with check (private.has_permission((select org_id from public.roles r where r.id = role_id), 'settings.manage'));
create policy "settings managers revoke permissions" on public.role_permissions
  for delete to authenticated
  using (private.has_permission((select org_id from public.roles r where r.id = role_id), 'settings.manage'));

-- Everyone in a business can see the directory (names, roles, managers).
create policy "members read the directory" on public.memberships
  for select to authenticated using (private.is_member(org_id));

create policy "settings managers read the audit log" on public.audit_log
  for select to authenticated using (private.has_permission(org_id, 'settings.manage'));
