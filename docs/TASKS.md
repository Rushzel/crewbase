# Workforce system: tasks, in order

Tick a task only when its "Done when" is true, then commit. Tasks marked **needs Docker** can't run until Docker Desktop is installed. Tasks marked **needs Kidd** wait for an account or decision.

## 0. Planning (this commit)
- [x] Codebase overview, specification, data model, acceptance criteria, this task list.
- [ ] **Needs Kidd:** review `SPEC.md` decisions and `ACCEPTANCE-CRITERIA.md`.

## 1. Skeleton
- [ ] Next.js (App Router, TypeScript, Tailwind CSS, ESLint), Vitest, Playwright, Prettier. `.gitignore` covers `.env*`.
- [ ] `supabase init`; local config with PostGIS and `pg_cron` turned on.
  - Done when: `npm run build`, `npm run lint` and `npm test` pass.

## 2. Database core (**needs Docker** to run; can be written before)
- [ ] Migration: businesses, settings, features, roles, permissions, memberships, invitations, explicit grants.
- [ ] Migration: `has_permission`, row-level security on every table, `create_organization`.
- [ ] pgTAP: criteria 1 to 3, 5 to 7.

## 3. Sign-in
- [ ] Supabase Auth email and password; business switcher; invitation acceptance; inactive members blocked.
- [ ] Check lockout and idle timeout options on the free plan; build or document (SPEC section 10).

## 4. Sites and geofences
- [ ] Migration: sites, geofences (PostGIS), member sites. Map editor (Leaflet) for circles and polygons.
- [ ] `check_location` function and pgTAP for criteria 15 to 21, including the near-edge reference points.

## 5. Time core
- [ ] Migration: entries, breaks, clock events, change log, correction requests, append-only triggers.
- [ ] Punch functions with server time; `close_missing_out` on `pg_cron`.
- [ ] pgTAP: criteria 8 to 14, 29 to 32.

## 6. Face and liveness
- [ ] Spike (half a day): compare `@vladmandic/human` with MediaPipe plus an embedding model on a mid-range phone; record speed, size and accuracy in `docs/decisions/face-library.md`.
- [ ] Challenge table and functions; enrollment with consent; server-side matching and replay check.
- [ ] Browser liveness flow with clear on-screen prompts and accessible fallbacks.
- [ ] pgTAP: criteria 22 to 26, 28. Manual spoof test for criterion 27, with made-up faces only.

## 7. Screens
- [ ] Today, History, Requests, People board, Schedule (one commit each).

## 8. Payroll
- [ ] Migration: rates, periods, approvals, deduction rules, payslips, lines; lock and finalize triggers.
- [ ] `generate_payslips` with worked examples; payslip and register PDFs.
- [ ] pgTAP and Vitest: criteria 33 to 40.

## 9. Analytics
- [ ] Fact view and metric views with `security_invoker`; analytics screens; forecast with range and method note.
- [ ] Tests: criteria 41 to 43.

## 10. Settings and branding
- [ ] Branding with contrast check, features, roles editor, time and pay rules, deduction rules, members and rates.

## 11. Sample data and demo
- [ ] Seed two made-up businesses (SPEC section 11); `reset_demo_data` on a nightly schedule.
- [ ] Demo sign-in endpoint for the portfolio page; demo account restrictions.
- [ ] Tests: criteria 44 to 46.

## 12. Continuous integration (file only until GitHub exists)
- [ ] `.github/workflows/ci.yml`: install, lint, build, start Supabase, database tests, unit tests, Playwright.
- [ ] Weekly scheduled workflow that keeps the free Supabase project from pausing (it pauses after 7 idle days).

## 13. Documentation
- [ ] README: what it is, why each rule is in the database, the honest limits of location and liveness checks, how to run locally, test results.
- [ ] `docs/case-study.md`: problem, analysis, data model, solution, results; credits the original team capstone.

## Needs Kidd
- [ ] GitHub repository and push.
- [ ] Supabase cloud project, keys into Vercel and GitHub secrets.
- [ ] Vercel project.
- [ ] Optional: the original Laravel app in Docker with Laravel Sail, as the "before" version.
