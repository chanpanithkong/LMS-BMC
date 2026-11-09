"use client";
import { ArrowUpRight, Check, FileQuestion, FilePlus2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { ApplicationSummary, appColumns, useApplication } from "@/components/applications/views";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatCard, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useAction } from "@/hooks/use-action";
import { applicationsApi } from "@/lib/api/applications";
import { approvalsApi } from "@/lib/api/approvals";
import { assessmentsApi } from "@/lib/api/assessments";
import { calculationsApi } from "@/lib/api/products";
import { useCan } from "@/lib/auth/store";
import { formatDateTime } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { Application } from "@/types";

const queueCols: Col<Application>[] = appColumns.map((c) => (c.key === "reference" ? { ...c, render: undefined, href: (r: Application) => `/assessments/${r.id}` } : c));
const approvalCols: Col<Application>[] = [...appColumns.map((c) => (c.key === "reference" ? { ...c, render: undefined, href: (r: Application) => `/approvals/${r.id}` } : c)), { key: "approval_level", label: "Level", type: "number" }];

export function AssessmentQueuePage() {
  return <PageBody><PageHeader title="Assessment Queue" description="Applications waiting for credit assessment and analyst recommendation." /><DataTable name="Assessment queue" fetcher={assessmentsApi.queue} params={{ status: "PENDING_CREDIT_ASSESSMENT" }} columns={queueCols} emptyTitle="No applications waiting for assessment" searchPlaceholder="Search applications" rowActions={[{ label: "Assess", href: (r) => `/assessments/${r.id}`, perms: ["credit.assess"] }, { label: "Affordability", href: (r) => `/assessments/${r.id}/affordability` }]} /></PageBody>;
}

const assessFields: FieldDef[] = [
  { name: "verified_income", label: "Verified Monthly Income", type: "money", required: true }, { name: "verified_expenses", label: "Verified Monthly Expenses", type: "money", required: true }, { name: "existing_installments", label: "Existing Debt Installments", type: "money" },
  { name: "risk_grade", label: "Risk Grade", type: "select", required: true, options: ["A", "B", "C", "D"].map((g) => ({ value: g, label: g })) }, { name: "recommendation", label: "Analyst Recommendation", type: "select", required: true, options: [{ value: "APPROVE", label: "Approve" }, { value: "APPROVE_WITH_CONDITIONS", label: "Approve with conditions" }, { value: "REJECT", label: "Reject" }] }, { name: "rationale", label: "Rationale", type: "textarea", required: true },
];
const CHECKLIST = ["Identity verified", "Income evidence on file", "DSR within internal policy", "No active blacklist", "Collateral documents reviewed"];

function AssessmentForm({ a }: { a: Application }) {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const can = useCan();
  const form = useZodForm(assessFields, { verified_income: a.income.salary, verified_expenses: a.expenses.household, existing_installments: a.liabilities[0]?.installment });
  const [checks, setChecks] = useState<Record<string, string>>(() => Object.fromEntries(CHECKLIST.map((c) => [c, "PASS"])));
  const [busy, setBusy] = useState(false);
  if (!can("credit.assess")) return null;
  if (a.status !== "PENDING_CREDIT_ASSESSMENT") return <Section><EmptyState title="Assessment is not open" description="This application is not currently waiting for credit assessment." /></Section>;
  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    try {
      await execute(() => assessmentsApi.submit(a.id, { ...(v as unknown as Parameters<typeof assessmentsApi.submit>[1]), checklist: CHECKLIST.map((item) => ({ item, result: checks[item] })) }), { success: "Recommendation submitted for approval" });
      router.push(`/assessments/${a.id}/affordability`);
    } catch { /* reported by the action toast */ } finally { setBusy(false); }
  });
  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Assessment" description="DSR and the proposed installment are computed by the server."><FormFields form={form} fields={assessFields} columns={3} /></Section>
      <Section title="Checklist" flush><ul className="divide-y">{CHECKLIST.map((c) => <li key={c} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"><span>{t(c)}</span><div className="flex gap-1" role="group" aria-label={t(c)}>{["PASS", "WARNING", "FAIL"].map((r) => <button key={r} type="button" aria-pressed={checks[c] === r} onClick={() => setChecks((x) => ({ ...x, [c]: r }))} className={`rounded border px-2 py-0.5 text-xs ${checks[c] === r ? "border-primary bg-accent font-medium" : "text-muted-foreground"}`}>{t(r === "PASS" ? "Pass" : r === "WARNING" ? "Warning" : "Fail")}</button>)}</div></li>)}</ul></Section>
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{t(busy ? "Saving…" : "Submit Recommendation")}</Button></div>
    </form>
  );
}

