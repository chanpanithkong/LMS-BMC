"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDate } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import type { AuditEntry, LoanTransaction } from "@/types";
import { EmptyState } from "./states";
import { statusLabel } from "./display";

/** Visual workflow progress indicator. */
export function WorkflowSteps({ steps, current, failed }: { steps: string[]; current: string; failed?: boolean }) {
  const t = useT();
  const index = steps.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-3" aria-label={t("Workflow progress")}>
      {steps.map((step, i) => {
        const done = index >= 0 && i < index;
        const active = i === index;
        return (
          <li key={step} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", done && "border-success bg-success text-white dark:text-black", active && !failed && "border-primary bg-primary text-primary-foreground", active && failed && "border-danger bg-danger text-white", !done && !active && "text-muted-foreground")}>
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-xs whitespace-nowrap", active ? "font-semibold" : "text-muted-foreground")}>{t(statusLabel(step))}</span>
            {i < steps.length - 1 && <span className="mx-1 hidden h-px w-5 bg-border sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function TransactionTimeline({ items, currency }: { items: LoanTransaction[]; currency: CurrencyCode }) {
  const t = useT();
  if (!items.length) return <EmptyState title="No transactions yet" />;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {items.map((x) => (
        <li key={x.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-medium">{t(statusLabel(x.txn_type))} · {t(statusLabel(x.component))}</span>
            <span className="tabular">{formatAmount(x.amount, currency)} {currency}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(x.value_date)} · {x.source_document}</p>
        </li>
      ))}
    </ol>
  );
}

export function AuditTimeline({ items }: { items: AuditEntry[] }) {
  const t = useT();
  if (!items.length) return <EmptyState title="No audit entries" />;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {items.map((x) => (
        <li key={x.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{t(statusLabel(x.action))}</p>
          <p className="text-xs text-muted-foreground">{x.user_name} · {formatDateTime(x.at)} · {x.ip_address}</p>
          {(x.previous_state || x.new_state) && <p className="text-xs">{x.previous_state || "—"} → {x.new_state || "—"}</p>}
          {x.reason && <p className="text-xs text-muted-foreground">{t("Reason")}: {x.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

export function StatusTimeline({ items }: { items: { status: string; previous_status?: string | null; actor: string; at: string; reason?: string }[] }) {
  const t = useT();
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {[...items].reverse().map((x, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
          <p className="text-sm font-medium">{t(statusLabel(x.status))}</p>
          <p className="text-xs text-muted-foreground">{x.actor} · {formatDateTime(x.at)}</p>
          {x.reason && <p className="text-xs">{t("Reason")}: {x.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
