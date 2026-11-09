/**
 * MOCK BACKEND ONLY — in-memory state and loan-ledger operations for the demonstration API.
 * Implements the behaviour of SRS §10–§12 closely enough to exercise the UI. Nothing here is a real posting.
 */
import { add, cmp, isPositive, isZero, min, sub, toCents, fromCents } from "./decimal";
import { accruedInterest, adjustBusinessDay, daysBetween, generateSchedule, type EngineInstallment, type Terms } from "./engine";
import { permissionsForRoles, type Permission, type RoleCode } from "@/lib/permissions";

// The mock's records are deliberately loose: the typed contract lives in src/types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Db {
  [collection: string]: Row[];
}

export interface Ctx {
  user: Row;
  roles: RoleCode[];
  perms: Permission[];
  allBranches: boolean;
  branches: string[];
  ip: string;
  traceId: string;
}

export class Problem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly title: string = code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    readonly errors: Row[] = [],
    readonly extra: Row = {},
  ) {
    super(detail);
  }
}

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(new Date());
export const nowIso = () => new Date().toISOString();

interface MockGlobal {
  db?: Db;
  counters?: Record<string, number>;
  idempotency?: Map<string, { hash: string; body: unknown; status: number }>;
  holidays?: Set<string>;
  seeded?: boolean;
}
const g = globalThis as unknown as { __lmsMock?: MockGlobal };
g.__lmsMock ??= {};
export const state = g.__lmsMock;
state.db ??= {};
state.counters ??= {};
state.idempotency ??= new Map();
state.holidays ??= new Set();

export const db = () => state.db as Db;
export const table = (name: string) => (db()[name] ??= []);
export const holidays = () => state.holidays as Set<string>;

export function resetState() {
  state.db = {};
  state.counters = {};
  state.idempotency = new Map();
  state.seeded = false;
}

export function nextSeq(key: string, start = 1): number {
  const counters = state.counters as Record<string, number>;
  counters[key] = (counters[key] ?? start - 1) + 1;
  return counters[key];
}
export const pad = (n: number, width = 6) => String(n).padStart(width, "0");
export const uid = (prefix: string) => `${prefix}-${nextSeq(`uid:${prefix}`, 1001)}`;

export const find = (name: string, id: string) => table(name).find((r) => r.id === id);

export function need(ctx: Ctx, ...perms: Permission[]) {
  if (!perms.some((p) => ctx.perms.includes(p))) {
    throw new Problem(403, "FORBIDDEN", "You do not have permission to perform this action.", "Forbidden");
  }
}

/** BR-SEC-003: the same user cannot be maker and checker on one record. */
export function sod(ctx: Ctx, makerId: string | undefined | null, what: string) {
  if (makerId && makerId === ctx.user.id) {
    throw new Problem(403, "SOD_VIOLATION", `Maker-checker restriction: you cannot ${what} a record you prepared.`, "Separation of duties violation");
  }
}

export function invalidState(current: string, allowed: string[]): never {
  throw new Problem(409, "INVALID_STATE", `Action is not allowed while status is ${current}. Allowed from: ${allowed.join(", ")}.`, "Invalid state", [], { current_status: current, allowed });
}
export function assertState(current: string, allowed: string[]) {
  if (!allowed.includes(current)) invalidState(current, allowed);
}

export function validation(field: string, message: string, code = "VALIDATION_FAILED"): never {
  throw new Problem(422, code, message, "Validation failed", [{ field, code, message }]);
}

export function requireReason(body: Row, field = "reason") {
  if (!String(body[field] ?? "").trim()) validation(field, "A reason is required.");
  return String(body[field]);
}

