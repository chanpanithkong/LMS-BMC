"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Eye, LockKeyhole, Plus, Printer, Receipt, RotateCcw, Unlock, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatCard, StatusBadge, statusLabel } from "@/components/shared/display";
import { LoanSummaryCard } from "@/components/shared/loan-summary-card";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState, LoadingSkeleton } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { PAYMENT_METHODS, statusOptions } from "@/config/options";
import { describeError, useAction } from "@/hooks/use-action";
import { newIdempotencyKey } from "@/lib/api/client";
import { loansApi } from "@/lib/api/loans";
import { repaymentsApi, type AllocationPreview } from "@/lib/api/repayments";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime, todayISO } from "@/lib/formatters/date";
import { formatAmount, formatMoney, isPositiveDecimal, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Balances, LoanSummary, Repayment, Row } from "@/types";

const cols: Col<Repayment>[] = [{ key: "receipt_no", label: "Reference Number", href: (r) => `/repayments/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "payment_date", label: "Payment Date", type: "date" }, { key: "amount", label: "Amount", type: "money", currency: (r) => r.currency }, { key: "currency", label: "Currency", hidden: true }, { key: "method", label: "Payment Method", type: "status" }, { key: "cashier_name", label: "Cashier" }, { key: "status", label: "Status", type: "status" }];

export function RepaymentDashboardPage() {
  const t = useT();
  const can = useCan();
  const query = useQuery({ queryKey: ["repayment-dashboard"], queryFn: ({ signal }) => repaymentsApi.dashboard(signal) });
  return (
    <PageBody>
      <PageHeader title="Repayment Dashboard" description="Today's receipts by currency, cashier session and upcoming dues." actions={<><Button asChild variant="outline" size="sm"><Link href="/repayments/history">{t("Repayment History")}</Link></Button><Button asChild variant="outline" size="sm"><Link href="/repayments/reversals">{t("Reversal Approval")}</Link></Button>{can("repayment.create") && <Button asChild size="sm"><Link href="/repayments/new"><Plus className="size-4" />{t("Record Repayment")}</Link></Button>}</>} />
      <QueryView query={query}>{(d) => {
        const s = d.session;
        return (<>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{d.summary.map((x) => <StatCard key={x.currency} title={`${t("Collections Today")} (${x.currency})`} value={<MoneyDisplay value={x.total} currency={x.currency} />} icon={Banknote} tone="success" sub={`${x.count} ${t("receipts")} · ${t("Cash")} ${formatAmount(x.cash, x.currency)}`} />)}<StatCard title="Pending Reversals" value={d.pending_reversals} icon={RotateCcw} tone="warning" href="/repayments/reversals" /><StatCard title="Cashier Session" value={<StatusBadge status={s ? "OPEN" : "CLOSED"} />} icon={LockKeyhole} /></div>
          {(can("repayment.create") || can("disbursement.confirm_cash")) && <Section title="Cashier Session" actions={s ? <ActionButton label="Close Session" icon={LockKeyhole} variant="outline" action={{ title: "Close cashier session", simulated: true, fields: [{ name: "closing_count_usd", label: "Counted USD", type: "money", currency: "USD", required: true }, { name: "closing_count_khr", label: "Counted KHR", type: "money", currency: "KHR", required: true }], run: (v) => repaymentsApi.closeSession(String(s.id), v), successMessage: "Session submitted for review" }} /> : <ActionButton label="Open Session" icon={Unlock} action={{ title: "Open cashier session", simulated: true, fields: [{ name: "opening_float_usd", label: "Opening Float USD", type: "money", currency: "USD", required: true }, { name: "opening_float_khr", label: "Opening Float KHR", type: "money", currency: "KHR", required: true }], run: (v) => repaymentsApi.openSession(v), successMessage: "Session opened" }} />}>{s ? <DetailGrid columns={3} items={[["Opened", formatDateTime(String(s.opened_at))], ["Opening Float USD", <MoneyDisplay key="u" value={String(s.opening_float_usd)} currency="USD" />], ["Opening Float KHR", <MoneyDisplay key="k" value={String(s.opening_float_khr)} currency="KHR" />]]} /> : <EmptyState title="No open session" description="A session is required to accept cash." />}</Section>}
          <Section title="Due within 7 days" flush>{d.due_soon.length ? <ul className="divide-y">{d.due_soon.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><Link className="font-medium text-primary hover:underline" href={`/loans/${l.id}`}>{l.account_no}</Link> · {l.borrower_name}</span><span className="flex items-center gap-3"><span className="text-muted-foreground">{formatDate(l.next_payment_date)}</span><MoneyDisplay value={l.next_payment_amount} currency={l.currency} />{can("repayment.create") && <Button asChild variant="outline" size="sm"><Link href={`/repayments/new?loan=${l.id}`}>{t("Record")}</Link></Button>}</span></li>)}</ul> : <EmptyState title="Nothing due soon" />}</Section>
        </>);
      }}</QueryView>
    </PageBody>
  );
}

export function RepaymentHistoryPage() {
  return <PageBody><PageHeader title="Repayment History" /><DataTable name="Repayment history" fetcher={repaymentsApi.list} columns={cols} dateRange defaultSort="-value_date" searchPlaceholder="Search receipts" filters={[{ key: "status", label: "Status", options: statusOptions(["COMPLETED", "REVERSED"]) }, { key: "method", label: "Payment Method", options: PAYMENT_METHODS }, { key: "currency", label: "Currency", options: [{ value: "USD", label: "USD" }, { value: "KHR", label: "KHR" }] }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/repayments/${r.id}` }, { label: "Payment Receipt", icon: Receipt, href: (r) => `/repayments/${r.id}/receipt` }, { label: "Reversal Request", icon: RotateCcw, href: (r) => `/repayments/${r.id}/reversal`, perms: ["repayment.reverse_request"], visible: (r) => r.status === "COMPLETED" }]} /></PageBody>;
}

