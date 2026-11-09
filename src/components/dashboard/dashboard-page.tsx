"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, ClipboardList, Coins, FileClock, Landmark, Percent, Receipt, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/forms/fields";
import { MoneyDisplay, Section, StatCard, StatusBadge, statusLabel } from "@/components/shared/display";
import { DpdBadge } from "@/components/shared/loan-summary-card";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { CURRENCY_OPTIONS, FilterPanel, FilterSelect, useBranchOptions, useProductOptions } from "@/components/tables/filter-panel";
import { reportsApi } from "@/lib/api/reports";
import { usersApi } from "@/lib/api/users";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { Application, Disbursement, LoanSummary, Repayment, Row } from "@/types";
import { ParTrend, RankedBars, TrendArea, TrendBars, type Point } from "./charts";

interface DashboardData {
  as_of: string; currency: CurrencyCode;
  kpis: { active_loans: number; total_borrowers: number; gross_loan_portfolio: string; outstanding_principal: string; total_disbursed: string; total_collections: string; overdue_portfolio: string; overdue_loans: number; par30: string; par30_at_risk: string; pending_applications: number; awaiting_approval: number };
  series: Point[]; by_product: Slice[]; by_branch: Slice[]; by_status: Slice[]; by_bucket: Slice[];
  tables: { applications: Application[]; disbursements: Disbursement[]; repayments: Repayment[]; upcoming: LoanSummary[]; overdue: LoanSummary[]; approvals: Application[]; activities: Row[] };
  definitions: Record<string, string>;
}
interface Slice { name: string; value: string; count: number }

function MiniTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty?: string }) {
  const t = useT();
  if (!rows.length) return <EmptyState title={empty ?? "No records found"} />;
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{t(h)}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((c, k) => <TableCell key={k}>{c}</TableCell>)}</TableRow>)}</TableBody></Table></div>;
}
const L = ({ href, children }: { href: string; children: ReactNode }) => <Link className="font-medium text-primary underline-offset-2 hover:underline" href={href}>{children}</Link>;