export function audit(ctx: Ctx | null, action: string, module: string, ref: string, prev: unknown, next: unknown, reason = "", financial = false) {
  const logs = table("audit_logs");
  const entry = {
    id: uid("AUD"),
    user_id: ctx?.user.id ?? "system",
    user_name: ctx?.user.name ?? "System",
    action, module, record_reference: ref,
    at: nowIso(),
    ip_address: ctx?.ip ?? "—",
    previous_state: prev === undefined || prev === null ? "" : String(typeof prev === "string" ? prev : JSON.stringify(prev)),
    new_state: next === undefined || next === null ? "" : String(typeof next === "string" ? next : JSON.stringify(next)),
    reason, financial,
    correlation_id: ctx?.traceId ?? "",
    hash: fromCents(BigInt(logs.length + 1) * 7919n).replace(".", ""),
  };
  logs.unshift(entry);
  return entry;
}

export function notify(category: string, title: string, message: string, link: string, branchId?: string, priority: "NORMAL" | "HIGH" = "NORMAL") {
  table("notifications").unshift({ id: uid("NTF"), category, title, message, link, branch_id: branchId, read: false, priority, channel: "IN_APP", delivery_status: "DELIVERED", attempts: 1, created_at: nowIso() });
}

// ───── Users ─────
export function ctxFor(user: Row, ip: string, traceId: string): Ctx {
  const roles = user.roles as RoleCode[];
  return { user, roles, perms: permissionsForRoles(roles), allBranches: user.branch_ids[0] === "*", branches: user.branch_ids, ip, traceId };
}

export function inScope(ctx: Ctx, row: Row) {
  return ctx.allBranches || !row.branch_id || ctx.branches.includes(row.branch_id);
}

// ───── Loans ─────
export interface Installment extends EngineInstallment {
  principal_paid: string;
  interest_paid: string;
  fee: string;
  fee_paid: string;
  penalty: string;
  penalty_paid: string;
  status: string;
}

export const asInstallments = (rows: EngineInstallment[]): Installment[] =>
  rows.map((r) => ({ ...r, principal_paid: "0.00", interest_paid: "0.00", fee: "0.00", fee_paid: "0.00", penalty: "0.00", penalty_paid: "0.00", status: "SCHEDULED" }));

export const activeSchedule = (loan: Row) => loan.schedule_versions.find((s: Row) => s.status === "ACTIVE") ?? loan.schedule_versions[loan.schedule_versions.length - 1];

export function unpaid(ins: Installment) {
  return add(sub(ins.principal, ins.principal_paid), sub(ins.interest, ins.interest_paid), sub(ins.fee, ins.fee_paid), sub(ins.penalty, ins.penalty_paid));
}

export function installmentStatus(ins: Installment, asOf: string): string {
  const due = ins.payment_due_date;
  const open = isPositive(unpaid(ins));
  if (!open) return "PAID";
  if (due < asOf) return "OVERDUE";
  const paidSomething = isPositive(add(ins.principal_paid, ins.interest_paid));
  if (paidSomething) return "PARTIALLY_PAID";
  return due === asOf ? "DUE" : "SCHEDULED";
}

export function dpdOf(loan: Row, asOf: string): number {
  if (loan.status !== "ACTIVE") return 0;
  const oldest = (activeSchedule(loan).installments as Installment[]).find((i) => i.due_date <= asOf && isPositive(unpaid(i)));
  return oldest && oldest.due_date < asOf ? daysBetween(oldest.due_date, asOf) : 0;
}

export function bucketOf(dpd: number) {
  if (dpd <= 0) return "Current";
  if (dpd <= 30) return "1–30";
  if (dpd <= 60) return "31–60";
  if (dpd <= 90) return "61–90";
  return "> 90";
}

export function parClass(dpd: number) {
  if (dpd > 90) return "PAR90";
  if (dpd > 60) return "PAR60";
  if (dpd > 30) return "PAR30";
  if (dpd > 7) return "PAR7";
  if (dpd > 0) return "PAR1";
  return "Performing";
}

export function outstandingPrincipal(loan: Row, asOf = "9999-12-31") {
  return fromCents(
    (loan.transactions as Row[]).filter((t) => t.component === "PRINCIPAL" && t.value_date <= asOf).reduce((s, t) => s + toCents(t.amount), 0n),
  );
}

