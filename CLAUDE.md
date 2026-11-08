# Crewbase: notes for Claude (and setup on another computer)

Updated 8 Nov 2026. Claude Code reads this file automatically in this repo; it can also be pasted into a new Claude chat.

---

## Part 1, for Kidd: getting set up

### Option A: GitHub Codespaces (recommended)
A computer in the cloud, signed in as your personal GitHub account. Nothing gets installed on the work PC, Docker already works there, and pushing works without signing in to anything at work.

1. Open https://github.com/Rushzel/crewbase, then **Code → Codespaces → Create codespace on main**.
2. In its terminal, run the commands under "Run it" below.
3. Open it in VS Code rather than the browser if you can. VS Code forwards the ports to your own `localhost`, so the app's `127.0.0.1` addresses work as they are. In the browser-only version, the app can't reach the database at `127.0.0.1:54321` until you point `NEXT_PUBLIC_SUPABASE_URL` at the forwarded address. I haven't tested Crewbase in Codespaces yet.

Personal accounts get free Codespaces hours every month. Stop the codespace when you're done so it doesn't use them up.

### Option B: the work PC itself
It needs Node 22, Git and Docker Desktop. Then:
```bash
git clone https://github.com/Rushzel/crewbase.git
cd crewbase
git config user.name "Rushzel"            # this repo only; the work PC's global identity is your work account
git config user.email "rushzelk@gmail.com"
git config user.email                     # check it says rushzelk@gmail.com before the first commit
```
Pushing from the work PC needs your personal GitHub sign-in, not your work one. If that's awkward, use Codespaces.

### Run it
```bash
npm install                 # also downloads the face models (about 39 MB) into models/
npx supabase start          # local database in Docker, with migrations and demo data
cp .env.example .env.local  # then paste the publishable and secret keys printed by: npx supabase status
npm run dev                 # http://localhost:3000, then pick a role in Demo Company
```
Demo sign-ins: `owner@demo.crewbase.example`, or replace `owner` with `finance`, `hr`, `leader` or `employee`. The password is `crewbase-demo`. Local emails appear at http://127.0.0.1:54324.

---

## Part 2, for Claude

### Rules
- **Synthetic data only.** Made-up names, never real people, nothing from any employer. Crewbase is rebuilt from MyJedSkies, a four-person capstone made for a real client company: never use that company's name, people or data. Naming MyJedSkies itself is fine.
- **The database enforces the rules.** Every rule that matters lives in a migration, with row-level security on every table. Hiding a button is never a permission.
- **Tests are the definition of done.** Each feature needs passing tests. Never weaken or delete a test to make it pass.
- **Commit as `Rushzel <rushzelk@gmail.com>`,** set in this repo only. Check `git config user.email` before every commit; never commit with a work identity.
- **Ask Kidd before** any push, deploy, new account or new GitHub repository. Secrets go only in `.env.local`, which is ignored by git.
- **Writing:** plain, direct, concise English. No em dashes. No acronyms or abbreviations in prose (product names and code are fine). Dates day-first (`8 Nov 2026`), durations like `7h 06m`.
- **Design in Figma first** for any redesign; small tweaks can go straight to code.
- **Front-end structure:** every colour is a token in `globals.css` (`:root` and Tailwind `@theme`); anything used twice is defined once as a class or component; effects and animations live in the stylesheet, and components toggle `data-` attributes. No hex values or `style={{}}` in components. Tailwind utilities are fine for one-off layout.
- **Next.js 16 is newer than your training data.** Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before writing code. It uses `proxy.ts` and asynchronous request APIs. Tailwind 4 needs `@utility` for custom classes.
- **Don't copy the MyJedSkies teammates' screens, reports or exports** (Kidd found them poor). Rebuild the ideas; improving the data model is welcome.
- Read `PROGRESS.md` first and keep it updated: what's done, test results, decisions to review, blockers, next step.

### What Crewbase is
A workforce system any business can sign up for:
- time in and out with location and face checks;
- areas with leaders, leave, and sales confirmed by the customer through an emailed link;
- corrections, scheduling, payroll with payslips, and analytics.

