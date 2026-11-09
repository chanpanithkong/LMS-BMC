# Loan Management System — Frontend

Next.js frontend for a Cambodian-market loan management system, built from `Loan_Management_System_SRS.docx` (LMS-SRS-001 v1.0, draft for review).

> **Demonstration build.** Out of the box the app runs against a built-in mock API with fictional data. Every financial result is simulated and nothing is a real posting. No legal, tax or regulatory compliance is claimed. Interest rates, fees and limits in the demo data are illustrative.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · TanStack Table and Query · Recharts · React Hook Form · Zod · date-fns · Sonner · Zustand. Inter and Noto Sans Khmer are bundled locally.

## Install and run

Requires Node.js 20 or later.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000.

### Production build

```bash
npm run build
```

```bash
npm run start
```

### Demo sign-in

The login page lists all 12 roles. Every account uses the password `Demo@Lms2026!`. Roles with MFA ask for the code `123456`. Use **Switch demo role** in the profile menu to change persona without signing out.

Demo data lives in server memory. It regenerates when the server restarts or from **Reset demonstration data** (administrator or owner).

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (default) uses the built-in API. `live` uses the backend. |
| `NEXT_PUBLIC_API_URL` | FastAPI base URL for live mode, e.g. `http://localhost:8000/api/v1` |

## Architecture

```
src/
  app/(auth), app/(app)   Routes. Each page.tsx only renders a module view.
  app/api/mock/v1         Route handler for the demonstration API
  components/<module>     Module views
  components/{forms,tables,dialogs,shared,layout,ui}   Reusable components
  config/                 Navigation, route permissions, option lists
  hooks/                  Mutation helper
  lib/api/                REST client and one service per domain
  lib/{auth,permissions,formatters,i18n}
  mocks/server/           Mock backend: decimal maths, engine, store, seed, reports, router
  types/                  API contract types
scripts/                  Route generator and verification scripts
docs/                     Implementation plan and requirements checklist
```

### Connecting FastAPI

1. Set `NEXT_PUBLIC_API_MODE=live` and `NEXT_PUBLIC_API_URL`.
2. Implement the endpoints used in `src/lib/api/*.ts`. They follow SRS §15: snake_case, decimal strings for money, cursor pagination (`items`, `next_cursor`, `total`), RFC 9457 errors with a `code`, and `Idempotency-Key` on financial commands.
3. The UI needs no changes. `src/mocks/server` and `src/app/api/mock` can then be deleted.

### Rules the code enforces

- **No financial calculation in the browser.** Schedules, allocations, DSR, balances, penalties and settlements come from the API. The mock runs on the server, and an ESLint rule stops client code importing it.
- **Money is a decimal string.** `lib/formatters/money.ts` formats digits only. Chart geometry is the one place amounts become numbers, for pixel positions only.
- **Frontend permissions shape the interface only.** Real authorisation belongs in FastAPI.
- **Posted records have no edit path.** Corrections are reversals, and the API has no update route for ledgers or posted journals.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run lint` / `npm run typecheck` | ESLint, TypeScript |
| `npm run verify:engine` | Mock engine against SRS examples E1–E14 |
| `npm run verify:api` | Lifecycle and acceptance checks against the mock API |
| `python scripts/i18n-coverage.py --list` | Lists UI strings with no Khmer translation |
| `python scripts/generate-routes.py` | Regenerates thin route files from the route table |

## Project status

Requirement status and known gaps: [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md). SRS conflicts and how they were handled: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
