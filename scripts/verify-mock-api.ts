/**
 * End-to-end check of the demonstration API against SRS acceptance tests.
 * Run: npm run verify:api
 */
import { handle } from "../src/mocks/server/router";

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  if (!ok) console.log(`FAIL  ${name}`, detail ?? "");
}
function call(user: string, method: string, path: string, body: Body = {}, key?: string) {
  const [p, qs] = path.split("?");
  const headers = new Headers({ authorization: `Bearer mock.${user}` });
  if (key) headers.set("idempotency-key", key);
  const r = handle(method, p.split("/").filter(Boolean), Object.fromEntries(new URLSearchParams(qs)), body, headers, "127.0.0.1");
  return { status: r.status, body: r.body as Body };
}
const get = (u: string, p: string) => call(u, "GET", p);
const post = (u: string, p: string, b: Body = {}, k?: string) => call(u, "POST", p, b, k);
const expectCode = (name: string, r: { status: number; body: Body }, status: number, code?: string) => check(name, r.status === status && (!code || r.body.code === code), r);

// Auth and RBAC
const denied = handle("GET", ["loans"], {}, {}, new Headers(), "x");
check("Unauthenticated requests get 401", denied.status === 401);
expectCode("AT-AUTH-03 administrator cannot record repayment", post("sysadmin", "/loans/ln-1/repayments", { amount: "10.00", method: "CASH" }), 403, "FORBIDDEN");
const pp1 = get("loanoff", "/borrowers?limit=200").body.items as Body[];
check("Branch scope filters borrowers", pp1.every((b) => b.branch_id === "br-pp1") && pp1.length > 0);
const other = (get("owner", "/loans?limit=200").body.items as Body[]).find((l) => l.branch_id !== "br-pp1")!;
expectCode("AT-AUTH-01 out-of-branch loan returns 404", get("loanoff", `/loans/${other.id}`), 404, "NOT_FOUND");
check("AT-BOR-02 ID numbers are masked in lists", String(pp1[0].id_number).startsWith("••••") && !("id_number_full" in pp1[0]));

const searched = get("loanoff", "/borrowers?search=Sok&limit=200").body.items as Body[];
check("Search matches the record, not the handling officer", searched.length > 0 && searched.every((b) => /sok/i.test(`${b.name_en} ${b.name_km} ${b.customer_code}`)), searched.map((b) => b.name_en));

// Borrower duplicate (AT-BOR-01)
const dup = post("loanoff", "/borrowers", { type: "INDIVIDUAL", name_en: "Test Person", id_type: "National ID", id_number: "X99", phone: pp1[0].phone, date_of_birth: "1990-01-01" });
expectCode("AT-BOR-01 duplicate phone warned", dup, 409, "POSSIBLE_DUPLICATE");
check("Duplicate response lists candidates", (dup.body.candidates as Body[]).length > 0);
const borrower = post("loanoff", "/borrowers", { type: "INDIVIDUAL", name_en: "Lifecycle Test", name_km: "សាកល្បង", id_type: "National ID", id_number: "LIFE-1", phone: "+855 12 111 222", date_of_birth: "1990-01-01", monthly_income: "800.00", address: { village: "V", commune: "C", district: "D", province: "Phnom Penh" } }).body;
check("Customer code generated", /^C-\d{5}$/.test(borrower.customer_code), borrower);

// Products (AT-PRD-02, BR-PRD-002)
expectCode("AT-PRD-02 invalid combination rejected", post("owner", "/products", { code: "BAD", name_en: "x", name_km: "x", product_type: "PERSONAL", currency: "USD", min_principal: "100.00", max_principal: "500.00", min_term: 3, max_term: 6, interest_method: "FLAT", amortisation: "EQUAL_PRINCIPAL", annual_rate: "20", day_count: "30/360", repayment_frequency: "MONTHLY" }), 422, "UNSUPPORTED_METHOD_COMBINATION");
expectCode("Active version cannot be edited", call("owner", "PATCH", "/products/prd-psl/versions/1", { annual_rate: "99" }), 409, "PRODUCT_VERSION_IMMUTABLE");
expectCode("Product version self-approval blocked", post("brmgr", "/products/prd-psl/versions/2/approve"), 403);

