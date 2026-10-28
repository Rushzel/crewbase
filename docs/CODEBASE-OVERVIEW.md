# MyJedSkies codebase overview

Written 28 Oct 2026, before any change, as the starting point for the new workforce system.

- **Source read:** `github.com/rszl/Jedskies`, branch `main`, commit `448a51b` (22 Oct 2025). This is one commit ahead of the local copy in `C:\xampp\htdocs\Jedskies`.
- **Other branch:** `feature/payroll-process` (June 2025) is older. Its incentives and man-days reports are already in `main`.
- **Size:** 293 tracked files, about 30,000 lines once lock files and model weights are excluded.
- **Method:** every route, model, migration, service, middleware and scheduled command was read in full. The large Blade views were read where they hold logic: clock-in, face enrollment, maps and analytics.

> The original was built for one specific business. The new system reuses ideas and lessons from it, never its name, branding, people, plans or data. See section 9.

## 1. What it is

A web system for a field sales business. Field sales agents work in assigned geographic areas, time in and out with a face check and a location check, and log customer applications for internet subscription plans. Team leaders, operational managers, general managers and a corporate secretary each get their own dashboard, reports and analytics.

## 2. Stack and how it runs

| Piece | What it uses |
|---|---|
| Framework | Laravel 12 (PHP 8.2), Blade templates, Alpine.js, Tailwind CSS 3, Vite |
| Database | MySQL through XAMPP (`DB_DATABASE=jedskies`) |
| Face recognition | `face-api.js` in the browser, with the tiny face detector, 68-point landmarks and recognition models in `public/models` |
| Maps | Leaflet with OpenStreetMap tiles |
| Documents | `barryvdh/laravel-dompdf` for PDF reports, plus hand-built CSV and Excel exports |
| Email | Laravel mail through Gmail's mail server (welcome, verification code, password reset, email changed) |
| Tests | Pest, with only the Laravel Breeze starter tests (authentication and profile) |
| Deployment | `deploy.sh` (composer install, npm build, migrate, cache) |

## 3. Roles

Roles live in a `roles` table, linked by `users.role_id`, and are checked by helper methods on `User` (`isFSA`, `isTeamLeader`, and so on).

| Role | Does |
|---|---|
| Field sales agent | Times in and out, logs customer applications, files attendance disputes and leave |
| Team leader | Same as an agent, plus their team view, enrolls agents' faces, team attendance |
| Operational manager | Areas and polygons, team assignment, attendance management, dispute resolution, area reports, subscription plans, map of everyone's location |
| General manager | Monthly reports, incentives and man-days, forecasting, people analytics, user management |
| Corporate secretary | User management, audit trail, monthly reports |

Agents also have a `type` of `regular` or `provisional`. A scheduled command promotes provisional agents after six months.

## 4. Modules

1. **Attendance.** One row per person per day (unique on `user_id` and `date`). The server stamps time in and out in Asia/Manila time. Time in is blocked before 5:00 AM and time out after 6:00 PM. The status is `present` before 9:15 AM, `late` until 10:00 AM, and `absent` after that. Overtime is calculated at time out.
2. **Face verification.** Enrollment captures several frames at different head angles, averages them into one 128-number descriptor, and saves it on `users.face_descriptor`. At time in, the browser downloads the user's own descriptor, compares it with the live camera frame (Euclidean distance under 0.5), and then posts `face_verified: true` and a PNG photo.
3. **Location check (geofencing).** Each area has a polygon. `GeofencingService` runs a ray-casting point-in-polygon test on the reported latitude and longitude. A point outside the polygon is rejected.
4. **Areas and teams.** Areas have many team leaders and many agents through `area_team_leader` and `area_fsa`. Code limits each area to 10 team leaders.
5. **Customer applications.** Agents log sign-ups for internet plans. The customer gets an email verification code. A scheduled job moves applications to "for follow-up" after 72 hours unverified, and approved applications feed incentives.
6. **Subscription plans.** A list of internet plans and prices, seeded in a migration.
7. **Leave.** Employees apply, and managers approve or deny.
8. **Attendance disputes.** Employees dispute a day, and an operational manager resolves it.
9. **Reports and pay.** Area reports (PDF, CSV, Excel), monthly reports, and incentives and man-days: days worked (present or late) times a daily rate, split into first and second half of the month.
10. **People analytics and forecasting.** Per employee and per area: monthly application counts, approval rate, best and worst month, three-month trend, and a forecast. The forecast calls an external ARIMA forecasting service, which is a placeholder address (`https://your-arima-api-url.com/forecast`), so the system always uses its fallback forecast.
11. **Audit trail.** `ActivityLogService` and `ActivityLogMiddleware` record actions with before and after values, the internet address and the browser.
12. **Accounts.** Laravel Breeze sign-in, forced password change on first sign-in, password reset by email.

