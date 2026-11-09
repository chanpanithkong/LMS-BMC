"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Calculator, Check, FileText, HandCoins, Printer, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton, ActionDialog } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { LoanSummaryCard } from "@/components/shared/loan-summary-card";
import { ScheduleTable } from "@/components/shared/schedule-table";
import { EmptyState, LoadingSkeleton } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { PAYMENT_METHODS, statusOptions } from "@/config/options";
import { describeError, useAction } from "@/hooks/use-action";
import { loansApi } from "@/lib/api/loans";
import { newIdempotencyKey } from "@/lib/api/client";
import { closuresApi, prepaymentsApi, settlementsApi } from "@/lib/api/servicing";
import { useCan } from "@/lib/auth/store";
import { formatDate, todayISO } from "@/lib/formatters/date";
import { formatMoney, isPositiveDecimal, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { LoanSummary, Row } from "@/types";

const cur = (r: Row) => r.currency as CurrencyCode;
const cols: Col<Row>[] = [{ key: "reference", label: "Reference", href: (r) => `/settlements/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "settlement_date", label: "Settlement Date", type: "date" }, { key: "valid_until", label: "Valid Until", type: "date" }, { key: "total_settlement_amount", label: "Total Settlement Amount", type: "money", currency: cur }, { key: "status", label: "Status", type: "status" }];

export function SettlementListPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Settlement Requests" description="Quotes follow the contract interest option. The server calculates every amount." actions={can("settlement.quote") && <><Button asChild variant="outline" size="sm"><Link href="/settlements/prepayment">{t("Partial Prepayment")}</Link></Button><Button asChild size="sm"><Link href="/settlements/calculator"><Calculator className="size-4" />{t("Settlement Calculator")}</Link></Button></>} /><DataTable name="Settlement requests" fetcher={settlementsApi.list} columns={cols} dateRange searchPlaceholder="Search settlements" filters={[{ key: "status", label: "Status", options: statusOptions(["QUOTED", "SETTLED", "CANCELLED"]) }]} rowActions={[{ label: "View", href: (r) => `/settlements/${r.id}` }]} /></PageBody>;
}

function CalculatorForm() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const preset = useSearchParams().get("loan") ?? "";
  const loans = useQuery({ queryKey: ["options", "active-loans"], queryFn: ({ signal }) => loansApi.list({ status: "ACTIVE", limit: 200, sort: "account_no" }, signal) });
  const fields: FieldDef[] = [{ name: "loan_id", label: "Loan Account", type: "select", required: true, defaultValue: preset, span: 2, options: (loans.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.account_no} · ${l.borrower_name}` })) }, { name: "settlement_date", label: "Settlement Date", type: "date", required: true, defaultValue: todayISO(), minToday: true }];
  const form = useZodForm(fields, { loan_id: preset });
  const submit = form.handleSubmit(async (v) => { const r = await execute(() => settlementsApi.quote(String(v.loan_id), { settlement_date: v.settlement_date }), { success: "Quotation created", simulated: true }); router.push(`/settlements/${String(r.id)}`); });
  return <form onSubmit={submit}><Section><FormFields form={form} fields={fields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit">{t("Request Quotation")}</Button></div></Section></form>;
}
export const SettlementCalculatorPage = () => <PageBody><PageHeader title="Settlement Calculator" description="Requests a quotation from the calculation engine for the chosen date." badge={<SimulatedTag />} /><Suspense fallback={<LoadingSkeleton />}><CalculatorForm /></Suspense></PageBody>;

export function SettlementDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["settlement", id], queryFn: ({ signal }) => settlementsApi.get(id, signal) });
  return <PageBody><QueryView query={query}>{(s) => {
    const c = cur(s);
    const m = (k: string) => <MoneyDisplay value={String(s[k])} currency={c} />;
    return (<>
      <PageHeader title={String(s.reference)} description={`${String(s.loan_account_no)} · ${String(s.borrower_name)}`} badge={<><StatusBadge status={String(s.status)} /><SimulatedTag /></>} actions={s.status === "QUOTED" && <>
        <ActionButton label="Receive Settlement" icon={HandCoins} perms={["settlement.process"]} action={{ title: "Receive full settlement", simulated: true, summary: <p>{t("Receive")} <strong>{formatMoney(String(s.total_settlement_amount), c)}</strong> {t("and close the loan.")}</p>, fields: [{ name: "method", label: "Payment Method", type: "select", options: PAYMENT_METHODS, required: true, defaultValue: "CASH" }, { name: "reference", label: "Reference Number" }], run: (v) => settlementsApi.action(id, "pay", v), successMessage: "Loan settled and closed" }} />
        <ActionButton label="Cancel Quote" icon={X} variant="outline" perms={["settlement.process"]} action={{ title: "Cancel quotation", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => settlementsApi.action(id, "cancel", v), successMessage: "Quotation cancelled" }} />
      </>} />
      <Section title="Settlement Details" description={`${t("Option")}: ${String(s.option)} · ${t("Valid until")} ${formatDate(String(s.valid_until))}`}><DetailGrid columns={3} items={[["Outstanding Principal", m("outstanding_principal")], ["Due Interest", m("due_interest")], ["Interest to Settlement Date", m("interest_to_settlement_date")], ["Fees", m("fees")], ["Penalties", m("penalties")], ["Early Repayment Fee", m("early_repayment_fee")], ["Waivers", m("waivers")], ["Unapplied Credit", m("unapplied_credit")], ["Total Settlement Amount", <MoneyDisplay key="t" value={String(s.total_settlement_amount)} currency={c} className="text-lg font-semibold" />]]} /></Section>
      {s.status === "SETTLED" && <Button asChild variant="outline" size="sm"><Link href={`/repayments/${String(s.repayment_id)}/receipt`}><Printer className="size-4" />{t("Payment Receipt")}</Link></Button>}
    </>);
  }}</QueryView></PageBody>;
}