// Application lifecycle
expectCode("AT-APP-01 amount above product limit", post("loanoff", "/applications", { borrower_id: borrower.id, product_id: "prd-psl", requested_amount: "6000.00", term: 12, purpose: "x" }), 422, "AMOUNT_OUT_OF_RANGE");
const app = post("loanoff", "/applications", { borrower_id: borrower.id, product_id: "prd-psl", requested_amount: "1200.00", term: 12, purpose: "Stock", uploaded_documents: ["National ID", "Proof of residence"] }).body;
check("Application starts in Draft", app.status === "DRAFT");
post("loanoff", `/applications/${app.id}/submit`);
check("Reference assigned on submit", /^APP-/.test(get("loanoff", `/applications/${app.id}`).body.reference));
expectCode("Invalid transition returns 409", post("brmgr", `/applications/${app.id}/complete-review`), 409, "INVALID_STATE");
post("brmgr", `/applications/${app.id}/start-review`);
expectCode("AT-APP-02 missing documents block assessment", post("brmgr", `/applications/${app.id}/complete-review`), 422, "MISSING_REQUIRED_DOCUMENTS");
post("loanoff", `/applications/${app.id}/mark-document`, { name: "Income evidence", file_name: "i.pdf" });
post("brmgr", `/applications/${app.id}/complete-review`);
const assessed = post("cranalyst", `/applications/${app.id}/assessment`, { verified_income: "800.00", verified_expenses: "200.00", existing_installments: "150.00", risk_grade: "B", recommendation: "APPROVE", rationale: "OK" }).body;
check("AT-CRA-03 DSR 260.02 ÷ 800 = 32.50 %", assessed.assessment?.dsr_percent === "32.50", assessed.assessment);
check("Proposed installment from engine is 110.02", assessed.assessment?.proposed_installment === "110.02");
expectCode("AT-AUTH-02 creator cannot approve", post("loanoff", `/applications/${app.id}/approve`), 403);
const approved = post("credappr", `/applications/${app.id}/approve`, { reason: "OK" }, "appr-1").body;
check("Approval creates loan in Pending Acceptance", Boolean(approved.loan_id), approved);
const loanId = approved.loan_id as string;
check("Loan status", get("owner", `/loans/${loanId}`).body.status === "PENDING_ACCEPTANCE");

// Escalation (AT-CRA-01)
const big = (get("owner", "/applications?status=PENDING_APPROVAL&limit=50").body.items as Body[]).find((a) => Number(a.requested_amount) > 5000);
if (big) { const r = post("credappr", `/applications/${big.id}/approve`, { reason: "x" }); check("AT-CRA-01 above-limit approval escalates", r.body.escalated === true && r.body.status === "PENDING_APPROVAL", r.body); }

// Agreement
const agr = post("loanoff", "/agreements", { loan_id: loanId, language: "BILINGUAL" }).body;
post("loanoff", `/agreements/${agr.id}/execute`, { file_name: "signed.pdf", signed_at: "2026-01-01" });
check("Executed agreement has SHA-256 hash", /^[a-f0-9]{64}$/.test(get("owner", `/agreements/${agr.id}`).body.sha256));
expectCode("AT-AGR-01 executed agreement cannot be replaced", post("loanoff", `/agreements/${agr.id}/execute`, { file_name: "other.pdf" }), 409, "EXECUTED_DOCUMENT_IMMUTABLE");
check("Loan accepted after execution", get("owner", `/loans/${loanId}`).body.status === "ACCEPTED");

