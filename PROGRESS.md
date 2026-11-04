# Progress

Updated 4 Nov 2026.

## Done

**Phase 1 (28 Oct):**
- **Planning:** codebase overview, specification, data model, acceptance criteria and task list (`docs/`).
- **Skeleton:** Next.js 16.4, Supabase local in Docker, Vitest and Playwright.
- **Database:**
  - businesses and roles;
  - sites and PostGIS geofences;
  - the time core with evidence, face enrollment and liveness challenges;
  - scheduling and payroll;
  - invitations and analytics;
  - demo data reset nightly.
- **Screens:** time in and out, history, corrections, schedule, payslips with PDF, payroll, analytics, face check and settings.
- **Repository:** CI and keep-alive workflow files, the README and the case study.

**Phase 2 (4 Nov), JedSkies' main features** (plan: `docs/PHASE-2.md`):
- **Faster visibility rules.** Policies work out the reader's visible people once per query instead of walking the manager chain for every row. Every phase 1 test still passes.
- **Areas with leaders.** A leader's team is the people in the areas they lead plus their reports. A person and an area must belong to the same business, enforced by composite keys.
- **Role templates.** "Small team" or "Field teams". Field teams has JedSkies' structure, with roles named by function: Finance, Human Resources, Leader, Employee (renamed 4 Nov at Kidd's request).
- **Attendance rules.** Daily status (present, late, half day, absent, on leave) is calculated from the business's own rules. An optional earliest time-in is enforced by `clock_in`.
- **Leave.** Types with yearly allowances, paid or unpaid, optional or required attachments in a private bucket, and review with reasons.
- **Sales.** Products, customer applications, a one-use confirmation link by email, follow-up after set hours, optional automatic approval, and incentives on payslips.
- **Payslips.** They now pay paid leave, deduct unpaid leave as leave (not as an absence) and add sales incentives.
- **Probation.** Provisional staff become regular automatically, and the change is recorded in the audit log.
- **Screens:**
  - home by permission;
  - Team today with a map of time-in locations;
  - areas with their boundary and team;
  - leave and leave types;
  - sales and products;
  - the customer confirmation page;
  - audit trail;
  - leaders enrolling their team's faces;
  - hire dates;
  - the new settings;
  - template choice when a business is set up.