export function balances(loan: Row, asOf: string = today()) {
  const installments = activeSchedule(loan).installments as Installment[];
  const principal = outstandingPrincipal(loan, asOf);
  let interestDue = "0.00", feesDue = "0.00", penaltiesDue = "0.00", overdue = "0.00", dueNow = "0.00", interestPaid = "0.00", lastDue = loan.disbursed_on ?? asOf;
  let next: Installment | undefined;
  for (const i of installments) {
    interestPaid = add(interestPaid, i.interest_paid);
    if (i.due_date <= asOf) {
      lastDue = i.due_date;
      interestDue = add(interestDue, sub(i.interest, i.interest_paid));
      feesDue = add(feesDue, sub(i.fee, i.fee_paid));
      penaltiesDue = add(penaltiesDue, sub(i.penalty, i.penalty_paid));
      dueNow = add(dueNow, unpaid(i));
      if (i.payment_due_date < asOf) overdue = add(overdue, unpaid(i));
    } else if (!next && isPositive(unpaid(i))) {
      next = i;
    }
  }
  const active = loan.status === "ACTIVE";
  const accrued = active && isPositive(principal) && loan.terms ? accruedInterest(principal, loan.terms, lastDue, asOf) : "0.00";
  const unapplied = (loan.transactions as Row[]).filter((t) => t.component === "UNAPPLIED" && t.value_date <= asOf).reduce((s, t) => add(s, t.amount), "0.00");
  const received = (table("repayments") as Row[]).filter((r) => r.loan_id === loan.id && r.status === "COMPLETED").reduce((s, r) => add(s, r.amount), "0.00");
  const dpd = dpdOf(loan, asOf);
  return {
    as_of: asOf,
    original_principal: loan.contractual_principal as string,
    disbursed_principal: loan.disbursed_principal as string,
    outstanding_principal: principal,
    interest_due: interestDue,
    interest_accrued: accrued,
    interest_paid: interestPaid,
    fees_due: feesDue,
    penalties_due: penaltiesDue,
    unapplied,
    amount_overdue: overdue,
    total_due_today: dueNow,
    total_outstanding: add(principal, interestDue, accrued, feesDue, penaltiesDue),
    amount_received: received,
    remaining_scheduled: installments.filter((i) => i.due_date > asOf).reduce((s, i) => add(s, unpaid(i)), "0.00"),
    next_payment_date: next?.payment_due_date ?? null,
    next_payment_amount: next ? unpaid(next) : null,
    days_past_due: dpd,
    bucket: bucketOf(dpd),
    par_classification: parClass(dpd),
  };
}

export function summary(loan: Row): Row {
  const { transactions: _t, schedule_versions: _s, ...rest } = loan;
  void _t; void _s;
  return { ...rest, ...balances(loan) };
}

export function postTxn(loan: Row, txn_type: string, component: string, amount: string, value_date: string, source: string, ctx: Ctx | null, installment_no?: number, reverses?: string) {
  const row = { id: uid("TXN"), loan_id: loan.id, loan_account_no: loan.account_no, txn_type, component, amount, currency: loan.currency, value_date, posting_date: today(), installment_no: installment_no ?? null, source_document: source, reverses_txn_id: reverses ?? null, created_by: ctx?.user.name ?? "System", branch_id: loan.branch_id };
  loan.transactions.push(row);
  return row;
}

// ───── General ledger ─────
const ACCOUNT_BY_CODE = (code: string) => table("accounts").find((a) => a.code === code);

export function currentPeriod(date: string) {
  const open = table("periods").find((p) => p.status === "OPEN" && date >= p.start_date && date <= p.end_date);
  return open ?? table("periods").find((p) => p.status === "OPEN");
}

export interface LineInput { code: string; debit?: string; credit?: string }

