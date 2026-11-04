-- Leave: types with a yearly allowance, requests, review, and private attachments.
-- JedSkies allowed 5 sick days a year with an optional letter and one pending request at a time.
-- Here each business sets its own types and allowances, and the database refuses overlapping
-- leave instead of limiting people to one pending request.

create type public.leave_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 40),
  paid boolean not null default true,
  -- Working days a person may take per calendar year; null means no limit.
  yearly_days smallint check (yearly_days is null or yearly_days between 0 and 366),
  needs_attachment boolean not null default false,
  active boolean not null default true,
  unique (org_id, name),
  unique (id, org_id)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membership_id uuid not null,
  leave_type_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  -- Working days covered, counted with the business's working days when the request is made.
  days smallint not null check (days > 0),
  reason text check (length(reason) <= 500),
  attachment_path text,
  status public.leave_status not null default 'pending',
  reviewed_by uuid,
  review_note text check (length(review_note) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (leave_type_id, org_id) references public.leave_types (id, org_id),
  foreign key (reviewed_by, org_id) references public.memberships (id, org_id) deferrable initially deferred,
  check (ends_on >= starts_on and ends_on - starts_on < 62),
  check (reviewed_by is distinct from membership_id),
  check (status not in ('approved', 'rejected') or reviewed_by is not null),
  -- Nobody can hold two pending or approved requests for the same day.
  exclude using gist (membership_id with =, daterange(starts_on, ends_on, '[]') with &&)
    where (status in ('pending', 'approved'))
);
create index leave_requests_org_status on public.leave_requests (org_id, status, starts_on);
create index leave_requests_member on public.leave_requests (membership_id, starts_on);

-- Working days between two dates, using the business's working days.
create function private.working_days(p_org uuid, p_from date, p_to date)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from generate_series(p_from, p_to, interval '1 day') d
  join public.org_settings os on os.org_id = p_org
  where extract(dow from d)::smallint = any (os.work_days)
$$;

-- Days of one type already pending or approved in a calendar year, not counting one request.
create function private.leave_used(p_member uuid, p_type uuid, p_year int, p_except uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(days), 0)::int from public.leave_requests
  where membership_id = p_member and leave_type_id = p_type and status in ('pending', 'approved')
    and extract(year from starts_on) = p_year and id is distinct from p_except
$$;

create function private.check_allowance(p_member uuid, p_type uuid, p_from date, p_days int, p_except uuid default null)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit smallint := (select yearly_days from public.leave_types where id = p_type);
  v_used int;
begin
  if v_limit is null then return; end if;
  v_used := private.leave_used(p_member, p_type, extract(year from p_from)::int, p_except);
  if v_used + p_days > v_limit then
    raise exception 'This would use % of % days allowed this year (% already used or pending)', v_used + p_days, v_limit, v_used
      using errcode = 'P0001';
  end if;
end $$;

-- Pay that has been locked must not change, so leave can't be approved or withdrawn inside it.
create function private.check_not_locked(p_org uuid, p_from date, p_to date)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pay_periods
             where org_id = p_org and status in ('locked', 'finalized')
               and daterange(starts_on, ends_on, '[]') && daterange(p_from, p_to, '[]')) then
    raise exception 'These dates are in a locked pay period' using errcode = 'P0001';
  end if;
end $$;

