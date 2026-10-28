# Workforce system: acceptance criteria

**Draft: Kidd to review and own.** Each criterion needs at least one automated test before its feature counts as done. "Database test" means pgTAP; "end-to-end" means Playwright.

## Businesses and isolation
1. A signed-in member of business A, calling the database directly, can't read, insert, update or delete any row belonging to business B, in any table. *(Database test that loops over every table.)*
2. `create_organization` creates the business, its settings, the three default roles and an owner membership for the caller.
3. A business can't end up with no active owner: demoting or deactivating the last one fails.
4. Changing the brand colour changes the accent across every screen; a colour that fails the contrast check is rejected. *(End-to-end.)*
5. When a feature is switched off, its functions refuse calls with a clear error, and its screens are hidden.

## Roles
6. A role without `time.edit` can't edit entries, even through direct database calls.
7. A manager sees and edits only the members whose manager chain leads to them.

## Time and evidence
8. Time in, break, continue and time out record server time; changing the device clock has no effect. *(End-to-end with a faked browser clock.)*
9. Members can't insert, update or delete entries, breaks or clock events directly.
10. A second time in while an entry is open is rejected.
11. A time in from a site the member isn't assigned to is rejected.
12. Every punch writes exactly one clock event with the location reading, accuracy, fence result and face result.
13. Clock events, the change log and the audit log can't be updated or deleted by anyone through the application.
14. An entry still open after its site's day ends becomes `missing_out` with 0 worked minutes after the scheduled job runs.

## Location
15. A reading inside the geofence with accuracy under the limit passes.
16. A reading outside the geofence fails, or is flagged, according to the business's policy.
17. A reading with accuracy worse than the limit fails with the reason "location not accurate enough".
18. In strict mode, a point inside the fence whose accuracy circle crosses the edge fails; in balanced mode it passes.
19. A reading older than 30 seconds fails.
20. A punch implying travel faster than 200 km/h since the previous punch is flagged.
21. Polygon and circle geofences give the same answer as a reference calculation for a set of test points (including points near the edge).

## Face and liveness
22. No role can select from `face_enrollments`, and no function returns an embedding.
23. A challenge identifier works once; a second use fails.
24. A challenge used after 60 seconds fails.
25. An embedding below the business's similarity threshold fails.
26. An embedding identical to one already used fails as a replay.
27. In the browser, a printed photo or a photo on a phone screen held to the camera doesn't pass liveness in at least 9 of 10 attempts. *(Manual test with a made-up face, recorded in the README with the method and results. Browser liveness can't be fully automated.)*
28. Enrollment can't finish without recorded consent.

## Corrections
29. A correction with times that overlap another entry is rejected; approval re-checks and applies only if still valid.
30. A second pending request on the same entry is rejected.
31. Approving writes exactly one change log row linked to the request; self-approval is marked.
32. Deleting an entry deletes its breaks.

## Payroll
33. A period can't lock while any timesheet is unapproved, unless an owner overrides with a reason.
34. Entries in a locked or finalized period can't be added, changed or deleted, and correction approvals for them fail.
35. For a fixed set of sample entries and rates, `generate_payslips` produces exactly the expected regular, overtime, tardiness and absence amounts. *(Table of worked examples in the test, checked by hand.)*
36. A payslip's gross, deductions and net equal the sums of its lines.
37. A rate change dated mid-period applies only to days on or after its date.
38. A member with no worked time in the period gets no payslip and appears in the "no payslip" list.
39. Finalized payslips can't be changed; voiding needs a reason and keeps the original.
40. An employee can download only their own payslips.

## Analytics
41. A member's attendance rate, punctuality and hours against schedule match hand-calculated values for the sample data.
42. A measure based on fewer than 10 days shows "not enough data".
43. A manager's analytics never include members outside their team.

## Demo
44. Each demo account signs in from the portfolio page with one click and lands on the right home screen. *(End-to-end.)*
45. Demo accounts can't change email or password, or delete the business.
46. `reset_demo_data` restores the demo businesses and doesn't touch any non-demo business.
