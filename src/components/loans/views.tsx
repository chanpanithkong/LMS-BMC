"use client";
import { useQuery } from "@tanstack/react-query";
import { Ban, Banknote, Calendar, Eye, FileText, Printer, Receipt, ScrollText, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { DatePicker, DateRangePicker } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatusBadge, statusLabel } from "@/components/shared/display";
import { DpdBadge, LoanSummaryCard } from "@/components/shared/loan-summary-card";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { ScheduleTable, type ScheduleRow } from "@/components/shared/schedule-table";
import { EmptyState } from "@/components/shared/states";
import { AuditTimeline } from "@/components/shared/timelines";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useBranchOptions, useProductOptions } from "@/components/tables/filter-panel";
import { LOAN_STATUSES, statusOptions } from "@/config/options";
import { postCommand } from "@/lib/api/client";
import { loansApi } from "@/lib/api/loans";
import { repaymentsApi } from "@/lib/api/repayments";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime, todayISO } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { AuditEntry, Installment, LoanDetail, LoanSummary, LoanTransaction, Row, ScheduleVersion } from "@/types";

const cur = (r: LoanSummary) => r.currency;
const money = (key: string, label: string): Col<LoanSummary> => ({ key, label, type: "money", currency: cur });
export const loanCols: Col<LoanSummary>[] = [{ key: "account_no", label: "Loan Account", href: (r) => `/loans/${r.id}` }, { key: "borrower_name", label: "Borrower" }, { key: "product_name", label: "Product" }, { key: "branch_name", label: "Branch", hidden: true }, { key: "officer_name", label: "Loan Officer", hidden: true }, money("original_principal", "Original Principal"), money("outstanding_principal", "Outstanding Principal"), money("total_outstanding", "Total Outstanding"), { key: "next_payment_date", label: "Next Payment Date", type: "date" }, { key: "days_past_due", label: "DPD", type: "dpd" }, { key: "status", label: "Status", type: "status" }];

