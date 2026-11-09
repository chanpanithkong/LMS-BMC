"use client";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Calculator, Check, FileText, HandCoins, Printer, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { LoadingSkeleton } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { PAYMENT_METHODS, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { loansApi } from "@/lib/api/loans";
import { closuresApi, settlementsApi } from "@/lib/api/servicing";
import { useCan } from "@/lib/auth/store";
import { formatDate, todayISO } from "@/lib/formatters/date";
import { formatMoney, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { LoanSummary, Row } from "@/types";

const cur = (r: Row) => r.currency as CurrencyCode;
const cols: Col<Row>[] = [{ key: "reference", label: "Reference", href: (r) => `/settlements/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "settlement_date", label: "Settlement Date", type: "date" }, { key: "valid_until", label: "Valid Until", type: "date" }, { key: "total_settlement_amount", label: "Total Settlement Amount", type: "money", currency: cur }, { key: "status", label: "Status", type: "status" }];

export function SettlementListPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Settlement Requests" description="Quotes follow the contract interest option. The server calculates every amount." actions={can("settlement.quote") && <Button asChild size="sm"><Link href="/settlements/calculator"><Calculator className="size-4" />{t("Settlement Calculator")}</Link></Button>} /><DataTable name="Settlement requests" fetcher={settlementsApi.list} columns={cols} dateRange searchPlaceholder="Search settlements" filters={[{ key: "status", label: "Status", options: statusOptions(["QUOTED", "SETTLED", "CANCELLED"]) }]} rowActions={[{ label: "View", href: (r) => `/settlements/${r.id}` }]} /></PageBody>;
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
