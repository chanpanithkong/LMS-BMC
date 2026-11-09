"use client";
import { useQuery } from "@tanstack/react-query";
import { Eye, Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ActionButton } from "@/components/dialogs/action-dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { DetailGrid, MoneyDisplay, Section, StatusBadge } from "@/components/shared/display";
import { PageBody, PageHeader } from "@/components/shared/page";
import { QueryView } from "@/components/shared/query-view";
import { DataTable, type Col } from "@/components/tables/data-table";
import { useBranchOptions } from "@/components/tables/filter-panel";
import { statusOptions } from "@/config/options";
import { useAction } from "@/hooks/use-action";
import { orgApi } from "@/lib/api/platform";
import { usersApi } from "@/lib/api/users";
import { useCan } from "@/lib/auth/store";
import { formatDateTime } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import { PERMISSION_GROUPS, ROLE_NAMES, ROLES, ROLE_PERMISSIONS, type RoleCode } from "@/lib/permissions";
import type { Row } from "@/types";

function Nav() {
  const t = useT();
  return <div className="flex flex-wrap gap-2">{[["/admin/settings", "Company Settings"], ["/admin/settings/currencies", "Currency Settings"], ["/admin/settings/exchange-rates", "Exchange Rates"], ["/admin/settings/calendars", "Business Calendars"], ["/admin/settings/numbering", "Document Numbering"], ["/admin/settings/system", "System Configuration"]].map(([h, l]) => <Button key={h} asChild variant="outline" size="sm"><Link href={h}>{t(l)}</Link></Button>)}</div>;
}

const userCols: Col<Row>[] = [{ key: "name", label: "Name", href: (r) => `/admin/users/${String(r.id)}` }, { key: "username", label: "Username" }, { key: "email", label: "Email" }, { key: "role_label", label: "Roles" }, { key: "branch_label", label: "Branch Access" }, { key: "last_login", label: "Last Login", type: "datetime" }, { key: "status", label: "Status", type: "status" }];
export function UserListPage() {
  const t = useT();
  const can = useCan();
  return <PageBody><PageHeader title="User Management" description="Administrators cannot hold financial permissions by default. Financial grants need Owner approval." actions={can("user.manage") && <Button asChild size="sm"><Link href="/admin/users/new"><Plus className="size-4" />{t("Create User")}</Link></Button>} /><DataTable name="Users" fetcher={usersApi.list} columns={userCols} searchPlaceholder="Search users" filters={[{ key: "status", label: "Status", options: statusOptions(["ACTIVE", "INVITED", "INACTIVE"]) }]} rowActions={[{ label: "View", icon: Eye, href: (r) => `/admin/users/${String(r.id)}` }]} /></PageBody>;
}

export function CreateUserPage() {
  const t = useT();
  const router = useRouter();
  const execute = useAction();
  const branches = useBranchOptions();
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo<FieldDef[]>(() => [{ name: "name", label: "Full Name", required: true }, { name: "name_km", label: "Full Name (Khmer)" }, { name: "username", label: "Username", required: true }, { name: "email", label: "Email", type: "email", required: true }, { name: "branch", label: "Branch Access", type: "select", required: true, options: [{ value: "*", label: "All branches" }, ...branches] }, { name: "approval_limit_usd", label: "Approval Limit (USD)", type: "money", currency: "USD" }, { name: "approval_limit_khr", label: "Approval Limit (KHR)", type: "money", currency: "KHR" }], [branches]);
  const form = useZodForm(fields);
  const submit = form.handleSubmit(async (v: Values) => { if (!roles.length) return setError("Select at least one role."); setError(null); const r = await execute(() => usersApi.create({ ...v, roles, branch_ids: [v.branch] }), { success: "User invited" }); router.push(`/admin/users/${String(r.id)}`); });
  return <PageBody><PageHeader title="Create User" /><form onSubmit={submit} className="space-y-4"><Section title="Profile"><FormFields form={form} fields={fields} columns={2} /></Section><Section title="Roles" description="Financial roles stay pending until approved by the Business Owner."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ROLES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={roles.includes(r)} onCheckedChange={(v) => setRoles((x) => (v === true ? [...x, r] : x.filter((y) => y !== r)))} />{t(ROLE_NAMES[r])}<span className="text-xs text-muted-foreground">{r}</span></label>)}</div>{error && <p className="mt-2 text-sm text-destructive">{t(error)}</p>}</Section><div className="flex justify-end"><Button type="submit">{t("Create User")}</Button></div></form></PageBody>;
}

