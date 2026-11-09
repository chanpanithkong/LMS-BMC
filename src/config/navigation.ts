import {
  Activity, BadgeCheck, Banknote, BarChart3, Bell, BookOpen, Building2, CalendarCheck, CalendarClock, Calculator, ClipboardCheck, ClipboardList, Coins, FileCheck2, FileClock, FileSearch, FileSignature, FileSpreadsheet, FileText, FolderKanban, HandCoins, History, Landmark, LayoutDashboard, ListChecks, type LucideIcon, Percent, PhoneCall, Receipt, Repeat, Scale, ScrollText, Settings, Shield, ShieldAlert, ShieldCheck, TrendingUp, UserPlus, Users, UsersRound, Vault, Wallet, Wrench,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem { label: string; href: string; icon: LucideIcon; perms: Permission[] }
export interface NavGroup { label: string; items: NavItem[] }

export const NAVIGATION: NavGroup[] = [
  { label: "Dashboard", items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard, perms: ["loan.view"] }] },
  { label: "Customer Management", items: [
    { label: "Borrowers", href: "/borrowers", icon: Users, perms: ["borrower.view"] },
    { label: "Borrower Registration", href: "/borrowers/new", icon: UserPlus, perms: ["borrower.edit"] },
  ] },
  { label: "Loan Origination", items: [
    { label: "Loan Applications", href: "/applications", icon: FileText, perms: ["application.view"] },
    { label: "Credit Assessment", href: "/assessments", icon: FileSearch, perms: ["credit.view"] },
    { label: "Loan Approvals", href: "/approvals", icon: BadgeCheck, perms: ["credit.approve", "credit.view"] },
    { label: "Loan Agreements", href: "/agreements", icon: FileSignature, perms: ["agreement.view"] },
  ] },
  { label: "Loan Management", items: [
    { label: "Loan Accounts", href: "/loans", icon: Landmark, perms: ["loan.view"] },
    { label: "Disbursements", href: "/disbursements", icon: Banknote, perms: ["disbursement.view"] },
    { label: "Repayments", href: "/repayments", icon: Receipt, perms: ["repayment.view"] },
    { label: "Loan Schedules", href: "/loans/schedules", icon: CalendarClock, perms: ["loan.view"] },
    { label: "Loan Transactions", href: "/loans/transactions", icon: ScrollText, perms: ["loan.view"] },
    { label: "Early Settlement", href: "/settlements", icon: HandCoins, perms: ["settlement.view"] },
    { label: "Loan Closure", href: "/closures", icon: FileCheck2, perms: ["settlement.view"] },
  ] },
  { label: "Risk & Collection", items: [
    { label: "Delinquency Management", href: "/collections", icon: ShieldAlert, perms: ["collection.view"] },
    { label: "Overdue Loans", href: "/collections/overdue", icon: CalendarCheck, perms: ["collection.view"] },
    { label: "Collection Activities", href: "/collections/activities", icon: PhoneCall, perms: ["collection.view"] },
    { label: "Promises to Pay", href: "/collections/promises", icon: ListChecks, perms: ["collection.view"] },
    { label: "Rescheduling", href: "/rescheduling", icon: Repeat, perms: ["restructure.view"] },
    { label: "Restructuring", href: "/restructuring", icon: Wrench, perms: ["restructure.view"] },
    { label: "Late Fees and Penalties", href: "/fees", icon: Percent, perms: ["fee.view"] },
  ] },
  { label: "Collateral", items: [
    { label: "Collateral Register", href: "/collateral", icon: Vault, perms: ["collateral.view"] },
    { label: "Guarantors", href: "/guarantors", icon: UsersRound, perms: ["collateral.view"] },
  ] },
  { label: "Finance & Accounting", items: [
    { label: "Accounting Dashboard", href: "/accounting", icon: Coins, perms: ["accounting.view"] },
    { label: "Chart of Accounts", href: "/accounting/accounts", icon: BookOpen, perms: ["accounting.view"] },
    { label: "General Ledger", href: "/accounting/general-ledger", icon: FileSpreadsheet, perms: ["accounting.view"] },
    { label: "Journal Entries", href: "/accounting/journals", icon: ClipboardList, perms: ["accounting.view"] },
    { label: "Trial Balance", href: "/accounting/trial-balance", icon: Scale, perms: ["accounting.view"] },
    { label: "Reconciliation", href: "/accounting/reconciliation", icon: ClipboardCheck, perms: ["accounting.view"] },
    { label: "Accounting Periods", href: "/accounting/periods", icon: CalendarClock, perms: ["accounting.view"] },
  ] },
  { label: "Reports & Analytics", items: [
    { label: "Report Catalogue", href: "/reports", icon: FolderKanban, perms: ["report.portfolio", "report.collection", "report.financial", "report.risk", "report.control"] },
    { label: "Portfolio Reports", href: "/reports/category/portfolio", icon: BarChart3, perms: ["report.portfolio"] },
    { label: "Collection Reports", href: "/reports/category/collections", icon: TrendingUp, perms: ["report.collection"] },
    { label: "Financial Reports", href: "/reports/category/financial", icon: Wallet, perms: ["report.financial"] },
    { label: "Risk Reports", href: "/reports/category/risk", icon: ShieldAlert, perms: ["report.risk"] },
    { label: "Control Reports", href: "/reports/category/control", icon: ShieldCheck, perms: ["report.control"] },
  ] },
  { label: "System Administration", items: [
    { label: "Users", href: "/admin/users", icon: Users, perms: ["user.view"] },
    { label: "Roles & Permissions", href: "/admin/roles", icon: Shield, perms: ["role.view"] },
    { label: "Branch Management", href: "/admin/branches", icon: Building2, perms: ["org.view"] },
    { label: "Loan Products", href: "/products", icon: Calculator, perms: ["product.view"] },
    { label: "System Settings", href: "/admin/settings", icon: Settings, perms: ["org.view"] },
    { label: "Documents", href: "/documents", icon: FileClock, perms: ["document.view"] },
    { label: "Document Templates", href: "/documents/templates", icon: FileText, perms: ["template.manage", "document.view"] },
    { label: "Audit Dashboard", href: "/audit", icon: Activity, perms: ["audit.view"] },
    { label: "Audit Logs", href: "/audit/logs", icon: History, perms: ["audit.view"] },
  ] },
  { label: "Notifications", items: [{ label: "Notification Center", href: "/notifications", icon: Bell, perms: ["notification.view"] }] },
];

