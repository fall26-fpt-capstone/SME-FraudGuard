import type {
  AuthApiErrorBody,
  AuthClientSession,
  AuthErrorCode,
  LoginRequestPayload,
  LogoutResult,
  PasswordChangePayload,
} from "@/types/auth";
import {
  buildLoginRequestPayload,
  parseSanitizedSessionAccount,
  toClientSession,
  validatePasswordChangeInput,
} from "@/utils/auth";

export const AUTH_COOKIE_NAME = "fg_access_token";
export const CSRF_HEADER_NAME = "x-fraudguard-csrf";
export const CSRF_HEADER_VALUE = "1";

const DEFAULT_LOCAL_BACKEND_URL = "http://127.0.0.1:8080";
const MAX_COOKIE_MAX_AGE_SECONDS = 3600;
const UPSTREAM_TIMEOUT_MS = 10000;

const UPSTREAM_PATHS = {
  login: "/api/v1/auth/login",
  session: "/api/v1/auth/session",
  "initial-password": "/api/v1/auth/initial-password",
  password: "/api/v1/auth/password",
  logout: "/api/v1/auth/logout",
} as const;

export type AuthBridgeAction = keyof typeof UPSTREAM_PATHS;

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: AuthErrorCode, status: number, detail?: string) {
    super(detail || code);
    this.name = "AuthServiceError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function isAuthBridgeAction(value: string): value is AuthBridgeAction {
  return Object.prototype.hasOwnProperty.call(UPSTREAM_PATHS, value);
}

/**
 * Resolves the trusted backend origin strictly from server environment configuration.
 * Never accepts URLs or hostnames from browser requests.
 */
export function resolveBackendBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.FRAUDGUARD_BACKEND_URL?.trim();
  const raw =
    configured && configured.length > 0
      ? configured
      : env.NODE_ENV === "production"
        ? ""
        : DEFAULT_LOCAL_BACKEND_URL;

  if (!raw) {
    throw new AuthServiceError(
      "BACKEND_UNAVAILABLE",
      503,
      "Backend origin is not configured.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AuthServiceError(
      "BACKEND_UNAVAILABLE",
      503,
      "Configured backend origin is invalid.",
    );
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new AuthServiceError(
      "BACKEND_UNAVAILABLE",
      503,
      "Configured backend origin contains unsupported components.",
    );
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

function isSafeBearerToken(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\r\n\0\s]/.test(value)
  );
}