const paymentFields = (currency: CurrencyCode): FieldDef[] => [{ name: "amount", label: "Amount", type: "money", required: true, currency }, { name: "value_date", label: "Payment Date", type: "date", required: true, defaultValue: todayISO(), maxToday: true, help: "Dates more than 3 days back need Branch Manager approval." }, { name: "method", label: "Payment Method", type: "select", options: PAYMENT_METHODS, required: true, defaultValue: "CASH" }, { name: "external_reference", label: "Reference Number", help: "Bank or transfer reference, if any." }, { name: "comment", label: "Comment", type: "textarea" }];

function AllocationCard({ preview, currency }: { preview?: AllocationPreview; currency: CurrencyCode }) {
  const t = useT();
  if (!preview) return <EmptyState title="Enter an amount" description="The server returns the allocation for the loan's configured waterfall." />;
  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-sm">{["PENALTY", "FEE", "INTEREST", "PRINCIPAL"].map((c) => <div key={c} className="flex justify-between"><dt className="text-muted-foreground">{t(c === "PENALTY" ? "Penalties" : c === "FEE" ? "Fees" : statusLabel(c))}</dt><dd className="tabular font-medium">{formatAmount(preview.totals[c], currency)}</dd></div>)}<div className="flex justify-between border-t pt-1.5"><dt className="text-muted-foreground">{t("Unapplied")}</dt><dd className="tabular font-medium">{formatAmount(preview.unapplied_amount, currency)}</dd></div><div className="flex justify-between font-semibold"><dt>{t("Total")}</dt><dd className="tabular">{formatAmount(preview.amount, currency)} {currency}</dd></div></dl>
      <p className="text-xs text-muted-foreground">{t(preview.waterfall)}</p>
    </div>
  );
}

