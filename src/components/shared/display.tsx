"use client";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";

export function statusLabel(status: string): string {
  return status.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};
const SUCCESS = /^(ACTIVE|APPROVED|CONFIRMED|COMPLETED|POSTED|PAID|RECONCILED|KEPT|EXECUTED|RELEASED|ACCEPTED|PASS|SUCCESS|DELIVERED|SETTLED|CLOSED_PAID|CLOSED_EARLY_SETTLEMENT|OPEN_PERIOD|PLEDGED|REVIEWED)$/;
const WARNING = /^(PENDING.*|REQUESTED|SUBMITTED|UNDER_.*|AUTHORISED|ASSESSED|SIGNED|WARNING|IN_PROGRESS|QUOTED|INVITED|OPEN|DUE|PARTIALLY_PAID|MEDIUM|APPROVE_WITH_CONDITIONS|RELEASE_AUTHORISED)$/;
const DANGER = /^(OVERDUE|REJECTED|REJECT|FAILED|FAIL|BROKEN|REVERSED|WRITTEN_OFF|BLACKLISTED|EXPIRED|DIFFERENCE|HIGH|DECLINED|CANCELLED|INACTIVE|RETIRED|DECEASED)$/;
const INFO = /^(DRAFT|PROSPECT|SCHEDULED|GENERATED|PROPOSED|SUPERSEDED|CLOSED|REGISTERED|CHARGED|WAIVED|APPROVE|CASH|BANK_TRANSFER|LOW)$/;

export function StatusBadge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const t = useT();
  if (!status) return <span className="text-muted-foreground">—</span>;
  const resolved: Tone = tone ?? (SUCCESS.test(status) ? "success" : WARNING.test(status) ? "warning" : DANGER.test(status) ? "danger" : INFO.test(status) ? "info" : "neutral");
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[resolved], className)}>{t(statusLabel(status))}</span>;
}

/** Decimal string + currency code, right-aligned figures, KHR without decimals (SRS §16.4). */
export function MoneyDisplay({ value, currency = "USD", className, hideCode }: { value: string | null | undefined; currency?: CurrencyCode; className?: string; hideCode?: boolean }) {
  const amount = formatAmount(value, currency);
  return <span className={cn("tabular whitespace-nowrap", className)}>{amount}{amount !== "—" && !hideCode && <span className="ml-1 text-[0.8em] text-muted-foreground">{currency}</span>}</span>;
}

export function StatCard({ title, value, sub, icon: Icon, tone = "info", definition, href }: { title: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: Tone; definition?: string; href?: string }) {
  const t = useT();
  const body = (
    <Card className={cn("h-full gap-0 py-0", href && "transition-colors hover:border-primary/50")}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {definition ? <Tooltip><TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">{t(title)}</TooltipTrigger><TooltipContent className="max-w-xs">{t(definition)}</TooltipContent></Tooltip> : t(title)}
          </p>
          <div className="mt-1 text-lg font-semibold tabular [&_span]:whitespace-normal">{value}</div>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && <div className={cn("shrink-0 rounded-md p-2", TONES[tone])}><Icon className="size-4" aria-hidden /></div>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-ring">{body}</Link> : body;
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <Avatar className={cn("size-8", className)}><AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">{initials}</AvatarFallback></Avatar>;
}

export function Section({ title, description, actions, children, className, flush }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  const t = useT();
  return (
    <Card className={cn("gap-0 py-0", className)}>
      {(title || actions) && (
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3 [.border-b]:pb-3">
          <div className="min-w-0">
            {title && <CardTitle className="text-sm font-semibold">{t(title)}</CardTitle>}
            {description && <CardDescription className="text-xs">{t(description)}</CardDescription>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={flush ? "p-0" : "p-4"}>{children}</CardContent>
    </Card>
  );
}

export function DetailGrid({ items, columns = 3 }: { items: [label: string, value: ReactNode][]; columns?: 2 | 3 | 4 }) {
  const t = useT();
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{t(label)}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{value === null || value === undefined || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SimulatedTag({ className }: { className?: string }) {
  const t = useT();
  return <span className={cn("inline-flex items-center rounded border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning", className)}>{t("Simulated")}</span>;
}
