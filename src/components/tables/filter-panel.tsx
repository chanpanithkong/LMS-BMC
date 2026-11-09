"use client";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { productsApi } from "@/lib/api/products";
import { orgApi } from "@/lib/api/platform";
import { useT } from "@/lib/i18n/store";

export function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">{children}</div>;
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const t = useT();
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger className="w-full sm:w-44" aria-label={t(label)}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="__all">{t("All")}: {t(label)}</SelectItem>{options.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export const CURRENCY_OPTIONS = [{ value: "USD", label: "USD" }, { value: "KHR", label: "KHR" }];

export function useBranchOptions() {
  const q = useQuery({ queryKey: ["options", "branches"], queryFn: ({ signal }) => orgApi.branches.list({ limit: 100 }, signal), staleTime: 300_000 });
  return (q.data?.items ?? []).map((b) => ({ value: String(b.id), label: String(b.name) }));
}

export function useProductOptions() {
  const q = useQuery({ queryKey: ["options", "products"], queryFn: ({ signal }) => productsApi.list({ limit: 100 }, signal), staleTime: 300_000 });
  return (q.data?.items ?? []).map((p) => ({ value: p.id, label: p.name_en }));
}
