"use client";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker, SearchInput } from "@/components/forms/fields";
import { MoneyDisplay, Section, StatusBadge, statusLabel } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { CURRENCY_OPTIONS, FilterPanel, FilterSelect, useBranchOptions, useProductOptions } from "@/components/tables/filter-panel";
import { reportsApi } from "@/lib/api/reports";
import { useAuth, useCan } from "@/lib/auth/store";
import { exportCsv, exportXlsx, printTable, type Sheet } from "@/lib/export";
import { formatDate, formatDateTime } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { ReportDefinition, ReportResult, Row } from "@/types";

const CATEGORIES = ["Portfolio", "Collections", "Financial", "Risk", "Control"];

function Catalogue({ category }: { category?: string }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["reports-catalogue"], queryFn: ({ signal }) => reportsApi.catalogue(signal) });
  return (
    <PageBody>
      <PageHeader title={category ? `${category} Reports` : "Report Catalogue"} description="All reports are management reports. Regulatory formats are added only after requirements are confirmed (V-11)." />
      <FilterPanel><SearchInput value={search} onChange={setSearch} placeholder="Search reports" className="w-full sm:w-72" /></FilterPanel>
      <QueryView query={q}>{(d) => {
        const match = (r: ReportDefinition) => (!category || r.category === category) && `${r.code} ${r.name} ${r.purpose}`.toLowerCase().includes(search.toLowerCase());
        const groups = CATEGORIES.map((c) => ({ c, rows: d.items.filter((r) => r.category === c && match(r)) })).filter((g) => g.rows.length);
        if (!groups.length) return <Section><EmptyState title="No reports found" description="Your role may not include these reports." /></Section>;
        return groups.map((g) => <Section key={g.c} title={`${t(g.c)} ${t("Reports")}`} flush><ul className="grid sm:grid-cols-2 xl:grid-cols-3">{g.rows.map((r) => <li key={r.code} className="border-b p-4 sm:border-r"><Link className="font-medium text-primary hover:underline" href={`/reports/${r.code}`}>{t(r.name)}</Link><p className="text-xs text-muted-foreground">{r.code}</p><p className="mt-1 text-sm text-muted-foreground">{t(r.purpose)}</p></li>)}</ul></Section>);
      }}</QueryView>
    </PageBody>
  );
}
export const ReportCataloguePage = () => <Catalogue />;
export function ReportCategoryPage() {
  const { category } = useParams<{ category: string }>();
  return <Catalogue category={category.charAt(0).toUpperCase() + category.slice(1)} />;
}

function cellString(value: unknown, type: string, currency: CurrencyCode) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money") return formatAmount(String(value), currency);
  if (type === "date") return formatDate(String(value));
  if (type === "datetime") return formatDateTime(String(value));
  if (type === "status") return statusLabel(String(value));
  if (type === "percent") return `${String(value)} %`;
  return String(value);
}

function Cell({ value, type, currency }: { value: unknown; type: string; currency: CurrencyCode }) {
  if (type === "status") return <StatusBadge status={String(value ?? "")} />;
  if (type === "money") return <MoneyDisplay value={value as string | null} currency={currency} hideCode />;
  return <>{cellString(value, type, currency) || "—"}</>;
}

export function ReportViewerPage() {
  const t = useT();
  const can = useCan();
  const user = useAuth((s) => s.user);
  const { code } = useParams<{ code: string }>();
  const branches = useBranchOptions();
  const products = useProductOptions();
  const [params, setParams] = useState({ branch_id: "", product_id: "", currency: "USD", date_from: "", date_to: "", search: "" });
  const set = (k: keyof typeof params) => (v: string) => setParams((p) => ({ ...p, [k]: v }));
  const q = useQuery({ queryKey: ["report", code, params], queryFn: ({ signal }) => reportsApi.run(code, params, signal) });
  const sheetOf = useMemo(() => (r: ReportResult): Sheet => ({ title: `${r.report.code} ${t(r.report.name)} — ${t(r.label)}`, headers: r.columns.map((c) => t(c.label)), rows: r.rows.map((row: Row) => r.columns.map((c) => cellString(row[c.key], c.type, r.currency))), footer: [`${t("Generated by")} ${user?.name} · ${formatDateTime(r.generated_at)}`, `${t("Data cut-off")}: ${formatDate(r.data_cut_off)} · ${r.currency}`, ...r.definitions, r.note ?? "", t("Demonstration data")] }), [t, user]);
  const doExport = (r: ReportResult, format: "pdf" | "xlsx" | "csv" | "print") => {
    const file = `${r.report.code}-${r.data_cut_off}`;
    if (format === "csv") exportCsv(sheetOf(r), file);
    else if (format === "xlsx") exportXlsx(sheetOf(r), file);
    else if (!printTable(sheetOf(r))) { toast.error(t("Allow pop-ups to print this list.")); return; }
    void reportsApi.logExport(r.report.code, { format, rows: r.rows.length, parameters: params }).catch(() => undefined);
    toast.success(t(format === "csv" || format === "xlsx" ? "Export generated" : "Print view opened"));
  };
  return (
    <PageBody>
      <QueryView query={q}>{(r) => (<>
        <PageHeader title={`${r.report.code} · ${t(r.report.name)}`} description={r.report.purpose} badge={<StatusBadge status={r.label} tone="info" className="max-w-full whitespace-normal" />} actions={can("report.export") && <><Button size="sm" variant="outline" onClick={() => doExport(r, "pdf")}><FileText className="size-4" />PDF</Button><Button size="sm" variant="outline" onClick={() => doExport(r, "xlsx")}><FileSpreadsheet className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => doExport(r, "csv")}>CSV</Button><Button size="sm" variant="outline" onClick={() => doExport(r, "print")}><Printer className="size-4" />{t("Print")}</Button></>} />
        <FilterPanel>
          <DateRangePicker from={params.date_from} to={params.date_to} onChange={(date_from, date_to) => setParams((p) => ({ ...p, date_from, date_to }))} />
          <FilterSelect label="Branch" value={params.branch_id} onChange={set("branch_id")} options={branches} />
          <FilterSelect label="Product" value={params.product_id} onChange={set("product_id")} options={products} />
          <FilterSelect label="Currency" value={params.currency} onChange={(v) => set("currency")(v || "USD")} options={CURRENCY_OPTIONS} />
          <SearchInput value={params.search} onChange={set("search")} placeholder="Search report" className="w-full sm:w-56" />
        </FilterPanel>
        <Section flush>{r.rows.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow>{r.columns.map((c) => <TableHead key={c.key} className={["money", "number", "percent"].includes(c.type) ? "text-right" : ""}>{t(c.label)}</TableHead>)}</TableRow></TableHeader><TableBody>{r.rows.map((row, i) => <TableRow key={i}>{r.columns.map((c) => <TableCell key={c.key} className={["money", "number", "percent"].includes(c.type) ? "text-right tabular" : ""}><Cell value={row[c.key]} type={c.type} currency={r.currency} /></TableCell>)}</TableRow>)}</TableBody></Table></div> : <EmptyState title="No data for these parameters" />}</Section>
        <div className="space-y-1 text-xs text-muted-foreground"><p>{t("Generated")} {formatDateTime(r.generated_at)} · {t("Data cut-off")} {formatDate(r.data_cut_off)} · {r.currency} · {t("Parameters")}: {r.report.parameters}</p>{r.note && <p>{t(r.note)}</p>}{r.definitions.map((d) => <p key={d}>{t(d)}</p>)}</div>
      </>)}</QueryView>
    </PageBody>
  );
}
