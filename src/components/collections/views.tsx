"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, HandCoins, PhoneCall, ThumbsDown, ThumbsUp, UserCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton, type ActionDef } from "@/components/dialogs/action-dialog";
import type { FieldDef } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatCard } from "@/components/shared/display";
import { DpdBadge } from "@/components/shared/loan-summary-card";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { EmptyState } from "@/components/shared/states";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useBranchOptions } from "@/components/tables/filter-panel";
import { statusOptions } from "@/config/options";
import { collectionsApi } from "@/lib/api/collections";
import { loansApi } from "@/lib/api/loans";
import { usersApi } from "@/lib/api/users";
import { useCan } from "@/lib/auth/store";
import { formatDate, formatDateTime } from "@/lib/formatters/date";
import type { CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { LoanSummary, Row } from "@/types";

const BUCKETS = ["1–30", "31–60", "61–90", "> 90"].map((b) => ({ value: b, label: b }));
const cols: Col<LoanSummary>[] = [{ key: "account_no", label: "Loan Account", href: (r) => `/collections/overdue/${r.id}` }, { key: "borrower_name", label: "Borrower" }, { key: "days_past_due", label: "Days Past Due (DPD)", type: "dpd" }, { key: "amount_overdue", label: "Overdue Amount", type: "money", currency: (r) => r.currency }, { key: "outstanding_principal", label: "Principal Outstanding", type: "money", currency: (r) => r.currency }, { key: "bucket", label: "Delinquency Bucket" }, { key: "par_classification", label: "PAR Classification" }, { key: "collection_officer_name", label: "Collection Officer" }, { key: "last_contact", label: "Last Contact", type: "date" }, { key: "next_follow_up", label: "Next Follow-up", type: "date" }];

const activity = (loanId: string): ActionDef => ({ title: "Log collection contact", description: "Contacts outside the configured hours are rejected. Do not disclose debt details to third parties.", fields: [{ name: "channel", label: "Channel", type: "select", required: true, options: ["Phone", "SMS", "Field visit", "Letter"].map((v) => ({ value: v, label: v })) }, { name: "person_reached", label: "Person Reached", type: "select", required: true, options: ["Borrower", "Guarantor", "Reference (consent recorded)", "No one"].map((v) => ({ value: v, label: v })) }, { name: "outcome", label: "Outcome", type: "select", required: true, options: ["Promised to pay", "Partial payment arranged", "Refused", "No answer", "Disputed"].map((v) => ({ value: v, label: v })) }, { name: "notes", label: "Notes", type: "textarea", required: true }, { name: "follow_up_date", label: "Next Follow-up", type: "date", minToday: true }], run: (v) => collectionsApi.activities.create({ ...v, loan_id: loanId }), successMessage: "Contact logged" });
const promise = (loanId: string, currency: CurrencyCode): ActionDef => ({ title: "Record promise to pay", fields: [{ name: "promised_amount", label: "Promised Amount", type: "money", required: true, currency }, { name: "promise_date", label: "Promise Date", type: "date", required: true, minToday: true }], run: (v) => collectionsApi.promises.create({ ...v, loan_id: loanId }), successMessage: "Promise recorded" });

function useOfficers() {
  const can = useCan();
  const q = useQuery({ queryKey: ["options", "users"], queryFn: ({ signal }) => usersApi.list({ limit: 100 }, signal), enabled: can("user.view") });
  return useMemo<FieldDef[]>(() => [{ name: "officer_id", label: "Collection Officer", required: !can("user.view") ? false : true, type: can("user.view") ? "select" : "text", defaultValue: can("user.view") ? "" : "colloff", options: (q.data?.items ?? []).filter((u) => (u.roles as string[]).includes("COLLOFF")).map((u) => ({ value: String(u.id), label: String(u.name) })), help: can("user.view") ? undefined : "Demo user ID of the collection officer." }], [q.data, can]);
}

export function CollectionDashboardPage() {
  const t = useT();
  const query = useQuery({ queryKey: ["collection-dashboard"], queryFn: ({ signal }) => collectionsApi.dashboard(signal) });
  return <PageBody><PageHeader title="Collection Dashboard" description="Overdue portfolio, promises and follow-ups. Conduct rules must be verified against current requirements (V-08)." /><QueryView query={query}>{(d) => (<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard title="Overdue Loans" value={d.overdue_count} icon={AlertTriangle} tone="danger" href="/collections/overdue" /><StatCard title="Overdue Amount (USD)" value={<MoneyDisplay value={d.overdue_usd} currency="USD" />} icon={Wallet} tone="danger" /><StatCard title="Overdue Amount (KHR)" value={<MoneyDisplay value={d.overdue_khr} currency="KHR" />} icon={Wallet} tone="danger" /><StatCard title="Open Promises" value={d.open_promises} sub={`${d.broken_promises} ${t("broken")}`} icon={HandCoins} tone="warning" href="/collections/promises" /></div>
    <div className="grid gap-3 sm:grid-cols-4">{d.buckets.map((b, i) => <div key={b.name} className={`rounded-xl border p-3 ${["border-warning/40 bg-warning-soft", "border-warning/60 bg-warning-soft", "border-danger/40 bg-danger-soft", "border-danger bg-danger-soft"][i]}`}><p className="text-xs text-muted-foreground">{t("Days Past Due")} {b.name}</p><p className="text-lg font-semibold tabular">{b.count}</p><MoneyDisplay value={b.usd} currency="USD" className="text-xs" /></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Highest priority cases" flush>{d.top_cases.length ? <ul className="divide-y">{d.top_cases.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span className="min-w-0"><Link className="font-medium text-primary hover:underline" href={`/collections/overdue/${l.id}`}>{l.account_no}</Link><span className="block truncate text-xs text-muted-foreground">{l.borrower_name}</span></span><span className="flex items-center gap-3"><MoneyDisplay value={l.amount_overdue} currency={l.currency} /><DpdBadge dpd={l.days_past_due} /></span></li>)}</ul> : <EmptyState title="No overdue loans" />}</Section>
      <Section title="Follow-ups and promises due" flush>{d.follow_ups.length || d.promises_due.length ? <ul className="divide-y">{d.follow_ups.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span><CalendarClock className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />{l.account_no} · {l.borrower_name}</span><span className="text-muted-foreground">{formatDate(l.next_follow_up)}</span></li>)}{d.promises_due.map((p) => <li key={String(p.id)} className="flex items-center justify-between gap-2 p-3 text-sm"><span><HandCoins className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />{String(p.loan_account_no)}</span><MoneyDisplay value={String(p.promised_amount)} currency={p.currency as CurrencyCode} /></li>)}</ul> : <EmptyState title="Nothing due today" />}</Section>
    </div>
  </>)}</QueryView></PageBody>;
}

export function OverdueLoansPage({ assignment }: { assignment?: boolean }) {
  const branches = useBranchOptions();
  const officers = useOfficers();
  return <PageBody><PageHeader title={assignment ? "Collection Assignment" : "Overdue Loan List"} description={assignment ? "Assign delinquent loans to collection officers." : "Loans past due, oldest unpaid installment first."} /><DataTable name={assignment ? "Collection assignment" : "Overdue loans"} fetcher={collectionsApi.overdue.list} columns={cols} defaultSort="-days_past_due" searchPlaceholder="Search account or borrower" filters={[{ key: "bucket", label: "Delinquency Bucket", options: BUCKETS }, { key: "branch_id", label: "Branch", options: branches }]} rowActions={[{ label: "Delinquency Details", href: (r) => `/collections/overdue/${r.id}` }, { label: "Assign Officer", icon: UserCheck, perms: ["collection.assign"], dialog: (r) => ({ title: "Assign collection officer", summary: <p>{r.account_no} · {r.borrower_name}</p>, fields: officers, run: (v) => collectionsApi.assign(r.id, String(v.officer_id)), successMessage: "Officer assigned" }) }, { label: "Log Contact", icon: PhoneCall, perms: ["collection.manage"], dialog: (r) => activity(r.id) }, { label: "Record Promise", icon: HandCoins, perms: ["collection.manage"], dialog: (r) => promise(r.id, r.currency) }]} /></PageBody>;
}
export function CollectionAssignmentPage() { return <OverdueLoansPage assignment />; }

export function DelinquencyDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const officers = useOfficers();
  const query = useQuery({ queryKey: ["loan", id], queryFn: ({ signal }) => loansApi.detail(id, signal) });
  const related = useQuery({ queryKey: ["loan-related", id], queryFn: ({ signal }) => loansApi.related(id, signal) });
  return <PageBody><QueryView query={query}>{(l) => (<><PageHeader title="Delinquency Details" description={`${l.account_no} · ${l.borrower_name}`} badge={<DpdBadge dpd={l.days_past_due} />} actions={<><ActionButton label="Log Contact" icon={PhoneCall} perms={["collection.manage"]} action={activity(id)} /><ActionButton label="Record Promise" icon={HandCoins} variant="outline" perms={["collection.manage"]} action={promise(id, l.currency)} /><ActionButton label="Assign Officer" icon={UserCheck} variant="outline" perms={["collection.assign"]} action={{ title: "Assign collection officer", fields: officers, run: (v) => collectionsApi.assign(id, String(v.officer_id)), successMessage: "Officer assigned" }} /><Button asChild variant="outline" size="sm"><Link href={`/loans/${id}`}>{t("Loan Account")}</Link></Button></>} />
    <Section title="Delinquency"><DetailGrid columns={4} items={[["Days Past Due (DPD)", <DpdBadge key="d" dpd={l.days_past_due} />], ["Overdue Amount", <MoneyDisplay key="o" value={l.amount_overdue} currency={l.currency} />], ["Principal Outstanding", <MoneyDisplay key="p" value={l.outstanding_principal} currency={l.currency} />], ["Delinquency Bucket", l.bucket], ["PAR Classification", l.par_classification], ["Collection Officer", l.collection_officer_name], ["Last Contact", formatDate(l.last_contact)], ["Next Follow-up", formatDate(l.next_follow_up)], ["Phone Number", l.borrower.phone], ["Address", l.borrower.address_text]]} /></Section>
    <Section title="Contact History" flush>{(related.data?.activities ?? []).length ? <ul className="divide-y">{related.data!.activities.map((a) => <li key={String(a.id)} className="p-3 text-sm"><p className="font-medium">{t(String(a.channel))} · {t(String(a.outcome))}</p><p className="text-xs text-muted-foreground">{String(a.officer_name)} · {formatDateTime(String(a.contact_time))}</p><p>{String(a.notes)}</p></li>)}</ul> : <EmptyState title="No contact recorded" />}</Section>
  </>)}</QueryView></PageBody>;
}

const aCols: Col<Row>[] = [{ key: "contact_time", label: "Contact Time", type: "datetime" }, { key: "loan_account_no", label: "Loan Account", href: (r) => `/collections/overdue/${String(r.loan_id)}` }, { key: "borrower_name", label: "Borrower" }, { key: "officer_name", label: "Collection Officer" }, { key: "channel", label: "Channel" }, { key: "person_reached", label: "Person Reached" }, { key: "outcome", label: "Outcome" }, { key: "follow_up_date", label: "Next Follow-up", type: "date" }];
export function CollectionActivitiesPage({ title = "Collection Activities" }: { title?: string }) { return <PageBody><PageHeader title={title} description="Contact details are restricted to staff who need them." /><DataTable name={title} fetcher={collectionsApi.activities.list} columns={aCols} dateRange defaultSort="-contact_time" searchPlaceholder="Search activities" filters={[{ key: "channel", label: "Channel", options: ["Phone", "SMS", "Field visit", "Letter"].map((v) => ({ value: v, label: v })) }]} /></PageBody>; }
export function ContactHistoryPage() { return <CollectionActivitiesPage title="Contact History" />; }

const pCols: Col<Row>[] = [{ key: "loan_account_no", label: "Loan Account", href: (r) => `/collections/overdue/${String(r.loan_id)}` }, { key: "borrower_name", label: "Borrower" }, { key: "promised_amount", label: "Promised Amount", type: "money", currency: (r) => r.currency as CurrencyCode }, { key: "promise_date", label: "Promise Date", type: "date" }, { key: "officer_name", label: "Collection Officer" }, { key: "status", label: "Status", type: "status" }];
export function PromisesPage() { return <PageBody><PageHeader title="Promises to Pay" /><DataTable name="Promises to Pay" fetcher={collectionsApi.promises.list} columns={pCols} dateRange defaultSort="promise_date" searchPlaceholder="Search promises" filters={[{ key: "status", label: "Status", options: statusOptions(["OPEN", "KEPT", "BROKEN"]) }]} rowActions={[{ label: "Mark as Kept", icon: ThumbsUp, perms: ["collection.manage"], visible: (r) => r.status === "OPEN", dialog: (r) => ({ title: "Mark promise as kept", run: () => collectionsApi.markPromise(String(r.id), "KEPT"), successMessage: "Promise updated" }) }, { label: "Mark as Broken", icon: ThumbsDown, perms: ["collection.manage"], visible: (r) => r.status === "OPEN", dialog: (r) => ({ title: "Mark promise as broken", destructive: true, run: () => collectionsApi.markPromise(String(r.id), "BROKEN"), successMessage: "Promise updated" }) }]} /></PageBody>; }