/** First matching rule wins; used for the client-side unauthorised state only. */
export const ROUTE_PERMISSIONS: [RegExp, Permission[]][] = [
  [/^\/admin\/(users|roles|permissions)/, ["user.view", "role.view"]],
  [/^\/admin/, ["org.view"]],
  [/^\/dashboard/, ["loan.view"]], [/^\/borrowers\/new/, ["borrower.edit"]], [/^\/borrowers/, ["borrower.view"]], [/^\/products/, ["product.view"]],
  [/^\/applications\/new/, ["application.create"]], [/^\/applications/, ["application.view", "credit.view"]], [/^\/assessments/, ["credit.view"]], [/^\/approvals/, ["credit.approve", "credit.view"]], [/^\/agreements/, ["agreement.view"]],
  [/^\/collateral/, ["collateral.view"]], [/^\/guarantors/, ["collateral.view"]], [/^\/disbursements/, ["disbursement.view"]], [/^\/repayments\/new/, ["repayment.create"]], [/^\/repayments/, ["repayment.view"]], [/^\/loans/, ["loan.view"]],
  [/^\/collections/, ["collection.view"]], [/^\/rescheduling/, ["restructure.view"]], [/^\/restructuring/, ["restructure.view"]], [/^\/settlements/, ["settlement.view"]], [/^\/closures/, ["settlement.view"]], [/^\/fees/, ["fee.view"]],
  [/^\/accounting/, ["accounting.view"]], [/^\/audit/, ["audit.view"]], [/^\/documents/, ["document.view"]],
];
