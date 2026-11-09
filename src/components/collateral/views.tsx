"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, BadgeCheck, Eye, Plus, Unlock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { COLLATERAL_TYPES, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { borrowersApi } from "@/lib/api/borrowers";
import { collateralApi, guarantorsApi } from "@/lib/api/collateral";
import { loansApi } from "@/lib/api/loans";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Row } from "@/types";

const cur = (r: Row) => r.currency as CurrencyCode;
const cols: Col<Row>[] = [{ key: "reference", label: "Collateral Reference", href: (r) => `/collateral/${r.id}` }, { key: "borrower_name", label: "Borrower" }, { key: "loan_account_no", label: "Loan Account" }, { key: "collateral_type", label: "Collateral Type" }, { key: "description", label: "Description", hidden: true }, { key: "estimated_value", label: "Estimated Value", type: "money", currency: cur }, { key: "accepted_value", label: "Accepted Value", type: "money", currency: cur }, { key: "valuation_date", label: "Valuation Date", type: "date" }, { key: "ownership", label: "Ownership", hidden: true }, { key: "custody_status", label: "Custody Status" }, { key: "status", label: "Status", type: "status" }];

export function CollateralListPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Collateral Register" description="Assets, valuations, custody and controlled release." actions={can("collateral.manage") && <Button asChild size="sm"><Link href="/collateral/new"><Plus className="size-4" />{t("Register Collateral")}</Link></Button>} /><DataTable name="Collateral Register" fetcher={collateralApi.list} columns={cols} searchPlaceholder="Search collateral" dateRange filters={[{ key: "status", label: "Status", options: statusOptions(["UNDER_VERIFICATION", "ACCEPTED", "PLEDGED", "RELEASE_AUTHORISED", "RELEASED"]) }, { key: "collateral_type", label: "Collateral Type", options: COLLATERAL_TYPES }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/collateral/${r.id}` }, { label: "Valuation History", href: (r) => `/collateral/${r.id}/valuations` }, { label: "Custody Records", href: (r) => `/collateral/${r.id}/custody` }, { label: "Release", href: (r) => `/collateral/${r.id}/release`, perms: ["collateral.manage", "collateral.release_approve"] }]} /></PageBody>;
}

export function RegisterCollateralPage() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const borrowers = useQuery({ queryKey: ["options", "borrowers"], queryFn: ({ signal }) => borrowersApi.list({ limit: 200, sort: "name_en" }, signal) });
  const loans = useQuery({ queryKey: ["options", "loans"], queryFn: ({ signal }) => loansApi.list({ limit: 200 }, signal) });
  const fields: FieldDef[] = [{ name: "borrower_id", label: "Borrower", type: "select", required: true, options: (borrowers.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.name_en} · ${b.customer_code}` })) }, { name: "loan_id", label: "Loan Account", type: "select", options: (loans.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.account_no} · ${l.borrower_name}` })) }, { name: "collateral_type", label: "Collateral Type", type: "select", required: true, options: COLLATERAL_TYPES }, { name: "identifier", label: "Identification Reference", required: true, help: "For example plate number or land title reference." }, { name: "description", label: "Description", type: "textarea", required: true }, { name: "ownership", label: "Ownership", required: true }, { name: "estimated_value", label: "Estimated Value", type: "money", required: true }, { name: "accepted_value", label: "Accepted Value", type: "money", required: true }, { name: "valuation_date", label: "Valuation Date", type: "date", required: true, maxToday: true }, { name: "location", label: "Storage Location" }, { name: "document", label: "Document Attachments", type: "file" }];
  const form = useZodForm(fields);
  const submit = form.handleSubmit(async (v) => { const r = await execute(() => collateralApi.create({ ...v, documents: v.document ? [(v.document as { name: string }).name] : [] }), { success: "Collateral registered" }); router.push(`/collateral/${r.id}`); });
  return <PageBody><PageHeader title="Register Collateral" /><form onSubmit={submit}><Section><FormFields form={form} fields={fields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit">{t("Save")}</Button></div></Section></form></PageBody>;
}

const useCollateral = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["collateral", id], queryFn: ({ signal }) => collateralApi.get(id, signal) }) }; };

