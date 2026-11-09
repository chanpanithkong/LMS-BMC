"use client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, Lock, Plus, RotateCcw, Trash2, Undo2, X, Check } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { CurrencyInput, DateRangePicker, DatePicker } from "@/components/forms/fields";
import { ApprovalPanel } from "@/components/shared/approval-panel";
import { DetailGrid, MoneyDisplay, Section, SimulatedTag, StatCard, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { DataTable, type Col } from "@/components/tables/data-table";
import { CURRENCY_OPTIONS, FilterPanel, FilterSelect } from "@/components/tables/filter-panel";
import { CURRENCIES, statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { accountingApi } from "@/lib/api/accounting";
import { useAuth, useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime, todayISO } from "@/lib/formatters/date";
import { formatAmount, isPositiveDecimal, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Journal, Row } from "@/types";

const jCols: Col<Journal>[] = [{ key: "journal_no", label: "Journal No.", href: (r) => `/accounting/journals/${r.id}` }, { key: "accounting_date", label: "Accounting Date", type: "date" }, { key: "description", label: "Description" }, { key: "source_type", label: "Source", type: "status" }, { key: "currency", label: "Currency", hidden: true }, { key: "total_debit", label: "Debit", type: "money", currency: (r) => r.currency }, { key: "total_credit", label: "Credit", type: "money", currency: (r) => r.currency }, { key: "created_by_name", label: "Prepared by", hidden: true }, { key: "status", label: "Status", type: "status" }];

export function AccountingDashboardPage() {
  const t = useT();
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const q = useQuery({ queryKey: ["accounting-dashboard", currency], queryFn: ({ signal }) => accountingApi.dashboard(currency, signal) });
  return <PageBody><PageHeader title="Accounting Dashboard" description="General ledger position. Recognition policy must be confirmed by a qualified accountant (V-10)." actions={<FilterSelect label="Currency" value={currency} onChange={(v) => setCurrency((v || "USD") as CurrencyCode)} options={CURRENCY_OPTIONS} />} /><QueryView query={q}>{(d) => { const m = (k: string) => <MoneyDisplay value={String(d[k])} currency={currency} />; const period = d.open_period as Row | undefined; return (<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><StatCard title="Assets" value={m("assets")} /><StatCard title="Liabilities" value={m("liabilities")} /><StatCard title="Equity" value={m("equity")} /><StatCard title="Income" value={m("income")} tone="success" definition="From posted journals, on the configured recognition policy." /><StatCard title="Expenses" value={m("expenses")} tone="warning" /></div>
    <div className="grid gap-3 sm:grid-cols-3"><StatCard title="Journals Awaiting Approval" value={String(d.pending_journals)} tone="warning" href="/accounting/journals" /><StatCard title="Reconciliation Differences" value={String(d.reconciliation_differences)} tone="danger" href="/accounting/reconciliation" /><StatCard title="Open Period" value={String(period?.name ?? "—")} href={period ? `/accounting/periods/${String(period.id)}/close` : undefined} /></div>
    <Section title="Recent journals" flush><ul className="divide-y">{(d.recent as Journal[]).map((j) => <li key={j.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span className="min-w-0"><Link className="font-medium text-primary hover:underline" href={`/accounting/journals/${j.id}`}>{j.journal_no}</Link><span className="block truncate text-xs text-muted-foreground">{t(j.description)}</span></span><span className="flex items-center gap-3"><MoneyDisplay value={j.total_debit} currency={j.currency} /><StatusBadge status={j.status} /></span></li>)}</ul></Section>
  </>); }}</QueryView></PageBody>;
}

const accCols: Col<Row>[] = [{ key: "code", label: "Code", href: (r) => `/accounting/accounts/${String(r.id)}` }, { key: "name", label: "Account" }, { key: "account_type", label: "Type", type: "status" }, { key: "parent", label: "Parent" }, { key: "postable", label: "Postable", type: "boolean" }, { key: "status", label: "Status", type: "status" }];
const accFields = [{ name: "code", label: "Code", required: true }, { name: "name", label: "Account", required: true }, { name: "account_type", label: "Type", type: "select" as const, required: true, options: statusOptions(["ASSET", "CONTRA_ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "MEMO"]) }, { name: "parent", label: "Parent" }, { name: "mapping", label: "Account Mapping" }];
export function ChartOfAccountsPage() {
  return <PageBody><PageHeader title="Chart of Accounts" description="Illustrative structure pending confirmation by a qualified accountant." actions={<ActionButton label="Add Account" icon={Plus} perms={["accounting.configure"]} action={{ title: "Add account", fields: accFields, run: (v) => accountingApi.accounts.create({ ...v, postable: true, status: "ACTIVE", currency: "ALL" }), successMessage: "Account added" }} />} /><DataTable name="Chart of accounts" fetcher={accountingApi.accounts.list} columns={accCols} defaultSort="code" pageSize={50} searchPlaceholder="Search accounts" filters={[{ key: "account_type", label: "Type", options: statusOptions(["ASSET", "CONTRA_ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "MEMO"]) }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/accounting/accounts/${String(r.id)}` }, { label: "Edit", perms: ["accounting.configure"], dialog: (r) => ({ title: "Edit account", fields: accFields, defaults: r, run: (v) => accountingApi.accounts.update(String(r.id), v), successMessage: "Account updated" }) }]} /></PageBody>;
}

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["account", id], queryFn: ({ signal }) => accountingApi.accounts.get(id, signal) });
  return <PageBody><QueryView query={q}>{(a) => (<><PageHeader title={`${String(a.code)} · ${String(a.name)}`} badge={<StatusBadge status={String(a.account_type)} />} /><div className="grid gap-3 sm:grid-cols-2">{(a.balances as { currency: CurrencyCode; debit: string; credit: string; balance: string }[]).map((b) => <StatCard key={b.currency} title={`Balance (${b.currency})`} value={<MoneyDisplay value={b.balance} currency={b.currency} />} sub={`Dr ${formatAmount(b.debit, b.currency)} · Cr ${formatAmount(b.credit, b.currency)}`} />)}</div><DataTable name="Account lines" exportable={false} columns={lineCols} fetcher={async () => ({ items: a.lines as Row[], total: (a.lines as Row[]).length, next_cursor: null })} /></>)}</QueryView></PageBody>;
}

const lineCols: Col<Row>[] = [{ key: "accounting_date", label: "Date", type: "date" }, { key: "journal_no", label: "Journal No.", href: (r) => `/accounting/journals/${String(r.journal_id)}` }, { key: "account_code", label: "Account" }, { key: "description", label: "Description" }, { key: "debit", label: "Debit", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "credit", label: "Credit", type: "money", currency: (r) => r.currency as CurrencyCode }];

export function JournalListPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="Journal Entries" description="Posted journals are immutable. Corrections are made by reversal." actions={can("journal.create") && <Button asChild size="sm"><Link href="/accounting/journals/new"><Plus className="size-4" />{t("New Manual Journal")}</Link></Button>} /><DataTable name="Journal entries" fetcher={accountingApi.journals.list} columns={jCols} dateRange searchPlaceholder="Search journals" filters={[{ key: "status", label: "Status", options: statusOptions(["PENDING_APPROVAL", "POSTED", "REVERSED", "REJECTED"]) }, { key: "source_type", label: "Source", options: statusOptions(["DISBURSEMENT", "REPAYMENT", "MANUAL", "REFUND"]) }, { key: "currency", label: "Currency", options: CURRENCIES }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/accounting/journals/${r.id}` }]} /></PageBody>;
}

interface Line { key: number; account_code: string; debit: string; credit: string }
export function NewJournalPage() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const user = useAuth((s) => s.user);
  const accounts = useQuery({ queryKey: ["options", "accounts"], queryFn: ({ signal }) => accountingApi.accounts.list({ limit: 200, sort: "code" }, signal) });
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, account_code: "", debit: "", credit: "" }, { key: 2, account_code: "", debit: "", credit: "" }]);
  const [error, setError] = useState<string | null>(null);
  const change = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const submit = async () => {
    if (!description.trim()) return setError("Enter a description.");
    if (lines.some((l) => !l.account_code || (!isPositiveDecimal(l.debit) && !isPositiveDecimal(l.credit)) || (isPositiveDecimal(l.debit) && isPositiveDecimal(l.credit)))) return setError("Each line needs an account and either a debit or a credit.");
    setError(null);
    const r = await execute(() => accountingApi.journals.create({ description, accounting_date: date, currency, lines: lines.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit })) }), { success: "Journal submitted for approval", simulated: true }).catch(() => null);
    if (r) router.push(`/accounting/journals/${r.id}`);
  };
  return <PageBody><PageHeader title="New Manual Journal" description={`${t("Prepared by")} ${user?.name}. ${t("The server checks that debits equal credits and that the period is open. A different user must approve.")}`} badge={<SimulatedTag />} />
    <Section><div className="grid gap-4 sm:grid-cols-3"><div className="sm:col-span-1"><p className="mb-1.5 text-sm font-medium">{t("Accounting Date")}</p><DatePicker value={date} onChange={setDate} /></div><div><p className="mb-1.5 text-sm font-medium">{t("Currency")}</p><div className="flex gap-1">{(["USD", "KHR"] as const).map((c) => <Button key={c} type="button" size="sm" variant={currency === c ? "secondary" : "outline"} onClick={() => setCurrency(c)}>{c}</Button>)}</div></div><div className="sm:col-span-3"><p className="mb-1.5 text-sm font-medium">{t("Description")}</p><Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label={t("Description")} /></div></div></Section>
    <Section title="Lines" actions={<Button size="sm" variant="outline" onClick={() => setLines((l) => [...l, { key: Math.max(...l.map((x) => x.key)) + 1, account_code: "", debit: "", credit: "" }])}><Plus className="size-4" />{t("Add Line")}</Button>} flush><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("Account")}</TableHead><TableHead className="w-48 text-right">{t("Debit")}</TableHead><TableHead className="w-48 text-right">{t("Credit")}</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{lines.map((l) => <TableRow key={l.key}><TableCell><select aria-label={t("Account")} className="w-full rounded-md border bg-transparent p-2 text-sm" value={l.account_code} onChange={(e) => change(l.key, { account_code: e.target.value })}><option value="">{t("Select")}</option>{(accounts.data?.items ?? []).map((a) => <option key={String(a.id)} value={String(a.code)}>{String(a.code)} · {String(a.name)}</option>)}</select></TableCell><TableCell><CurrencyInput value={l.debit} onChange={(debit) => change(l.key, { debit })} currency={currency} /></TableCell><TableCell><CurrencyInput value={l.credit} onChange={(credit) => change(l.key, { credit })} currency={currency} /></TableCell><TableCell>{lines.length > 2 && <Button variant="ghost" size="icon" aria-label={t("Remove line")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></Button>}</TableCell></TableRow>)}</TableBody></Table></div></Section>
    {error && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{t(error)}</p>}
    <div className="flex justify-end"><Button onClick={() => void submit()}>{t("Submit for Approval")}</Button></div>
  </PageBody>;
}

export function JournalDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["journal", id], queryFn: ({ signal }) => accountingApi.journals.get(id, signal) });
  return <PageBody><QueryView query={q}>{(j) => (<>
    <PageHeader title={j.journal_no} description={t(j.description)} badge={<StatusBadge status={j.status} />} actions={j.status === "POSTED" && <ActionButton label="Reverse Journal" icon={Undo2} variant="destructive" perms={["journal.create"]} action={{ title: "Reverse journal", destructive: true, simulated: true, description: "The original stays on record. A mirror journal is posted.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => accountingApi.journalAction(id, "reverse", v), successMessage: "Reversal journal posted" }} />} />
    <div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2">
      <Section title="Journal Details"><DetailGrid columns={3} items={[["Accounting Date", formatDate(j.accounting_date)], ["Value Date", formatDate(j.value_date)], ["Period", j.period_name], ["Source", <StatusBadge key="s" status={j.source_type} />], ["Currency", j.currency], ["Prepared by", j.created_by_name], ["Approved by", j.approved_by_name]]} /></Section>
      <Section title="Lines" flush><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("Account")}</TableHead><TableHead className="text-right">{t("Debit")}</TableHead><TableHead className="text-right">{t("Credit")}</TableHead></TableRow></TableHeader><TableBody>{j.lines.map((l) => <TableRow key={l.id}><TableCell>{l.account_code} · {t(l.account_name)}</TableCell><TableCell className="text-right tabular">{l.debit === "0.00" ? "" : formatAmount(l.debit, j.currency)}</TableCell><TableCell className="text-right tabular">{l.credit === "0.00" ? "" : formatAmount(l.credit, j.currency)}</TableCell></TableRow>)}</TableBody><TableFooter><TableRow><TableCell className="font-semibold">{t("Total")}</TableCell><TableCell className="text-right font-semibold tabular">{formatAmount(j.total_debit, j.currency)}</TableCell><TableCell className="text-right font-semibold tabular">{formatAmount(j.total_credit, j.currency)}</TableCell></TableRow></TableFooter></Table></div></Section>
    </div>
    <ApprovalPanel makers={j.manual ? [{ label: "Prepared by", id: j.created_by, name: j.created_by_name }] : undefined} note="Posted journals cannot be edited or deleted.">{j.status === "PENDING_APPROVAL" && <><ActionButton label="Approve and Post" icon={Check} perms={["journal.approve"]} action={{ title: "Approve journal", simulated: true, run: () => accountingApi.journalAction(id, "approve"), successMessage: "Journal posted" }} /><ActionButton label="Reject" icon={X} variant="destructive" perms={["journal.approve"]} action={{ title: "Reject journal", destructive: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => accountingApi.journalAction(id, "reject", v), successMessage: "Journal rejected" }} /></>}</ApprovalPanel></div>
  </>)}</QueryView></PageBody>;
}

export function TrialBalancePage() {
  const t = useT();
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [range, setRange] = useState({ from: "", to: "" });
  const q = useQuery({ queryKey: ["trial-balance", currency, range], queryFn: ({ signal }) => accountingApi.trialBalance({ currency, date_from: range.from, date_to: range.to }, signal) });
  return <PageBody><PageHeader title="Trial Balance" description="Management report from posted journals." actions={<Button asChild variant="outline" size="sm"><Link href="/reports/RPT-21">{t("Open as Report")}</Link></Button>} /><FilterPanel><DateRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /><FilterSelect label="Currency" value={currency} onChange={(v) => setCurrency((v || "USD") as CurrencyCode)} options={CURRENCY_OPTIONS} /></FilterPanel><QueryView query={q}>{(d) => <Section flush><div className="overflow-x-auto"><Table><TableHeader><TableRow>{["Code", "Account", "Type", "Opening", "Debit", "Credit", "Closing"].map((h, i) => <TableHead key={h} className={i > 2 ? "text-right" : ""}>{t(h)}</TableHead>)}</TableRow></TableHeader><TableBody>{d.rows.map((r) => <TableRow key={String(r.code)}><TableCell>{String(r.code)}</TableCell><TableCell>{t(String(r.account))}</TableCell><TableCell><StatusBadge status={String(r.account_type)} /></TableCell>{["opening", "debit", "credit", "closing"].map((k) => <TableCell key={k} className="text-right tabular">{formatAmount(String(r[k]), d.currency)}</TableCell>)}</TableRow>)}</TableBody><TableFooter><TableRow><TableCell colSpan={4} className="font-semibold">{t("Total")}</TableCell><TableCell className="text-right font-semibold tabular">{formatAmount(d.total_debit, d.currency)}</TableCell><TableCell className="text-right font-semibold tabular">{formatAmount(d.total_credit, d.currency)}</TableCell><TableCell /></TableRow></TableFooter></Table></div></Section>}</QueryView></PageBody>;
}

export const GeneralLedgerPage = () => <PageBody><PageHeader title="General Ledger" description="Journal lines by account." /><DataTable name="General ledger" fetcher={accountingApi.generalLedger.list} columns={lineCols} dateRange defaultSort="-accounting_date" searchPlaceholder="Search ledger" filters={[{ key: "currency", label: "Currency", options: CURRENCIES }, { key: "account_code", label: "Account", options: ["1000", "1010", "1100", "1110", "1120", "2100", "4000", "4100"].map((value) => ({ value, label: value })) }]} /></PageBody>;

const recCols: Col<Row>[] = [{ key: "account", label: "Account" }, { key: "type", label: "Type", type: "status" }, { key: "period", label: "Period" }, { key: "statement_balance", label: "Statement Balance", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "ledger_balance", label: "Ledger Balance", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "difference", label: "Difference", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "matched_items", label: "Matched", type: "number" }, { key: "outstanding_items", label: "Outstanding", type: "number" }, { key: "status", label: "Status", type: "status" }];
export const ReconciliationPage = () => <PageBody><PageHeader title="Reconciliation" description="Differences block period close." /><DataTable name="Reconciliation" fetcher={accountingApi.reconciliations.list} columns={recCols} rowActions={[{ label: "Match Next Item", icon: CheckCircle2, perms: ["reconcile.manage"], visible: (r) => Number(r.outstanding_items) > 0, dialog: (r) => ({ title: "Match outstanding item", simulated: true, run: () => accountingApi.reconciliationAction(String(r.id), "match"), successMessage: "Item matched" }) }, { label: "Complete", icon: Check, perms: ["reconcile.manage"], visible: (r) => r.status !== "RECONCILED", dialog: (r) => ({ title: "Complete reconciliation", simulated: true, run: () => accountingApi.reconciliationAction(String(r.id), "complete"), successMessage: "Reconciliation completed" }) }]} /></PageBody>;

const perCols: Col<Row>[] = [{ key: "name", label: "Period", href: (r) => `/accounting/periods/${String(r.id)}/close` }, { key: "start_date", label: "Start Date", type: "date" }, { key: "end_date", label: "End Date", type: "date" }, { key: "closed_by", label: "Closed by" }, { key: "closed_at", label: "Closed at", type: "datetime" }, { key: "status", label: "Status", type: "status" }];
export const AccountingPeriodsPage = () => <PageBody><PageHeader title="Accounting Periods" /><DataTable name="Accounting periods" fetcher={accountingApi.periods.list} columns={perCols} rowActions={[{ label: "Period Closing", icon: Lock, href: (r) => `/accounting/periods/${String(r.id)}/close`, visible: (r) => r.status === "OPEN" }, { label: "Reopen", icon: RotateCcw, perms: ["period.reopen"], visible: (r) => r.status === "CLOSED", dialog: (r) => ({ title: "Reopen period", destructive: true, description: "Reopening needs Owner approval and is audited.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => accountingApi.periodAction(String(r.id), "reopen", v), successMessage: "Period reopened" }) }]} /></PageBody>;

export function PeriodClosingPage() {
  const t = useT();
  const execute = useAction();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["period", id], queryFn: ({ signal }) => accountingApi.periods.get(id, signal) });
  return <PageBody><QueryView query={q}>{(p) => { const open = p.status === "OPEN"; const list = p.checklist as { key: string; label: string; done: boolean }[]; return (<><PageHeader title={`${t("Period Closing")} · ${String(p.name)}`} badge={<StatusBadge status={String(p.status)} />} actions={open && <ActionButton label="Close Period" icon={Lock} perms={["period.close"]} disabled={list.some((c) => !c.done)} title="Complete the checklist first" action={{ title: "Close period", destructive: true, description: "Postings to this period are blocked after closing.", run: () => accountingApi.periodAction(id, "close"), successMessage: "Period closed", simulated: true }} />} /><Section title="Period closing checklist" description={`${formatDate(String(p.start_date))} – ${formatDate(String(p.end_date))}`} flush><ul className="divide-y">{list.map((c) => <li key={c.key} className="flex items-center gap-3 p-3 text-sm"><Checkbox id={c.key} checked={c.done} disabled={!open || !can("period.close")} onCheckedChange={(v) => void execute(() => accountingApi.periodAction(id, "checklist", { key: c.key, done: v === true }))} /><label htmlFor={c.key}>{t(c.label)}</label></li>)}</ul></Section>{p.closed_at ? <p className="text-sm text-muted-foreground">{t("Closed by")} {String(p.closed_by)} · {formatDateTime(String(p.closed_at))}</p> : null}</>); }}</QueryView></PageBody>;
}