export function postJournal(input: { description: string; date: string; source_type: string; source_id: string; source_event: string; currency: string; branch_id?: string; lines: LineInput[]; status?: string; manual?: boolean; created_by?: string; loan_id?: string }, ctx: Ctx | null) {
  const lines = input.lines
    .filter((l) => isPositive(l.debit ?? "0") || isPositive(l.credit ?? "0"))
    .map((l, index) => {
      const account = ACCOUNT_BY_CODE(l.code);
      if (!account) throw new Problem(422, "MAPPING_MISSING", `No account mapping for ${l.code}.`, "Account mapping missing");
      return { id: `${index + 1}`, account_id: account.id, account_code: account.code, account_name: account.name, debit: l.debit ?? "0.00", credit: l.credit ?? "0.00" };
    });
  const debit = lines.reduce((s, l) => add(s, l.debit), "0.00");
  const credit = lines.reduce((s, l) => add(s, l.credit), "0.00");
  if (cmp(debit, credit) !== 0) throw new Problem(422, "UNBALANCED_JOURNAL", `Debits ${debit} do not equal credits ${credit}.`, "Unbalanced journal");
  const period = currentPeriod(input.date);
  const journal = {
    id: uid("JE"),
    journal_no: `JV-${input.date.slice(0, 4)}-${pad(nextSeq(`journal:${input.date.slice(0, 4)}`))}`,
    accounting_date: period && input.date >= period.start_date ? input.date : (period?.start_date ?? input.date),
    value_date: input.date,
    period_id: period?.id,
    period_name: period?.name,
    source_type: input.source_type,
    source_id: input.source_id,
    source_event: input.source_event,
    description: input.description,
    status: input.status ?? "POSTED",
    manual: Boolean(input.manual),
    currency: input.currency,
    branch_id: input.branch_id,
    loan_id: input.loan_id,
    lines,
    total_debit: debit,
    total_credit: credit,
    created_at: nowIso(),
    created_by: input.created_by ?? ctx?.user.id ?? "system",
    created_by_name: ctx?.user.name ?? "System",
    approved_by: null,
    reverses_journal_id: null,
  };
  table("journals").unshift(journal);
  return journal;
}

// ───── Repayment allocation ─────
export interface Allocation { installment_no: number | null; component: "PENALTY" | "FEE" | "INTEREST" | "PRINCIPAL"; amount: string; sequence_no: number }

const COMPONENTS: { component: Allocation["component"]; due: keyof Installment; paid: keyof Installment }[] = [
  { component: "PENALTY", due: "penalty", paid: "penalty_paid" },
  { component: "FEE", due: "fee", paid: "fee_paid" },
  { component: "INTEREST", due: "interest", paid: "interest_paid" },
  { component: "PRINCIPAL", due: "principal", paid: "principal_paid" },
];

/** Default waterfall (A-06, D-04, D-05): oldest due first; penalties → fees → interest → principal; not-yet-due excess is unapplied. */
export function allocate(installments: Installment[], amount: string, valueDate: string, commit: boolean) {
  let remaining = amount;
  const allocations: Allocation[] = [];
  let sequence = 1;
  for (const ins of installments) {
    if (ins.payment_due_date > valueDate && ins.due_date > valueDate) continue;
    for (const c of COMPONENTS) {
      if (!isPositive(remaining)) break;
      const open = sub(ins[c.due] as string, ins[c.paid] as string);
      if (!isPositive(open)) continue;
      const take = min(open, remaining);
      allocations.push({ installment_no: ins.no, component: c.component, amount: take, sequence_no: sequence++ });
      remaining = sub(remaining, take);
      if (commit) (ins as unknown as Row)[c.paid] = add(ins[c.paid] as string, take);
    }
  }
  return { allocations, unapplied: remaining };
}

const creditAccount: Record<Allocation["component"], string> = { PENALTY: "1120", FEE: "1120", INTEREST: "1110", PRINCIPAL: "1100" };
export const cashAccount = (method: string) => (method === "CASH" ? "1000" : "1010");

export function refreshInstallments(loan: Row, asOf = today()) {
  for (const ins of activeSchedule(loan).installments as Installment[]) ins.status = installmentStatus(ins, asOf);
}

