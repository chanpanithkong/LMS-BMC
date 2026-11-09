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