create function private.add_default_leave_types(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.leave_types (org_id, name, paid, yearly_days, needs_attachment) values
    (p_org, 'Sick', true, 5, false),
    (p_org, 'Vacation', true, 5, false),
    (p_org, 'Emergency', false, null, false)
$$;

create function private.org_default_leave_types()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_default_leave_types(new.org_id);
  return new;
end $$;
-- Every business gets starting leave types when its settings row is created.
create trigger default_leave_types after insert on public.org_settings
  for each row execute function private.org_default_leave_types();

create function public.request_leave(
  p_org uuid, p_type uuid, p_from date, p_to date, p_reason text default null, p_attachment text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.my_membership(p_org);
  t public.leave_types;
  v_days int;
  v_id uuid;
begin
  perform private.require_feature(p_org, 'leave');
  if v_me is null then raise exception 'You are not a member of this business' using errcode = '42501'; end if;
  select * into t from public.leave_types where id = p_type and org_id = p_org and active;
  if t.id is null then raise exception 'Choose a leave type' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Check the dates' using errcode = '22023'; end if;
  if p_from < current_date - 30 then raise exception 'Leave can be filed up to 30 days after it starts' using errcode = '22023'; end if;
  if p_to > current_date + 365 then raise exception 'Leave can be filed up to a year ahead' using errcode = '22023'; end if;
  if t.needs_attachment and nullif(trim(p_attachment), '') is null then
    raise exception '% leave needs an attachment', t.name using errcode = '22023';
  end if;
  if p_attachment is not null and p_attachment not like p_org || '/' || v_me || '/%' then
    raise exception 'The attachment must be one you uploaded' using errcode = '42501';
  end if;
  v_days := private.working_days(p_org, p_from, p_to);
  if v_days = 0 then raise exception 'There are no working days in these dates' using errcode = '22023'; end if;
  perform private.check_allowance(v_me, p_type, p_from, v_days);
  begin
    insert into public.leave_requests (org_id, membership_id, leave_type_id, starts_on, ends_on, days, reason, attachment_path)
    values (p_org, v_me, p_type, p_from, p_to, v_days, nullif(trim(p_reason), ''), nullif(trim(p_attachment), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'You already have leave pending or approved on some of these days' using errcode = 'P0001';
  end;
  return v_id;
end $$;

create function public.withdraw_leave(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if r.id is null or r.membership_id is distinct from private.my_membership(r.org_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status = 'pending' or (r.status = 'approved' and r.starts_on > current_date) then
    perform private.check_not_locked(r.org_id, r.starts_on, r.ends_on);
    update public.leave_requests set status = 'withdrawn' where id = p_request;
  else
    raise exception 'Only pending or future approved leave can be withdrawn' using errcode = 'P0001';
  end if;
end $$;

create function public.review_leave(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  v_me uuid;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if r.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  perform private.require_feature(r.org_id, 'leave');
  v_me := private.my_membership(r.org_id);
  if v_me = r.membership_id then raise exception 'You cannot review your own leave' using errcode = '42501'; end if;
  if not private.can_act_on_member(r.membership_id, 'leave.review') then
    raise exception 'You cannot review this request' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided' using errcode = 'P0001'; end if;
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'Say why the request is rejected' using errcode = '22023';
  end if;
  if p_approve then
    perform private.check_allowance(r.membership_id, r.leave_type_id, r.starts_on, r.days, r.id);
    perform private.check_not_locked(r.org_id, r.starts_on, r.ends_on);
  end if;
  update public.leave_requests set
    status = case when p_approve then 'approved'::public.leave_status else 'rejected' end,
    reviewed_by = v_me, review_note = nullif(trim(p_note), ''), reviewed_at = now()
  where id = p_request;
end $$;

-- Remaining allowance per type for one person this year (themself, or someone they can see).
create function public.leave_balances(p_member uuid, p_year int default extract(year from current_date)::int)
returns table (leave_type_id uuid, name text, paid boolean, yearly_days smallint, used int, remaining int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.paid, t.yearly_days,
    (select coalesce(sum(days), 0)::int from public.leave_requests
      where membership_id = p_member and leave_type_id = t.id and status = 'approved'
        and extract(year from starts_on) = p_year),
    case when t.yearly_days is null then null
         else t.yearly_days - private.leave_used(p_member, t.id, p_year) end
  from public.leave_types t
  join public.memberships m on m.id = p_member and m.org_id = t.org_id
  where t.active and private.can_see_member(p_member)
  order by t.name
$$;

alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
revoke all on public.leave_types, public.leave_requests from anon, authenticated;
grant select on public.leave_types, public.leave_requests to authenticated;
grant insert, update on public.leave_types to authenticated;

create policy "members read leave types" on public.leave_types
  for select to authenticated using (org_id in (select private.my_orgs()));
create policy "people managers add leave types" on public.leave_types
  for insert to authenticated with check (private.has_permission(org_id, 'people.manage'));
create policy "people managers change leave types" on public.leave_types
  for update to authenticated using (private.has_permission(org_id, 'people.manage'))
  with check (private.has_permission(org_id, 'people.manage'));
create policy "see leave you may see" on public.leave_requests
  for select to authenticated using (membership_id in (select private.visible_members()));

create trigger audit_leave_types after insert or update on public.leave_types
  for each row execute function private.audit_row();
create trigger audit_leave_requests after update on public.leave_requests
  for each row execute function private.audit_row();

revoke execute on function public.request_leave, public.withdraw_leave, public.review_leave, public.leave_balances from public, anon;
grant execute on function public.request_leave, public.withdraw_leave, public.review_leave, public.leave_balances to authenticated;

-- Attachments: private bucket, one folder per business and person ({org}/{membership}/file).
-- The person uploads to their own folder; reviewers who can see them may read it.
create function private.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end $$;
grant execute on function private.try_uuid(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-attachments', 'leave-attachments', false, 5242880, '{image/jpeg,image/png,application/pdf}')
on conflict (id) do nothing;

create policy "upload leave attachments to your own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'leave-attachments'
    and private.try_uuid((storage.foldername(name))[2])
        = private.my_membership(private.try_uuid((storage.foldername(name))[1]))
  );
create policy "read your own or your team's leave attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      private.try_uuid((storage.foldername(name))[2])
        = private.my_membership(private.try_uuid((storage.foldername(name))[1]))
      or private.can_act_on_member(private.try_uuid((storage.foldername(name))[2]), 'leave.review')
    )
  );
