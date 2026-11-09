"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Eye, FileText, Pencil, Plus, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { DocumentPreview } from "@/components/shared/document";
import { AuditTimeline } from "@/components/shared/timelines";
import { EmptyState } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useBranchOptions } from "@/components/tables/filter-panel";
import { ID_TYPES, LANGUAGES, PROVINCES, statusOptions } from "@/config/options";
import { useAction, describeError } from "@/hooks/use-action";
import { ApiError } from "@/lib/api/client";
import { borrowersApi } from "@/lib/api/borrowers";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { Application, Borrower, BorrowerDetail, DocumentRecord, LoanSummary, Repayment } from "@/types";

const columns: Col<Borrower>[] = [
  { key: "customer_code", label: "Customer Code", href: (r) => `/borrowers/${r.id}` },
  { key: "name_en", label: "Name (English)", render: (r) => <Link className="font-medium text-primary hover:underline" href={`/borrowers/${r.id}`}>{r.name_en}</Link> },
  { key: "name_km", label: "Name (Khmer)" },
  { key: "type", label: "Type", type: "status" },
  { key: "phone", label: "Phone Number" },
  { key: "id_number", label: "Identification", sortable: false },
  { key: "branch_name", label: "Branch" },
  { key: "officer_name", label: "Loan Officer", hidden: true },
  { key: "created_at", label: "Registered", type: "date", hidden: true },
  { key: "status", label: "Status", render: (r) => <span className="flex items-center gap-1"><StatusBadge status={r.status} />{r.duplicate_flag && <AlertTriangle className="size-3.5 text-warning" aria-label="Possible duplicate" />}</span> },
];

export function BorrowerListPage() {
  const t = useT();
  const branches = useBranchOptions();
  const can = useCan();
  return (
    <PageBody>
      <PageHeader title="Borrowers" description="Search by customer code, name in English or Khmer, or phone number within your branches." actions={can("borrower.edit") && <Button asChild size="sm"><Link href="/borrowers/new"><Plus className="size-4" />{t("Add Borrower")}</Link></Button>} />
      <DataTable name="Borrowers" fetcher={borrowersApi.list} columns={columns} searchPlaceholder="Search borrowers" dateRange defaultSort="-created_at"
        filters={[{ key: "status", label: "Status", options: statusOptions(["PROSPECT", "ACTIVE", "INACTIVE", "BLACKLISTED", "DECEASED"]) }, { key: "type", label: "Type", options: statusOptions(["INDIVIDUAL", "BUSINESS"]) }, { key: "branch_id", label: "Branch", options: branches }]}
        rowActions={[{ label: "View", icon: Eye, href: (r) => `/borrowers/${r.id}` }, { label: "Edit", icon: Pencil, href: (r) => `/borrowers/${r.id}/edit`, perms: ["borrower.edit"] }, { label: "Documents", icon: FileText, href: (r) => `/borrowers/${r.id}/documents` }]} />
    </PageBody>
  );
}

export function RegisterChooserPage() {
  const t = useT();
  const cards = [{ href: "/borrowers/new/individual", icon: User, title: "Register Individual Borrower", text: "Personal identification, contacts, income and liabilities." }, { href: "/borrowers/new/business", icon: Building2, title: "Register Business Borrower", text: "Legal entity, registration, financial information and representatives." }];
  return (
    <PageBody>
      <PageHeader title="Borrower Registration" description="Duplicate checks run on the identification number, phone, and name with date of birth." />
      <div className="grid gap-4 sm:grid-cols-2">{cards.map((c) => <Link key={c.href} href={c.href} className="rounded-xl border bg-card p-6 transition-colors hover:border-primary/60"><c.icon className="mb-3 size-6 text-primary" aria-hidden /><p className="font-semibold">{t(c.title)}</p><p className="mt-1 text-sm text-muted-foreground">{t(c.text)}</p></Link>)}</div>
    </PageBody>
  );
}

