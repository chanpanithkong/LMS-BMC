"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/store";

export const SIMULATED_NOTICE = "Simulated response — no real financial posting was made.";

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.detail || error.title;
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Runs a mutation, refreshes cached data and reports the outcome. Rethrows so forms can stay open. */
export function useAction() {
  const client = useQueryClient();
  const t = useT();
  return useCallback(
    async <T,>(fn: () => Promise<T>, options: { success?: string; simulated?: boolean } = {}): Promise<T> => {
      try {
        const result = await fn();
        await client.invalidateQueries();
        const message = (result as { message?: string } | undefined)?.message ?? options.success;
        if (message) toast.success(t(message), options.simulated ? { description: t(SIMULATED_NOTICE) } : undefined);
        return result;
      } catch (error) {
        toast.error(t(error instanceof ApiError ? error.title : "Request failed"), { description: t(describeError(error)) });
        throw error;
      }
    },
    [client, t],
  );
}
