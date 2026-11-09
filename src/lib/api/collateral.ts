import type { Row } from "@/types";
import { resource } from "./client";

const base = resource<Row>("/collateral");
export const collateralApi = { ...base, action: (id: string, action: string, body: unknown = {}) => base.command(id, action, body) };
const guarantors = resource<Row>("/guarantors");
export const guarantorsApi = { ...guarantors, release: (id: string, reason: string) => guarantors.command(id, "release", { reason }) };
