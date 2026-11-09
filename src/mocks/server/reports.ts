/**
 * MOCK BACKEND ONLY — dashboard metrics and the RPT-01…RPT-42 catalogue (SRS §18).
 * All amounts are single-currency per response: currencies are never summed together (SRS §18.1).
 */
import { add, cmp, fromCents, isPositive, percent, sub, toCents } from "./decimal";
import { addDays, addMonthsAnchored } from "./engine";
import { activeSchedule, balances, bucketOf, dpdOf, inScope, outstandingPrincipal, parClass, table, today, type Ctx, type Installment, type Row } from "./store";

export type Params = Record<string, string | undefined>;
type Col = [key: string, label: string, type?: "money" | "date" | "datetime" | "status" | "number" | "percent" | "text"];

export interface ReportDef { code: string; name: string; category: "Portfolio" | "Collections" | "Financial" | "Risk" | "Control"; purpose: string; parameters: string; users: string }

const def = (code: string, name: string, category: ReportDef["category"], purpose: string, parameters: string, users: string): ReportDef => ({ code, name, category, purpose, parameters, users });

export const REPORTS: ReportDef[] = [
  def("RPT-01", "Portfolio Summary", "Portfolio", "Number and outstanding by product, branch, currency, status", "Date, branch, product, currency", "OWNER, BRMGR"),
  def("RPT-02", "Loan Register", "Portfolio", "All loans with key terms, balances, DPD", "Date, status, filters", "BRMGR, AUDITOR"),
  def("RPT-03", "Disbursement Report", "Portfolio", "Disbursements by date, product, officer, method; fees deducted; net paid", "Period", "BRMGR, ACCT"),
  def("RPT-04", "New Loans and Growth", "Portfolio", "New loans, average size, growth vs prior period", "Period", "OWNER"),
  def("RPT-05", "Portfolio by Loan Officer", "Portfolio", "Clients, loans, outstanding, PAR per officer", "Date", "BRMGR"),
  def("RPT-06", "Portfolio by Sector and Purpose", "Portfolio", "Concentration by purpose, sector, province", "Date", "OWNER, CRANALYST"),
  def("RPT-07", "Maturity Profile", "Portfolio", "Outstanding by remaining term and maturity month", "Date", "OWNER, ACCT"),
  def("RPT-08", "Restructured Loans", "Portfolio", "Loans with modifications, type, date, counts, current DPD", "Date", "OWNER, CREDAPPR"),
  def("RPT-09", "Closed Loans", "Portfolio", "Closures by type (paid, early settlement, recovered)", "Period", "BRMGR"),
  def("RPT-10", "Loan Statement", "Collections", "Per-loan transactions and balances (borrower copy)", "Loan, period", "LOANOFF, CASHIER"),
  def("RPT-11", "Schedule vs Actual", "Collections", "Scheduled vs received by installment", "Loan", "LOANOFF"),
  def("RPT-12", "Daily Collection Report", "Collections", "Receipts by cashier, method, component; reversals", "Date", "CASHIER, BRMGR"),
  def("RPT-13", "Due List", "Collections", "Installments due in a period by officer", "Period", "LOANOFF, COLLOFF"),
  def("RPT-14", "Overdue List", "Collections", "Overdue loans with amounts, DPD, contact data, assigned officer", "Date", "COLLOFF"),
  def("RPT-15", "Aging / Bucket Report", "Collections", "Count and outstanding by DPD bucket", "Date", "OWNER, BRMGR"),
  def("RPT-16", "Collection Performance", "Collections", "Expected vs collected, collection rate by officer and branch", "Period", "BRMGR"),
  def("RPT-17", "PAR Report", "Collections", "PAR1/7/30/60/90 by branch, product, officer", "Date, thresholds", "OWNER, BRMGR"),
  def("RPT-18", "Promise-to-Pay Tracking", "Collections", "Promises made, kept, broken", "Period", "COLLOFF, BRMGR"),
  def("RPT-19", "Collection Activity Log", "Collections", "Contacts by officer and outcome; flags contacts outside allowed hours", "Period", "BRMGR, AUDITOR"),
  def("RPT-20", "Roll-rate Report", "Collections", "Movement of outstanding between buckets month to month", "Two dates", "OWNER"),
  def("RPT-21", "Trial Balance", "Financial", "Accounts with opening, movements, closing", "Period", "ACCT"),
  def("RPT-22", "General Ledger Detail", "Financial", "Journal lines by account with source links", "Period, account", "ACCT, AUDITOR"),
  def("RPT-23", "Journal Register", "Financial", "Journals by source, manual journals, reversals", "Period", "ACCT, AUDITOR"),
  def("RPT-24", "Income Statement (Management)", "Financial", "Interest, fee, penalty income; impairment; expenses", "Period", "OWNER, ACCT"),
  def("RPT-25", "Balance Sheet (Management)", "Financial", "Assets, liabilities, equity from GL", "Date", "OWNER, ACCT"),
  def("RPT-26", "Interest Income and Accrual", "Financial", "Accrued, due, collected interest by product", "Period", "ACCT"),
  def("RPT-27", "Fees and Penalties", "Financial", "Charged, collected, waived, reversed", "Period", "ACCT, BRMGR"),
  def("RPT-28", "Subledger Reconciliation", "Financial", "Loan ledger components vs GL control accounts; differences", "Date", "ACCT"),
  def("RPT-29", "Cashier and Bank Reconciliation", "Financial", "Cashier sessions, variances, bank matches and outstanding items", "Period", "ACCT"),
  def("RPT-30", "Write-off and Recovery", "Financial", "Write-offs by date and reason; recoveries", "Period", "OWNER, ACCT"),
  def("RPT-31", "Application Pipeline", "Risk", "Applications by status and age", "Date", "BRMGR"),
  def("RPT-32", "Approval and Rejection Analysis", "Risk", "Approval rate, reasons, approver", "Period", "CREDAPPR"),
  def("RPT-33", "Turnaround Time", "Risk", "Submission-to-decision and approval-to-disbursement times", "Period", "OWNER"),
  def("RPT-34", "Policy Exceptions", "Risk", "Approved exceptions and their performance", "Period", "OWNER, AUDITOR"),
  def("RPT-35", "Risk Grade Distribution", "Risk", "Outstanding and PAR by internal risk grade", "Date", "CREDAPPR"),
  def("RPT-36", "Vintage Analysis", "Risk", "Delinquency by disbursement cohort and months on book", "Cohorts", "OWNER"),
  def("RPT-37", "Concentration Report", "Risk", "Top borrowers, groups and guarantors exposure", "Date", "OWNER"),
  def("RPT-38", "Loan Classification and Provision (Policy-based)", "Risk", "Classification and allowance per the institution's approved policy (V-09)", "Date", "ACCT, OWNER"),
  def("RPT-39", "Large Exposure and Related-party", "Risk", "Exposures above threshold; related borrowers", "Date", "OWNER, AUDITOR"),
  def("RPT-40", "Cash-flow Forecast", "Risk", "Scheduled inflows by month vs planned disbursements", "Horizon", "OWNER, ACCT"),
  def("RPT-41", "Collateral Coverage", "Risk", "Coverage ratio per loan; expired valuations; collateral in custody", "Date", "CLTOFF, CREDAPPR"),
  def("RPT-42", "Control Exceptions", "Control", "SoD overrides, backdated payments, reversals, waivers, after-hours actions, manual journals", "Period", "AUDITOR, OWNER"),
];

