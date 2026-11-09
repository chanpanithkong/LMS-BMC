/**
 * MOCK BACKEND ONLY — a stand-in for the FastAPI service (SRS §15). Every response is simulated.
 */
import { createHash, randomUUID } from "node:crypto";
import { add, cmp, fromCents, isPositive, isZero, min, percent, rat, rdiv, rmul, roundHalfUp, ratFrom, sub } from "./decimal";
import { accruedInterest, addDays, EngineError, generateSchedule, type Terms } from "./engine";
import { dashboard, REPORTS, runReport, scoped, trialBalance, type Params } from "./reports";
import { DEMO_MFA, DEMO_PASSWORD, ensureSeeded, seed } from "./seed";
import {
  activeSchedule, applyRepayment, asInstallments, assertState, audit, balances, buildSchedule, cashAccount, ctxFor, dpdOf, find, inScope, need, nextSeq, notify, nowIso, outstandingPrincipal, pad, Problem, postJournal, postTxn,
  allocate, refreshInstallments, requireReason, reverseRepayment, sod, state, summary, table, today, uid, validation, type Ctx, type Installment, type Row,
} from "./store";
import { landingRoute, PERMISSION_GROUPS, ROLE_NAMES, ROLE_PERMISSIONS, ROLES, type Permission, type RoleCode } from "@/lib/permissions";

interface Req { method: string; path: string[]; query: Params; body: Row; headers: Headers; ip: string; traceId: string; cookieUser?: string }
export interface Res { status: number; body: unknown; setCookie?: string }

const ok = (body: unknown, status = 200): Res => ({ status, body });
const COOKIE = "lms_mock_refresh";

// ───── Lists ─────
function pageOf(rows: Row[], q: Params, dateField?: string, searchKeys?: string[]) {
  let out = rows;
  const reserved = new Set(["limit", "cursor", "search", "sort", "date_from", "date_to"]);
  for (const [key, value] of Object.entries(q)) {
    if (reserved.has(key) || !value) continue;
    if (out.length && !(key in out[0]) && !out.some((r) => key in r)) continue;
    const allowed = value.split(",");
    out = out.filter((r) => allowed.includes(String(r[key])));
  }
  if (q.search) {
    const s = q.search.toLowerCase();
    // Staff names are not record identity: searching "Sok" must not return every record handled by an officer called Sok.
    const staffField = /officer|_by|cashier|^user_name$/;
    out = out.filter((r) => Object.entries(r).some(([k, v]) => (searchKeys ? searchKeys.includes(k) : !staffField.test(k)) && (typeof v === "string" || typeof v === "number") && String(v).toLowerCase().includes(s)));
  }
  if (dateField && (q.date_from || q.date_to)) out = out.filter((r) => { const d = String(r[dateField] ?? "").slice(0, 10); return d && (!q.date_from || d >= q.date_from) && (!q.date_to || d <= q.date_to); });
  if (q.sort) {
    const desc = q.sort.startsWith("-");
    const key = desc ? q.sort.slice(1) : q.sort;
    out = [...out].sort((a, b) => {
      const x = a[key], y = b[key];
      const numeric = typeof x === "number" && typeof y === "number";
      const money = typeof x === "string" && typeof y === "string" && /^-?\d+\.\d+$/.test(x) && /^-?\d+\.\d+$/.test(y);
      const c = numeric ? x - y : money ? cmp(x, y) : String(x ?? "").localeCompare(String(y ?? ""));
      return desc ? -c : c;
    });
  }
  const limit = Math.min(Number(q.limit) || 25, 200);
  const offset = Number(q.cursor) || 0;
  const items = out.slice(offset, offset + limit);
  return { items, total: out.length, next_cursor: offset + limit < out.length ? String(offset + limit) : null };
}

const maskId = (b: Row) => { const { id_number_full, ...rest } = b; return { ...rest, id_number: `••••${String(id_number_full ?? "").slice(-4)}` }; };

function installmentsRows(ctx: Ctx) {
  return scoped(ctx, table("loans")).filter((l) => l.status === "ACTIVE").flatMap((l) => (activeSchedule(l).installments as Installment[]).map((i) => ({ id: `${l.id}-${i.no}`, loan_id: l.id, loan_account_no: l.account_no, borrower_name: l.borrower_name, branch_id: l.branch_id, product_id: l.product_id, currency: l.currency, no: i.no, due_date: i.due_date, payment_due_date: i.payment_due_date, principal: i.principal, interest: i.interest, total: i.total, amount_paid: add(i.principal_paid, i.interest_paid, i.fee_paid, i.penalty_paid), status: i.status })));
}

function overdueRows(ctx: Ctx) {
  return scoped(ctx, table("loans")).filter((l) => l.status === "ACTIVE" && dpdOf(l, today()) > 0).filter((l) => !(ctx.roles.includes("COLLOFF") && l.collection_officer_id !== ctx.user.id)).map(summary);
}

const LISTS: Record<string, { rows: (ctx: Ctx) => Row[]; perms: Permission[]; date?: string; noScope?: boolean; search?: string[] }> = {
  borrowers: { rows: () => table("borrowers").map(maskId), perms: ["borrower.view"], date: "created_at", search: ["customer_code", "name_en", "name_km", "legal_name", "trading_name", "phone"] },
  products: { rows: () => table("products").map((p) => ({ ...p, ...p.versions.find((v: Row) => v.version_no === (p.active_version || 1))?.config, version_count: p.versions.length, pending_versions: p.versions.filter((v: Row) => v.status === "PENDING_APPROVAL").length, status: p.status })), perms: ["product.view"] },
  "product-versions": { rows: () => table("products").flatMap((p) => p.versions.map((v: Row) => ({ id: `${p.id}:${v.version_no}`, product_id: p.id, product_code: p.code, product_name: p.name_en, version_no: v.version_no, status: v.status, effective_from: v.effective_from, created_by: v.created_by, created_by_name: v.created_by_name, change_note: v.change_note }))), perms: ["product.view"] },
  applications: { rows: () => table("applications"), perms: ["application.view", "credit.view"], date: "created_at" },
  agreements: { rows: () => table("agreements"), perms: ["agreement.view"], date: "generated_at" },
  collateral: { rows: () => table("collateral"), perms: ["collateral.view"], date: "valuation_date" },
  guarantors: { rows: () => table("guarantors"), perms: ["collateral.view", "loan.view"] },
  disbursements: { rows: () => table("disbursements"), perms: ["disbursement.view"], date: "disbursement_date" },
  repayments: { rows: () => table("repayments"), perms: ["repayment.view"], date: "value_date" },
  "reversal-requests": { rows: () => table("reversal_requests"), perms: ["repayment.view"], date: "created_at" },
  refunds: { rows: () => table("refunds"), perms: ["repayment.view"] },
  loans: { rows: () => table("loans").map(summary), perms: ["loan.view"], date: "disbursed_on" },
  "loan-installments": { rows: installmentsRows, perms: ["loan.view"], date: "due_date" },
  "loan-transactions": { rows: (ctx) => scoped(ctx, table("loans")).flatMap((l) => l.transactions).sort((a: Row, b: Row) => b.value_date.localeCompare(a.value_date)), perms: ["loan.view"], date: "value_date" },
  "collections/overdue": { rows: overdueRows, perms: ["collection.view"] },
  "collections/activities": { rows: () => table("collection_activities"), perms: ["collection.view"], date: "contact_time" },
  "collections/promises": { rows: () => table("promises"), perms: ["collection.view"], date: "promise_date" },
  modifications: { rows: () => table("modifications"), perms: ["restructure.view"], date: "created_at" },
  settlements: { rows: () => table("settlements"), perms: ["settlement.view"], date: "settlement_date" },
  "closures/ready": { rows: (ctx) => scoped(ctx, table("loans")).filter((l) => l.status === "ACTIVE" && isZero(balances(l).outstanding_principal)).map(summary), perms: ["settlement.view"] },
  "closures/history": { rows: (ctx) => scoped(ctx, table("loans")).filter((l) => l.status.startsWith("CLOSED")).map(summary), perms: ["settlement.view", "loan.view"], date: "closed_on" },
  "fee-rules": { rows: () => table("fee_rules"), perms: ["fee.view"], noScope: true },
  "penalty-rules": { rows: () => table("penalty_rules"), perms: ["fee.view"], noScope: true },
  "fee-transactions": { rows: () => table("fee_transactions"), perms: ["fee.view"], date: "value_date" },
  waivers: { rows: () => table("waivers"), perms: ["fee.view"], date: "created_at" },
  "accounting/accounts": { rows: () => table("accounts"), perms: ["accounting.view"], noScope: true },
  "accounting/journals": { rows: () => table("journals"), perms: ["accounting.view"], date: "accounting_date" },
  "accounting/periods": { rows: () => [...table("periods")].reverse(), perms: ["accounting.view"], noScope: true },
  "accounting/reconciliations": { rows: () => table("reconciliations"), perms: ["accounting.view"], noScope: true },
  "accounting/general-ledger": { rows: () => table("journals").filter((j) => j.status !== "PENDING_APPROVAL" && j.status !== "REJECTED").flatMap((j) => j.lines.map((l: Row) => ({ ...l, id: `${j.id}-${l.id}`, journal_id: j.id, journal_no: j.journal_no, accounting_date: j.accounting_date, description: j.description, currency: j.currency, source_type: j.source_type, status: j.status }))), perms: ["accounting.view"], date: "accounting_date", noScope: true },
  notifications: { rows: () => table("notifications"), perms: ["notification.view"], date: "created_at" },
  "notification-settings": { rows: () => table("notification_settings"), perms: ["notification.view"], noScope: true },
  documents: { rows: () => table("documents"), perms: ["document.view"], date: "uploaded_at" },
  templates: { rows: () => table("templates"), perms: ["document.view", "template.manage"], noScope: true },
  "audit-logs": { rows: () => table("audit_logs"), perms: ["audit.view"], date: "at", noScope: true },
  "login-history": { rows: () => table("login_history"), perms: ["audit.view"], date: "at", noScope: true },
  "control-exceptions": { rows: () => table("control_exceptions"), perms: ["audit.view"], date: "at" },
  "export-logs": { rows: () => table("export_logs"), perms: ["audit.view"], date: "at", noScope: true },
  users: { rows: () => table("users"), perms: ["user.view"], noScope: true },
  branches: { rows: () => table("branches"), perms: ["org.view", "user.view", "loan.view", "borrower.view"], noScope: true },
  currencies: { rows: () => table("currencies"), perms: ["org.view"], noScope: true },
  "exchange-rates": { rows: () => table("exchange_rates"), perms: ["org.view"], noScope: true },
  holidays: { rows: () => table("holidays"), perms: ["org.view"], noScope: true },
  sequences: { rows: () => table("sequences"), perms: ["org.view"], noScope: true },
  "system-settings": { rows: () => table("system_settings"), perms: ["org.view"], noScope: true },
  "feature-flags": { rows: () => table("feature_flags"), perms: ["org.view"], noScope: true },
  "cashier-sessions": { rows: () => table("cashier_sessions"), perms: ["repayment.view"] },
};

/** Master data only (SRS §15.5): anything financial is a command, and has no PATCH. */
const MASTER: Record<string, { table: string; perm: Permission; prefix: string; fields: string[] }> = {
  branches: { table: "branches", perm: "org.manage", prefix: "br", fields: ["code", "name", "name_km", "province", "phone", "manager", "status", "cash_points", "calendar"] },
  "accounting/accounts": { table: "accounts", perm: "accounting.configure", prefix: "acc", fields: ["code", "name", "account_type", "currency", "postable", "status", "parent", "mapping"] },
  "exchange-rates": { table: "exchange_rates", perm: "org.manage", prefix: "fx", fields: ["from_currency", "to_currency", "rate", "source", "effective_date", "entered_by"] },
  holidays: { table: "holidays", perm: "org.manage", prefix: "hol", fields: ["calendar", "date", "name", "status"] },
  sequences: { table: "sequences", perm: "org.manage", prefix: "seq", fields: ["name", "pattern", "next_value", "scope"] },
  "system-settings": { table: "system_settings", perm: "org.manage", prefix: "set", fields: ["value"] },
  "feature-flags": { table: "feature_flags", perm: "org.manage", prefix: "ff", fields: ["enabled"] },
  guarantors: { table: "guarantors", perm: "collateral.manage", prefix: "gua", fields: ["name", "name_km", "relationship", "phone", "guarantee_amount", "status"] },
  templates: { table: "templates", perm: "template.manage", prefix: "tpl", fields: ["name", "language", "version", "status"] },
  "notification-settings": { table: "notification_settings", perm: "notification.view", prefix: "ns", fields: ["in_app", "email", "sms"] },
};

// ───── Domain helpers ─────
function loanOr404(ctx: Ctx, id: string) {
  const loan = find("loans", id);
  if (!loan || !inScope(ctx, loan)) throw new Problem(404, "NOT_FOUND", "Loan not found.", "Not found");
  return loan;
}
function rowOr404(ctx: Ctx, name: string, id: string) {
  const row = find(name, id);
  if (!row || !inScope(ctx, row)) throw new Problem(404, "NOT_FOUND", "Record not found.", "Not found");
  return row;
}
const limitFor = (ctx: Ctx, currency: string): string => (currency === "KHR" ? ctx.user.approval_limit_khr : ctx.user.approval_limit_usd);

function termsFromApp(app: Row, amount: string, term: number, date: string): Terms {
  const product = find("products", app.product_id)!;
  const c = product.versions.find((v: Row) => v.version_no === app.product_version).config;
  return { principal: amount, currency: app.currency, annual_rate: c.annual_rate, interest_method: c.interest_method, amortisation: c.amortisation, day_count: c.day_count, frequency: c.repayment_frequency, term, disbursement_date: date };
}

function createLoan(app: Row, amount: string, term: number, ctx: Ctx) {
  const br = find("branches", app.branch_id)!;
  const terms = termsFromApp(app, amount, term, addDays(today(), 7));
  const schedule = buildSchedule(terms);
  const body = `${br.code}${app.product_code}${pad(nextSeq(`loan:${br.code}${app.product_code}`, 100))}`;
  const loan = {
    id: uid("ln"), account_no: `${body}-${[...body].reduce((s, c) => s + c.charCodeAt(0), 0) % 10}`, borrower_id: app.borrower_id, borrower_name: app.borrower_name, borrower_name_km: app.borrower_name_km, branch_id: app.branch_id, branch_name: br.name, branch_code: br.code, product_id: app.product_id, product_code: app.product_code, product_name: app.product_name, product_version: app.product_version, application_id: app.id, officer_id: app.created_by, officer_name: app.created_by_name, currency: app.currency, status: "PENDING_ACCEPTANCE", approved_amount: amount, contractual_principal: amount, disbursed_principal: "0.00", disbursed_on: null, approved_on: today(), terms, annual_rate: terms.annual_rate, term, frequency: terms.frequency, purpose: app.purpose, sector: "Household", maturity_date: schedule.maturity_date, restructure_count: 0, flags: [], collection_officer_id: null, collection_officer_name: null, last_contact: null, next_follow_up: null, closed_on: null, closure_type: null,
    schedule_versions: [{ version_no: 1, status: "PROPOSED", reason: "ORIGINAL", effective_from: terms.disbursement_date, engine_version: schedule.engine_version, total_principal: schedule.total_principal, total_interest: schedule.total_interest, installments: asInstallments(schedule.installments) }],
    terms_versions: [{ version_no: 1, status: "PROPOSED", effective_from: terms.disbursement_date, source: "APPROVAL", annual_rate: terms.annual_rate, term, frequency: terms.frequency, interest_method: terms.interest_method, amortisation: terms.amortisation, day_count: terms.day_count }],
    transactions: [], created_at: nowIso(),
  };
  table("loans").unshift(loan);
  audit(ctx, "LOAN_CREATED", "Loans", loan.account_no, "", "PENDING_ACCEPTANCE", "Created from approved application", true);
  return loan;
}