## 5. Data model (MySQL)

| Table | Purpose | Notes |
|---|---|---|
| `users` | Everyone | `role_id`, `status`, `type`, `face_descriptor` (text), `password_changed`; birthdate column referenced but its migration is empty |
| `roles` | Role names and slugs | Rows inserted by a migration |
| `areas` | Territories | `polygon_coordinates` (JSON list of latitude and longitude pairs), `status` |
| `area_team_leader`, `area_fsa` | Team membership | Many-to-many |
| `attendances` | One row per person per day | `time_in`, `time_out`, `status` (free text since June 2025), `overtime_hours`, `face_verified`, `photo` (base64 PNG in the row), latitude and longitude, `location_verification`, manual-entry fields |
| `attendance_disputes` | Disputes about a day | `status` pending, approved or rejected; `manager_response`; `resolved_by` |
| `leaves` | Leave requests | `approved_by` stores a name, not a user reference |
| `customer_applications` | Sales records | Customer contact details, plan, approval and verification fields |
| `approved_applications` | Approved sales per agent | Used for forecasting |
| `subscription_plans` | Internet plans | Seeded with prices |
| `activity_logs` | Audit trail | Old and new values as JSON |

There are no breaks, shifts, schedules, pay periods, payslips or deductions.

## 6. How a time in works today

1. The employee opens Attendance. The page loads the face models and asks for location (high accuracy, 15-second timeout, no cached position).
2. The browser fetches the employee's own face descriptor from `/profile/face-descriptor`.
3. Up to five tries: detect a face, compare it with the descriptor, and stop when the distance is under 0.5.
4. The browser posts `type`, `face_verified`, `photo`, latitude, longitude and its own local time to `/attendance/record`.
5. The server checks the polygon, the role, that the area is active and the time-of-day windows, then saves the row with server time. It stores `face_verified` exactly as the browser sent it.

## 7. What is good and worth keeping

- **Server time for punches.** `record()` ignores the browser's time for the stored value (`AttendanceController.php`, the `$phTime` logic).
- **The face check runs in the browser.** That means no paid face service and no face photos sent to a third party just to match.
- **Enrollment quality.** Several frames at different head angles, averaged, gives a steadier descriptor than one frame.
- **Location is checked on the server** against a polygon, not only in the page.
- **A real audit trail** with before and after values.
- **A clear role hierarchy**, plus useful managerial views: the live map, team attendance and area reports.

## 8. Problems found

These are the reasons the new system moves the rules into the database. Each has a fix in the new specification.

### Security

1. **The face result is trusted from the browser.** `face_verified` and `photo` come straight from the request and are saved as sent (`AttendanceController.php`, inside `record()`). Anyone can post `face_verified: true` with any photo, or none, and only agents without an enrolled face are blocked.
2. **The stored face descriptor is sent to the browser** (`ProfileController.php:82`). The secret used for matching is readable by the person being checked.
3. **No liveness check.** Holding a phone with a photo of the employee up to the camera passes, because the match only compares one frame (`dashboard/attendance.blade.php:179-180`).
4. **Location accuracy is ignored.** The page asks for high accuracy but never sends or checks the accuracy radius. A reading that is accurate only to 2 kilometres counts the same as one accurate to 5 metres, and there is no protection against a spoofed location.
5. **Initial password is the birthdate** (`UserController.php:57`), which is easy to guess. The welcome email also states it.
6. **Debug routes are public**, with no sign-in. `/debug-email-config` returns mail settings and the sender username, `/debug-email-test-*` sends real email, `/debug-all-areas` and `/debug-assets` expose internal data (`routes/web.php:211`, `238`, `406`).
7. **Middleware that never runs.** `EnsureFaceEnrolled` and `ActivityLogMiddleware` are registered in `app/Http/Kernel.php`, which Laravel 12 doesn't load (it uses `bootstrap/app.php`). Team leaders aren't forced to enroll, and request-level audit logging doesn't happen.
8. **Role checks are scattered.** Some live in route middleware, some inside controllers, and some routes (for example the user management routes in `routes/web.php`) depend on the controller remembering to check. Nothing at the database level stops a request that gets past the code.

