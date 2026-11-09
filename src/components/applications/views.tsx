"use client";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, FileUp, History, Plus, Send, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatusBadge } from "@/components/shared/display";
import { FileUploader } from "@/components/shared/document";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState, LoadingSkeleton } from "@/components/shared/states";
import { StatusTimeline, WorkflowSteps } from "@/components/shared/timelines";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useBranchOptions, useProductOptions } from "@/components/tables/filter-panel";
import { APPLICATION_STATUSES, statusOptions } from "@/config/options";
import { describeError, useAction } from "@/hooks/use-action";
import { applicationsApi } from "@/lib/api/applications";
import { borrowersApi } from "@/lib/api/borrowers";
import { calculationsApi, productsApi } from "@/lib/api/products";
import { useCan } from "@/lib/auth/store";
import { formatDateTime, todayISO } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Application } from "@/types";

export const WORKFLOW = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL", "APPROVED"];
export const appColumns: Col<Application>[] = [
  { key: "reference", label: "Reference", render: (r) => <Link className="font-medium text-primary hover:underline" href={`/applications/${r.id}`}>{r.reference ?? "Draft"}</Link> }, { key: "borrower_name", label: "Borrower" }, { key: "product_name", label: "Product" }, { key: "requested_amount", label: "Amount", type: "money", currency: (r) => r.currency }, { key: "term", label: "Term", type: "number" }, { key: "branch_name", label: "Branch" }, { key: "created_by_name", label: "Loan Officer", hidden: true }, { key: "created_at", label: "Created", type: "date" }, { key: "status", label: "Status", type: "status" },
];