export function applyRepayment(loan: Row, input: { amount: string; value_date: string; method: string; external_reference?: string | null; channel?: string; comment?: string; session_id?: string | null; repayment_id?: string; receipt_no?: string }, ctx: Ctx | null) {
  const schedule = activeSchedule(loan);
  const { allocations, unapplied } = allocate(schedule.installments, input.amount, input.value_date, true);
  const repayment = {
    id: input.repayment_id ?? uid("RPY"),
    receipt_no: input.receipt_no ?? `${loan.branch_code}-R-${input.value_date.slice(0, 4)}-${pad(nextSeq(`receipt:${loan.branch_code}`))}`,
    loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name,
    product_id: loan.product_id,
    amount: input.amount, currency: loan.currency, payment_date: input.value_date, value_date: input.value_date, method: input.method,
    channel: input.channel ?? "BRANCH", external_reference: input.external_reference ?? null, comment: input.comment ?? "",
    status: "COMPLETED", unapplied_amount: unapplied, cashier_session_id: input.session_id ?? null, allocations,
    cashier_id: ctx?.user.id ?? "cashier", cashier_name: ctx?.user.name ?? "Nhem Channary", created_at: nowIso(), reversal: null, print_count: 0,
  };
  for (const a of allocations) {
    const component = a.component === "INTEREST" ? "INTEREST_DUE" : a.component;
    postTxn(loan, "REPAYMENT_ALLOCATION", component, `-${a.amount}`, input.value_date, repayment.receipt_no, ctx, a.installment_no ?? undefined);
  }
  if (isPositive(unapplied)) postTxn(loan, "UNAPPLIED_IN", "UNAPPLIED", unapplied, input.value_date, repayment.receipt_no, ctx);
  const cr: Record<string, string> = {};
  for (const a of allocations) cr[creditAccount[a.component]] = add(cr[creditAccount[a.component]] ?? "0.00", a.amount);
  if (isPositive(unapplied)) cr["2100"] = unapplied;
  postJournal({
    description: `Repayment ${repayment.receipt_no} — ${loan.account_no}`, date: input.value_date, source_type: "REPAYMENT", source_id: repayment.id, source_event: "REPAYMENT",
    currency: loan.currency, branch_id: loan.branch_id, loan_id: loan.id,
    lines: [{ code: cashAccount(input.method), debit: input.amount }, ...Object.entries(cr).map(([code, credit]) => ({ code, credit }))],
  }, ctx);
  refreshInstallments(loan);
  return repayment;
}

/** Records a partial prepayment: principal only, with the remaining schedule replaced by a new version. */
export function applyPrepayment(loan: Row, input: { amount: string; value_date: string; method: string; external_reference?: string | null; session_id?: string | null; option: string; remaining: Omit<EngineInstallment, "no">[] }, ctx: Ctx) {
  const current = activeSchedule(loan);
  const carried = (current.installments as Installment[]).filter((i) => i.due_date <= input.value_date).map((i) => ({ ...i }));
  const installments = [...carried, ...asInstallments(input.remaining.map((r, k) => ({ ...r, no: carried.length + k + 1 })))];
  const version = Math.max(...loan.schedule_versions.map((s: Row) => s.version_no)) + 1;
  current.status = "SUPERSEDED";
  loan.schedule_versions.push({ version_no: version, status: "ACTIVE", reason: "PREPAYMENT", effective_from: input.value_date, engine_version: current.engine_version, total_principal: current.total_principal, total_interest: installments.reduce((s, i) => add(s, i.interest), "0.00"), installments });
  loan.maturity_date = installments[installments.length - 1].due_date;
  loan.term = installments.length;
  const repayment = {
    id: uid("RPY"), receipt_no: `${loan.branch_code}-R-${input.value_date.slice(0, 4)}-${pad(nextSeq(`receipt:${loan.branch_code}`))}`, kind: "PREPAYMENT", prepayment_option: input.option, superseded_schedule_version: current.version_no, new_schedule_version: version,
    loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, product_id: loan.product_id,
    amount: input.amount, currency: loan.currency, payment_date: input.value_date, value_date: input.value_date, method: input.method, channel: "BRANCH", external_reference: input.external_reference ?? null, comment: "Partial prepayment",
    status: "COMPLETED", unapplied_amount: "0.00", cashier_session_id: input.session_id ?? null, allocations: [{ installment_no: null, component: "PRINCIPAL", amount: input.amount, sequence_no: 1 }] as Allocation[],
    cashier_id: ctx.user.id, cashier_name: ctx.user.name, created_at: nowIso(), reversal: null, print_count: 0,
  };
  postTxn(loan, "REPAYMENT_ALLOCATION", "PRINCIPAL", `-${input.amount}`, input.value_date, repayment.receipt_no, ctx);
  postJournal({ description: `Partial prepayment ${repayment.receipt_no} — ${loan.account_no}`, date: input.value_date, source_type: "REPAYMENT", source_id: repayment.id, source_event: "REPAYMENT", currency: loan.currency, branch_id: loan.branch_id, loan_id: loan.id, lines: [{ code: cashAccount(input.method), debit: input.amount }, { code: "1100", credit: input.amount }] }, ctx);
  refreshInstallments(loan);
  return repayment;
}

