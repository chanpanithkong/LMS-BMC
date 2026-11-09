"use client";
import { useQuery } from "@tanstack/react-query";
import { Eye, FilePlus2, FileSignature, History, Printer, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { ScheduleTable } from "@/components/shared/schedule-table";
import { DataTable, type Col } from "@/components/tables/data-table";
import { statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { agreementsApi } from "@/lib/api/agreements";
import { loansApi } from "@/lib/api/loans";
import { formatDate, formatDateLong, formatDateTime } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useLocale, useT } from "@/lib/i18n/store";
import type { Borrower, Installment, LoanSummary, Row } from "@/types";

const cols: Col<Row>[] = [{ key: "agreement_no", label: "Agreement No.", href: (r) => `/agreements/${r.id}` }, { key: "loan_account_no", label: "Loan Account" }, { key: "borrower_name", label: "Borrower" }, { key: "principal", label: "Principal", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "language", label: "Language", type: "status" }, { key: "version", label: "Version", type: "number" }, { key: "generated_at", label: "Generated", type: "date" }, { key: "status", label: "Status", type: "status" }];

export function AgreementListPage() {
  const t = useT();
  return <PageBody><PageHeader title="Loan Agreements" description="Agreements are generated from approved terms. Executed versions cannot be replaced." actions={<Button asChild size="sm"><Link href="/agreements/generate"><FilePlus2 className="size-4" />{t("Generate Agreement")}</Link></Button>} /><DataTable name="Loan Agreements" fetcher={agreementsApi.list} columns={cols} dateRange searchPlaceholder="Search agreements" filters={[{ key: "status", label: "Status", options: statusOptions(["GENERATED", "EXECUTED", "SUPERSEDED", "DECLINED"]) }, { key: "language", label: "Language", options: statusOptions(["EN", "KM", "BILINGUAL"]) }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/agreements/${r.id}` }, { label: "Preview", icon: Printer, href: (r) => `/agreements/${r.id}/preview` }, { label: "Document History", icon: History, href: (r) => `/agreements/${r.id}/history` }]} /></PageBody>;
}

export function GenerateAgreementPage() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const loans = useQuery({ queryKey: ["options", "pending-acceptance"], queryFn: ({ signal }) => loansApi.list({ status: "PENDING_ACCEPTANCE", limit: 100 }, signal) });
  const fields: FieldDef[] = [{ name: "loan_id", label: "Loan awaiting acceptance", type: "select", required: true, options: (loans.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.account_no} · ${l.borrower_name}` })) }, { name: "language", label: "Agreement Language", type: "select", required: true, defaultValue: "BILINGUAL", options: [{ value: "EN", label: "English" }, { value: "KM", label: "Khmer" }, { value: "BILINGUAL", label: "Bilingual" }] }];
  const form = useZodForm(fields);
  const submit = form.handleSubmit(async (v) => { const r = await execute(() => agreementsApi.generate(String(v.loan_id), String(v.language)), { success: "Agreement generated" }); router.push(`/agreements/${r.id}/preview`); });
  return <PageBody><PageHeader title="Generate Agreement" description="Uses the approved terms and proposed schedule of the selected loan." /><form onSubmit={submit}><Section><FormFields form={form} fields={fields} columns={2} /><div className="mt-4 flex justify-end"><Button type="submit">{t("Generate Agreement")}</Button></div></Section></form></PageBody>;
}

interface AgreementDetail extends Row { id: string; agreement_no: string; language: string; status: string; version: number; template_version: string; signed_at: string | null; signing_method: string | null; sha256: string | null; generated_at: string; currency: CurrencyCode; history: { version: number; action: string; at: string; by: string }[]; loan: LoanSummary; schedule: { installments: Installment[]; total_principal: string; total_interest: string }; borrower: Borrower; collateral: Row[]; guarantors: Row[]; company: Row }
const useAgreement = () => { const { id } = useParams<{ id: string }>(); return { id, query: useQuery({ queryKey: ["agreement", id], queryFn: ({ signal }) => agreementsApi.get(id, signal) as unknown as Promise<AgreementDetail> }) }; };

