import { applicationsApi } from "./applications";

export type ApprovalAction = "approve" | "reject" | "request-documents" | "request-info" | "escalate";
export const approvalsApi = {
  queue: applicationsApi.list,
  get: applicationsApi.get,
  decide: (id: string, action: ApprovalAction, body: unknown) => applicationsApi.action(id, action, body),
};
