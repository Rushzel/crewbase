-- Acceptance criteria 33 to 40 (pay periods, timesheet approval, payslips), with hand-worked examples.
begin;
select no_plan();

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f2', 'hana@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
grant execute on function pg_temp.id(text) to authenticated;
create function pg_temp.slip(p_member text) returns public.payslips language sql as $$
  select * from public.payslips where membership_id = pg_temp.id(p_member) and status <> 'void'
$$;
create function pg_temp.line(p_member text, p_label text) returns bigint language sql as $$
  select l.amount_minor from public.payslip_lines l join public.payslips p on p.id = l.payslip_id
  where p.membership_id = pg_temp.id(p_member) and p.status <> 'void' and l.label like p_label
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
insert into ids values ('org', public.create_organization('Sample Foxtrot Bakery', 'sample-foxtrot', 'Faye Sample'));
reset role;
insert into ids select 'owner', id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1';
with s as (insert into public.sites (org_id, name) values (pg_temp.id('org'), 'Bakery') returning id) insert into ids select 'site', id from s;

-- Members: Hana (hourly, can sign in), Dan (daily rate, scheduled), Ivy (rate change mid-period), Zed (no time).
with m as (insert into public.memberships (org_id, user_id, display_name, role_id)
  select pg_temp.id('org'), '00000000-0000-0000-0000-0000000000f2', 'Hana Sample', id from public.roles where org_id = pg_temp.id('org') and name = 'Employee' returning id)
insert into ids select 'hana', id from m;
insert into public.memberships (org_id, display_name, role_id, status, user_id)
select pg_temp.id('org'), n, (select id from public.roles where org_id = pg_temp.id('org') and name = 'Employee'), 'invited', null
from unnest(array['Dan Sample', 'Ivy Sample', 'Zed Sample']) n;
insert into ids select lower(split_part(display_name, ' ', 1)), id from public.memberships where display_name in ('Dan Sample', 'Ivy Sample', 'Zed Sample');

insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from) values
  (pg_temp.id('org'), pg_temp.id('hana'), 'hourly', 10000, '2026-09-01'),   -- 100.00 an hour
  (pg_temp.id('org'), pg_temp.id('dan'), 'daily', 64000, '2026-09-01'),     -- 640.00 a day (80.00 an hour)
  (pg_temp.id('org'), pg_temp.id('ivy'), 'hourly', 10000, '2026-09-01'),
  (pg_temp.id('org'), pg_temp.id('ivy'), 'hourly', 20000, '2026-10-02'),    -- raise from 2 October
  (pg_temp.id('org'), pg_temp.id('zed'), 'hourly', 10000, '2026-09-01');
insert into public.deduction_rules (org_id, name, kind, value, is_sample) values
  (pg_temp.id('org'), 'Fund', 'fixed', 5000, true),      -- 50.00
  (pg_temp.id('org'), 'Tax', 'percent', 10, true);       -- 10% of gross

-- Hana: 1 Oct 9:00 to 18:00 with a 60 minute break (8 h); 2 Oct 8:00 to 19:00 with 60 (10 h: 8 regular, 2 overtime).
insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, break_minutes, worked_minutes) values
  (pg_temp.id('org'), pg_temp.id('hana'), pg_temp.id('site'), '2026-10-01', '2026-10-01 09:00+08', '2026-10-01 18:00+08', 'closed', 60, 480),
  (pg_temp.id('org'), pg_temp.id('hana'), pg_temp.id('site'), '2026-10-02', '2026-10-02 08:00+08', '2026-10-02 19:00+08', 'closed', 60, 600),
-- Dan: shifts 1 to 3 Oct at 8:00; 30 minutes late on the 1st, 10 minutes late (inside the 15 minute grace) on the 2nd, absent on the 3rd.
  (pg_temp.id('org'), pg_temp.id('dan'), pg_temp.id('site'), '2026-10-01', '2026-10-01 08:30+08', '2026-10-01 17:30+08', 'closed', 60, 480),
  (pg_temp.id('org'), pg_temp.id('dan'), pg_temp.id('site'), '2026-10-02', '2026-10-02 08:10+08', '2026-10-02 17:10+08', 'closed', 60, 480),