function RecordForm({ loan }: { loan: LoanSummary }) {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const fields = useMemo(() => paymentFields(loan.currency), [loan.currency]);
  const form = useZodForm(fields);
  const amount = String(form.watch("amount") ?? "");
  const value_date = String(form.watch("value_date") ?? "");
  const method = String(form.watch("method") ?? "");
  const [key] = useState(newIdempotencyKey);
  const [pending, setPending] = useState<Values | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = isPositiveDecimal(amount);
  const preview = useQuery({ queryKey: ["allocation", loan.id, amount, value_date], queryFn: ({ signal }) => repaymentsApi.preview(loan.id, { amount, value_date, method }, signal), enabled: ok && Boolean(value_date), retry: false, placeholderData: keepPreviousData });
  const confirm = async () => {
    setBusy(true);
    try {
      const v = pending!;
      const r = await execute(() => repaymentsApi.record(loan.id, { amount: String(v.amount), value_date: String(v.value_date), method: String(v.method), external_reference: String(v.external_reference || "") || null, comment: String(v.comment || "") }, key), { success: "Repayment recorded", simulated: true });
      router.push(`/repayments/${r.id}/receipt`);
    } catch { setPending(null); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form className="lg:col-span-2" onSubmit={form.handleSubmit((v) => setPending(v))}><Section title="Payment"><FormFields form={form} fields={fields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit" disabled={!preview.data || preview.isError}>{t("Review Payment")}</Button></div></Section></form>
      <Section title="Payment Allocation" actions={<SimulatedTag />}>{preview.isError ? <p className="text-sm text-destructive">{t(describeError(preview.error))}</p> : <AllocationCard preview={ok ? preview.data : undefined} currency={loan.currency} />}</Section>
      <Dialog open={Boolean(pending)} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2">{t("Confirm repayment")}<SimulatedTag /></DialogTitle><DialogDescription>{loan.account_no} · {loan.borrower_name}</DialogDescription></DialogHeader>
          <p className="text-sm">{t("Record a payment of")} <strong>{formatMoney(String(pending?.amount ?? ""), loan.currency)}</strong> {t("dated")} {formatDate(String(pending?.value_date ?? ""))}.</p>
          <AllocationCard preview={preview.data} currency={loan.currency} />
          <DialogFooter><Button variant="outline" onClick={() => setPending(null)} disabled={busy}>{t("Cancel")}</Button><Button onClick={() => void confirm()} disabled={busy}>{t(busy ? "Processing…" : "Confirm Payment")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordContent() {
  const t = useT();
  const preset = useSearchParams().get("loan") ?? "";
  const [loanId, setLoanId] = useState(preset);
  const loans = useQuery({ queryKey: ["options", "active-loans"], queryFn: ({ signal }) => loansApi.list({ status: "ACTIVE,WRITTEN_OFF", limit: 200, sort: "account_no" }, signal) });
  const loan = useQuery({ queryKey: ["loan", loanId], queryFn: ({ signal }) => loansApi.detail(loanId, signal), enabled: Boolean(loanId) });
  return (
    <div className="space-y-4">
      <Section title="Find loan"><select aria-label={t("Loan Account")} className="w-full rounded-md border bg-transparent p-2 text-sm" value={loanId} onChange={(e) => setLoanId(e.target.value)}><option value="">{t("Select")}</option>{(loans.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.account_no} · {l.borrower_name}</option>)}</select></Section>
      {loan.isFetching && !loan.data ? <LoadingSkeleton rows={3} /> : loan.data && <><LoanSummaryCard loan={loan.data} title="Amounts due" /><div className="rounded-md border bg-card p-3 text-sm"><span className="text-muted-foreground">{t("Total due today")}: </span><MoneyDisplay value={loan.data.total_due_today} currency={loan.data.currency} className="font-semibold" /></div><RecordForm key={loan.data.id} loan={loan.data} /></>}
    </div>
  );
}

export function RecordRepaymentPage() { return <PageBody><PageHeader title="Record Repayment" /><Suspense fallback={<LoadingSkeleton />}><RecordContent /></Suspense></PageBody>; }

const useRepayment = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["repayment", id], queryFn: ({ signal }) => repaymentsApi.get(id, signal) as Promise<Repayment & { loan: LoanSummary & Balances; company: Record<string, string>; borrower: Row; branch: Row; reversal_request: Row | null }> }) }; };

export function RepaymentDetailPage() {
  const t = useT();
  const { id, query } = useRepayment();
  return (
    <PageBody><QueryView query={query}>{(r) => (<>
      <PageHeader title={r.receipt_no} description={`${r.loan_account_no} · ${r.borrower_name}`} badge={<StatusBadge status={r.status} />} actions={<><Button asChild variant="outline" size="sm"><Link href={`/repayments/${id}/receipt`}><Printer className="size-4" />{t("Payment Receipt")}</Link></Button>{r.status === "COMPLETED" && <Button asChild variant="outline" size="sm"><Link href={`/repayments/${id}/reversal`}><RotateCcw className="size-4" />{t("Reversal Request")}</Link></Button>}</>} />
      <Section title="Repayment Details"><DetailGrid columns={4} items={[["Loan Account", <Link key="l" className="text-primary hover:underline" href={`/loans/${r.loan_id}`}>{r.loan_account_no}</Link>], ["Borrower", r.borrower_name], ["Payment Date", formatDate(r.payment_date)], ["Amount", <MoneyDisplay key="a" value={r.amount} currency={r.currency} />], ["Currency", r.currency], ["Payment Method", <StatusBadge key="m" status={r.method} />], ["Reference Number", r.external_reference ?? r.receipt_no], ["Cashier", r.cashier_name], ["Unapplied", <MoneyDisplay key="u" value={r.unapplied_amount} currency={r.currency} />]]} /></Section>
      <Section title="Payment Allocation" flush>{r.allocations.length ? <ul className="divide-y">{r.allocations.map((a) => <li key={a.sequence_no} className="flex justify-between p-3 text-sm"><span>{a.installment_no === null ? t("Partial Prepayment") : `${t("Installment")} ${a.installment_no}`} · {t(statusLabel(a.component))}</span><MoneyDisplay value={a.amount} currency={r.currency} /></li>)}</ul> : <EmptyState title="No allocations" />}</Section>
      {r.reversal && <Section title="Reversal"><DetailGrid items={[["Reversed by", r.reversal.by], ["Reversed at", formatDateTime(r.reversal.at)], ["Reason", r.reversal.reason]]} /></Section>}
    </>)}</QueryView></PageBody>
  );
}

