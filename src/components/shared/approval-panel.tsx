"use client";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/store";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import { Section } from "./display";

/** Shows approval limits and maker-checker state. The API remains the enforcement point (BR-SEC-003). */
export function ApprovalPanel({ currency, makers, level, requiredLevels, children, note }: { currency?: CurrencyCode; makers?: { label: string; id?: string | null; name?: string | null }[]; level?: number; requiredLevels?: number; children?: ReactNode; note?: string }) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const blocking = (makers ?? []).filter((m) => m.id && m.id === user?.id);
  const limit = currency === "KHR" ? user?.approval_limit_khr : user?.approval_limit_usd;
  return (
    <Section title="Approval controls">
      <div className="space-y-3 text-sm">
        {currency && <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("Your approval limit")}</span><span className="font-medium tabular">{formatAmount(limit, currency)} {currency}</span></div>}
        {level !== undefined && <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("Approval level")}</span><span className="font-medium">{level} / {requiredLevels}</span></div>}
        {(makers ?? []).map((m) => m.name && <div key={m.label} className="flex justify-between gap-2"><span className="text-muted-foreground">{t(m.label)}</span><span className="font-medium">{m.name}</span></div>)}
        {blocking.length > 0
          ? <p className="flex items-start gap-2 rounded-md bg-danger-soft p-2 text-danger"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{t("Maker-checker restriction: you prepared this record, so a different user must decide.")}</p>
          : makers && <p className="flex items-start gap-2 rounded-md bg-success-soft p-2 text-success"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("Maker-checker check passed for your account.")}</p>}
        {note && <p className="text-xs text-muted-foreground">{t(note)}</p>}
        {children && <div className="flex flex-wrap gap-2 border-t pt-3">{children}</div>}
      </div>
    </Section>
  );
}