-- Ivy: 8 hours on each of 1 and 2 October.
  (pg_temp.id('org'), pg_temp.id('ivy'), pg_temp.id('site'), '2026-10-01', '2026-10-01 09:00+08', '2026-10-01 17:00+08', 'closed', 0, 480),
  (pg_temp.id('org'), pg_temp.id('ivy'), pg_temp.id('site'), '2026-10-02', '2026-10-02 09:00+08', '2026-10-02 17:00+08', 'closed', 0, 480);
insert into public.shifts (org_id, membership_id, site_id, starts_at, ends_at)
select pg_temp.id('org'), pg_temp.id('dan'), pg_temp.id('site'), (d::date + time '08:00') at time zone 'Asia/Manila', (d::date + time '17:00') at time zone 'Asia/Manila'
from generate_series('2026-10-01'::date, '2026-10-03'::date, interval '1 day') d;

-- The period and its approval steps.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
insert into ids values ('period', public.create_pay_period(pg_temp.id('org'), '2026-10-01', '2026-10-15'));
select throws_ok($$ select public.lock_period(pg_temp.id('period')) $$, 'P0001', null, 'an open period cannot be locked directly');
select lives_ok($$ select public.start_review(pg_temp.id('period')) $$, 'the period goes to review');
-- Criterion 33: locking needs every timesheet approved, or an owner override with a reason.
select throws_ok($$ select public.lock_period(pg_temp.id('period')) $$, 'P0001', '3 timesheet(s) still need approval', 'cannot lock with unapproved timesheets');
select lives_ok($$ select public.approve_timesheet(pg_temp.id('period'), pg_temp.id(k)) from (values ('hana'), ('dan'), ('ivy')) t(k) $$, 'the owner approves three timesheets');
select throws_ok($$ select public.generate_payslips(pg_temp.id('period')) $$, 'P0001', 'Lock the period before generating payslips', 'payslips need a locked period');
select lives_ok($$ select public.lock_period(pg_temp.id('period')) $$, 'the period locks');
select is(public.generate_payslips(pg_temp.id('period')), 3, 'three payslips generated');
reset role;

-- Criterion 34: entries in a locked period can't change, even through corrections.
select throws_ok($$ update public.time_entries set worked_minutes = 1 where membership_id = pg_temp.id('hana') and work_date = '2026-10-01' $$,
  'P0001', 'This day is in a locked pay period', 'a locked day cannot be edited, even by the database owner');
select throws_ok($$ insert into public.time_entries (org_id, membership_id, site_id, work_date, clock_in, clock_out, status, worked_minutes)
  values (pg_temp.id('org'), pg_temp.id('zed'), pg_temp.id('site'), '2026-10-05', '2026-10-05 09:00+08', '2026-10-05 10:00+08', 'closed', 60) $$,
  'P0001', 'This day is in a locked pay period', 'time cannot be added to a locked period');

