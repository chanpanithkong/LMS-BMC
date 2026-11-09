import type { LoginResponse, SessionUser } from "@/types";
import { apiRequest, setAccessToken } from "./client";

export const authApi = {
  login: (username: string, password: string) => apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { username, password }, skipRefresh: true }),
  verifyMfa: (mfa_token: string, code: string) => apiRequest<LoginResponse>("/auth/mfa", { method: "POST", body: { mfa_token, code }, skipRefresh: true }),
  refresh: () => apiRequest<LoginResponse>("/auth/refresh", { method: "POST", skipRefresh: true }),
  me: () => apiRequest<SessionUser>("/auth/me"),
  logout: async () => { await apiRequest<void>("/auth/logout", { method: "POST", skipRefresh: true }); setAccessToken(null); },
  requestPasswordReset: (email: string) => apiRequest<{ detail: string }>("/auth/password-reset", { method: "POST", body: { email }, skipRefresh: true }),
  completePasswordReset: (token: string, new_password: string) => apiRequest<{ detail: string }>("/auth/password-reset", { method: "POST", body: { token, new_password }, skipRefresh: true }),
  /** Mock mode only: switches the demonstration persona. */
  switchDemoUser: (user_id: string) => apiRequest<LoginResponse>("/auth/switch-role", { method: "POST", body: { user_id }, skipRefresh: true }),
};