- **Demo.** One made-up business, Demo Company: field employees in three areas, with an account for each of the five roles. (The café demo was removed on 4 Nov at Kidd's request.)
- **Also:** a roles editor (permission changes are audited one by one), invitation emails, and editing a sale's customer details.
- **Face check version 2 (5 Nov):** decided on the server with free open models (YuNet, SFace, MiniFASNet), bank-style liveness (a blink, then a random screen-colour sequence the skin must reflect), and only the server may record a pass. See `docs/FACE-V2.md`.
- **Tests: 324 database, 32 unit and 19 end-to-end, all passing. Lint, types and the production build pass.**

## Test results
| File | Tests | Covers |
|---|---|---|
| `01_tenancy` | 25 | Isolation, owner rule, permissions, feature switches, audit log |
| `02_time` | 40 | Server time, no direct writes, breaks, evidence, corrections, change log, team scope, missing time out |
| `03_location` | 26 | Circle and polygon fences, accuracy, freshness, strict and balanced edges, flag and block, impossible travel |
| `04_face` | 21 | Consent, supervised enrollment, unreadable embeddings, one-use challenges, liveness order and timing, wrong face, replays |
| `05_payroll` | 36 | Review and lock, locked periods, hand-worked pay, totals, void and reissue, privacy |
| `06_analytics_demo` | 23 | Hand-checked measures, "not enough data", team-only analytics, demo protection, demo reset |
| `07_invitations` | 11 | Who may invite, hashed one-time tokens, matching email, expiry |
| `08_teams` | 29 | Both templates and their permissions, no manager permission on your own record, area leaders, team visibility by area and by reports, same-business keys, audit of area teams and of permission changes |
| `09_leave` | 27 | Working days, allowance including pending, overlaps, attachments in your own folder, review rules, locked periods, withdrawing |
| `10_sales` | 33 | Product rights, logging, unreadable token hashes, one-use and expiring links, auto-approval, follow-up, corrections, own-sale rule |
| `11_attendance_rules` | 38 | Every daily status, shifts against working days, business rules, earliest time in, paid and unpaid leave and incentives on payslips, leader face enrollment, probation, changing the new settings, audit access |
| Vitest (`src/lib`) | 17 | Formatting, contrast check, analytics flags and forecast |
| Playwright (`e2e`) | 19 | Demo sign-in for all five roles and their menus, a role built in the roles editor and found in the audit trail, an invitation arriving in the test mailbox, redirects, device clock set to 2030, breaks, flagged punch, phone width, a team leader's view, areas, a sale from logging to customer confirmation to approval, leave from request to approval |

## Bugs the tests caught (and fixed)
1. Deleting an entry tried to update append-only evidence through a foreign key. Evidence now keeps the entry ID as a plain value.
2. A table alias clashed with a variable in the payslip function.
3. The payslip totals check read a column that only exists on the lines table.
4. The "no payslip" list skipped invited members.
5. The demo reset failed in four ways during cascading deletes. Each rule now recognises "this whole business is being deleted".
6. The demo seed indexed sample reasons by a row number counted before `limit`, which broke the nightly reset on some days.
7. Logging a sale for a product that needs no customer confirmation crashed, because the token variable was never set.
8. A loop variable named `t` clashed with a column of the same name in a demo seed, so the demo failed to load.
9. A demo leave request was silently dropped whenever its date fell on a Sunday, so the demo looked different depending on the day.
10. Saving settings failed with "permission denied": the new settings columns were missing from the list of columns owners may update. The database tests changed settings as the database owner, so only the browser test caught it; a database test now changes them as a signed-in owner.
11. **Found by the security review plugin:** a manager permission also worked on the holder's own record, so a manager or leader could approve their own correction or timesheet, or edit their own hours, and be paid for them. Since phase 1, the shared permission check refuses your own record for every manager action except the owner's, and a test covers it.
12. **Found by the security review plugin:** the first version of the new face check didn't confirm that every blink and colour frame showed the same person as the still frames, and trusted the phone's labels for which colour each frame was taken under. Every frame is now matched and spoof-checked, and frames must follow the fixed capture schedule exactly.

## Decisions to review
1. **Product name "Crewbase"** is a placeholder, set in one constant: `src/lib/brand.ts`.
2. Failed location checks **flag** by default; failed face checks **block**. Both are per-business settings.
3. Breaks are recorded without location or face checks, so they stay quick.
4. A manager's correction replaces an entry's separate breaks with one total break.
5. Late minutes count from the shift start, but only after the grace minutes (default 15).
6. Monthly-rated staff are paid per scheduled day at the monthly rate × 12 ÷ 261.
7. Sample deductions use generic names with illustrative rates labelled "(sample rate)".
8. **Demo sign-ins:** `owner@demo.crewbase.example`, and the same with `finance`, `hr`, `leader` or `employee` in place of `owner`. The password is `crewbase-demo`, and these accounts can't change their email or password.
9. The original capstone's real names, company and data are not used anywhere.
10. ~~The liveness action "smile" became "open mouth", because the face library has no smile gesture.~~ Replaced by face check v2 (blink and screen colours).
11. ~~The face match threshold defaults to 0.60 and **isn't calibrated on real cameras yet**.~~ Replaced: see decision 25.
12. ~~"Turn left" hasn't been checked on a real camera; if it's mirrored, swap the mappings in `src/lib/face.ts`.~~ Replaced by face check v2.
13. Payroll opens on the newest period.
14. **Two role templates instead of one fixed set.** A café doesn't need leaders of areas and separate finance and HR roles; a field business does. Both are only starting points, and roles can be renamed.
15. **A leader's team is the areas they lead plus their reports.** JedSkies used areas only; keeping reports as well means small businesses without areas still work.
16. **Leave: no overlapping requests, instead of "one pending request at a time".** The JedSkies rule blocked someone from filing next month's holiday while a sick day was pending.
17. **Default leave types:** Sick (5 days, paid), Vacation (5 days, paid), Emergency (unpaid, no limit). They are made-up starting values, not legal entitlements, and each business changes them.
18. **Daily status keeps JedSkies' rules as settings:**
    - absent when someone times in more than 60 minutes after the start (JedSkies' 10:00 for a 9:00 start), or works under 4 hours;
    - half day under 6 hours;
    - status is calculated, never stored, so an approved correction or leave changes it.
19. **Expected days:** a shift, or, in a week with no shifts, the business's working days (Monday to Saturday by default).
20. **The customer must press a button to confirm a sale.** Email security scanners open links on their own and would otherwise confirm sales nobody agreed to.
21. **Price is copied when a sale is logged, and the incentive when it's approved.** Changing a product never rewrites past sales.
22. **Reports, exports and forecasting pages are not built,** following Kidd's direction. The data they need is in place.
23. **Email:** locally it goes to Supabase's test mailbox (http://127.0.0.1:54324). Going live needs an email provider (added to the accounts checklist). Without one, the link is shown on screen.
24. **Roles are named by function, not job title** (Kidd, 4 Nov): Owner, Finance, Human Resources, Leader, Employee. With no operations role, its work is split:
    - areas and teams go to Human Resources;
    - corrections and time edits go to Leaders, for their own team;
    - sales approvals and products go to Finance.
25. **Face check v2 thresholds** (cautious, not yet calibrated): match 0.40 (OpenCV suggests 0.363 for SFace), real face 0.6, same person across frames 0.4, blink dip 0.55, colour correlation 0.5 with a 0.15 lead over the background. Each needs testing with real cameras and people who agree.
26. **Flash liveness is covered by at least one US patent** (US11093773). Fine for a portfolio; check before selling Crewbase.

## Blockers
- None for local work. Pushing, Supabase cloud, Vercel and an email provider wait for Kidd (see `../portfolio-site/docs/ACCOUNTS-CHECKLIST.md`).

## Not done yet
- **Manual liveness spoof test** (criterion 27): needs a person, a camera and made-up face photos.
- **Real-camera check of face check v2** (decision 25): a laptop webcam on localhost works for a first test.
- **Screens:** bracket-table deductions.
- **Reports and exports** (decision 22).

## Next step
1. Kidd: try the demo (`npx supabase start`, `npm run dev`, then http://localhost:3000) and review decisions 14 to 24.
2. Then the coach manager and the medicine tracker.