export const scoped = (ctx: Ctx, rows: Row[]) => rows.filter((r) => inScope(ctx, r));

function loansFor(ctx: Ctx, p: Params) {
  const currency = p.currency || "USD";
  return scoped(ctx, table("loans")).filter((l) => l.currency === currency && (!p.branch_id || l.branch_id === p.branch_id) && (!p.product_id || l.product_id === p.product_id) && (!p.officer_id || l.officer_id === p.officer_id));
}
const activeLoans = (ctx: Ctx, p: Params) => loansFor(ctx, p).filter((l) => l.status === "ACTIVE");
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => add(s, r[key] ?? "0.00"), "0.00");
const inPeriod = (date: string, p: Params) => (!p.date_from || date >= p.date_from) && (!p.date_to || date <= p.date_to);

export function parOf(loans: Row[], n: number, asOf = today()) {
  const total = loans.reduce((s, l) => add(s, outstandingPrincipal(l, asOf)), "0.00");
  const atRisk = loans.filter((l) => dpdAsOf(l, asOf) > n).reduce((s, l) => add(s, outstandingPrincipal(l, asOf)), "0.00");
  return { total, at_risk: atRisk, par: percent(atRisk, total) };
}

/** DPD reconstructed from repayment value dates, so historical PAR is not distorted by later payments. */
function dpdAsOf(loan: Row, asOf: string): number {
  if (asOf >= today()) return dpdOf(loan, asOf);
  if (!loan.disbursed_on || loan.disbursed_on > asOf) return 0;
  const paid = new Map<number, bigint>();
  for (const r of table("repayments")) {
    if (r.loan_id !== loan.id || r.status !== "COMPLETED" || r.value_date > asOf) continue;
    for (const a of r.allocations) if (a.component === "PRINCIPAL" || a.component === "INTEREST") paid.set(a.installment_no, (paid.get(a.installment_no) ?? 0n) + toCents(a.amount));
  }
  const oldest = (activeSchedule(loan).installments as Installment[]).find((i) => i.due_date <= asOf && (paid.get(i.no) ?? 0n) < toCents(add(i.principal, i.interest)));
  return oldest && oldest.due_date < asOf ? Math.round((Date.parse(asOf) - Date.parse(oldest.due_date)) / 86_400_000) : 0;
}