function appTransition(app: Row, to: string, ctx: Ctx, reason = "") {
  app.status_history.push({ status: to, previous_status: app.status, actor: ctx.user.name, at: nowIso(), reason });
  audit(ctx, `APPLICATION_${to}`, "Applications", app.reference ?? app.id, app.status, to, reason);
  app.status = to;
}

function validateConfig(c: Row) {
  if (cmp(c.min_principal, c.max_principal) > 0) validation("max_principal", "Minimum principal cannot exceed maximum principal.");
  if (Number(c.min_term) > Number(c.max_term)) validation("max_term", "Minimum term cannot exceed maximum term.");
  try { generateSchedule({ principal: c.min_principal, currency: c.currency, annual_rate: c.annual_rate, interest_method: c.interest_method, amortisation: c.amortisation, day_count: c.day_count, frequency: c.repayment_frequency, term: Math.max(Number(c.min_term), 1), disbursement_date: today() }); }
  catch (e) { if (e instanceof EngineError) throw new Problem(422, e.code, e.message, "Invalid product configuration"); throw e; }
}

function canContact(time: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "numeric", hour12: false }).format(new Date(time)));
  return hour >= 7 && hour < 20;
}

const decimal = (body: Row, field: string) => {
  const v = String(body[field] ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(v) || !isPositive(v)) validation(field, "Enter a valid amount greater than zero.");
  return v.includes(".") ? v.padEnd(v.indexOf(".") + 3, "0") : `${v}.00`;
};

function runIdempotent(req: Req, fn: () => Res): Res {
  const key = req.headers.get("idempotency-key");
  if (!key) return fn();
  const hash = createHash("sha256").update(JSON.stringify([req.path, req.body])).digest("hex");
  const store = state.idempotency!;
  const hit = store.get(key);
  if (hit) {
    if (hit.hash !== hash) throw new Problem(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used with a different request.");
    return { status: hit.status, body: hit.body };
  }
  const res = fn();
  store.set(key, { hash, body: res.body, status: res.status });
  return res;
}

// ───── Routes ─────
type Handler = (ctx: Ctx, req: Req, a: string, b: string) => Res;
const routes: { method: string; pattern: RegExp; handler: Handler; financial: boolean }[] = [];
function on(method: string, path: string, handler: Handler, financial = false) {
  routes.push({ method, pattern: new RegExp(`^${path.replace(/:[a-z]+/g, "([^/]+)")}$`), handler, financial });
}
const post = (path: string, handler: Handler) => on("POST", path, handler, true);

on("GET", "/auth/me", (ctx) => ok(sessionUser(ctx.user)));
on("GET", "/search", (ctx, req) => {
  const q = (req.query.q ?? "").toLowerCase();
  if (q.length < 2) return ok({ items: [] });
  const hit = (r: Row, ...keys: string[]) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q));
  const items = [
    ...(ctx.perms.includes("borrower.view") ? scoped(ctx, table("borrowers")).filter((b) => hit(b, "name_en", "name_km", "customer_code", "phone")).slice(0, 5).map((b) => ({ type: "Borrower", label: b.name_en, sublabel: `${b.customer_code} · ${b.name_km}`, href: `/borrowers/${b.id}` })) : []),
    ...(ctx.perms.includes("loan.view") ? scoped(ctx, table("loans")).filter((l) => hit(l, "account_no", "borrower_name")).slice(0, 5).map((l) => ({ type: "Loan", label: l.account_no, sublabel: l.borrower_name, href: `/loans/${l.id}` })) : []),
    ...(ctx.perms.includes("application.view") ? scoped(ctx, table("applications")).filter((a) => hit(a, "reference", "borrower_name")).slice(0, 5).map((a) => ({ type: "Application", label: a.reference ?? "Draft", sublabel: a.borrower_name, href: `/applications/${a.id}` })) : []),
  ];
  return ok({ items });
});
on("GET", "/dashboards/management", (ctx, req) => { need(ctx, "loan.view"); return ok(dashboard(ctx, req.query)); });
on("POST", "/admin/reset-demo", (ctx) => { need(ctx, "org.manage"); seed(); return ok({ reset: true }); });

// Calculations
on("POST", "/calculations/schedule-preview", (_ctx, req) => {
  const b = req.body;
  try {
    return ok(buildSchedule({ principal: decimal(b, "principal"), currency: b.currency, annual_rate: String(b.annual_rate), interest_method: b.interest_method, amortisation: b.amortisation, day_count: b.day_count, frequency: b.frequency, term: Number(b.term), disbursement_date: b.disbursement_date || today(), first_due_date: b.first_due_date || undefined, grace_type: b.grace_type, grace_periods: Number(b.grace_periods) || 0, rounding_increment: b.rounding_increment || undefined }));
  } catch (e) { if (e instanceof EngineError) throw new Problem(422, e.code, e.message, "Calculation failed"); throw e; }
});
on("POST", "/calculations/affordability", (_ctx, req) => {
  const b = req.body; const income = decimal(b, "monthly_income");
  const expenses = String(b.monthly_expenses || "0.00"), existing = String(b.existing_installments || "0.00"), proposed = String(b.proposed_installment || "0.00");
  const netBefore = sub(sub(income, expenses), existing);
  return ok({ net_disposable_income: netBefore, dsr_percent: percent(add(existing, proposed), income), repayment_capacity_percent: isPositive(netBefore) ? percent(proposed, netBefore) : "0.00", thresholds_note: "Illustrative internal policy: DSR ≤ 50 %, repayment capacity ≤ 70 %." });
});

