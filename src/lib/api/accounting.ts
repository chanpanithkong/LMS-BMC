import type { Journal, Row } from "@/types";
import { apiRequest, postCommand, resource, type QueryValue } from "./client";

const journals = resource<Journal>("/accounting/journals");
export const accountingApi = {
  dashboard: (currency: string, signal?: AbortSignal) => apiRequest<Row>("/accounting/dashboard", { query: { currency }, signal }),
  accounts: resource<Row>("/accounting/accounts"),
  journals,
  journalAction: (id: string, action: "approve" | "reject" | "reverse", body: unknown = {}) => journals.command<Journal>(id, action, body),
  trialBalance: (query: Record<string, QueryValue>, signal?: AbortSignal) => apiRequest<{ currency: "USD" | "KHR"; as_of: string; rows: Row[]; total_debit: string; total_credit: string }>("/accounting/trial-balance", { query, signal }),
  generalLedger: resource<Row>("/accounting/general-ledger"),
  periods: resource<Row>("/accounting/periods"),
  periodAction: (id: string, action: "close" | "reopen" | "checklist", body: unknown = {}) => postCommand<Row>(`/accounting/periods/${id}/${action}`, body),
  reconciliations: resource<Row>("/accounting/reconciliations"),
  reconciliationAction: (id: string, action: "match" | "complete") => postCommand<Row>(`/accounting/reconciliations/${id}/${action}`),
};
