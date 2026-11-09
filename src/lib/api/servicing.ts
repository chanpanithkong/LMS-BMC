/** Rescheduling, restructuring, settlement, closure, fees and waivers. */
import type { Row } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

const modifications = resource<Row>("/modifications");
export const modificationsApi = { ...modifications, action: (id: string, action: string, body: unknown = {}) => modifications.command(id, action, body) };
const settlements = resource<Row>("/settlements");
export const settlementsApi = {
  ...settlements,
  quote: (loanId: string, body: unknown) => postCommand<Row>(`/loans/${loanId}/settlement-quotes`, body),
  action: (id: string, action: "pay" | "cancel", body: unknown = {}) => settlements.command(id, action, body),
};
export interface PrepaymentTerms { outstanding_principal: string; installment: string; remaining_installments: number; maturity_date: string; remaining_interest: string }
export interface PrepaymentPreview { amount: string; date: string; option: string; currency: string; new_principal: string; interest_reduction: string; existing: PrepaymentTerms; proposed: PrepaymentTerms; proposed_installments: { no: number; due_date: string; payment_due_date: string; opening: string; principal: string; interest: string; total: string; closing: string }[] }
export interface PrepaymentInput { amount: string; value_date: string; option: string; method?: string; external_reference?: string | null }
/** The API computes the revised schedule; the page only displays it (FR-CLS-004). */
export const prepaymentsApi = {
  preview: (loanId: string, input: PrepaymentInput, signal?: AbortSignal) => apiRequest<PrepaymentPreview>(`/loans/${loanId}/prepayments/preview`, { method: "POST", body: input, signal }),
  record: (loanId: string, input: PrepaymentInput, key: string) => postCommand<{ id: string; receipt_no: string }>(`/loans/${loanId}/prepayments`, input, key),
};
export const closuresApi = { ready: resource<Row>("/closures/ready"), history: resource<Row>("/closures/history") };
const waivers = resource<Row>("/waivers");
export const feesApi = {
  rules: resource<Row>("/fee-rules"),
  penalties: resource<Row>("/penalty-rules"),
  transactions: resource<Row>("/fee-transactions"),
  waivers,
  approveRule: (kind: "fee-rules" | "penalty-rules", id: string) => postCommand<Row>(`/${kind}/${id}/approve`),
  decideWaiver: (id: string, action: "approve" | "reject", body: unknown = {}) => waivers.command(id, action, body),
  createRule: (kind: "fee-rules" | "penalty-rules", body: unknown) => apiRequest<Row>(`/${kind}`, { method: "POST", body }),
};
