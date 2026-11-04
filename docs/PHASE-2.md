# Phase 2: the main JedSkies features

Written 4 Nov 2026. Phase 1 built a general workforce system that kept JedSkies' ideas but dropped much of its structure. Phase 2 brings back JedSkies' main features, made general and enforced by the database.

**Kidd's direction:**
- Rebuild JedSkies' main features in Next.js.
- Don't copy the original screens, reports or exports. They weren't good, and reporting and export wait until later.
- Improve the data model wherever it can be made faster or cleaner.

## Scope

| JedSkies feature | In this phase |
|---|---|
| Five-level role structure (agent, team leader, operations manager, general manager, HR) | A "Field teams" role template when a business is created, next to the existing "Small team" template |
| Areas with polygons | Existing sites with geofences, shown under a name each business picks (Area, Branch, Site) |
| Team leaders and agents assigned to areas | Area assignments with a leader flag; a team leader's team is the people in the areas they lead plus anyone who reports to them |
| Present, late, absent, half day | Calculated per day from settings: start time, grace minutes, absent cut-off, minimum minutes for a full and a half day, working days |
| No time in before 5:00 AM | Optional earliest time-in setting, enforced by `clock_in` |
| Team leader enrolls an agent's face | Existing `face.enroll_others` permission, limited to people the leader can see, with the agent's consent recorded |
| Sick leave (5 a year, letter attached), approve or reject with a comment | Leave types per business with a yearly allowance, paid or unpaid, attachment optional or required; approval by `leave.review` |
| Attendance disputes | Existing correction requests (the person states the times; nothing is guessed from keywords) |
| Customer applications, email verification, follow-up after 72 hours, auto-approval for some plans | A sales module (feature switch): products, customer applications, a one-use verification link, follow-up after a set number of hours, optional auto-approval per product |
| Subscription plans | Products: name, price, incentive per approved sale, verification and auto-approval switches |
| Incentives and man-days | Incentives for approved sales are added to payslips; man-days are already paid by the payroll module |
| Provisional agents become regular after 6 months | Probation months setting; a nightly job promotes and logs it |
| Manage attendance | Existing manager edits with a required reason and change log |
| Live map of everyone's location | Team today: who is in, late or absent, with the accepted time-in locations on a map |
| Audit trail | Existing audit log, extended to the new tables, with a screen for `audit.view` |
| Role dashboards | The home screen shows what each role needs |

**Not in this phase:** reports, exports, forecasting pages and copies of the original screens.

## Data model changes

1. **Faster visibility rules.** Every row-level policy that checked "may I see this person?" ran a recursive manager-chain query for each row it read. Now `private.visible_members()` works out the reader's visible people once per query, and each row is only looked up in that list. Membership checks work the same way through `private.my_orgs()`. Behaviour doesn't change, and the existing tests prove it.
2. **Area leaders:** `member_sites.is_leader`.
3. **New permissions:** `leave.review`, `sales.log`, `sales.review`, `products.manage`, `audit.view`. **New features:** `leave`, `sales`.
4. **New settings:**
   - names: `area_label` and `area_label_plural`;
   - time-in and status rules: `earliest_clock_in`, `absent_after_minutes`, `full_day_minutes`, `half_day_minutes`, `work_days`;
   - `probation_months`;
   - sales: `follow_up_hours`.
5. **Role templates:** `create_organization(..., p_template)` with `small` (Owner, Manager, Employee) and `field` (Owner, General Manager, HR Manager, Operations Manager, Team Leader, Staff).
6. **Leave:** `leave_types` and `leave_requests`.
   - No overlapping pending or approved leave, by an exclusion constraint.
   - Allowance checked when the request is made and again when it's approved.
   - Approval is refused for days in a locked or finalized pay period.
   - Attachments go in a private storage bucket.
7. **Sales:** `products` and `customer_applications`.
   - Changes happen only through functions.
   - The verification token is stored hashed.
   - Price and incentive are snapshotted on the application.
   - An hourly job moves stale applications to follow-up.
8. **Daily status:** `attendance_days(org, from, to)` returns one row per person per expected day, with status, minutes and lateness. It works on top of the time entries, so a person can still have several entries a day.
9. **Payroll:**
   - Paid leave is paid.
   - Unpaid leave on a scheduled day is deducted as leave, not as an absence.
   - Approved sales add an incentives line.

## Acceptance criteria

Numbered after Phase 1's 46.

**Visibility**

47. A team leader sees the time, leave and sales of people in the areas they lead and of people who report to them, and of no one else.
48. Visibility results are the same as before the rewrite for every Phase 1 test.

**Attendance rules**

49. Time in before the earliest time-in is refused, using server time in the site's timezone.
50. A day's status is:
    - present when in by start plus grace;
    - late after grace;
    - absent when in after the absent cut-off or when worked minutes are under the half-day minimum;
    - half day when under the full-day minimum;
    - on leave when approved leave covers it;
    - absent when an expected day has no time.

**Leave**

51. A person can request leave only for themself, within the yearly allowance, without overlapping pending or approved leave.
52. Approval needs `leave.review`, can't be done on your own request, re-checks the allowance and is refused for locked pay periods.
53. Paid leave is paid on the payslip, and unpaid leave on a scheduled day is deducted as leave.

**Sales**

54. Only `sales.log` holders log applications, and only for themself. Price and incentive come from the product, not the caller.
55. A verification link works once, only before it expires, and the token itself is never stored.
56. Applications older than the follow-up hours and still unverified move to follow-up.
57. Auto-approval happens only for products that allow it, after verification. Otherwise approval needs `sales.review` and can't be your own sale.
58. Approved sales in a period add an incentives line equal to the sum of their snapshotted incentives.

**Team leaders and accounts**

59. A team leader can enroll a face only for people they can see, and only with consent.
60. Provisional staff become regular when their probation months are up, and the change is in the audit log.

**Templates and audit**

61. The field template creates the six roles with the permissions in this document.
62. The audit trail is readable only with `audit.view`.

## Tasks

- [ ] Plan (this file).
- [ ] Visibility rewrite, enums, settings, templates, area leaders; Phase 1 tests still pass.
- [ ] Attendance rules and `attendance_days`, with tests.
- [ ] Leave, with tests.
- [ ] Sales, with tests.
- [ ] Payroll: leave and incentives, with tests.
- [ ] Probation job and audit coverage, with tests.
- [ ] Demo data: a field business with areas, team leaders, leave and sales; accounts for every role.
- [ ] Screens:
  - navigation by role;
  - areas and teams;
  - team today with its map;
  - leave;
  - sales and products;
  - accounts;
  - audit trail;
  - role home screens.
- [ ] End-to-end tests for the new screens; README, case study and PROGRESS updated.
