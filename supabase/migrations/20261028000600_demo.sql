-- The made-up demo business, rebuilt nightly. Every person here is invented sample data.
-- The business itself is seeded by private.seed_demo_company (in a later migration).

create function private.demo_uuid(p_key text) returns uuid language sql immutable as $$
  select md5('crewbase-demo-' || p_key)::uuid
$$;

-- Creates (or keeps) a demo sign-in. Only the one account per role gets a known password.
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

create function private.seed_demo()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.seeding', 'on', true);
  perform private.seed_demo_company();
  perform set_config('app.seeding', 'off', true);
end $$;

-- Deletes the demo business (and only that) and builds it again. Demo sign-ins are kept.
create function private.reset_demo_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.face_enrollments f using public.memberships m, public.organizations o
  where f.membership_id = m.id and m.org_id = o.id and o.is_demo;
  delete from public.organizations where is_demo;
  perform private.seed_demo();
end $$;

revoke execute on function private.seed_demo, private.reset_demo_data, private.demo_user from public, authenticated;

select cron.schedule('reset-demo-data', '0 19 * * *', 'select private.reset_demo_data()');   -- 03:00 in Manila
-- Visitor face enrollments in demo businesses expire after 24 hours; clear them hourly.
select cron.schedule('expire-demo-faces', '5 * * * *', 'delete from public.face_enrollments where expires_at < now()');
