"use client";
import { useQuery } from "@tanstack/react-query";
import { Check, FileSignature, Play, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatusBadge, statusLabel } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { ScheduleTable } from "@/components/shared/schedule-table";
import { LoadingSkeleton } from "@/components/shared/states";
import { StatusTimeline, WorkflowSteps } from "@/components/shared/timelines";
import { DataTable, type Col } from "@/components/tables/data-table";
import { statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { loansApi } from "@/lib/api/loans";
import { modificationsApi } from "@/lib/api/servicing";
import { useCan } from "@/lib/auth/store";
import { formatDate, todayISO } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Row } from "@/types";

const STATUSES = ["REQUESTED", "ASSESSED", "APPROVED", "SIGNED", "EXECUTED", "REJECTED"];
const cols = (base: string): Col<Row>[] => [{ key: "reference", label: "Reference", href: (r) => `/${base}/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "reason", label: "Reason" }, { key: "effective_date", label: "Effective Date", type: "date" }, { key: "requested_by_name", label: "Requested by" }, { key: "status", label: "Status", type: "status" }];

function ModList({ kind, base, title, description, params }: { kind?: string; base: string; title: string; description: string; params?: Record<string, string> }) {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title={title} description={description} actions={kind && can("restructure.request") && <Button asChild size="sm"><Link href={`/${base}/new`}><Plus className="size-4" />{t("New Request")}</Link></Button>} /><DataTable name={title} fetcher={modificationsApi.list} params={{ ...(kind ? { kind } : {}), ...params }} columns={cols(base)} dateRange defaultSort="-created_at" searchPlaceholder="Search requests" filters={[{ key: "status", label: "Status", options: statusOptions(STATUSES) }]} rowActions={[{ label: "View", href: (r) => `/${base}/${r.id}` }]} /></PageBody>;
}
export const ReschedulingListPage = () => <ModList kind="RESCHEDULING" base="rescheduling" title="Rescheduling Requests" description="Changes to due dates or installment amounts without changing the rate or principal." />;
export const RestructuringListPage = () => <ModList kind="RESTRUCTURING" base="restructuring" title="Restructuring Requests" description="Changes to key terms due to borrower difficulty. Treatment must be reviewed (V-09)." />;
export const RestructuringApprovalsPage = () => <ModList base="restructuring" title="Approval Workflow" description="Requests waiting for assessment or approval." params={{ status: "REQUESTED,ASSESSED" }} />;
export const ModificationHistoryPage = () => <ModList base="restructuring" title="Modification History" description="All executed and rejected modifications." params={{ status: "EXECUTED,REJECTED" }} />;

function NewForm({ kind, base }: { kind: string; base: string }) {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const preset = useSearchParams().get("loan") ?? "";
  const loans = useQuery({ queryKey: ["options", "active-loans"], queryFn: ({ signal }) => loansApi.list({ status: "ACTIVE", limit: 200, sort: "account_no" }, signal) });
  const fields: FieldDef[] = [{ name: "loan_id", label: "Loan Account", type: "select", required: true, defaultValue: preset, span: 2, options: (loans.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.account_no} · ${l.borrower_name}` })) }, { name: "term", label: "Proposed Number of Installments", type: "number", required: true }, ...(kind === "RESTRUCTURING" ? [{ name: "annual_rate", label: "Proposed Rate (% per year)", type: "percent" as const }] : []), { name: "effective_date", label: "Effective Date", type: "date", required: true, defaultValue: todayISO(), minToday: true }, { name: "overdue_treatment", label: "Overdue Amounts", type: "select", required: true, defaultValue: "Keep due", options: ["Keep due", "Spread over new installments", "Capitalise (requires approval)"].map((v) => ({ value: v, label: v })) }, { name: "reason", label: "Reason", type: "textarea", required: true }];
  const form = useZodForm(fields, { loan_id: preset });
  const submit = form.handleSubmit(async (v) => { const r = await execute(() => modificationsApi.create({ ...v, kind, term: Number(v.term) }), { success: "Request created. The revised schedule was returned by the server.", simulated: true }); router.push(`/${base}/${String(r.id)}`); });
  return <form onSubmit={submit}><Section><FormFields form={form} fields={fields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit">{t("Submit Request")}</Button></div></Section></form>;
}
export const NewReschedulingPage = () => <PageBody><PageHeader title="New Rescheduling Request" /><Suspense fallback={<LoadingSkeleton />}><NewForm kind="RESCHEDULING" base="rescheduling" /></Suspense></PageBody>;
export const NewRestructuringPage = () => <PageBody><PageHeader title="New Restructuring Request" /><Suspense fallback={<LoadingSkeleton />}><NewForm kind="RESTRUCTURING" base="restructuring" /></Suspense></PageBody>;