export function AgreementDetailPage() {
  const t = useT();
  const { id, query } = useAgreement();
  return (
    <PageBody><QueryView query={query}>{(a) => (<>
      <PageHeader title={a.agreement_no} description={`${a.loan.account_no} · ${a.loan.borrower_name}`} badge={<StatusBadge status={a.status} />} actions={<>
        <Button asChild variant="outline" size="sm"><Link href={`/agreements/${id}/preview`}><Printer className="size-4" />{t("Preview")}</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={`/agreements/${id}/history`}>{t("Document History")}</Link></Button>
        {a.status === "GENERATED" && <><ActionButton label="Record Signing" icon={FileSignature} perms={["agreement.execute"]} action={{ title: "Record executed agreement", description: "The executed copy is locked with a hash and the loan moves to Accepted. Wet-ink signature remains the default until electronic signature validity is confirmed (V-06).", fields: [{ name: "signed_at", label: "Signing Date", type: "date", required: true, maxToday: true }, { name: "signing_method", label: "Signing Method", type: "select", required: true, defaultValue: "Wet-ink signature (scanned)", options: [{ value: "Wet-ink signature (scanned)", label: "Wet-ink signature (scanned)" }] }, { name: "file", label: "Signed Copy", type: "file", required: true }], run: (v) => agreementsApi.execute(id, { signed_at: v.signed_at, signing_method: v.signing_method, file_name: (v.file as { name: string }).name }), successMessage: "Agreement executed" }} /><ActionButton label="Terms Declined" icon={XCircle} variant="destructive" perms={["agreement.execute"]} action={{ title: "Record that the borrower declined", destructive: true, description: "The loan is cancelled.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => agreementsApi.decline(id, String(v.reason)), successMessage: "Loan cancelled" }} /></>}
      </>} />
      <Section title="Agreement Details"><DetailGrid columns={4} items={[["Loan Account", a.loan.account_no], ["Borrower", a.loan.borrower_name], ["Principal", <MoneyDisplay key="p" value={a.loan.contractual_principal} currency={a.currency} />], ["Language", <StatusBadge key="l" status={a.language} />], ["Version", a.version], ["Template Version", a.template_version], ["Generated", formatDateTime(a.generated_at)], ["Signing Date", formatDate(a.signed_at)], ["Signing Method", a.signing_method], ["SHA-256 Hash", <code key="h" className="break-all text-xs">{a.sha256 ?? "—"}</code>]]} /></Section>
    </>)}</QueryView></PageBody>
  );
}

export function AgreementPreviewPage() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { query } = useAgreement();
  const [lang, setLang] = useState<string | null>(null);
  return (
    <PageBody><QueryView query={query}>{(a) => {
      const mode = lang ?? a.language;
      const km = mode !== "EN", en = mode !== "KM";
      const b = (e: string, k: string) => (en && km ? `${e} / ${k}` : km ? k : e);
      const m = (v: string) => `${a.currency} ${formatAmount(v, a.currency)}`;
      const c = a.company as Record<string, string>;
      const rows: [string, string][] = [["Principal", m(a.loan.contractual_principal)], ["Interest Rate", `${a.loan.annual_rate} % p.a. (${a.loan.terms.interest_method}, ${a.loan.terms.day_count})`], ["Repayment Frequency", a.loan.frequency], ["Number of Installments", String(a.loan.term)], ["Total Interest", m(a.schedule.total_interest)], ["Maturity", formatDate(a.loan.maturity_date)], ["Purpose", a.loan.purpose]];
      return (<>
        <PageHeader title="Agreement Preview" actions={<>{["EN", "KM", "BILINGUAL"].map((x) => <Button key={x} variant={mode === x ? "secondary" : "ghost"} size="sm" onClick={() => setLang(x)}>{t(x === "EN" ? "English" : x === "KM" ? "Khmer" : "Bilingual")}</Button>)}<Button size="sm" onClick={() => window.print()}><Printer className="size-4" />{t("Print / PDF")}</Button></>} />
        <article className="print-area mx-auto max-w-3xl space-y-5 rounded-lg border bg-white p-8 text-sm text-black">
          <header className="text-center"><p className="font-semibold">{en && c.legal_name_en}{en && km && " · "}{km && c.legal_name_km}</p><h2 className="mt-2 text-lg font-bold">{b("LOAN AGREEMENT", "កិច្ចសន្យាខ្ចីប្រាក់")}</h2><p>{a.agreement_no} · {b("Version", "កំណែ")} {a.version} · {formatDateLong(a.generated_at, locale)}</p>{a.status !== "EXECUTED" && <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{b("Demonstration draft — not a legal document", "សេចក្តីព្រាងសាកល្បង")}</p>}</header>
          <section><h3 className="mb-1 font-semibold">{b("1. Parties", "១. ភាគី")}</h3><p>{b("Lender", "ម្ចាស់បំណុល")}: {c.legal_name_en}, {c.address}</p><p>{b("Borrower", "អ្នកខ្ចី")}: {a.borrower.name_km} / {a.borrower.name_en} · {a.borrower.id_type} {a.borrower.id_number}</p><p>{b("Address", "អាសយដ្ឋាន")}: {a.borrower.address_text}</p>{a.guarantors.map((g) => <p key={String(g.id)}>{b("Guarantor", "អ្នកធានា")}: {String(g.name)} ({String(g.relationship)})</p>)}</section>
          <section><h3 className="mb-1 font-semibold">{b("2. Loan Terms", "២. លក្ខខណ្ឌប្រាក់កម្ចី")}</h3><table className="w-full"><tbody>{rows.map(([k, v]) => <tr key={k} className="border-b"><td className="py-1 pr-4 text-gray-600">{en ? k : t(k)}</td><td className="py-1 font-medium">{v}</td></tr>)}</tbody></table></section>
          <section><h3 className="mb-1 font-semibold">{b("3. Fees and Charges", "៣. កម្រៃ និងការពិន័យ")}</h3><p>{b("Fees and penalty rules follow the approved product version and the attached schedule. Legal wording requires an approved template.", "កម្រៃ និងការពិន័យអនុវត្តតាមកំណែផលិតផលដែលបានអនុម័ត។")}</p></section>
          {a.collateral.length > 0 && <section><h3 className="mb-1 font-semibold">{b("4. Collateral", "៤. ទ្រព្យធានា")}</h3>{a.collateral.map((x) => <p key={String(x.id)}>{String(x.collateral_type)} · {String(x.identifier)} · {m(String(x.accepted_value))}</p>)}</section>}
          <section className="break-inside-auto"><h3 className="mb-1 font-semibold">{b("Repayment Schedule", "តារាងសងប្រាក់")}</h3><div className="[&_*]:text-black"><ScheduleTable currency={a.currency} rows={a.schedule.installments} totals={{ principal: a.schedule.total_principal, interest: a.schedule.total_interest }} /></div></section>
          <section className="grid grid-cols-2 gap-10 pt-10 break-inside-avoid"><div className="border-t border-black pt-1 text-center">{b("Borrower signature", "ហត្ថលេខាអ្នកខ្ចី")}</div><div className="border-t border-black pt-1 text-center">{b("Lender signature", "ហត្ថលេខាម្ចាស់បំណុល")}</div></section>
        </article>
      </>);
    }}</QueryView></PageBody>
  );
}

export function AgreementHistoryPage() {
  const { query } = useAgreement();
  return <PageBody><PageHeader title="Document History" /><QueryView query={query}>{(a) => <Section title={a.agreement_no}><ul className="space-y-2 text-sm">{a.history.map((h, i) => <li key={i}><span className="font-medium">v{h.version}</span> · {h.action}<span className="block text-xs text-muted-foreground">{h.by} · {formatDateTime(h.at)}</span></li>)}</ul></Section>}</QueryView></PageBody>;
}