/** Reversal of a prepayment reinstates the earlier schedule as a new version; superseded versions stay on record. */
function restoreSchedule(loan: Row, repayment: Row) {
  const previous = loan.schedule_versions.find((s: Row) => s.version_no === repayment.superseded_schedule_version);
  const copy = structuredClone(previous);
  activeSchedule(loan).status = "SUPERSEDED";
  copy.version_no = Math.max(...loan.schedule_versions.map((s: Row) => s.version_no)) + 1;
  copy.status = "ACTIVE";
  copy.reason = "PREPAYMENT_REVERSAL";
  copy.effective_from = today();
  loan.schedule_versions.push(copy);
  loan.maturity_date = copy.installments[copy.installments.length - 1].due_date;
  loan.term = copy.installments.length;
}

/** Reverses a repayment, then re-allocates later payments in value-date order (SRS §11.7). */
export function reverseRepayment(loan: Row, repayment: Row, reason: string, ctx: Ctx) {
  repayment.status = "REVERSED";
  repayment.reversal = { at: nowIso(), by: ctx.user.name, reason };
  if (repayment.kind === "PREPAYMENT") restoreSchedule(loan, repayment);
  const schedule = activeSchedule(loan);
  for (const t of loan.transactions.filter((x: Row) => x.source_document === repayment.receipt_no && !x.reverses_txn_id)) {
    postTxn(loan, "REVERSAL", t.component, t.amount.startsWith("-") ? t.amount.slice(1) : `-${t.amount}`, t.value_date, `REV-${repayment.receipt_no}`, ctx, t.installment_no ?? undefined, t.id);
  }
  for (const ins of schedule.installments as Installment[]) Object.assign(ins, { principal_paid: "0.00", interest_paid: "0.00", fee_paid: "0.00", penalty_paid: "0.00" });
  const remaining = table("repayments").filter((r) => r.loan_id === loan.id && r.status === "COMPLETED" && r.kind !== "PREPAYMENT").sort((a, b) => a.value_date.localeCompare(b.value_date));
  for (const r of remaining) {
    const result = allocate(schedule.installments, r.amount, r.value_date, true);
    r.allocations = result.allocations;
    r.unapplied_amount = result.unapplied;
  }
  const original = table("journals").find((j) => j.source_id === repayment.id && j.source_event === "REPAYMENT");
  if (original) {
    original.status = "REVERSED";
    postJournal({
      description: `Reversal of ${repayment.receipt_no}: ${reason}`, date: today(), source_type: "REPAYMENT", source_id: repayment.id, source_event: "REVERSAL", currency: original.currency, branch_id: loan.branch_id, loan_id: loan.id,
      lines: original.lines.map((l: Row) => ({ code: l.account_code, debit: l.credit, credit: l.debit })),
    }, ctx).reverses_journal_id = original.id;
  }
  refreshInstallments(loan);
}

export function buildSchedule(terms: Terms) {
  return generateSchedule(terms, holidays());
}

export { adjustBusinessDay, isZero };
