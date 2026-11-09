import type { LoanSummary, Row } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

export interface CollectionDashboard { as_of: string; buckets: { name: string; count: number; usd: string }[]; overdue_count: number; overdue_usd: string; overdue_khr: string; promises_due: Row[]; broken_promises: number; open_promises: number; follow_ups: LoanSummary[]; top_cases: LoanSummary[] }
export const collectionsApi = {
  dashboard: (signal?: AbortSignal) => apiRequest<CollectionDashboard>("/collections/dashboard", { signal }),
  overdue: resource<LoanSummary>("/collections/overdue"),
  activities: resource<Row>("/collections/activities"),
  promises: resource<Row>("/collections/promises"),
  markPromise: (id: string, status: "KEPT" | "BROKEN") => postCommand<Row>(`/collections/promises/${id}/mark`, { status }),
  assign: (loanId: string, officer_id: string) => postCommand<LoanSummary>(`/loans/${loanId}/assign`, { officer_id }),
};