export function AssessmentDetailPage() {
  const t = useT();
  const { id, query } = useApplication();
  return <PageBody><QueryView query={query}>{(a) => (<><PageHeader title={`${t("Credit Assessment")} · ${a.reference}`} description={a.borrower_name} badge={<StatusBadge status={a.status} />} actions={<Button asChild variant="outline" size="sm"><Link href={`/assessments/${id}/affordability`}>{t("Affordability Assessment")}</Link></Button>} /><ApplicationSummary a={a} /><AssessmentForm a={a} />{a.assessment && <AssessmentResult a={a} />}</>)}</QueryView></PageBody>;
}

function AssessmentResult({ a }: { a: Application }) {
  const t = useT();
  const x = a.assessment!;
  const m = (v: string) => <MoneyDisplay value={v} currency={a.currency} />;
  return (
    <Section title="Analyst Recommendation" description={`${x.analyst_name} · ${formatDateTime(x.at)} · ${t("Version")} ${x.version}`} actions={<StatusBadge status={x.recommendation} />}>
      <DetailGrid columns={4} items={[["Monthly Income", m(x.verified_income)], ["Monthly Expenses", m(x.verified_expenses)], ["Existing Debt", m(x.existing_installments)], ["Proposed Installment", m(x.proposed_installment)], ["Debt Service Ratio (DSR)", `${x.dsr_percent} %`], ["Net Disposable Income", m(x.net_disposable_income)], ["Risk Assessment", x.risk_grade]]} />
      <p className="mt-3 text-sm">{x.rationale}</p>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">{x.checklist.map((c) => <li key={c.item} className="flex items-center gap-1"><StatusBadge status={c.result} />{t(c.item)}</li>)}</ul>
    </Section>
  );
}

export function AffordabilityPage() {
  const t = useT();
  const { query } = useApplication();
  const app = query.data;
  const source = app?.assessment;
  const result = useQuery({
    queryKey: ["affordability", app?.id, source?.version], enabled: Boolean(source), retry: false,
    queryFn: () => calculationsApi.affordability({ monthly_income: source!.verified_income, monthly_expenses: source!.verified_expenses, existing_installments: source!.existing_installments, proposed_installment: source!.proposed_installment }),
  });
  return (
    <PageBody><PageHeader title="Affordability Assessment" badge={<SimulatedTag />} description="Thresholds are internal policy, not regulation." /><QueryView query={query}>{(a) => !a.assessment ? <Section><EmptyState title="Not assessed yet" description="Affordability is available after the analyst records verified income and expenses." /></Section> : (<>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Monthly Income" value={<MoneyDisplay value={a.assessment.verified_income} currency={a.currency} />} />
        <StatCard title="Proposed Installment" value={<MoneyDisplay value={a.assessment.proposed_installment} currency={a.currency} />} />
        <StatCard title="Debt Service Ratio (DSR)" value={`${result.data?.dsr_percent ?? a.assessment.dsr_percent} %`} definition="All monthly debt installments including the proposed one ÷ verified monthly income." />
        <StatCard title="Repayment Capacity" value={result.data ? `${result.data.repayment_capacity_percent} %` : "—"} definition="Proposed installment ÷ net disposable income before the new loan." />
      </div>
      <Section title="Cash flow"><DetailGrid columns={3} items={[["Monthly Expenses", <MoneyDisplay key="a" value={a.assessment.verified_expenses} currency={a.currency} />], ["Existing Debt", <MoneyDisplay key="b" value={a.assessment.existing_installments} currency={a.currency} />], ["Net Disposable Income", <MoneyDisplay key="c" value={result.data?.net_disposable_income ?? a.assessment.net_disposable_income} currency={a.currency} />]]} />{result.data && <p className="mt-3 text-xs text-muted-foreground">{t(result.data.thresholds_note)}</p>}</Section>
    </>)}</QueryView></PageBody>
  );
}

export function ApprovalQueuePage() {
  const t = useT();
  return <PageBody><PageHeader title="Approval Queue" description="Applications that need a credit decision, by level and limit." /><ApprovalPanel note="Approvers cannot decide on applications they created or assessed." /><DataTable name="Approval queue" fetcher={approvalsApi.queue} params={{ status: "PENDING_APPROVAL" }} columns={approvalCols} emptyTitle="No applications awaiting approval" searchPlaceholder="Search applications" rowActions={[{ label: "Review and Decide", href: (r) => `/approvals/${r.id}` }]} toolbar={<Button asChild variant="outline" size="sm"><Link href="/approvals/history">{t("History")}</Link></Button>} /></PageBody>;
}

