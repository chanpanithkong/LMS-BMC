"use client";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleX, Eye, Plus, Printer, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { LoadingSkeleton } from "@/components/shared/states";
import { WorkflowSteps } from "@/components/shared/timelines";
import { DataTable, type Col } from "@/components/tables/data-table";
import { PAYMENT_METHODS, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { newIdempotencyKey } from "@/lib/api/client";
import { disbursementsApi } from "@/lib/api/disbursements";
import { loansApi } from "@/lib/api/loans";
import { useCan } from "@/lib/auth/store";
import { formatDate, todayISO } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { Disbursement } from "@/types";

const money = (key: string, label: string): Col<Disbursement> => ({ key, label, type: "money", currency: (r) => r.currency });
const cols: Col<Disbursement>[] = [{ key: "disbursement_no", label: "Reference Number", href: (r) => `/disbursements/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, money("approved_principal", "Approved Principal"), money("fees_deducted", "Fees Deducted"), money("net_disbursement", "Net Disbursement"), { key: "method", label: "Disbursement Method", type: "status" }, { key: "cash_bank_account", label: "Cash/Bank Account", hidden: true }, { key: "disbursement_date", label: "Disbursement Date", type: "date" }, { key: "status", label: "Status", type: "status" }];

export function DisbursementQueuePage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Disbursement Queue" description="Request → Authorise → Confirm → Generate Receipt" actions={<><Button asChild variant="outline" size="sm"><Link href="/disbursements/history">{t("Disbursement History")}</Link></Button>{can("disbursement.request") && <Button asChild size="sm"><Link href="/disbursements/new"><Plus className="size-4" />{t("Disbursement Request")}</Link></Button>}</>} /><DataTable name="Disbursement queue" fetcher={disbursementsApi.list} params={{ status: "REQUESTED,AUTHORISED" }} columns={cols} emptyTitle="No disbursements in the queue" searchPlaceholder="Search disbursements" rowActions={[{ label: "View", icon: Eye, href: (r) => `/disbursements/${r.id}` }, { label: "Authorise", href: (r) => `/disbursements/${r.id}/approve`, perms: ["disbursement.authorise"], visible: (r) => r.status === "REQUESTED" }, { label: "Confirm", href: (r) => `/disbursements/${r.id}/confirm`, perms: ["disbursement.confirm_cash", "disbursement.confirm_bank"], visible: (r) => r.status === "AUTHORISED" }]} /></PageBody>;
}

export function DisbursementHistoryPage() {
  return <PageBody><PageHeader title="Disbursement History" /><DataTable name="Disbursement history" fetcher={disbursementsApi.list} columns={cols} dateRange defaultSort="-disbursement_date" searchPlaceholder="Search disbursements" filters={[{ key: "status", label: "Status", options: statusOptions(["REQUESTED", "AUTHORISED", "CONFIRMED", "FAILED", "REJECTED"]) }, { key: "method", label: "Method", options: PAYMENT_METHODS }]} rowActions={[{ label: "View", href: (r) => `/disbursements/${r.id}` }]} /></PageBody>;
}

function RequestForm() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const preset = useSearchParams().get("loan") ?? "";
  const loans = useQuery({ queryKey: ["options", "disbursable"], queryFn: ({ signal }) => loansApi.list({ status: "ACCEPTED,PENDING_DISBURSEMENT", limit: 100 }, signal) });
  const [loanId, setLoanId] = useState(preset);
  const [key] = useState(newIdempotencyKey);
  const preview = useQuery({ queryKey: ["disb-preview", loanId], queryFn: ({ signal }) => disbursementsApi.preview(loanId, signal), enabled: Boolean(loanId) });
  const fields: FieldDef[] = [{ name: "method", label: "Disbursement Method", type: "select", options: PAYMENT_METHODS, required: true, defaultValue: "CASH" }, { name: "cash_bank_account", label: "Cash/Bank Account", required: true, defaultValue: "Teller cash — main vault" }, { name: "disbursement_date", label: "Disbursement Date", type: "date", required: true, defaultValue: todayISO(), minToday: true }];
  const form = useZodForm(fields);
  const p = preview.data;
  const blocked = p?.checks.some((c) => !c.passed);
  const submit = form.handleSubmit(async (v) => { const r = await execute(() => disbursementsApi.request(loanId, v, key), { success: "Disbursement requested", simulated: true }); router.push(`/disbursements/${r.id}`); });
  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Select loan"><select aria-label={t("Loan Account")} className="w-full rounded-md border bg-transparent p-2 text-sm" value={loanId} onChange={(e) => setLoanId(e.target.value)}><option value="">{t("Select")}</option>{(loans.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.account_no} · {l.borrower_name}</option>)}</select></Section>
      {loanId && (preview.isLoading ? <LoadingSkeleton rows={3} /> : p && <>
        <Section title="Amounts" description={p.fee_basis} actions={<SimulatedTag />}><DetailGrid columns={4} items={[["Approved Principal", <MoneyDisplay key="a" value={p.approved_principal} currency={p.loan.currency} />], ["Remaining Commitment", <MoneyDisplay key="r" value={p.remaining_commitment} currency={p.loan.currency} />], ["Fees Deducted", <MoneyDisplay key="f" value={p.fees_deducted} currency={p.loan.currency} />], ["Net Disbursement", <MoneyDisplay key="n" value={p.net_disbursement} currency={p.loan.currency} />]]} /></Section>
        <Section title="Pre-disbursement checks"><ul className="space-y-1 text-sm">{p.checks.map((c) => <li key={c.label} className="flex items-center gap-2"><StatusBadge status={c.passed ? "PASS" : "FAIL"} />{t(c.label)}</li>)}</ul></Section>
        <Section title="Payment"><FormFields form={form} fields={fields} columns={3} /></Section>
        <div className="flex justify-end"><Button type="submit" disabled={Boolean(blocked)}>{t("Submit Request")}</Button></div>
      </>)}
    </form>
  );
}

export function DisbursementRequestPage() { return <PageBody><PageHeader title="Disbursement Request" /><Suspense fallback={<LoadingSkeleton />}><RequestForm /></Suspense></PageBody>; }

const useDisbursement = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["disbursement", id], queryFn: ({ signal }) => disbursementsApi.get(id, signal) as Promise<Disbursement & { checks: { label: string; passed: boolean }[] }> }) }; };

function Summary({ d }: { d: Disbursement }) {
  const m = (v: string) => <MoneyDisplay value={v} currency={d.currency} />;
  return <Section title="Disbursement"><DetailGrid columns={4} items={[["Loan Account", <Link key="l" className="text-primary hover:underline" href={`/loans/${d.loan_id}`}>{d.loan_account_no}</Link>], ["Borrower", d.borrower_name], ["Approved Principal", m(d.approved_principal)], ["Fees Deducted", m(d.fees_deducted)], ["Net Disbursement", m(d.net_disbursement)], ["Disbursement Method", <StatusBadge key="m" status={d.method} />], ["Cash/Bank Account", d.cash_bank_account], ["Disbursement Date", formatDate(d.disbursement_date)], ["Reference Number", d.reference_number], ["Requested by", d.requested_by_name], ["Authorised by", d.authorised_by_name], ["Confirmed by", d.confirmed_by_name]]} />{d.rejection_reason && <p className="mt-3 rounded-md bg-danger-soft p-2 text-sm text-danger">{d.rejection_reason}</p>}</Section>;
}
const STEPS = ["REQUESTED", "AUTHORISED", "CONFIRMED"];

export function DisbursementDetailPage() {
  const t = useT();
  const { id, query } = useDisbursement();
  return <PageBody><QueryView query={query}>{(d) => (<><PageHeader title={d.disbursement_no} badge={<StatusBadge status={d.status} />} actions={<>{d.status === "REQUESTED" && <Button asChild size="sm"><Link href={`/disbursements/${id}/approve`}>{t("Disbursement Approval")}</Link></Button>}{d.status === "AUTHORISED" && <Button asChild size="sm"><Link href={`/disbursements/${id}/confirm`}>{t("Confirm Disbursement")}</Link></Button>}{d.status === "CONFIRMED" && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />{t("Print Receipt")}</Button>}</>} /><Section><WorkflowSteps steps={STEPS} current={d.status} failed={["FAILED", "REJECTED"].includes(d.status)} /></Section><Summary d={d} /></>)}</QueryView></PageBody>;
}

export function DisbursementApprovalPage() {
  const t = useT();
  const { id, query } = useDisbursement();
  return <PageBody><PageHeader title="Disbursement Approval" /><QueryView query={query}>{(d) => (<div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><Summary d={d} /><Section title="Pre-disbursement checks"><ul className="space-y-1 text-sm">{d.checks.map((c) => <li key={c.label} className="flex items-center gap-2"><StatusBadge status={c.passed ? "PASS" : "FAIL"} />{t(c.label)}</li>)}</ul></Section></div><ApprovalPanel currency={d.currency} makers={[{ label: "Requested by", id: d.requested_by, name: d.requested_by_name }]}>{d.status === "REQUESTED" && <><ActionButton label="Authorise" icon={Check} perms={["disbursement.authorise"]} action={{ title: "Authorise disbursement", simulated: true, summary: <p>{t("Authorise payment of")} <MoneyDisplay value={d.net_disbursement} currency={d.currency} /> {t("to")} {d.borrower_name} ({d.loan_account_no}).</p>, fields: [{ name: "comment", label: "Comment", type: "textarea" }], run: (v) => disbursementsApi.action(id, "authorise", v), successMessage: "Disbursement authorised" }} /><ActionButton label="Reject" icon={X} variant="destructive" perms={["disbursement.authorise"]} action={{ title: "Reject disbursement", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => disbursementsApi.action(id, "reject", v), successMessage: "Disbursement rejected" }} /></>}</ApprovalPanel></div>)}</QueryView></PageBody>;
}

export function ConfirmDisbursementPage() {
  const t = useT();
  const { id, query } = useDisbursement();
  const [key] = useState(newIdempotencyKey);
  return <PageBody><PageHeader title="Confirm Disbursement" description="Confirmation records the payout, posts the journal and activates the schedule in one server transaction." /><QueryView query={query}>{(d) => (<><Summary d={d} />{d.status === "AUTHORISED" ? <div className="flex flex-wrap gap-2"><ActionButton label="Confirm Payout" icon={Check} perms={d.method === "CASH" ? ["disbursement.confirm_cash"] : ["disbursement.confirm_bank"]} action={{ title: "Confirm payout", simulated: true, summary: <p>{t("Pay")} <MoneyDisplay value={d.net_disbursement} currency={d.currency} /> {t("to")} {d.borrower_name}. {t("Principal recorded")}: <MoneyDisplay value={d.amount} currency={d.currency} />.</p>, fields: d.method === "CASH" ? [] : [{ name: "reference_number", label: "Bank transfer reference", required: true }], run: (v) => disbursementsApi.action(id, "confirm", v, key), successMessage: "Disbursement confirmed" }} /><ActionButton label="Mark as Failed" icon={CircleX} variant="destructive" perms={["disbursement.confirm_cash", "disbursement.confirm_bank"]} action={{ title: "Mark disbursement as failed", destructive: true, description: "No loan balance is created.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => disbursementsApi.action(id, "fail", v), successMessage: "Marked as failed" }} /></div> : <p className="text-sm text-muted-foreground">{t("This disbursement is not awaiting confirmation.")}</p>}</>)}</QueryView></PageBody>;
}