const loanCols: Col<LoanSummary>[] = [{ key: "account_no", label: "Loan Account", href: (r) => `/loans/${r.id}` }, { key: "borrower_name", label: "Borrower" }, { key: "product_name", label: "Product" }, { key: "original_principal", label: "Original Principal", type: "money", currency: (r) => r.currency }, { key: "outstanding_principal", label: "Outstanding Principal", type: "money", currency: (r) => r.currency }, { key: "status", label: "Status", type: "status" }];
const historyCols: Col<LoanSummary>[] = [...loanCols.slice(0, 4), { key: "closure_type", label: "Closure Type" }, { key: "closed_on", label: "Closed On", type: "date" }, { key: "status", label: "Status", type: "status" }];

export function LoanClosurePage() {
  const t = useT();
  return <PageBody><PageHeader title="Loan Closure" description="A loan closes only when every component is zero. The server rejects closure otherwise." actions={<Button asChild variant="outline" size="sm"><Link href="/closures/history">{t("Closed Loan History")}</Link></Button>} /><div className="rounded-md bg-info-soft p-3 text-sm text-info"><BadgeCheck className="mr-1 inline size-4" aria-hidden />{t("Choose Close Loan on any active loan to test the server check.")}</div><DataTable name="Loans for closure" fetcher={loansApi.list} params={{ status: "ACTIVE" }} columns={loanCols} searchPlaceholder="Search account or borrower" rowActions={[{ label: "Close Loan", icon: Check, perms: ["closure.process"], dialog: (r) => ({ title: "Close loan", description: "Closure requires zero balances on all components.", summary: <p>{r.account_no} · {r.borrower_name}</p>, run: () => loansApi.close(r.id), successMessage: "Loan closed", simulated: true }) }, { label: "Settlement Quote", icon: FileText, perms: ["settlement.quote"], href: (r) => `/settlements/calculator?loan=${r.id}` }]} /></PageBody>;
}
export const ClosedLoanHistoryPage = () => <PageBody><PageHeader title="Closed Loan History" /><DataTable name="Closed loans" fetcher={closuresApi.history.list as never} columns={historyCols} dateRange searchPlaceholder="Search account or borrower" /></PageBody>;

const PREPAYMENT_OPTIONS = [{ value: "REDUCE_TERM", label: "Reduce term, keep installment" }, { value: "REDUCE_INSTALLMENT", label: "Reduce installment, keep term" }];