-- Criterion 35: the worked examples.
-- Hana: regular 16 h x 100 = 1,600.00; overtime 2 h x 100 x 1.25 = 250.00; gross 1,850.00.
select is(pg_temp.line('hana', 'Regular hours'), 160000::bigint, 'Hana regular pay is 1,600.00');
select is(pg_temp.line('hana', 'Overtime%'), 25000::bigint, 'Hana overtime is 250.00');
select is((pg_temp.slip('hana')).gross_minor, 185000::bigint, 'Hana gross is 1,850.00');
-- Deductions: fund 50.00 and tax 10% of gross (185.00); net 1,615.00.
select is(pg_temp.line('hana', 'Tax%'), 18500::bigint, 'Hana tax is 185.00');
select is((pg_temp.slip('hana')).net_minor, 161500::bigint, 'Hana net is 1,615.00');
-- Dan: 3 scheduled days x 640 = 1,920.00; absence 1 day = 640.00; tardiness 30 min x 80/60 = 40.00.
select is(pg_temp.line('dan', 'Basic pay'), 192000::bigint, 'Dan basic pay is 3 days, 1,920.00');
select is(pg_temp.line('dan', 'Absences, 1 day'), 64000::bigint, 'Dan absence deduction is 640.00');
select is(pg_temp.line('dan', 'Tardiness, 30 min'), 4000::bigint, 'Dan tardiness is 30 minutes (the 10 minute day is within grace), 40.00');
select is((pg_temp.slip('dan')).net_minor, (192000 - 64000 - 4000 - 5000 - 19200)::bigint, 'Dan net is 998.00');
-- Criterion 37: Ivy earns 100 an hour on 1 October and 200 from 2 October: 800 + 1,600 = 2,400.00.
select is(pg_temp.line('ivy', 'Regular hours'), 240000::bigint, 'a mid-period raise applies only from its date');
-- Criterion 36: totals equal the lines for every payslip.
select is((select count(*)::int from public.payslips p where p.gross_minor <> (select sum(amount_minor) from public.payslip_lines where payslip_id = p.id and kind = 'earning')
  or p.deductions_minor <> coalesce((select sum(amount_minor) from public.payslip_lines where payslip_id = p.id and kind = 'deduction'), 0)), 0,
  'every payslip total equals its lines');
select throws_ok($$ update public.payslips set gross_minor = gross_minor + 1, net_minor = net_minor + 1 where membership_id = pg_temp.id('hana'); set constraints all immediate $$,
  '23514', null, 'a total that does not match its lines is rejected');

-- Criterion 38: no worked time, no payslip, and the person is listed.
select is((select count(*)::int from public.payslips where membership_id = pg_temp.id('zed')), 0, 'Zed has no payslip');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select is((select reason from public.period_without_payslip(pg_temp.id('period')) where membership_id = pg_temp.id('zed')), 'no worked time', 'Zed is listed with the reason');

-- Criterion 39: final payslips can't change; voiding needs a reason and keeps the original.
select lives_ok($$ select public.finalize_period(pg_temp.id('period')) $$, 'the period is finalized');
reset role;
select throws_ok($$ update public.payslips set net_minor = net_minor + 100, gross_minor = gross_minor + 100 where membership_id = pg_temp.id('hana') $$,
  '42501', 'Final payslips can''t be changed', 'a final payslip cannot be edited, even by the database owner');
select throws_ok($$ update public.payslip_lines set amount_minor = 1 $$, '42501', null, 'final payslip lines cannot be edited');
select throws_ok($$ delete from public.payslips where membership_id = pg_temp.id('hana') $$, '42501', null, 'a final payslip cannot be deleted');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select throws_ok($$ select public.void_payslip((pg_temp.slip('hana')).id, '') $$, '22023', null, 'voiding needs a reason');
select lives_ok($$ select public.void_payslip((select id from public.payslips where membership_id = pg_temp.id('hana')), 'Wrong overtime multiplier') $$, 'the owner voids with a reason');
select is((select count(*)::int from public.payslips where membership_id = pg_temp.id('hana') and status = 'void'), 1, 'the voided payslip is kept');
select lives_ok($$ select public.reissue_payslip(pg_temp.id('period'), pg_temp.id('hana')) $$, 'a corrected payslip is issued');
select is((select count(*)::int from public.payslips where membership_id = pg_temp.id('hana') and status = 'final'), 1, 'one live final payslip');
reset role;

-- Criterion 40: employees see only their own payslips and rates.
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
set local role authenticated;
select is((select count(*)::int from public.payslips where membership_id <> pg_temp.id('hana')), 0, 'Hana sees only her own payslips');
select is((select count(*)::int from public.pay_rates where membership_id <> pg_temp.id('hana')), 0, 'Hana sees only her own pay rate');
select throws_ok($$ select public.generate_payslips(pg_temp.id('period')) $$, '42501', null, 'employees cannot run payroll');
select throws_ok($$ insert into public.pay_rates (org_id, membership_id, basis, amount_minor, effective_from)
  values (pg_temp.id('org'), pg_temp.id('hana'), 'hourly', 99999, current_date) $$, '42501', null, 'employees cannot set their own rate');
reset role;

select * from finish();
rollback;