### Correctness

9. **Scheduled jobs never run.** The schedule is in `app/Console/Kernel.php`, which Laravel 12 also ignores (schedules belong in `routes/console.php`). Even if it ran, `attendance:mark-absentees` is scheduled at 23:59 but exits unless the time is exactly 10:00 (`Kernel.php:34` and `MarkAbsenteesAtTen.php:34`).
10. **Approving a dispute edits records by matching keywords in the reason.** If the text contains "present" the day becomes present, "time in" sets 5:00 AM, and "time out" sets 5:00 PM (`AttendanceDisputeController.php:142`, `161`, `173`). Invented times end up in the record, and the employee never states which times they actually worked.
11. **Managers can overwrite attendance with no reason and no log entry** (`ManageAttendanceController.php:59`). There is no validation on `status`.
12. **One row per day.** A second time in, a split shift or a break can't be recorded.
13. **Pay is days times a hard-coded ₱645** (`Attendance.php:72`), not hours. There are no deductions, no locked pay periods and no payslip.
14. **The forecasting service address is a placeholder**, so every forecast is the fallback, though the page presents it as an ARIMA forecast.
15. **Empty or duplicate migrations.** Several migrations have empty bodies, one targets a table named `attendance` that doesn't exist, and there are two migrations with the same timestamp. A fresh `migrate` doesn't reproduce the real schema, which is why `.sql` dumps were passed around.
16. **Photos are stored as base64 PNG in the attendance row**, which bloats the table and backups.
17. **The timezone and business hours are hard-coded** (Asia/Manila, 5:00 AM, 9:15 AM, 10:00 AM, 6:00 PM) across controllers and commands.

### Maintainability

18. **Almost no tests.** Only the starter authentication tests exist, and none cover attendance, geofencing, disputes or pay.
19. **Large controllers with copied logic.** `ReportController` (885 lines) and `AttendanceController` (720 lines) mix querying, rules and formatting. The analytics code is repeated in three controllers.
20. **`face-api.js` is no longer maintained** (last release 2020).
21. **The README is the Laravel default.** Setup knowledge lives in chat and in `.sql` dumps.

## 9. What carries over and what doesn't

| Original | In the new system |
|---|---|
| One business, hard-coded | Many client businesses, each isolated by row-level security, each with its own branding, sites, roles and settings |
| Areas with polygons | Sites with a geofence (circle or polygon), stored in PostGIS and checked in a database function that also uses the accuracy radius |
| Fixed five roles | Each business defines roles from a fixed set of permissions; defaults are provided |
| Face match decided in the browser | Server-issued liveness challenge, face match done by a database function, enrolled data never sent to the browser |
| One attendance row per day | Many time entries per day with breaks, evidence for every punch, correction requests and an append-only change log (from the time tracker spec) |
| Days times ₱645 | Pay periods, rates per person, overtime rules, configurable deductions, payslips generated by a database function from approved hours and locked once final |
| Sales application counts and a placeholder forecast | Workforce analytics (attendance, punctuality, hours against schedule, overtime, corrections, verification failures), with an optional output metric the business defines, and a simple, explained forecast with a range |
| Internet plans, customer applications, the business's name, area names, staff and teammates in the commit history | Not carried over. Made-up sample businesses and people only |

## 10. Things to check before relying on this overview

- I didn't run the original application (that needs PHP and MySQL, or Docker). The behaviour described comes from reading the code.
- Some Blade views are 900 to 1,100 lines long. I read their script sections and the parts named here, not every line of markup.
- **Documentation read alongside the code:** the final capstone manuscript (July 2025, a four-person team project), the operations and payroll process notes, and the user acceptance test report (cycle 2, September 2025).
- **The test report doesn't match this code.** It describes a Human Resources Manager role, account lockout after 5 failed attempts, a 30-minute idle timeout, and a payroll module with absence, tardiness and government contribution deductions, tested on a Vercel deployment. None of that is in `main`. Either a later version lives in another repository, or the report covers planned features. To be confirmed by Kidd.