export function ApprovalDetailPage() {
  const t = useT();
  const { id, query } = useApplication();
  const reason: FieldDef[] = [{ name: "reason", label: "Reason", type: "textarea", required: true }];
  return (
    <PageBody><QueryView query={query}>{(a) => {
      const open = a.status === "PENDING_APPROVAL";
      const money = <MoneyDisplay value={a.requested_amount} currency={a.currency} />;
      return (<>
        <PageHeader title={`${t("Approval Details")} · ${a.reference}`} description={a.borrower_name} badge={<StatusBadge status={a.status} />} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ApplicationSummary a={a} />
            {a.assessment ? <AssessmentResult a={a} /> : <Section><EmptyState title="No assessment on record" /></Section>}
            <Section title="Supporting Documents"><ul className="space-y-1 text-sm">{a.documents.map((d) => <li key={d.name} className="flex items-center gap-2"><StatusBadge status={d.provided ? "PASS" : "FAIL"} />{t(d.name)}</li>)}</ul></Section>
            {a.policy_exceptions.length > 0 && <Section title="Policy Exceptions"><ul className="space-y-1 text-sm">{a.policy_exceptions.map((e) => <li key={e.type} className="flex items-center gap-2"><StatusBadge status={e.approved ? "APPROVED" : "PENDING"} />{t(e.type)}</li>)}</ul></Section>}
            {a.decisions.length > 0 && <Section title="Approval History"><ul className="space-y-2 text-sm">{a.decisions.map((d, i) => <li key={i} className="flex flex-wrap items-center gap-2"><StatusBadge status={d.decision} /><span>{t("Level")} {d.level} · {d.actor} · {formatDateTime(d.at)}</span><span className="text-muted-foreground">{d.reason}</span></li>)}</ul></Section>}
          </div>
          <div>
            <ApprovalPanel currency={a.currency} level={a.approval_level} requiredLevels={a.required_levels} makers={[{ label: "Prepared by", id: a.created_by, name: a.created_by_name }, { label: "Analyst", id: a.assessment?.analyst_id, name: a.assessment?.analyst_name }]} note="Amounts above your limit are recorded at this level and escalated to the next.">
              {open && <>
                <ActionButton label="Approve" icon={Check} perms={["credit.approve"]} action={{ title: "Approve application", summary: <p>{t("Approve")} {money} {t("for")} {a.borrower_name}.</p>, fields: [{ name: "approved_amount", label: "Approved Amount", type: "money", currency: a.currency, defaultValue: a.requested_amount, required: true }, { name: "conditions", label: "Conditions", type: "textarea" }, { name: "reason", label: "Comment", type: "textarea" }], run: (v) => approvalsApi.decide(id, "approve", v), successMessage: "Decision recorded", simulated: true }} />
                <ActionButton label="Reject" icon={X} variant="destructive" perms={["credit.approve"]} action={{ title: "Reject application", destructive: true, summary: <p>{t("Reject")} {money} {t("for")} {a.borrower_name}.</p>, fields: reason, run: (v) => approvalsApi.decide(id, "reject", v), successMessage: "Application rejected" }} />
                <ActionButton label="Return for Documents" icon={FilePlus2} variant="outline" perms={["credit.approve"]} action={{ title: "Return for documents", fields: reason, run: (v) => approvalsApi.decide(id, "request-documents", v), successMessage: "Returned for documents" }} />
                <ActionButton label="Request Additional Information" icon={FileQuestion} variant="outline" perms={["credit.approve"]} action={{ title: "Request additional information", fields: reason, run: (v) => approvalsApi.decide(id, "request-info", v), successMessage: "Information requested" }} />
                <ActionButton label="Escalate" icon={ArrowUpRight} variant="outline" perms={["credit.approve"]} action={{ title: "Escalate to next level", fields: reason, run: (v) => approvalsApi.decide(id, "escalate", v), successMessage: "Escalated" }} />
              </>}
            </ApprovalPanel>
          </div>
        </div>
      </>);
    }}</QueryView></PageBody>
  );
}

export function ApprovalHistoryPage() {
  return <PageBody><PageHeader title="Approval History" description="Decided applications with their decision records." /><DataTable name="Approval history" fetcher={applicationsApi.list} params={{ status: "APPROVED,REJECTED" }} columns={approvalCols} searchPlaceholder="Search applications" rowActions={[{ label: "View", href: (r) => `/approvals/${r.id}` }]} /></PageBody>;
}
