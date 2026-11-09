"use client";
import { create } from "zustand";
import { authApi } from "@/lib/api/auth";
import { refreshSession, registerSessionExpiredHandler, setAccessToken } from "@/lib/api/client";
import { permissionsForRoles, type Permission } from "@/lib/permissions";
import type { LoginResponse, SessionUser } from "@/types";

const SESSION_HINT = "lms-has-session";
const hint = {
  get: () => { try { return localStorage.getItem(SESSION_HINT) === "1"; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(SESSION_HINT, "1"); else localStorage.removeItem(SESSION_HINT); } catch { /* storage unavailable */ } },
};

interface AuthState {
  status: "loading" | "anonymous" | "authenticated";
  user: SessionUser | null;
  permissions: Permission[];
  mfaToken: string | null;
  bootstrap: () => Promise<void>;
  applyLogin: (response: LoginResponse) => void;
  setMfaToken: (token: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  permissions: [],
  mfaToken: null,
  setMfaToken: (mfaToken) => set({ mfaToken }),
  applyLogin: ({ access_token, user }) => {
    if (!access_token || !user) return;
    setAccessToken(access_token);
    hint.set(true);
    set({ status: "authenticated", user, permissions: permissionsForRoles(user.roles), mfaToken: null });
  },
  bootstrap: async () => {
    if (get().status === "authenticated") return;
    // Only attempt a refresh when this browser has signed in before, so anonymous visits make no failing request.
    const refreshed = hint.get() && (await refreshSession());
    if (!refreshed) { hint.set(false); return set({ status: "anonymous", user: null, permissions: [] }); }
    try {
      const user = await authApi.me();
      set({ status: "authenticated", user, permissions: permissionsForRoles(user.roles) });
    } catch {
      set({ status: "anonymous", user: null, permissions: [] });
    }
  },
  logout: async () => {
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    hint.set(false);
    set({ status: "anonymous", user: null, permissions: [] });
  },
}));

registerSessionExpiredHandler(() => useAuth.setState({ status: "anonymous", user: null, permissions: [] }));

/** UI-only permission check. The API enforces authorisation on every request (FR-AUTH-012). */
export function useCan() {
  const permissions = useAuth((s) => s.permissions);
  return (...required: Permission[]) => required.length === 0 || required.some((p) => permissions.includes(p));
}
