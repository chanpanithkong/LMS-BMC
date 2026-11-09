/** Documents, audit and organisation configuration. */
import type { AuditEntry, DocumentRecord, Row } from "@/types";
import { apiRequest, resource } from "./client";

const documents = resource<DocumentRecord>("/documents");
export const documentsApi = {
  ...documents,
  downloadUrl: (id: string) => apiRequest<{ url: string; expires_in_seconds: number }>(`/documents/${id}/download-url`),
  newVersion: (id: string) => apiRequest<DocumentRecord>(`/documents/${id}/versions`, { method: "POST" }),
  templates: resource<Row>("/templates"),
};
export const auditApi = {
  dashboard: (signal?: AbortSignal) => apiRequest<Row>("/audit/dashboard", { signal }),
  logs: resource<AuditEntry>("/audit-logs"),
  logins: resource<Row>("/login-history"),
  exceptions: resource<Row>("/control-exceptions"),
  exportLogs: resource<Row>("/export-logs"),
  reviewException: (id: string, reason: string) => apiRequest<Row>(`/control-exceptions/${id}/review`, { method: "POST", body: { reason } }),
};
export const orgApi = {
  branches: resource<Row>("/branches"),
  currencies: resource<Row>("/currencies"),
  exchangeRates: resource<Row>("/exchange-rates"),
  holidays: resource<Row>("/holidays"),
  sequences: resource<Row>("/sequences"),
  settings: resource<Row>("/system-settings"),
  features: resource<Row>("/feature-flags"),
  company: (signal?: AbortSignal) => apiRequest<Row>("/company", { signal }),
  updateCompany: (body: unknown) => apiRequest<Row>("/company", { method: "PATCH", body }),
  search: (q: string, signal?: AbortSignal) => apiRequest<{ items: { type: string; label: string; sublabel: string; href: string }[] }>("/search", { query: { q }, signal }),
  resetDemo: () => apiRequest<Row>("/admin/reset-demo", { method: "POST" }),
};
