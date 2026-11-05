# Later modules: contracts, vendors and change governance

**Status: planned, not built.** Kidd asked on 5 Nov 2026 to list these now and build them later. This page says what each module does, where it fits in Crewbase, and which rules the database will enforce, so it can be built the same way as the rest.

## How they fit

Each module is a feature a business switches on, like leave or sales today. That means:
- a new `feature_key` value;
- its own permissions;
- its menu item under **Business**, next to Payroll and the Audit trail.

The existing patterns apply:
- row-level security keeps each business's data apart;
- nobody approves their own request;
- history is append-only;
- the database enforces the rules, not hidden buttons.

| Module | Feature key | Menu item (Business) | New permissions | Default roles |
|---|---|---|---|---|
| Contracts | `contracts` | Contracts | `contracts.view`, `contracts.manage`, `contracts.approve` | Owner and Finance manage and approve; Human Resources can view |
| Vendors | `vendors` | Vendors | `vendors.manage`, `vendors.approve` | Owner and Finance |
| Change governance | `change_governance` | Changes, with a count of requests waiting | `changes.request`, `changes.approve` | Finance and Human Resources request; the Owner approves |

## 1. Contracts

Every agreement the business has with a client or a vendor, in one place: who it's with, what it covers, its value, start and end dates, renewal terms, the signed file, and reminders before it ends.

- A contract is with one party: a client (for example, a brand that hires the business's field agents) or a vendor.
- Statuses: draft, waiting for approval, active, ended, terminated. Renewing or amending creates a new version linked to the previous one.
- Reminders 60 and 30 days before the end date, in the app. Email is optional.
- Signed files are kept in a private storage bucket.
- A client contract can name the areas it covers, so later reports can show hours worked and sales per contract.

**Rules the database will enforce**
1. A contract can't become active until someone other than the person who drafted it approves it.
2. An active contract's party, value and dates can't be edited. A change is a new version, and the old version stays readable.
3. The end date is after the start date, and the value isn't negative. Money is stored in whole centavos.
4. Only people with `contracts.view` can see contracts and open their files.

**Tables:** `clients`, `contracts` (party, title, value, currency, start and end dates, renewal terms, status, version, previous version, drafted by, approved by and when), `contract_files`, `contract_areas`.

## 2. Vendors

The suppliers the business buys from or subcontracts to, for example uniforms, equipment, transport or subcontracted staff. Each vendor record holds contacts, required documents and their expiry dates, an approval status, and notes on performance.

- Statuses: pending, approved, blocked (with a reason).
- Each business chooses its required documents, for example a business permit or a tax registration certificate, each with an expiry date. An expired document flags the vendor.
- Contracts with a vendor live in Contracts.

**Rules the database will enforce**
1. Nobody can approve a vendor they added.
2. A blocked vendor, or one with an expired required document, can't be given a new contract.
3. Blocking keeps the history. A vendor with a contract can't be deleted.

**Tables:** `vendors`, `vendor_contacts`, `vendor_document_types`, `vendor_documents`.

## 3. Change governance

Sensitive changes go through a request and an approval before they take effect, instead of applying straight away. A request says what changes, why, and from when. A second person approves it, then the database applies it and records it.

- Each business chooses which kinds of change need approval: pay rates, deductions, roles and permissions, area boundaries, product prices and incentives, and business settings.
- A request holds the old value, the new value, the reason and the date it takes effect.
- The approver accepts or rejects it with a note. Approved changes apply on their effective date; a scheduled job applies future-dated ones.
- Every change keeps its before and after values. This extends today's audit trail.

**Rules the database will enforce**
1. Nobody approves their own change request.
2. When a kind of change needs approval, a direct edit is refused. The only way through is an approved request, and the database enforces this, not hidden edit buttons.
3. A request applies only if the value hasn't changed since it was requested. Otherwise it has to be requested again, so two requests can't silently overwrite each other.
4. A change dated inside a locked pay period is refused, the same as today's payroll lock.
5. Requests and their decisions are append-only.

**Tables:** `change_policies` (which kinds need approval, per business), `change_requests` (kind, target, before, after, reason, effective date, status, requested by, decided by and when, decision note, applied at).

## When

After reports and exports (decision 22), unless Kidd wants one sooner. Like every other feature, each module needs acceptance criteria and passing database tests before it counts as done.