function monthEnds(count: number) {
  const anchor = `${today().slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, k) => {
    const first = addMonthsAnchored(anchor, k - count + 1, 1);
    const end = addDays(addMonthsAnchored(first, 1, 1), -1);
    return { label: first.slice(0, 7), first, end: end > today() ? today() : end };
  });
}

function group(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  for (const r of rows) (map.get(key(r)) ?? map.set(key(r), []).get(key(r))!).push(r);
  return [...map.entries()];
}

function withBalances(loans: Row[]): Row[] {
  return loans.map((l) => ({ ...l, ...balances(l) }));
}

export function dashboard(ctx: Ctx, p: Params) {
  const currency = p.currency || "USD";
  const all = loansFor(ctx, p);
  const active = withBalances(all.filter((l) => l.status === "ACTIVE"));
  const periodOk = (d: string) => inPeriod(d, p);
  const disbursements = scoped(ctx, table("disbursements")).filter((d) => d.status === "CONFIRMED" && d.currency === currency && (!p.branch_id || d.branch_id === p.branch_id) && (!p.product_id || d.product_id === p.product_id));
  const repayments = scoped(ctx, table("repayments")).filter((r) => r.status === "COMPLETED" && r.currency === currency && (!p.branch_id || r.branch_id === p.branch_id) && (!p.product_id || r.product_id === p.product_id));
  const applications = scoped(ctx, table("applications")).filter((a) => (!p.branch_id || a.branch_id === p.branch_id) && (!p.product_id || a.product_id === p.product_id));
  const gross = sum(active, "outstanding_principal");
  const overdue = active.filter((l) => l.days_past_due > 0);
  const par30 = parOf(active, 30);
  const borrowers = new Set(scoped(ctx, table("borrowers")).filter((b) => b.status === "ACTIVE" && (!p.branch_id || b.branch_id === p.branch_id)).map((b) => b.id));
  const months = monthEnds(12);
  const series = months.map((m) => {
    const onBook = all.filter((l) => l.disbursed_on && l.disbursed_on <= m.end && l.status !== "WRITTEN_OFF");
    return {
      month: m.label,
      portfolio: onBook.reduce((s, l) => add(s, outstandingPrincipal(l, m.end)), "0.00"),
      disbursed: disbursements.filter((d) => d.disbursement_date >= m.first && d.disbursement_date <= m.end).reduce((s, d) => add(s, d.amount), "0.00"),
      collected: repayments.filter((r) => r.value_date >= m.first && r.value_date <= m.end).reduce((s, r) => add(s, r.amount), "0.00"),
      par30: parOf(onBook, 30, m.end).par,
      par90: parOf(onBook, 90, m.end).par,
    };
  });
  const slice = (rows: [string, Row[]][]) => rows.map(([name, list]) => ({ name, value: sum(list, "outstanding_principal"), count: list.length }));
  const statuses = group(all, (l) => l.status).map(([name, list]) => ({ name, value: String(list.length), count: list.length }));
  const bucket = ["Current", "1–30", "31–60", "61–90", "> 90"].map((name) => {
    const list = active.filter((l) => l.bucket === name);
    return { name, value: sum(list, "outstanding_principal"), count: list.length };
  });
  const recent = <T extends Row>(rows: T[], key: string, n = 6) => [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key]))).slice(0, n);
  const upcoming = active.filter((l) => l.next_payment_date).sort((a, b) => a.next_payment_date.localeCompare(b.next_payment_date)).slice(0, 6);
  return {
    as_of: today(), currency, data_note: "Demonstration data from the mock API.",
    kpis: {
      active_loans: active.length, total_borrowers: borrowers.size, gross_loan_portfolio: gross, outstanding_principal: gross,
      total_disbursed: disbursements.filter((d) => periodOk(d.disbursement_date)).reduce((s, d) => add(s, d.amount), "0.00"),
      total_collections: repayments.filter((r) => periodOk(r.value_date)).reduce((s, r) => add(s, r.amount), "0.00"),
      overdue_portfolio: sum(overdue, "amount_overdue"), overdue_loans: overdue.length, par30: par30.par, par30_at_risk: par30.at_risk,
      pending_applications: applications.filter((a) => ["SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT"].includes(a.status)).length,
      awaiting_approval: applications.filter((a) => a.status === "PENDING_APPROVAL").length,
    },
    series,
    by_product: slice(group(active, (l) => l.product_name)),
    by_branch: slice(group(active, (l) => l.branch_name)),
    by_status: statuses,
    by_bucket: bucket,
    tables: {
      applications: recent(applications, "created_at"),
      disbursements: recent(disbursements, "disbursement_date"),
      repayments: recent(repayments, "value_date"),
      upcoming,
      overdue: overdue.sort((a, b) => b.days_past_due - a.days_past_due).slice(0, 6),
      approvals: applications.filter((a) => a.status === "PENDING_APPROVAL").slice(0, 6),
      activities: scoped(ctx, table("audit_logs").map((a) => ({ ...a }))).slice(0, 7),
    },
    definitions: {
      gross_loan_portfolio: "Σ outstanding principal of ACTIVE loans. An asset balance, not profit.",
      total_disbursed: "Σ confirmed disbursements with a value date in the period, excluding reversed. A cash outflow, not revenue.",
      total_collections: "Σ completed repayments with a value date in the period, excluding reversed.",
      par30: "Outstanding principal of active loans with DPD > 30 ÷ outstanding principal of all active loans.",
      overdue_portfolio: "Σ unpaid components of installments past their payment due date.",
    },
  };
}

interface Built { columns: Col[]; rows: Row[]; totals?: Row; note?: string; definitions?: string[] }

const percentOf = (a: string, b: string) => percent(a, b);
const LOAN_COLS: Col[] = [["account_no", "Loan Account"], ["borrower_name", "Borrower"], ["branch_name", "Branch"], ["product_name", "Product"], ["status", "Status", "status"], ["outstanding_principal", "Outstanding Principal", "money"], ["days_past_due", "DPD", "number"]];
const tb = (ctx: Ctx, p: Params) => {
  const currency = p.currency || "USD";
  const posted = table("journals").filter((j) => j.currency === currency && j.status !== "PENDING_APPROVAL" && j.status !== "REJECTED" && (!p.date_to || j.accounting_date <= p.date_to));
  return table("accounts").map((a) => {
    let opening = 0n, debit = 0n, credit = 0n;
    for (const j of posted) for (const l of j.lines) {
      if (l.account_id !== a.id) continue;
      if (p.date_from && j.accounting_date < p.date_from) opening += toCents(l.debit) - toCents(l.credit);
      else { debit += toCents(l.debit); credit += toCents(l.credit); }
    }
    const closing = opening + debit - credit;
    return { code: a.code, account: a.name, account_type: a.account_type, opening: fromCents(opening), debit: fromCents(debit), credit: fromCents(credit), closing: fromCents(closing) };
  }).filter((r) => r.debit !== "0.00" || r.credit !== "0.00" || r.opening !== "0.00");
};
export const trialBalance = tb;

const builders: Record<string, (ctx: Ctx, p: Params, currency: string) => Built> = {
  "RPT-01": (c, p) => ({ columns: [["product", "Product"], ["branch", "Branch"], ["count", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => `${l.product_name}|${l.branch_name}`).map(([k, l]) => ({ product: k.split("|")[0], branch: k.split("|")[1], count: l.length, outstanding: sum(l, "outstanding_principal") })) }),
  "RPT-02": (c, p) => ({ columns: [...LOAN_COLS, ["annual_rate", "Rate %", "percent"], ["term", "Term", "number"], ["maturity_date", "Maturity", "date"]], rows: withBalances(loansFor(c, p)) }),
  "RPT-03": (c, p, cur) => ({ columns: [["disbursement_no", "Reference"], ["disbursement_date", "Date", "date"], ["loan_account_no", "Loan Account"], ["borrower_name", "Borrower"], ["method", "Method", "status"], ["amount", "Disbursed", "money"], ["fees_deducted", "Fees Deducted", "money"], ["net_disbursement", "Net Paid", "money"], ["requested_by_name", "Officer"]], rows: scoped(c, table("disbursements")).filter((d) => d.status === "CONFIRMED" && d.currency === cur && inPeriod(d.disbursement_date, p) && (!p.branch_id || d.branch_id === p.branch_id)), definitions: ["Disbursements are cash outflows, not revenue."] }),
  "RPT-04": (c, p) => ({ columns: [["month", "Month"], ["new_loans", "New Loans", "number"], ["amount", "Disbursed", "money"], ["average", "Average Size", "money"]], rows: monthEnds(12).map((m) => { const l = loansFor(c, p).filter((x) => x.disbursed_on && x.disbursed_on >= m.first && x.disbursed_on <= m.end); const amount = sum(l, "disbursed_principal"); return { month: m.label, new_loans: l.length, amount, average: l.length ? fromCents(toCents(amount) / BigInt(l.length)) : "0.00" }; }) }),
  "RPT-05": (c, p) => ({ columns: [["officer", "Loan Officer"], ["clients", "Clients", "number"], ["loans", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"], ["par30", "PAR30 %", "percent"]], rows: group(withBalances(activeLoans(c, p)), (l) => l.officer_name).map(([officer, l]) => ({ officer, clients: new Set(l.map((x) => x.borrower_id)).size, loans: l.length, outstanding: sum(l, "outstanding_principal"), par30: parOf(l, 30).par })) }),
  "RPT-06": (c, p) => { const a = withBalances(activeLoans(c, p)); const total = sum(a, "outstanding_principal"); return { columns: [["sector", "Sector"], ["purpose", "Purpose"], ["loans", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"], ["share", "Share %", "percent"]], rows: group(a, (l) => `${l.sector}|${l.purpose}`).map(([k, l]) => ({ sector: k.split("|")[0], purpose: k.split("|")[1], loans: l.length, outstanding: sum(l, "outstanding_principal"), share: percentOf(sum(l, "outstanding_principal"), total) })) }; },
  "RPT-07": (c, p) => ({ columns: [["month", "Maturity Month"], ["loans", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => l.maturity_date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])).map(([month, l]) => ({ month, loans: l.length, outstanding: sum(l, "outstanding_principal") })) }),
  "RPT-08": (c, p) => ({ columns: [...LOAN_COLS, ["restructure_count", "Modifications", "number"]], rows: withBalances(loansFor(c, p).filter((l) => l.restructure_count > 0)) }),
  "RPT-09": (c, p) => ({ columns: [["account_no", "Loan Account"], ["borrower_name", "Borrower"], ["closure_type", "Closure Type"], ["closed_on", "Closed On", "date"], ["contractual_principal", "Principal", "money"]], rows: loansFor(c, p).filter((l) => l.status.startsWith("CLOSED")) }),
  "RPT-10": (c, p) => { const loan = table("loans").find((l) => l.id === p.loan_id) ?? activeLoans(c, p)[0]; return { columns: [["posting_date", "Posted", "date"], ["value_date", "Value Date", "date"], ["txn_type", "Type", "status"], ["component", "Component", "status"], ["amount", "Amount", "money"], ["source_document", "Source"]], rows: loan ? loan.transactions : [], note: loan ? `Loan ${loan.account_no} — ${loan.borrower_name}. Use the loan_id parameter for another loan.` : "No loan in scope." }; },
  "RPT-11": (c, p) => { const loan = table("loans").find((l) => l.id === p.loan_id) ?? activeLoans(c, p)[0]; return { columns: [["no", "#", "number"], ["due_date", "Due Date", "date"], ["scheduled", "Scheduled", "money"], ["received", "Received", "money"], ["status", "Status", "status"]], rows: loan ? (activeSchedule(loan).installments as Installment[]).map((i) => ({ no: i.no, due_date: i.due_date, scheduled: i.total, received: add(i.principal_paid, i.interest_paid), status: i.status })) : [], note: loan ? `Loan ${loan.account_no}.` : "" }; },
  "RPT-12": (c, p, cur) => { const date = p.date_to || today(); return { columns: [["receipt_no", "Receipt"], ["value_date", "Date", "date"], ["cashier_name", "Cashier"], ["method", "Method", "status"], ["amount", "Amount", "money"], ["status", "Status", "status"]], rows: scoped(c, table("repayments")).filter((r) => r.currency === cur && (p.date_to ? inPeriod(r.value_date, p) : r.value_date === date)) }; },
  "RPT-13": (c, p) => { const to = p.date_to || addDays(today(), 30), from = p.date_from || today(); return { columns: [["account_no", "Loan Account"], ["borrower_name", "Borrower"], ["officer_name", "Officer"], ["no", "#", "number"], ["payment_due_date", "Due Date", "date"], ["amount", "Amount", "money"]], rows: activeLoans(c, p).flatMap((l) => (activeSchedule(l).installments as Installment[]).filter((i) => i.payment_due_date >= from && i.payment_due_date <= to).map((i) => ({ account_no: l.account_no, borrower_name: l.borrower_name, officer_name: l.officer_name, no: i.no, payment_due_date: i.payment_due_date, amount: i.total }))) }; },
  "RPT-14": (c, p) => ({ columns: [["account_no", "Loan Account"], ["borrower_name", "Borrower"], ["days_past_due", "DPD", "number"], ["bucket", "Bucket"], ["amount_overdue", "Overdue Amount", "money"], ["outstanding_principal", "Outstanding Principal", "money"], ["collection_officer_name", "Collection Officer"]], rows: withBalances(activeLoans(c, p)).filter((l) => l.days_past_due > 0).sort((a, b) => b.days_past_due - a.days_past_due) }),
  "RPT-15": (c, p) => { const a = withBalances(activeLoans(c, p)); const total = sum(a, "outstanding_principal"); return { columns: [["bucket", "Bucket"], ["loans", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"], ["share", "Share %", "percent"]], rows: ["Current", "1–30", "31–60", "61–90", "> 90"].map((bucket) => { const l = a.filter((x) => x.bucket === bucket); return { bucket, loans: l.length, outstanding: sum(l, "outstanding_principal"), share: percentOf(sum(l, "outstanding_principal"), total) }; }) }; },
  "RPT-16": (c, p) => { const from = p.date_from || `${today().slice(0, 7)}-01`, to = p.date_to || today(); return { columns: [["branch", "Branch"], ["expected", "Expected", "money"], ["collected", "Collected", "money"], ["rate", "Collection Rate %", "percent"]], rows: group(activeLoans(c, p), (l) => l.branch_name).map(([branch, list]) => { let expected = "0.00", collected = "0.00"; for (const l of list) for (const i of activeSchedule(l).installments as Installment[]) if (i.payment_due_date >= from && i.payment_due_date <= to) { expected = add(expected, add(i.principal, i.interest)); collected = add(collected, add(i.principal_paid, i.interest_paid)); } return { branch, expected, collected, rate: percentOf(collected, expected) }; }), definitions: ["Collection rate = amount collected against amounts due in the period ÷ amounts due in the period (current due only)."] }; },
  "RPT-17": (c, p) => { const row = (name: string, l: Row[]) => ({ scope: name, outstanding: parOf(l, 0).total, par1: parOf(l, 0).par, par7: parOf(l, 7).par, par30: parOf(l, 30).par, par60: parOf(l, 60).par, par90: parOf(l, 90).par }); const a = activeLoans(c, p); return { columns: [["scope", "Scope"], ["outstanding", "Outstanding Principal", "money"], ["par1", "PAR1 %", "percent"], ["par7", "PAR7 %", "percent"], ["par30", "PAR30 %", "percent"], ["par60", "PAR60 %", "percent"], ["par90", "PAR90 %", "percent"]], rows: [row("Total portfolio", a), ...group(a, (l) => `Branch: ${l.branch_name}`).map(([n, l]) => row(n, l)), ...group(a, (l) => `Product: ${l.product_name}`).map(([n, l]) => row(n, l))], definitions: ["PAR(n) = outstanding principal of active loans with DPD > n ÷ outstanding principal of all active loans. Written-off loans are excluded."] }; },
  "RPT-18": (c) => ({ columns: [["loan_account_no", "Loan Account"], ["borrower_name", "Borrower"], ["promise_date", "Promise Date", "date"], ["promised_amount", "Promised Amount", "money"], ["status", "Status", "status"], ["officer_name", "Officer"]], rows: scoped(c, table("promises")) }),
  "RPT-19": (c) => ({ columns: [["contact_time", "Contact Time", "datetime"], ["loan_account_no", "Loan Account"], ["borrower_name", "Borrower"], ["officer_name", "Officer"], ["channel", "Channel"], ["outcome", "Outcome"]], rows: scoped(c, table("collection_activities")) }),
  "RPT-20": (c, p) => { const to = p.date_to || today(), from = p.date_from || addDays(to, -30); const buckets = ["Current", "1–30", "31–60", "61–90", "> 90"]; const a = activeLoans(c, p).filter((l) => l.disbursed_on <= from); return { columns: [["from_bucket", "From Bucket"], ...buckets.map((b): Col => [b, `To ${b}`, "money"])], rows: buckets.map((b) => ({ from_bucket: b, ...Object.fromEntries(buckets.map((t) => [t, a.filter((l) => bucketOf(dpdAsOf(l, from)) === b && bucketOf(dpdAsOf(l, to)) === t).reduce((s, l) => add(s, outstandingPrincipal(l, to)), "0.00")])) })), note: `Movement from ${from} to ${to}.` }; },
  "RPT-21": (c, p) => ({ columns: [["code", "Code"], ["account", "Account"], ["account_type", "Type", "status"], ["opening", "Opening", "money"], ["debit", "Debit", "money"], ["credit", "Credit", "money"], ["closing", "Closing", "money"]], rows: tb(c, p) }),
  "RPT-22": (_c, p, cur) => ({ columns: [["accounting_date", "Date", "date"], ["journal_no", "Journal"], ["account_code", "Account"], ["account_name", "Name"], ["description", "Description"], ["debit", "Debit", "money"], ["credit", "Credit", "money"]], rows: table("journals").filter((j) => j.currency === cur && j.status !== "PENDING_APPROVAL" && inPeriod(j.accounting_date, p)).flatMap((j) => j.lines.map((l: Row) => ({ ...l, accounting_date: j.accounting_date, journal_no: j.journal_no, description: j.description }))) }),
  "RPT-23": (_c, p, cur) => ({ columns: [["journal_no", "Journal"], ["accounting_date", "Date", "date"], ["source_type", "Source", "status"], ["description", "Description"], ["total_debit", "Debit", "money"], ["total_credit", "Credit", "money"], ["status", "Status", "status"]], rows: table("journals").filter((j) => j.currency === cur && inPeriod(j.accounting_date, p)) }),
  "RPT-24": (c, p) => { const rows = tb(c, p).filter((r) => ["REVENUE", "EXPENSE"].includes(r.account_type)).map((r) => ({ ...r, amount: r.account_type === "REVENUE" ? sub(r.credit, r.debit) : sub(r.debit, r.credit) })); const income = sum(rows.filter((r) => r.account_type === "REVENUE"), "amount"), expense = sum(rows.filter((r) => r.account_type === "EXPENSE"), "amount"); return { columns: [["code", "Code"], ["account", "Account"], ["account_type", "Type", "status"], ["amount", "Amount", "money"]], rows: [...rows, { code: "", account: "Net result", account_type: "", amount: sub(income, expense) }], definitions: ["Management report. Recognition policy to be confirmed by a qualified accountant (V-10)."] }; },
  "RPT-25": (c, p) => ({ columns: [["code", "Code"], ["account", "Account"], ["account_type", "Type", "status"], ["closing", "Closing Balance", "money"]], rows: tb(c, p).filter((r) => ["ASSET", "CONTRA_ASSET", "LIABILITY", "EQUITY"].includes(r.account_type)), definitions: ["Management report, not a statutory financial statement."] }),
  "RPT-26": (c, p) => ({ columns: [["product", "Product"], ["accrued", "Accrued (Not Yet Due)", "money"], ["due", "Due (Billed)", "money"], ["collected", "Collected", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => l.product_name).map(([product, l]) => ({ product, accrued: sum(l, "interest_accrued"), due: sum(l, "interest_due"), collected: sum(l, "interest_paid") })) }),
  "RPT-27": (c, _p, cur) => ({ columns: [["kind", "Kind", "status"], ["status", "Status", "status"], ["count", "Items", "number"], ["amount", "Amount", "money"]], rows: group(scoped(c, table("fee_transactions")).filter((f) => f.currency === cur), (f) => `${f.kind}|${f.status}`).map(([k, l]) => ({ kind: k.split("|")[0], status: k.split("|")[1], count: l.length, amount: sum(l, "amount") })) }),
  "RPT-28": (c, p, cur) => { const a = withBalances(loansFor(c, { ...p, currency: cur }).filter((l) => l.status === "ACTIVE")); const closing = (code: string) => tb(c, { currency: cur }).find((r) => r.code === code)?.closing ?? "0.00"; const row = (component: string, loan: string, gl: string) => ({ component, loan_ledger: loan, general_ledger: gl, difference: sub(loan, gl), status: cmp(loan, gl) === 0 ? "RECONCILED" : "DIFFERENCE" }); return { columns: [["component", "Component"], ["loan_ledger", "Loan Ledger", "money"], ["general_ledger", "General Ledger", "money"], ["difference", "Difference", "money"], ["status", "Status", "status"]], rows: [row("Outstanding principal", sum(a, "outstanding_principal"), closing("1100"))], note: "Written-off and closed loans can create differences in demonstration data because the mock does not post write-off journals for seeded loans." }; },
  "RPT-29": (c) => ({ columns: [["account", "Account"], ["type", "Type", "status"], ["period", "Period"], ["statement_balance", "Statement", "money"], ["ledger_balance", "Ledger", "money"], ["difference", "Difference", "money"], ["status", "Status", "status"]], rows: scoped(c, table("reconciliations")) }),
  "RPT-30": (c, p) => ({ columns: [["account_no", "Loan Account"], ["borrower_name", "Borrower"], ["outstanding_principal", "Written-off Principal", "money"], ["days_past_due", "DPD", "number"]], rows: withBalances(loansFor(c, p).filter((l) => l.status === "WRITTEN_OFF")) }),
  "RPT-31": (c) => ({ columns: [["status", "Status", "status"], ["count", "Applications", "number"]], rows: group(scoped(c, table("applications")), (a) => a.status).map(([status, l]) => ({ status, count: l.length })) }),
  "RPT-32": (c) => { const d = scoped(c, table("applications")).filter((a) => ["APPROVED", "REJECTED"].includes(a.status)); return { columns: [["reference", "Reference"], ["borrower_name", "Borrower"], ["status", "Decision", "status"], ["requested_amount", "Amount", "money"]], rows: d, note: `Approval rate: ${percent(`${d.filter((a) => a.status === "APPROVED").length}.00`, `${d.length}.00`)} % of decided applications.` }; },
  "RPT-33": (c) => ({ columns: [["reference", "Reference"], ["borrower_name", "Borrower"], ["submitted_at", "Submitted", "datetime"], ["status", "Status", "status"]], rows: scoped(c, table("applications")).filter((a) => a.submitted_at) }),
  "RPT-34": (c) => ({ columns: [["reference", "Reference"], ["borrower_name", "Borrower"], ["exception", "Exception"], ["approved", "Approved"]], rows: scoped(c, table("applications")).flatMap((a) => a.policy_exceptions.map((e: Row) => ({ reference: a.reference, borrower_name: a.borrower_name, exception: e.type, approved: e.approved ? "Yes" : "No" }))) }),
  "RPT-35": (c) => ({ columns: [["grade", "Risk Grade"], ["count", "Applications", "number"]], rows: group(scoped(c, table("applications")).filter((a) => a.assessment), (a) => a.assessment.risk_grade).map(([grade, l]) => ({ grade, count: l.length })) }),
  "RPT-36": (c, p) => ({ columns: [["cohort", "Disbursement Cohort"], ["loans", "Loans", "number"], ["disbursed", "Disbursed", "money"], ["par30", "PAR30 %", "percent"]], rows: group(activeLoans(c, p), (l) => l.disbursed_on.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])).map(([cohort, l]) => ({ cohort, loans: l.length, disbursed: sum(l, "disbursed_principal"), par30: parOf(l, 30).par })) }),
  "RPT-37": (c, p) => ({ columns: [["borrower", "Borrower"], ["loans", "Loans", "number"], ["exposure", "Exposure", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => l.borrower_name).map(([borrower, l]) => ({ borrower, loans: l.length, exposure: sum(l, "outstanding_principal") })).sort((a, b) => cmp(b.exposure, a.exposure)).slice(0, 20) }),
  "RPT-38": (c, p) => ({ columns: [["classification", "Classification (Illustrative)"], ["loans", "Loans", "number"], ["outstanding", "Outstanding Principal", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => parClass(l.days_past_due)).map(([classification, l]) => ({ classification, loans: l.length, outstanding: sum(l, "outstanding_principal") })), note: "Operational DPD grouping only. Regulatory classification and provisioning are not implemented until V-09 is verified." }),
  "RPT-39": (c, p) => ({ columns: [["borrower", "Borrower"], ["exposure", "Exposure", "money"]], rows: group(withBalances(activeLoans(c, p)), (l) => l.borrower_name).map(([borrower, l]) => ({ borrower, exposure: sum(l, "outstanding_principal") })).filter((r) => isPositive(sub(r.exposure, "5000.00"))), note: "Demonstration threshold: above 5,000.00. The institution's threshold is configuration." }),
  "RPT-40": (c, p) => ({ columns: [["month", "Month"], ["scheduled_inflow", "Scheduled Inflow", "money"]], rows: group(activeLoans(c, p).flatMap((l) => (activeSchedule(l).installments as Installment[]).filter((i) => i.due_date >= today()).map((i) => ({ month: i.due_date.slice(0, 7), total: i.total }))), (r) => r.month).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 12).map(([month, l]) => ({ month, scheduled_inflow: sum(l, "total") })) }),
  "RPT-41": (c) => ({ columns: [["reference", "Collateral"], ["loan_account_no", "Loan Account"], ["accepted_value", "Accepted Value", "money"], ["outstanding", "Outstanding Principal", "money"], ["coverage", "Coverage %", "percent"], ["valuation_date", "Valuation Date", "date"]], rows: scoped(c, table("collateral")).map((x) => { const loan = table("loans").find((l) => l.id === x.loan_id); const outstanding = loan ? outstandingPrincipal(loan) : "0.00"; return { ...x, outstanding, coverage: percentOf(x.accepted_value, outstanding) }; }) }),
  "RPT-42": (c) => ({ columns: [["at", "Date and Time", "datetime"], ["type", "Exception"], ["reference", "Reference"], ["user", "User"], ["detail", "Detail"], ["severity", "Severity", "status"], ["status", "Status", "status"]], rows: scoped(c, table("control_exceptions")) }),
};

export function runReport(ctx: Ctx, code: string, p: Params) {
  const report = REPORTS.find((r) => r.code === code);
  if (!report) return null;
  const currency = p.currency || "USD";
  let built = builders[code](ctx, p, currency);
  if (p.search) {
    const q = p.search.toLowerCase();
    built = { ...built, rows: built.rows.filter((r) => built.columns.some(([k]) => String(r[k] ?? "").toLowerCase().includes(q))) };
  }
  return {
    report, currency, parameters: p, generated_at: new Date().toISOString(), data_cut_off: p.date_to || today(), label: "Management report — not a regulatory report",
    columns: built.columns.map(([key, label, type]) => ({ key, label, type: type ?? "text" })),
    rows: built.rows.map((r) => Object.fromEntries(built.columns.map(([k]) => [k, r[k] ?? null]))), note: built.note ?? null, definitions: built.definitions ?? [],
  };
}