export function ApplicationListPage() {
  const branches = useBranchOptions();
  const products = useProductOptions();
  const can = useCan();
  const t = useT();
  return (
    <PageBody>
      <PageHeader title="Loan Applications" description="Track applications from draft to decision." actions={can("application.create") && <Button asChild size="sm"><Link href="/applications/new"><Plus className="size-4" />{t("New Loan Application")}</Link></Button>} />
      <DataTable name="Loan Applications" fetcher={applicationsApi.list} columns={appColumns} searchPlaceholder="Search applications" dateRange defaultSort="-created_at" filters={[{ key: "status", label: "Status", options: statusOptions(APPLICATION_STATUSES) }, { key: "branch_id", label: "Branch", options: branches }, { key: "product_id", label: "Product", options: products }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/applications/${r.id}` }, { label: "Documents", icon: FileUp, href: (r) => `/applications/${r.id}/documents` }, { label: "Status History", icon: History, href: (r) => `/applications/${r.id}/history` }]} />
    </PageBody>
  );
}

const STEPS = ["Borrower Information", "Loan Product", "Loan Amount and Term", "Income and Expenses", "Existing Liabilities", "Collateral and Guarantor", "Supporting Documents", "Review and Submit"];

function Wizard() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const preset = useSearchParams().get("borrower") ?? "";
  const borrowers = useQuery({ queryKey: ["options", "borrowers"], queryFn: ({ signal }) => borrowersApi.list({ limit: 200, sort: "name_en" }, signal) });
  const products = useQuery({ queryKey: ["options", "active-products"], queryFn: ({ signal }) => productsApi.list({ status: "ACTIVE", limit: 100 }, signal) });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const fieldSets: FieldDef[][] = useMemo(() => [
    [{ name: "borrower_id", label: "Borrower", type: "select", required: true, defaultValue: preset, span: 2, options: (borrowers.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.name_en} · ${b.customer_code}` })) }],
    [{ name: "product_id", label: "Loan Product", type: "select", required: true, span: 2, options: (products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.name_en} (${p.code})` })) }],
    [{ name: "requested_amount", label: "Loan Amount", type: "money", required: true, currency: (v) => ((products.data?.items ?? []).find((p) => p.id === v.product_id)?.currency ?? "USD") }, { name: "term", label: "Loan Term (Installments)", type: "number", required: true }, { name: "purpose", label: "Loan Purpose", required: true, span: 2 }],
    [{ name: "salary", label: "Monthly Salary or Business Income", type: "money", required: true }, { name: "other_income", label: "Other Monthly Income", type: "money" }, { name: "household", label: "Household Expenses", type: "money", required: true }, { name: "business", label: "Business Expenses", type: "money" }],
    [{ name: "lender", label: "Lender" }, { name: "liability_outstanding", label: "Outstanding Balance", type: "money" }, { name: "liability_installment", label: "Monthly Installment", type: "money" }],
    [{ name: "collateral_type", label: "Collateral Type" }, { name: "collateral_description", label: "Description" }, { name: "collateral_value", label: "Estimated Value", type: "money" }, { name: "guarantor_name", label: "Guarantor Name" }, { name: "guarantor_relationship", label: "Relationship" }, { name: "guarantor_phone", label: "Guarantor Phone", type: "phone" }],
  ], [borrowers.data, products.data, preset]);
  const allFields = useMemo(() => fieldSets.flat(), [fieldSets]);
  const form = useZodForm(allFields, { borrower_id: preset });
  useEffect(() => { if (preset) form.setValue("borrower_id", preset); }, [preset, form]);
  const values = form.watch();
  const product = (products.data?.items ?? []).find((p) => p.id === values.product_id) as (typeof products.data extends undefined ? never : NonNullable<typeof products.data>["items"][number] & { required_documents?: string; min_principal?: string; max_principal?: string; interest_method?: string; amortisation?: string; annual_rate?: string; day_count?: string; repayment_frequency?: string; min_term?: number; max_term?: number }) | undefined;
  const borrower = (borrowers.data?.items ?? []).find((b) => b.id === values.borrower_id);
  const docs = String(product?.required_documents ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const currency: CurrencyCode = product?.currency ?? "USD";

  const previewEnabled = step === 7 && Boolean(product && values.requested_amount && values.term);
  const schedule = useQuery({
    queryKey: ["app-preview", values.product_id, values.requested_amount, values.term, previewEnabled], enabled: previewEnabled, retry: false,
    queryFn: ({ signal }) => calculationsApi.schedulePreview({ principal: String(values.requested_amount), currency, annual_rate: String(product!.annual_rate), interest_method: String(product!.interest_method), amortisation: String(product!.amortisation), day_count: String(product!.day_count), frequency: String(product!.repayment_frequency), term: Number(values.term), disbursement_date: todayISO() }, signal),
  });
  const installment = schedule.data?.regular_installment;
  const afford = useQuery({
    queryKey: ["app-afford", installment, values.salary, values.household, values.liability_installment], enabled: Boolean(installment && values.salary), retry: false,
    queryFn: () => calculationsApi.affordability({ monthly_income: String(values.salary), monthly_expenses: String(values.household || "0"), existing_installments: String(values.liability_installment || "0.00"), proposed_installment: installment! }),
  });

  const next = async () => {
    if (step < 6 && !(await form.trigger(fieldSets[step].map((f) => f.name)))) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const save = async (submit: boolean) => {
    if (!(await form.trigger())) { toast.error(t("Please complete the required fields.")); return; }
    setBusy(true);
    try {
      const v: Values = form.getValues();
      const created = await execute(() => applicationsApi.create({ borrower_id: v.borrower_id, product_id: v.product_id, requested_amount: v.requested_amount, term: Number(v.term), purpose: v.purpose, income: { salary: v.salary, other: v.other_income }, expenses: { household: v.household, business: v.business }, liabilities: v.lender ? [{ lender: v.lender, outstanding: v.liability_outstanding, installment: v.liability_installment }] : [], proposed_collateral: v.collateral_type ? [{ type: v.collateral_type, description: v.collateral_description, estimated_value: v.collateral_value }] : [], proposed_guarantor: v.guarantor_name ? { name: v.guarantor_name, relationship: v.guarantor_relationship, phone: v.guarantor_phone } : null, uploaded_documents: docs.filter((d) => uploaded[d]) }), { success: submit ? undefined : "Draft saved" });
      if (submit) await execute(() => applicationsApi.action(created.id, "submit"), { success: "Application submitted" });
      router.push(`/applications/${created.id}`);
    } catch { /* reported by the action toast */ } finally { setBusy(false); }
  };
  const m = (v: unknown) => <MoneyDisplay value={String(v || "")} currency={currency} />;
  return (
    <div className="space-y-4">
      <Section><ol className="flex flex-wrap gap-x-3 gap-y-2" aria-label={t("Application steps")}>{STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => i < step && setStep(i)} aria-current={i === step ? "step" : undefined} className={`flex items-center gap-1.5 text-xs ${i === step ? "font-semibold" : "text-muted-foreground"}`}><span className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${i < step ? "border-success bg-success text-white dark:text-black" : i === step ? "border-primary bg-primary text-primary-foreground" : ""}`}>{i < step ? <Check className="size-3" /> : i + 1}</span>{t(s)}</button></li>)}</ol></Section>
      <Section title={`${t("Step")} ${step + 1}: ${t(STEPS[step])}`}>
        {step < 6 && <FormFields form={form} fields={fieldSets[step]} columns={2} />}
        {step === 1 && product && <div className="mt-4"><DetailGrid columns={4} items={[["Minimum Principal", <MoneyDisplay key="a" value={product.min_principal} currency={currency} />], ["Maximum Principal", <MoneyDisplay key="b" value={product.max_principal} currency={currency} />], ["Term Range", `${product.min_term}–${product.max_term}`], ["Interest Rate", `${product.annual_rate} % p.a.`]]} /></div>}
        {step === 6 && (docs.length ? <ul className="space-y-3">{docs.map((d) => <li key={d} className="space-y-1"><p className="text-sm font-medium">{t(d)} <span className="text-destructive">*</span></p><FileUploader value={uploaded[d] ? { name: `${d}.pdf`, size: "—", mime: "application/pdf" } : null} onChange={(f) => setUploaded((u) => ({ ...u, [d]: Boolean(f) }))} /></li>)}</ul> : <EmptyState title="Select a product first" />)}
        {step === 7 && <div className="space-y-4">
          <DetailGrid items={[["Borrower", borrower?.name_en], ["Loan Product", product?.name_en], ["Loan Amount", m(values.requested_amount)], ["Loan Term (Installments)", String(values.term)], ["Loan Purpose", String(values.purpose)], ["Documents provided", `${docs.filter((d) => uploaded[d]).length} / ${docs.length}`]]} />
          <div className="rounded-md border p-3"><p className="mb-2 flex items-center gap-2 text-sm font-medium">{t("Preliminary affordability")}<SimulatedTag /></p>
            {schedule.isFetching ? <LoadingSkeleton rows={2} className="space-y-2" /> : schedule.isError ? <p className="text-sm text-destructive">{t(describeError(schedule.error))}</p> : <DetailGrid columns={4} items={[["Proposed Installment", m(installment)], ["Total Interest", m(schedule.data?.total_interest)], ["Debt Service Ratio (DSR)", afford.data ? `${afford.data.dsr_percent} %` : "—"], ["Net Disposable Income", m(afford.data?.net_disposable_income)]]} />}
            {afford.data && <p className="mt-2 text-xs text-muted-foreground">{t(afford.data.thresholds_note)}</p>}
          </div>
          {docs.some((d) => !uploaded[d]) && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">{t("Some required documents are missing. You can submit, but the application cannot move to credit assessment until they are provided.")}</p>}
        </div>}
      </Section>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("Back")}</Button>
        <div className="flex gap-2">{step === 7 ? <><Button variant="outline" disabled={busy} onClick={() => void save(false)}>{t("Save Draft")}</Button><Button disabled={busy} onClick={() => void save(true)}><Send className="size-4" />{t(busy ? "Submitting…" : "Submit Application")}</Button></> : <Button onClick={() => void next()}>{t("Next")}</Button>}</div>
      </div>
    </div>
  );
}

