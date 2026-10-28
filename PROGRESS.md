# Progress

Updated 28 Oct 2026.

## Done
- Planning: codebase overview, specification, data model, acceptance criteria, task list (`docs/`).
- Skeleton: Next.js 16.4 (App Router, TypeScript, Tailwind CSS 4), Supabase local stack in Docker, Vitest, Playwright.
- Database, 6 migrations: businesses and roles; sites and PostGIS geofences; time core with evidence, face enrollment and liveness challenges; scheduling and payroll; invitations, analytics and output tracking; demo data with a nightly reset.
- Screens: home with demo buttons, sign-in, sign-up, business setup, Today (clock with location and face steps), History, Requests, People, Schedule, Payslips (with PDF), Payroll, Analytics, Face check enrollment, Settings.
- Continuous integration workflow and keep-alive workflow (files only; they run once the repository is on GitHub).
- README with the reasons for each rule, and the case study.
- Settings: General, People and pay (invite, role, manager, status, pay rates), Sites and geofences (Leaflet map editor for circles and polygons), Deductions. Invitation acceptance page.
- **Tests: 182 database, 17 unit, 13 end-to-end, all passing. Production build passes.**

## Test results
| File | Tests | Covers |
|---|---|---|
| `01_tenancy` | 25 | Isolation, owner rule, permissions, feature switches, audit log |
| `02_time` | 40 | Server time, no direct writes, breaks, evidence, corrections, change log, team scope, missing time out |
| `03_location` | 26 | Circle and polygon fences, accuracy, freshness, strict and balanced edges, reference check, flag and block, impossible travel |
| `04_face` | 21 | Consent, supervised enrollment, unreadable embeddings, one-use and expiring challenges, liveness order and timing, wrong face, replays |
| `05_payroll` | 36 | Review and lock steps, locked periods, hand-worked pay for hourly, daily (absence, tardiness) and mid-period raise, totals, void and reissue, privacy |
| `06_analytics_demo` | 23 | Hand-checked measures, "not enough data", team-only analytics, demo account protection, demo reset |
| `07_invitations` | 11 | Who may invite, hashed one-time tokens, matching email, expiry |
| Vitest (`src/lib`) | 17 | Formatting, contrast check, analytics flags and forecast |
| Playwright (`e2e`) | 13 | Demo sign-in for all six accounts, navigation by role, redirects, device clock set to 2030, breaks, flagged punch outside the fence, phone width |

## Bugs the tests caught (and fixed)
1. Deleting an entry tried to update append-only evidence through a foreign key. Evidence now keeps the entry ID as a plain value.
2. A table alias clashed with a variable in the payslip function.
3. The payslip totals check read a column that only exists on the lines table.
4. The "no payslip" list skipped invited members.
5. The demo reset failed in four ways during cascading deletes (audit rows, the output same-day rule, append-only tables, reviewer foreign keys). Each rule now recognises "this whole business is being deleted".
6. The demo seed indexed sample reasons by a row number counted before `limit`, which broke the nightly reset on some days.

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
10. The liveness action "smile" became "open mouth": the face library reports mouth opening reliably but has no smile gesture.
11. Face match threshold default 0.60 (cosine similarity). **Not yet calibrated on real cameras**; it's a per-business setting.
12. "Turn left" uses the library's "facing left" gesture. Whether that means the person's left or the camera's left hasn't been checked on a real camera; if it's mirrored, swap the two mappings in `src/lib/face.ts`.
13. Payroll opens on the newest period (usually the open one).

## Blockers
- None for local work. Pushing, Supabase cloud and Vercel wait for Kidd (see `../portfolio-site/docs/ACCOUNTS-CHECKLIST.md`).

## Not done yet
- Manual liveness spoof test (criterion 27): needs a person, a camera and made-up face photos.
- A roles editor screen (roles and permissions can be changed through the database with policies, but there's no screen yet) and bracket-table deductions in the screen (fixed and percent only).
- Sending invitation emails: needs an email service; for now the owner copies the link shown once.
- Real-camera check of the face flow (see decisions 11 and 12).

## Next step
1. Kidd: review decisions above and in `docs/SPEC.md`; try the demo locally (`npx supabase start`, `npm run dev`).
2. Build the remaining settings screens, then the coach manager and the medicine tracker.
