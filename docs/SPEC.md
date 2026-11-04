# Workforce system: specification

**Status: draft for Kidd's review.** Working name "Workforce", to be renamed (see Decisions to review).

A multi-business enterprise resource planning system for workforce operations, rebuilt from the lessons in `CODEBASE-OVERVIEW.md`. Any business can sign up and set up its own branding, sites, roles, settings and features. Employees time in and out at a site with a geofence check and a face check that includes liveness. Pay periods turn approved hours into payslips. Managers get workforce analytics. Every rule that matters is enforced in Postgres, not in the interface.

## Sources

- The original code (`CODEBASE-OVERVIEW.md`).
- The capstone manuscript (July 2025): objectives, scope, conclusions and recommendations. Its recommendations were a phone-first app for better face and location accuracy, and an online employee portal for records, payroll and performance. Both are in this version.
- The operations and payroll process notes: twice-monthly cut-offs (1st to 15th, 16th to month end); team leaders validate each person's daily time record against their own daily summary; records are consolidated and approved before payroll; benefits are deducted; payslips go to each employee.
- The user acceptance test report (cycle 2): payroll deductions for absences and tardiness, payroll locked after approval, account lockout, idle timeout.
- The standalone time tracker spec (`../SPEC.md`).

Only behaviour is taken from these. No names, people, client details, credentials or data.

## 1. Goals and non-goals

**Goals**
1. A client business can sign up, configure itself and run time tracking, corrections, payslips and analytics with no help from a developer.
2. Each business's data is invisible to every other business, enforced by row-level security on every table.
3. A time punch can't be faked by editing the page or calling the database directly. The time comes from the server, and the location and face evidence is checked by database functions.
4. A payslip can be traced line by line back to the time entries and rates it came from, and can't be changed once final.
5. Visitors to the portfolio can try it as an owner, a manager and an employee using sample accounts.

**Non-goals for the first version**
- Government filing and remittance (tax returns, social security, health insurance and housing fund submissions).
- Bank transfers or real payment of salaries.
- Native phone apps. The web app works on phones in the browser.
- Certified presentation-attack detection. The liveness check is a strong deterrent, not a certified biometric product (section 6).
- Shifts that cross midnight. Planned for version 2, because they change how a work date is assigned.

## 2. Stack

| Piece | Tool | Why |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, Tailwind CSS | Industry standard; server components keep keys off the browser |
| Database, sign-in, permissions, files | Supabase: Postgres, Supabase Auth, row-level security, Storage, `pg_cron` | Rules live next to the data; one free project covers everything |
| Location maths | PostGIS (Supabase extension) | Accurate distance and polygon checks on the real shape of the Earth, not flat-plane maths |
| Face and liveness | `@vladmandic/human` (maintained successor to `face-api.js`) or MediaPipe Face Landmarker plus a face embedding model, in the browser | No paid service, no third-party biometric processing; chosen during task 6 after a short spike |
| Maps | Leaflet with OpenStreetMap tiles | Free, no key, already used by the original |
| PDF payslips | `@react-pdf/renderer` on the server | Selectable, multi-page documents, not screenshots |
| Tests | pgTAP database tests, Vitest unit tests, Playwright end-to-end tests | Database rules are tested where they live |
| Automation | GitHub Actions | Runs all tests on every push; deploys only on green |
| Hosting | Vercel (Hobby) | Free for personal, non-commercial use |

## 3. Businesses (tenants)

- A **business** (`organizations`) is the unit of isolation. Every business-owned row carries `org_id`.
- A person signs in once (Supabase Auth) and can belong to more than one business through `memberships`. The app shows a business switcher when they belong to several.
- **Sign-up:** create an account, then `create_organization(name, slug, timezone, currency)` makes the business, a default set of roles and settings, and makes the caller its owner.
- **Branding:** logo (Storage), primary colour, display name. Applied as CSS variables, so every screen follows the business's colours. A colour contrast check rejects colours that would make text unreadable.
- **Settings** (one row per business, typed columns, not loose key-value text): timezone, currency, week start, pay frequency (weekly, every two weeks, twice a month, monthly), grace minutes, regular hours per day, overtime multiplier, rounding rule, face match strictness, location accuracy limit, location strictness, liveness on or off.
- **Features** that can be switched on or off: time tracking, face verification, geofence, breaks, correction requests, scheduling, payroll, analytics, output tracking. Switching a feature off hides it in the interface **and** makes its database functions refuse calls.

## 4. Roles and permissions