export function NewApplicationPage() {
  return <PageBody><PageHeader title="New Loan Application" /><Suspense fallback={<LoadingSkeleton />}><Wizard /></Suspense></PageBody>;
}

export const useApplication = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["application", id], queryFn: ({ signal }) => applicationsApi.get(id, signal) }) }; };

function ApplicationActions({ a }: { a: Application }) {
  const act = (action: string, success: string, body?: Values) => () => applicationsApi.action(a.id, action, body).then((r) => { void success; return r; });
  const reason: FieldDef[] = [{ name: "reason", label: "Reason", type: "textarea", required: true }];
  return (<>
    {a.status === "DRAFT" && <ActionButton label="Submit Application" icon={Send} perms={["application.create"]} action={{ title: "Submit application", description: "A reference is assigned and the submitted terms are preserved as a version.", run: act("submit", ""), successMessage: "Application submitted" }} />}
    {a.status === "SUBMITTED" && <ActionButton label="Start Review" perms={["application.review"]} action={{ title: "Start review", run: act("start-review", ""), successMessage: "Review started" }} />}
    {a.status === "UNDER_REVIEW" && <><ActionButton label="Complete Review" icon={Check} perms={["application.review"]} action={{ title: "Move to credit assessment", description: "Required documents must be provided or waived.", run: act("complete-review", ""), successMessage: "Moved to credit assessment" }} /><ActionButton label="Request Documents" variant="outline" perms={["application.review"]} action={{ title: "Request documents", fields: reason, run: (v) => applicationsApi.action(a.id, "request-documents", v), successMessage: "Documents requested" }} /></>}
    {a.status === "PENDING_DOCUMENTS" && <ActionButton label="Documents Provided" perms={["application.create", "application.review"]} action={{ title: "Documents provided", run: act("documents-provided", ""), successMessage: "Returned to review" }} />}
    {a.status === "REJECTED" && <ActionButton label="Resubmit as New Version" icon={Undo2} perms={["application.create"]} action={{ title: "Resubmit application", description: "Earlier versions stay visible.", fields: [{ name: "requested_amount", label: "Requested Amount", type: "money", currency: a.currency }], run: (v) => applicationsApi.action(a.id, "resubmit", v), successMessage: "New draft version created" }} />}
    {["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL"].includes(a.status) && <ActionButton label="Withdraw" icon={X} variant="outline" perms={["application.create"]} action={{ title: "Withdraw application", destructive: true, fields: reason, run: (v) => applicationsApi.action(a.id, "withdraw", v), successMessage: "Application withdrawn" }} />}
  </>);
}