// Disbursement (AT-DISB-*)
const disb = post("loanoff", `/loans/${loanId}/disbursements`, { method: "CASH", cash_bank_account: "Teller" }, "d-1").body;
check("AT-DISB-04 fee 24.00, net 1176.00", disb.fees_deducted === "24.00" && disb.net_disbursement === "1176.00", disb);
check("Duplicate key returns original", post("loanoff", `/loans/${loanId}/disbursements`, { method: "CASH", cash_bank_account: "Teller" }, "d-1").body.id === disb.id);
expectCode("Same key, different body conflicts", post("loanoff", `/loans/${loanId}/disbursements`, { method: "BANK", cash_bank_account: "x" }, "d-1"), 409, "IDEMPOTENCY_CONFLICT");
expectCode("Requester cannot authorise", post("loanoff", `/disbursements/${disb.id}/authorise`), 403);
post("brmgr", `/disbursements/${disb.id}/authorise`, {}, "d-2");
expectCode("Requested disbursement cannot be confirmed by non-cashier", post("loanoff", `/disbursements/${disb.id}/confirm`), 403);
post("cashier", `/disbursements/${disb.id}/confirm`, {}, "d-3");
const active = get("cashier", `/loans/${loanId}`).body;
check("AT-DISB-04 outstanding principal 1200.00; loan Active", active.status === "ACTIVE" && active.outstanding_principal === "1200.00", active);
const je = (get("acct", "/accounting/journals?limit=200").body.items as Body[]).find((j) => j.source_id === disb.id)!;
check("TC-DISB-001 journal Dr 1100 / Cr cash 1176 / Cr fee 24", je.total_debit === "1200.00" && je.lines.some((l: Body) => l.account_code === "4100" && l.credit === "24.00"), je);
expectCode("AT-DISB-01 further disbursement rejected", post("loanoff", `/loans/${loanId}/disbursements`, { amount: "100.00" }), 409, "INVALID_STATE");
expectCode("AT-CALC-04 schedule regeneration locked after payment", (() => { post("cashier", `/loans/ln-1/repayments`, { amount: "1.00", method: "CASH", value_date: "2099-01-01" }); return post("loanoff", "/loans/ln-1/schedule/regenerate"); })(), 409, "SCHEDULE_LOCKED");

// Repayment and reversal on an overdue seeded loan
const overdue = (get("cashier", "/collections/overdue?limit=100").body.items as Body[] | undefined) ?? [];
expectCode("Cashier has no collections permission", get("cashier", "/collections/overdue"), 403);
void overdue;
const late = (get("owner", "/collections/overdue?limit=100").body.items as Body[]).find((l) => l.branch_id === "br-pp1" && l.currency === "USD")!;
const preview = post("cashier", `/loans/${late.id}/repayments/preview`, { amount: "5.00", value_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(new Date()), method: "CASH" }).body;
check("Waterfall allocates penalties first", preview.allocations?.[0]?.component === "PENALTY", preview);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(new Date());
expectCode("TC-PAY-007 backdating beyond window blocked", post("cashier", `/loans/${late.id}/repayments`, { amount: "5.00", method: "CASH", value_date: "2020-01-01" }, "b-1"), 403, "BACKDATE_APPROVAL_REQUIRED");
const before = get("owner", `/loans/${late.id}`).body;
const rep = post("cashier", `/loans/${late.id}/repayments`, { amount: "5.00", method: "CASH", value_date: today }, "p-1");
check("Repayment recorded with receipt", rep.status === 201 && /-R-/.test(rep.body.receipt_no), rep);
check("TC-PAY-003 idempotent replay", post("cashier", `/loans/${late.id}/repayments`, { amount: "5.00", method: "CASH", value_date: today }, "p-1").body.id === rep.body.id);
expectCode("Reversal needs reason", post("acct", `/repayments/${rep.body.id}/reversal-requests`, { reason_code: "OTHER", reason: " " }), 422);
const req = post("acct", `/repayments/${rep.body.id}/reversal-requests`, { reason_code: "OTHER", reason: "Test" }).body;
expectCode("Cashier cannot approve reversal", post("cashier", `/reversal-requests/${req.id}/approve`), 403);
post("brmgr", `/reversal-requests/${req.id}/approve`, { comment: "ok" });
const reversed = get("owner", `/repayments/${rep.body.id}`).body;
check("AT-PAY-04 original kept as Reversed", reversed.status === "REVERSED", reversed);
const after = get("owner", `/loans/${late.id}`).body;
check("Reversal restores penalties and DPD", after.penalties_due === before.penalties_due && after.days_past_due === before.days_past_due, { before: before.penalties_due, after: after.penalties_due });

