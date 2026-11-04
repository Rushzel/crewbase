-- Sales: products and customer applications.
-- In JedSkies, agents logged sign-ups for internet plans; the customer confirmed by email,
-- some plans were approved automatically after that, and unconfirmed sign-ups moved to
-- "for follow-up" after 72 hours. Here any business can sell any product the same way.

create type public.application_status as enum (
  'awaiting_verification', 'follow_up', 'for_approval', 'approved', 'rejected', 'cancelled'
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (length(description) <= 500),
  price_minor bigint not null check (price_minor >= 0),
  incentive_minor bigint not null default 0 check (incentive_minor >= 0),
  needs_verification boolean not null default true,
  auto_approve boolean not null default false,
  active boolean not null default true,
  sort smallint not null default 0,
  unique (org_id, name),
  unique (id, org_id),
  -- Automatic approval only ever follows the customer's own confirmation.
  check (not auto_approve or needs_verification)
);

create table public.customer_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  site_id uuid,
  product_id uuid not null,
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  customer_phone text check (length(customer_phone) <= 30),
  address text check (length(address) <= 300),
  notes text check (length(notes) <= 1000),
  status public.application_status not null,
  -- Copied from the product: the price when logged, the incentive when approved.
  price_minor bigint not null check (price_minor >= 0),
  incentive_minor bigint not null default 0 check (incentive_minor >= 0),
  token_hash text unique,
  token_expires_at timestamptz,
  verification_sent_at timestamptz,
  resend_count smallint not null default 0,
  verified_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.products (id, org_id),
  foreign key (site_id, org_id) references public.sites (id, org_id) on delete set null (site_id),
  foreign key (decided_by, org_id) references public.memberships (id, org_id) deferrable initially deferred,
  check (decided_by is distinct from membership_id),
  check ((status in ('approved', 'rejected')) = (decided_at is not null)),
  check (status <> 'rejected' or decided_by is not null),
  check ((token_hash is null) = (token_expires_at is null))
);
create index customer_applications_member on public.customer_applications (membership_id, created_at desc);
create index customer_applications_org_status on public.customer_applications (org_id, status, created_at desc);
create index customer_applications_decided on public.customer_applications (org_id, decided_at) where status = 'approved';

create function private.new_token(out token text, out token_hash text)
language plpgsql volatile set search_path = '' as $$
begin
  token := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := encode(extensions.digest(token, 'sha256'), 'hex');
end $$;

