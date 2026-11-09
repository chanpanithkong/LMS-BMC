/**
 * Central REST client following the SRS §15.1 conventions:
 * RFC 9457 errors, Idempotency-Key on financial commands, cursor pagination, access token in memory.
 */
export const API_MODE = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";
export const API_BASE_URL = API_MODE === "live" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1") : "/api/mock/v1";

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail: string,
    readonly errors: FieldError[] = [],
    readonly traceId?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(detail || title);
    this.name = "ApiError";
  }
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  total: number;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Pass for every financial command; the same key is reused on retries (SRS §15.1). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  skipRefresh?: boolean;
}

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function hasAccessToken() {
  return accessToken !== null;
}
export function registerSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const problem = (await response.json()) as Record<string, unknown>;
    return new ApiError(
      response.status,
      String(problem.code ?? "ERROR"),
      String(problem.title ?? "Request failed"),
      String(problem.detail ?? ""),
      (problem.errors as FieldError[]) ?? [],
      problem.trace_id as string | undefined,
      problem,
    );
  } catch {
    return new ApiError(response.status, "ERROR", "Request failed", response.statusText);
  }
}

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return false;
      setAccessToken(((await res.json()) as { access_token: string }).access_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, idempotencyKey, signal, skipRefresh } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: "include",
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "NETWORK_ERROR", "Service unavailable", "The server could not be reached. Please try again.");
  }

  if (response.status === 401 && !skipRefresh) {
    if (await refreshSession()) return apiRequest<T>(path, { ...options, skipRefresh: true });
    onSessionExpired?.();
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Runs a business command (POST /{resource}/{id}/{action}) under an idempotency key. */
export function postCommand<T>(path: string, body: unknown = {}, idempotencyKey: string = newIdempotencyKey()) {
  return apiRequest<T>(path, { method: "POST", body, idempotencyKey });
}

export interface ListParams {
  limit?: number;
  cursor?: string | null;
  search?: string;
  sort?: string;
  [filter: string]: QueryValue;
}

/** Read and master-data helpers shared by the service modules. */
export function resource<T>(path: string) {
  return {
    path,
    list: (params: ListParams = {}, signal?: AbortSignal) => apiRequest<Page<T>>(path, { query: params, signal }),
    get: (id: string, signal?: AbortSignal) => apiRequest<T>(`${path}/${id}`, { signal }),
    create: (body: unknown) => apiRequest<T>(path, { method: "POST", body }),
    update: (id: string, body: unknown) => apiRequest<T>(`${path}/${id}`, { method: "PATCH", body }),
    command: <R = T>(id: string, action: string, body: unknown = {}, key?: string) => postCommand<R>(`${path}/${id}/${action}`, body, key),
  };
}
