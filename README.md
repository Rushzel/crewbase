# Crewbase

A workforce system any business can sign up for. It covers:
- time tracking with boundary and face checks;
- areas with team leaders;
- leave;
- sales with customer confirmation;
- correction requests;
- scheduling;
- payroll with payslips;
- workforce analytics.

Each business sets its own branding, areas, roles, rules and features. Its data is kept separate from every other business by the database.

It's a rebuild of **MyJedSkies**, a team capstone project (four students, July 2025) built for one manpower company. I rebuilt it on my own as a general product, keeping the ideas that worked and fixing what the code review found. See [`docs/CODEBASE-OVERVIEW.md`](docs/CODEBASE-OVERVIEW.md) for the review and [`docs/case-study.md`](docs/case-study.md) for the story.

**All people, businesses and data in this repository are made up.**

## Try it

```bash
npm install                 # also copies the face models into public/models
npx supabase start          # local database in Docker, with migrations and demo data
npm run dev                 # http://localhost:3000
```

Then open the home page and pick a role in **Demo Company**, a made-up field business with three areas: owner, general manager, HR manager, operations manager, team leader or agent.

To sign in by hand, use `owner@demo.crewbase.example`, or replace `owner` with `general-manager`, `hr`, `operations`, `team-leader` or `staff`. The password is `crewbase-demo`. Emails the app sends locally, such as sale confirmation links, appear in Supabase's test mailbox at http://127.0.0.1:54324.

Copy `.env.example` to `.env.local` first; the local values are printed by `npx supabase status`.

## Why the rules live in the database

The original checked rules in PHP controllers and in the browser. Anyone who called the server directly, or edited the page, could skip them. Here every rule that matters is enforced by Postgres, so it holds no matter how the database is reached.

| Rule | Why | Where |
|---|---|---|
| Every table has row-level security keyed on the business | One bug in a query can't leak one client's data to another | All migrations; test `01_tenancy` checks every table |
| Who you can see is worked out once per query: yourself, your reports, the people in areas you lead, or everyone | The first version walked the manager chain for every row read; a page of 500 rows did it 500 times | `private.visible_members()`; test `08_teams` |
| A person and an area must belong to the same business | Enforced by composite foreign keys, so even the database owner can't mix businesses | `member_sites` |
| Members can't write time entries, breaks or evidence; punches are functions that use `now()` | The original trusted a "face verified" flag from the browser; server time also stops clock tricks | `20261028000300_time.sql` |
| Location check in PostGIS with the reading's accuracy and age | The original ignored accuracy, so a reading good to 2 km counted like one good to 5 m | `check_location` |
| Face match done by the database against an embedding nobody can read | The original sent each person's stored face data to their own browser | `face_enrollments` has no select policy |
| One-use, 60-second liveness challenge with the actions in order | A photo held to the camera passed the original's single-frame match | `issue_clock_challenge`, `verify_punch` |
| Blocked attempts are recorded, not just refused | Failed checks are useful evidence and feed the analytics | `clock_events.accepted = false` |
| Corrections carry the times the person says they worked; approval re-checks overlaps | The original guessed times (5:00 AM, 5:00 PM) from keywords in the reason | `submit_request`, `approve_request` |
| Change log, evidence and audit log are append-only | Records of who changed what must not be editable | `block_change` triggers |
| Locked pay periods freeze their entries; final payslips can only be voided with a reason | Pay must be traceable and can't drift after people are paid | `20261028000400_payroll.sql` |
| Payslip totals must equal their lines (checked at commit) | A total that doesn't match its lines is always a bug | `check_payslip_totals` |
| A business always keeps an active owner | Nobody can lock everyone out | `keep_an_owner` |
| Switching a feature off makes its functions refuse calls | Hiding a button isn't a permission | `require_feature` |
| Leave can't overlap, stays within the yearly allowance (checked again on approval) and can't be approved inside a locked pay period | The original allowed one pending request and checked nothing else | `20261104000100_leave.sql` |
| A sale's price comes from the product, the customer confirms with a one-use link whose hash nobody can read, and nobody approves their own sale | The original approved sales on the agent's word | `20261104000200_sales.sql` |
| Present, late, half day and absent are calculated from the business's rules, never stored | The original stored a status when someone timed in, so a correction left it wrong | `attendance_days` |

The interface hides what you can't do, but only for convenience. The database is the authority.

## Design decisions and why

