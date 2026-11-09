import type { Balances, LoanDetail, LoanSummary, LoanTransaction, Row, ScheduleVersion } from "@/types";
import { apiRequest, postCommand, resource, type ListParams, type Page } from "./client";

const base = resource<LoanSummary>("/loans");
export const loansApi = {
  ...base,
  detail: (id: string, signal?: AbortSignal) => apiRequest<LoanDetail>(`/loans/${id}`, { signal }),
  schedule: (id: string, version?: number, signal?: AbortSignal) => apiRequest<ScheduleVersion>(`/loans/${id}/schedule`, { query: { version }, signal }),
  transactions: (id: string, params: ListParams, signal?: AbortSignal) => apiRequest<Page<LoanTransaction>>(`/loans/${id}/transactions`, { query: params, signal }),
  balances: (id: string, as_of?: string, signal?: AbortSignal) => apiRequest<Balances>(`/loans/${id}/balances`, { query: { as_of }, signal }),
  statement: (id: string, params: { date_from?: string; date_to?: string }, signal?: AbortSignal) => apiRequest<Row>(`/loans/${id}/statement`, { query: params, signal }),
  related: (id: string, signal?: AbortSignal) => apiRequest<Record<string, Row[]>>(`/loans/${id}/related`, { signal }),
  close: (id: string) => postCommand<LoanSummary>(`/loans/${id}/close`),
  allTransactions: resource<LoanTransaction>("/loan-transactions"),
  installments: resource<Row>("/loan-installments"),
};