export function ModificationDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["modification", id], queryFn: ({ signal }) => modificationsApi.get(id, signal) });
  return <PageBody><QueryView query={query}>{(m) => {
    const status = String(m.status);
    const cur = m.currency as CurrencyCode;
    const e = m.existing as Record<string, string>, p = m.proposed as Record<string, string>;
    const money = (v: string) => <MoneyDisplay value={v} currency={cur} />;
    const rows: [string, React.ReactNode, React.ReactNode][] = [["Interest Rate", `${e.annual_rate} %`, `${p.annual_rate} %`], ["Number of Installments", e.term, p.term], ["Repayment Frequency", t(statusLabel(e.frequency)), t(statusLabel(p.frequency))], ["Maturity Date", formatDate(e.maturity_date), formatDate(p.maturity_date)], ["Installment", money(e.installment), money(p.installment)], ["Total Interest", money(e.total_interest), money(p.total_interest)]];
    const reason: FieldDef[] = [{ name: "reason", label: "Reason", type: "textarea", required: true }];
    return (<>
      <PageHeader title={String(m.reference)} description={`${String(m.loan_account_no)} · ${String(m.borrower_name)}`} badge={<StatusBadge status={status} />} />
      <Section><WorkflowSteps steps={["REQUESTED", "ASSESSED", "APPROVED", "SIGNED", "EXECUTED"]} current={status} failed={status === "REJECTED"} /></Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Existing and proposed terms" actions={<SimulatedTag />} flush><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3 font-medium">{t("Term")}</th><th className="p-3 font-medium">{t("Existing")}</th><th className="p-3 font-medium">{t("Proposed")}</th></tr></thead><tbody>{rows.map(([l, a, b]) => <tr key={l} className="border-b last:border-0"><td className="p-3 text-muted-foreground">{t(l)}</td><td className="p-3 tabular">{a}</td><td className="p-3 font-medium tabular">{b}</td></tr>)}</tbody></table></div></Section>
          <Section title="Details"><DetailGrid items={[["Type", <StatusBadge key="k" status={String(m.kind)} />], ["Effective Date", formatDate(String(m.effective_date))], ["Overdue Amounts", t(String(m.overdue_treatment))], ["Reason", String(m.reason)]]} /></Section>
          <Section title="Proposed schedule" flush><ScheduleTable currency={cur} rows={m.proposed_installments as never} /></Section>
        </div>
        <div className="space-y-4">
          <ApprovalPanel currency={cur} makers={[{ label: "Requested by", id: String(m.requested_by), name: String(m.requested_by_name) }]}>
            {status === "REQUESTED" && <ActionButton label="Record Assessment" icon={Search} variant="outline" perms={["restructure.assess"]} action={{ title: "Record assessment", fields: [{ name: "reason", label: "Assessment notes", type: "textarea", required: true }], run: (v) => modificationsApi.action(id, "assess", v), successMessage: "Assessment recorded" }} />}
            {["REQUESTED", "ASSESSED"].includes(status) && <><ActionButton label="Approve" icon={Check} perms={["restructure.approve"]} action={{ title: "Approve modification", simulated: true, run: () => modificationsApi.action(id, "approve"), successMessage: "Modification approved" }} /><ActionButton label="Reject" icon={X} variant="destructive" perms={["restructure.approve"]} action={{ title: "Reject modification", destructive: true, fields: reason, run: (v) => modificationsApi.action(id, "reject", v), successMessage: "Modification rejected" }} /></>}
            {status === "APPROVED" && <ActionButton label="Record Borrower Signature" icon={FileSignature} perms={["restructure.request"]} action={{ title: "Record signed modification agreement", fields: [{ name: "file", label: "Signed Agreement", type: "file", required: true }], run: () => modificationsApi.action(id, "sign"), successMessage: "Signature recorded" }} />}
            {status === "SIGNED" && <ActionButton label="Execute" icon={Play} perms={["restructure.approve"]} action={{ title: "Execute modification", simulated: true, description: "Creates new terms and schedule versions. Originals stay on record.", run: () => modificationsApi.action(id, "execute"), successMessage: "Modification executed" }} />}
          </ApprovalPanel>
          <Section title="History"><StatusTimeline items={(m.history as { status: string; at: string; by: string; reason: string }[]).map((h) => ({ status: h.status, at: h.at, actor: h.by, reason: h.reason }))} /></Section>
        </div>
      </div>
    </>);
  }}</QueryView></PageBody>;
}