const addressFields: FieldDef[] = [
  { name: "house", label: "House No." }, { name: "street", label: "Street" }, { name: "village", label: "Village", required: true }, { name: "commune", label: "Commune / Sangkat", required: true }, { name: "district", label: "District / Khan", required: true }, { name: "province", label: "Province / City", type: "select", options: PROVINCES, required: true },
];
const individualFields: FieldDef[] = [
  { name: "name_en", label: "Full Name (English)", required: true }, { name: "name_km", label: "Full Name (Khmer)", required: true, placeholder: "ឈ្មោះជាភាសាខ្មែរ" }, { name: "id_type", label: "Identification Type", type: "select", options: ID_TYPES, required: true }, { name: "id_number", label: "Identification Number", required: true }, { name: "date_of_birth", label: "Date of Birth", type: "date", maxToday: true, required: true }, { name: "phone", label: "Phone Number", type: "phone", required: true, placeholder: "+855 12 345 678" }, { name: "email", label: "Email", type: "email" }, { name: "preferred_language", label: "Preferred Language", type: "select", options: LANGUAGES, defaultValue: "km" },
];
const employmentFields: FieldDef[] = [
  { name: "occupation", label: "Occupation", required: true }, { name: "employer", label: "Employer" }, { name: "monthly_income", label: "Monthly Income", type: "money", required: true }, { name: "existing_liabilities", label: "Existing Liabilities", type: "money", help: "Total monthly installments on existing debts." },
];
const emergencyFields: FieldDef[] = [{ name: "ec_name", label: "Emergency Contact" }, { name: "ec_relationship", label: "Relationship" }, { name: "ec_phone", label: "Contact Phone", type: "phone" }];
const documentFields: FieldDef[] = [{ name: "document", label: "Identification Document", type: "file" }];
const businessFields: FieldDef[] = [
  { name: "legal_name", label: "Legal Name", required: true }, { name: "trading_name", label: "Trading Name" }, { name: "name_km", label: "Name (Khmer)" }, { name: "registration_number", label: "Registration Number", required: true }, { name: "business_activity", label: "Business Activity", required: true }, { name: "phone", label: "Phone Number", type: "phone", required: true }, { name: "email", label: "Email", type: "email" },
];
const businessFinance: FieldDef[] = [{ name: "annual_revenue", label: "Annual Revenue", type: "money" }, { name: "annual_expenses", label: "Annual Expenses", type: "money" }, { name: "monthly_income", label: "Monthly Net Income", type: "money", required: true }, { name: "existing_liabilities", label: "Existing Liabilities", type: "money" }];
const repFields: FieldDef[] = [{ name: "rep_name", label: "Representative Name", required: true }, { name: "rep_position", label: "Position", required: true }, { name: "rep_phone", label: "Representative Phone", type: "phone", required: true }, { name: "rep_id", label: "Representative ID Number", required: true }];
const ALL_INDIVIDUAL = [...individualFields, ...addressFields, ...employmentFields, ...emergencyFields, ...documentFields];
const ALL_BUSINESS = [...businessFields, ...addressFields, ...businessFinance, ...repFields, ...documentFields];