// Borrowers
on("GET", "/borrowers/:id", (ctx, _r, id) => {
  need(ctx, "borrower.view"); const b = rowOr404(ctx, "borrowers", id);
  const loans = table("loans").filter((l) => l.borrower_id === id).map(summary);
  const applications = table("applications").filter((a) => a.borrower_id === id);
  const documents = ctx.perms.includes("borrower.sensitive") ? table("documents").filter((d) => d.owner_id === id) : [];
  const repayments = table("repayments").filter((r) => r.borrower_id === id).slice(-20).reverse();
  return ok({ ...maskId(b), can_reveal_id: ctx.perms.includes("borrower.sensitive"), loans, applications, documents, repayments, activities: table("audit_logs").filter((a) => a.record_reference === b.customer_code).slice(0, 15) });
});
post("/borrowers/:id/reveal-id", (ctx, _r, id) => { need(ctx, "borrower.sensitive"); const b = rowOr404(ctx, "borrowers", id); audit(ctx, "ID_NUMBER_VIEWED", "Borrowers", b.customer_code, "", "Full identification number displayed"); return ok({ id_number: b.id_number_full }); });
on("POST", "/borrowers", (ctx, req) => {
  need(ctx, "borrower.edit"); const b = req.body; const type = b.type === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL";
  const name = type === "BUSINESS" ? b.legal_name : b.name_en;
  if (!String(name ?? "").trim()) validation(type === "BUSINESS" ? "legal_name" : "name_en", "Name is required.");
  if (!/^\+?855[\s\d]{8,12}$|^0\d{8,9}$/.test(String(b.phone ?? "").replace(/\s/g, ""))) validation("phone", "Enter a valid Cambodian phone number.");
  const idn = type === "BUSINESS" ? b.registration_number : b.id_number;
  const phoneKey = String(b.phone).replace(/\D/g, "").slice(-8);
  const candidates = table("borrowers").filter((x) => x.id_number_full === idn || String(x.phone).replace(/\D/g, "").slice(-8) === phoneKey || (x.name_en === name && b.date_of_birth && x.date_of_birth === b.date_of_birth));
  if (candidates.length && !b.confirm_duplicate) throw new Problem(409, "POSSIBLE_DUPLICATE", "Possible duplicate borrower found. Review the matches before continuing.", "Possible duplicate", [], { candidates: candidates.map((c) => ({ id: c.id, customer_code: c.customer_code, name_en: c.name_en, phone: c.phone })) });
  const branchId = b.branch_id || (ctx.allBranches ? "br-pp1" : ctx.branches[0]); const br = find("branches", branchId)!;
  const a = b.address ?? {};
  const row = { id: uid("bor"), customer_code: type === "BUSINESS" ? `B-${pad(nextSeq("cust:b", 15), 5)}` : `C-${pad(nextSeq("cust:c", 69), 5)}`, type, name_en: name, name_km: b.name_km ?? "", legal_name: b.legal_name, trading_name: b.trading_name, status: "PROSPECT", branch_id: branchId, branch_name: br.name, id_type: type === "BUSINESS" ? "Business registration" : b.id_type, id_number_full: idn, registration_number: b.registration_number, date_of_birth: b.date_of_birth, phone: b.phone, email: b.email ?? "", address: a, address_text: [a.house && `No. ${a.house}`, a.street, a.village, a.commune, a.district, a.province].filter(Boolean).join(", "), occupation: b.occupation, employer: b.employer, business_activity: b.business_activity, annual_revenue: b.annual_revenue, annual_expenses: b.annual_expenses, monthly_income: b.monthly_income || "0.00", existing_liabilities: b.existing_liabilities || "0.00", currency: "USD", emergency_contact: b.emergency_contact ?? null, representatives: b.representatives ?? [], preferred_language: b.preferred_language ?? "km", officer_id: ctx.user.id, officer_name: ctx.user.name, notes: [], complaints: [], created_at: nowIso(), created_by: ctx.user.id, duplicate_flag: candidates.length > 0, duplicate_review: candidates.length ? "PENDING" : null, duplicate_reason: b.duplicate_reason };
  table("borrowers").unshift(row); audit(ctx, "BORROWER_CREATED", "Borrowers", row.customer_code, "", "PROSPECT");
  return ok(maskId(row), 201);
});
on("PATCH", "/borrowers/:id", (ctx, req, id) => {
  need(ctx, "borrower.edit"); const b = rowOr404(ctx, "borrowers", id);
  for (const key of ["phone", "email", "occupation", "employer", "monthly_income", "existing_liabilities", "preferred_language", "name_km", "trading_name", "business_activity", "emergency_contact", "address"]) if (key in req.body) b[key] = req.body[key];
  if (req.body.address) { const a = req.body.address; b.address_text = [a.house && `No. ${a.house}`, a.street, a.village, a.commune, a.district, a.province].filter(Boolean).join(", "); }
  audit(ctx, "BORROWER_UPDATED", "Borrowers", b.customer_code, "", "Profile updated"); return ok(maskId(b));
});
post("/borrowers/:id/confirm-duplicate", (ctx, req, id) => { need(ctx, "borrower.confirm_duplicate"); const b = rowOr404(ctx, "borrowers", id); b.duplicate_review = "CONFIRMED_NOT_DUPLICATE"; b.duplicate_flag = false; audit(ctx, "DUPLICATE_REVIEWED", "Borrowers", b.customer_code, "PENDING", "CONFIRMED_NOT_DUPLICATE", requireReason(req.body)); return ok(maskId(b)); });
post("/borrowers/:id/status", (ctx, req, id) => {
  need(ctx, "borrower.confirm_duplicate"); const b = rowOr404(ctx, "borrowers", id); const reason = requireReason(req.body);
  if (req.body.status === "INACTIVE" && (table("loans").some((l) => l.borrower_id === id && ["ACTIVE", "PENDING_DISBURSEMENT", "ACCEPTED", "PENDING_ACCEPTANCE"].includes(l.status)) || table("applications").some((a) => a.borrower_id === id && !["APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(a.status)))) throw new Problem(409, "OPEN_OBLIGATIONS", "Borrowers with open loans or applications cannot be deactivated.");
  const prev = b.status; b.status = req.body.status; audit(ctx, "BORROWER_STATUS_CHANGED", "Borrowers", b.customer_code, prev, b.status, reason); return ok(maskId(b));
});
on("POST", "/borrowers/:id/notes", (ctx, req, id) => { need(ctx, "borrower.edit"); const b = rowOr404(ctx, "borrowers", id); b.notes.unshift({ text: requireReason(req.body, "text"), by: ctx.user.name, at: nowIso() }); return ok(maskId(b)); });

// Products
on("GET", "/products/:id", (ctx, _r, id) => { need(ctx, "product.view"); const p = find("products", id); if (!p) throw new Problem(404, "NOT_FOUND", "Product not found."); return ok(p); });
on("POST", "/products", (ctx, req) => {
  need(ctx, "product.propose"); const c = req.body;
  if (table("products").some((p) => p.code === c.code)) validation("code", "Product code already exists.", "DUPLICATE_CODE");
  validateConfig(c);
  const { code, ...config } = c;
  const p = { id: uid("prd"), code, name_en: c.name_en, name_km: c.name_km, product_type: c.product_type, status: "DRAFT", currency: c.currency, active_version: 0, created_at: nowIso(), created_by: ctx.user.id, versions: [{ version_no: 1, status: "DRAFT", effective_from: c.effective_from || today(), created_by: ctx.user.id, created_by_name: ctx.user.name, approved_by: null, approved_by_name: null, approved_at: null, change_note: "New product draft", config }] };
  table("products").unshift(p); audit(ctx, "PRODUCT_DRAFTED", "Products", code, "", "DRAFT"); return ok(p, 201);
});
on("POST", "/products/:id/versions", (ctx, req, id) => {
  need(ctx, "product.propose"); const p = find("products", id)!; const latest = p.versions[p.versions.length - 1];
  if (["DRAFT", "PENDING_APPROVAL"].includes(latest.status)) throw new Problem(409, "DRAFT_EXISTS", "A draft or pending version already exists for this product.");
  const v = { ...latest, version_no: latest.version_no + 1, status: "DRAFT", approved_by: null, approved_by_name: null, approved_at: null, created_by: ctx.user.id, created_by_name: ctx.user.name, change_note: req.body.change_note || "New version", config: { ...latest.config } };
  p.versions.push(v); return ok(p, 201);
});
on("PATCH", "/products/:id/versions/:v", (ctx, req, id, v) => {
  need(ctx, "product.propose"); const p = find("products", id)!; const version = p.versions.find((x: Row) => x.version_no === Number(v));
  if (version.status !== "DRAFT") throw new Problem(409, "PRODUCT_VERSION_IMMUTABLE", "Only draft versions can be edited. Create a new version instead.");
  const merged = { ...version.config, ...req.body }; validateConfig(merged); version.config = merged; if (req.body.change_note) version.change_note = req.body.change_note; audit(ctx, "PRODUCT_DRAFT_EDITED", "Products", `${p.code} v${v}`, "", "DRAFT"); return ok(p);
});
post("/products/:id/versions/:v/submit", (ctx, _r, id, v) => { need(ctx, "product.propose"); const p = find("products", id)!; const x = p.versions.find((y: Row) => y.version_no === Number(v)); assertState(x.status, ["DRAFT"]); validateConfig(x.config); x.status = "PENDING_APPROVAL"; audit(ctx, "PRODUCT_SUBMITTED", "Products", `${p.code} v${v}`, "DRAFT", "PENDING_APPROVAL"); return ok(p); });
post("/products/:id/versions/:v/approve", (ctx, _r, id, v) => {
  need(ctx, "product.approve"); const p = find("products", id)!; const x = p.versions.find((y: Row) => y.version_no === Number(v));
  assertState(x.status, ["PENDING_APPROVAL"]); sod(ctx, x.created_by, "approve");
  for (const y of p.versions) if (y.status === "ACTIVE") y.status = "SUPERSEDED";
  x.status = "ACTIVE"; x.approved_by = ctx.user.id; x.approved_by_name = ctx.user.name; x.approved_at = nowIso(); p.active_version = x.version_no; p.status = "ACTIVE"; audit(ctx, "PRODUCT_VERSION_APPROVED", "Products", `${p.code} v${v}`, "PENDING_APPROVAL", "ACTIVE"); return ok(p);
});
post("/products/:id/versions/:v/reject", (ctx, req, id, v) => { need(ctx, "product.approve"); const p = find("products", id)!; const x = p.versions.find((y: Row) => y.version_no === Number(v)); assertState(x.status, ["PENDING_APPROVAL"]); x.status = "REJECTED"; audit(ctx, "PRODUCT_VERSION_REJECTED", "Products", `${p.code} v${v}`, "PENDING_APPROVAL", "REJECTED", requireReason(req.body)); return ok(p); });
post("/products/:id/retire", (ctx, req, id) => { need(ctx, "product.approve"); const p = find("products", id)!; p.status = "RETIRED"; audit(ctx, "PRODUCT_RETIRED", "Products", p.code, "ACTIVE", "RETIRED", requireReason(req.body)); return ok(p); });

// Applications
on("GET", "/applications/:id", (ctx, _r, id) => { need(ctx, "application.view", "credit.view"); const a = rowOr404(ctx, "applications", id); return ok({ ...a, borrower: maskId(find("borrowers", a.borrower_id)!), loan_id: table("loans").find((l) => l.application_id === id)?.id ?? null }); });
on("POST", "/applications", (ctx, req) => {
  need(ctx, "application.create"); const b = req.body; const borrower = rowOr404(ctx, "borrowers", b.borrower_id); const p = find("products", b.product_id)!; const c = p.versions.find((v: Row) => v.version_no === p.active_version)?.config;
  if (!c) validation("product_id", "Product has no active version.");
  const amount = decimal(b, "requested_amount");
  if (cmp(amount, c.min_principal) < 0 || cmp(amount, c.max_principal) > 0) throw new Problem(422, "AMOUNT_OUT_OF_RANGE", `Amount must be between ${c.min_principal} and ${c.max_principal} ${p.currency}.`, "Amount out of range", [{ field: "requested_amount", code: "AMOUNT_OUT_OF_RANGE", message: "Outside product limits." }]);
  const term = Number(b.term); if (term < c.min_term || term > c.max_term) validation("term", `Term must be between ${c.min_term} and ${c.max_term}.`);
  const docs = String(c.required_documents).split(",").map((s) => s.trim());
  const row = { id: uid("app"), reference: null, borrower_id: borrower.id, borrower_name: borrower.name_en, borrower_name_km: borrower.name_km, branch_id: borrower.branch_id, branch_name: borrower.branch_name, product_id: p.id, product_code: p.code, product_name: p.name_en, product_version: p.active_version, requested_amount: amount, currency: p.currency, term, frequency: c.repayment_frequency, purpose: b.purpose, status: "DRAFT", created_by: ctx.user.id, created_by_name: ctx.user.name, submitted_at: null, created_at: nowIso(), income: b.income ?? {}, expenses: b.expenses ?? {}, liabilities: b.liabilities ?? [], proposed_collateral: b.proposed_collateral ?? [], proposed_guarantor: b.proposed_guarantor ?? null, documents: docs.map((name) => ({ name, required: true, provided: (b.uploaded_documents ?? []).includes(name), waived: false, file_name: (b.uploaded_documents ?? []).includes(name) ? `${name.toLowerCase().replace(/ /g, "-")}.pdf` : null })), status_history: [{ status: "DRAFT", previous_status: null, actor: ctx.user.name, at: nowIso(), reason: "" }], versions: [], comments: [], assessment: null, decisions: [], approval_level: 1, required_levels: cmp(amount, "5000.00") > 0 ? 2 : 1, conditions: [], policy_exceptions: [] };
  table("applications").unshift(row); audit(ctx, "APPLICATION_CREATED", "Applications", row.id, "", "DRAFT"); return ok(row, 201);
});
const appCmd = (action: string, handler: (ctx: Ctx, app: Row, body: Row) => unknown) => post(`/applications/:id/${action}`, (ctx, req, id) => { const app = rowOr404(ctx, "applications", id); return ok(handler(ctx, app, req.body) ?? app); });
appCmd("submit", (ctx, app) => { need(ctx, "application.create"); assertState(app.status, ["DRAFT"]); app.reference ??= `APP-${today().slice(0, 4)}-${pad(nextSeq("app", 400))}`; app.submitted_at = nowIso(); app.versions.push({ version_no: app.versions.length + 1, requested_amount: app.requested_amount, term: app.term, submitted_at: nowIso(), submitted_by: ctx.user.name }); appTransition(app, "SUBMITTED", ctx); notify("Loan Applications", "New application submitted", `${app.reference} from ${app.borrower_name}.`, `/applications/${app.id}`, app.branch_id); });
appCmd("start-review", (ctx, app) => { need(ctx, "application.review"); assertState(app.status, ["SUBMITTED"]); appTransition(app, "UNDER_REVIEW", ctx); });
appCmd("request-documents", (ctx, app, b) => { need(ctx, "application.review", "credit.approve"); assertState(app.status, ["UNDER_REVIEW", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL"]); appTransition(app, "PENDING_DOCUMENTS", ctx, requireReason(b)); });
appCmd("documents-provided", (ctx, app) => { need(ctx, "application.create", "application.review"); assertState(app.status, ["PENDING_DOCUMENTS"]); appTransition(app, "UNDER_REVIEW", ctx); });
appCmd("mark-document", (ctx, app, b) => { need(ctx, "application.create", "application.review"); const d = app.documents.find((x: Row) => x.name === b.name); if (!d) validation("name", "Unknown document."); d.provided = true; d.file_name = b.file_name; audit(ctx, "APPLICATION_DOCUMENT_ADDED", "Applications", app.reference ?? app.id, "", b.name); });
appCmd("complete-review", (ctx, app) => { need(ctx, "application.review"); assertState(app.status, ["UNDER_REVIEW"]); if (app.documents.some((d: Row) => d.required && !d.provided && !d.waived)) throw new Problem(422, "MISSING_REQUIRED_DOCUMENTS", "Required documents are missing; the application cannot move to credit assessment.", "Missing required documents"); appTransition(app, "PENDING_CREDIT_ASSESSMENT", ctx); });
appCmd("withdraw", (ctx, app, b) => { need(ctx, "application.create"); assertState(app.status, ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL"]); appTransition(app, "WITHDRAWN", ctx, requireReason(b)); });
appCmd("resubmit", (ctx, app, b) => { need(ctx, "application.create"); assertState(app.status, ["REJECTED"]); if (b.requested_amount) app.requested_amount = decimal(b, "requested_amount"); appTransition(app, "DRAFT", ctx, "New version after rejection"); });
appCmd("comment", (ctx, app, b) => { app.comments.push({ stage: app.status, author: ctx.user.name, at: nowIso(), text: requireReason(b, "text") }); });
appCmd("assessment", (ctx, app, b) => {
  need(ctx, "credit.assess"); assertState(app.status, ["PENDING_CREDIT_ASSESSMENT"]); sod(ctx, app.created_by, "assess");
  const schedule = buildSchedule(termsFromApp(app, app.requested_amount, app.term, today()));
  const income = decimal(b, "verified_income"), expenses = String(b.verified_expenses || "0.00"), existing = String(b.existing_installments || "0.00"), proposed = schedule.regular_installment;
  app.assessment = { version: (app.assessment?.version ?? 0) + 1, analyst_id: ctx.user.id, analyst_name: ctx.user.name, at: nowIso(), verified_income: income, verified_expenses: expenses, existing_installments: existing, proposed_installment: proposed, dsr_percent: percent(add(existing, proposed), income), net_disposable_income: sub(sub(income, expenses), existing), risk_grade: b.risk_grade, recommendation: b.recommendation, rationale: requireReason(b, "rationale"), checklist: b.checklist ?? [] };
  appTransition(app, "PENDING_APPROVAL", ctx, `Recommendation: ${b.recommendation}`); audit(ctx, "ASSESSMENT_RECORDED", "Credit", app.reference, "", b.recommendation);
  notify("Pending Approvals", "Application awaiting decision", `${app.reference} is ready for a credit decision.`, `/approvals/${app.id}`, app.branch_id, "HIGH");
});
appCmd("approve", (ctx, app, b) => {
  need(ctx, "credit.approve"); assertState(app.status, ["PENDING_APPROVAL"]); sod(ctx, app.created_by, "approve"); sod(ctx, app.assessment?.analyst_id, "approve");
  if (app.decisions.some((d: Row) => d.actor_id === ctx.user.id)) throw new Problem(403, "SOD_VIOLATION", "You have already decided at a previous level of this application.", "Separation of duties violation");
  if (app.policy_exceptions.some((e: Row) => !e.approved) && !ctx.perms.includes("credit.exception")) throw new Problem(403, "POLICY_EXCEPTION_UNAPPROVED", "A policy exception must be approved by the exception authority first.");
  const amount = b.approved_amount ? decimal(b, "approved_amount") : app.requested_amount;
  const limit = limitFor(ctx, app.currency);
  const reason = String(b.reason ?? "Approved");
  const decision = { level: app.approval_level, decision: "APPROVE", actor_id: ctx.user.id, actor: ctx.user.name, at: nowIso(), reason, amount, conditions: b.conditions ?? "" };
  app.decisions.push(decision); app.policy_exceptions.forEach((e: Row) => { e.approved = true; e.approver = ctx.user.name; });
  if (b.conditions) app.conditions.push({ text: b.conditions, stage: "Before disbursement", fulfilled: false });
  if (cmp(amount, limit) > 0 || app.approval_level < app.required_levels) {
    app.approval_level += 1; audit(ctx, "APPROVAL_ESCALATED", "Credit", app.reference, `Level ${app.approval_level - 1}`, `Level ${app.approval_level}`, cmp(amount, limit) > 0 ? "Amount above approver limit" : "Next level required");
    return { ...app, escalated: true, message: `Level ${app.approval_level - 1} approval recorded. The application moves to level ${app.approval_level}.` };
  }
  appTransition(app, "APPROVED", ctx, reason); const loan = createLoan(app, amount, Number(b.approved_term) || app.term, ctx);
  return { ...app, loan_id: loan.id, message: `Approved. Loan ${loan.account_no} created in Pending Acceptance.` };
});
appCmd("reject", (ctx, app, b) => { need(ctx, "credit.approve"); assertState(app.status, ["PENDING_APPROVAL"]); sod(ctx, app.created_by, "reject"); sod(ctx, app.assessment?.analyst_id, "reject"); const reason = requireReason(b); app.decisions.push({ level: app.approval_level, decision: "REJECT", actor_id: ctx.user.id, actor: ctx.user.name, at: nowIso(), reason, amount: app.requested_amount }); appTransition(app, "REJECTED", ctx, reason); });
appCmd("request-info", (ctx, app, b) => { need(ctx, "credit.approve"); assertState(app.status, ["PENDING_APPROVAL"]); const reason = requireReason(b); app.decisions.push({ level: app.approval_level, decision: "REQUEST_INFO", actor_id: ctx.user.id, actor: ctx.user.name, at: nowIso(), reason, amount: app.requested_amount }); app.comments.push({ stage: "Approval", author: ctx.user.name, at: nowIso(), text: `Additional information requested: ${reason}` }); appTransition(app, "PENDING_CREDIT_ASSESSMENT", ctx, reason); });
appCmd("escalate", (ctx, app, b) => { need(ctx, "credit.approve"); assertState(app.status, ["PENDING_APPROVAL"]); const reason = requireReason(b); app.decisions.push({ level: app.approval_level, decision: "ESCALATE", actor_id: ctx.user.id, actor: ctx.user.name, at: nowIso(), reason, amount: app.requested_amount }); app.approval_level += 1; app.required_levels = Math.max(app.required_levels, app.approval_level); audit(ctx, "APPROVAL_ESCALATED", "Credit", app.reference, `Level ${app.approval_level - 1}`, `Level ${app.approval_level}`, reason); });

// Agreements
on("GET", "/agreements/:id", (ctx, _r, id) => { need(ctx, "agreement.view"); const a = rowOr404(ctx, "agreements", id); const loan = find("loans", a.loan_id)!; return ok({ ...a, loan: summary(loan), schedule: activeSchedule(loan), borrower: maskId(find("borrowers", loan.borrower_id)!), collateral: table("collateral").filter((c) => c.loan_id === loan.id), guarantors: table("guarantors").filter((g) => g.loan_id === loan.id), company: table("company")[0], terms: loan.terms }); });
on("POST", "/agreements", (ctx, req) => {
  need(ctx, "agreement.execute"); const loan = loanOr404(ctx, req.body.loan_id); assertState(loan.status, ["PENDING_ACCEPTANCE"]);
  const existing = table("agreements").filter((a) => a.loan_id === loan.id);
  if (existing.some((a) => a.status === "EXECUTED")) throw new Problem(409, "EXECUTED_AGREEMENT_EXISTS", "An executed agreement already exists and cannot be replaced.");
  existing.forEach((a) => { a.status = "SUPERSEDED"; });
  const row = { id: uid("agr"), agreement_no: `AGR-${today().slice(0, 4)}-${pad(nextSeq("agr", 200))}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, currency: loan.currency, principal: loan.contractual_principal, language: req.body.language || "BILINGUAL", status: "GENERATED", version: existing.length + 1, template_version: "LA-2026.1", generated_at: nowIso(), generated_by: ctx.user.name, signed_at: null, signing_method: null, sha256: null, history: [{ version: existing.length + 1, action: "Generated", at: nowIso(), by: ctx.user.name }] };
  table("agreements").unshift(row); audit(ctx, "AGREEMENT_GENERATED", "Agreements", row.agreement_no, "", `v${row.version}`); return ok(row, 201);
});
post("/agreements/:id/execute", (ctx, req, id) => {
  need(ctx, "agreement.execute"); const a = rowOr404(ctx, "agreements", id); if (a.status === "EXECUTED") throw new Problem(409, "EXECUTED_DOCUMENT_IMMUTABLE", "The executed agreement cannot be replaced."); assertState(a.status, ["GENERATED"]);
  const fileName = requireReason(req.body, "file_name"); a.status = "EXECUTED"; a.signed_at = req.body.signed_at || today(); a.signing_method = req.body.signing_method || "Wet-ink signature (scanned)"; a.sha256 = createHash("sha256").update(`${a.agreement_no}:${fileName}`).digest("hex"); a.history.push({ version: a.version, action: `Executed copy uploaded: ${fileName}`, at: nowIso(), by: ctx.user.name });
  const loan = find("loans", a.loan_id)!; loan.status = "ACCEPTED"; audit(ctx, "AGREEMENT_EXECUTED", "Agreements", a.agreement_no, "GENERATED", "EXECUTED", "", true); return ok(a);
});
post("/agreements/:id/decline", (ctx, req, id) => { need(ctx, "agreement.execute"); const a = rowOr404(ctx, "agreements", id); assertState(a.status, ["GENERATED"]); const reason = requireReason(req.body); a.status = "DECLINED"; a.history.push({ version: a.version, action: `Declined: ${reason}`, at: nowIso(), by: ctx.user.name }); const loan = find("loans", a.loan_id)!; loan.status = "CANCELLED"; audit(ctx, "LOAN_CANCELLED", "Loans", loan.account_no, "PENDING_ACCEPTANCE", "CANCELLED", reason, true); return ok(a); });

// Collateral
on("GET", "/collateral/:id", (ctx, _r, id) => { need(ctx, "collateral.view"); const c = rowOr404(ctx, "collateral", id); const loan = c.loan_id ? find("loans", c.loan_id) : undefined; const outstanding = loan ? balances(loan).total_outstanding : "0.00"; return ok({ ...c, loan_status: loan?.status, loan_outstanding: outstanding, coverage_percent: loan && isPositive(outstanding) ? percent(c.accepted_value, outstanding) : null }); });
on("POST", "/collateral", (ctx, req) => {
  need(ctx, "collateral.manage"); const b = req.body; const borrower = rowOr404(ctx, "borrowers", b.borrower_id);
  if (table("collateral").some((c) => c.collateral_type === b.collateral_type && c.identifier === b.identifier && c.status !== "RELEASED")) throw new Problem(409, "DUPLICATE_COLLATERAL", `Identifier ${b.identifier} is already registered and pledged for this collateral type.`);
  if (b.valuation_date > today()) validation("valuation_date", "Valuation date cannot be in the future.");
  const loan = b.loan_id ? loanOr404(ctx, b.loan_id) : undefined;
  const row = { id: uid("col"), reference: `COL-${pad(nextSeq("col", 100))}`, borrower_id: borrower.id, borrower_name: borrower.name_en, loan_id: loan?.id ?? null, loan_account_no: loan?.account_no ?? null, branch_id: borrower.branch_id, branch_name: borrower.branch_name, collateral_type: b.collateral_type, description: b.description, identifier: b.identifier, currency: b.currency ?? "USD", estimated_value: decimal(b, "estimated_value"), accepted_value: decimal(b, "accepted_value"), pledged_value: b.accepted_value, valuation_date: b.valuation_date, ownership: b.ownership, custody_status: b.custody_status ?? "Pending intake", location: b.location ?? "", status: "UNDER_VERIFICATION", needs_revaluation: false, valuations: [{ id: uid("val"), date: b.valuation_date, method: b.method ?? "Market comparison", valuer: ctx.user.name, value: decimal(b, "accepted_value"), currency: b.currency ?? "USD" }], movements: [], documents: b.documents ?? [], release: null, created_at: nowIso() };
  table("collateral").unshift(row); audit(ctx, "COLLATERAL_REGISTERED", "Collateral", row.reference, "", "UNDER_VERIFICATION"); return ok(row, 201);
});
post("/collateral/:id/verify", (ctx, req, id) => { need(ctx, "collateral.manage"); const c = rowOr404(ctx, "collateral", id); assertState(c.status, ["REGISTERED", "UNDER_VERIFICATION"]); c.status = c.loan_id ? "PLEDGED" : "ACCEPTED"; audit(ctx, "COLLATERAL_VERIFIED", "Collateral", c.reference, "UNDER_VERIFICATION", c.status, req.body.reason ?? ""); return ok(c); });
post("/collateral/:id/valuations", (ctx, req, id) => { need(ctx, "collateral.manage"); const c = rowOr404(ctx, "collateral", id); if (req.body.date > today()) validation("date", "Valuation date cannot be in the future."); const value = decimal(req.body, "value"); c.valuations.unshift({ id: uid("val"), date: req.body.date, method: req.body.method, valuer: req.body.valuer || ctx.user.name, value, currency: c.currency }); c.accepted_value = value; c.valuation_date = req.body.date; c.needs_revaluation = false; audit(ctx, "COLLATERAL_REVALUED", "Collateral", c.reference, "", value); return ok(c); });
post("/collateral/:id/movements", (ctx, req, id) => { need(ctx, "collateral.manage"); const c = rowOr404(ctx, "collateral", id); c.movements.unshift({ id: uid("mov"), date: req.body.date || today(), movement: req.body.movement, location: req.body.location, person: ctx.user.name }); c.location = req.body.location; c.custody_status = req.body.movement === "OUT" ? "Out of custody" : "In vault"; audit(ctx, "COLLATERAL_MOVED", "Collateral", c.reference, "", req.body.movement); return ok(c); });
post("/collateral/:id/release", (ctx, req, id) => {
  need(ctx, "collateral.manage", "collateral.release_approve"); const c = rowOr404(ctx, "collateral", id); if (c.status === "RELEASED") invalidRelease();
  const loan = c.loan_id ? find("loans", c.loan_id) : undefined; const openLoan = loan && ["ACTIVE", "WRITTEN_OFF"].includes(loan.status);
  if (openLoan && !req.body.exception) throw new Problem(409, "OBLIGATIONS_OUTSTANDING", `Loan ${loan.account_no} still has outstanding obligations. Release requires an authorised exception.`);
  if (openLoan && req.body.exception) { need(ctx, "collateral.release_approve"); requireReason(req.body); }
  c.status = "RELEASED"; c.custody_status = "Returned to owner"; c.release = { at: nowIso(), by: ctx.user.name, receipt: `REL-${pad(nextSeq("rel", 20))}`, exception: Boolean(req.body.exception), reason: req.body.reason ?? "" }; audit(ctx, "COLLATERAL_RELEASED", "Collateral", c.reference, "PLEDGED", "RELEASED", req.body.reason ?? ""); return ok(c);
});
function invalidRelease(): never { throw new Problem(409, "INVALID_STATE", "Collateral has already been released."); }
on("POST", "/guarantors", (ctx, req) => { need(ctx, "collateral.manage", "collateral.link"); const b = req.body; const loan = loanOr404(ctx, b.loan_id); const row = { id: uid("gua"), name: b.name, name_km: b.name_km ?? "", relationship: b.relationship, phone: b.phone, id_masked: `••••${String(b.id_number ?? "").slice(-4)}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, guarantee_amount: decimal(b, "guarantee_amount"), currency: loan.currency, status: "ACTIVE", created_at: nowIso() }; table("guarantors").unshift(row); audit(ctx, "GUARANTOR_REGISTERED", "Collateral", row.name, "", loan.account_no); return ok(row, 201); });
post("/guarantors/:id/release", (ctx, req, id) => { need(ctx, "collateral.release_approve", "collateral.manage"); const g = rowOr404(ctx, "guarantors", id); const loan = find("loans", g.loan_id); if (loan && loan.status === "ACTIVE" && !req.body.reason) throw new Problem(409, "OBLIGATIONS_OUTSTANDING", "The loan is still active. An approved amendment reason is required."); g.status = "RELEASED"; audit(ctx, "GUARANTEE_RELEASED", "Collateral", g.name, "ACTIVE", "RELEASED", req.body.reason ?? ""); return ok(g); });

// Disbursements
on("GET", "/disbursements/:id", (ctx, _r, id) => { need(ctx, "disbursement.view"); const d = rowOr404(ctx, "disbursements", id); const loan = find("loans", d.loan_id)!; return ok({ ...d, loan: summary(loan), checks: disbursementChecks(loan) }); });
function disbursementChecks(loan: Row) {
  const agreement = table("agreements").some((a) => a.loan_id === loan.id && a.status === "EXECUTED");
  const product = find("products", loan.product_id)!; const secured = product.versions[0].config.collateral_required;
  const collateral = table("collateral").some((c) => c.loan_id === loan.id && c.status === "PLEDGED");
  return [{ label: "Executed agreement on file", passed: agreement }, { label: "Pre-disbursement conditions fulfilled", passed: true }, { label: "Required collateral pledged", passed: !secured || collateral }, { label: "Within remaining commitment", passed: isPositive(sub(loan.contractual_principal, loan.disbursed_principal)) }];
}
on("GET", "/loans/:id/disbursement-preview", (ctx, _r, id) => { need(ctx, "disbursement.view"); const loan = loanOr404(ctx, id); const product = find("products", loan.product_id)!; const c = product.versions[0].config; const fee = fromCents(roundHalfUp(rdiv(rmul(ratFrom(loan.contractual_principal), ratFrom(c.processing_fee_percent)), rat(100n)), loan.currency === "KHR" ? 100n : 1n)); return ok({ loan: summary(loan), approved_principal: loan.contractual_principal, remaining_commitment: sub(loan.contractual_principal, loan.disbursed_principal), fees_deducted: fee, net_disbursement: sub(loan.contractual_principal, fee), fee_basis: `Processing fee ${c.processing_fee_percent} %`, checks: disbursementChecks(loan) }); });
post("/loans/:id/disbursements", (ctx, req, id) => {
  need(ctx, "disbursement.request"); const loan = loanOr404(ctx, id); assertState(loan.status, ["ACCEPTED", "PENDING_DISBURSEMENT"]);
  const remaining = sub(loan.contractual_principal, loan.disbursed_principal); const amount = req.body.amount ? decimal(req.body, "amount") : remaining;
  if (cmp(amount, remaining) > 0) throw new Problem(422, "EXCEEDS_COMMITMENT", `Amount exceeds the remaining commitment of ${remaining} ${loan.currency}.`, "Exceeds commitment");
  const failed = disbursementChecks(loan).filter((c) => !c.passed); if (failed.length) throw new Problem(409, "DISBURSEMENT_CONDITIONS_UNMET", `Unmet conditions: ${failed.map((f) => f.label).join("; ")}.`);
  if (table("disbursements").some((d) => d.loan_id === id && ["REQUESTED", "AUTHORISED"].includes(d.status))) throw new Problem(409, "DUPLICATE_DISBURSEMENT", "An open disbursement request already exists for this loan.");
  const product = find("products", loan.product_id)!; const fee = fromCents(roundHalfUp(rdiv(rmul(ratFrom(amount), ratFrom(product.versions[0].config.processing_fee_percent)), rat(100n)), loan.currency === "KHR" ? 100n : 1n));
  const row = { id: uid("dis"), disbursement_no: `${loan.branch_code}-D-${today().slice(0, 4)}-${pad(nextSeq(`disb:${loan.branch_code}`, 100))}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, product_id: loan.product_id, currency: loan.currency, approved_principal: loan.contractual_principal, amount, fees_deducted: fee, net_disbursement: sub(amount, fee), method: req.body.method, cash_bank_account: req.body.cash_bank_account, disbursement_date: req.body.disbursement_date || today(), reference_number: null, status: "REQUESTED", requested_by: ctx.user.id, requested_by_name: ctx.user.name, authorised_by: null, authorised_by_name: null, confirmed_by: null, confirmed_by_name: null, created_at: nowIso() };
  loan.status = "PENDING_DISBURSEMENT"; table("disbursements").unshift(row); audit(ctx, "DISBURSEMENT_REQUESTED", "Disbursements", row.disbursement_no, "", "REQUESTED", "", true); notify("Disbursements", "Disbursement awaiting authorisation", `${row.disbursement_no} for ${row.borrower_name}.`, `/disbursements/${row.id}/approve`, row.branch_id); return ok(row, 201);
});
post("/disbursements/:id/authorise", (ctx, req, id) => { need(ctx, "disbursement.authorise"); const d = rowOr404(ctx, "disbursements", id); assertState(d.status, ["REQUESTED"]); sod(ctx, d.requested_by, "authorise"); if (cmp(d.amount, limitFor(ctx, d.currency)) > 0) throw new Problem(403, "APPROVAL_LIMIT_EXCEEDED", `Amount exceeds your limit of ${limitFor(ctx, d.currency)} ${d.currency}.`, "Approval limit exceeded"); d.status = "AUTHORISED"; d.authorised_by = ctx.user.id; d.authorised_by_name = ctx.user.name; audit(ctx, "DISBURSEMENT_AUTHORISED", "Disbursements", d.disbursement_no, "REQUESTED", "AUTHORISED", req.body.comment ?? "", true); return ok(d); });
post("/disbursements/:id/reject", (ctx, req, id) => { need(ctx, "disbursement.authorise"); const d = rowOr404(ctx, "disbursements", id); assertState(d.status, ["REQUESTED"]); sod(ctx, d.requested_by, "reject"); const reason = requireReason(req.body); d.status = "REJECTED"; d.rejection_reason = reason; find("loans", d.loan_id)!.status = "ACCEPTED"; audit(ctx, "DISBURSEMENT_REJECTED", "Disbursements", d.disbursement_no, "REQUESTED", "REJECTED", reason, true); return ok(d); });
post("/disbursements/:id/confirm", (ctx, req, id) => {
  const d = rowOr404(ctx, "disbursements", id); need(ctx, d.method === "CASH" ? "disbursement.confirm_cash" : "disbursement.confirm_bank"); assertState(d.status, ["AUTHORISED"]); sod(ctx, d.requested_by, "confirm");
  if (d.method === "CASH" && !table("cashier_sessions").some((s) => s.cashier_id === ctx.user.id && s.status === "OPEN")) throw new Problem(409, "CASHIER_SESSION_REQUIRED", "Open a cashier session before paying cash.");
  if (d.method !== "CASH" && !req.body.reference_number) validation("reference_number", "Bank transfer reference is required.");
  const loan = find("loans", d.loan_id)!; d.status = "CONFIRMED"; d.confirmed_by = ctx.user.id; d.confirmed_by_name = ctx.user.name; d.reference_number = req.body.reference_number || d.disbursement_no; d.disbursement_date = today();
  loan.disbursed_principal = add(loan.disbursed_principal, d.amount); loan.disbursed_on = today(); loan.status = "ACTIVE"; loan.terms = { ...loan.terms, disbursement_date: today(), first_due_date: undefined };
  const schedule = buildSchedule(loan.terms); loan.maturity_date = schedule.maturity_date; loan.schedule_versions = [{ version_no: 1, status: "ACTIVE", reason: "DISBURSEMENT_DATE", effective_from: today(), engine_version: schedule.engine_version, total_principal: schedule.total_principal, total_interest: schedule.total_interest, installments: asInstallments(schedule.installments) }]; loan.terms_versions[0].status = "EXECUTED"; loan.terms_versions[0].effective_from = today();
  postTxn(loan, "DISBURSEMENT", "PRINCIPAL", d.amount, today(), d.disbursement_no, ctx); if (isPositive(d.fees_deducted)) postTxn(loan, "FEE_DEDUCTED", "FEE", d.fees_deducted, today(), d.disbursement_no, ctx);
  postJournal({ description: `Disbursement ${d.disbursement_no} — ${loan.account_no}`, date: today(), source_type: "DISBURSEMENT", source_id: d.id, source_event: "DISBURSEMENT", currency: loan.currency, branch_id: loan.branch_id, loan_id: loan.id, lines: [{ code: "1100", debit: d.amount }, { code: cashAccount(d.method), credit: d.net_disbursement }, { code: "4100", credit: d.fees_deducted }] }, ctx);
  audit(ctx, "DISBURSEMENT_CONFIRMED", "Disbursements", d.disbursement_no, "AUTHORISED", "CONFIRMED", "", true); return ok({ ...d, simulated: true });
});
post("/disbursements/:id/fail", (ctx, req, id) => { const d = rowOr404(ctx, "disbursements", id); need(ctx, "disbursement.confirm_bank", "disbursement.confirm_cash"); assertState(d.status, ["AUTHORISED"]); const reason = requireReason(req.body); d.status = "FAILED"; d.rejection_reason = reason; audit(ctx, "DISBURSEMENT_FAILED", "Disbursements", d.disbursement_no, "AUTHORISED", "FAILED", reason, true); notify("Disbursements", "Disbursement failed", `${d.disbursement_no}: ${reason}`, `/disbursements/${d.id}`, d.branch_id, "HIGH"); return ok(d); });

// Repayments
on("GET", "/repayments/dashboard", (ctx) => {
  need(ctx, "repayment.view"); const d = today(); const rows = scoped(ctx, table("repayments")); const todays = rows.filter((r) => r.value_date === d && r.status === "COMPLETED");
  const byCurrency = (cur: string) => { const list = todays.filter((r) => r.currency === cur); const by = (m: string) => list.filter((r) => r.method === m).reduce((s, r) => add(s, r.amount), "0.00"); return { currency: cur, count: list.length, total: list.reduce((s, r) => add(s, r.amount), "0.00"), cash: by("CASH"), bank_transfer: by("BANK_TRANSFER") }; };
  const session = table("cashier_sessions").find((s) => s.cashier_id === ctx.user.id && s.status === "OPEN") ?? null;
  const due = scoped(ctx, table("loans")).filter((l) => l.status === "ACTIVE").map(summary).filter((l) => l.next_payment_date && l.next_payment_date <= addDays(d, 7)).sort((a, b) => a.next_payment_date.localeCompare(b.next_payment_date)).slice(0, 8);
  return ok({ as_of: d, summary: [byCurrency("USD"), byCurrency("KHR")], session, pending_reversals: scoped(ctx, table("reversal_requests")).filter((r) => r.status === "PENDING").length, due_soon: due, recent: rows.slice(-8).reverse() });
});
on("GET", "/repayments/:id", (ctx, _r, id) => { need(ctx, "repayment.view"); const r = rowOr404(ctx, "repayments", id); const loan = find("loans", r.loan_id)!; return ok({ ...r, loan: summary(loan), company: table("company")[0], borrower: maskId(find("borrowers", r.borrower_id)!), branch: find("branches", r.branch_id), reversal_request: table("reversal_requests").find((x) => x.repayment_id === id) ?? null }); });
post("/repayments/:id/print", (ctx, _r, id) => { need(ctx, "repayment.view"); const r = rowOr404(ctx, "repayments", id); r.print_count += 1; audit(ctx, "RECEIPT_PRINTED", "Repayments", r.receipt_no, "", r.print_count > 1 ? "COPY" : "ORIGINAL"); return ok(r); });
const repaymentGuards = (ctx: Ctx, loan: Row, body: Row) => {
  assertState(loan.status, ["ACTIVE", "WRITTEN_OFF"]); const amount = decimal(body, "amount"); const value = body.value_date || today();
  if (value > today()) validation("value_date", "Payment date cannot be in the future.");
  return { amount, value };
};
on("POST", "/loans/:id/repayments/preview", (ctx, req, id) => {
  need(ctx, "repayment.create", "repayment.view"); const loan = loanOr404(ctx, id); const { amount, value } = repaymentGuards(ctx, loan, req.body);
  const copy = structuredClone(activeSchedule(loan).installments) as Installment[]; const r = allocate(copy, amount, value, false);
  const totals: Row = { PENALTY: "0.00", FEE: "0.00", INTEREST: "0.00", PRINCIPAL: "0.00" }; r.allocations.forEach((a) => { totals[a.component] = add(totals[a.component], a.amount); });
  return ok({ amount, currency: loan.currency, allocations: r.allocations, unapplied_amount: r.unapplied, totals, simulated: true, waterfall: "Penalties → Fees → Interest → Principal (oldest first)" });
});
post("/loans/:id/repayments", (ctx, req, id) => {
  need(ctx, "repayment.create"); const loan = loanOr404(ctx, id); const { amount, value } = repaymentGuards(ctx, loan, req.body); const method = req.body.method;
  const session = table("cashier_sessions").find((s) => s.cashier_id === ctx.user.id && s.status === "OPEN");
  if (method === "CASH" && ctx.roles.includes("CASHIER") && !session) throw new Problem(409, "CASHIER_SESSION_REQUIRED", "Open a cashier session before accepting cash.");
  const daysBack = Math.round((Date.parse(today()) - Date.parse(value)) / 86_400_000);
  if (daysBack > 3 && !ctx.roles.includes("BRMGR")) throw new Problem(403, "BACKDATE_APPROVAL_REQUIRED", "Payments dated more than 3 days back require Branch Manager approval.", "Backdating approval required");
  const ref = req.body.external_reference; if (ref && table("repayments").some((r) => r.external_reference === ref && r.status !== "REVERSED" && r.channel === (req.body.channel ?? "BRANCH"))) throw new Problem(409, "DUPLICATE_REFERENCE", `Reference ${ref} has already been recorded for this channel.`, "Duplicate reference");
  const r = applyRepayment(loan, { amount, value_date: value, method, external_reference: ref ?? null, comment: req.body.comment, session_id: session?.id ?? null }, ctx); table("repayments").unshift(r);
  if (daysBack > 0) table("control_exceptions").unshift({ id: uid("ce"), type: "Backdated payment", reference: r.receipt_no, user: ctx.user.name, at: nowIso(), detail: `Value date ${daysBack} day(s) before entry.`, severity: daysBack > 3 ? "HIGH" : "LOW", status: "OPEN", branch_id: loan.branch_id });
  (table("promises").filter((p) => p.loan_id === loan.id && p.status === "OPEN")).forEach((p) => { if (cmp(amount, p.promised_amount) >= 0) p.status = "KEPT"; });
  audit(ctx, "REPAYMENT_RECORDED", "Repayments", r.receipt_no, "", `${r.currency} ${r.amount}`, "", true); return ok({ ...r, balances: balances(loan), simulated: true }, 201);
});
post("/repayments/:id/reversal-requests", (ctx, req, id) => { need(ctx, "repayment.reverse_request"); const r = rowOr404(ctx, "repayments", id); assertState(r.status, ["COMPLETED"]); if (table("reversal_requests").some((x) => x.repayment_id === id && x.status === "PENDING")) throw new Problem(409, "REVERSAL_ALREADY_REQUESTED", "A reversal request is already pending."); const reason = requireReason(req.body); const row = { id: uid("rev"), repayment_id: r.id, receipt_no: r.receipt_no, loan_id: r.loan_id, loan_account_no: r.loan_account_no, borrower_name: r.borrower_name, branch_id: r.branch_id, amount: r.amount, currency: r.currency, reason_code: req.body.reason_code, reason, status: "PENDING", requested_by: ctx.user.id, requested_by_name: ctx.user.name, original_cashier: r.cashier_id, created_at: nowIso() }; table("reversal_requests").unshift(row); audit(ctx, "REVERSAL_REQUESTED", "Repayments", r.receipt_no, "COMPLETED", "PENDING REVERSAL", reason, true); notify("Repayments", "Reversal request pending", `${r.receipt_no}: ${reason}`, `/repayments/reversals/${row.id}`, r.branch_id, "HIGH"); return ok(row, 201); });
on("GET", "/reversal-requests/:id", (ctx, _r, id) => { need(ctx, "repayment.view"); const x = rowOr404(ctx, "reversal_requests", id); return ok({ ...x, repayment: find("repayments", x.repayment_id) }); });
post("/reversal-requests/:id/approve", (ctx, req, id) => { need(ctx, "repayment.reverse_approve"); const x = rowOr404(ctx, "reversal_requests", id); assertState(x.status, ["PENDING"]); sod(ctx, x.requested_by, "approve"); sod(ctx, x.original_cashier, "approve the reversal of"); const r = find("repayments", x.repayment_id)!; const loan = find("loans", x.loan_id)!; reverseRepayment(loan, r, x.reason, ctx); x.status = "APPROVED"; x.approved_by_name = ctx.user.name; x.approved_at = nowIso(); table("control_exceptions").unshift({ id: uid("ce"), type: "Reversal", reference: r.receipt_no, user: ctx.user.name, at: nowIso(), detail: x.reason, severity: "MEDIUM", status: "OPEN", branch_id: loan.branch_id }); audit(ctx, "REVERSAL_APPROVED", "Repayments", r.receipt_no, "COMPLETED", "REVERSED", req.body.comment ?? x.reason, true); return ok({ ...x, simulated: true }); });
post("/reversal-requests/:id/reject", (ctx, req, id) => { need(ctx, "repayment.reverse_approve"); const x = rowOr404(ctx, "reversal_requests", id); assertState(x.status, ["PENDING"]); x.status = "REJECTED"; audit(ctx, "REVERSAL_REJECTED", "Repayments", x.receipt_no, "PENDING", "REJECTED", requireReason(req.body), true); return ok(x); });
post("/loans/:id/refunds", (ctx, req, id) => { need(ctx, "repayment.reverse_request", "repayment.create"); const loan = loanOr404(ctx, id); const amount = decimal(req.body, "amount"); if (cmp(amount, balances(loan).unapplied) > 0) validation("amount", "Refund cannot exceed the unapplied balance."); const row = { id: uid("rfd"), loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, amount, currency: loan.currency, method: req.body.method, status: "PENDING", requested_by: ctx.user.id, requested_by_name: ctx.user.name, reason: requireReason(req.body), created_at: nowIso() }; table("refunds").unshift(row); return ok(row, 201); });
post("/refunds/:id/approve", (ctx, _r, id) => { need(ctx, "repayment.reverse_approve"); const x = rowOr404(ctx, "refunds", id); assertState(x.status, ["PENDING"]); sod(ctx, x.requested_by, "approve"); const loan = find("loans", x.loan_id)!; postTxn(loan, "REFUND", "UNAPPLIED", `-${x.amount}`, today(), x.id, ctx); postJournal({ description: `Refund of unapplied balance ${loan.account_no}`, date: today(), source_type: "REFUND", source_id: x.id, source_event: "REFUND", currency: loan.currency, branch_id: loan.branch_id, loan_id: loan.id, lines: [{ code: "2100", debit: x.amount }, { code: cashAccount(x.method), credit: x.amount }] }, ctx); x.status = "PAID"; audit(ctx, "REFUND_APPROVED", "Repayments", loan.account_no, "PENDING", "PAID", "", true); return ok(x); });
post("/cashier-sessions/open", (ctx, req) => { need(ctx, "repayment.create", "disbursement.confirm_cash"); if (table("cashier_sessions").some((s) => s.cashier_id === ctx.user.id && s.status === "OPEN")) throw new Problem(409, "INVALID_STATE", "You already have an open session."); const branchId = ctx.allBranches ? "br-pp1" : ctx.branches[0]; const row = { id: uid("cs"), cashier_id: ctx.user.id, cashier_name: ctx.user.name, branch_id: branchId, opened_at: nowIso(), status: "OPEN", opening_float_usd: decimal(req.body, "opening_float_usd"), opening_float_khr: decimal(req.body, "opening_float_khr") }; table("cashier_sessions").unshift(row); audit(ctx, "CASHIER_SESSION_OPENED", "Repayments", row.id, "", "OPEN", "", true); return ok(row, 201); });
post("/cashier-sessions/:id/close", (ctx, req, id) => { need(ctx, "repayment.create", "disbursement.confirm_cash"); const s = rowOr404(ctx, "cashier_sessions", id); assertState(s.status, ["OPEN"]); s.status = "PENDING_REVIEW"; s.closing_count_usd = decimal(req.body, "closing_count_usd"); s.closing_count_khr = decimal(req.body, "closing_count_khr"); s.closed_at = nowIso(); audit(ctx, "CASHIER_SESSION_CLOSED", "Repayments", s.id, "OPEN", "PENDING_REVIEW", "", true); return ok(s); });

// Loans
on("GET", "/loans/:id", (ctx, _r, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); const { transactions, schedule_versions, ...rest } = loan; return ok({ ...rest, ...balances(loan), borrower: maskId(find("borrowers", loan.borrower_id)!), schedule_summary: schedule_versions.map((s: Row) => ({ version_no: s.version_no, status: s.status, reason: s.reason, effective_from: s.effective_from, total_interest: s.total_interest })), transaction_count: transactions.length, allowed_actions: allowedActions(loan) }); });
function allowedActions(loan: Row) { const s = loan.status; return { record_repayment: ["ACTIVE", "WRITTEN_OFF"].includes(s), settlement_quote: s === "ACTIVE", reschedule: s === "ACTIVE", close: s === "ACTIVE", request_disbursement: ["ACCEPTED", "PENDING_DISBURSEMENT"].includes(s), generate_agreement: s === "PENDING_ACCEPTANCE" }; }
on("GET", "/loans/:id/schedule", (ctx, req, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); const v = req.query.version ? loan.schedule_versions.find((s: Row) => s.version_no === Number(req.query.version)) : activeSchedule(loan); if (!v) throw new Problem(404, "NOT_FOUND", "Schedule version not found."); return ok({ ...v, currency: loan.currency, loan_account_no: loan.account_no, versions: loan.schedule_versions.map((s: Row) => ({ version_no: s.version_no, status: s.status, reason: s.reason })) }); });
on("POST", "/loans/:id/schedule/regenerate", (ctx, _r, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); if (table("repayments").some((r) => r.loan_id === loan.id)) throw new Problem(409, "SCHEDULE_LOCKED", "Schedules cannot be regenerated after repayments are recorded. Use rescheduling, restructuring or prepayment."); return ok({ regenerated: false }); });
on("GET", "/loans/:id/transactions", (ctx, req, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); return ok(pageOf([...loan.transactions].reverse(), req.query, "value_date")); });
on("GET", "/loans/:id/balances", (ctx, req, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); return ok(balances(loan, req.query.as_of || today())); });
on("GET", "/loans/:id/statement", (ctx, req, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); const from = req.query.date_from || "0000", to = req.query.date_to || "9999"; return ok({ loan: summary(loan), borrower: maskId(find("borrowers", loan.borrower_id)!), company: table("company")[0], from: req.query.date_from ?? loan.disbursed_on, to: req.query.date_to ?? today(), transactions: loan.transactions.filter((t: Row) => t.value_date >= from && t.value_date <= to) }); });
on("GET", "/loans/:id/related", (ctx, _r, id) => { need(ctx, "loan.view"); const loan = loanOr404(ctx, id); return ok({ repayments: table("repayments").filter((r) => r.loan_id === id).reverse(), collateral: table("collateral").filter((c) => c.loan_id === id), guarantors: table("guarantors").filter((g) => g.loan_id === id), activities: table("collection_activities").filter((a) => a.loan_id === id), promises: table("promises").filter((p) => p.loan_id === id), documents: table("agreements").filter((a) => a.loan_id === id), audit: table("audit_logs").filter((a) => a.record_reference === loan.account_no || table("repayments").some((r) => r.loan_id === id && r.receipt_no === a.record_reference)).slice(0, 30) }); });
post("/loans/:id/assign", (ctx, req, id) => { need(ctx, "collection.assign"); const loan = loanOr404(ctx, id); const officer = find("users", req.body.officer_id); if (!officer) validation("officer_id", "Select an officer."); const prev = loan.collection_officer_name; loan.collection_officer_id = officer.id; loan.collection_officer_name = officer.name; audit(ctx, "COLLECTION_ASSIGNED", "Collections", loan.account_no, prev ?? "", officer.name); return ok(summary(loan)); });
post("/loans/:id/close", (ctx, _r, id) => { need(ctx, "closure.process"); const loan = loanOr404(ctx, id); assertState(loan.status, ["ACTIVE"]); const b = balances(loan); const owed = add(b.outstanding_principal, b.interest_due, b.fees_due, b.penalties_due); if (isPositive(owed)) throw new Problem(409, "OUTSTANDING_OBLIGATIONS", `Closure rejected: ${owed} ${loan.currency} remains outstanding across loan components.`); loan.status = "CLOSED_PAID"; loan.closed_on = today(); loan.closure_type = "Paid in full"; audit(ctx, "LOAN_CLOSED", "Loans", loan.account_no, "ACTIVE", "CLOSED_PAID", "", true); return ok(summary(loan)); });
post("/loans/:id/write-off", (ctx, req, id) => { need(ctx, "period.reopen"); const loan = loanOr404(ctx, id); assertState(loan.status, ["ACTIVE"]); const reason = requireReason(req.body); loan.status = "WRITTEN_OFF"; loan.flags.push("Written off"); audit(ctx, "LOAN_WRITTEN_OFF", "Loans", loan.account_no, "ACTIVE", "WRITTEN_OFF", reason, true); return ok(summary(loan)); });

// Collections
on("GET", "/collections/dashboard", (ctx) => {
  need(ctx, "collection.view"); const rows = overdueRows(ctx); const buckets = ["1–30", "31–60", "61–90", "> 90"].map((name) => ({ name, count: rows.filter((r) => r.bucket === name).length, usd: rows.filter((r) => r.bucket === name && r.currency === "USD").reduce((s, r) => add(s, r.amount_overdue), "0.00") })); const promises = scoped(ctx, table("promises"));
  const d = today(); return ok({ as_of: d, buckets, overdue_count: rows.length, overdue_usd: rows.filter((r) => r.currency === "USD").reduce((s, r) => add(s, r.amount_overdue), "0.00"), overdue_khr: rows.filter((r) => r.currency === "KHR").reduce((s, r) => add(s, r.amount_overdue), "0.00"), promises_due: promises.filter((p) => p.promise_date === d && p.status === "OPEN"), broken_promises: promises.filter((p) => p.status === "BROKEN").length, open_promises: promises.filter((p) => p.status === "OPEN").length, follow_ups: rows.filter((r) => r.next_follow_up && r.next_follow_up <= addDays(d, 2)).slice(0, 8), top_cases: [...rows].sort((a, b) => b.days_past_due - a.days_past_due).slice(0, 8) });
});
on("POST", "/collections/activities", (ctx, req) => { need(ctx, "collection.manage"); const b = req.body; const loan = loanOr404(ctx, b.loan_id); const time = b.contact_time || nowIso(); if (!canContact(time)) throw new Problem(422, "CONTACT_NOT_ALLOWED", "Contact is outside the configured allowed hours (illustrative 07:00–20:00; verify under V-08).", "Contact not allowed"); const row = { id: uid("act"), loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, officer_id: ctx.user.id, officer_name: ctx.user.name, channel: b.channel, contact_time: time, person_reached: b.person_reached, outcome: b.outcome, notes: requireReason(b, "notes"), follow_up_date: b.follow_up_date || null }; table("collection_activities").unshift(row); loan.last_contact = time.slice(0, 10); loan.next_follow_up = b.follow_up_date || loan.next_follow_up; audit(ctx, "COLLECTION_CONTACT", "Collections", loan.account_no, "", b.outcome); return ok(row, 201); });
on("POST", "/collections/promises", (ctx, req) => { need(ctx, "collection.manage"); const b = req.body; const loan = loanOr404(ctx, b.loan_id); if (b.promise_date < today()) validation("promise_date", "Promise date must be today or later."); const row = { id: uid("pro"), loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, promised_amount: decimal(b, "promised_amount"), promise_date: b.promise_date, status: "OPEN", officer_name: ctx.user.name, created_at: nowIso() }; table("promises").unshift(row); audit(ctx, "PROMISE_RECORDED", "Collections", loan.account_no, "", row.promised_amount); return ok(row, 201); });
post("/collections/promises/:id/mark", (ctx, req, id) => { need(ctx, "collection.manage"); const p = rowOr404(ctx, "promises", id); assertState(p.status, ["OPEN"]); p.status = req.body.status === "KEPT" ? "KEPT" : "BROKEN"; audit(ctx, `PROMISE_${p.status}`, "Collections", p.loan_account_no, "OPEN", p.status); return ok(p); });

// Modifications (rescheduling and restructuring)
on("GET", "/modifications/:id", (ctx, _r, id) => { need(ctx, "restructure.view"); return ok(rowOr404(ctx, "modifications", id)); });
on("POST", "/modifications", (ctx, req) => {
  need(ctx, "restructure.request"); const b = req.body; const loan = loanOr404(ctx, b.loan_id); assertState(loan.status, ["ACTIVE"]); const reason = requireReason(b); const term = Number(b.term); if (!term || term < 1) validation("term", "Enter the proposed term.");
  const rate = b.kind === "RESCHEDULING" ? loan.annual_rate : String(b.annual_rate || loan.annual_rate); const proposed = buildSchedule({ ...loan.terms, principal: outstandingPrincipal(loan), annual_rate: rate, term, disbursement_date: b.effective_date || today(), first_due_date: undefined });
  const current = activeSchedule(loan);
  const row = { id: uid("mod"), reference: `MOD-${today().slice(0, 4)}-${pad(nextSeq("mod", 50))}`, kind: b.kind, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, currency: loan.currency, reason, status: "REQUESTED", requested_by: ctx.user.id, requested_by_name: ctx.user.name, approved_by: null, effective_date: b.effective_date || today(), overdue_treatment: b.overdue_treatment || "Keep due", created_at: nowIso(), existing: { annual_rate: loan.annual_rate, term: loan.term, frequency: loan.frequency, maturity_date: loan.maturity_date, installment: current.installments[0].total, total_interest: current.total_interest }, proposed: { annual_rate: rate, term, frequency: loan.frequency, maturity_date: proposed.maturity_date, installment: proposed.regular_installment, total_interest: proposed.total_interest }, proposed_installments: proposed.installments, history: [{ status: "REQUESTED", at: nowIso(), by: ctx.user.name, reason }] };
  table("modifications").unshift(row); audit(ctx, "MODIFICATION_REQUESTED", "Restructuring", row.reference, "", "REQUESTED", reason, true); return ok(row, 201);
});
const modStep = (action: string, perm: Permission, from: string[], to: string, reasonRequired = false, maker = false) => post(`/modifications/:id/${action}`, (ctx, req, id) => { need(ctx, perm); const m = rowOr404(ctx, "modifications", id); assertState(m.status, from); if (maker) sod(ctx, m.requested_by, action); const reason = reasonRequired ? requireReason(req.body) : String(req.body.reason ?? ""); m.history.push({ status: to, at: nowIso(), by: ctx.user.name, reason }); audit(ctx, `MODIFICATION_${to}`, "Restructuring", m.reference, m.status, to, reason, true); m.status = to; if (action === "approve") m.approved_by = ctx.user.id; if (action === "execute") executeModification(m, ctx); return ok({ ...m, simulated: true }); });
modStep("assess", "restructure.assess", ["REQUESTED"], "ASSESSED"); modStep("approve", "restructure.approve", ["REQUESTED", "ASSESSED"], "APPROVED", false, true); modStep("reject", "restructure.approve", ["REQUESTED", "ASSESSED"], "REJECTED", true, true); modStep("sign", "restructure.request", ["APPROVED"], "SIGNED"); modStep("execute", "restructure.approve", ["SIGNED"], "EXECUTED", false, true);
function executeModification(m: Row, ctx: Ctx) {
  const loan = find("loans", m.loan_id)!; const old = activeSchedule(loan); old.status = "SUPERSEDED"; const version = loan.schedule_versions.length + 1;
  loan.schedule_versions.push({ version_no: version, status: "ACTIVE", reason: m.kind === "RESCHEDULING" ? "RESCHEDULE" : "RESTRUCTURE", effective_from: m.effective_date, engine_version: "mock-1.0", total_principal: old.total_principal, total_interest: m.proposed.total_interest, installments: asInstallments(m.proposed_installments) });
  loan.terms_versions.forEach((t: Row) => { t.status = "SUPERSEDED"; }); loan.terms_versions.push({ version_no: loan.terms_versions.length + 1, status: "EXECUTED", effective_from: m.effective_date, source: m.kind === "RESCHEDULING" ? "RESCHEDULE" : "RESTRUCTURE", annual_rate: m.proposed.annual_rate, term: m.proposed.term, frequency: m.proposed.frequency, interest_method: loan.terms.interest_method, amortisation: loan.terms.amortisation, day_count: loan.terms.day_count });
  loan.term = m.proposed.term; loan.annual_rate = m.proposed.annual_rate; loan.maturity_date = m.proposed.maturity_date; loan.restructure_count += 1; if (!loan.flags.includes(m.kind === "RESCHEDULING" ? "Rescheduled" : "Restructured")) loan.flags.push(m.kind === "RESCHEDULING" ? "Rescheduled" : "Restructured"); refreshInstallments(loan); void ctx;
}

// Settlement and closure
on("GET", "/settlements/:id", (ctx, _r, id) => { need(ctx, "settlement.view"); return ok(rowOr404(ctx, "settlements", id)); });
on("POST", "/loans/:id/settlement-quotes", (ctx, req, id) => {
  need(ctx, "settlement.quote"); const loan = loanOr404(ctx, id); assertState(loan.status, ["ACTIVE"]); const date = req.body.settlement_date || today(); if (date < today()) validation("settlement_date", "Settlement date must be today or later.");
  const b = balances(loan, today()); const lastDue = (activeSchedule(loan).installments as Installment[]).filter((i) => i.due_date <= date).pop()?.due_date ?? loan.disbursed_on; const interestToDate = accruedInterest(b.outstanding_principal, loan.terms, lastDue, date); const waivers = req.body.waivers ? decimal(req.body, "waivers") : "0.00";
  const total = sub(sub(add(b.outstanding_principal, b.interest_due, interestToDate, b.fees_due, b.penalties_due), waivers), b.unapplied);
  const row = { id: uid("stl"), reference: `STL-${today().slice(0, 4)}-${pad(nextSeq("stl", 60))}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, currency: loan.currency, settlement_date: date, valid_until: addDays(date, 3), outstanding_principal: b.outstanding_principal, due_interest: b.interest_due, interest_to_settlement_date: interestToDate, fees: b.fees_due, penalties: b.penalties_due, early_repayment_fee: "0.00", waivers, unapplied_credit: b.unapplied, total_settlement_amount: total, option: "A — Accrued to date", status: "QUOTED", created_by_name: ctx.user.name, created_at: nowIso(), simulated: true };
  table("settlements").unshift(row); audit(ctx, "SETTLEMENT_QUOTED", "Settlement", row.reference, "", total, "", true); return ok(row, 201);
});
post("/settlements/:id/pay", (ctx, req, id) => {
  need(ctx, "settlement.process"); const s = rowOr404(ctx, "settlements", id); assertState(s.status, ["QUOTED"]); if (s.valid_until < today()) throw new Problem(409, "QUOTE_EXPIRED", "This quotation has expired. Request a new quote."); const loan = find("loans", s.loan_id)!;
  const schedule = activeSchedule(loan);
  for (const ins of schedule.installments as Installment[]) { if (ins.due_date > today()) { ins.interest = "0.00"; ins.total = ins.principal; } }
  const last = (schedule.installments as Installment[]).filter((i) => i.due_date > today())[0]; if (last) last.interest = s.interest_to_settlement_date;
  for (const ins of schedule.installments as Installment[]) if (ins.due_date > today()) { ins.payment_due_date = today(); }
  const r = applyRepayment(loan, { amount: s.total_settlement_amount, value_date: today(), method: req.body.method || "CASH", external_reference: req.body.reference ?? null, comment: `Full settlement ${s.reference}` }, ctx); table("repayments").unshift(r);
  loan.status = "CLOSED_EARLY_SETTLEMENT"; loan.closed_on = today(); loan.closure_type = "Early settlement"; s.status = "SETTLED"; s.receipt_no = r.receipt_no; s.repayment_id = r.id;
  const released = table("collateral").filter((c) => c.loan_id === loan.id && c.status === "PLEDGED"); released.forEach((c) => { c.status = "RELEASE_AUTHORISED"; }); table("guarantors").filter((g) => g.loan_id === loan.id).forEach((g) => { g.status = "RELEASED"; });
  audit(ctx, "LOAN_SETTLED", "Settlement", s.reference, "QUOTED", "SETTLED", "", true); return ok({ ...s, simulated: true, collateral_release_authorised: released.length });
});
post("/settlements/:id/cancel", (ctx, req, id) => { need(ctx, "settlement.process"); const s = rowOr404(ctx, "settlements", id); assertState(s.status, ["QUOTED"]); s.status = "CANCELLED"; audit(ctx, "SETTLEMENT_CANCELLED", "Settlement", s.reference, "QUOTED", "CANCELLED", requireReason(req.body), true); return ok(s); });

// Fees and waivers
on("POST", "/fee-rules", (ctx, req) => { need(ctx, "fee.configure"); const b = req.body; const row = { id: uid("fee"), code: b.code, name: b.name, fee_type: b.fee_type, calculation: b.calculation, value: b.value, currency: b.currency, timing: b.timing, recognition: b.recognition, version: 1, status: "PENDING_APPROVAL", effective_from: b.effective_from || today(), created_by: ctx.user.id }; table("fee_rules").unshift(row); audit(ctx, "FEE_RULE_PROPOSED", "Fees", row.code, "", "PENDING_APPROVAL"); return ok(row, 201); });
on("POST", "/penalty-rules", (ctx, req) => { need(ctx, "fee.configure"); const b = req.body; const row = { id: uid("pen"), code: b.code, name: b.name, base: b.base, daily_rate_percent: b.daily_rate_percent, grace_days: Number(b.grace_days), cap_per_installment: b.cap_per_installment, cap_percent_principal: b.cap_percent_principal, version: 1, status: "PENDING_APPROVAL", effective_from: b.effective_from || today(), created_by: ctx.user.id }; table("penalty_rules").unshift(row); audit(ctx, "PENALTY_RULE_PROPOSED", "Fees", row.code, "", "PENDING_APPROVAL"); return ok(row, 201); });
for (const [path, name] of [["fee-rules", "fee_rules"], ["penalty-rules", "penalty_rules"]] as const) post(`/${path}/:id/approve`, (ctx, _r, id) => { need(ctx, "product.approve", "waiver.approve"); const r = find(name, id)!; assertState(r.status, ["PENDING_APPROVAL", "DRAFT"]); sod(ctx, r.created_by, "approve"); r.status = "ACTIVE"; audit(ctx, "CHARGE_RULE_APPROVED", "Fees", r.code, "PENDING_APPROVAL", "ACTIVE"); return ok(r); });
on("POST", "/waivers", (ctx, req) => { need(ctx, "waiver.request", "waiver.approve"); const b = req.body; const loan = loanOr404(ctx, b.loan_id); const amount = decimal(b, "amount"); const bal = balances(loan); const outstanding = b.component === "PENALTY" ? bal.penalties_due : b.component === "FEE" ? bal.fees_due : bal.interest_due; if (cmp(amount, outstanding) > 0) validation("amount", `Waiver cannot exceed the outstanding charge of ${outstanding}.`); const row = { id: uid("wvr"), reference: `WVR-${pad(nextSeq("wvr", 10), 4)}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, component: b.component, amount, reason: requireReason(b), status: "PENDING", requested_by: ctx.user.id, requested_by_name: ctx.user.name, created_at: nowIso(), history: [] }; table("waivers").unshift(row); audit(ctx, "WAIVER_REQUESTED", "Fees", row.reference, "", amount, row.reason, true); return ok(row, 201); });
post("/waivers/:id/approve", (ctx, req, id) => { need(ctx, "waiver.approve"); const w = rowOr404(ctx, "waivers", id); assertState(w.status, ["PENDING"]); sod(ctx, w.requested_by, "approve"); if (cmp(w.amount, limitFor(ctx, w.currency)) > 0) throw new Problem(403, "APPROVAL_LIMIT_EXCEEDED", "Waiver exceeds your limit.", "Approval limit exceeded"); const loan = find("loans", w.loan_id)!; let rest = w.amount; for (const ins of activeSchedule(loan).installments as Installment[]) { if (!isPositive(rest)) break; const dueKey = w.component === "PENALTY" ? "penalty" : w.component === "FEE" ? "fee" : "interest"; const paidKey = `${dueKey}_paid` as keyof Installment; const open = sub(ins[dueKey] as string, ins[paidKey] as string); if (!isPositive(open)) continue; const take = min(open, rest); (ins as unknown as Row)[paidKey] = add(ins[paidKey] as string, take); rest = sub(rest, take); postTxn(loan, "WAIVER", w.component, `-${take}`, today(), w.reference, ctx, ins.no); } w.status = "APPROVED"; w.approved_by_name = ctx.user.name; refreshInstallments(loan); table("fee_transactions").unshift({ id: uid("ft"), kind: w.component, loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, installment_no: null, amount: w.amount, rule: w.reference, status: "WAIVED", value_date: today() }); audit(ctx, "WAIVER_APPROVED", "Fees", w.reference, "PENDING", "APPROVED", req.body.comment ?? "", true); return ok({ ...w, simulated: true }); });
post("/waivers/:id/reject", (ctx, req, id) => { need(ctx, "waiver.approve"); const w = rowOr404(ctx, "waivers", id); assertState(w.status, ["PENDING"]); w.status = "REJECTED"; audit(ctx, "WAIVER_REJECTED", "Fees", w.reference, "PENDING", "REJECTED", requireReason(req.body), true); return ok(w); });

// Accounting
on("GET", "/accounting/dashboard", (ctx, req) => { need(ctx, "accounting.view"); const currency = req.query.currency || "USD"; const j = table("journals"); const period = table("periods").find((p) => p.status === "OPEN"); const rows = trialBalance(ctx, { currency }); const total = (types: string[], credit = false) => rows.filter((r) => types.includes(r.account_type)).reduce((s, r) => add(s, credit ? (r.closing.startsWith("-") ? r.closing.slice(1) : `-${r.closing}`) : r.closing), "0.00"); return ok({ as_of: today(), currency, assets: total(["ASSET", "CONTRA_ASSET"]), liabilities: total(["LIABILITY"], true), equity: total(["EQUITY"], true), income: total(["REVENUE"], true), expenses: total(["EXPENSE"]), pending_journals: j.filter((x) => x.status === "PENDING_APPROVAL").length, posted_journals: j.filter((x) => x.status === "POSTED").length, open_period: period, reconciliation_differences: table("reconciliations").filter((r) => r.difference !== "0.00").length, recent: j.slice(0, 8) }); });
on("GET", "/accounting/accounts/:id", (ctx, _r, id) => { need(ctx, "accounting.view"); const a = find("accounts", id); if (!a) throw new Problem(404, "NOT_FOUND", "Account not found."); const lines = table("journals").filter((j) => j.status !== "PENDING_APPROVAL").flatMap((j) => j.lines.filter((l: Row) => l.account_id === id).map((l: Row) => ({ ...l, id: `${j.id}-${l.id}`, journal_id: j.id, journal_no: j.journal_no, accounting_date: j.accounting_date, description: j.description, currency: j.currency }))); const by = (cur: string) => { const list = lines.filter((l) => l.currency === cur); return { currency: cur, debit: list.reduce((s, l) => add(s, l.debit), "0.00"), credit: list.reduce((s, l) => add(s, l.credit), "0.00"), balance: sub(list.reduce((s, l) => add(s, l.debit), "0.00"), list.reduce((s, l) => add(s, l.credit), "0.00")) }; }; return ok({ ...a, balances: [by("USD"), by("KHR")], lines: lines.slice(0, 50) }); });
on("GET", "/accounting/journals/:id", (ctx, _r, id) => { need(ctx, "accounting.view"); const j = find("journals", id); if (!j) throw new Problem(404, "NOT_FOUND", "Journal not found."); return ok(j); });
on("POST", "/accounting/journals", (ctx, req) => { need(ctx, "journal.create"); const b = req.body; if (!Array.isArray(b.lines) || b.lines.length < 2) validation("lines", "A journal needs at least two lines."); const period = table("periods").find((p) => b.accounting_date >= p.start_date && b.accounting_date <= p.end_date); if (!period || period.status !== "OPEN") throw new Problem(409, "PERIOD_CLOSED", "The accounting date is not in an open period."); const j = postJournal({ description: requireReason(b, "description"), date: b.accounting_date, source_type: "MANUAL", source_id: uid("mj"), source_event: "MANUAL", currency: b.currency, lines: b.lines.map((l: Row) => ({ code: l.account_code, debit: l.debit || "0.00", credit: l.credit || "0.00" })), status: "PENDING_APPROVAL", manual: true }, ctx); audit(ctx, "JOURNAL_PREPARED", "Accounting", j.journal_no, "", "PENDING_APPROVAL", "", true); return ok(j, 201); });
post("/accounting/journals/:id/approve", (ctx, _r, id) => { need(ctx, "journal.approve"); const j = find("journals", id)!; assertState(j.status, ["PENDING_APPROVAL"]); sod(ctx, j.created_by, "approve"); j.status = "POSTED"; j.approved_by = ctx.user.id; j.approved_by_name = ctx.user.name; audit(ctx, "JOURNAL_APPROVED", "Accounting", j.journal_no, "PENDING_APPROVAL", "POSTED", "", true); return ok({ ...j, simulated: true }); });
post("/accounting/journals/:id/reject", (ctx, req, id) => { need(ctx, "journal.approve"); const j = find("journals", id)!; assertState(j.status, ["PENDING_APPROVAL"]); sod(ctx, j.created_by, "reject"); j.status = "REJECTED"; audit(ctx, "JOURNAL_REJECTED", "Accounting", j.journal_no, "PENDING_APPROVAL", "REJECTED", requireReason(req.body), true); return ok(j); });
post("/accounting/journals/:id/reverse", (ctx, req, id) => { need(ctx, "journal.create"); const j = find("journals", id)!; assertState(j.status, ["POSTED"]); const reason = requireReason(req.body); const rev = postJournal({ description: `Reversal of ${j.journal_no}: ${reason}`, date: today(), source_type: "MANUAL", source_id: j.id, source_event: "REVERSAL", currency: j.currency, branch_id: j.branch_id, loan_id: j.loan_id, lines: j.lines.map((l: Row) => ({ code: l.account_code, debit: l.credit, credit: l.debit })), manual: true }, ctx); rev.reverses_journal_id = j.id; j.status = "REVERSED"; audit(ctx, "JOURNAL_REVERSED", "Accounting", j.journal_no, "POSTED", "REVERSED", reason, true); return ok({ ...rev, simulated: true }); });
on("GET", "/accounting/trial-balance", (ctx, req) => { need(ctx, "accounting.view"); const rows = trialBalance(ctx, req.query); return ok({ currency: req.query.currency || "USD", as_of: req.query.date_to || today(), rows, total_debit: rows.reduce((s, r) => add(s, r.debit), "0.00"), total_credit: rows.reduce((s, r) => add(s, r.credit), "0.00") }); });
on("GET", "/accounting/periods/:id", (ctx, _r, id) => { need(ctx, "accounting.view"); return ok(find("periods", id)); });
post("/accounting/periods/:id/checklist", (ctx, req, id) => { need(ctx, "period.close"); const p = find("periods", id)!; assertState(p.status, ["OPEN"]); const item = p.checklist.find((c: Row) => c.key === req.body.key); item.done = Boolean(req.body.done); return ok(p); });
post("/accounting/periods/:id/close", (ctx, _r, id) => { need(ctx, "period.close"); const p = find("periods", id)!; assertState(p.status, ["OPEN"]); const pending = table("journals").some((j) => j.status === "PENDING_APPROVAL" && j.period_id === id); if (pending || p.checklist.some((c: Row) => !c.done)) throw new Problem(409, "PERIOD_CHECKLIST_INCOMPLETE", "All close checks must be complete and manual journals approved before the period can close."); p.status = "CLOSED"; p.closed_by = ctx.user.name; p.closed_at = nowIso(); audit(ctx, "PERIOD_CLOSED", "Accounting", p.name, "OPEN", "CLOSED", "", true); return ok(p); });
post("/accounting/periods/:id/reopen", (ctx, req, id) => { need(ctx, "period.reopen"); const p = find("periods", id)!; assertState(p.status, ["CLOSED"]); p.status = "OPEN"; p.closed_by = null; p.closed_at = null; audit(ctx, "PERIOD_REOPENED", "Accounting", p.name, "CLOSED", "OPEN", requireReason(req.body), true); return ok(p); });
post("/accounting/reconciliations/:id/complete", (ctx, _r, id) => { need(ctx, "reconcile.manage"); const r = find("reconciliations", id)!; if (r.difference !== "0.00") throw new Problem(409, "RECONCILIATION_DIFFERENCE", `A difference of ${r.difference} remains. Investigate before completing.`); r.status = "RECONCILED"; r.reviewed_by = ctx.user.name; audit(ctx, "RECONCILIATION_COMPLETED", "Accounting", r.account, "IN_PROGRESS", "RECONCILED", "", true); return ok(r); });
post("/accounting/reconciliations/:id/match", (ctx, _r, id) => { need(ctx, "reconcile.manage"); const r = find("reconciliations", id)!; if (r.outstanding_items > 0) { r.outstanding_items -= 1; r.matched_items += 1; } if (r.outstanding_items === 0) { r.ledger_balance = r.statement_balance; r.difference = "0.00"; } return ok(r); });

// Reports
on("GET", "/reports", (ctx) => ok({ items: REPORTS.filter((r) => reportAllowed(ctx, r.category)) }));
function reportAllowed(ctx: Ctx, category: string) { return ctx.perms.includes(`report.${category === "Collections" ? "collection" : category.toLowerCase()}` as Permission); }
on("GET", "/reports/:code", (ctx, req, code) => { const r = REPORTS.find((x) => x.code === code); if (!r || !reportAllowed(ctx, r.category)) throw new Problem(403, "FORBIDDEN", "You do not have access to this report.", "Forbidden"); return ok(runReport(ctx, code, req.query)); });
on("POST", "/reports/:code/exports", (ctx, req, code) => { need(ctx, "report.export"); const log = { id: uid("exp"), report_code: code, format: req.body.format, user_name: ctx.user.name, at: nowIso(), parameters: JSON.stringify(req.body.parameters ?? {}), rows: req.body.rows ?? 0 }; table("export_logs").unshift(log); audit(ctx, "REPORT_EXPORTED", "Reports", code, "", String(req.body.format)); return ok(log, 201); });

// Notifications, documents, audit
on("GET", "/notifications/:id", (ctx, _r, id) => { need(ctx, "notification.view"); return ok(find("notifications", id)); });
on("POST", "/notifications/:id/read", (ctx, _r, id) => { const n = find("notifications", id)!; n.read = true; return ok(n); });
on("POST", "/notifications-read-all", (ctx) => { scoped(ctx, table("notifications")).forEach((n) => { n.read = true; }); return ok({ done: true }); });
on("GET", "/documents/:id", (ctx, _r, id) => { need(ctx, "document.view"); const d = rowOr404(ctx, "documents", id); return ok(d); });
on("GET", "/documents/:id/download-url", (ctx, _r, id) => { need(ctx, "document.view"); const d = rowOr404(ctx, "documents", id); d.access_log.unshift({ at: nowIso(), user: ctx.user.name, action: "Download link issued" }); audit(ctx, "DOCUMENT_ACCESSED", "Documents", d.name, "", "Signed URL issued"); return ok({ url: `#mock-signed-url-${randomUUID()}`, expires_in_seconds: 300, simulated: true }); });
on("POST", "/documents", (ctx, req) => { need(ctx, "document.upload"); const b = req.body; const row = { id: uid("doc"), name: requireReason(b, "name"), category: b.category, owner_type: b.owner_type, owner_id: b.owner_id ?? "", owner_label: b.owner_label ?? "", branch_id: ctx.allBranches ? undefined : ctx.branches[0], size: b.size, mime: b.mime, version: 1, uploaded_by: ctx.user.name, uploaded_at: nowIso(), classification: b.classification ?? "Internal", versions: [{ version: 1, at: nowIso(), by: ctx.user.name }], access_log: [] }; table("documents").unshift(row); audit(ctx, "DOCUMENT_UPLOADED", "Documents", row.name, "", b.category); return ok(row, 201); });
on("POST", "/documents/:id/versions", (ctx, _r, id) => { need(ctx, "document.upload"); const d = rowOr404(ctx, "documents", id); d.version += 1; d.versions.unshift({ version: d.version, at: nowIso(), by: ctx.user.name }); return ok(d); });
on("GET", "/audit/dashboard", (ctx) => { need(ctx, "audit.view"); const logs = table("audit_logs"); const d = today(); const by = (key: string) => [...logs.reduce<Map<string, number>>((m, l) => m.set(l[key], (m.get(l[key]) ?? 0) + 1), new Map())].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8); return ok({ today_events: logs.filter((l) => l.at.slice(0, 10) === d).length, total_events: logs.length, financial_events: logs.filter((l) => l.financial).length, open_exceptions: table("control_exceptions").filter((e) => e.status === "OPEN").length, failed_logins: table("login_history").filter((l) => l.result === "FAILED").length, by_module: by("module"), by_user: by("user_name"), recent: logs.slice(0, 8), integrity: "Hash chain simulated — verified by the backend in production" }); });
post("/control-exceptions/:id/review", (ctx, req, id) => { need(ctx, "audit.view"); const e = find("control_exceptions", id)!; e.status = "REVIEWED"; e.review_note = req.body.reason ?? ""; return ok(e); });

// Users and roles
on("GET", "/users/:id", (ctx, _r, id) => { need(ctx, "user.view"); const u = find("users", id); if (!u) throw new Problem(404, "NOT_FOUND", "User not found."); return ok({ ...u, logins: table("login_history").filter((l) => l.user_id === id), permissions: u.roles.flatMap((r: RoleCode) => ROLE_PERMISSIONS[r]) }); });
const FINANCIAL = new Set(["OWNER", "BRMGR", "CASHIER", "ACCT", "CREDAPPR"]);
on("POST", "/users", (ctx, req) => { need(ctx, "user.manage"); const b = req.body; if (table("users").some((u) => u.username === b.username || u.email === b.email)) validation("username", "Username or email already exists.", "DUPLICATE_USER"); const roles: RoleCode[] = b.roles; const financial = roles.some((r) => FINANCIAL.has(r)); const branchIds = b.branch_ids?.length ? b.branch_ids : ["br-pp1"]; const row = { id: uid("usr"), username: b.username, name: b.name, name_km: b.name_km ?? "", email: b.email, roles: financial ? ["READONLY" as RoleCode] : roles, role_label: (financial ? ["READONLY"] : roles).join(", "), branch_ids: branchIds, branch_label: branchIds[0] === "*" ? "All branches" : branchIds.map((x: string) => find("branches", x)?.name).join(", "), status: "INVITED", approval_limit_usd: b.approval_limit_usd || "0.00", approval_limit_khr: b.approval_limit_khr || "0.00", mfa_enabled: false, last_login: null, failed_attempts: 0, created_at: nowIso(), pending_grant: financial ? { roles, requested_by: ctx.user.id, requested_by_name: ctx.user.name, at: nowIso() } : null }; table("users").unshift(row); audit(ctx, "USER_CREATED", "Users", row.username, "", row.status); if (financial) notify("System Notifications", "Financial permission grant awaiting approval", `${row.name}: ${roles.join(", ")}.`, `/admin/users/${row.id}`); return ok(row, 201); });
on("PATCH", "/users/:id", (ctx, req, id) => { need(ctx, "user.manage"); const u = find("users", id)!; for (const k of ["name", "name_km", "email", "approval_limit_usd", "approval_limit_khr"]) if (k in req.body) u[k] = req.body[k]; audit(ctx, "USER_UPDATED", "Users", u.username, "", "Updated"); return ok(u); });
post("/users/:id/grant", (ctx, req, id) => { need(ctx, "user.manage"); if (id === ctx.user.id) throw new Problem(403, "SOD_VIOLATION", "You cannot grant permissions to yourself.", "Self-grant rejected"); const u = find("users", id)!; const roles: RoleCode[] = req.body.roles; if (roles.some((r) => FINANCIAL.has(r))) { u.pending_grant = { roles, requested_by: ctx.user.id, requested_by_name: ctx.user.name, at: nowIso() }; audit(ctx, "FINANCIAL_GRANT_REQUESTED", "Users", u.username, u.roles.join(","), roles.join(",")); return ok({ ...u, message: "Financial permissions require Owner approval." }); } u.roles = roles; u.role_label = roles.join(", "); audit(ctx, "ROLE_CHANGED", "Users", u.username, "", roles.join(",")); return ok(u); });
post("/users/:id/approve-grant", (ctx, _r, id) => { need(ctx, "user.approve_grant"); const u = find("users", id)!; if (!u.pending_grant) throw new Problem(409, "INVALID_STATE", "No grant is pending."); sod(ctx, u.pending_grant.requested_by, "approve"); u.roles = u.pending_grant.roles; u.role_label = u.roles.join(", "); u.pending_grant = null; audit(ctx, "FINANCIAL_GRANT_APPROVED", "Users", u.username, "", u.roles.join(",")); return ok(u); });
post("/users/:id/deactivate", (ctx, req, id) => { need(ctx, "user.manage"); const u = find("users", id)!; if (id === ctx.user.id) validation("id", "You cannot deactivate your own account."); u.status = "INACTIVE"; audit(ctx, "USER_DEACTIVATED", "Users", u.username, "ACTIVE", "INACTIVE", requireReason(req.body)); return ok(u); });
post("/users/:id/activate", (ctx, _r, id) => { need(ctx, "user.manage"); const u = find("users", id)!; u.status = "ACTIVE"; audit(ctx, "USER_ACTIVATED", "Users", u.username, "INACTIVE", "ACTIVE"); return ok(u); });
on("GET", "/roles", (ctx) => { need(ctx, "role.view"); return ok({ items: ROLES.map((code) => ({ id: code, code, name: ROLE_NAMES[code], permissions: ROLE_PERMISSIONS[code], users: table("users").filter((u) => u.roles.includes(code)).length })), groups: PERMISSION_GROUPS }); });
on("GET", "/company", (ctx) => { need(ctx, "org.view"); return ok(table("company")[0]); });
on("PATCH", "/company", (ctx, req) => { need(ctx, "org.manage"); Object.assign(table("company")[0], req.body); audit(ctx, "COMPANY_UPDATED", "Administration", "Company", "", "Updated"); return ok(table("company")[0]); });

function sessionUser(u: Row) { return { id: u.id, username: u.username, name: u.name, name_km: u.name_km, email: u.email, roles: u.roles, branch_ids: u.branch_ids, branch_label: u.branch_label, approval_limit_usd: u.approval_limit_usd, approval_limit_khr: u.approval_limit_khr, landing: landingRoute(u.roles[0]) }; }

function auth(req: Req): Res | null {
  const action = req.path[1];
  if (req.path[0] !== "auth") return null;
  const cookie = (id: string) => `${COOKIE}=${id}; Path=/api/mock; HttpOnly; SameSite=Strict; Max-Age=43200`;
  const session = (u: Row): Res => { table("login_history").unshift({ id: uid("lg"), user_id: u.id, user_name: u.name, at: nowIso(), result: "SUCCESS", ip_address: req.ip, device: req.headers.get("user-agent")?.slice(0, 40) ?? "Browser" }); u.last_login = nowIso(); u.failed_attempts = 0; audit(ctxFor(u, req.ip, req.traceId), "SIGN_IN", "Authentication", u.username, "", "SUCCESS"); return { status: 200, body: { access_token: `mock.${u.id}`, expires_in: 900, user: sessionUser(u) }, setCookie: cookie(u.id) }; };
  if (action === "login" && req.method === "POST") {
    const u = table("users").find((x) => x.username === req.body.username || x.email === req.body.username);
    if (!u || req.body.password !== DEMO_PASSWORD || u.status !== "ACTIVE") { if (u) { u.failed_attempts += 1; table("login_history").unshift({ id: uid("lg"), user_id: u.id, user_name: u.name, at: nowIso(), result: "FAILED", ip_address: req.ip, device: "Browser" }); } if (u && u.failed_attempts >= 5) throw new Problem(423, "ACCOUNT_LOCKED", "This account is temporarily locked after repeated failed sign-ins.", "Account locked"); throw new Problem(401, "INVALID_CREDENTIALS", "Username or password is incorrect.", "Sign-in failed"); }
    if (u.failed_attempts >= 5) throw new Problem(423, "ACCOUNT_LOCKED", "This account is temporarily locked after repeated failed sign-ins.", "Account locked");
    if (u.mfa_enabled) return { status: 200, body: { mfa_required: true, mfa_token: `mfa.${u.id}` } };
    return session(u);
  }
  if (action === "mfa" && req.method === "POST") { const u = find("users", String(req.body.mfa_token ?? "").replace("mfa.", "")); if (!u || req.body.code !== DEMO_MFA) throw new Problem(401, "INVALID_MFA", "The verification code is not valid.", "Verification failed"); return session(u); }
  if (action === "refresh" && req.method === "POST") { const u = req.cookieUser ? find("users", req.cookieUser) : undefined; if (!u || u.status !== "ACTIVE") throw new Problem(401, "UNAUTHENTICATED", "Session expired.", "Session expired"); return { status: 200, body: { access_token: `mock.${u.id}`, expires_in: 900, user: sessionUser(u) }, setCookie: cookie(u.id) }; }
  if (action === "logout" && req.method === "POST") return { status: 204, body: null, setCookie: `${COOKIE}=; Path=/api/mock; HttpOnly; Max-Age=0` };
  if (action === "password-reset" && req.method === "POST") return { status: 200, body: { accepted: true, detail: "If the account exists, instructions have been sent." } };
  if (action === "switch-role" && req.method === "POST") { const u = find("users", req.body.user_id); if (!u) throw new Problem(404, "NOT_FOUND", "Demo user not found."); return { status: 200, body: { access_token: `mock.${u.id}`, expires_in: 900, user: sessionUser(u) }, setCookie: cookie(u.id) }; }
  return null;
}

export function handle(method: string, path: string[], query: Params, body: Row, headers: Headers, ip: string, cookieUser?: string): Res {
  ensureSeeded();
  const req: Req = { method, path, query, body, headers, ip, traceId: randomUUID(), cookieUser };
  try {
    const a = auth(req); if (a) return a;
    const token = headers.get("authorization")?.replace("Bearer mock.", "");
    const user = token ? find("users", token) : undefined;
    if (!user || user.status !== "ACTIVE") throw new Problem(401, "UNAUTHENTICATED", "Please sign in.", "Authentication required");
    const ctx = ctxFor(user, ip, req.traceId);
    const joined = `/${path.join("/")}`;
    for (const route of routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(joined);
      if (m) return route.financial ? runIdempotent(req, () => route.handler(ctx, req, m[1], m[2])) : route.handler(ctx, req, m[1], m[2]);
    }
    const key = path.join("/");
    if (method === "GET" && LISTS[key]) { const l = LISTS[key]; need(ctx, ...l.perms); return ok(pageOf(l.noScope ? l.rows(ctx) : scoped(ctx, l.rows(ctx)), query, l.date, l.search)); }
    const parent = path.slice(0, -1).join("/");
    if (method === "POST" && MASTER[key]) { const m = MASTER[key]; need(ctx, m.perm); const row: Row = { id: uid(m.prefix) }; for (const f of m.fields) if (f in body) row[f] = body[f]; table(m.table).unshift(row); audit(ctx, "MASTER_DATA_CREATED", "Administration", String(row.code ?? row.name ?? row.id), "", "Created"); return ok(row, 201); }
    if (method === "PATCH" && MASTER[parent]) { const m = MASTER[parent]; need(ctx, m.perm); const row = find(m.table, path[path.length - 1]); if (!row) throw new Problem(404, "NOT_FOUND", "Record not found."); for (const f of m.fields) if (f in body) row[f] = body[f]; audit(ctx, "MASTER_DATA_UPDATED", "Administration", String(row.code ?? row.name ?? row.id), "", "Updated"); return ok(row); }
    if (method === "GET" && LISTS[parent]) { const l = LISTS[parent]; need(ctx, ...l.perms); const row = l.rows(ctx).find((r) => r.id === path[path.length - 1]); if (!row || (!l.noScope && !inScope(ctx, row))) throw new Problem(404, "NOT_FOUND", "Record not found."); return ok(row); }
    throw new Problem(404, "NOT_FOUND", `No mock endpoint for ${method} ${joined}.`, "Not found");
  } catch (e) {
    if (e instanceof Problem) return { status: e.status, body: { type: `https://lms.example/errors/${e.code.toLowerCase().replace(/_/g, "-")}`, title: e.title, status: e.status, code: e.code, detail: e.detail, errors: e.errors, trace_id: req.traceId, ...e.extra } };
    if (e instanceof EngineError) return { status: 422, body: { title: "Calculation failed", status: 422, code: e.code, detail: e.message, errors: [], trace_id: req.traceId } };
    console.error("Mock API error", e);
    return { status: 500, body: { title: "Mock server error", status: 500, code: "INTERNAL_ERROR", detail: "The demonstration API failed.", errors: [], trace_id: req.traceId } };
  }
}