function Valuations({ c, id }: { c: Row; id: string }) {
  return <Section title="Valuation History" actions={<ActionButton label="Add Valuation" icon={Plus} variant="outline" perms={["collateral.manage"]} action={{ title: "Add valuation", fields: [{ name: "date", label: "Valuation Date", type: "date", required: true, maxToday: true }, { name: "method", label: "Method", type: "select", required: true, options: ["Market comparison", "Invoice or purchase price", "Appraiser report", "Weight × purity price"].map((value) => ({ value, label: value })) }, { name: "value", label: "Value", type: "money", required: true, currency: cur(c) }, { name: "valuer", label: "Valuer" }], run: (v) => collateralApi.action(id, "valuations", v), successMessage: "Valuation recorded" }} />} flush><ul className="divide-y">{(c.valuations as Row[]).map((v) => <li key={String(v.id)} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{formatDate(String(v.date))} · {String(v.method)} · {String(v.valuer)}</span><MoneyDisplay value={String(v.value)} currency={cur(c)} /></li>)}</ul></Section>;
}
function Custody({ c, id }: { c: Row; id: string }) {
  const movements = c.movements as Row[];
  return <Section title="Custody Records" actions={<ActionButton label="Record Movement" icon={ArrowLeftRight} variant="outline" perms={["collateral.manage"]} action={{ title: "Record custody movement", fields: [{ name: "movement", label: "Movement", type: "select", required: true, options: [{ value: "IN", label: "In" }, { value: "TRANSFER", label: "Transfer" }, { value: "OUT", label: "Out" }] }, { name: "location", label: "Location", required: true }, { name: "date", label: "Date", type: "date", required: true, maxToday: true }], run: (v) => collateralApi.action(id, "movements", v), successMessage: "Movement recorded" }} />} flush>{movements.length ? <ul className="divide-y">{movements.map((m) => <li key={String(m.id)} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span><StatusBadge status={String(m.movement)} /> {String(m.location)}</span><span className="text-muted-foreground">{formatDate(String(m.date))} · {String(m.person)}</span></li>)}</ul> : <EmptyState title="No movements recorded" />}</Section>;
}

export function CollateralDetailPage() {
  const t = useT();
  const { id, query } = useCollateral();
  return <PageBody><QueryView query={query}>{(c) => (<><PageHeader title={String(c.reference)} description={String(c.description)} badge={<StatusBadge status={String(c.status)} />} actions={<>
    {["REGISTERED", "UNDER_VERIFICATION"].includes(String(c.status)) && <ActionButton label="Verify Ownership" icon={BadgeCheck} perms={["collateral.manage"]} action={{ title: "Record ownership verification", fields: [{ name: "reason", label: "Verification evidence", type: "textarea", required: true }], run: (v) => collateralApi.action(id, "verify", v), successMessage: "Ownership verified" }} />}
    {c.status !== "RELEASED" && <Button asChild variant="outline" size="sm"><Link href={`/collateral/${id}/release`}><Unlock className="size-4" />{t("Collateral Release")}</Link></Button>}
  </>} />
    <Section title="Collateral Details"><DetailGrid columns={4} items={[["Borrower", String(c.borrower_name)], ["Loan Account", c.loan_id ? <Link key="l" className="text-primary hover:underline" href={`/loans/${String(c.loan_id)}`}>{String(c.loan_account_no)}</Link> : "—"], ["Collateral Type", t(String(c.collateral_type))], ["Identification Reference", String(c.identifier)], ["Estimated Value", <MoneyDisplay key="e" value={String(c.estimated_value)} currency={cur(c)} />], ["Accepted Value", <MoneyDisplay key="a" value={String(c.accepted_value)} currency={cur(c)} />], ["Valuation Date", formatDate(String(c.valuation_date))], ["Ownership", String(c.ownership)], ["Custody Status", String(c.custody_status)], ["Location", String(c.location)], ["Coverage Ratio", c.coverage_percent ? `${String(c.coverage_percent)} %` : "—"], ["Document Attachments", (c.documents as string[]).join(", ")]]} />{Boolean(c.needs_revaluation) && <p className="mt-3 rounded-md bg-warning-soft p-2 text-sm text-warning">{t("Valuation is older than the configured age. Revaluation is required.")}</p>}</Section>
    <div className="grid gap-4 lg:grid-cols-2"><Valuations c={c} id={id} /><Custody c={c} id={id} /></div>
  </>)}</QueryView></PageBody>;
}