-- Logs a sale for the caller. Returns the id, and the verification token when the product needs one
-- (the app emails the link; only the hash is stored).
create function public.log_application(
  p_org uuid, p_product uuid, p_customer_name text, p_customer_email text,
  p_customer_phone text default null, p_address text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.my_membership(p_org);
  p public.products;
  v_token text;
  v_hash text;
  v_id uuid;
begin
  perform private.require_feature(p_org, 'sales');
  perform private.require_permission(p_org, 'sales.log');
  select * into p from public.products where id = p_product and org_id = p_org and active;
  if p.id is null then raise exception 'Choose a product' using errcode = '22023'; end if;
  if p.needs_verification then select token, token_hash into v_token, v_hash from private.new_token(); end if;
  insert into public.customer_applications (
    org_id, membership_id, site_id, product_id, customer_name, customer_email, customer_phone, address, notes,
    status, price_minor, token_hash, token_expires_at, verification_sent_at)
  values (
    p_org, v_me,
    (select ms.site_id from public.member_sites ms join public.sites s on s.id = ms.site_id
      where ms.membership_id = v_me and s.active order by ms.is_leader, s.name limit 1),
    p.id, trim(p_customer_name), lower(trim(p_customer_email)), nullif(trim(p_customer_phone), ''),
    nullif(trim(p_address), ''), nullif(trim(p_notes), ''),
    case when p.needs_verification then 'awaiting_verification'::public.application_status else 'for_approval' end,
    p.price_minor, v_hash, case when v_hash is not null then now() + interval '7 days' end,
    case when p.needs_verification then now() end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- A new link for an unconfirmed application (the agent's own, or with sales.review). At most 3.
create function public.resend_verification(p_application uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a public.customer_applications;
  t record;
begin
  select * into a from public.customer_applications where id = p_application for update;
  if a.id is null or not (a.membership_id = private.my_membership(a.org_id) or private.can_act_on_member(a.membership_id, 'sales.review')) then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if a.status not in ('awaiting_verification', 'follow_up') then
    raise exception 'This application is not waiting for the customer' using errcode = 'P0001';
  end if;
  if a.resend_count >= 3 then raise exception 'The link has been sent 3 times already' using errcode = 'P0001'; end if;
  select * into t from private.new_token();
  update public.customer_applications set
    token_hash = t.token_hash, token_expires_at = now() + interval '7 days', verification_sent_at = now(),
    resend_count = resend_count + 1, status = 'awaiting_verification'
  where id = p_application;
  return t.token;
end $$;

-- The customer opens the link. Callable without signing in; the token is the only key and works once.
create function public.verify_application(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.customer_applications;
  p public.products;
  v_status public.application_status;
begin
  select * into a from public.customer_applications
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if a.id is null or a.token_expires_at < now() or a.status not in ('awaiting_verification', 'follow_up') then
    raise exception 'This link is invalid or has expired' using errcode = 'P0001';
  end if;
  select * into p from public.products where id = a.product_id;
  v_status := case when p.auto_approve then 'approved'::public.application_status else 'for_approval' end;
  update public.customer_applications set
    status = v_status, verified_at = now(), token_hash = null, token_expires_at = null,
    decided_at = case when p.auto_approve then now() end,
    decision_note = case when p.auto_approve then 'Approved automatically after the customer confirmed' end,
    incentive_minor = case when p.auto_approve then p.incentive_minor else 0 end
  where id = a.id;
  return jsonb_build_object(
    'status', v_status,
    'business', (select name from public.organizations where id = a.org_id),
    'product', p.name);
end $$;

create function public.cancel_application(p_application uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.customer_applications;
begin
  select * into a from public.customer_applications where id = p_application for update;
  if a.id is null or a.membership_id is distinct from private.my_membership(a.org_id) then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if a.status in ('approved', 'rejected', 'cancelled') then
    raise exception 'This application is already closed' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Say why it is cancelled' using errcode = '22023'; end if;
  update public.customer_applications set status = 'cancelled', decision_note = trim(p_reason),
    token_hash = null, token_expires_at = null
  where id = p_application;
end $$;

-- The agent corrects the customer's details before a decision. A new email address needs a new confirmation.
create function public.update_application(
  p_application uuid, p_customer_name text, p_customer_email text,
  p_customer_phone text default null, p_address text default null, p_notes text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  a public.customer_applications;
  v_needs boolean;
  v_token text;
  v_hash text;
begin
  select * into a from public.customer_applications where id = p_application for update;
  if a.id is null or a.membership_id is distinct from private.my_membership(a.org_id) then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if a.status not in ('awaiting_verification', 'follow_up', 'for_approval') then
    raise exception 'This application is already closed' using errcode = 'P0001';
  end if;
  v_needs := (select needs_verification from public.products where id = a.product_id)
    and lower(trim(p_customer_email)) <> a.customer_email;
  if v_needs then select token, token_hash into v_token, v_hash from private.new_token(); end if;
  update public.customer_applications set
    customer_name = trim(p_customer_name), customer_email = lower(trim(p_customer_email)),
    customer_phone = nullif(trim(p_customer_phone), ''), address = nullif(trim(p_address), ''), notes = nullif(trim(p_notes), ''),
    status = case when v_needs then 'awaiting_verification' else status end,
    verified_at = case when v_needs then null else verified_at end,
    token_hash = case when v_needs then v_hash else token_hash end,
    token_expires_at = case when v_needs then now() + interval '7 days' else token_expires_at end,
    verification_sent_at = case when v_needs then now() else verification_sent_at end
  where id = p_application;
  return v_token;
end $$;

create function public.decide_application(p_application uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.customer_applications;
  v_me uuid;
begin
  select * into a from public.customer_applications where id = p_application for update;
  if a.id is null then raise exception 'Application not found' using errcode = 'P0002'; end if;
  perform private.require_feature(a.org_id, 'sales');
  if not private.can_act_on_member(a.membership_id, 'sales.review') then
    raise exception 'You cannot decide this application' using errcode = '42501';
  end if;
  v_me := private.my_membership(a.org_id);
  if v_me = a.membership_id then raise exception 'You cannot approve your own sale' using errcode = '42501'; end if;
  if a.status <> 'for_approval' then
    raise exception 'Only applications ready for approval can be decided' using errcode = 'P0001';
  end if;
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'Say why the application is rejected' using errcode = '22023';
  end if;
  update public.customer_applications set
    status = case when p_approve then 'approved'::public.application_status else 'rejected' end,
    decided_by = v_me, decided_at = now(), decision_note = nullif(trim(p_note), ''),
    incentive_minor = case when p_approve then (select incentive_minor from public.products where id = a.product_id) else 0 end
  where id = p_application;
end $$;

-- Hourly: unconfirmed applications older than the business's follow-up hours move to follow-up.
create function private.move_to_follow_up()
returns int language sql security definer set search_path = '' as $$
  with moved as (
    update public.customer_applications a set status = 'follow_up'
    from public.org_settings os
    where os.org_id = a.org_id and a.status = 'awaiting_verification'
      and a.verification_sent_at < now() - make_interval(hours => os.follow_up_hours)
    returning a.id)
  select count(*)::int from moved
$$;
select cron.schedule('move-to-follow-up', '10 * * * *', 'select private.move_to_follow_up()');

alter table public.products enable row level security;
alter table public.customer_applications enable row level security;
revoke all on public.products, public.customer_applications from anon, authenticated;
grant select on public.products to authenticated;
grant insert, update on public.products to authenticated;
-- Every column except the token hash.
grant select (id, org_id, membership_id, site_id, product_id, customer_name, customer_email, customer_phone, address, notes,
  status, price_minor, incentive_minor, token_expires_at, verification_sent_at, resend_count, verified_at,
  decided_by, decided_at, decision_note, created_at) on public.customer_applications to authenticated;

create policy "members read products" on public.products
  for select to authenticated using (org_id in (select private.my_orgs()));
create policy "product managers add products" on public.products
  for insert to authenticated with check (private.has_permission(org_id, 'products.manage'));
create policy "product managers change products" on public.products
  for update to authenticated using (private.has_permission(org_id, 'products.manage'))
  with check (private.has_permission(org_id, 'products.manage'));
create policy "see sales you may see" on public.customer_applications
  for select to authenticated using (membership_id in (select private.visible_members()));

create trigger audit_products after insert or update on public.products
  for each row execute function private.audit_row();
create trigger audit_customer_applications after update on public.customer_applications
  for each row execute function private.audit_row();

revoke execute on function public.log_application, public.resend_verification, public.verify_application,
  public.cancel_application, public.update_application, public.decide_application from public;
grant execute on function public.log_application, public.resend_verification, public.cancel_application,
  public.update_application, public.decide_application to authenticated;
grant execute on function public.verify_application to anon, authenticated;
