# Case study: from a one-company capstone to a multi-business workforce system

## Problem

In 2025 my capstone team (four students) built MyJedSkies for a manpower agency that deploys field sales agents. Before it, attendance was photos sent to team leaders in a group chat, daily time records were checked by hand against each leader's notes, and payslips were sent one by one through Messenger. The system replaced that with face and location check-ins, dashboards and forecasting.

A year later I reviewed the code on my own, as if I were taking it over. It worked in the demo, but the review found that most of its rules could be bypassed:

- The browser decided whether a face matched and sent "verified: yes"; the server saved whatever it was told.
- The stored face data was sent to the person being checked.
- A photo held up to the camera passed, because there was no liveness check.
- Location accuracy was never checked.
- Approving a dispute changed records by searching the reason text for words like "present" and filling in guessed times.
- Scheduled jobs and two security checks were registered in files the framework version didn't load, so they never ran.
- Pay was days worked times a hard-coded ₱645.

## Analysis

I separated what the business needed from how the first version did it.

| Need | First version | Root cause |
|---|---|---|
| Prove someone was at the site | Point-in-polygon check, no accuracy | Treated every reading as exact |
| Prove it was really them | Single-frame face match in the browser | Trusted the client |
| Fix mistakes in time records | Keyword matching on free text | No structure for "what times did you actually work?" |
| Pay people correctly | Days × fixed rate | No pay periods, rates or deductions |
| Know who's struggling | Counts of sales applications | Measured output, not the workforce |
| Work for other companies | Hard-coded names, hours, timezone and plans | Built for one client |

The pattern: rules lived where they could be skipped (the browser, a controller someone forgot to call). So the main decision was to **put every rule in the database**, and to **test each rule where it lives**.

## Solution

- **Many businesses, one schema.** Every row carries its business, and row-level security keeps each business's data separate. A test loops over every table to prove it.
- **Roles from a fixed set of permissions**, named by each business, each with a scope (self, reporting line, everyone).
- **Punches are database functions.** They use the server's clock, check the site's geofence with the reading's accuracy and age, check impossible travel, and verify the face against an enrolled embedding that no one can read. A one-use liveness challenge (two random actions in order, within 60 seconds) stops photos. Failed attempts are stored as evidence.
- **Structured corrections.** People request specific times with a reason; approval re-checks overlaps and writes one change-log row. Managers' edits need a reason. Logs are append-only.
- **Payroll as a workflow:** open, in review (managers approve timesheets on one screen, replacing the chat check), locked (time is frozen), finalized (payslips can only be voided with a reason). Payslips are built day by day, so a mid-period raise applies from its date, and every line traces back to the time and rates used.
- **Workforce analytics:** attendance, punctuality, hours against schedule, overtime, corrections and failed checks, compared with the team median, marked "not enough data" under 10 days, with flags that name their rule and a forecast that states its method and range.
- **Configurable everything the first version hard-coded:** timezone, hours, grace minutes, overtime, accuracy limit, edge rule, flag-or-block policies, face threshold, and which features are on.

## Second pass: bringing back what JedSkies did well

The first rebuild kept JedSkies' ideas but lost much of its structure. It had no team leaders, areas, leave or sales, so it no longer felt like the system the team built. The second pass brought those back without copying the original screens or reports, and changed the data model where that made it faster or clearer:

- **Visibility once per query.** Every policy used to ask "may I see this person?" row by row, walking the manager chain each time. Now the database works out the reader's visible people once per query and checks rows against that list. The 182 existing tests passed unchanged, which is how I know behaviour didn't move.
- **Areas lead teams.** A leader sees the people in the areas they lead, as in JedSkies, plus anyone who reports to them. Composite keys stop an area and a person from different businesses being linked, even by the database owner.
- **Statuses are calculated, not stored.** JedSkies saved "present" or "late" when someone timed in, so a corrected time left the status wrong. Here the status comes from the time entries, shifts, approved leave and the business's own rules each time it's read.
- **Leave and sales follow the same pattern as time.** Only database functions change them, decisions need a reason to reject, nobody approves their own, and locked pay periods stay locked. A customer confirms a sale with a one-use link. They must press a button, because email scanners open links automatically.
- **Templates instead of one hierarchy.** JedSkies' five roles suit field teams but not a café, so both are starting templates that any business can rename.

The tests caught three more bugs in this pass. One crashed sales for products without customer confirmation. In another, a demo leave date that fell on a Sunday was silently dropped, so the demo looked different depending on the day.

## Results

- **327 database tests, 33 unit tests and 19 end-to-end tests pass.** They cover the acceptance criteria, with two exceptions: the brand colour check is tested as a unit rather than end to end, and the liveness spoof test (holding a photo to the camera) is manual and not run yet.
- The tests and a security review found **fourteen real bugs**, most before any screen existed: for example, deleting an entry tried to update append-only evidence, four separate rules broke the nightly demo reset, and the reset failed only on some days because of an indexing mistake.
- The payroll tests use hand-calculated examples. One demo payslip shows "Tardiness, 67 min: ₱85.15", the same case as the original test report, which had it as ₱85.11 (67 ÷ 60 × ₱76.25 = ₱85.15).
- A browser test sets the device clock to 2030 and times in: the record still shows today, from the server's clock.

## What I'd do next

1. Run the manual liveness test with printed and on-screen made-up faces and publish the pass rate.
2. Reports and exports built on the daily status, leave and sales data, and shifts that cross midnight.
3. Move face matching for high-risk businesses to a server-side model, or a certified liveness service if one is approved for the account.

## Credits

The original MyJedSkies was a team capstone (2025). This rebuild, its review, design and tests are my own work. No names, people, company details or data from the original are used; all demo businesses and people are made up.

*Status: built and tested locally. Deployment to Vercel and Supabase is planned.*
