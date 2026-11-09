"use client";
import { useQuery } from "@tanstack/react-query";
import { Activity, Eye, KeyRound, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { Section, StatCard, StatusBadge, statusLabel } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { AuditTimeline } from "@/components/shared/timelines";
import { DataTable, type Col } from "@/components/tables/data-table";
import { statusOptions } from "@/config/options";
import { auditApi } from "@/lib/api/platform";
import { useT } from "@/lib/i18n/store";
import type { AuditEntry, Row } from "@/types";

const logCols: Col<AuditEntry>[] = [{ key: "user_name", label: "User" }, { key: "action", label: "Action", render: (r) => statusLabel(r.action) }, { key: "module", label: "Module" }, { key: "record_reference", label: "Record Reference" }, { key: "at", label: "Date and Time", type: "datetime" }, { key: "ip_address", label: "IP Address" }, { key: "previous_state", label: "Previous State" }, { key: "new_state", label: "New State" }, { key: "reason", label: "Reason" }];
const Log = ({ title, description, params }: { title: string; description: string; params?: Record<string, string> }) => <PageBody><PageHeader title={title} description={description} /><DataTable name={title} fetcher={auditApi.logs.list} params={params} columns={logCols} dateRange defaultSort="-at" searchPlaceholder="Search audit log" filters={[{ key: "module", label: "Module", options: ["Authentication", "Borrowers", "Applications", "Credit", "Agreements", "Collateral", "Disbursements", "Repayments", "Loans", "Collections", "Restructuring", "Settlement", "Fees", "Accounting", "Reports", "Documents", "Users", "Administration", "Products"].map((value) => ({ value, label: value })) }]} /></PageBody>;
export const AuditLogPage = () => <Log title="Audit Log" description="Read-only. Entries cannot be changed or deleted." />;
export const UserActivityPage = () => <Log title="User Activity" description="Search by user name to see their actions." />;
export const FinancialActivityPage = () => <Log title="Financial Activity" description="Audit entries for financial transactions and decisions." params={{ financial: "true" }} />;

const cCols: Col<Row>[] = [{ key: "at", label: "Date and Time", type: "datetime" }, { key: "type", label: "Exception" }, { key: "reference", label: "Record Reference" }, { key: "user", label: "User" }, { key: "detail", label: "Detail" }, { key: "severity", label: "Severity", type: "status" }, { key: "status", label: "Status", type: "status" }];
export const ControlExceptionsPage = () => <PageBody><PageHeader title="Control Exceptions" description="Overrides, reversals, waivers, backdated payments and after-hours actions." /><DataTable name="Control exceptions" fetcher={auditApi.exceptions.list} columns={cCols} dateRange defaultSort="-at" searchPlaceholder="Search exceptions" filters={[{ key: "status", label: "Status", options: statusOptions(["OPEN", "REVIEWED"]) }, { key: "severity", label: "Severity", options: statusOptions(["LOW", "MEDIUM", "HIGH"]) }]} rowActions={[{ label: "Mark as Reviewed", icon: Eye, perms: ["audit.view"], visible: (r) => r.status === "OPEN", dialog: (r) => ({ title: "Record review", fields: [{ name: "reason", label: "Review note", type: "textarea", required: true }], run: (v) => auditApi.reviewException(String(r.id), String(v.reason)), successMessage: "Review recorded" }) }]} /></PageBody>;

const lCols: Col<Row>[] = [{ key: "at", label: "Date and Time", type: "datetime" }, { key: "user_name", label: "User" }, { key: "result", label: "Result", type: "status" }, { key: "ip_address", label: "IP Address" }, { key: "device", label: "Device" }];
export const LoginHistoryPage = () => <PageBody><PageHeader title="Login History" /><DataTable name="Login history" fetcher={auditApi.logins.list} columns={lCols} dateRange defaultSort="-at" searchPlaceholder="Search logins" filters={[{ key: "result", label: "Result", options: statusOptions(["SUCCESS", "FAILED"]) }]} /></PageBody>;

export function AuditDashboardPage() {
  const t = useT();
  const q = useQuery({ queryKey: ["audit-dashboard"], queryFn: ({ signal }) => auditApi.dashboard(signal) });
  return <PageBody><PageHeader title="Audit Dashboard" description="Read-only control overview." /><div className="flex flex-wrap gap-3 text-sm">{[["/audit/logs", "Audit Log"], ["/audit/users", "User Activity"], ["/audit/financial", "Financial Activity"], ["/audit/exceptions", "Control Exceptions"], ["/audit/logins", "Login History"]].map(([h, l]) => <Link key={h} className="text-primary hover:underline" href={h}>{t(l)}</Link>)}</div><QueryView query={q}>{(d) => (<><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard title="Events Today" value={String(d.today_events)} icon={Activity} /><StatCard title="Financial Events" value={String(d.financial_events)} icon={Wallet} /><StatCard title="Open Control Exceptions" value={String(d.open_exceptions)} icon={ShieldAlert} tone="warning" href="/audit/exceptions" /><StatCard title="Failed Logins" value={String(d.failed_logins)} icon={KeyRound} tone="danger" href="/audit/logins" /></div><p className="text-xs text-muted-foreground">{t(String(d.integrity))}</p><div className="grid gap-4 lg:grid-cols-2"><Section title="Recent events"><AuditTimeline items={d.recent as AuditEntry[]} /></Section><Section title="Events by module" flush><ul className="divide-y">{(d.by_module as { name: string; count: number }[]).map((m) => <li key={m.name} className="flex justify-between p-3 text-sm"><span>{t(m.name)}</span><StatusBadge status={String(m.count)} tone="neutral" /></li>)}</ul></Section></div></>)}</QueryView></PageBody>;
}