export function extractAuthTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    const rawVal = part.slice(eqIndex + 1).trim();
    if (!rawVal) return null;
    try {
      const decoded = decodeURIComponent(rawVal);
      return isSafeBearerToken(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Reads the standard JWT `exp` timestamp only after the backend has verified the token.
 */
export function readVerifiedJwtExpiresAt(token: string): string | undefined {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return undefined;
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const jsonText =
      typeof Buffer !== "undefined"
        ? Buffer.from(padded, "base64").toString("utf8")
        : atob(padded);
    const payload = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp > 0) {
      return new Date(payload.exp * 1000).toISOString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function buildSessionCookieHeader(
  token: string,
  expiresAtIso: string | undefined,
  secure: boolean,
  nowMs: number = Date.now(),
): string {
  if (!isSafeBearerToken(token)) {
    return buildClearSessionCookieHeader(secure);
  }
  const parsedExpiry = expiresAtIso ? Date.parse(expiresAtIso) : NaN;
  const remainingSeconds = Number.isFinite(parsedExpiry)
    ? Math.floor((parsedExpiry - nowMs) / 1000)
    : 900;

  if (remainingSeconds <= 0) {
    return buildClearSessionCookieHeader(secure);
  }

  const maxAge = Math.min(remainingSeconds, MAX_COOKIE_MAX_AGE_SECONDS);
  const expiresDate = new Date(nowMs + maxAge * 1000).toUTCString();
  const attributes = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    `Max-Age=${maxAge}`,
    `Expires=${expiresDate}`,
  ];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function buildClearSessionCookieHeader(secure: boolean): string {
  const attributes = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function enterpriseKeyFromHost(host: string, base: string): string | null {
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  const suffix = "." + base.trim().toLowerCase();
  if (!base.trim() || !hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? label : null;
}

export function resolveExpectedOrigin(
  headers: Headers,
  requestUrl: string,
): { origin: string; secure: boolean } {
  const parsed = new URL(requestUrl);
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim() || parsed.host;
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? `${forwardedProto}:`
      : parsed.protocol;
  const secure = proto === "https:" || process.env.NODE_ENV === "production";
  return {
    origin: `${proto}//${host}`,
    secure,
  };
}

export function verifySameOriginMutation(
  headers: Headers,
  expectedOrigin: string,
): { ok: true } | { ok: false; detail: string } {
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { ok: false, detail: "Cross-site state-changing request rejected." };
  }

  if (headers.get(CSRF_HEADER_NAME) !== CSRF_HEADER_VALUE) {
    return { ok: false, detail: "Missing CSRF verification header." };
  }

  const originHeader = headers.get("origin")?.trim();
  const refererHeader = headers.get("referer")?.trim();
  let candidateOrigin = "";

  if (originHeader && originHeader !== "null") {
    try {
      candidateOrigin = new URL(originHeader).origin;
    } catch {
      return { ok: false, detail: "Malformed Origin header." };
    }
  } else if (refererHeader) {
    try {
      candidateOrigin = new URL(refererHeader).origin;
    } catch {
      return { ok: false, detail: "Malformed Referer header." };
    }
  }

  if (!candidateOrigin || candidateOrigin !== expectedOrigin) {
    return { ok: false, detail: "Request origin does not match application origin." };
  }

  return { ok: true };
}

export async function parseUpstreamJsonOrText(
  response: Response,
): Promise<{ json: Record<string, unknown> | null; detail?: string }> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return { json: null };
  }
  if (!raw.trim()) {
    return { json: null };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const detail =
        typeof record.detail === "string" && record.detail.trim()
          ? record.detail.trim()
          : typeof record.message === "string" && record.message.trim()
            ? record.message.trim()
            : typeof record.error === "string" && record.error.trim()
              ? record.error.trim()
              : undefined;
      return { json: record, detail };
    }
  } catch {
    // Non-JSON upstream error body; never echo raw HTML or stack traces.
  }
  return { json: null };
}

export async function callUpstream(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    throw new AuthServiceError(
      "BACKEND_UNAVAILABLE",
      503,
      "Authentication service could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface BridgeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly setCookie?: string;
}

function errorResult(
  status: number,
  errorCode: AuthErrorCode,
  detail?: string,
  setCookie?: string,
): BridgeResult {
  const body: AuthApiErrorBody = {
    errorCode,
    status,
    ...(detail ? { detail } : {}),
  };
  return {
    status,
    body: body as unknown as Record<string, unknown>,
    ...(setCookie ? { setCookie } : {}),
  };
}

export interface HandleAuthBridgeOptions {
  readonly method: string;
  readonly action: string;
  readonly requestUrl: string;
  readonly headers: Headers;
  readonly readBodyText: () => Promise<string>;
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: number;
}

export async function handleAuthBridgeRequest(
  options: HandleAuthBridgeOptions,
): Promise<BridgeResult> {
  const { method, action, requestUrl, headers, readBodyText } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();

  if (!isAuthBridgeAction(action)) {
    return errorResult(404, "UPSTREAM_ERROR", "Unknown authentication route.");
  }

  const { origin: expectedOrigin, secure } = resolveExpectedOrigin(headers, requestUrl);
  const token = extractAuthTokenFromCookieHeader(headers.get("cookie"));

  if (action === "session") {
    if (method !== "GET") {
      return errorResult(405, "VALIDATION_ERROR", "Method not allowed.");
    }
    if (!token) {
      return errorResult(401, "UNAUTHENTICATED");
    }

    let baseUrl: string;
    try {
      baseUrl = resolveBackendBaseUrl(env);
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return errorResult(err.status, err.code, err.detail);
      }
      return errorResult(503, "BACKEND_UNAVAILABLE");
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await callUpstream(
        baseUrl,
        UPSTREAM_PATHS.session,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
        fetchImpl,
      );
    } catch (err) {
      const code = err instanceof AuthServiceError ? err.code : "BACKEND_UNAVAILABLE";
      return errorResult(503, code);
    }

    const parsed = await parseUpstreamJsonOrText(upstreamRes);
    if (upstreamRes.status === 401) {
      return errorResult(
        401,
        "SESSION_EXPIRED",
        undefined,
        buildClearSessionCookieHeader(secure),
      );
    }
    if (upstreamRes.status === 403) {
      return errorResult(403, "FORBIDDEN_FLOW", parsed.detail);
    }
    if (!upstreamRes.ok) {
      return errorResult(
        upstreamRes.status >= 500 ? 502 : upstreamRes.status,
        upstreamRes.status >= 500 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
      );
    }

    const account = parseSanitizedSessionAccount(parsed.json);
    const clientSession = account
      ? toClientSession(account, readVerifiedJwtExpiresAt(token))
      : null;
    if (!clientSession) {
      return errorResult(502, "UPSTREAM_ERROR", "Invalid session response format.");
    }

    return {
      status: 200,
      body: {
        account: clientSession.account,
        ...(clientSession.expiresAt ? { expiresAt: clientSession.expiresAt } : {}),
      },
    };
  }

  if (method !== "POST") {
    return errorResult(405, "VALIDATION_ERROR", "Method not allowed.");
  }

  const csrfCheck = verifySameOriginMutation(headers, expectedOrigin);
  if (!csrfCheck.ok) {
    return errorResult(403, "CSRF_REJECTED", csrfCheck.detail);
  }

  if (action === "logout") {
    const clearCookie = buildClearSessionCookieHeader(secure);
    if (!token) {
      const body: LogoutResult = {
        localCleared: true,
        serverRevoked: false,
        reason: "NO_ACTIVE_TOKEN",
      };
      return {
        status: 200,
        body: body as unknown as Record<string, unknown>,
        setCookie: clearCookie,
      };
    }

    let baseUrl: string;
    try {
      baseUrl = resolveBackendBaseUrl(env);
    } catch {
      const body: LogoutResult = {
        localCleared: true,
        serverRevoked: false,
        reason: "BACKEND_UNAVAILABLE",
      };
      return {
        status: 200,
        body: body as unknown as Record<string, unknown>,
        setCookie: clearCookie,
      };
    }

    try {
      const upstreamRes = await callUpstream(
        baseUrl,
        UPSTREAM_PATHS.logout,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        fetchImpl,
      );
      if (upstreamRes.status === 204) {
        const body: LogoutResult = {
          localCleared: true,
          serverRevoked: true,
          reason: "REVOKED",
        };
        return {
          status: 200,
          body: body as unknown as Record<string, unknown>,
          setCookie: clearCookie,
        };
      }
      if (upstreamRes.status === 401) {
        const body: LogoutResult = {
          localCleared: true,
          serverRevoked: false,
          reason: "TOKEN_EXPIRED_OR_INVALID",
        };
        return {
          status: 200,
          body: body as unknown as Record<string, unknown>,
          setCookie: clearCookie,
        };
      }
      const body: LogoutResult = {
        localCleared: true,
        serverRevoked: false,
        reason: upstreamRes.status >= 500 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
      };
      return {
        status: 200,
        body: body as unknown as Record<string, unknown>,
        setCookie: clearCookie,
      };
    } catch {
      const body: LogoutResult = {
        localCleared: true,
        serverRevoked: false,
        reason: "BACKEND_UNAVAILABLE",
      };
      return {
        status: 200,
        body: body as unknown as Record<string, unknown>,
        setCookie: clearCookie,
      };
    }
  }

  const contentType = headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResult(400, "VALIDATION_ERROR", "JSON request body is required.");
  }

  let parsedBody: Record<string, unknown>;
  try {
    const rawText = await readBodyText();
    const candidate: unknown = rawText ? JSON.parse(rawText) : null;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return errorResult(400, "VALIDATION_ERROR", "Invalid JSON payload.");
    }
    parsedBody = candidate as Record<string, unknown>;
  } catch {
    return errorResult(400, "VALIDATION_ERROR", "Malformed JSON payload.");
  }

  let baseUrl: string;
  try {
    baseUrl = resolveBackendBaseUrl(env);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return errorResult(err.status, err.code, err.detail);
    }
    return errorResult(503, "BACKEND_UNAVAILABLE");
  }

  if (action === "login") {
    if ("workspaceId" in parsedBody || "workspaceKey" in parsedBody) {
      return errorResult(400, "VALIDATION_ERROR", "Workspace is determined by the enterprise address.");
    }
    const validated = buildLoginRequestPayload({
      loginName: typeof parsedBody.loginName === "string" ? parsedBody.loginName : "",
      password: typeof parsedBody.password === "string" ? parsedBody.password : "",
      portal: parsedBody.portal as LoginRequestPayload["portal"],
    });
    if (!validated.ok) {
      return errorResult(400, "VALIDATION_ERROR", validated.code);
    }

    let workspaceKey: string | null = null;
    if (validated.payload.portal === "ENTERPRISE") {
      const base = env.FRAUDGUARD_ENTERPRISE_DOMAIN ?? (env.NODE_ENV === "production" ? "" : "localhost");
      const host = headers.get("host") ?? new URL(requestUrl).host;
      workspaceKey = enterpriseKeyFromHost(host, base);
      if (!workspaceKey) return errorResult(400, "VALIDATION_ERROR", "ENTERPRISE_ADDRESS_REQUIRED");
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await callUpstream(
        baseUrl,
        UPSTREAM_PATHS.login,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...validated.payload, workspaceKey }),
        },
        fetchImpl,
      );
    } catch {
      return errorResult(503, "BACKEND_UNAVAILABLE");
    }

    const upstreamParsed = await parseUpstreamJsonOrText(upstreamRes);
    if (upstreamRes.status === 401) {
      return errorResult(401, "INVALID_CREDENTIALS");
    }
    if (upstreamRes.status === 400) {
      return errorResult(400, "VALIDATION_ERROR", upstreamParsed.detail);
    }
    if (upstreamRes.status === 403) {
      return errorResult(403, "FORBIDDEN_FLOW", upstreamParsed.detail);
    }
    if (!upstreamRes.ok) {
      return errorResult(
        upstreamRes.status >= 500 ? 502 : upstreamRes.status,
        upstreamRes.status >= 500 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
      );
    }

    const rawToken =
      typeof upstreamParsed.json?.accessToken === "string"
        ? upstreamParsed.json.accessToken
        : "";
    const rawTokenType =
      typeof upstreamParsed.json?.tokenType === "string"
        ? upstreamParsed.json.tokenType
        : "";
    const rawExpiresAt =
      typeof upstreamParsed.json?.expiresAt === "string"
        ? upstreamParsed.json.expiresAt
        : undefined;
    const account = parseSanitizedSessionAccount(upstreamParsed.json?.account);
    const clientSession = account ? toClientSession(account, rawExpiresAt) : null;

    if (
      !isSafeBearerToken(rawToken) ||
      rawTokenType.toLowerCase() !== "bearer" ||
      !clientSession ||
      !clientSession.expiresAt
    ) {
      return errorResult(502, "UPSTREAM_ERROR", "Malformed login response from backend.");
    }

    const cookieHeader = buildSessionCookieHeader(
      rawToken,
      clientSession.expiresAt,
      secure,
      nowMs,
    );

    return {
      status: 200,
      body: {
        account: clientSession.account,
        expiresAt: clientSession.expiresAt,
      },
      setCookie: cookieHeader,
    };
  }

  // action === "initial-password" || action === "password"
  if (!token) {
    return errorResult(401, "UNAUTHENTICATED");
  }

  const validatedPassword = validatePasswordChangeInput({
    currentPassword:
      typeof parsedBody.currentPassword === "string" ? parsedBody.currentPassword : "",
    newPassword:
      typeof parsedBody.newPassword === "string" ? parsedBody.newPassword : "",
    confirmation:
      typeof parsedBody.confirmation === "string" ? parsedBody.confirmation : "",
  });
  if (!validatedPassword.ok) {
    return errorResult(400, "VALIDATION_ERROR", validatedPassword.code);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await callUpstream(
      baseUrl,
      UPSTREAM_PATHS[action],
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validatedPassword.payload),
      },
      fetchImpl,
    );
  } catch {
    return errorResult(503, "BACKEND_UNAVAILABLE");
  }

  const upstreamParsed = await parseUpstreamJsonOrText(upstreamRes);

  if (upstreamRes.status === 401) {
    // Distinguish wrong currentPassword (session still active) from expired/revoked JWT.
    const wwwAuth = upstreamRes.headers.get("www-authenticate") ?? "";
    if (/invalid_token/i.test(wwwAuth)) {
      return errorResult(
        401,
        "SESSION_EXPIRED",
        undefined,
        buildClearSessionCookieHeader(secure),
      );
    }

    try {
      const probeRes = await callUpstream(
        baseUrl,
        UPSTREAM_PATHS.session,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
        fetchImpl,
      );
      if (probeRes.ok) {
        return errorResult(401, "INVALID_CURRENT_PASSWORD");
      }
      if (probeRes.status === 401) {
        return errorResult(
          401,
          "SESSION_EXPIRED",
          undefined,
          buildClearSessionCookieHeader(secure),
        );
      }
    } catch {
      return errorResult(503, "BACKEND_UNAVAILABLE");
    }

    return errorResult(401, "INVALID_CURRENT_PASSWORD");
  }

  if (upstreamRes.status === 403) {
    return errorResult(403, "FORBIDDEN_FLOW", upstreamParsed.detail);
  }
  if (upstreamRes.status === 400) {
    return errorResult(400, "VALIDATION_ERROR", upstreamParsed.detail);
  }
  if (upstreamRes.status === 409) {
    return errorResult(409, "CONFLICT", upstreamParsed.detail);
  }
  if (!upstreamRes.ok) {
    return errorResult(
      upstreamRes.status >= 500 ? 502 : upstreamRes.status,
      upstreamRes.status >= 500 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
    );
  }

  const updatedAccount = parseSanitizedSessionAccount(upstreamParsed.json);
  const updatedSession = updatedAccount
    ? toClientSession(updatedAccount, readVerifiedJwtExpiresAt(token))
    : null;
  if (!updatedSession) {
    return errorResult(502, "UPSTREAM_ERROR", "Malformed password change response.");
  }

  return {
    status: 200,
    body: {
      account: updatedSession.account,
      ...(updatedSession.expiresAt ? { expiresAt: updatedSession.expiresAt } : {}),
    },
  };
}

