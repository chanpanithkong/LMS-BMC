import type { Application } from "@/types";
import { applicationsApi } from "./applications";

export interface AssessmentInput { verified_income: string; verified_expenses: string; existing_installments: string; risk_grade: string; recommendation: string; rationale: string; checklist: { item: string; result: string }[] }
export const assessmentsApi = {
  queue: applicationsApi.list,
  get: applicationsApi.get,
  /** The API computes DSR and the proposed installment; they are never derived in the browser. */
  submit: (id: string, input: AssessmentInput) => applicationsApi.action(id, "assessment", input) as Promise<Application>,
};
