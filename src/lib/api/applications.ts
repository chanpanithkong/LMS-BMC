import type { Application } from "@/types";
import { resource } from "./client";

const base = resource<Application>("/applications");
export const applicationsApi = {
  ...base,
  action: (id: string, action: string, body: unknown = {}) => base.command<Application>(id, action, body),
};