export type ServerSessionResolution =
  | { readonly status: "authenticated"; readonly session: AuthClientSession }
  | { readonly status: "unauthenticated" }
  | { readonly status: "session_expired" }
  | { readonly status: "backend_unavailable" };

export async function resolveServerSessionFromToken(
  token: string | null | undefined,
  options?: {
    readonly env?: Record<string, string | undefined>;
    readonly fetchImpl?: typeof fetch;
  },
): Promise<ServerSessionResolution> {
  if (!token || !isSafeBearerToken(token)) {
    return { status: "unauthenticated" };
  }

  let baseUrl: string;
  try {
    baseUrl = resolveBackendBaseUrl(options?.env ?? process.env);
  } catch {
    return { status: "backend_unavailable" };
  }

  let res: Response;
  try {
    res = await callUpstream(
      baseUrl,
      UPSTREAM_PATHS.session,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      options?.fetchImpl ?? fetch,
    );
  } catch {
    return { status: "backend_unavailable" };
  }

  if (res.status === 401) {
    return { status: "session_expired" };
  }
  if (!res.ok) {
    return { status: "backend_unavailable" };
  }

  const parsed = await parseUpstreamJsonOrText(res);
  const account = parseSanitizedSessionAccount(parsed.json);
  const session = account
    ? toClientSession(account, readVerifiedJwtExpiresAt(token))
    : null;
  if (!session) {
    return { status: "backend_unavailable" };
  }

  return { status: "authenticated", session };
}

