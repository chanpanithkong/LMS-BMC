import type { Disbursement, LoanSummary } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

const base = resource<Disbursement>("/disbursements");
export interface DisbursementPreview { loan: LoanSummary; approved_principal: string; remaining_commitment: string; fees_deducted: string; net_disbursement: string; fee_basis: string; checks: { label: string; passed: boolean }[] }
export const disbursementsApi = {
  ...base,
  preview: (loanId: string, signal?: AbortSignal) => apiRequest<DisbursementPreview>(`/loans/${loanId}/disbursement-preview`, { signal }),
  request: (loanId: string, body: unknown, key?: string) => postCommand<Disbursement>(`/loans/${loanId}/disbursements`, body, key),
  action: (id: string, action: "authorise" | "reject" | "confirm" | "fail", body: unknown = {}, key?: string) => base.command<Disbursement>(id, action, body, key),
};