Each business's data is kept apart by the database. Roles are named by function: Owner, Finance, Human Resources, Leader, Employee. The demo is one made-up business, **Demo Company**: field employees in three areas (Pasig East, Marikina, Cainta). Made-up people include Abby Cruzado (employee), Lito Ferrer (leader) and Victor Agustin (finance). The product name "Crewbase" is a placeholder, set in `src/lib/brand.ts`.

### Where it stands (8 Nov 2026)
- Phase 1 (core) and phase 2 (MyJedSkies' main features) are done; see `PROGRESS.md` and `docs/PHASE-2.md`.
- **Face check version 2** is built: the server decides, using free open models (YuNet, SFace, MiniFASNet). Liveness works like a bank app: a blink, then a random sequence of screen colours the skin must reflect. Only the server can record a pass. It isn't calibrated on real cameras yet. See `docs/FACE-V2.md`.
- **Tests:** 327 database (pgTAP), 33 unit (Vitest), 19 end-to-end (Playwright), all passing. Lint, types and the production build pass. Continuous integration on GitHub is green.
- **Not deployed.** Supabase cloud, Vercel and an email provider wait for Kidd's accounts.

### What to work on next (Kidd picks)
1. **Redesign (Kidd's priority).** Kidd finds the current look not good enough and wants the redesign in Figma first.
   - The Figma file is "Crewbase redesign", in Kidd's free Starter team. It's light mode only, because the free plan allows one variable mode.
   - It already has:
     - **Foundations:** colour, spacing and radius variables; a teal accent `#0F766E`; Geist text styles; 32 icon components.
     - **Components:** Button, Status pill, Avatar, Nav item, Check row, Stat, Sidebar, Tab bar, Face camera.
     - **Screens:** Employee home, Leader team today and Finance payroll on desktop; Time in, the three face steps and Timed in on phone.
   - The face step and Timed in phone screens haven't been looked at yet.
   - Next: check those, get Kidd's feedback, then build the redesign in code screen by screen.
   - The landing page is a plain placeholder. Kidd will send design references first, so don't redesign it until then.
   - The Figma plugin has to be signed in on whichever machine is used, and the free plan limits how many design tool calls can run.
2. **Review decisions 14 to 26** in `PROGRESS.md` with Kidd.
3. **Screens not built yet:** the deduction rules editor (bracket tables) and the members and rates editor. Their database functions and policies already exist.
4. **Real-camera test of face check version 2:** a laptop webcam on `http://localhost` works, and a phone needs HTTPS. Test only with people who agree to it, and calibrate the thresholds in decision 25.
5. **Later modules: contracts, vendors and change governance.** Planned in `docs/LATER-MODULES.md`. In short:
   - Each is a feature a business switches on, with its own permissions and a menu item under Business.
   - The usual rules apply: nobody approves their own request, history is append-only, and the database enforces everything.
   - **Contracts:** with a client or a vendor, versioned, with reminders 60 and 30 days before the end date.
   - **Vendors:** a register that Finance approves.
   - **Change governance:** Finance and Human Resources request changes, and the Owner approves them.
   - Build them after reports and exports unless Kidd says sooner. Each needs acceptance criteria and database tests first.
6. **Reports and exports** wait, by Kidd's direction (decision 22).

### Map of the repo
```
supabase/migrations/   schema, rules and functions (start here)
supabase/tests/        pgTAP tests, one file per area (01_tenancy to 11_attendance_rules)
src/app/               screens and Server Actions
src/lib/               Supabase clients, formatting, face and location capture, analytics, brand.ts
e2e/                   Playwright tests
docs/                  CODEBASE-OVERVIEW, SPEC, DATA-MODEL, ACCEPTANCE-CRITERIA, TASKS, PHASE-2, FACE-V2, case-study
PROGRESS.md            status, decisions to review, bugs the tests caught
```

### Before each commit
```bash
npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e
```
The end-to-end tests start their own dev server. Then update `PROGRESS.md`, and commit as Rushzel.

### The rest of the portfolio (context only)
- **RSZL:** Kidd's portfolio site, github.com/Rushzel/portfolio.
- **Spotter:** a gym logbook for personal trainers. Planned.
- **Refill:** a medicine and vitamin tracker. Planned.
- **The trucking product:** a trucking company's office software, name not chosen yet. Planned, and it has no GitHub repository yet.

Crewbase is the only one with code.