/* Browser client calls (same-origin Next.js BFF only) */

async function parseBridgeResponse(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function throwBridgeFailure(
  response: Response,
  data: Record<string, unknown> | null,
): never {
  const errorCode =
    typeof data?.errorCode === "string"
      ? (data.errorCode as AuthErrorCode)
      : response.status === 401
        ? "UNAUTHENTICATED"
        : response.status === 403
          ? "FORBIDDEN_FLOW"
          : response.status === 400
            ? "VALIDATION_ERROR"
            : response.status === 409
              ? "CONFLICT"
              : response.status === 503
                ? "BACKEND_UNAVAILABLE"
                : "UPSTREAM_ERROR";
  const detail = typeof data?.detail === "string" ? data.detail : undefined;
  throw new AuthServiceError(errorCode, response.status, detail);
}

function parseClientSessionPayload(
  data: Record<string, unknown> | null,
): AuthClientSession {
  const account = parseSanitizedSessionAccount(data?.account);
  const expiresAt = typeof data?.expiresAt === "string" ? data.expiresAt : undefined;
  const session = account ? toClientSession(account, expiresAt) : null;
  if (!session) {
    throw new AuthServiceError("UPSTREAM_ERROR", 502, "Invalid session payload.");
  }
  return session;
}

export async function loginWithCredentials(
  payload: LoginRequestPayload,
  options?: { readonly signal?: AbortSignal; readonly fetchImpl?: typeof fetch },
): Promise<AuthClientSession> {
  const fetchFn = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new AuthServiceError("BACKEND_UNAVAILABLE", 503);
  }

  const data = await parseBridgeResponse(response);
  if (!response.ok) {
    throwBridgeFailure(response, data);
  }
  return parseClientSessionPayload(data);
}

