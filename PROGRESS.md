# Progress

Updated 28 Oct 2026.

## Done
- Planning: codebase overview, specification, data model, acceptance criteria, task list (`docs/`).
- Skeleton: Next.js 16.4 (App Router, TypeScript, Tailwind CSS 4), Supabase local stack in Docker, Vitest, Playwright.
- Database, 6 migrations: businesses and roles; sites and PostGIS geofences; time core with evidence, face enrollment and liveness challenges; scheduling and payroll; invitations, analytics and output tracking; demo data with a nightly reset.
- Database tests: **171 pgTAP tests pass** (`npx supabase test db`), covering acceptance criteria 1 to 26, 28 to 43, 45 and 46.

## Test results
| File | Tests | Covers |
|---|---|---|
| `01_tenancy` | 25 | Isolation, owner rule, permissions, feature switches, audit log |
| `02_time` | 40 | Server time, no direct writes, breaks, evidence, corrections, change log, team scope, missing time out |
| `03_location` | 26 | Circle and polygon fences, accuracy, freshness, strict and balanced edges, reference check, flag and block, impossible travel |
| `04_face` | 21 | Consent, supervised enrollment, unreadable embeddings, one-use and expiring challenges, liveness order and timing, wrong face, replays |
| `05_payroll` | 36 | Review and lock steps, locked periods, hand-worked pay for hourly, daily (absence, tardiness) and mid-period raise, totals, void and reissue, privacy |
| `06_analytics_demo` | 23 | Hand-checked measures, "not enough data", team-only analytics, demo account protection, demo reset |

## Bugs the tests caught (and fixed)
1. Deleting an entry tried to update append-only evidence through a foreign key. Evidence now keeps the entry ID as a plain value.
2. A table alias clashed with a variable in the payslip function.
3. The payslip totals check read a column that only exists on the lines table.
4. The "no payslip" list skipped invited members.
5. The demo reset failed in four ways during cascading deletes (audit rows, the output same-day rule, append-only tables, reviewer foreign keys). Each rule now recognises "this whole business is being deleted".

## Decisions to review
1. **Product name "Crewbase"** (placeholder, set in one constant: `src/lib/brand.ts`).
2. Failed location checks **flag** by default; failed face checks **block**. Both are per-business settings.
3. Breaks are recorded without location or face checks, to keep breaks quick. Time in and time out are fully checked.
4. A manager's correction or edit replaces an entry's separate breaks with one total break, so edited days show "Break 60 min" instead of the individual breaks.
5. Late minutes count from the shift start, but only when the person is later than the grace minutes (default 15).
6. Monthly-rated staff are paid per scheduled day at the monthly rate × 12 ÷ 261, so absences and mid-period raises work the same way as for daily-rated staff.
7. Sample deductions use generic names (social security, health insurance, housing fund, withholding tax) with illustrative rates labelled "(sample rate)", not real agency names or current legal rates.
8. Demo sign-ins: `owner.harbor@crewbase.example`, `manager.harbor@…`, `employee.harbor@…` (and `.northgate`), password `crewbase-demo`. They can't change their email or password.
9. The original capstone's real names, company and data are not used anywhere. All demo people are invented.

## Blockers
- None for local work. Pushing, Supabase cloud and Vercel wait for Kidd (see `../portfolio-site/docs/ACCOUNTS-CHECKLIST.md`).

## Next step
Build the screens (sign-in, Today with the location and face steps, History, Requests, People, Schedule, Payroll, Analytics, Settings), then Playwright tests for criteria 4, 8, 27 (manual), and 44.