function BorrowerForm({ type }: { type: "INDIVIDUAL" | "BUSINESS" }) {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const all = type === "BUSINESS" ? ALL_BUSINESS : ALL_INDIVIDUAL;
  const form = useZodForm(all);
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<{ payload: Values; candidates: { id: string; customer_code: string; name_en: string; phone: string }[] } | null>(null);
  const [reason, setReason] = useState("");
  const payload = (v: Values): Values => ({
    ...v, type, address: { house: v.house, street: v.street, village: v.village, commune: v.commune, district: v.district, province: v.province },
    emergency_contact: v.ec_name ? { name: v.ec_name, relationship: v.ec_relationship, phone: v.ec_phone } : null,
    representatives: v.rep_name ? [{ name: v.rep_name, position: v.rep_position, phone: v.rep_phone, id_number_masked: `••••${String(v.rep_id).slice(-4)}` }] : [],
  });
  const save = async (body: Values) => {
    setBusy(true);
    try {
      const created = await borrowersApi.create(body);
      await execute(async () => undefined);
      toast.success(`${t("Borrower registered")}: ${created.customer_code}`);
      router.push(`/borrowers/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "POSSIBLE_DUPLICATE") setDuplicates({ payload: body, candidates: e.extra?.candidates as never });
      else toast.error(t(describeError(e)));
    } finally { setBusy(false); }
  };
  const submit = form.handleSubmit((v) => save(payload(v)));
  return (
    <form onSubmit={submit} className="space-y-4">
      {type === "INDIVIDUAL" ? <>
        <Section title="Identity and contact"><FormFields form={form} fields={individualFields} columns={3} /></Section>
        <Section title="Address" description="Cambodian address structure"><FormFields form={form} fields={addressFields} columns={3} /></Section>
        <Section title="Employment and finances"><FormFields form={form} fields={employmentFields} columns={2} /></Section>
        <Section title="Emergency contact"><FormFields form={form} fields={emergencyFields} columns={3} /></Section>
      </> : <>
        <Section title="Business details"><FormFields form={form} fields={businessFields} columns={3} /></Section>
        <Section title="Business address"><FormFields form={form} fields={addressFields} columns={3} /></Section>
        <Section title="Financial information"><FormFields form={form} fields={businessFinance} columns={2} /></Section>
        <Section title="Authorised representative"><FormFields form={form} fields={repFields} columns={2} /></Section>
      </>}
      <Section title="Documents"><FormFields form={form} fields={documentFields} columns={1} /></Section>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>{t("Cancel")}</Button><Button type="submit" disabled={busy}>{t(busy ? "Saving…" : "Save Borrower")}</Button></div>
      <Dialog open={Boolean(duplicates)} onOpenChange={(o) => { if (!o) setDuplicates(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" />{t("Possible duplicate")}</DialogTitle><DialogDescription>{t("Records are never merged automatically. Continuing creates a record that a Branch Manager must review.")}</DialogDescription></DialogHeader>
          <ul className="space-y-2 text-sm">{duplicates?.candidates.map((c) => <li key={c.id} className="flex justify-between rounded-md border p-2"><span><span className="font-medium">{c.name_en}</span> · {c.customer_code}<span className="block text-xs text-muted-foreground">{c.phone}</span></span><Button asChild variant="outline" size="sm"><Link href={`/borrowers/${c.id}`}>{t("Open")}</Link></Button></li>)}</ul>
          <textarea className="w-full rounded-md border bg-transparent p-2 text-sm" rows={2} aria-label={t("Reason")} placeholder={t("Reason this is not a duplicate")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setDuplicates(null)}>{t("Cancel")}</Button><Button disabled={!reason.trim() || busy} onClick={() => { const p = duplicates!.payload; setDuplicates(null); void save({ ...p, confirm_duplicate: true, duplicate_reason: reason }); }}>{t("Continue for review")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

export function RegisterIndividualPage() { return <PageBody><PageHeader title="Register Individual Borrower" /><BorrowerForm type="INDIVIDUAL" /></PageBody>; }
export function RegisterBusinessPage() { return <PageBody><PageHeader title="Register Business Borrower" /><BorrowerForm type="BUSINESS" /></PageBody>; }

export function useBorrower() {
  const { id } = useParams<{ id: string }>();
  return { id, query: useQuery({ queryKey: ["borrower", id], queryFn: ({ signal }) => borrowersApi.detail(id, signal) }) };
}

const loanCols: Col<LoanSummary>[] = [
  { key: "account_no", label: "Loan Account", href: (r) => `/loans/${r.id}` }, { key: "product_name", label: "Product" }, { key: "original_principal", label: "Original Principal", type: "money", currency: (r) => r.currency }, { key: "outstanding_principal", label: "Outstanding Principal", type: "money", currency: (r) => r.currency }, { key: "days_past_due", label: "DPD", type: "dpd" }, { key: "status", label: "Status", type: "status" },
];

function SimpleRows<T extends object>({ rows, columns, name }: { rows: T[]; columns: Col<T>[]; name: string }) {
  return <DataTable name={name} columns={columns} exportable={false} fetcher={async (p) => { const s = String(p.search ?? "").toLowerCase(); const filtered = rows.filter((r) => !s || Object.values(r).some((v) => String(v).toLowerCase().includes(s))); return { items: filtered, total: filtered.length, next_cursor: null }; }} />;
}

export function BorrowerDetailPage() {
  const t = useT();
  const can = useCan();
  const searchTab = "overview";
  const { id, query } = useBorrower();
  return (
    <PageBody>
      <QueryView query={query}>{(b: BorrowerDetail) => {
        const money = (v?: string) => <MoneyDisplay value={v} currency={b.currency} />;
        return (<>
          <PageHeader title={<span>{b.name_en} <span className="font-normal text-muted-foreground">{b.name_km}</span></span>} description={`${b.customer_code} · ${b.branch_name}`} badge={<StatusBadge status={b.status} />} actions={<>
            {can("borrower.edit") && <Button asChild variant="outline" size="sm"><Link href={`/borrowers/${id}/edit`}><Pencil className="size-4" />{t("Edit")}</Link></Button>}
            {can("application.create") && <Button asChild size="sm"><Link href={`/applications/new?borrower=${id}`}><Plus className="size-4" />{t("New Loan Application")}</Link></Button>}
            <ActionButton label="Change Status" variant="outline" perms={["borrower.confirm_duplicate"]} action={{ title: "Change borrower status", fields: [{ name: "status", label: "Status", type: "select", required: true, options: statusOptions(["PROSPECT", "ACTIVE", "INACTIVE", "BLACKLISTED", "DECEASED"]) }, { name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => borrowersApi.setStatus(id, String(v.status), String(v.reason)), successMessage: "Status updated" }} />
          </>} />
          {b.duplicate_review === "PENDING" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning"><span className="flex items-center gap-2"><AlertTriangle className="size-4" />{t("Possible duplicate awaiting Branch Manager review.")}</span><ActionButton label="Confirm Not Duplicate" icon={ShieldCheck} variant="outline" perms={["borrower.confirm_duplicate"]} action={{ title: "Confirm not a duplicate", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => borrowersApi.confirmDuplicate(id, String(v.reason)), successMessage: "Review recorded" }} /></div>}
          <Tabs defaultValue={searchTab} className="gap-3">
            <div className="overflow-x-auto overflow-y-hidden"><TabsList>{["Overview", "Personal Information", "Financial Information", "Loan History", "Documents", "Credit Assessment", "Activities"].map((x) => <TabsTrigger key={x} value={x === "Overview" ? "overview" : x}>{t(x)}</TabsTrigger>)}</TabsList></div>
            <TabsContent value="overview" className="space-y-4">
              <Section title="Overview"><DetailGrid items={[["Customer Code", b.customer_code], ["Type", <StatusBadge key="t" status={b.type} />], ["Phone Number", b.phone], ["Branch", b.branch_name], ["Loan Officer", b.officer_name], ["Registered", formatDate(b.created_at)], ["Open Loans", b.loans.filter((l) => l.status === "ACTIVE").length], ["Applications", b.applications.length], ["Preferred Language", b.preferred_language === "km" ? t("Khmer") : t("English")]]} /></Section>
              <Section title="Internal notes" actions={<ActionButton label="Add Note" variant="outline" perms={["borrower.edit"]} action={{ title: "Add note", fields: [{ name: "text", label: "Note", type: "textarea", required: true }], run: (v) => borrowersApi.command(id, "notes", v), successMessage: "Note added" }} />}>
                {b.notes.length ? <ul className="space-y-2 text-sm">{b.notes.map((n, i) => <li key={i}><p>{n.text}</p><p className="text-xs text-muted-foreground">{n.by} · {formatDateTime(n.at)}</p></li>)}</ul> : <EmptyState title="No notes yet" />}
              </Section>
            </TabsContent>
            <TabsContent value="Personal Information">
              <Section title="Personal Information"><DetailGrid items={b.type === "BUSINESS" ? [["Legal Name", b.legal_name], ["Trading Name", b.trading_name], ["Registration Number", <RevealId key="i" borrower={b} />], ["Business Activity", b.business_activity], ["Phone Number", b.phone], ["Email", b.email], ["Business Address", b.address_text]] : [["Full Name (English)", b.name_en], ["Full Name (Khmer)", b.name_km], ["Identification Type", b.id_type], ["Identification Number", <RevealId key="i" borrower={b} />], ["Date of Birth", formatDate(b.date_of_birth)], ["Phone Number", b.phone], ["Email", b.email], ["Address", b.address_text], ["Occupation", b.occupation], ["Employer", b.employer], ["Emergency Contact", b.emergency_contact ? `${b.emergency_contact.name} (${b.emergency_contact.relationship}) ${b.emergency_contact.phone}` : "—"]]} /></Section>
              {b.representatives && b.representatives.length > 0 && <Section title="Authorised Representatives" className="mt-4"><ul className="text-sm">{b.representatives.map((r) => <li key={r.name}>{r.name} · {r.position} · {r.phone} · {r.id_number_masked}</li>)}</ul></Section>}
            </TabsContent>
            <TabsContent value="Financial Information"><Section title="Financial Information"><DetailGrid items={[["Monthly Income", money(b.monthly_income)], ["Existing Liabilities", money(b.existing_liabilities)], ...(b.type === "BUSINESS" ? [["Annual Revenue", money(b.annual_revenue)], ["Annual Expenses", money(b.annual_expenses)]] as [string, React.ReactNode][] : [])]} /></Section></TabsContent>
            <TabsContent value="Loan History"><SimpleRows name="Borrower loans" rows={b.loans} columns={loanCols} /></TabsContent>
            <TabsContent value="Documents"><BorrowerDocuments documents={b.documents} /></TabsContent>
            <TabsContent value="Credit Assessment"><AssessmentHistory applications={b.applications} /></TabsContent>
            <TabsContent value="Activities"><Section title="Activities"><AuditTimeline items={b.activities} /></Section></TabsContent>
          </Tabs>
        </>);
      }}</QueryView>
    </PageBody>
  );
}

function RevealId({ borrower }: { borrower: BorrowerDetail }) {
  const t = useT();
  const [full, setFull] = useState<string | null>(null);
  return <span className="inline-flex items-center gap-2">{full ?? borrower.id_number}{borrower.can_reveal_id && !full && <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => void borrowersApi.revealId(borrower.id).then((r) => setFull(r.id_number))}>{t("Reveal (logged)")}</button>}</span>;
}

const docCols: Col<DocumentRecord>[] = [{ key: "name", label: "Document", href: (r) => `/documents/${r.id}` }, { key: "category", label: "Category" }, { key: "classification", label: "Classification" }, { key: "uploaded_by", label: "Uploaded By" }, { key: "uploaded_at", label: "Uploaded", type: "datetime" }];

function BorrowerDocuments({ documents }: { documents: DocumentRecord[] }) {
  if (!documents.length) return <Section><EmptyState title="No documents available" description="Documents are hidden if your role has no access to sensitive borrower data." /></Section>;
  return <SimpleRows name="Borrower documents" rows={documents} columns={docCols} />;
}

function AssessmentHistory({ applications }: { applications: Application[] }) {
  const t = useT();
  const assessed = applications.filter((a) => a.assessment);
  if (!assessed.length) return <Section><EmptyState title="No credit assessments yet" /></Section>;
  return <div className="space-y-3">{assessed.map((a) => <Section key={a.id} title={a.reference ?? ""} actions={<StatusBadge status={a.status} />}><DetailGrid columns={4} items={[["Risk Grade", a.assessment!.risk_grade], ["Debt Service Ratio (DSR)", `${a.assessment!.dsr_percent} %`], ["Analyst", a.assessment!.analyst_name], ["Analyst Recommendation", <StatusBadge key="r" status={a.assessment!.recommendation} />]]} /><p className="mt-3 text-sm text-muted-foreground">{t(a.assessment!.rationale)}</p></Section>)}</div>;
}

const editFields: FieldDef[] = [{ name: "name_km", label: "Name (Khmer)" }, { name: "phone", label: "Phone Number", type: "phone", required: true }, { name: "email", label: "Email", type: "email" }, { name: "occupation", label: "Occupation" }, { name: "employer", label: "Employer" }, { name: "monthly_income", label: "Monthly Income", type: "money" }, { name: "existing_liabilities", label: "Existing Liabilities", type: "money" }, { name: "preferred_language", label: "Preferred Language", type: "select", options: LANGUAGES }];

function EditForm({ borrower }: { borrower: BorrowerDetail }) {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const a = borrower.address;
  const all = useState(() => [...editFields, ...addressFields])[0];
  const form = useZodForm(all, { ...borrower, ...a } as unknown as Values);
  const submit = form.handleSubmit(async (v) => {
    await execute(() => borrowersApi.update(borrower.id, { ...v, address: { house: v.house, street: v.street, village: v.village, commune: v.commune, district: v.district, province: v.province } }), { success: "Borrower updated" });
    router.push(`/borrowers/${borrower.id}`);
  });
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-md bg-info-soft p-3 text-sm text-info">{t("Changes to legal name or identification require an approved change request and cannot be made here.")}</p>
      <Section title="Contact and finances"><FormFields form={form} fields={editFields} columns={2} /></Section>
      <Section title="Address"><FormFields form={form} fields={addressFields} columns={3} /></Section>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>{t("Cancel")}</Button><Button type="submit">{t("Save Changes")}</Button></div>
    </form>
  );
}

export function EditBorrowerPage() {
  const { query } = useBorrower();
  return <PageBody><PageHeader title="Edit Borrower" /><QueryView query={query}>{(b) => <EditForm borrower={b} />}</QueryView></PageBody>;
}

export function BorrowerDocumentsPage() {
  const { query } = useBorrower();
  const t = useT();
  return <PageBody><PageHeader title="Borrower Documents" actions={<Button asChild size="sm"><Link href="/documents/upload">{t("Upload Document")}</Link></Button>} /><QueryView query={query}>{(b) => <><p className="text-sm text-muted-foreground">{b.name_en} · {b.customer_code}</p><BorrowerDocuments documents={b.documents} />{b.documents[0] && <DocumentPreview name={b.documents[0].name} meta={b.documents[0].size} />}</>}</QueryView></PageBody>;
}

const repaymentCols: Col<Repayment>[] = [{ key: "receipt_no", label: "Receipt", href: (r) => `/repayments/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "value_date", label: "Date", type: "date" }, { key: "amount", label: "Amount", type: "money", currency: (r) => r.currency }, { key: "status", label: "Status", type: "status" }];

export function BorrowerLoanHistoryPage() {
  const { query } = useBorrower();
  return <PageBody><PageHeader title="Borrower Loan History" /><QueryView query={query}>{(b) => <><p className="text-sm text-muted-foreground">{b.name_en} · {b.customer_code}</p><SimpleRows name="Loans" rows={b.loans} columns={loanCols} /><SimpleRows name="Repayments" rows={b.repayments} columns={repaymentCols} /></>}</QueryView></PageBody>;
}
