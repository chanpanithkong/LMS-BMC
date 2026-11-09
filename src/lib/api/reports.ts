import type { ReportDefinition, ReportResult, Row } from "@/types";
import { apiRequest, type QueryValue } from "./client";

export const reportsApi = {
  catalogue: (signal?: AbortSignal) => apiRequest<{ items: ReportDefinition[] }>("/reports", { signal }),
  run: (code: string, query: Record<string, QueryValue>, signal?: AbortSignal) => apiRequest<ReportResult>(`/reports/${code}`, { query, signal }),
  logExport: (code: string, body: { format: string; parameters?: unknown; rows?: number }) => apiRequest<Row>(`/reports/${code}/exports`, { method: "POST", body }),
  dashboard: (query: Record<string, QueryValue>, signal?: AbortSignal) => apiRequest<Row>("/dashboards/management", { query, signal }),
};
