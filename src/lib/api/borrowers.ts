import type { Borrower, BorrowerDetail } from "@/types";
import { postCommand, resource } from "./client";

const base = resource<Borrower>("/borrowers");
export const borrowersApi = {
  ...base,
  detail: (id: string, signal?: AbortSignal) => base.get(id, signal) as Promise<BorrowerDetail>,
  revealId: (id: string) => postCommand<{ id_number: string }>(`/borrowers/${id}/reveal-id`),
  confirmDuplicate: (id: string, reason: string) => postCommand<Borrower>(`/borrowers/${id}/confirm-duplicate`, { reason }),
  setStatus: (id: string, status: string, reason: string) => postCommand<Borrower>(`/borrowers/${id}/status`, { status, reason }),
};