// Settlement, closure, collateral
expectCode("AT-CLS-02 closure with balance rejected", post("cashier", `/loans/${late.id}/close`), 409, "OUTSTANDING_OBLIGATIONS");
const pledged = (get("cltoff", "/collateral?status=PLEDGED&limit=50").body.items as Body[]).find((c) => c.loan_id);
if (pledged) expectCode("AT-CLT-01 release blocked while obligations remain", post("cltoff", `/collateral/${pledged.id}/release`), 409, "OBLIGATIONS_OUTSTANDING");
const quote = post("cashier", `/loans/${loanId}/settlement-quotes`, { settlement_date: today }).body;
check("Settlement quote total present", quote.total_settlement_amount === "1200.00", quote);
post("cashier", `/settlements/${quote.id}/pay`, { method: "CASH" }, "s-1");
check("Settled loan closed", get("owner", `/loans/${loanId}`).body.status === "CLOSED_EARLY_SETTLEMENT");

// Accounting
const unbalanced = post("acct", "/accounting/journals", { description: "x", accounting_date: today, currency: "USD", lines: [{ account_code: "1000", debit: "100.00" }, { account_code: "2000", credit: "99.99" }] });
expectCode("AT-ACC-02 unbalanced journal rejected", unbalanced, 422, "UNBALANCED_JOURNAL");
const manual = post("acct", "/accounting/journals", { description: "x", accounting_date: today, currency: "USD", lines: [{ account_code: "1000", debit: "100.00" }, { account_code: "2000", credit: "100.00" }] }).body;
expectCode("Accountant lacks approval permission", post("acct", `/accounting/journals/${manual.id}/approve`), 403);
post("owner", `/accounting/journals/${manual.id}/approve`);
expectCode("Posted journals cannot be patched", call("acct", "PATCH", `/accounting/journals/${manual.id}`, { description: "edit" }), 404, "NOT_FOUND");
const tb = get("acct", "/accounting/trial-balance?currency=USD").body;
check("Trial balance debits equal credits", tb.total_debit === tb.total_credit, tb.total_debit);
check("Every posted journal balances", (get("acct", "/accounting/journals?limit=200").body.items as Body[]).every((j) => j.total_debit === j.total_credit));
const closed = (get("acct", "/accounting/periods?limit=20").body.items as Body[]).find((p) => p.status === "CLOSED")!;
expectCode("Closed period rejects journal", post("acct", "/accounting/journals", { description: "x", accounting_date: closed.start_date, currency: "USD", lines: [{ account_code: "1000", debit: "1.00" }, { account_code: "2000", credit: "1.00" }] }), 409, "PERIOD_CLOSED");

