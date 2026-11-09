import type { Product, ProductConfig, Row, SchedulePreview } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

const base = resource<Product>("/products");
export const productsApi = {
  ...base,
  newVersion: (id: string, change_note: string) => apiRequest<Product>(`/products/${id}/versions`, { method: "POST", body: { change_note } }),
  updateDraft: (id: string, version: number, config: Partial<ProductConfig>) => apiRequest<Product>(`/products/${id}/versions/${version}`, { method: "PATCH", body: config }),
  versionAction: (id: string, version: number, action: "submit" | "approve" | "reject", body: unknown = {}) => postCommand<Product>(`/products/${id}/versions/${version}/${action}`, body),
  retire: (id: string, reason: string) => postCommand<Product>(`/products/${id}/retire`, { reason }),
  versions: resource<Row>("/product-versions"),
};

export interface ScheduleInput { principal: string; currency: string; annual_rate: string; interest_method: string; amortisation: string; day_count: string; frequency: string; term: number; disbursement_date?: string; first_due_date?: string; grace_type?: string; grace_periods?: number; rounding_increment?: string }
/** Stateless engine preview; the UI only displays the returned figures (FR-CALC-012). */
export const calculationsApi = {
  schedulePreview: (input: ScheduleInput, signal?: AbortSignal) => apiRequest<SchedulePreview>("/calculations/schedule-preview", { method: "POST", body: input, signal }),
  affordability: (input: { monthly_income: string; monthly_expenses: string; existing_installments: string; proposed_installment: string }) => apiRequest<{ net_disposable_income: string; dsr_percent: string; repayment_capacity_percent: string; thresholds_note: string }>("/calculations/affordability", { method: "POST", body: input }),
};
