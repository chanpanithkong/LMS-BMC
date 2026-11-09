import type { Allocation, Balances, LoanSummary, Repayment, Row } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

const base = resource<Repayment>("/repayments");
export interface RepaymentInput { amount: string; method: string; value_date: string; external_reference?: string | null; comment?: string }
export interface AllocationPreview { amount: string; currency: string; allocations: Allocation[]; unapplied_amount: string; totals: Record<string, string>; waterfall: string }
export interface RepaymentDashboard { as_of: string; summary: { currency: "USD" | "KHR"; count: number; total: string; cash: string; bank_transfer: string }[]; session: Row | null; pending_reversals: number; due_soon: LoanSummary[]; recent: Repayment[] }
export const repaymentsApi = {
  ...base,
  dashboard: (signal?: AbortSignal) => apiRequest<RepaymentDashboard>("/repayments/dashboard", { signal }),
  preview: (loanId: string, input: RepaymentInput, signal?: AbortSignal) => apiRequest<AllocationPreview>(`/loans/${loanId}/repayments/preview`, { method: "POST", body: input, signal }),
  record: (loanId: string, input: RepaymentInput, key: string) => postCommand<Repayment & { balances: Balances }>(`/loans/${loanId}/repayments`, input, key),
  print: (id: string) => postCommand<Repayment>(`/repayments/${id}/print`),
  requestReversal: (id: string, body: { reason_code: string; reason: string }) => postCommand<Row>(`/repayments/${id}/reversal-requests`, body),
  reversals: resource<Row>("/reversal-requests"),
  decideReversal: (id: string, action: "approve" | "reject", body: unknown) => postCommand<Row>(`/reversal-requests/${id}/${action}`, body),
  requestRefund: (loanId: string, body: unknown) => postCommand<Row>(`/loans/${loanId}/refunds`, body),
  approveRefund: (id: string) => postCommand<Row>(`/refunds/${id}/approve`),
  refunds: resource<Row>("/refunds"),
  sessions: resource<Row>("/cashier-sessions"),
  openSession: (body: unknown) => postCommand<Row>("/cashier-sessions/open", body),
  closeSession: (id: string, body: unknown) => postCommand<Row>(`/cashier-sessions/${id}/close`, body),
};