// Partial prepayment (FR-CLS-004)
const allLoans = get("owner", "/loans?status=ACTIVE&limit=200").body.items as Body[];
const pre = allLoans.find((l) => l.branch_id === "br-pp1" && l.currency === "USD" && l.product_code === "PSL" && l.days_past_due === 0 && l.total_due_today === "0.00" && Number(l.outstanding_principal) > 100)!;
const prePath = `/loans/${pre.id}/prepayments`;
const preBody = { amount: "50.00", value_date: today, option: "REDUCE_TERM", method: "CASH" };
const v1 = (get("owner", `/loans/${pre.id}/schedule`).body as Body);
const plan = post("loanoff", `${prePath}/preview`, preBody).body;
check("Prepayment preview is available to loan officers", Boolean(plan.proposed_installments?.length), plan);
check("Reduce term keeps the installment and does not lengthen the schedule", plan.proposed.remaining_installments <= plan.existing.remaining_installments && plan.proposed.installment === plan.existing.installment, plan.proposed);
const c2 = (v: string) => BigInt(v.replace(".", ""));
check("Revised principal sums to the new balance", plan.proposed_installments.reduce((s: bigint, r: Body) => s + c2(r.principal), BigInt(0)) === c2(plan.new_principal), plan.new_principal);
const inst = post("loanoff", `${prePath}/preview`, { ...preBody, option: "REDUCE_INSTALLMENT" }).body;
check("Reduce installment keeps the count and lowers the installment", inst.proposed.remaining_installments === inst.existing.remaining_installments && c2(inst.proposed.installment) < c2(inst.existing.installment), inst.proposed);
expectCode("Loan officer cannot record a prepayment", post("loanoff", prePath, preBody, "pp-0"), 403, "FORBIDDEN");
expectCode("Full amount must use settlement", post("cashier", `${prePath}/preview`, { ...preBody, amount: pre.outstanding_principal }), 422, "USE_FULL_SETTLEMENT");
expectCode("Overdue amounts block prepayment", post("cashier", `/loans/${late.id}/prepayments/preview`, preBody), 409, "AMOUNTS_DUE_OUTSTANDING");
const flat = allLoans.find((l) => l.product_code === "EMP" && l.days_past_due === 0 && l.total_due_today === "0.00");
if (flat) expectCode("Flat-rate loans need a contractual rule", post("owner", `/loans/${flat.id}/prepayments/preview`, preBody), 422, "UNSUPPORTED_PREPAYMENT_METHOD");
const done = post("cashier", prePath, preBody, "pp-1");
check("Prepayment recorded with receipt", done.status === 201 && done.body.kind === "PREPAYMENT", done);
check("Prepayment is idempotent", post("cashier", prePath, preBody, "pp-1").body.id === done.body.id);
const afterPre = get("owner", `/loans/${pre.id}`).body;
check("Outstanding principal falls by the prepayment", c2(pre.outstanding_principal) - c2(afterPre.outstanding_principal) === c2("50.00"), afterPre.outstanding_principal);
const v2 = get("owner", `/loans/${pre.id}/schedule`).body;
check("Prepayment creates a new active schedule version", v2.version_no === v1.version_no + 1 && v2.reason === "PREPAYMENT" && v2.status === "ACTIVE", v2.version_no);
check("Earlier schedule version stays readable and superseded", get("owner", `/loans/${pre.id}/schedule?version=${v1.version_no}`).body.status === "SUPERSEDED");
const preJournal = (get("acct", "/accounting/journals?limit=200").body.items as Body[]).find((j) => j.source_id === done.body.id)!;
check("Prepayment journal is Dr cash, Cr loans receivable", preJournal.lines.some((l: Body) => l.account_code === "1000" && l.debit === "50.00") && preJournal.lines.some((l: Body) => l.account_code === "1100" && l.credit === "50.00"), preJournal.lines);
const preRev = post("acct", `/repayments/${done.body.id}/reversal-requests`, { reason_code: "OTHER", reason: "Test" }).body;
post("brmgr", `/reversal-requests/${preRev.id}/approve`, {});
const undone = get("owner", `/loans/${pre.id}`).body;
check("Reversal restores outstanding principal", undone.outstanding_principal === pre.outstanding_principal, undone.outstanding_principal);
const v3 = get("owner", `/loans/${pre.id}/schedule`).body;
check("Reversal reinstates the schedule as a new version", v3.version_no === v2.version_no + 1 && v3.reason === "PREPAYMENT_REVERSAL" && v3.installments.length === v1.installments.length && v3.installments[v3.installments.length - 1].total === v1.installments[v1.installments.length - 1].total, v3.version_no);

// Reports and audit
const dash = get("owner", "/dashboards/management?currency=USD").body;
const par = get("owner", "/reports/RPT-17?currency=USD").body;
check("AT-DSH-01 dashboard PAR30 equals RPT-17", dash.kpis.par30 === par.rows[0].par30, { d: dash.kpis.par30, r: par.rows[0].par30 });
const codes = (get("owner", "/reports").body.items as Body[]);
check("Owner sees all 42 reports", codes.length === 42, codes.length);
const errors = codes.filter((r) => get("owner", `/reports/${r.code}`).status !== 200);
check("Every report runs", errors.length === 0, errors.map((e) => e.code));
expectCode("Report access restricted by role", get("cashier", "/reports/RPT-24"), 403);
check("Audit trail records financial events", (get("auditor", "/audit-logs?financial=true&limit=5").body.total as number) > 0);
expectCode("Audit logs cannot be written", call("auditor", "PATCH", "/audit-logs/x", {}), 404);
expectCode("Contact outside allowed hours rejected", post("colloff", "/collections/activities", { loan_id: late.id, channel: "Phone", person_reached: "Borrower", outcome: "x", notes: "n", contact_time: "2026-01-01T23:30:00+07:00" }), 422, "CONTACT_NOT_ALLOWED");
expectCode("Self-grant rejected", post("sysadmin", "/users/sysadmin/grant", { roles: ["CASHIER"] }), 403, "SOD_VIOLATION");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