export function DashboardPage() {
  const t = useT();
  const can = useCan();
  const branches = useBranchOptions();
  const products = useProductOptions();
  const [filters, setFilters] = useState({ branch_id: "", product_id: "", officer_id: "", currency: "USD", date_from: "", date_to: "" });
  const officers = useQuery({ queryKey: ["options", "officers"], queryFn: ({ signal }) => usersApi.list({ roles: "", limit: 100 }, signal), enabled: can("user.view"), staleTime: 300_000 });
  const query = useQuery({ queryKey: ["dashboard", filters], queryFn: ({ signal }) => reportsApi.dashboard(filters, signal) as unknown as Promise<DashboardData> });
  const set = (key: keyof typeof filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const officerOptions = (officers.data?.items ?? []).filter((u) => (u.roles as string[]).includes("LOANOFF")).map((u) => ({ value: String(u.id), label: String(u.name) }));
  return (
    <PageBody>
      <PageHeader title="Portfolio Overview" description="Loan book, cash movements and portfolio quality. Disbursements are cash outflows and outstanding principal is an asset balance; neither is income." />
      <FilterPanel>
        <DateRangePicker from={filters.date_from} to={filters.date_to} onChange={(date_from, date_to) => setFilters((f) => ({ ...f, date_from, date_to }))} />
        <FilterSelect label="Branch" value={filters.branch_id} onChange={set("branch_id")} options={branches} />
        <FilterSelect label="Loan Product" value={filters.product_id} onChange={set("product_id")} options={products} />
        {can("user.view") && <FilterSelect label="Loan Officer" value={filters.officer_id} onChange={set("officer_id")} options={officerOptions} />}
        <div className="flex items-center gap-1" role="group" aria-label={t("Currency")}>
          {CURRENCY_OPTIONS.map((c) => <button key={c.value} type="button" onClick={() => set("currency")(c.value)} aria-pressed={filters.currency === c.value} className={`rounded-md border px-3 py-1.5 text-sm ${filters.currency === c.value ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}>{c.label}</button>)}
        </div>
      </FilterPanel>
      <QueryView query={query}>{(d) => {
        const m = (v: string) => <MoneyDisplay value={v} currency={d.currency} />;
        const c = d.currency;
        return (<>
          <p className="text-xs text-muted-foreground">{t("As of")} {formatDate(d.as_of)} · {t("Amounts shown in")} {c}. {t("Currencies are never combined.")}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Total Active Loans" value={d.kpis.active_loans} icon={Landmark} href="/loans" />
            <StatCard title="Total Borrowers" value={d.kpis.total_borrowers} icon={Users} href="/borrowers" />
            <StatCard title="Gross Loan Portfolio" value={m(d.kpis.gross_loan_portfolio)} icon={Wallet} definition={d.definitions.gross_loan_portfolio} href="/reports/RPT-01" />
            <StatCard title="Outstanding Principal" value={m(d.kpis.outstanding_principal)} icon={Coins} definition={d.definitions.gross_loan_portfolio} href="/reports/RPT-02" />
            <StatCard title="Total Disbursed" value={m(d.kpis.total_disbursed)} icon={Banknote} definition={d.definitions.total_disbursed} sub={t("Cash outflow, not revenue")} href="/reports/RPT-03" />
            <StatCard title="Total Collections" value={m(d.kpis.total_collections)} icon={Receipt} tone="success" definition={d.definitions.total_collections} href="/reports/RPT-12" />
            <StatCard title="Overdue Portfolio" value={m(d.kpis.overdue_portfolio)} icon={AlertTriangle} tone="danger" definition={d.definitions.overdue_portfolio} sub={`${d.kpis.overdue_loans} ${t("loans")}`} href="/collections/overdue" />
            <StatCard title="PAR30" value={`${d.kpis.par30} %`} icon={Percent} tone="danger" definition={d.definitions.par30} href="/reports/RPT-17" />
            <StatCard title="Pending Applications" value={d.kpis.pending_applications} icon={FileClock} tone="warning" href="/applications" />
            <StatCard title="Loans Awaiting Approval" value={d.kpis.awaiting_approval} icon={ClipboardList} tone="warning" href="/approvals" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendArea title="Loan Portfolio Growth" description="Month-end outstanding principal" data={d.series} dataKey="portfolio" seriesName="Outstanding Principal" currency={c} />
            <ParTrend data={d.series} />
            <TrendBars title="Monthly Disbursement Trends" description="Confirmed disbursements (cash outflow)" data={d.series} dataKey="disbursed" seriesName="Disbursed" currency={c} />
            <TrendBars title="Monthly Repayment Trends" description="Completed repayments, excluding reversals" data={d.series} dataKey="collected" seriesName="Collections" currency={c} />
            <RankedBars title="Loan Portfolio by Product" data={d.by_product} currency={c} />
            <RankedBars title="Loan Portfolio by Branch" data={d.by_branch} currency={c} />
            <RankedBars title="Loan Status Distribution" data={d.by_status.map((s) => ({ ...s, name: statusLabel(s.name) }))} count />
            <RankedBars title="Delinquency Bucket Distribution" description="Outstanding principal by days past due" data={d.by_bucket} currency={c} />
          </div>
          <Section flush>
            <Tabs defaultValue="applications" className="gap-0">
              <div className="overflow-x-auto overflow-y-hidden border-b p-2"><TabsList>
                {["Recent Loan Applications", "Recent Disbursements", "Recent Repayments", "Upcoming Repayments", "Overdue Loans", "Pending Approvals", "Recent Activities"].map((x) => <TabsTrigger key={x} value={x === "Recent Loan Applications" ? "applications" : x}>{t(x)}</TabsTrigger>)}
              </TabsList></div>
              <TabsContent value="applications"><MiniTable headers={["Reference", "Borrower", "Product", "Amount", "Status"]} rows={d.tables.applications.map((a) => [<L key="r" href={`/applications/${a.id}`}>{a.reference ?? t("Draft")}</L>, a.borrower_name, a.product_name, <MoneyDisplay key="m" value={a.requested_amount} currency={a.currency} />, <StatusBadge key="s" status={a.status} />])} /></TabsContent>
              <TabsContent value="Recent Disbursements"><MiniTable headers={["Reference", "Borrower", "Date", "Amount", "Method"]} rows={d.tables.disbursements.map((x) => [<L key="r" href={`/disbursements/${x.id}`}>{x.disbursement_no}</L>, x.borrower_name, formatDate(x.disbursement_date), <MoneyDisplay key="m" value={x.amount} currency={x.currency} />, <StatusBadge key="s" status={x.method} />])} /></TabsContent>
              <TabsContent value="Recent Repayments"><MiniTable headers={["Receipt", "Borrower", "Date", "Amount", "Status"]} rows={d.tables.repayments.map((x) => [<L key="r" href={`/repayments/${x.id}`}>{x.receipt_no}</L>, x.borrower_name, formatDate(x.value_date), <MoneyDisplay key="m" value={x.amount} currency={x.currency} />, <StatusBadge key="s" status={x.status} />])} /></TabsContent>
              <TabsContent value="Upcoming Repayments"><MiniTable headers={["Loan Account", "Borrower", "Next Payment Date", "Amount"]} rows={d.tables.upcoming.map((x) => [<L key="r" href={`/loans/${x.id}`}>{x.account_no}</L>, x.borrower_name, formatDate(x.next_payment_date), <MoneyDisplay key="m" value={x.next_payment_amount} currency={x.currency} />])} /></TabsContent>
              <TabsContent value="Overdue Loans"><MiniTable headers={["Loan Account", "Borrower", "DPD", "Overdue Amount"]} rows={d.tables.overdue.map((x) => [<L key="r" href={`/collections/overdue/${x.id}`}>{x.account_no}</L>, x.borrower_name, <DpdBadge key="d" dpd={x.days_past_due} />, <MoneyDisplay key="m" value={x.amount_overdue} currency={x.currency} />])} /></TabsContent>
              <TabsContent value="Pending Approvals"><MiniTable headers={["Reference", "Borrower", "Amount", "Level"]} rows={d.tables.approvals.map((a) => [<L key="r" href={`/approvals/${a.id}`}>{a.reference}</L>, a.borrower_name, <MoneyDisplay key="m" value={a.requested_amount} currency={a.currency} />, a.approval_level])} /></TabsContent>
              <TabsContent value="Recent Activities"><MiniTable headers={["User", "Action", "Reference", "Date and Time"]} rows={d.tables.activities.map((a) => [String(a.user_name), t(statusLabel(String(a.action))), String(a.record_reference), formatDateTime(String(a.at))])} /></TabsContent>
            </Tabs>
          </Section>
        </>);
      }}</QueryView>
    </PageBody>
  );
}
