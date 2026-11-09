# Implementation Plan — LMS Frontend

Source of truth: `Loan_Management_System_SRS.docx` (LMS-SRS-001 v1.0, **Draft for Review — not approved**).
Scope: 23 SRS modules · 228 functional requirements · 46 NFRs · 62 business rules · 16 workflows · 24 page groups · 42 reports.

## 1. Architecture decisions

| Topic | Decision | Reason |
|---|---|---|
| Mock backend | `src/app/api/mock/v1/[...path]/route.ts` → `src/mocks/server/*` (Next Route Handlers, in-memory) | Brief §11/§19: no financial calculation in the browser, yet the app must run with no backend. The browser only speaks REST. |
| Backend swap | `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` | No UI or service code changes. |
| Money | Decimal **strings** everywhere in the client; `src/lib/formatters/money.ts` only formats strings. Mock uses BigInt fixed-point. | CN-5, NFR-FIN-002. |
| Mock isolation | ESLint forbids `@/mocks/server` from anywhere but the route handler. | Guarantees the engine cannot reach the browser bundle. |
| API conventions | SRS §15.1: snake_case, cursor pagination, RFC 9457 errors, `Idempotency-Key` on financial commands, sub-resource commands. | |
| Auth | Access token in memory; refresh token in HttpOnly cookie (mock issues one). | SRS §15.1. |
| i18n | English source strings → Khmer catalogue via a small typed `t()` with Zustand locale. | `next-intl` server APIs add friction with this project's `cacheComponents: true`; the brief permits an equivalent. |
| XLSX | Small dependency-free writer. | Brief: no unnecessary libraries. |

## 2. SRS conflicts and how they are handled

Nothing below was resolved by inventing a rule. Each default is stated so it can be overturned.

| # | Conflict / gap | Handling |
|---|---|---|
| 1 | SRS CN-7 and Document Control: "no application source code before review". | Built on your explicit instruction. Mock/demo only; the SRS approval table is still blank. |
| 2 | Application statuses differ: §6.6 (Under Review, Pending Documents, Pending Credit Assessment…) vs §15.4 (UNDER_ASSESSMENT, RETURNED, CANCELLED). | §6.6 used (it matches your brief). §15.4 needs reconciling before the FastAPI contract is frozen. |
| 3 | Out-of-branch access: BR-SEC-001 / AT-AUTH-01 say 404, TC-AUTH-002 and §15.1 say 403 OUT_OF_BRANCH_SCOPE. | Mock returns 404 (the rule and acceptance test). |
| 4 | Closure error code: TC-CLS-002 `OUTSTANDING_BALANCE` vs AT-CLS-02 `OUTSTANDING_OBLIGATIONS`. | Mock uses `OUTSTANDING_OBLIGATIONS`. |
| 5 | Mapping error code: `MAPPING_MISSING` vs `ACCOUNT_MAPPING_MISSING`. | Mock uses `MAPPING_MISSING` (§15.1). |
| 6 | Loan after accept-terms: §6.13 "Accepted" then "Pending Disbursement"; §15.2 returns PENDING_DISBURSEMENT directly. | §6.13 lifecycle used; the disbursement request moves Accepted → Pending Disbursement. |
| 7 | Report list: your brief lists about 41 names, SRS §18 lists RPT-01…42 (RPT-28 and 29 are "Reconciliation Reports"). | All 42 SRS reports implemented under the SRS names. |
| 8 | Loan tabs: §16.3 (8 tabs) vs your brief (9 tabs). | Your brief's 9 tabs; they are a superset. |
| 9 | Your brief has 20 modules, SRS has 23. CALC is delivered via the calculator/schedule screens; ORG and PWN are not in your list. | ORG is in Administration. PWN (Could Have, D-20 "not in MVP", V-04 unverified) is behind a feature flag, off by default — see the checklist. |
| 10 | DSR denominator: §6.7 "monthly income", §18.1 "monthly verified net income". | Backend concern; the UI displays the value and its definition. |
| 11 | Open decisions D-01…D-20 and legal items V-01…V-13. | SRS recommended defaults are used in demo configuration only and labelled illustrative. No statutory value is implemented. |

## 3. Delivery order

1. Foundation: dependencies, theme, layout, API client, RBAC, i18n, mock backend.
2. Modules in the order given in the brief.
3. QA: `tsc`, ESLint, production build, every-route smoke test, engine check against SRS examples E1–E14 and W1–W3.

Status per requirement is in [`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md).
