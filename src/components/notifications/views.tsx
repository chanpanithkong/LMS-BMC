"use client";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Eye } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DetailGrid, Section, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useAction } from "@/hooks/use-action";
import { notificationsApi } from "@/lib/api/notifications";
import { formatDateTime } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { NotificationRecord } from "@/types";

const CATEGORIES = ["Loan Applications", "Pending Approvals", "Disbursements", "Repayments", "Overdue Payments", "Collection Reminders", "System Notifications"].map((value) => ({ value, label: value }));
const cols: Col<NotificationRecord>[] = [{ key: "title", label: "Notification", render: (r) => <Link href={`/notifications/${r.id}`} className={`text-primary hover:underline ${r.read ? "" : "font-semibold"}`}>{r.title}</Link> }, { key: "message", label: "Message" }, { key: "category", label: "Category" }, { key: "priority", label: "Priority", type: "status" }, { key: "created_at", label: "Date and Time", type: "datetime" }, { key: "read", label: "Read", type: "boolean" }];

export function NotificationCenterPage() {
  const t = useT();
  const execute = useAction();
  return <PageBody><PageHeader title="Notification Center" actions={<><Button asChild variant="outline" size="sm"><Link href="/notifications/settings">{t("Notification Settings")}</Link></Button><Button size="sm" onClick={() => void execute(() => notificationsApi.markAllRead(), { success: "All notifications marked as read" })}><CheckCheck className="size-4" />{t("Mark All Read")}</Button></>} /><DataTable name="Notifications" fetcher={notificationsApi.list} columns={cols} exportable={false} dateRange searchPlaceholder="Search notifications" filters={[{ key: "category", label: "Category", options: CATEGORIES }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/notifications/${r.id}` }]} bulkActions={[{ label: "Mark as Read", run: async (rows) => { await Promise.all(rows.map((r) => notificationsApi.markRead(r.id))); await execute(async () => undefined); } }]} /></PageBody>;
}

export function NotificationDetailPage() {
  const t = useT();
  const execute = useAction();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["notification", id], queryFn: ({ signal }) => notificationsApi.get(id, signal) });
  const unread = q.data && !q.data.read;
  useEffect(() => { if (unread) void execute(() => notificationsApi.markRead(id)); }, [unread, id, execute]);
  return <PageBody><QueryView query={q}>{(n) => (<><PageHeader title={t(n.title)} badge={<StatusBadge status={n.priority} />} actions={<Button asChild size="sm"><Link href={n.link}>{t("Open Related Record")}</Link></Button>} /><Section title="Notification Details"><p className="mb-4 text-sm">{t(n.message)}</p><DetailGrid columns={4} items={[["Category", t(n.category)], ["Channel", n.channel], ["Delivery Status", <StatusBadge key="d" status={n.delivery_status} />], ["Attempts", n.attempts], ["Date and Time", formatDateTime(n.created_at)]]} /></Section></>)}</QueryView></PageBody>;
}

export function NotificationSettingsPage() {
  const t = useT();
  const execute = useAction();
  const q = useQuery({ queryKey: ["notification-settings"], queryFn: ({ signal }) => notificationsApi.settings.list({ limit: 50 }, signal) });
  return <PageBody><PageHeader title="Notification Settings" description="SMS stays disabled until a provider is confirmed (DP-04)." /><QueryView query={q}>{(d) => <Section flush><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3 font-medium">{t("Category")}</th><th className="p-3 font-medium">{t("In-app")}</th><th className="p-3 font-medium">{t("Email")}</th><th className="p-3 font-medium">SMS</th></tr></thead><tbody>{d.items.map((s) => <tr key={String(s.id)} className="border-b last:border-0"><td className="p-3">{t(String(s.category))}</td>{["in_app", "email", "sms"].map((k) => <td key={k} className="p-3"><Switch aria-label={`${t(String(s.category))} ${k}`} checked={Boolean(s[k])} disabled={k === "sms"} onCheckedChange={(v) => void execute(() => notificationsApi.settings.update(String(s.id), { [k]: v }), { success: "Settings saved" })} /></td>)}</tr>)}</tbody></table></div></Section>}</QueryView></PageBody>;
}