export function ApplicationSummary({ a }: { a: Application }) {
  const m = (v?: string) => <MoneyDisplay value={v} currency={a.currency} />;
  return <Section title="Application summary"><DetailGrid columns={4} items={[["Borrower", <Link key="b" className="text-primary hover:underline" href={`/borrowers/${a.borrower_id}`}>{a.borrower_name}</Link>], ["Product", `${a.product_name} v${a.product_version}`], ["Requested Amount", m(a.requested_amount)], ["Term", a.term], ["Purpose", a.purpose], ["Branch", a.branch_name], ["Loan Officer", a.created_by_name], ["Submitted", formatDateTime(a.submitted_at)], ["Monthly Income", m(a.income.salary)], ["Household Expenses", m(a.expenses.household)], ["Business Expenses", m(a.expenses.business)], ["Existing Debts", a.liabilities.map((l) => `${l.lender}: ${l.installment}`).join("; ")], ["Proposed Collateral", a.proposed_collateral.map((c) => `${c.type} (${c.estimated_value})`).join("; ")], ["Guarantor", a.proposed_guarantor?.name]]} /></Section>;
}

export function ApplicationDetailPage() {
  const t = useT();
  const { id, query } = useApplication();
  return (
    <PageBody><QueryView query={query}>{(a) => (<>
      <PageHeader title={a.reference ?? t("Draft application")} description={a.borrower_name} badge={<StatusBadge status={a.status} />} actions={<><Button asChild variant="outline" size="sm"><Link href={`/applications/${id}/documents`}>{t("Documents")}</Link></Button><Button asChild variant="outline" size="sm"><Link href={`/applications/${id}/review`}>{t("Application Review")}</Link></Button><Button asChild variant="outline" size="sm"><Link href={`/applications/${id}/history`}>{t("Status History")}</Link></Button><ApplicationActions a={a} /></>} />
      <Section><WorkflowSteps steps={WORKFLOW} current={a.status === "PENDING_DOCUMENTS" ? "UNDER_REVIEW" : a.status} failed={["REJECTED", "WITHDRAWN", "EXPIRED"].includes(a.status)} />{["REJECTED", "WITHDRAWN", "EXPIRED"].includes(a.status) && <p className="mt-2 text-sm text-danger">{t("Closed with status")}: <StatusBadge status={a.status} /></p>}</Section>
      <ApplicationSummary a={a} />
      {a.loan_id && <Button asChild variant="outline" size="sm"><Link href={`/loans/${a.loan_id}`}>{t("Open Loan Account")}</Link></Button>}
      <Section title="Comments" actions={<ActionButton label="Add Comment" variant="outline" action={{ title: "Add comment", fields: [{ name: "text", label: "Comment", type: "textarea", required: true }], run: (v) => applicationsApi.action(id, "comment", v), successMessage: "Comment added" }} />}>
        {a.comments.length ? <ul className="space-y-2 text-sm">{a.comments.map((c, i) => <li key={i}><p>{c.text}</p><p className="text-xs text-muted-foreground">{c.author} · {t(c.stage)} · {formatDateTime(c.at)}</p></li>)}</ul> : <EmptyState title="No comments yet" />}
      </Section>
    </>)}</QueryView></PageBody>
  );
}

