"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { NAVIGATION } from "@/config/navigation";
import { useT } from "@/lib/i18n/store";

const SEGMENT_LABELS: Record<string, string> = {
  new: "New", prepayment: "Partial Prepayment", edit: "Edit", documents: "Documents", loans: "Loans", individual: "Individual", business: "Business", versions: "Version History", approvals: "Approvals", calculator: "Calculator", review: "Review", history: "History", affordability: "Affordability", generate: "Generate", preview: "Preview", valuations: "Valuations", custody: "Custody", release: "Release", request: "Request", approve: "Approval", confirm: "Confirm", receipt: "Receipt", reversal: "Reversal", reversals: "Reversals", schedule: "Schedule", transactions: "Transactions", balances: "Balances", statement: "Statement", collections: "Collections", overdue: "Overdue Loans", activities: "Activities", contacts: "Contact History", promises: "Promises to Pay", assignments: "Assignments", close: "Period Closing", settings: "Settings", templates: "Templates", upload: "Upload", logs: "Audit Log", users: "Users", financial: "Financial Activity", exceptions: "Control Exceptions", logins: "Login History", admin: "Administration", roles: "Roles", permissions: "Permissions", branches: "Branches", currencies: "Currencies", "exchange-rates": "Exchange Rates", calendars: "Business Calendars", numbering: "Document Numbering", system: "System Configuration", accounts: "Accounts", journals: "Journals", periods: "Periods", "trial-balance": "Trial Balance", "general-ledger": "General Ledger", reconciliation: "Reconciliation", accounting: "Accounting", reports: "Reports", category: "Category", penalties: "Penalties", waivers: "Waivers", "penalty-transactions": "Penalty Transactions", fees: "Fees", settlements: "Settlements", closures: "Closures", restructuring: "Restructuring", rescheduling: "Rescheduling", products: "Products", applications: "Applications", assessments: "Assessments", agreements: "Agreements", collateral: "Collateral", guarantors: "Guarantors", disbursements: "Disbursements", repayments: "Repayments", borrowers: "Borrowers", notifications: "Notifications", audit: "Audit", dashboard: "Overview", schedules: "Loan Schedules",
};

const navLabel = new Map(NAVIGATION.flatMap((g) => g.items.map((i) => [i.href, i.label] as const)));

export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useT();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((part, i) => {
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    return { href, label: navLabel.get(href) ?? SEGMENT_LABELS[part] ?? "Details" };
  });
  return (
    <Breadcrumb className="no-print">
      <BreadcrumbList className="text-xs">
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? <BreadcrumbPage>{t(c.label)}</BreadcrumbPage> : <BreadcrumbLink asChild><Link href={c.href}>{t(c.label)}</Link></BreadcrumbLink>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function PageHeader({ title, description, actions, badge }: { title: ReactNode; description?: string; actions?: ReactNode; badge?: ReactNode }) {
  const t = useT();
  return (
    <div className="no-print flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{typeof title === "string" ? t(title) : title}</h1>
          {badge}
        </div>
        {description && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{t(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