Permissions are a fixed list defined by the system. Each business creates roles as named sets of those permissions. Three default roles are created at sign-up.

| Permission | Owner | Manager | Employee |
|---|---|---|---|
| `time.clock` (own punches) | yes | yes | yes |
| `time.view_own` | yes | yes | yes |
| `time.view_team` (people they manage, or all) | all | team | no |
| `time.edit` (edit or add entries, with reason) | yes | team | no |
| `requests.review` | yes | team | no |
| `schedule.manage` | yes | team | no |
| `payroll.run` | yes | no | no |
| `payroll.view_own` | yes | yes | yes |
| `people.manage` (invite, deactivate, set rates) | yes | no | no |
| `sites.manage` (sites and geofences) | yes | no | no |
| `settings.manage` (branding, features, roles) | yes | no | no |
| `analytics.view` | all | team | own |
| `face.enroll_others` (supervised enrollment) | yes | team | no |

- "Team" means members whose `manager_id` chain leads to the caller.
- One helper, `has_permission(org_id, permission)`, is used by every policy and function, so a permission is checked the same way everywhere.
- A business can't be left without an active owner (rule 12).

## 5. Time tracking

Inherits the time tracker rules from `../SPEC.md` (the earlier standalone spec), extended for many businesses, sites and evidence.

- **Entries:** one row per time in to time out; a day can have several; breaks are separate rows.
- **Punches** are database functions: `clock_in(site_id, evidence)`, `start_break()`, `end_break()`, `clock_out(evidence)`. They use `now()`. The browser never sends a time.
- **Work date** is the date at the site's timezone when the entry started.
- **Evidence:** every punch writes a `clock_events` row with server time, the location reading and its accuracy, the geofence result, the face match result, the liveness result and the challenge used. Evidence is append-only.
- **Policy per business:** whether a failed check **blocks** the punch or **allows it and flags it** for review. Default: block on face failure, flag on location failure (location fails more often for honest reasons, such as indoors or poor signal).
- **Corrections:** members request changes, with a reason. Approval goes through a function that re-checks overlaps, applies the change and writes the change log. Requests carry the times the member says they worked; nothing is guessed from text (fixes problem 10 in the overview).
- **Missing time out:** a scheduled job marks entries still open after the site's day ends as `missing_out` with 0 hours until corrected.
- **Schedules (optional feature):** planned shifts per member and site. They power lateness and "hours against schedule" analytics. Without schedules, lateness uses the business's default start time.

## 6. Location and face checks (upgraded)

### Location
1. The page takes readings for up to 10 seconds with `enableHighAccuracy` and keeps the most accurate one.
2. It sends latitude, longitude, the **accuracy radius** in metres and the reading's age.
3. `clock_in` checks, in PostGIS:
   - the reading is under 30 seconds old;
   - accuracy is within the site's limit (default 50 m);
   - **strict mode:** the whole accuracy circle is inside the geofence. **Balanced mode (default):** the point is inside, or within the accuracy radius of the edge;
   - **impossible travel:** speed implied since the member's previous punch is under 200 km/h.
4. The result, the distance to the fence edge and the reason for any failure are stored with the punch.
5. Geofences are a circle (centre and radius) or a polygon drawn on a map, one or more per site.

Honest limit: a browser can't detect a fake-location app. The accuracy, freshness and travel checks raise the effort, and flagged punches go to a manager. The README says so.