export async function fetchCurrentSession(options?: {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<AuthClientSession> {
  const fetchFn = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new AuthServiceError("BACKEND_UNAVAILABLE", 503);
  }

  const data = await parseBridgeResponse(response);
  if (!response.ok) {
    throwBridgeFailure(response, data);
  }
  return parseClientSessionPayload(data);
}

export async function submitInitialPassword(
  payload: PasswordChangePayload,
  options?: { readonly signal?: AbortSignal; readonly fetchImpl?: typeof fetch },
): Promise<AuthClientSession> {
  const fetchFn = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/api/auth/initial-password", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new AuthServiceError("BACKEND_UNAVAILABLE", 503);
  }

  const data = await parseBridgeResponse(response);
  if (!response.ok) {
    throwBridgeFailure(response, data);
  }
  return parseClientSessionPayload(data);
}

export async function changeCurrentPassword(
  payload: PasswordChangePayload,
  options?: { readonly signal?: AbortSignal; readonly fetchImpl?: typeof fetch },
): Promise<AuthClientSession> {
  const fetchFn = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/api/auth/password", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new AuthServiceError("BACKEND_UNAVAILABLE", 503);
  }

  const data = await parseBridgeResponse(response);
  if (!response.ok) {
    throwBridgeFailure(response, data);
  }
  return parseClientSessionPayload(data);
}

export async function logoutCurrentSession(options?: {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<LogoutResult> {
  const fetchFn = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      signal: options?.signal,
    });
    const data = await parseBridgeResponse(response);
    if (response.ok && data && data.localCleared === true) {
      return {
        localCleared: true,
        serverRevoked: data.serverRevoked === true,
        reason:
          typeof data.reason === "string"
            ? (data.reason as LogoutResult["reason"])
            : data.serverRevoked === true
              ? "REVOKED"
              : "UPSTREAM_ERROR",
      };
    }
    return {
      localCleared: true,
      serverRevoked: false,
      reason: response.status === 503 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    return {
      localCleared: true,
      serverRevoked: false,
      reason: "BACKEND_UNAVAILABLE",
    };
  }
}