function PrepaymentForm({ loan }: { loan: LoanSummary }) {
  const t = useT();
  const router = useRouter();
  const can = useCan();
  const fields = useMemo<FieldDef[]>(() => [{ name: "amount", label: "Prepayment Amount", type: "money", required: true, currency: loan.currency }, { name: "value_date", label: "Prepayment Date", type: "date", required: true, defaultValue: todayISO(), maxToday: true }, { name: "option", label: "Schedule Effect", type: "select", required: true, defaultValue: "REDUCE_TERM", options: PREPAYMENT_OPTIONS }, { name: "method", label: "Payment Method", type: "select", required: true, defaultValue: "CASH", options: PAYMENT_METHODS }, { name: "external_reference", label: "Reference Number" }], [loan.currency]);
  const form = useZodForm(fields);
  const amount = String(form.watch("amount") ?? "");
  const value_date = String(form.watch("value_date") ?? "");
  const option = String(form.watch("option") ?? "");
  const [key] = useState(newIdempotencyKey);
  const [pending, setPending] = useState<Values | null>(null);
  const ready = isPositiveDecimal(amount) && Boolean(value_date);
  const preview = useQuery({ queryKey: ["prepayment-preview", loan.id, amount, value_date, option], queryFn: ({ signal }) => prepaymentsApi.preview(loan.id, { amount, value_date, option }, signal), enabled: ready, retry: false, placeholderData: keepPreviousData });
  const p = ready && !preview.isError ? preview.data : undefined;
  const c = loan.currency;
  const m = (v: string) => <MoneyDisplay value={v} currency={c} />;
  const rows: [string, React.ReactNode, React.ReactNode][] = p ? [["Outstanding Principal", m(p.existing.outstanding_principal), m(p.proposed.outstanding_principal)], ["Installment", m(p.existing.installment), m(p.proposed.installment)], ["Remaining Installments", p.existing.remaining_installments, p.proposed.remaining_installments], ["Maturity Date", formatDate(p.existing.maturity_date), formatDate(p.proposed.maturity_date)], ["Remaining Interest", m(p.existing.remaining_interest), m(p.proposed.remaining_interest)]] : [];
  return (
    <div className="space-y-4">
      <form onSubmit={form.handleSubmit((v) => setPending(v))}>
        <Section title="Prepayment" description="The full amount reduces principal. Interest for the current period is adjusted from the prepayment date.">
          <FormFields form={form} fields={fields} columns={3} />
          {preview.isError && ready && <p role="alert" className="mt-3 rounded-md bg-danger-soft p-2 text-sm text-danger">{t(describeError(preview.error))}</p>}
          {can("settlement.process") ? <div className="mt-4 flex justify-end"><Button type="submit" disabled={!p}>{t("Review Prepayment")}</Button></div> : <p className="mt-3 text-sm text-muted-foreground">{t("Your role can preview this revision but cannot record the payment.")}</p>}
        </Section>
      </form>
      {p ? <>
        <Section title="Existing and revised schedule" description={`${t("Interest reduction")}: ${formatMoney(p.interest_reduction, c)}`} actions={<SimulatedTag />} flush>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3 font-medium">{t("Term")}</th><th className="p-3 font-medium">{t("Existing")}</th><th className="p-3 font-medium">{t("Revised")}</th></tr></thead><tbody>{rows.map(([l, a, b]) => <tr key={l} className="border-b last:border-0"><td className="p-3 text-muted-foreground">{t(l)}</td><td className="p-3 tabular">{a}</td><td className="p-3 font-medium tabular">{b}</td></tr>)}</tbody></table></div>
        </Section>
        <Section title="Revised schedule" flush><ScheduleTable rows={p.proposed_installments} currency={c} /></Section>
      </> : !preview.isError && <Section><EmptyState title="Enter an amount" description="The server returns the revised schedule for the chosen option." /></Section>}
      {pending && p && <ActionDialog open onOpenChange={(o) => { if (!o) setPending(null); }} action={{ title: "Confirm partial prepayment", simulated: true, summary: <p>{t("Receive")} <strong>{formatMoney(p.amount, c)}</strong> {t("as principal on")} {loan.account_no}. {t("A new schedule version replaces the remaining installments.")}</p>, submitLabel: "Confirm Payment", successMessage: "Prepayment recorded", run: () => prepaymentsApi.record(loan.id, { amount: p.amount, value_date: p.date, option: p.option, method: String(pending.method), external_reference: String(pending.external_reference || "") || null }, key), after: (r) => router.push(`/repayments/${(r as { id: string }).id}/receipt`) }} />}
    </div>
  );
}

function PrepaymentContent() {
  const t = useT();
  const preset = useSearchParams().get("loan") ?? "";
  const [loanId, setLoanId] = useState(preset);
  const loans = useQuery({ queryKey: ["options", "active-loans"], queryFn: ({ signal }) => loansApi.list({ status: "ACTIVE", limit: 200, sort: "account_no" }, signal) });
  const loan = useQuery({ queryKey: ["loan", loanId], queryFn: ({ signal }) => loansApi.detail(loanId, signal), enabled: Boolean(loanId) });
  return (
    <div className="space-y-4">
      <Section title="Find loan"><select aria-label={t("Loan Account")} className="w-full rounded-md border bg-transparent p-2 text-sm" value={loanId} onChange={(e) => setLoanId(e.target.value)}><option value="">{t("Select")}</option>{(loans.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.account_no} · {l.borrower_name}</option>)}</select></Section>
      {loanId && (loan.isLoading ? <LoadingSkeleton rows={3} /> : loan.data && <><LoanSummaryCard loan={loan.data} /><PrepaymentForm key={loan.data.id} loan={loan.data} /></>)}
    </div>
  );
}

export const PrepaymentPage = () => <PageBody><PageHeader title="Partial Prepayment" description="Pays down principal early and creates a new schedule version. Earlier versions stay on record." badge={<SimulatedTag />} /><Suspense fallback={<LoadingSkeleton />}><PrepaymentContent /></Suspense></PageBody>;
