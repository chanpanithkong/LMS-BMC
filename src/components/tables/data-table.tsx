"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef as TanColumn, type RowSelectionState, type VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, FileSpreadsheet, FileText, MoreHorizontal, Printer, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionDialog, type ActionDef } from "@/components/dialogs/action-dialog";
import { DateRangePicker, SearchInput } from "@/components/forms/fields";
import { MoneyDisplay, StatusBadge, statusLabel } from "@/components/shared/display";
import { DpdBadge } from "@/components/shared/loan-summary-card";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared/states";
import { useAuth, useCan } from "@/lib/auth/store";
import { apiRequest, type ListParams, type Page, type QueryValue } from "@/lib/api/client";
import { reportsApi } from "@/lib/api/reports";
import { exportCsv, exportXlsx, printTable, type Sheet } from "@/lib/export";
import { formatDate, formatDateTime, todayISO } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Permission } from "@/lib/permissions";

export type CellType = "text" | "money" | "date" | "datetime" | "status" | "number" | "percent" | "dpd" | "boolean";

export interface Col<T> {
  key: string; label: string; type?: CellType; currency?: (row: T) => CurrencyCode; href?: (row: T) => string; render?: (row: T) => ReactNode; sortable?: boolean; hidden?: boolean; exportValue?: (row: T) => string;
}
export interface Filter { key: string; label: string; options: { value: string; label: string }[] }
export interface RowAction<T> { label: string; icon?: LucideIcon; href?: (row: T) => string; perms?: Permission[]; visible?: (row: T) => boolean; dialog?: (row: T) => ActionDef }
export interface BulkAction<T> { label: string; perms?: Permission[]; run: (rows: T[]) => Promise<unknown> | void }

export interface DataTableProps<T> {
  /** Unique query identity and the export name. */
  name: string;
  fetcher: (params: ListParams, signal?: AbortSignal) => Promise<Page<T>>;
  columns: Col<T>[];
  params?: Record<string, QueryValue>;
  filters?: Filter[];
  dateRange?: boolean;
  searchPlaceholder?: string;
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
  toolbar?: ReactNode;
  defaultSort?: string;
  rowId?: (row: T) => string;
  pageSize?: number;
  emptyTitle?: string;
  exportable?: boolean;
  compact?: boolean;
}

function cellText<T extends object>(col: Col<T>, row: T): string {
  if (col.exportValue) return col.exportValue(row);
  const raw = (row as Record<string, unknown>)[col.key];
  if (raw === null || raw === undefined) return "";
  if (col.type === "money") return formatAmount(String(raw), col.currency?.(row) ?? "USD");
  if (col.type === "date") return formatDate(String(raw));
  if (col.type === "datetime") return formatDateTime(String(raw));
  if (col.type === "status") return statusLabel(String(raw));
  return String(raw);
}

export function renderCell<T extends object>(col: Col<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  const raw = (row as Record<string, unknown>)[col.key];
  let content: ReactNode;
  switch (col.type) {
    case "money": content = <MoneyDisplay value={raw as string} currency={col.currency?.(row) ?? "USD"} />; break;
    case "date": content = formatDate(raw as string); break;
    case "datetime": content = <span className="whitespace-nowrap">{formatDateTime(raw as string)}</span>; break;
    case "status": content = <StatusBadge status={String(raw ?? "")} />; break;
    case "dpd": content = <DpdBadge dpd={Number(raw ?? 0)} />; break;
    case "percent": content = raw === null || raw === undefined ? "—" : `${String(raw)} %`; break;
    case "boolean": content = raw ? "✓" : "—"; break;
    default: content = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  }
  return col.href ? <Link className="font-medium text-primary underline-offset-2 hover:underline" href={col.href(row)}>{content}</Link> : content;
}

const right = (t?: CellType) => t === "money" || t === "number" || t === "percent";

