"use client";
import { useQuery } from "@tanstack/react-query";
import { Eye, Upload, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { DetailGrid, Section, StatusBadge } from "@/components/shared/display";
import { DocumentPreview, type PickedFile } from "@/components/shared/document";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { DOC_CATEGORIES, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { documentsApi } from "@/lib/api/platform";
import { useCan } from "@/lib/auth/store";
import { formatDateTime } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { DocumentRecord, Row } from "@/types";

const OWNER = statusOptions(["BORROWER", "LOAN", "AGREEMENT", "COLLATERAL", "TRANSACTION"]);
const cols: Col<DocumentRecord>[] = [{ key: "name", label: "Document", href: (r) => `/documents/${r.id}` }, { key: "category", label: "Category" }, { key: "owner_type", label: "Linked To", type: "status" }, { key: "owner_label", label: "Record" }, { key: "classification", label: "Classification" }, { key: "version", label: "Version", type: "number" }, { key: "uploaded_by", label: "Uploaded By" }, { key: "uploaded_at", label: "Uploaded", type: "datetime" }];
export function DocumentLibraryPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Document Library" description="Private storage. Files open through short-lived signed links." actions={can("document.upload") && <Button asChild size="sm"><Link href="/documents/upload"><Upload className="size-4" />{t("Upload Document")}</Link></Button>} /><DataTable name="Documents" fetcher={documentsApi.list} columns={cols} dateRange exportable={false} searchPlaceholder="Search documents" filters={[{ key: "category", label: "Category", options: DOC_CATEGORIES }, { key: "owner_type", label: "Linked To", options: OWNER }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/documents/${r.id}` }]} /></PageBody>;
}

const uploadFields: FieldDef[] = [{ name: "file", label: "File", type: "file", required: true, span: 2 }, { name: "category", label: "Category", type: "select", options: DOC_CATEGORIES, required: true }, { name: "owner_type", label: "Linked To", type: "select", options: OWNER, required: true }, { name: "owner_label", label: "Record Reference", required: true }, { name: "classification", label: "Classification", type: "select", required: true, defaultValue: "Internal", options: ["Public", "Internal", "Confidential", "Restricted"].map((v) => ({ value: v, label: v })) }];
export function UploadDocumentPage() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const form = useZodForm(uploadFields);
  const submit = form.handleSubmit(async (v) => { const f = v.file as PickedFile; const r = await execute(() => documentsApi.create({ ...v, file: undefined, name: f.name, size: f.size, mime: f.mime }), { success: "Document registered. No file content is stored in demonstration mode." }); router.push(`/documents/${r.id}`); });
  return <PageBody><PageHeader title="Upload Document" description="PDF, JPG or PNG up to 10 MB. The server must validate content and scan for malware." /><form onSubmit={submit}><Section><FormFields form={form} fields={uploadFields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit">{t("Upload")}</Button></div></Section></form></PageBody>;
}

export function DocumentDetailPage() {
  const t = useT();
  const execute = useAction();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["document", id], queryFn: ({ signal }) => documentsApi.get(id, signal) });
  const download = () => void execute(() => documentsApi.downloadUrl(id)).then((r) => toast.info(`${t("Signed link issued, valid for")} ${r.expires_in_seconds / 60} ${t("minutes")}`));
  return <PageBody><QueryView query={q}>{(d) => (<><PageHeader title={d.name} badge={<StatusBadge status={d.classification.toUpperCase()} tone="neutral" />} actions={<ActionButton label="New Version" icon={Upload} variant="outline" perms={["document.upload"]} action={{ title: "Upload new version", fields: [{ name: "file", label: "File", type: "file", required: true }], run: () => documentsApi.newVersion(id), successMessage: "New version registered" }} />} /><div className="grid gap-4 lg:grid-cols-2"><DocumentPreview name={d.name} meta={`${d.size} · ${d.mime}`} onDownload={download} /><div className="space-y-4"><Section title="Document Details"><DetailGrid columns={2} items={[["Category", t(d.category)], ["Linked To", d.owner_label], ["Classification", t(d.classification)], ["Current Version", d.version], ["Uploaded By", d.uploaded_by], ["Uploaded", formatDateTime(d.uploaded_at)]]} /></Section><Section title="Versions"><ul className="space-y-1 text-sm">{d.versions.map((v) => <li key={v.version}>v{v.version} · {v.by} · {formatDateTime(v.at)}</li>)}</ul></Section><Section title="Access log">{d.access_log.length ? <ul className="space-y-1 text-sm">{d.access_log.map((a, i) => <li key={i}>{a.user} · {t(a.action)} · {formatDateTime(a.at)}</li>)}</ul> : <EmptyState title="No access recorded" />}</Section></div></div></>)}</QueryView></PageBody>;
}

const tplCols: Col<Row>[] = [{ key: "name", label: "Template" }, { key: "language", label: "Language", type: "status" }, { key: "version", label: "Version" }, { key: "approved_by", label: "Approved by" }, { key: "updated_at", label: "Updated", type: "datetime" }, { key: "status", label: "Status", type: "status" }];
const tplFields: FieldDef[] = [{ name: "name", label: "Template", required: true }, { name: "language", label: "Language", type: "select", required: true, options: statusOptions(["EN", "KM", "BILINGUAL"]) }, { name: "version", label: "Version", required: true }];
export const DocumentTemplatesPage = () => <PageBody><PageHeader title="Document Templates" description="Versioned bilingual templates. Legal wording needs an approved source (DP-06)." actions={<ActionButton label="Add Template" icon={Plus} perms={["template.manage"]} action={{ title: "Add template", fields: tplFields, run: (v) => documentsApi.templates.create({ ...v, status: "DRAFT" }), successMessage: "Template added" }} />} /><DataTable name="Templates" fetcher={documentsApi.templates.list} columns={tplCols} exportable={false} filters={[{ key: "status", label: "Status", options: statusOptions(["DRAFT", "ACTIVE"]) }]} rowActions={[{ label: "Activate", perms: ["template.manage"], visible: (r) => r.status === "DRAFT", dialog: (r) => ({ title: "Activate template", run: () => documentsApi.templates.update(String(r.id), { status: "ACTIVE" }), successMessage: "Template activated" }) }]} /></PageBody>;