export function LoanRegisterPage() {
  const branches = useBranchOptions();
  const products = useProductOptions();
  return <PageBody><PageHeader title="Loan Register" description="All loan accounts. Balances come from the loan ledger." /><DataTable name="Loan Register" fetcher={loansApi.list} columns={loanCols} searchPlaceholder="Search account or borrower" dateRange filters={[{ key: "status", label: "Status", options: statusOptions(LOAN_STATUSES) }, { key: "branch_id", label: "Branch", options: branches }, { key: "product_id", label: "Product", options: products }, { key: "currency", label: "Currency", options: [{ value: "USD", label: "USD" }, { value: "KHR", label: "KHR" }] }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/loans/${r.id}` }, { label: "Loan Schedule", icon: Calendar, href: (r) => `/loans/${r.id}/schedule` }, { label: "Loan Transactions", icon: ScrollText, href: (r) => `/loans/${r.id}/transactions` }, { label: "Loan Statement", icon: FileText, href: (r) => `/loans/${r.id}/statement` }, { label: "Record Repayment", icon: Receipt, href: (r) => `/repayments/new?loan=${r.id}`, perms: ["repayment.create"], visible: (r) => r.status === "ACTIVE" }]} /></PageBody>;
}

const iCols: Col<Row>[] = [{ key: "loan_account_no", label: "Loan Account", href: (r) => `/loans/${String(r.loan_id)}/schedule` }, { key: "borrower_name", label: "Borrower" }, { key: "no", label: "Installment Number", type: "number" }, { key: "due_date", label: "Due Date", type: "date" }, { key: "principal", label: "Principal", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "interest", label: "Interest", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "total", label: "Total Installment", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "amount_paid", label: "Amount Paid", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "status", label: "Payment Status", type: "status" }];
export function LoanSchedulesPage() { return <PageBody><PageHeader title="Loan Schedules" description="Installments across active loans." /><DataTable name="Loan Schedules" fetcher={loansApi.installments.list} columns={iCols} dateRange defaultSort="due_date" searchPlaceholder="Search account or borrower" filters={[{ key: "status", label: "Payment Status", options: statusOptions(["SCHEDULED", "DUE", "PARTIALLY_PAID", "PAID", "OVERDUE"]) }]} /></PageBody>; }

const txCols: Col<LoanTransaction>[] = [{ key: "posting_date", label: "Posting Date", type: "date" }, { key: "value_date", label: "Value Date", type: "date" }, { key: "loan_account_no", label: "Loan Account" }, { key: "txn_type", label: "Type", type: "status" }, { key: "component", label: "Component", type: "status" }, { key: "amount", label: "Amount", type: "money", currency: (r) => r.currency }, { key: "installment_no", label: "Installment Number", type: "number" }, { key: "source_document", label: "Source Document" }];
export function LoanTransactionsListPage() { return <PageBody><PageHeader title="Loan Transactions" description="Append-only loan ledger. Corrections appear as linked reversals." /><DataTable name="Loan Transactions" fetcher={loansApi.allTransactions.list} columns={txCols} dateRange searchPlaceholder="Search transactions" filters={[{ key: "txn_type", label: "Type", options: statusOptions(["DISBURSEMENT", "FEE_DEDUCTED", "FEE_CHARGED", "PENALTY_CHARGED", "REPAYMENT_ALLOCATION", "UNAPPLIED_IN", "REVERSAL", "WAIVER"]) }, { key: "component", label: "Component", options: statusOptions(["PRINCIPAL", "INTEREST_DUE", "FEE", "PENALTY", "UNAPPLIED"]) }]} /></PageBody>; }

export const useLoan = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["loan", id], queryFn: ({ signal }) => loansApi.detail(id, signal) }) }; };
const toRows = (s: Installment[]): ScheduleRow[] => s.map((i) => ({ no: i.no, due_date: i.due_date, payment_due_date: i.payment_due_date, opening: i.opening, principal: i.principal, interest: i.interest, total: i.total, closing: i.closing, amount_paid: addStrings([i.principal_paid, i.interest_paid]), status: i.status }));
// Cents-only join of two API values for display; no interest, balance or allocation logic.
function addStrings(values: string[]) { const c = values.reduce((s, v) => s + BigInt(v.replace(".", "")), BigInt(0)).toString().padStart(3, "0"); return `${c.slice(0, -2)}.${c.slice(-2)}`; }

export function ScheduleBlock({ id, currency }: { id: string; currency: CurrencyCode }) {
  const t = useT();
  const [version, setVersion] = useState<number | undefined>();
  const q = useQuery({ queryKey: ["loan-schedule", id, version], queryFn: ({ signal }) => loansApi.schedule(id, version, signal) });
  return <QueryView query={q}>{(s: ScheduleVersion) => <Section title={`${t("Schedule Version")} ${s.version_no}`} description={`${t(statusLabel(s.reason))} · ${formatDate(s.effective_from)}`} actions={<><StatusBadge status={s.status} /><select aria-label={t("Schedule Version")} className="rounded-md border bg-transparent px-2 py-1 text-sm" value={s.version_no} onChange={(e) => setVersion(Number(e.target.value))}>{s.versions.map((v) => <option key={v.version_no} value={v.version_no}>v{v.version_no} · {t(statusLabel(v.status))}</option>)}</select></>} flush><ScheduleTable rows={toRows(s.installments)} currency={currency} totals={{ principal: s.total_principal, interest: s.total_interest }} /></Section>}</QueryView>;
}

function Rel<T extends object>({ rows, columns, name, empty }: { rows: T[]; columns: Col<T>[]; name: string; empty: string }) {
  return <DataTable name={name} exportable={false} emptyTitle={empty} columns={columns} fetcher={async () => ({ items: rows, total: rows.length, next_cursor: null })} />;
}

function useRelated(loan: LoanDetail) {
  const q = useQuery({ queryKey: ["loan-related", loan.id], queryFn: ({ signal }) => loansApi.related(loan.id, signal) });
  const c = (r: Row) => r.currency as CurrencyCode;
  return { q, c };
}

const L = ({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) => <Button asChild size="sm" variant={primary ? "default" : "outline"}><Link href={href}>{children}</Link></Button>;

function LoanActions({ loan }: { loan: LoanDetail }) {
  const t = useT();
  const can = useCan();
  const a = loan.allowed_actions;
  return <>
    {a.generate_agreement && can("agreement.execute") && <L href="/agreements/generate">{t("Generate Agreement")}</L>}
    {a.request_disbursement && can("disbursement.request") && <L href={`/disbursements/new?loan=${loan.id}`} primary><Banknote className="size-4" />{t("Disbursement Request")}</L>}
    {a.record_repayment && can("repayment.create") && <L href={`/repayments/new?loan=${loan.id}`} primary><Receipt className="size-4" />{t("Record Repayment")}</L>}
    {a.settlement_quote && can("settlement.quote") && <L href={`/settlements/calculator?loan=${loan.id}`}>{t("Settlement Quote")}</L>}
    {a.reschedule && can("restructure.request") && <L href={`/rescheduling/new?loan=${loan.id}`}>{t("Reschedule")}</L>}
    {loan.unapplied !== "0.00" && <ActionButton label="Request Refund" icon={Undo2} variant="outline" perms={["repayment.reverse_request"]} action={{ title: "Request refund of unapplied balance", simulated: true, description: "A different user must approve the refund.", fields: [{ name: "amount", label: "Amount", type: "money", required: true, currency: loan.currency, defaultValue: loan.unapplied }, { name: "method", label: "Payment Method", type: "select", required: true, defaultValue: "CASH", options: [{ value: "CASH", label: "Cash" }, { value: "BANK_TRANSFER", label: "Bank Transfer" }] }, { name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => repaymentsApi.requestRefund(loan.id, v), successMessage: "Refund requested" }} />}
    {loan.status === "ACTIVE" && <ActionButton label="Write Off" icon={Ban} variant="destructive" perms={["period.reopen"]} action={{ title: "Write off loan", destructive: true, simulated: true, description: "Business Owner approval. Write-off policy and treatment must be confirmed (D-11, V-09).", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => postCommand(`/loans/${loan.id}/write-off`, v), successMessage: "Loan written off" }} />}
    <L href={`/loans/${loan.id}/statement`}><FileText className="size-4" />{t("Statement")}</L>
  </>;
}

export function LoanDetailPage() {
  const t = useT();
  const { id, query } = useLoan();
  return (
    <PageBody><QueryView query={query}>{(loan) => <LoanTabs loan={loan} id={id} t={t} />}</QueryView></PageBody>
  );
}

function LoanTabs({ loan, id, t }: { loan: LoanDetail; id: string; t: (s: string) => string }) {
  const { q: related, c } = useRelated(loan);
  const m = (v: string | null) => <MoneyDisplay value={v} currency={loan.currency} />;
  const tabs = ["Overview", "Loan Terms", "Repayment Schedule", "Transactions", "Repayments", "Collateral", "Collections", "Documents", "Audit History"];
  const data = related.data ?? {};
  return (<>
    <PageHeader title={loan.account_no} description={`${loan.borrower_name} · ${loan.borrower_name_km} · ${loan.product_name}`} badge={<><StatusBadge status={loan.status} />{loan.flags.map((f) => <StatusBadge key={f} status={f} tone="warning" />)}</>} actions={<LoanActions loan={loan} />} />
    <Tabs defaultValue="Overview" className="gap-3">
      <div className="overflow-x-auto overflow-y-hidden"><TabsList>{tabs.map((x) => <TabsTrigger key={x} value={x}>{t(x)}</TabsTrigger>)}</TabsList></div>
      <TabsContent value="Overview" className="space-y-4"><LoanSummaryCard loan={loan} title="Outstanding balances" /><Section title="Balance notes"><DetailGrid columns={4} items={[["Disbursed Principal", m(loan.disbursed_principal)], ["Interest Paid", m(loan.interest_paid)], ["Unapplied Balance", m(loan.unapplied)], ["Amount Overdue", m(loan.amount_overdue)], ["Total Due Today", m(loan.total_due_today)], ["Amount Received", m(loan.amount_received)], ["Remaining Scheduled Installments", m(loan.remaining_scheduled)], ["PAR Classification", loan.par_classification]]} /><p className="mt-3 text-xs text-muted-foreground">{t("Remaining scheduled installments include future interest not yet earned and are not an outstanding balance.")}</p></Section></TabsContent>
      <TabsContent value="Loan Terms" className="space-y-4"><Section title="Loan Terms"><DetailGrid columns={4} items={[["Product", `${loan.product_name} v${loan.product_version}`], ["Interest Method", t(statusLabel(loan.terms.interest_method))], ["Repayment Method", t(statusLabel(loan.terms.amortisation))], ["Interest Rate", `${loan.annual_rate} % p.a.`], ["Day Count Convention", loan.terms.day_count], ["Repayment Frequency", t(statusLabel(loan.frequency))], ["Number of Installments", loan.term], ["Disbursement Date", formatDate(loan.disbursed_on)], ["Maturity Date", formatDate(loan.maturity_date)], ["Purpose", loan.purpose], ["Modifications", loan.restructure_count], ["Loan Officer", loan.officer_name]]} /></Section><Section title="Terms versions" flush><ul className="divide-y">{loan.terms_versions.map((v) => <li key={v.version_no} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>v{v.version_no} · {t(statusLabel(v.source))} · {v.annual_rate} % · {v.term}</span><span className="flex items-center gap-2"><span className="text-muted-foreground">{formatDate(v.effective_from)}</span><StatusBadge status={v.status} /></span></li>)}</ul></Section></TabsContent>
      <TabsContent value="Repayment Schedule"><ScheduleBlock id={id} currency={loan.currency} /></TabsContent>
      <TabsContent value="Transactions"><DataTable name={`Transactions ${loan.account_no}`} fetcher={(p, s) => loansApi.transactions(id, p, s)} columns={txCols.filter((x) => x.key !== "loan_account_no")} dateRange /></TabsContent>
      <TabsContent value="Repayments"><Rel name="Repayments" empty="No repayments recorded" rows={data.repayments ?? []} columns={[{ key: "receipt_no", label: "Receipt", href: (r) => `/repayments/${String(r.id)}` }, { key: "value_date", label: "Date", type: "date" }, { key: "amount", label: "Amount", type: "money", currency: c }, { key: "unapplied_amount", label: "Unapplied", type: "money", currency: c }, { key: "method", label: "Payment Method", type: "status" }, { key: "status", label: "Status", type: "status" }]} /></TabsContent>
      <TabsContent value="Collateral" className="space-y-4"><Rel name="Collateral" empty="No collateral linked" rows={data.collateral ?? []} columns={[{ key: "reference", label: "Collateral Reference", href: (r) => `/collateral/${String(r.id)}` }, { key: "collateral_type", label: "Collateral Type" }, { key: "accepted_value", label: "Accepted Value", type: "money", currency: c }, { key: "custody_status", label: "Custody Status" }, { key: "status", label: "Status", type: "status" }]} /><Rel name="Guarantors" empty="No guarantors linked" rows={data.guarantors ?? []} columns={[{ key: "name", label: "Guarantor Name", href: (r) => `/guarantors/${String(r.id)}` }, { key: "relationship", label: "Relationship" }, { key: "guarantee_amount", label: "Guarantee Amount", type: "money", currency: c }, { key: "status", label: "Status", type: "status" }]} /></TabsContent>
      <TabsContent value="Collections" className="space-y-4"><Rel name="Contacts" empty="No collection activity" rows={data.activities ?? []} columns={[{ key: "contact_time", label: "Contact Time", type: "datetime" }, { key: "channel", label: "Channel" }, { key: "outcome", label: "Outcome" }, { key: "notes", label: "Notes" }, { key: "officer_name", label: "Collection Officer" }]} /><Rel name="Promises" empty="No promises to pay" rows={data.promises ?? []} columns={[{ key: "promise_date", label: "Promise Date", type: "date" }, { key: "promised_amount", label: "Promised Amount", type: "money", currency: c }, { key: "status", label: "Status", type: "status" }]} /></TabsContent>
      <TabsContent value="Documents"><Rel name="Documents" empty="No documents" rows={data.documents ?? []} columns={[{ key: "agreement_no", label: "Document", href: (r) => `/agreements/${String(r.id)}` }, { key: "language", label: "Language", type: "status" }, { key: "version", label: "Version", type: "number" }, { key: "status", label: "Status", type: "status" }]} /></TabsContent>
      <TabsContent value="Audit History"><Section title="Audit History"><AuditTimeline items={(data.audit ?? []) as AuditEntry[]} /></Section></TabsContent>
    </Tabs>
  </>);
}

export function LoanSchedulePage() { const { id, query } = useLoan(); return <PageBody><QueryView query={query}>{(l) => <><PageHeader title="Loan Schedule" description={`${l.account_no} · ${l.borrower_name}`} /><ScheduleBlock id={id} currency={l.currency} /></>}</QueryView></PageBody>; }
export function LoanTransactionsPage() { const { id, query } = useLoan(); return <PageBody><QueryView query={query}>{(l) => <><PageHeader title="Loan Transactions" description={`${l.account_no} · ${l.borrower_name}`} /><DataTable name={`Transactions ${l.account_no}`} fetcher={(p, s) => loansApi.transactions(id, p, s)} columns={txCols.filter((x) => x.key !== "loan_account_no")} dateRange /></>}</QueryView></PageBody>; }

export function LoanBalancesPage() {
  const t = useT();
  const { id, query } = useLoan();
  const [asOf, setAsOf] = useState(todayISO());
  const b = useQuery({ queryKey: ["balances", id, asOf], queryFn: ({ signal }) => loansApi.balances(id, asOf, signal), enabled: Boolean(asOf) });
  return <PageBody><QueryView query={query}>{(l) => { const m = (v?: string) => <MoneyDisplay value={v} currency={l.currency} />; return (<><PageHeader title="Outstanding Balances" description={`${l.account_no} · ${l.borrower_name}`} /><Section title={t("As-of date")} actions={<div className="w-40"><DatePicker value={asOf} onChange={setAsOf} /></div>}><QueryView query={b}>{(x) => <DetailGrid columns={4} items={[["Original Principal", m(x.original_principal)], ["Outstanding Principal", m(x.outstanding_principal)], ["Interest Due", m(x.interest_due)], ["Interest Accrued", m(x.interest_accrued)], ["Fees Due", m(x.fees_due)], ["Penalties Due", m(x.penalties_due)], ["Unapplied Balance", m(x.unapplied)], ["Total Outstanding", m(x.total_outstanding)], ["Days Past Due", <DpdBadge key="d" dpd={x.days_past_due} />]]} />}</QueryView></Section></>); }}</QueryView></PageBody>;
}

interface Statement extends Row { loan: LoanSummary; borrower: Row; company: Record<string, string>; from: string; to: string; transactions: LoanTransaction[] }
export function LoanStatementPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState({ from: "", to: "" });
  const q = useQuery({ queryKey: ["statement", id, range], queryFn: ({ signal }) => loansApi.statement(id, { date_from: range.from, date_to: range.to }, signal) as Promise<Statement> });
  return (
    <PageBody>
      <PageHeader title="Loan Statement" actions={<><DateRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /><Button size="sm" onClick={() => window.print()}><Printer className="size-4" />{t("Print / PDF")}</Button></>} />
      <QueryView query={q}>{(s) => <article className="print-area mx-auto max-w-4xl space-y-4 rounded-lg border bg-white p-6 text-sm text-black">
        <header className="text-center"><p className="font-semibold">{s.company.legal_name_en} · {s.company.legal_name_km}</p><h2 className="text-base font-bold">{"LOAN STATEMENT / របាយការណ៍ប្រាក់កម្ចី"}</h2><p className="text-xs">{formatDate(s.from)} – {formatDate(s.to)}</p></header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1"><div className="flex justify-between"><dt className="text-gray-600">Loan account</dt><dd className="font-medium">{s.loan.account_no}</dd></div><div className="flex justify-between"><dt className="text-gray-600">Borrower</dt><dd className="font-medium">{String(s.borrower.name_km)} / {s.loan.borrower_name}</dd></div><div className="flex justify-between"><dt className="text-gray-600">Outstanding principal</dt><dd className="font-medium">{formatAmount(s.loan.outstanding_principal, s.loan.currency)} {s.loan.currency}</dd></div><div className="flex justify-between"><dt className="text-gray-600">Total outstanding</dt><dd className="font-medium">{formatAmount(s.loan.total_outstanding, s.loan.currency)} {s.loan.currency}</dd></div></dl>
        {s.transactions.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="py-1 pr-2">Value date</th><th className="pr-2">Type</th><th className="pr-2">Component</th><th className="pr-2">Source</th><th className="text-right">Amount</th></tr></thead><tbody>{s.transactions.map((x) => <tr key={x.id} className="border-b border-gray-200"><td className="py-1 pr-2">{formatDate(x.value_date)}</td><td className="pr-2">{statusLabel(x.txn_type)}</td><td className="pr-2">{statusLabel(x.component)}</td><td className="pr-2">{x.source_document}</td><td className="text-right tabular">{formatAmount(x.amount, s.loan.currency)}</td></tr>)}</tbody></table></div> : <EmptyState title="No transactions in this period" />}
        <p className="text-center text-xs text-gray-500">{t("Demonstration only: figures are simulated.")} {formatDateTime(new Date().toISOString())}</p>
      </article>}</QueryView>
    </PageBody>
  );
}