export function ReceiptPage() {
  const t = useT();
  const { id, query } = useRepayment();
  const execute = useAction();
  return (
    <PageBody><QueryView query={query}>{(r) => {
      const copy = r.print_count > 0;
      const m = (c: string) => r.allocations.filter((a) => a.component === c).reduce<string[]>((s, a) => [...s, a.amount], []);
      return (<>
        <PageHeader title="Payment Receipt" actions={<Button size="sm" onClick={() => void execute(() => repaymentsApi.print(id)).then(() => window.print())}><Printer className="size-4" />{t("Print")}</Button>} />
        <article className="print-area relative mx-auto max-w-md space-y-3 rounded-lg border bg-white p-6 text-sm text-black">
          {(copy || r.status === "REVERSED") && <p className="absolute right-4 top-4 rounded border border-red-600 px-2 py-0.5 text-xs font-bold text-red-700">{r.status === "REVERSED" ? "REVERSED" : "COPY"}</p>}
          <header className="text-center"><p className="font-semibold">{r.company.legal_name_en}</p><p>{r.company.legal_name_km}</p><p className="mt-1 font-bold">{"RECEIPT / បង្កាន់ដៃ"}</p></header>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">{([["Receipt No", r.receipt_no], ["Date", formatDate(r.value_date)], ["Branch", r.branch_name], ["Loan account", r.loan_account_no], ["Borrower", `${String(r.borrower.name_km)} / ${r.borrower_name}`], ["Method", statusLabel(r.method)]] as const).map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-600">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
          <p className="border-y border-dashed border-gray-400 py-2 text-center text-base font-semibold">{formatMoney(r.amount, r.currency)}</p>
          <table className="w-full"><tbody>{(["PENALTY", "FEE", "INTEREST", "PRINCIPAL"] as const).map((c) => <tr key={c}><td className="text-gray-600">{statusLabel(c)}</td><td className="text-right tabular">{m(c).length ? m(c).map((x) => formatAmount(x, r.currency)).join(" + ") : formatAmount("0", r.currency)}</td></tr>)}<tr><td className="text-gray-600">Unapplied</td><td className="text-right tabular">{formatAmount(r.unapplied_amount, r.currency)}</td></tr></tbody></table>
          <div className="border-t border-dashed border-gray-400 pt-2"><p className="flex justify-between"><span className="text-gray-600">Outstanding principal</span><span>{formatAmount(r.loan.outstanding_principal, r.currency)}</span></p><p className="flex justify-between"><span className="text-gray-600">Next due date</span><span>{formatDate(r.loan.next_payment_date)}</span></p></div>
          <footer className="text-center text-xs text-gray-500"><p>Cashier: {r.cashier_name}</p><p>This receipt is computer-generated. Demonstration only: no real payment was made.</p></footer>
        </article>
      </>);
    }}</QueryView></PageBody>
  );
}

