import type { Row } from "@/types";
import { apiRequest, resource } from "./client";

const base = resource<Row>("/agreements");
export const agreementsApi = {
  ...base,
  generate: (loan_id: string, language: string) => apiRequest<Row>("/agreements", { method: "POST", body: { loan_id, language } }),
  execute: (id: string, body: unknown) => base.command(id, "execute", body),
  decline: (id: string, reason: string) => base.command(id, "decline", { reason }),
};