- **Multi-business by row-level security, not one database per client.** One schema is cheaper to run and change. Isolation is proven by tests instead of assumed.
- **Fixed permissions, custom roles.** Businesses name their own roles ("Shift lead", "Team leader") from a fixed list of permissions, so the database knows exactly what each permission means. Each role also has a scope: only themself, their team, or everyone.
- **Two starting templates.** "Small team" (owner, manager, employee) suits a café. "Field teams" has JedSkies' structure: general manager, HR manager, operations manager, team leaders and staff. A business can rename and change both.
- **A team is the areas you lead plus your reports.** Field businesses organise by area, as JedSkies did; small businesses organise by who reports to whom. One rule covers both.
- **Failed location checks flag, failed face checks block (by default).** Location fails for honest reasons (indoors, weak signal), so it goes to a manager instead of stopping work. A face mismatch is much stronger evidence. Both are settings.
- **Balanced and strict edge rules.** Balanced accepts a reading just outside the fence when its accuracy circle reaches inside; strict needs the whole accuracy circle inside. Businesses with tight sites can choose strict.
- **Liveness in the browser, with the server in charge.** A paid liveness service needs approval and costs money per check. The browser runs anti-spoofing and liveness models, but the server issues the challenge, checks the order and timing, and matches the face. The limit is written down instead of hidden (see below).
- **Timesheet approval before payroll.** The original business's team leaders checked each person's daily time record against their own notes by hand in chat. Here the manager approves a timesheet on one screen, and a period can't lock until every timesheet is approved (or the owner overrides with a reason).
- **Pay calculated day by day.** A raise in the middle of a period applies only from its date, and payslips keep a snapshot of the rates they used.
- **Analytics that are fair and explained.** People are compared with their team's median, not raw totals; under 10 days shows "not enough data"; every flag names the rule that raised it; the forecast states its method and range. The original's forecast called a placeholder web address, so it always used a fallback.
- **Money in whole centavos.** No floating-point rounding errors; each line rounds half-up.

## Honest limits

- **Location:** a browser can't detect a fake-location app. Accuracy, freshness and impossible-travel checks raise the effort, and flagged punches go to a manager.
- **Liveness:** it runs on the person's device, so someone who rewrites the page could send a forged result. The one-use challenge, the timing check, the replay check and the evidence trail make that detectable, not impossible. It isn't a certified biometric product.
- **Sign-in lockout and idle timeout** (asked for in the original test report) depend on Supabase plan features; the free plan has rate limiting but not an exact 5-attempt lock.
- **Sample deductions** use generic names and illustrative rates labelled "(sample rate)". They are not current legal contribution or tax rates.
- **Email:** confirmation links go to a local test mailbox. Going live needs an email provider; without one, the link is shown on screen to share.
- **Not built yet:**
  - reports and exports;
  - shifts that cross midnight;
  - offline punches, since they can't use the server's time.

## Tests

| Suite | Command | Result |
|---|---|---|
| Database (pgTAP) | `npm run test:db` | 302 passing. Covers isolation, permissions, team visibility, time, location, face and liveness, and corrections. Also payroll worked examples (including leave and incentives), leave rules, sales and confirmation links, daily status, probation, analytics, the demo reset and invitations. |
| Unit (Vitest) | `npm test` | 17 passing: formatting, contrast check, analytics flags and forecast |
| End-to-end (Playwright) | `npm run test:e2e` | 18 passing. Covers demo sign-in for all six roles and their menus, the clock ignoring a device set to 2030, breaks, a flagged punch, and phone width. Also a team leader seeing only their area, a sale going from logged to customer confirmation to approval, and leave going from request to approval. |

The payroll tests use hand-calculated examples, for example: 16 regular hours at ₱100 plus 2 overtime hours at 1.25× is ₱1,850 gross; less a ₱50 fund and 10% tax is ₱1,615 net.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind CSS 4) · Supabase (Postgres 17, Auth, row-level security, PostGIS, `pg_cron`) · `@vladmandic/human` for face and liveness in the browser · Leaflet and OpenStreetMap for maps · `@react-pdf/renderer` for payslips · Vitest, Playwright, pgTAP · GitHub Actions · Vercel.

## Project layout

```
supabase/migrations/   the schema, rules and functions (start here)
supabase/tests/        pgTAP tests, one file per area
src/app/               screens and server actions
src/lib/               Supabase clients, formatting, face and location capture, analytics
e2e/                   Playwright tests
docs/                  codebase overview, specification, data model, acceptance criteria, tasks, case study
```
