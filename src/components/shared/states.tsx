"use client";
import { AlertTriangle, Inbox, Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/store";

export function EmptyState({ title = "No records found", description, icon: Icon = Inbox, action }: { title?: string; description?: string; icon?: LucideIcon; action?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3"><Icon className="size-5 text-muted-foreground" aria-hidden /></div>
      <p className="font-medium">{t(title)}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{t(description)}</p>}
      {action}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={className ?? "space-y-3 p-4"} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const forbidden = error instanceof ApiError && error.status === 403;
  const notFound = error instanceof ApiError && error.status === 404;
  const Icon = forbidden ? Lock : AlertTriangle;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" role="alert">
      <div className="rounded-full bg-danger-soft p-3"><Icon className="size-5 text-danger" aria-hidden /></div>
      <p className="font-medium">{t(forbidden ? "You do not have access to this information" : notFound ? "Record not found" : "Unable to load data")}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t(error instanceof Error ? error.message : "Please try again.")}</p>
      {error instanceof ApiError && error.traceId && <p className="text-xs text-muted-foreground">Trace: {error.traceId}</p>}
      {onRetry && !forbidden && !notFound && <Button variant="outline" size="sm" onClick={onRetry}>{t("Try again")}</Button>}
    </div>
  );
}

export function AccessDeniedState() {
  return <EmptyState icon={Lock} title="Access denied" description="Your role does not include access to this page. Contact your administrator if you need it." />;
}
