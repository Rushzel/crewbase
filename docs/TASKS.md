# Workforce system: tasks, in order

Tick a task only when its "Done when" is true, then commit. Tasks marked **needs Docker** can't run until Docker Desktop is installed. Tasks marked **needs Kidd** wait for an account or decision.

## 0. Planning (this commit)
- [x] Codebase overview, specification, data model, acceptance criteria, this task list.
- [ ] **Needs Kidd:** review `SPEC.md` decisions, `ACCEPTANCE-CRITERIA.md` and `PROGRESS.md` decisions.

## 1. Skeleton
- [x] Next.js (App Router, TypeScript, Tailwind CSS, ESLint), Vitest, Playwright, Prettier. `.gitignore` covers `.env*`.
- [x] `supabase init`; local config with PostGIS and `pg_cron` turned on.
  - Done when: `npm run build`, `npm run lint` and `npm test` pass.

## 2. Database core (**needs Docker** to run; can be written before)
- [x] Migration: businesses, settings, features, roles, permissions, memberships, invitations, explicit grants.
- [x] Migration: `has_permission`, row-level security on every table, `create_organization`.
- [x] pgTAP: criteria 1 to 3, 5 to 7.

## 3. Sign-in
- [x] Supabase Auth email and password; business switcher; invitation acceptance; inactive members blocked.
  - Note: invitation acceptance exists in the database (`accept_invitation`); the invite screen and email are not built (needs an email service).
- [x] Lockout and idle timeout: documented as a limit in the README (exact 5-attempt lock needs an auth hook or paid feature).

## 4. Sites and geofences
- [x] Migration: sites, geofences (PostGIS), member sites. Map editor (Leaflet) for circles and polygons.
  - Note: geofences are created through `add_circle_geofence` and `add_polygon_geofence`; the map editor screen is **not built yet**. Settings lists sites and their fences.
- [x] `check_location` function and pgTAP for criteria 15 to 21, including the near-edge reference points.

## 5. Time core
- [x] Migration: entries, breaks, clock events, change log, correction requests, append-only triggers.
- [x] Punch functions with server time; `close_missing_out` on `pg_cron`.
- [x] pgTAP: criteria 8 to 14, 29 to 32.

## 6. Face and liveness
- [x] Spike: chose `@vladmandic/human` 3.3 (one library with face embedding, anti-spoofing and liveness models; maintained successor of `face-api.js`). **Not yet measured on a real phone camera** (no camera in this environment).
- [x] Challenge table and functions; enrollment with consent; server-side matching and replay check.
- [x] Browser liveness flow with clear on-screen prompts and accessible fallbacks.
- [x] pgTAP: criteria 22 to 26, 28.
- [ ] Manual spoof test for criterion 27, with made-up faces only. **Needs a person with a camera.**

## 7. Screens
- [x] Today, History, Requests, People board, Schedule (one commit each).

## 8. Payroll
- [x] Migration: rates, periods, approvals, deduction rules, payslips, lines; lock and finalize triggers.
- [x] `generate_payslips` with worked examples; payslip and register PDFs.
  - Note: payslip PDF done; the register is the Payroll table with totals (no separate register PDF yet).
- [x] pgTAP and Vitest: criteria 33 to 40.

## 9. Analytics
- [x] Fact view and metric views with `security_invoker`; analytics screens; forecast with range and method note.
- [x] Tests: criteria 41 to 43.

## 10. Settings and branding
- [x] Branding with contrast check, features, time and check rules; roles and sites shown.
- [ ] Roles editor, deduction rules editor, members and rates editor, invite screen (database functions and policies exist; screens not built).

## 11. Sample data and demo
- [x] Seed two made-up businesses (SPEC section 11); `reset_demo_data` on a nightly schedule.
- [x] Demo sign-in endpoint for the portfolio page; demo account restrictions.
- [x] Tests: criteria 44 to 46.

## 12. Continuous integration (file only until GitHub exists)
- [x] `.github/workflows/ci.yml`: install, lint, build, start Supabase, database tests, unit tests, Playwright.
- [x] Weekly scheduled workflow that keeps the free Supabase project from pausing (it pauses after 7 idle days).

## 13. Documentation
- [x] README: what it is, why each rule is in the database, the honest limits of location and liveness checks, how to run locally, test results.
- [x] `docs/case-study.md`: problem, analysis, data model, solution, results; credits the original team capstone.

## Needs Kidd
- [ ] GitHub repository and push.
- [ ] Supabase cloud project, keys into Vercel and GitHub secrets.
- [ ] Vercel project.
- [ ] Optional: the original Laravel app in Docker with Laravel Sail, as the "before" version.

## Later
- [ ] Contracts, vendors and change governance, as planned in `LATER-MODULES.md`. Each needs acceptance criteria and database tests first.