export function DataTable<T extends object>({ name, fetcher, columns, params, filters = [], dateRange, searchPlaceholder = "Search", rowActions, bulkActions, toolbar, defaultSort, rowId, pageSize: initialSize = 25, emptyTitle, exportable = true, compact }: DataTableProps<T>) {
  const t = useT();
  const can = useCan();
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(defaultSort ?? "");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [range, setRange] = useState({ from: "", to: "" });
  const [pageSize, setPageSize] = useState(initialSize);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(columns.filter((c) => c.hidden).map((c) => [c.key, false])));
  const [active, setActive] = useState<{ def: ActionDef } | null>(null);

  const resetPage = useCallback(() => { setCursors([null]); setSelection({}); }, []);
  const query: ListParams = { ...params, ...filterValues, search, sort, limit: pageSize, date_from: range.from, date_to: range.to };
  const cursor = cursors[cursors.length - 1];
  const result = useQuery({ queryKey: ["list", name, query, cursor], queryFn: ({ signal }) => fetcher({ ...query, cursor }, signal), placeholderData: keepPreviousData });

  const visibleActions = useMemo(() => (rowActions ?? []).filter((a) => !a.perms || can(...a.perms)), [rowActions, can]);
  const tableColumns = useMemo<TanColumn<T>[]>(() => {
    const out: TanColumn<T>[] = columns.map((c) => ({ id: c.key, header: () => t(c.label), cell: ({ row }) => renderCell(c, row.original), enableHiding: true, meta: c }));
    if (bulkActions?.length) out.unshift({ id: "__select", enableHiding: false, header: ({ table }) => <Checkbox aria-label={t("Select all")} checked={table.getIsAllPageRowsSelected()} onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)} />, cell: ({ row }) => <Checkbox aria-label={t("Select row")} checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v === true)} /> });
    if (visibleActions.length) out.push({ id: "__actions", enableHiding: false, header: () => <span className="sr-only">{t("Actions")}</span>, cell: ({ row }) => {
      const items = visibleActions.filter((a) => !a.visible || a.visible(row.original));
      if (!items.length) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("Row actions")}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {items.map((a) => a.href ? <DropdownMenuItem key={a.label} asChild><Link href={a.href(row.original)}>{a.icon && <a.icon className="size-4" />}{t(a.label)}</Link></DropdownMenuItem> : <DropdownMenuItem key={a.label} onSelect={() => setActive({ def: a.dialog!(row.original) })}>{a.icon && <a.icon className="size-4" />}{t(a.label)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    } });
    return out;
  }, [columns, visibleActions, bulkActions, t]);

  const items = useMemo(() => result.data?.items ?? [], [result.data]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: items, columns: tableColumns, state: { rowSelection: selection, columnVisibility: visibility }, onRowSelectionChange: setSelection, onColumnVisibilityChange: setVisibility, getCoreRowModel: getCoreRowModel(), manualPagination: true, getRowId: rowId ?? ((row, i) => String((row as { id?: string }).id ?? i)), enableRowSelection: Boolean(bulkActions?.length) });

  const exportData = async (format: "csv" | "xlsx" | "pdf") => {
    const gathered: T[] = [];
    let next: string | null = null;
    do {
      const page: Page<T> = await fetcher({ ...query, limit: 200, cursor: next });
      gathered.push(...page.items);
      next = page.next_cursor;
    } while (next);
    const shown = columns.filter((c) => visibility[c.key] !== false);
    const stamp = `${t("Generated by")} ${user?.name ?? ""} · ${formatDateTime(new Date().toISOString())} · ${t("Demonstration data")}`;
    const sheet: Sheet = { title: t(name), headers: shown.map((c) => t(c.label)), rows: gathered.map((r) => shown.map((c) => cellText(c, r))), footer: [stamp] };
    const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayISO()}`;
    if (format === "csv") exportCsv(sheet, file);
    else if (format === "xlsx") exportXlsx(sheet, file);
    else if (!printTable(sheet)) toast.error(t("Allow pop-ups to print this list."));
    void reportsApi.logExport(`LIST:${name}`, { format, rows: gathered.length, parameters: query }).catch(() => undefined);
    if (format !== "pdf") toast.success(t("Export generated"));
  };

  const toggleSort = (key: string) => { setSort((s) => (s === key ? `-${key}` : s === `-${key}` ? "" : key)); resetPage(); };
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const pageNo = cursors.length;
  const total = result.data?.total ?? 0;
  const anyFilter = Boolean(search || Object.values(filterValues).some(Boolean) || range.from || range.to);
  const dataColumns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <div className="rounded-xl border bg-card">
      <div className="no-print flex flex-wrap items-center gap-2 border-b p-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); resetPage(); }} placeholder={searchPlaceholder} className="w-full sm:w-60" />
        {filters.map((f) => (
          <Select key={f.key} value={filterValues[f.key] || "__all"} onValueChange={(v) => { setFilterValues((s) => ({ ...s, [f.key]: v === "__all" ? "" : v })); resetPage(); }}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t(f.label)}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">{t("All")}: {t(f.label)}</SelectItem>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}</SelectContent>
          </Select>
        ))}
        {dateRange && <DateRangePicker from={range.from} to={range.to} onChange={(from, to) => { setRange({ from, to }); resetPage(); }} />}
        {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterValues({}); setRange({ from: "", to: "" }); resetPage(); }}><X className="size-4" />{t("Clear")}</Button>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 className="size-4" />{t("Columns")}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>{t("Visible columns")}</DropdownMenuLabel><DropdownMenuSeparator />
              {dataColumns.map((c) => <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(v === true)} onSelect={(e) => e.preventDefault()}>{t((c.columnDef.meta as Col<T>).label)}</DropdownMenuCheckboxItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportable && can("report.export") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download className="size-4" />{t("Export")}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportData("csv")}><FileText className="size-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportData("xlsx")}><FileSpreadsheet className="size-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportData("pdf")}><Printer className="size-4" />{t("PDF / Print")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {selected.length > 0 && bulkActions && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b bg-accent/50 px-3 py-2 text-sm">
          <span>{selected.length} {t("selected")}</span>
          {bulkActions.filter((a) => !a.perms || can(...a.perms)).map((a) => <Button key={a.label} size="sm" variant="outline" onClick={() => void Promise.resolve(a.run(selected)).then(() => setSelection({}))}>{t(a.label)}</Button>)}
        </div>
      )}
      {result.isLoading ? <LoadingSkeleton /> : result.isError ? <ErrorState error={result.error} onRetry={() => void result.refetch()} /> : items.length === 0 ? <EmptyState title={emptyTitle ?? "No records found"} description={anyFilter ? "Try changing the search or filters." : undefined} /> : (
        <div className={`overflow-x-auto ${result.isFetching ? "opacity-70" : ""}`}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((h) => {
                    const meta = h.column.columnDef.meta as Col<T> | undefined;
                    const sortable = meta && meta.sortable !== false;
                    const key = meta?.key;
                    return (
                      <TableHead key={h.id} className={right(meta?.type) ? "text-right" : ""} aria-sort={sort === key ? "ascending" : sort === `-${key}` ? "descending" : undefined}>
                        {sortable ? <button type="button" className={`inline-flex items-center gap-1 hover:text-foreground ${right(meta?.type) ? "flex-row-reverse" : ""}`} onClick={() => toggleSort(key!)}>{flexRender(h.column.columnDef.header, h.getContext())}{sort === key ? <ArrowUp className="size-3" /> : sort === `-${key}` ? <ArrowDown className="size-3" /> : null}</button> : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={`${right((cell.column.columnDef.meta as Col<T> | undefined)?.type) ? "text-right tabular" : ""} ${compact ? "py-1.5" : ""}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
        <span>{total} {t("records")}</span>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); resetPage(); }}>
            <SelectTrigger size="sm" className="w-20" aria-label={t("Rows per page")}><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <span>{t("Page")} {pageNo}</span>
          <Button variant="outline" size="icon" aria-label={t("Previous page")} disabled={pageNo === 1} onClick={() => setCursors((c) => c.slice(0, -1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon" aria-label={t("Next page")} disabled={!result.data?.next_cursor} onClick={() => setCursors((c) => [...c, result.data!.next_cursor])}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      {active && <ActionDialog action={active.def} open onOpenChange={(open) => { if (!open) setActive(null); }} />}
    </div>
  );
}

/** Convenience fetcher for ad-hoc list endpoints. */
export const listFrom = <T,>(path: string) => (params: ListParams, signal?: AbortSignal) => apiRequest<Page<T>>(path, { query: params, signal });
