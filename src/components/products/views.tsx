"use client";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Check, CircleSlash, Eye, Pencil, Plus, Send, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatCard, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { ScheduleTable } from "@/components/shared/schedule-table";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { AMORTISATIONS, CURRENCIES, DAY_COUNTS, FREQUENCIES, GRACE_TYPES, INTEREST_METHODS, PRODUCT_TYPES, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { calculationsApi, productsApi, type ScheduleInput } from "@/lib/api/products";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime, todayISO } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Product, ProductConfig, ProductVersion, Row, SchedulePreview } from "@/types";

const label = (list: { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;
const columns: Col<Product>[] = [
  { key: "code", label: "Product Code", href: (r) => `/products/${r.id}` }, { key: "name_en", label: "Product Name" }, { key: "name_km", label: "Khmer Name", hidden: true }, { key: "product_type", label: "Product Type", type: "status" }, { key: "currency", label: "Currency" },
  { key: "annual_rate", label: "Annual Rate", type: "percent" }, { key: "active_version", label: "Active Version", type: "number" }, { key: "pending_versions", label: "Pending Versions", type: "number" }, { key: "status", label: "Status", type: "status" },
];

export function ProductListPage() {
  const t = useT();
  const can = useCan();
  return (
    <PageBody>
      <PageHeader title="Loan Products" description="Products are versioned. Active versions cannot be edited, and new versions never change existing loans." actions={<><Button asChild variant="outline" size="sm"><Link href="/products/calculator"><Calculator className="size-4" />{t("Loan Calculator")}</Link></Button>{can("product.approve") && <Button asChild variant="outline" size="sm"><Link href="/products/approvals">{t("Product Approval")}</Link></Button>}{can("product.propose") && <Button asChild size="sm"><Link href="/products/new"><Plus className="size-4" />{t("Create Loan Product")}</Link></Button>}</>} />
      <DataTable name="Loan Products" fetcher={productsApi.list} columns={columns} searchPlaceholder="Search products" filters={[{ key: "status", label: "Status", options: statusOptions(["DRAFT", "ACTIVE", "RETIRED"]) }, { key: "currency", label: "Currency", options: CURRENCIES }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/products/${r.id}` }, { label: "Version History", href: (r) => `/products/${r.id}/versions` }]} />
    </PageBody>
  );
}

export const configFields: FieldDef[] = [
  { name: "name_en", label: "Product Name", required: true }, { name: "name_km", label: "Product Name (Khmer)", required: true }, { name: "code", label: "Product Code", required: true, help: "Up to 3 letters; part of the loan account number." }, { name: "product_type", label: "Product Type", type: "select", options: PRODUCT_TYPES, required: true }, { name: "currency", label: "Currency", type: "select", options: CURRENCIES, required: true, defaultValue: "USD" },
  { name: "min_principal", label: "Minimum Principal", type: "money", required: true, currency: (v) => (v.currency as CurrencyCode) || "USD" }, { name: "max_principal", label: "Maximum Principal", type: "money", required: true, currency: (v) => (v.currency as CurrencyCode) || "USD" }, { name: "min_term", label: "Minimum Term", type: "number", required: true }, { name: "max_term", label: "Maximum Term", type: "number", required: true },
  { name: "interest_method", label: "Interest Method", type: "select", options: INTEREST_METHODS, required: true }, { name: "amortisation", label: "Repayment Method", type: "select", options: AMORTISATIONS, required: true }, { name: "annual_rate", label: "Interest Rate (% per year)", type: "percent", required: true, help: "Internal policy value. Statutory limits must be verified before activation (V-01)." }, { name: "day_count", label: "Day Count Convention", type: "select", options: DAY_COUNTS, required: true, defaultValue: "30/360" }, { name: "repayment_frequency", label: "Repayment Frequency", type: "select", options: FREQUENCIES, required: true, defaultValue: "MONTHLY" },
  { name: "grace_type", label: "Grace Period", type: "select", options: GRACE_TYPES, defaultValue: "NONE" }, { name: "grace_periods", label: "Grace Periods", type: "number", defaultValue: "0" }, { name: "processing_fee_percent", label: "Processing Fee (%)", type: "percent", required: true, help: "Limits on fees must be verified (V-02)." }, { name: "penalty_rule_id", label: "Penalty Rule", required: true, defaultValue: "pen-1" },
  { name: "eligibility_min_age", label: "Minimum Age", type: "number", defaultValue: "18" }, { name: "eligibility_max_age", label: "Maximum Age", type: "number", defaultValue: "65" }, { name: "eligibility_min_income", label: "Minimum Income", type: "money", currency: (v) => (v.currency as CurrencyCode) || "USD" }, { name: "required_documents", label: "Required Documents", type: "textarea", required: true, defaultValue: "National ID, Proof of residence, Income evidence", help: "Separate with commas." }, { name: "collateral_required", label: "Collateral required", type: "checkbox" }, { name: "min_coverage_percent", label: "Minimum Collateral Coverage (%)", type: "percent", defaultValue: "0" }, { name: "approval_matrix", label: "Approval Matrix", type: "textarea", required: true, defaultValue: "Level 1: Credit Approver up to limit; Level 2: Branch Manager up to limit; Level 3: Business Owner" }, { name: "early_settlement_option", label: "Early Settlement Option", type: "select", defaultValue: "A — Accrued to date", options: [{ value: "A — Accrued to date", label: "A — Accrued to date" }, { value: "B — Full current period", label: "B — Full current period" }, { value: "C — Flat-rate rebate", label: "C — Flat-rate rebate" }, { value: "D — No rebate", label: "D — No rebate" }] }, { name: "waterfall", label: "Repayment Waterfall", defaultValue: "Penalties → Fees → Interest → Principal (oldest first)" },
];

const convert = (v: Values): Values => ({ ...v, min_term: Number(v.min_term), max_term: Number(v.max_term), grace_periods: Number(v.grace_periods || 0), min_principal: v.min_principal, eligibility_min_age: Number(v.eligibility_min_age || 0), eligibility_max_age: Number(v.eligibility_max_age || 0) });

function ConfigForm({ initial, onSave, submitLabel, disableCode }: { initial?: Values; onSave: (v: Values) => Promise<void>; submitLabel: string; disableCode?: boolean }) {
  const t = useT();
  const fields = useState(() => configFields.map((f) => (f.name === "code" && disableCode ? { ...f, disabled: true } : f)))[0];
  const form = useZodForm(fields, initial);
  const [busy, setBusy] = useState(false);
  const submit = form.handleSubmit(async (v) => { setBusy(true); try { await onSave(convert(v)); } catch { /* reported by the action toast */ } finally { setBusy(false); } });
  return <form onSubmit={submit} className="space-y-4"><Section title="Product configuration"><FormFields form={form} fields={fields} columns={3} /></Section><div className="flex justify-end"><Button type="submit" disabled={busy}>{t(busy ? "Saving…" : submitLabel)}</Button></div></form>;
}

export function ProductNewPage() {
  const router = useRouter();
  const execute = useAction();
  return <PageBody><PageHeader title="Create Loan Product" description="A new product starts as a draft and needs approval by a second user." /><ConfigForm submitLabel="Save Draft" onSave={async (v) => { const p = await execute(() => productsApi.create(v), { success: "Product draft saved" }); router.push(`/products/${p.id}`); }} /></PageBody>;
}

const useProduct = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["product", id], queryFn: ({ signal }) => productsApi.get(id, signal) }) }; };

export function ProductEditPage() {
  const router = useRouter();
  const execute = useAction();
  const t = useT();
  const { id, query } = useProduct();
  return (
    <PageBody><PageHeader title="Edit Product Draft" /><QueryView query={query}>{(p) => {
      const draft = p.versions.find((v) => v.status === "DRAFT");
      if (!draft) return <Section><EmptyState title="No draft version" description="Active versions cannot be edited. Create a new version to change this product." action={<Button asChild size="sm"><Link href={`/products/${id}`}>{t("Back to product")}</Link></Button>} /></Section>;
      return <ConfigForm disableCode initial={{ ...draft.config, code: p.code, min_term: String(draft.config.min_term), max_term: String(draft.config.max_term), grace_periods: String(draft.config.grace_periods), eligibility_min_age: String(draft.config.eligibility_min_age), eligibility_max_age: String(draft.config.eligibility_max_age) }} submitLabel="Save Draft" onSave={async (v) => { await execute(() => productsApi.updateDraft(id, draft.version_no, v as Partial<ProductConfig>), { success: "Draft saved" }); router.push(`/products/${id}`); }} />;
    }}</QueryView></PageBody>
  );
}

function configGrid(c: ProductConfig): [string, React.ReactNode][] {
  const m = (v: string) => <MoneyDisplay value={v} currency={c.currency} />;
  return [["Product Type", c.product_type], ["Currency", c.currency], ["Minimum Principal", m(c.min_principal)], ["Maximum Principal", m(c.max_principal)], ["Minimum Term", c.min_term], ["Maximum Term", c.max_term], ["Interest Method", label(INTEREST_METHODS, c.interest_method)], ["Repayment Method", label(AMORTISATIONS, c.amortisation)], ["Interest Rate", `${c.annual_rate} % p.a.`], ["Day Count Convention", label(DAY_COUNTS, c.day_count)], ["Repayment Frequency", label(FREQUENCIES, c.repayment_frequency)], ["Grace Period", `${label(GRACE_TYPES, c.grace_type)} (${c.grace_periods})`], ["Fees", `${c.processing_fee_percent} %`], ["Penalty Rules", c.penalty_rule_id], ["Eligibility Criteria", `${c.eligibility_min_age}–${c.eligibility_max_age}`], ["Required Documents", c.required_documents], ["Collateral Requirements", c.collateral_required ? `${c.min_coverage_percent} %` : "—"], ["Approval Matrix", c.approval_matrix], ["Early Settlement Option", c.early_settlement_option], ["Repayment Waterfall", c.waterfall]];
}

function VersionActions({ p, v }: { p: Product; v: ProductVersion }) {
  const t = useT();
  const router = useRouter();
  return (<>
    {v.status === "DRAFT" && <><Button asChild variant="outline" size="sm"><Link href={`/products/${p.id}/edit`}><Pencil className="size-4" />{t("Edit")}</Link></Button><ActionButton label="Submit for Approval" icon={Send} perms={["product.propose"]} action={{ title: "Submit version for approval", description: "A second authorised user must approve it.", run: () => productsApi.versionAction(p.id, v.version_no, "submit"), successMessage: "Submitted for approval" }} /></>}
    {v.status === "PENDING_APPROVAL" && <><ActionButton label="Approve" icon={Check} perms={["product.approve"]} action={{ title: "Approve product version", description: "The version becomes active for new applications only. Existing loans keep their terms.", run: () => productsApi.versionAction(p.id, v.version_no, "approve"), successMessage: "Version activated" }} /><ActionButton label="Reject" icon={X} variant="destructive" perms={["product.approve"]} action={{ title: "Reject product version", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (x) => productsApi.versionAction(p.id, v.version_no, "reject", x), successMessage: "Version rejected" }} /></>}
    {v.status === "ACTIVE" && <><ActionButton label="Create New Version" icon={Plus} variant="outline" perms={["product.propose"]} action={{ title: "Create new draft version", fields: [{ name: "change_note", label: "Change note", type: "textarea", required: true }], run: (x) => productsApi.newVersion(p.id, String(x.change_note)), after: () => router.refresh(), successMessage: "Draft version created" }} /><ActionButton label="Retire Product" icon={CircleSlash} variant="outline" perms={["product.approve"]} action={{ title: "Retire product", destructive: true, description: "No new applications can use this product.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (x) => productsApi.retire(p.id, String(x.reason)), successMessage: "Product retired" }} /></>}
  </>);
}

export function ProductDetailPage() {
  const t = useT();
  const { id, query } = useProduct();
  return (
    <PageBody><QueryView query={query}>{(p) => {
      const current = p.versions.find((v) => v.version_no === p.active_version) ?? p.versions[p.versions.length - 1];
      const pending = p.versions.filter((v) => v !== current && ["DRAFT", "PENDING_APPROVAL"].includes(v.status));
      return (<>
        <PageHeader title={`${p.name_en} (${p.code})`} description={p.name_km} badge={<StatusBadge status={p.status} />} actions={<><Button asChild variant="outline" size="sm"><Link href={`/products/${id}/versions`}>{t("Version History")}</Link></Button><VersionActions p={p} v={current} /></>} />
        <Section title={`${t("Version")} ${current.version_no}`} description={`${t("Effective from")} ${formatDate(current.effective_from)}`} actions={<StatusBadge status={current.status} />}><DetailGrid items={configGrid(current.config)} /></Section>
        {pending.map((v) => <Section key={v.version_no} title={`${t("Version")} ${v.version_no}`} description={v.change_note} actions={<><StatusBadge status={v.status} /><VersionActions p={p} v={v} /></>}><DetailGrid items={configGrid(v.config).slice(2, 4)} /></Section>)}
        {current.status === "ACTIVE" && <p className="rounded-md bg-info-soft p-3 text-sm text-info">{t("This version is active and cannot be edited directly. Create a new version to make changes.")}</p>}
      </>);
    }}</QueryView></PageBody>
  );
}

export function ProductVersionsPage() {
  const t = useT();
  const { query } = useProduct();
  return (
    <PageBody><PageHeader title="Product Version History" /><QueryView query={query}>{(p) => <div className="space-y-3">{[...p.versions].reverse().map((v) => <Section key={v.version_no} title={`${p.code} · ${t("Version")} ${v.version_no}`} description={v.change_note} actions={<StatusBadge status={v.status} />}><DetailGrid columns={4} items={[["Effective from", formatDate(v.effective_from)], ["Prepared by", v.created_by_name], ["Approved by", v.approved_by_name], ["Approved at", formatDateTime(v.approved_at)], ["Interest Rate", `${v.config.annual_rate} % p.a.`], ["Maximum Principal", <MoneyDisplay key="m" value={v.config.max_principal} currency={v.config.currency} />]]} /></Section>)}</div>}</QueryView></PageBody>
  );
}

export function ProductApprovalPage() {
  const columnsV: Col<Row>[] = [{ key: "product_code", label: "Product Code", href: (r) => `/products/${r.product_id}` }, { key: "product_name", label: "Product Name" }, { key: "version_no", label: "Version", type: "number" }, { key: "created_by_name", label: "Prepared by" }, { key: "effective_from", label: "Effective from", type: "date" }, { key: "change_note", label: "Change note" }, { key: "status", label: "Status", type: "status" }];
  return (
    <PageBody>
      <PageHeader title="Product Approval" description="The approver must be a different user from the person who prepared the version." />
      <ApprovalPanel note="Product versions need a second approver. The server enforces this rule." />
      <DataTable name="Product versions" fetcher={productsApi.versions.list} params={{ status: "PENDING_APPROVAL" }} columns={columnsV} emptyTitle="No versions awaiting approval"
        rowActions={[{ label: "Open", href: (r) => `/products/${r.product_id}` }, { label: "Approve", perms: ["product.approve"], dialog: (r) => ({ title: "Approve product version", description: "The version becomes active for new applications only.", run: () => productsApi.versionAction(String(r.product_id), Number(r.version_no), "approve"), successMessage: "Version activated" }) }, { label: "Reject", perms: ["product.approve"], dialog: (r) => ({ title: "Reject product version", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => productsApi.versionAction(String(r.product_id), Number(r.version_no), "reject", v), successMessage: "Version rejected" }) }]} />
    </PageBody>
  );
}

const calcFields: FieldDef[] = [
  { name: "principal", label: "Principal", type: "money", required: true, defaultValue: "1200.00", currency: (v) => (v.currency as CurrencyCode) || "USD" }, { name: "currency", label: "Currency", type: "select", options: CURRENCIES, required: true, defaultValue: "USD" }, { name: "annual_rate", label: "Interest Rate (% per year)", type: "percent", required: true, defaultValue: "18" }, { name: "term", label: "Number of Installments", type: "number", required: true, defaultValue: "12" }, { name: "interest_method", label: "Interest Method", type: "select", options: INTEREST_METHODS, required: true, defaultValue: "REDUCING" }, { name: "amortisation", label: "Repayment Method", type: "select", options: AMORTISATIONS, required: true, defaultValue: "EQUAL_INSTALLMENT" }, { name: "day_count", label: "Day Count Convention", type: "select", options: DAY_COUNTS, required: true, defaultValue: "30/360" }, { name: "frequency", label: "Repayment Frequency", type: "select", options: FREQUENCIES, required: true, defaultValue: "MONTHLY" }, { name: "disbursement_date", label: "Disbursement Date", type: "date", required: true, defaultValue: todayISO() }, { name: "first_due_date", label: "First Due Date (optional)", type: "date" }, { name: "grace_type", label: "Grace Period", type: "select", options: GRACE_TYPES, defaultValue: "NONE" }, { name: "grace_periods", label: "Grace Periods", type: "number", defaultValue: "0" },
];

export function PreviewResult({ result, currency }: { result: SchedulePreview; currency: CurrencyCode }) {
  const t = useT();
  const m = (v: string) => <MoneyDisplay value={v} currency={currency} />;
  return (<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard title="Regular Installment" value={m(result.regular_installment)} /><StatCard title="Total Interest" value={m(result.total_interest)} /><StatCard title="Total Repayment" value={m(result.total_payment)} /><StatCard title="Effective Rate" value={`${result.effective_rate_nominal_annual} %`} sub={`${result.effective_rate_per_period} % ${t("per period")}`} definition="Internal rate of return of the scheduled cash flows, shown for disclosure." /></div>
    <Section title="Repayment Schedule (Illustration)" description={`${t("Maturity")}: ${formatDate(result.maturity_date)} · ${t("Engine version")} ${result.engine_version}`} actions={<SimulatedTag />} flush><ScheduleTable currency={currency} rows={result.installments} totals={{ principal: result.total_principal, interest: result.total_interest, total: result.total_payment }} /></Section>
  </>);
}

export function CalculatorPage() {
  const t = useT();
  const form = useZodForm(calcFields);
  const [input, setInput] = useState<ScheduleInput | null>(null);
  const preview = useQuery({ queryKey: ["schedule-preview", input], queryFn: ({ signal }) => calculationsApi.schedulePreview(input!, signal), enabled: Boolean(input), retry: false });
  const submit = form.handleSubmit((v) => setInput({ ...v, term: Number(v.term), grace_periods: Number(v.grace_periods || 0) } as unknown as ScheduleInput));
  return (
    <PageBody>
      <PageHeader title="Loan Calculator" description="Sends the terms to the calculation engine and shows its response. No figures are calculated in the browser." actions={<Button variant="outline" size="sm" onClick={() => window.print()}>{t("Print Illustration")}</Button>} />
      <form onSubmit={submit} className="no-print"><Section title="Terms" actions={<Button type="submit" size="sm">{t("Calculate")}</Button>}><FormFields form={form} fields={calcFields} columns={3} /></Section></form>
      {preview.isFetching ? <LoadingSkeleton /> : preview.isError ? <Section><ErrorState error={preview.error} /></Section> : preview.data ? <PreviewResult result={preview.data} currency={input!.currency as CurrencyCode} /> : <Section><EmptyState icon={Calculator} title="Enter terms and calculate" description="Results are an illustration and do not create a loan." /></Section>}
    </PageBody>
  );
}