export function ApplicationDocumentsPage() {
  const t = useT();
  const execute = useAction();
  const { id, query } = useApplication();
  return (
    <PageBody><PageHeader title="Application Documents" description="Required documents must be provided or waived before credit assessment." /><QueryView query={query}>{(a) => <Section title={a.reference ?? t("Draft application")} flush><ul className="divide-y">{a.documents.map((d) => <li key={d.name} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div className="flex items-center gap-2"><Checkbox checked={d.provided} disabled aria-label={d.name} /><span className="font-medium">{t(d.name)}</span>{d.required && <span className="text-xs text-muted-foreground">{t("Required")}</span>}</div>{d.provided ? <span className="text-xs text-muted-foreground">{d.file_name}</span> : <div className="w-full sm:w-72"><FileUploader onChange={(f) => { if (f) void execute(() => applicationsApi.action(id, "mark-document", { name: d.name, file_name: f.name }), { success: "Document added" }); }} /></div>}</li>)}</ul></Section>}</QueryView></PageBody>
  );
}

export function ApplicationReviewPage() {
  const { query } = useApplication();
  return <PageBody><PageHeader title="Application Review" /><QueryView query={query}>{(a) => (<><div className="flex flex-wrap gap-2"><ApplicationActions a={a} /></div><ApplicationSummary a={a} /><Section title="Document checklist"><ul className="space-y-1 text-sm">{a.documents.map((d) => <li key={d.name} className="flex items-center gap-2"><StatusBadge status={d.provided ? "PASS" : "FAIL"} />{d.name}</li>)}</ul></Section></>)}</QueryView></PageBody>;
}

export function ApplicationHistoryPage() {
  const t = useT();
  const { query } = useApplication();
  return <PageBody><PageHeader title="Application Status History" /><QueryView query={query}>{(a) => (<div className="grid gap-4 lg:grid-cols-2"><Section title="Status changes"><StatusTimeline items={a.status_history} /></Section><Section title="Submitted versions">{a.versions.length ? <ul className="space-y-2 text-sm">{a.versions.map((v) => <li key={v.version_no}><span className="font-medium">{t("Version")} {v.version_no}</span> · <MoneyDisplay value={v.requested_amount} currency={a.currency} /> · {v.term} · {v.submitted_by}<span className="block text-xs text-muted-foreground">{formatDateTime(v.submitted_at)}</span></li>)}</ul> : <EmptyState title="Not submitted yet" />}</Section></div>)}</QueryView></PageBody>;
}