export function ReversalRequestPage() {
  const t = useT();
  const router = useRouter();
  const { id, query } = useRepayment();
  return <PageBody><PageHeader title="Reversal Request" description="The original record is kept. A different user must approve the reversal." /><QueryView query={query}>{(r) => (<><Section title={r.receipt_no}><DetailGrid columns={4} items={[["Loan Account", r.loan_account_no], ["Borrower", r.borrower_name], ["Amount", <MoneyDisplay key="a" value={r.amount} currency={r.currency} />], ["Status", <StatusBadge key="s" status={r.status} />]]} /></Section><ActionButton label="Request Reversal" icon={RotateCcw} variant="destructive" perms={["repayment.reverse_request"]} disabled={r.status !== "COMPLETED"} action={{ title: "Request reversal", destructive: true, simulated: true, summary: <p>{t("Reverse")} {formatMoney(r.amount, r.currency)} ({r.receipt_no})</p>, fields: [{ name: "reason_code", label: "Reason Code", type: "select", required: true, options: [{ value: "WRONG_LOAN", label: "Wrong loan" }, { value: "WRONG_AMOUNT", label: "Wrong amount" }, { value: "RETURNED", label: "Bank transfer returned" }, { value: "OTHER", label: "Other" }] }, { name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => repaymentsApi.requestReversal(id, v as { reason_code: string; reason: string }), successMessage: "Reversal requested", after: () => router.push("/repayments/reversals") }} /></>)}</QueryView></PageBody>;
}

const revCols: Col<Row>[] = [{ key: "receipt_no", label: "Receipt", href: (r) => `/repayments/reversals/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "amount", label: "Amount", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "reason", label: "Reason" }, { key: "requested_by_name", label: "Requested by" }, { key: "created_at", label: "Requested", type: "datetime" }, { key: "status", label: "Status", type: "status" }];

const refundCols: Col<Row>[] = [{ key: "loan_account_no", label: "Loan Account", href: (r) => `/loans/${String(r.loan_id)}` }, { key: "borrower_name", label: "Borrower" }, { key: "amount", label: "Amount", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "method", label: "Payment Method", type: "status" }, { key: "reason", label: "Reason" }, { key: "requested_by_name", label: "Requested by" }, { key: "status", label: "Status", type: "status" }];

export function ReversalQueuePage() {
  return <PageBody><PageHeader title="Reversal Approval" description="Approvers must differ from the requester and the original cashier." /><DataTable name="Reversal requests" fetcher={repaymentsApi.reversals.list} columns={revCols} filters={[{ key: "status", label: "Status", options: statusOptions(["PENDING", "APPROVED", "REJECTED"]) }]} rowActions={[{ label: "Review", href: (r) => `/repayments/reversals/${r.id}` }]} /><DataTable name="Refund requests" emptyTitle="No refund requests" fetcher={repaymentsApi.refunds.list} columns={refundCols} rowActions={[{ label: "Approve Refund", icon: CheckCircle2, perms: ["repayment.reverse_approve"], visible: (r) => r.status === "PENDING", dialog: (r) => ({ title: "Approve refund", simulated: true, summary: <p>{formatMoney(String(r.amount), r.currency as CurrencyCode)} · {String(r.loan_account_no)}</p>, run: () => repaymentsApi.approveRefund(String(r.id)), successMessage: "Refund approved" }) }]} /></PageBody>;
}

export function ReversalDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["reversal", id], queryFn: ({ signal }) => repaymentsApi.reversals.get(id, signal) });
  return <PageBody><PageHeader title="Reversal Approval" /><QueryView query={query}>{(x) => { const cur = x.currency as CurrencyCode; return (<div className="grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2"><Section title={String(x.receipt_no)} actions={<StatusBadge status={String(x.status)} />}><DetailGrid items={[["Loan Account", String(x.loan_account_no)], ["Borrower", String(x.borrower_name)], ["Amount", <MoneyDisplay key="a" value={String(x.amount)} currency={cur} />], ["Reason Code", t(statusLabel(String(x.reason_code)))], ["Reason", String(x.reason)], ["Requested by", String(x.requested_by_name)], ["Requested", formatDateTime(String(x.created_at))]]} /></Section></div><ApprovalPanel currency={cur} makers={[{ label: "Requested by", id: String(x.requested_by), name: String(x.requested_by_name) }, { label: "Original cashier", id: String(x.original_cashier), name: null }]}>{x.status === "PENDING" && <><ActionButton label="Approve Reversal" icon={CheckCircle2} perms={["repayment.reverse_approve"]} action={{ title: "Approve reversal", simulated: true, summary: <p>{t("The repayment is marked Reversed, mirror entries are created and DPD is recalculated.")}</p>, fields: [{ name: "comment", label: "Comment", type: "textarea" }], run: (v) => repaymentsApi.decideReversal(id, "approve", v), successMessage: "Reversal approved" }} /><ActionButton label="Reject" icon={X} variant="destructive" perms={["repayment.reverse_approve"]} action={{ title: "Reject reversal", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => repaymentsApi.decideReversal(id, "reject", v), successMessage: "Reversal rejected" }} /></>}</ApprovalPanel></div>); }}</QueryView></PageBody>;
}
