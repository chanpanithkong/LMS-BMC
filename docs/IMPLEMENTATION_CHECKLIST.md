# Implementation Checklist

Status of the frontend against the brief and SRS LMS-SRS-001.

**Key:** ✅ UI and mock behaviour work · 🟡 partial, see note · ⬜ not implemented. "Mock" means the behaviour is simulated by `src/mocks/server`. FastAPI must implement it for real.

## Modules

| # | Module (SRS code) | Status | Notes |
|---|---|---|---|
| 1 | Authentication (AUTH) | 🟡 | Login, forgot/reset, MFA, access denied, remember account, role-based landing. Idle and absolute timeouts, session listing, delegation are backend or not built. |
| 2 | Borrowers (BOR) | 🟡 | Individual and business forms, 7-tab details, duplicates, ID masking with logged reveal, documents, history. Complaints and disputes have no screen. |
| 3 | Loan products (PRD) | ✅ | Versioning, approval, immutable active versions, calculator. |
| 4 | Applications (APP) | ✅ | 8-step wizard, status workflow, documents, review, history, versions. |
| 5 | Credit and approval (CRA) | 🟡 | Queues, affordability, all five actions, limits, escalation, maker-checker. Counter-offer term and condition fulfilment tracking are minimal. |
| 6 | Agreements (AGR) | ✅ | EN, KM, bilingual preview and print, executed lock with hash. Wording is a data layout, not approved legal text (DP-06). |
| 7 | Collateral and guarantors (CLT) | 🟡 | Register, valuation, custody, controlled release, guarantor list and release. No screen for substitution or adding a guarantor outside seed data. |
| 8 | Disbursement (DISB) | ✅ | Request → authorise → confirm or fail, cash and bank, checks, idempotency. Tranches deferred (SRS MVP). |
| 9 | Repayments (PAY) | 🟡 | Allocation preview, partial, excess as unapplied, receipts with COPY/REVERSED, reversal, refund. Cashier session review by a manager has no screen. |
| 10 | Loan accounts (LOAN) | ✅ | 9 tabs, schedule versions, ledger, as-of balances, statement. |
| 11 | Delinquency and collection (COLL) | 🟡 | Dashboard, overdue list, contacts, promises, assignment, contact-hour check. Assignment is manual; automatic escalation is not built. |
| 12 | Rescheduling and restructuring (RST) | 🟡 | Requests, side-by-side terms, approval, signing, execution, history. Refinancing not built. |
| 13 | Settlement and closure (CLS) | 🟡 | Quote, settlement, partial prepayment (reduce term or installment, new schedule version), closure with zero-balance check, history. Quotes use option A only in the mock. |
| 14 | Fees and penalties (PEN) | 🟡 | Rule configuration, transactions, waivers. Charges are seeded, because end-of-day is not simulated. |
| 15 | Accounting (ACC) | 🟡 | Chart, journals with approval and reversal, trial balance, GL, reconciliation, period close. Account mappings are a simple field. Impairment not built (needs V-09, V-10). |
| 16 | Reports (RPT) | 🟡 | All 42 SRS reports with filters and exports. Several are simplified, listed below. PDF is the browser's print-to-PDF. |
| 17 | Notifications (NTF) | ✅ | Centre, details, settings. Delivery and retries are backend. |
| 18 | Documents (FIL) | 🟡 | Library, details, upload, templates, access log. No file content is stored in the mock. |
| 19 | Audit (AUD) | ✅ | Dashboard, log, user and financial activity, exceptions, logins. Read-only. Hash chain is simulated. |
| 20 | Administration (ORG, AUTH) | 🟡 | Users, roles, permissions matrix, branches, company, currencies, rates, calendars, numbering, configuration. Custom roles not built. |
| 21 | Schedule engine (CALC) | ✅ mock | Mock engine passes E1–E14. Custom schedules and variable rates not built (SRS Phase 7). |
| 22 | Dashboards (DSH) | 🟡 | All KPIs, 8 charts, 7 tables, filters, definitions. Only the management dashboard is built; other roles land on their module's main page. |
| 23 | Pawn-backed loans (PWN) | ⬜ | **Not built.** Could Have, D-20 "not in MVP", V-04 unverified. Feature flag exists and is off. |

## Cross-cutting requirements

| Requirement | Status | Notes |
|---|---|---|
| Layout, sidebar, breadcrumbs, global search, notifications, language switch, mobile nav | ✅ | |
| Light theme default, optional dark mode | ✅ | Dark mode has not been visually reviewed on every page. |
| 12 roles, hidden navigation, action gating, branch scope, limits, maker-checker display | ✅ | Enforced again in the mock API. |
| USD 2dp, KHR 0dp, DD/MM/YYYY, Asia/Phnom_Penh, Cambodian addresses | ✅ | |
| English and Khmer | 🟡 | All UI text has a Khmer entry. **Machine-drafted: needs native review.** Server error details and seed data stay in English. |
| Reusable DataTable | ✅ | Search, server pagination, sort, column visibility, filters, date range, row and bulk actions, export, loading, empty and error states. |
| React Hook Form and Zod, confirmation dialogs | ✅ | |
| No browser financial calculation | ✅ | One display helper joins two paid amounts from the API on the schedule table. |
| Mock isolated from client | ✅ | ESLint rule. |
| API client, services, types, idempotency, cancellation | ✅ | Never run against a real FastAPI service. |

## Reports simplified in the mock

RPT-10 and RPT-11 default to the first loan (no loan picker). RPT-16 covers branch level only. RPT-28 reconciles principal only. RPT-33 lists submissions without computing turnaround. RPT-35 counts applications rather than outstanding. RPT-34, RPT-37 and RPT-39 use demo data and thresholds.

## Other known limitations

- Mock state is in server memory: it resets on restart and needs a single server process.
- No end-of-day simulation, so accruals, DPD and penalties do not advance day by day beyond what is computed at read time and seeded.
- Partial prepayment in the mock makes three assumptions the SRS does not settle, each to confirm with the business: amounts already due must be cleared first; the option is chosen per payment rather than configured per product (D-18); a prepayment can be reversed only while no later payment exists. Reducing-balance loans only: flat-rate and bullet loans need a contractual rule (V-01). No prepayment fee is charged.
- Settlement in the mock adjusts future installments to clear the loan. FastAPI must post this properly.
- Historical chart data derives from seed loans, so PAR spikes near the present are an artefact of the seed.
- Account numbers use a simplified check digit in the mock.
- Next.js instant-navigation validation is limited to segments that opt in (`validationLevel: "manual-warning"` in `next.config.ts`), because signed-in pages render only after client-side authentication.
- Accessibility: built with labelled controls and keyboard-usable primitives. No axe audit or screen-reader test was run.
- Khmer printing has not been tested on physical branch printers (AC-15).
- `npm audit` reports moderate advisories from transitive dependencies; not reviewed.

## Verification run

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| ESLint | Pass, no errors or warnings |
| `next build` | Pass |
| `verify:engine` (SRS E1–E14, KHR, leap year, IRR) | Pass |
| `verify:api` (lifecycle and acceptance tests) | Pass |
| Browser sweep of all routes as Owner | All render; no horizontal overflow at 1280 px |
| UI walk-through: MFA sign-in, 8-step application wizard, partial prepayment, repayment, allocation, receipt, required-reason rejection, Khmer | Pass |
| Screenshots: dashboard, loan, approvals, Khmer list, mobile 390 px | Reviewed |

Not covered: real FastAPI integration, Playwright suite, load or security testing, cross-browser checks, and most SRS acceptance criteria (AC-02 onward) which require the backend.