export function ValuationHistoryPage() { const { id, query } = useCollateral(); return <PageBody><PageHeader title="Valuation History" /><QueryView query={query}>{(c) => <Valuations c={c} id={id} />}</QueryView></PageBody>; }
export function CustodyRecordsPage() { const { id, query } = useCollateral(); return <PageBody><PageHeader title="Custody Records" /><QueryView query={query}>{(c) => <Custody c={c} id={id} />}</QueryView></PageBody>; }

export function CollateralReleasePage() {
  const t = useT();
  const router = useRouter();
  const can = useCan();
  const { id, query } = useCollateral();
  return <PageBody><PageHeader title="Collateral Release" description="Release happens only after obligations are settled, or with an authorised exception." /><QueryView query={query}>{(c) => {
    const open = ["ACTIVE", "WRITTEN_OFF"].includes(String(c.loan_status));
    const released = c.status === "RELEASED";
    return <Section title={String(c.reference)} actions={<StatusBadge status={String(c.status)} />}><DetailGrid columns={3} items={[["Loan Account", String(c.loan_account_no)], ["Loan Status", <StatusBadge key="s" status={String(c.loan_status ?? "")} />], ["Total Outstanding", <MoneyDisplay key="o" value={String(c.loan_outstanding)} currency={cur(c)} />]]} />
      {released ? <p className="mt-4 rounded-md bg-success-soft p-3 text-sm text-success">{t("Released. Receipt")}: {String((c.release as Row)?.receipt)} · {formatDateTime(String((c.release as Row)?.at))}</p> : <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton label="Release Collateral" icon={Unlock} action={{ title: "Release collateral", description: "The server rejects this while loan obligations remain outstanding.", summary: <p>{String(c.collateral_type)} · {String(c.identifier)}</p>, run: () => collateralApi.action(id, "release", {}), successMessage: "Collateral released", after: () => router.refresh() }} />
        {open && can("collateral.release_approve") && <ActionButton label="Release with Exception" variant="destructive" action={{ title: "Authorised exception release", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => collateralApi.action(id, "release", { ...v, exception: true }), successMessage: "Collateral released under exception" }} />}
      </div>}</Section>;
  }}</QueryView></PageBody>;
}

const gCols: Col<Row>[] = [{ key: "name", label: "Guarantor Name", href: (r) => `/guarantors/${r.id}` }, { key: "name_km", label: "Khmer Name", hidden: true }, { key: "relationship", label: "Relationship" }, { key: "phone", label: "Phone Number" }, { key: "borrower_name", label: "Borrower" }, { key: "loan_account_no", label: "Loan Account" }, { key: "guarantee_amount", label: "Guarantee Amount", type: "money", currency: cur }, { key: "status", label: "Status", type: "status" }];

export function GuarantorListPage() {
  return <PageBody><PageHeader title="Guarantors" /><DataTable name="Guarantors" fetcher={guarantorsApi.list} columns={gCols} searchPlaceholder="Search guarantors" filters={[{ key: "status", label: "Status", options: statusOptions(["ACTIVE", "RELEASED"]) }]} rowActions={[{ label: "View", href: (r) => `/guarantors/${r.id}` }]} /></PageBody>;
}

export function GuarantorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["guarantor", id], queryFn: ({ signal }) => guarantorsApi.get(id, signal) });
  return <PageBody><QueryView query={query}>{(g) => (<><PageHeader title={String(g.name)} description={String(g.name_km)} badge={<StatusBadge status={String(g.status)} />} actions={g.status === "ACTIVE" && <ActionButton label="Release Guarantee" icon={Unlock} variant="outline" perms={["collateral.release_approve", "collateral.manage"]} action={{ title: "Release guarantee", fields: [{ name: "reason", label: "Reason or amendment reference", type: "textarea", required: true }], run: (v) => guarantorsApi.release(id, String(v.reason)), successMessage: "Guarantee released" }} />} /><Section title="Guarantor Details"><DetailGrid items={[["Relationship", String(g.relationship)], ["Phone Number", String(g.phone)], ["Identification", String(g.id_masked)], ["Borrower", String(g.borrower_name)], ["Loan Account", <Link key="l" className="text-primary hover:underline" href={`/loans/${String(g.loan_id)}`}>{String(g.loan_account_no)}</Link>], ["Guarantee Amount", <MoneyDisplay key="g" value={String(g.guarantee_amount)} currency={cur(g)} />]]} /></Section></>)}</QueryView></PageBody>;
}