export function UserDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["user", id], queryFn: ({ signal }) => usersApi.get(id, signal) });
  return <PageBody><QueryView query={q}>{(u) => { const grant = u.pending_grant as Row | null; return (<><PageHeader title={String(u.name)} description={String(u.name_km)} badge={<StatusBadge status={String(u.status)} />} actions={<>
    <ActionButton label="Change Roles" icon={Pencil} variant="outline" perms={["user.manage"]} action={{ title: "Change roles", description: "Financial roles need Owner approval. Self-grants are rejected.", fields: [{ name: "role", label: "Role", type: "select", required: true, options: ROLES.map((r) => ({ value: r, label: ROLE_NAMES[r] })) }], run: (v) => usersApi.grant(id, [String(v.role)]), successMessage: "Role change recorded" }} />
    {u.status === "ACTIVE" ? <ActionButton label="Deactivate" icon={UserX} variant="destructive" perms={["user.manage"]} action={{ title: "Deactivate user", destructive: true, description: "Sessions are revoked immediately.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], run: (v) => usersApi.deactivate(id, String(v.reason)), successMessage: "User deactivated" }} /> : <ActionButton label="Activate" icon={UserCheck} perms={["user.manage"]} action={{ title: "Activate user", run: () => usersApi.activate(id), successMessage: "User activated" }} />}
  </>} />
    {grant && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning"><span>{t("Financial permission grant pending")}: {(grant.roles as string[]).join(", ")} · {String(grant.requested_by_name)}</span><ActionButton label="Approve Grant" icon={ShieldCheck} perms={["user.approve_grant"]} action={{ title: "Approve financial permissions", run: () => usersApi.approveGrant(id), successMessage: "Grant approved" }} /></div>}
    <Section title="User Details"><DetailGrid columns={4} items={[["Username", String(u.username)], ["Email", String(u.email)], ["Roles", String(u.role_label)], ["Branch Access", String(u.branch_label)], ["Approval Limit (USD)", <MoneyDisplay key="u" value={String(u.approval_limit_usd)} currency="USD" />], ["Approval Limit (KHR)", <MoneyDisplay key="k" value={String(u.approval_limit_khr)} currency="KHR" />], ["MFA", u.mfa_enabled ? t("Enabled") : t("Not enabled")], ["Last Login", formatDateTime(String(u.last_login ?? ""))]]} /></Section>
    <Section title="Effective permissions"><div className="flex flex-wrap gap-1.5">{[...new Set(u.permissions as string[])].map((p) => <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-xs">{p}</code>)}</div></Section>
  </>); }}</QueryView></PageBody>;
}

export function RolesPage() {
  const t = useT();
  const q = useQuery({ queryKey: ["roles"], queryFn: ({ signal }) => usersApi.roles(signal) });
  return <PageBody><PageHeader title="Role Management" description="The 12 default roles from the SRS permission matrix." actions={<Button asChild variant="outline" size="sm"><Link href="/admin/permissions">{t("Permission Management")}</Link></Button>} /><QueryView query={q}>{(d) => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{d.items.map((r) => <Section key={r.code} title={t(r.name)} description={r.code} actions={<span className="text-xs text-muted-foreground">{r.users} {t("users")}</span>}><p className="text-sm text-muted-foreground">{r.permissions.length} {t("permissions")}</p></Section>)}</div>}</QueryView></PageBody>;
}

export function PermissionsPage() {
  const t = useT();
  return <PageBody><PageHeader title="Permission Management" description="Proposed default matrix from SRS §5.2. Enforcement is on the server." /><Section flush><div className="max-h-[70vh] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr className="border-b"><th className="p-2 text-left">{t("Permission")}</th>{ROLES.map((r) => <th key={r} className="p-2 font-medium" title={ROLE_NAMES[r]}>{r}</th>)}</tr></thead><tbody>{Object.entries(PERMISSION_GROUPS).flatMap(([group, perms]) => [<tr key={group} className="bg-muted/60"><td colSpan={13} className="p-2 font-semibold">{t(group)}</td></tr>, ...perms.map((p) => <tr key={p} className="border-b"><td className="p-2 font-mono">{p}</td>{ROLES.map((r) => <td key={r} className="p-2 text-center">{(ROLE_PERMISSIONS[r] as string[]).includes(p) ? "●" : "—"}</td>)}</tr>)])}</tbody></table></div></Section></PageBody>;
}

const brFields: FieldDef[] = [{ name: "code", label: "Code", required: true }, { name: "name", label: "Branch Name", required: true }, { name: "name_km", label: "Branch Name (Khmer)" }, { name: "province", label: "Province / City", required: true }, { name: "phone", label: "Phone Number", type: "phone" }, { name: "manager", label: "Branch Manager" }];
const brCols: Col<Row>[] = [{ key: "code", label: "Code" }, { key: "name", label: "Branch Name" }, { key: "name_km", label: "Branch Name (Khmer)" }, { key: "province", label: "Province / City" }, { key: "manager", label: "Branch Manager" }, { key: "cash_points", label: "Cash Points", type: "number" }, { key: "status", label: "Status", type: "status" }];
export const BranchesPage = () => <PageBody><PageHeader title="Branch Management" actions={<ActionButton label="Add Branch" icon={Plus} perms={["org.manage"]} action={{ title: "Add branch", fields: brFields, run: (v) => orgApi.branches.create({ ...v, status: "ACTIVE", cash_points: 1, calendar: "Cambodia Default" }), successMessage: "Branch added" }} />} /><DataTable name="Branches" fetcher={orgApi.branches.list} columns={brCols} searchPlaceholder="Search branches" rowActions={[{ label: "Edit", icon: Pencil, perms: ["org.manage"], dialog: (r) => ({ title: "Edit branch", fields: brFields, defaults: r, run: (v) => orgApi.branches.update(String(r.id), v), successMessage: "Branch updated" }) }]} /></PageBody>;

const coFields: FieldDef[] = [{ name: "legal_name_en", label: "Legal Name (English)", required: true }, { name: "legal_name_km", label: "Legal Name (Khmer)", required: true }, { name: "trading_name", label: "Trading Name" }, { name: "registration_reference", label: "Registration Reference" }, { name: "licence_reference", label: "Licence Reference" }, { name: "address", label: "Address", span: 2 }, { name: "phone", label: "Phone Number", type: "phone" }, { name: "email", label: "Email", type: "email" }];
function CompanyForm({ company }: { company: Row }) {
  const t = useT();
  const execute = useAction();
  const can = useCan();
  const form = useZodForm(coFields, company);
  const submit = form.handleSubmit((v) => void execute(() => orgApi.updateCompany(v), { success: "Company settings saved" }).catch(() => undefined));
  return <form onSubmit={submit}><Section title="Company profile"><FormFields form={form} fields={coFields} columns={2} /><DetailGrid columns={2} items={[]} />{can("org.manage") && <div className="mt-4 flex justify-end"><Button type="submit">{t("Save Changes")}</Button></div>}</Section></form>;
}
export function CompanySettingsPage() {
  const q = useQuery({ queryKey: ["company"], queryFn: ({ signal }) => orgApi.company(signal) });
  return <PageBody><PageHeader title="Company Settings" /><Nav /><QueryView query={q}>{(c) => <CompanyForm company={c} />}</QueryView></PageBody>;
}

const curCols: Col<Row>[] = [{ key: "code", label: "Code" }, { key: "name", label: "Currency" }, { key: "precision", label: "Decimals", type: "number" }, { key: "rounding_increment", label: "Rounding Increment" }, { key: "base", label: "Base Currency", type: "boolean" }, { key: "status", label: "Status", type: "status" }];
export const CurrencySettingsPage = () => <PageBody><PageHeader title="Currency Settings" description="Precision is locked after first use." /><Nav /><DataTable name="Currencies" fetcher={orgApi.currencies.list} columns={curCols} exportable={false} /></PageBody>;

const fxFields: FieldDef[] = [{ name: "rate", label: "Rate (KHR per USD)", type: "percent", required: true }, { name: "source", label: "Source", required: true }, { name: "effective_date", label: "Effective Date", type: "date", required: true }];
const fxCols: Col<Row>[] = [{ key: "from_currency", label: "From" }, { key: "to_currency", label: "To" }, { key: "rate", label: "Rate" }, { key: "source", label: "Source" }, { key: "effective_date", label: "Effective Date", type: "date" }, { key: "entered_by", label: "Entered by" }];
export const ExchangeRatesPage = () => <PageBody><PageHeader title="Exchange Rates" actions={<ActionButton label="Add Rate" icon={Plus} perms={["org.manage"]} action={{ title: "Add exchange rate", fields: fxFields, run: (v) => orgApi.exchangeRates.create({ ...v, from_currency: "USD", to_currency: "KHR", entered_by: "Current user" }), successMessage: "Rate added" }} />} /><Nav /><DataTable name="Exchange rates" fetcher={orgApi.exchangeRates.list} columns={fxCols} defaultSort="-effective_date" /></PageBody>;

const holFields: FieldDef[] = [{ name: "date", label: "Date", type: "date", required: true }, { name: "name", label: "Holiday Name", required: true, help: "Enter from official announcements each year." }];
const holCols: Col<Row>[] = [{ key: "calendar", label: "Calendar" }, { key: "date", label: "Date", type: "date" }, { key: "name", label: "Holiday Name" }, { key: "status", label: "Status", type: "status" }];
export const BusinessCalendarsPage = () => <PageBody><PageHeader title="Business Calendars" description="Holidays are entered each year and are never hard-coded." actions={<ActionButton label="Add Holiday" icon={Plus} perms={["org.manage"]} action={{ title: "Add holiday", fields: holFields, run: (v) => orgApi.holidays.create({ ...v, calendar: "Cambodia Default", status: "ACTIVE" }), successMessage: "Holiday added" }} />} /><Nav /><DataTable name="Holidays" fetcher={orgApi.holidays.list} columns={holCols} defaultSort="date" /></PageBody>;

const seqCols: Col<Row>[] = [{ key: "name", label: "Sequence" }, { key: "pattern", label: "Pattern" }, { key: "next_value", label: "Next Value", type: "number" }, { key: "scope", label: "Scope" }];
export const DocumentNumberingPage = () => <PageBody><PageHeader title="Document Numbering" description="Numbers are unique and never reused." /><Nav /><DataTable name="Sequences" fetcher={orgApi.sequences.list} columns={seqCols} exportable={false} rowActions={[{ label: "Edit Pattern", icon: Pencil, perms: ["org.manage"], dialog: (r) => ({ title: "Edit pattern", description: "Changing a pattern after issue starts a new sequence version.", fields: [{ name: "pattern", label: "Pattern", required: true }], defaults: r, run: (v) => orgApi.sequences.update(String(r.id), v), successMessage: "Pattern updated" }) }]} /></PageBody>;

const setCols: Col<Row>[] = [{ key: "name", label: "Setting" }, { key: "value", label: "Value" }, { key: "group", label: "Group" }];
export function SystemConfigurationPage() {
  const t = useT();
  const execute = useAction();
  const can = useCan();
  const q = useQuery({ queryKey: ["features"], queryFn: ({ signal }) => orgApi.features.list({ limit: 20 }, signal) });
  return <PageBody><PageHeader title="System Configuration" /><Nav /><Section title="Feature modules" description="Pawn-backed loans stay off until the legal process is verified (D-20, V-04)."><QueryView query={q}>{(d) => <ul className="grid gap-3 sm:grid-cols-2">{d.items.map((f) => <li key={String(f.id)} className="flex items-center justify-between rounded-md border p-3 text-sm"><span>{t(String(f.name))}</span><Switch aria-label={t(String(f.name))} disabled={!can("org.manage")} checked={Boolean(f.enabled)} onCheckedChange={(enabled) => void execute(() => orgApi.features.update(String(f.id), { enabled }), { success: "Setting saved" })} /></li>)}</ul>}</QueryView></Section><DataTable name="System settings" fetcher={orgApi.settings.list} columns={setCols} exportable={false} rowActions={[{ label: "Edit", icon: Pencil, perms: ["org.manage"], dialog: (r) => ({ title: "Edit setting", fields: [{ name: "value", label: "Value", required: true }], defaults: r, run: (v) => orgApi.settings.update(String(r.id), v), successMessage: "Setting saved" }) }]} /></PageBody>;
}
