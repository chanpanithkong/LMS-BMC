import type { Row } from "@/types";
import { apiRequest, postCommand, resource } from "./client";

const base = resource<Row>("/users");
export const usersApi = {
  ...base,
  grant: (id: string, roles: string[]) => postCommand<Row>(`/users/${id}/grant`, { roles }),
  approveGrant: (id: string) => postCommand<Row>(`/users/${id}/approve-grant`),
  deactivate: (id: string, reason: string) => postCommand<Row>(`/users/${id}/deactivate`, { reason }),
  activate: (id: string) => postCommand<Row>(`/users/${id}/activate`),
  roles: (signal?: AbortSignal) => apiRequest<{ items: { id: string; code: string; name: string; permissions: string[]; users: number }[]; groups: Record<string, string[]> }>("/roles", { signal }),
};