### Face and liveness
1. **Enrollment:** guided capture of 5 frames at different angles, with consent recorded first. The browser computes embeddings; a database function stores their average. **Enrolled embeddings can never be read back by anyone through the app**: no select policy, only `security definer` functions use them (fixes problems 1 and 2). No photo is kept from enrollment.
2. **Challenge:** at clock in, the server issues a challenge: a random order of two actions from blink, turn left, turn right and smile, a one-time code and a 60-second expiry.
3. **Liveness in the browser:** the page tracks face landmarks and expression scores frame by frame and checks that the actions happen in the issued order, with natural timing, by one face that stays in view. It also runs a passive anti-spoofing model where the library offers one.
4. **Match on the server:** the page sends the challenge code, a live embedding taken during the challenge and the liveness summary. `clock_in` checks the code is unused and unexpired, compares the embedding with the enrolled one (cosine similarity against the business's threshold) and rejects an embedding identical to a previous one (replays of a captured number list).
5. **Audit frame (optional per business):** one small still frame per punch, kept 30 days in a private Storage bucket that only managers of that member can read.

Honest limit: liveness that runs in the browser stops photos, phone screens and casual cheating, but a person who rewrites the page's code could still send a forged result. The server-side challenge, the replay check and the audit frame make that detectable. A paid, server-side liveness service is listed as an upgrade path, not used.

## 7. Payroll

- **Pay periods** follow the business's frequency (twice a month is the default, matching the original business's cut-offs). Status: `open` → `in_review` → `locked` → `finalized`.
- **Timesheet approval** (replaces the team leaders' manual check of daily time records against their summaries): when a period closes, each manager approves their team's timesheets. The system shows each person's days, flags and open requests side by side, so the check that used to be done by hand in chat takes one screen. A period can only lock when every timesheet is approved, or an owner overrides with a reason.
- **Locking** a period blocks edits to its entries and correction approvals (database trigger). Unlocking needs a reason and is logged.
- **Rates** per member, with an effective date: hourly, daily or monthly. History is kept, so a past payslip uses the rate valid at the time.
- **Earnings:** regular hours (up to the daily regular hours), overtime (the rest, times the overtime multiplier), and allowances.
- **Time-based deductions** for daily and monthly rated staff: absences on scheduled days (days times the daily rate) and tardiness (late minutes times the hourly equivalent), each shown as its own line with the count, for example "Tardiness, 67 min". Hourly staff are simply paid for hours worked.
- **No attendance, no payslip:** a member with no worked time and no paid leave in the period gets no payslip, and the review screen lists them so it's a visible decision.
- **Deductions:** rules defined per business: fixed amount, percentage of gross, or bracket table. The sample business ships with **illustrative** rules labelled "sample rates, check current law before use". The system doesn't claim to compute government contributions correctly.
- **Generation:** `generate_payslips(period_id)` builds a draft payslip per member from closed entries in a locked period. Each payslip stores a snapshot of the rates and rules it used, and line items referencing the entries.
- **Finalising** makes payslips read-only for everyone. A mistake is fixed by voiding with a reason and generating again, never by editing.
- **Money** is stored in the smallest currency unit (centavos) as whole numbers, and rounding is half-up per line.
- **Payslip PDF:** business branding, period, hours breakdown, earnings, deductions, net pay, "Generated on" line. Employees download their own from the portal, which replaces sending payslips one by one through chat.
- **Payroll register PDF and spreadsheet:** one row per member with totals, for the owner.

## 8. Workforce analytics (improved)

The original measured only sales application counts. The new analytics measure the workforce itself, per member, team, site and business:

| Measure | Definition |
|---|---|
| Attendance rate | Scheduled days worked ÷ scheduled days (or working days without schedules) |
| Punctuality | Share of days on time; median minutes late on late days |
| Hours against schedule | Worked hours ÷ scheduled hours |
| Overtime share | Overtime hours ÷ worked hours |
| Missing time out rate | Entries ending `missing_out` ÷ entries |
| Correction rate | Approved corrections ÷ entries |
| Verification failure rate | Punches with a failed or flagged face or location check ÷ punches |
| Output (optional feature) | A count the business defines (for example "orders packed" or "sales leads"), logged by members or managers; shown per worked hour |
| Output against target (optional) | Output ÷ the target for the member's employment type (for example provisional or regular), as the capstone's objectives asked for |

Improvements over the original:
- **Fair comparisons:** each member is compared with the median of their own team and site, not raw totals.
- **Small samples are marked:** a measure based on fewer than 10 days shows "not enough data" instead of a number that looks precise.
- **Trends** use a rolling 4-week window against the previous 4 weeks.
- **Forecast** of hours and attendance with an explained method (seasonal average with a range), replacing the placeholder forecasting service. The page says how the forecast was made and how wide the range is.
- **Explainable flags:** each "needs attention" flag states the rule that raised it, for example "punctuality under 80% for 3 weeks".
- Analytics read from views and functions that respect row-level security, so a manager's dashboard can't include people outside their team.

## 9. Screens

- **Public:** sign in, sign up (business), accept invitation, demo sign-in buttons.
- **Today:** clock with time in, break and time out; the location and face steps; today's entries; week chart.
- **History:** entries by month, correction requests, manager edits with reason.
- **Requests:** member's own requests; manager review queue.
- **People board:** who's working, on break, out, or not in, with the latest punch and any flags.
- **Schedule:** week grid per site.
- **Payroll:** periods, lock, generate, review drafts, finalise, download payslips; employees see their own payslips.
- **Analytics:** business, team and member views.
- **Settings:** branding, sites and geofence map editor, roles and permissions, features, time and pay rules, deduction rules, members and rates.
- **Face enrollment:** self or supervised, with consent.

Design follows Kidd's preferences: clean, Apple-like, the business's one accent colour, durations as `7h 06m`, dates day-first (`21 Oct 2026`).

## 10. Rules enforced in the database

1. Row-level security is on for every table. Every policy checks `org_id` membership, and no policy grants access across businesses.
2. Punches only through functions that use server time. Members have no insert, update or delete rights on entries, breaks or evidence.
3. One open entry per member; entries on the same day can't overlap; time out after time in; breaks inside their entry.
4. Clock in is refused when the business has the time tracking feature off, the member is inactive, or the member isn't assigned to the site.
5. Location checks (section 6) run inside `clock_in` with PostGIS, using the site's geofences and the business's settings.
6. Face checks (section 6) run inside `clock_in`; enrolled embeddings are never selectable; a challenge code works once and only before it expires.
7. One pending correction request per entry; approval re-checks validity and writes exactly one change log row.
8. The change log, the clock event evidence and the audit log are append-only for everyone.
9. Entries in a locked or finalized pay period can't be changed.
10. Finalized payslips and their lines can't be updated or deleted; only voided through a function with a reason.
11. Payslip totals equal the sum of their lines (checked by a constraint trigger).
12. A business always has at least one active owner.
13. Switching off a feature makes its functions refuse calls.
14. Demo accounts can't change their email or password, or delete the business.
15. Every table has explicit grants, as required for Supabase projects created after 30 May 2026.
16. Output records can only be edited on the day they were logged (from the test report); after that, only through a correction.

**Sign-in rules** (Supabase Auth, not tables): lock an account for 15 minutes after 5 failed attempts, and sign out after 30 minutes idle. Supabase rate-limits sign-in attempts by default. An exact 5-attempt lock needs an authentication hook, and the idle timeout needs a session setting, which may require a paid plan. Task 3 checks this, and if they aren't free, the README states the gap instead of faking it in the page.

## 11. Demo and sample data

- One made-up business, **Demo Company**: field employees in three polygon areas, leaders, daily-rate pay (updated 4 Nov 2026; the first version had two businesses, and the café was removed at Kidd's request).
- 18 made-up members and 8 weeks of entries with realistic variety. Also leave, customer applications at every stage, flagged and blocked punches, pending corrections, and one finalized and one open pay period.
- One demo account per role: Owner, Finance, Human Resources, Leader, Employee. The portfolio page signs visitors in with one click. Isolation between businesses is shown by the database tests rather than a second demo.
- Demo data resets every night.
- **Faces:** see Decisions to review. No real person's face is seeded.
- Every sample name is invented and marked as sample data.

## 12. Decisions to review

1. **Names:** "Workforce" is a placeholder. Pick the product name.
2. **How visitors try the face check:** seeded demo employees have made-up faces, so a visitor's real face can't match them. Options:
   - (a) **Recommended:** the visitor enrolls their own face into a temporary demo seat. Only the number list is stored, never a photo, and it's deleted after 24 hours; consent is shown first.
   - (b) A "sample camera" mode that plays a short generated video of a made-up face instead of the webcam.
   - (c) Both.
3. **Failed location policy default:** flag (recommended) or block.
4. **Sample deduction rules:** use Philippine-style categories with illustrative rates clearly labelled as samples (recommended), or generic "Tax" and "Benefits" lines only.
5. **Leave management** from the original: include in version 1, or after.
6. **The standalone time tracker in `../SPEC.md`:** fold it into this system as the time module (recommended, the rules are the same), or also ship it as its own small demo.
7. **The original Laravel app in Docker** (Laravel Sail): only worth doing if you want to show it as the "before" version. It needs Docker and stays in its own repository.
8. **Credit for the original:** the capstone was a four-person team project for a real client. The case study will say "rebuilt on my own from a team capstone" and credit the team without naming members unless you say so. The real company's name stays out of the product and the demo. Decide whether the case study may name the company.
9. **A newer version of the original?** The test report (cycle 2, September 2025) describes a test deployment on Vercel, a Human Resources Manager role, account lockout and a payroll module with government contributions. None of these are in `github.com/Rushzel/Jedskies` (your only public repository). If that version's code exists in another repository, send the link and I'll update the overview. If the report describes planned features, the overview stands.
10. **Offline punches:** the capstone recommended offline use. A punch made offline can't use server time, which breaks rule 2. Proposal: no offline punches; the app can be installed on a phone's home screen and works offline for reading history only.
