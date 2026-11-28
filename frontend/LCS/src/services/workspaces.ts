import type {
  NormalizedWorkspaceListQuery,
  WorkspaceApiErrorBody,
  WorkspaceConflictReason,
  WorkspaceDirectoryItem,
  WorkspaceErrorCode,
  WorkspaceListQuery,
  WorkspaceMetadataUpdatePayload,
  WorkspacePageResponse,
} from "@/types/workspace";
import {
  AuthServiceError,
  type BridgeResult,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  buildClearSessionCookieHeader,
  callUpstream,
  extractAuthTokenFromCookieHeader,
  parseUpstreamJsonOrText,
  resolveBackendBaseUrl,
  resolveExpectedOrigin,
  verifySameOriginMutation,
} from "@/services/auth";

export const WORKSPACES_UPSTREAM_PATH = "/api/v1/workspaces";
export const DEFAULT_WORKSPACE_PAGE_SIZE = 20;
export const MAX_WORKSPACE_PAGE_SIZE = 100;
export const MAX_WORKSPACE_SEARCH_LENGTH = 100;
export const MAX_ENTERPRISE_NAME_LENGTH = 255;
export const MAX_CONTACT_NAME_LENGTH = 120;
export const MAX_CONTACT_EMAIL_LENGTH = 254;
export const MAX_CONTACT_PHONE_LENGTH = 40;
const MAX_SIGNED_32BIT_OFFSET = 2147483647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_METADATA_KEYS = new Set([
  "version",
  "enterpriseName",
  "contactName",
  "contactEmail",
  "contactPhone",
]);

export class WorkspaceServiceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: WorkspaceErrorCode, status: number, detail?: string) {
    super(detail || code);
    this.name = "WorkspaceServiceError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function classifyWorkspaceConflict(
  detail?: string,
): WorkspaceConflictReason {
  if (!detail) {
    return "UNKNOWN";
  }
  const normalized = detail.trim().toLowerCase();
  if (
    normalized.includes("record changed") ||
    normalized.includes("reload before saving") ||
    normalized.includes("concurrent change")
  ) {
    return "STALE_VERSION";
  }
  if (
    normalized.includes("enterprise name already exists") ||
    normalized.includes("data conflicts with an existing record")
  ) {
    return "DUPLICATE_NAME";
  }
  return "UNKNOWN";
}

export function validateWorkspaceId(rawId: unknown): string | null {
  if (typeof rawId !== "string") {
    return null;
  }
  const trimmed = rawId.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export type WorkspaceMetadataField =
  | "version"
  | "enterpriseName"
  | "contactName"
  | "contactEmail"
  | "contactPhone";

export type WorkspaceMetadataValidationCode =
  | "INVALID_VERSION"
  | "ENTERPRISE_NAME_REQUIRED"
  | "ENTERPRISE_NAME_TOO_LONG"
  | "CONTACT_NAME_REQUIRED"
  | "CONTACT_NAME_TOO_LONG"
  | "CONTACT_EMAIL_REQUIRED"
  | "CONTACT_EMAIL_TOO_LONG"
  | "CONTACT_EMAIL_INVALID"
  | "CONTACT_PHONE_TOO_LONG";

export type WorkspaceMetadataValidationResult =
  | { readonly ok: true; readonly payload: WorkspaceMetadataUpdatePayload }
  | {
      readonly ok: false;
      readonly field: WorkspaceMetadataField;
      readonly code: WorkspaceMetadataValidationCode;
      readonly fieldErrors: Partial<
        Record<WorkspaceMetadataField, WorkspaceMetadataValidationCode>
      >;
    };

export function validateWorkspaceMetadataInput(input: {
  readonly version: unknown;
  readonly enterpriseName: unknown;
  readonly contactName: unknown;
  readonly contactEmail: unknown;
  readonly contactPhone?: unknown;
}): WorkspaceMetadataValidationResult {
  const fieldErrors: Partial<
    Record<WorkspaceMetadataField, WorkspaceMetadataValidationCode>
  > = {};

  const version = input.version;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0
  ) {
    fieldErrors.version = "INVALID_VERSION";
  }

  const enterpriseName =
    typeof input.enterpriseName === "string" ? input.enterpriseName.trim() : "";
  if (!enterpriseName) {
    fieldErrors.enterpriseName = "ENTERPRISE_NAME_REQUIRED";
  } else if (enterpriseName.length > MAX_ENTERPRISE_NAME_LENGTH) {
    fieldErrors.enterpriseName = "ENTERPRISE_NAME_TOO_LONG";
  }

  const contactName =
    typeof input.contactName === "string" ? input.contactName.trim() : "";
  if (!contactName) {
    fieldErrors.contactName = "CONTACT_NAME_REQUIRED";
  } else if (contactName.length > MAX_CONTACT_NAME_LENGTH) {
    fieldErrors.contactName = "CONTACT_NAME_TOO_LONG";
  }

  const contactEmail =
    typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
  if (!contactEmail) {
    fieldErrors.contactEmail = "CONTACT_EMAIL_REQUIRED";
  } else if (contactEmail.length > MAX_CONTACT_EMAIL_LENGTH) {
    fieldErrors.contactEmail = "CONTACT_EMAIL_TOO_LONG";
  } else if (
    !EMAIL_PATTERN.test(contactEmail) ||
    contactEmail.includes("..") ||
    contactEmail.endsWith(".")
  ) {
    fieldErrors.contactEmail = "CONTACT_EMAIL_INVALID";
  }

  let contactPhone: string | null = null;
  if (input.contactPhone !== null && input.contactPhone !== undefined) {
    if (typeof input.contactPhone !== "string") {
      fieldErrors.contactPhone = "CONTACT_PHONE_TOO_LONG";
    } else {
      const trimmedPhone = input.contactPhone.trim();
      if (trimmedPhone.length > MAX_CONTACT_PHONE_LENGTH) {
        fieldErrors.contactPhone = "CONTACT_PHONE_TOO_LONG";
      } else {
        contactPhone = trimmedPhone.length > 0 ? trimmedPhone : null;
      }
    }
  }

  const firstFailedField = (
    [
      "version",
      "enterpriseName",
      "contactName",
      "contactEmail",
      "contactPhone",
    ] as const
  ).find((key) => fieldErrors[key] !== undefined);

  if (firstFailedField) {
    return {
      ok: false,
      field: firstFailedField,
      code: fieldErrors[firstFailedField]!,
      fieldErrors,
    };
  }

  return {
    ok: true,
    payload: {
      version: version as number,
      enterpriseName,
      contactName,
      contactEmail,
      contactPhone,
    },
  };
}

export type WorkspaceQueryValidationResult =
  | { readonly ok: true; readonly query: NormalizedWorkspaceListQuery }
  | { readonly ok: false; readonly detail: string };

export function validateWorkspaceListQuery(input: {
  readonly search?: string | null;
  readonly page?: string | number | null;
  readonly size?: string | number | null;
}): WorkspaceQueryValidationResult {
  const rawSearch = input.search == null ? "" : String(input.search);
  if (rawSearch.length > MAX_WORKSPACE_SEARCH_LENGTH) {
    return { ok: false, detail: "SEARCH_TOO_LONG" };
  }
  const search = rawSearch.trim();
  if (search.length > MAX_WORKSPACE_SEARCH_LENGTH) {
    return { ok: false, detail: "SEARCH_TOO_LONG" };
  }

  let page = 0;
  if (input.page !== undefined && input.page !== null && input.page !== "") {
    if (typeof input.page === "number") {
      if (!Number.isInteger(input.page)) {
        return { ok: false, detail: "INVALID_PAGE" };
      }
      page = input.page;
    } else if (/^\d+$/.test(input.page)) {
      page = Number(input.page);
    } else {
      return { ok: false, detail: "INVALID_PAGE" };
    }
  }

  let size = DEFAULT_WORKSPACE_PAGE_SIZE;
  if (input.size !== undefined && input.size !== null && input.size !== "") {
    if (typeof input.size === "number") {
      if (!Number.isInteger(input.size)) {
        return { ok: false, detail: "INVALID_SIZE" };
      }
      size = input.size;
    } else if (/^\d+$/.test(input.size)) {
      size = Number(input.size);
    } else {
      return { ok: false, detail: "INVALID_SIZE" };
    }
  }

  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > MAX_SIGNED_32BIT_OFFSET ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_WORKSPACE_PAGE_SIZE ||
    page * size > MAX_SIGNED_32BIT_OFFSET
  ) {
    return { ok: false, detail: "INVALID_PAGINATION" };
  }

  return {
    ok: true,
    query: {
      search,
      page,
      size,
    },
  };
}

export function buildWorkspaceQueryParams(
  query: NormalizedWorkspaceListQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search.length > 0) {
    params.set("search", query.search);
  }
  params.set("page", String(query.page));
  params.set("size", String(query.size));
  return params;
}

export function buildWorkspaceUpstreamPath(
  query: NormalizedWorkspaceListQuery,
): string {
  const qs = buildWorkspaceQueryParams(query).toString();
  return `${WORKSPACES_UPSTREAM_PATH}?${qs}`;
}

export function buildWorkspaceDetailUpstreamPath(workspaceId: string): string {
  const validId = validateWorkspaceId(workspaceId);
  if (!validId) {
    throw new WorkspaceServiceError(
      "VALIDATION_ERROR",
      400,
      "INVALID_WORKSPACE_ID",
    );
  }
  return `${WORKSPACES_UPSTREAM_PATH}/${encodeURIComponent(validId)}`;
}

export function parseWorkspaceDirectoryItem(
  value: unknown,
): WorkspaceDirectoryItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const workspaceKey =
    typeof record.workspaceKey === "string" ? record.workspaceKey.trim() : "";
  const enterpriseName =
    typeof record.enterpriseName === "string" ? record.enterpriseName.trim() : "";
  const contactName =
    typeof record.contactName === "string" ? record.contactName.trim() : "";
  const contactEmail =
    typeof record.contactEmail === "string" ? record.contactEmail.trim() : "";
  const rawPhone = record.contactPhone;
  const contactPhone =
    typeof rawPhone === "string" && rawPhone.trim().length > 0
      ? rawPhone.trim()
      : rawPhone === null || rawPhone === undefined || rawPhone === ""
        ? null
        : null;
  const version = record.version;
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt.trim() : "";
  const updatedAt =
    typeof record.updatedAt === "string" ? record.updatedAt.trim() : "";

  if (
    !UUID_PATTERN.test(id) ||
    !workspaceKey ||
    workspaceKey.length > 64 ||
    !enterpriseName ||
    (rawPhone !== null &&
      rawPhone !== undefined &&
      typeof rawPhone !== "string") ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0 ||
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }

  return {
    id,
    workspaceKey,
    enterpriseName,
    contactName,
    contactEmail,
    contactPhone,
    version,
    createdAt,
    updatedAt,
  };
}

export function parseWorkspacePagePayload(
  value: unknown,
): WorkspacePageResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    return null;
  }

  const page = record.page;
  const size = record.size;
  const totalElements = record.totalElements;
  const totalPages = record.totalPages;

  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 0 ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_WORKSPACE_PAGE_SIZE ||
    typeof totalElements !== "number" ||
    !Number.isInteger(totalElements) ||
    totalElements < 0 ||
    typeof totalPages !== "number" ||
    !Number.isInteger(totalPages) ||
    totalPages < 0
  ) {
    return null;
  }

  const items: WorkspaceDirectoryItem[] = [];
  for (const rawItem of record.items) {
    const parsedItem = parseWorkspaceDirectoryItem(rawItem);
    if (!parsedItem) {
      return null;
    }
    items.push(parsedItem);
  }

  return {
    items,
    page,
    size,
    totalElements,
    totalPages,
  };
}

function workspaceErrorResult(
  status: number,
  errorCode: WorkspaceErrorCode,
  detail?: string,
  setCookie?: string,
): BridgeResult {
  const body: WorkspaceApiErrorBody = {
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

function mapUpstreamWorkspaceError(
  status: number,
  detail: string | undefined,
  secure: boolean,
): BridgeResult {
  if (status === 401) {
    return workspaceErrorResult(
      401,
      "SESSION_EXPIRED",
      undefined,
      buildClearSessionCookieHeader(secure),
    );
  }
  if (status === 403) {
    return workspaceErrorResult(403, "FORBIDDEN", detail);
  }
  if (status === 404) {
    return workspaceErrorResult(404, "NOT_FOUND", detail);
  }
  if (status === 409) {
    return workspaceErrorResult(409, "CONFLICT", detail);
  }
  if (status === 400) {
    return workspaceErrorResult(400, "VALIDATION_ERROR", detail);
  }
  return workspaceErrorResult(
    status >= 500 ? 502 : status,
    status >= 500 ? "BACKEND_UNAVAILABLE" : "UPSTREAM_ERROR",
  );
}

export interface HandleWorkspaceBridgeOptions {
  readonly method: string;
  readonly requestUrl: string;
  readonly headers: Headers;
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
}

export interface HandleWorkspaceDetailBridgeOptions
  extends HandleWorkspaceBridgeOptions {
  readonly workspaceId: string;
}

export interface HandleWorkspaceUpdateBridgeOptions
  extends HandleWorkspaceDetailBridgeOptions {
  readonly readBodyText: () => Promise<string>;
}

async function executeAuthenticatedWorkspaceUpstreamGet(
  options: HandleWorkspaceBridgeOptions,
  resolveUpstreamPath: (parsedUrl: URL) =>
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly detail: string },
  parseSuccessBody: (
    json: Record<string, unknown> | null,
  ) => Record<string, unknown> | null,
  invalidFormatMessage: string,
): Promise<BridgeResult> {
  const { method, requestUrl, headers } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  if (method !== "GET") {
    return workspaceErrorResult(405, "VALIDATION_ERROR", "Method not allowed.");
  }

  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return workspaceErrorResult(403, "FORBIDDEN", "Cross-site request rejected.");
  }

  const { secure } = resolveExpectedOrigin(headers, requestUrl);
  const token = extractAuthTokenFromCookieHeader(headers.get("cookie"));
  if (!token) {
    return workspaceErrorResult(401, "UNAUTHENTICATED");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return workspaceErrorResult(400, "VALIDATION_ERROR", "Invalid request URL.");
  }

  const target = resolveUpstreamPath(parsedUrl);
  if (!target.ok) {
    return workspaceErrorResult(400, "VALIDATION_ERROR", target.detail);
  }

  let baseUrl: string;
  try {
    baseUrl = resolveBackendBaseUrl(env);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return workspaceErrorResult(503, "BACKEND_UNAVAILABLE", err.detail);
    }
    return workspaceErrorResult(503, "BACKEND_UNAVAILABLE");
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await callUpstream(
      baseUrl,
      target.path,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      fetchImpl,
    );
  } catch {
    return workspaceErrorResult(503, "BACKEND_UNAVAILABLE");
  }

  const parsedUpstream = await parseUpstreamJsonOrText(upstreamRes);
  if (!upstreamRes.ok) {
    return mapUpstreamWorkspaceError(
      upstreamRes.status,
      parsedUpstream.detail,
      secure,
    );
  }

  const sanitizedBody = parseSuccessBody(parsedUpstream.json);
  if (!sanitizedBody) {
    return workspaceErrorResult(502, "UPSTREAM_ERROR", invalidFormatMessage);
  }

  return {
    status: 200,
    body: sanitizedBody,
  };
}

export async function handleWorkspaceListBridgeRequest(
  options: HandleWorkspaceBridgeOptions,
): Promise<BridgeResult> {
  return executeAuthenticatedWorkspaceUpstreamGet(
    options,
    (parsedUrl) => {
      const validated = validateWorkspaceListQuery({
        search: parsedUrl.searchParams.get("search"),
        page: parsedUrl.searchParams.get("page"),
        size: parsedUrl.searchParams.get("size"),
      });
      if (!validated.ok) {
        return { ok: false, detail: validated.detail };
      }
      return {
        ok: true,
        path: buildWorkspaceUpstreamPath(validated.query),
      };
    },
    (json) => {
      const page = parseWorkspacePagePayload(json);
      return page ? (page as unknown as Record<string, unknown>) : null;
    },
    "Invalid workspace list response format.",
  );
}

export async function handleWorkspaceDetailBridgeRequest(
  options: HandleWorkspaceDetailBridgeOptions,
): Promise<BridgeResult> {
  return executeAuthenticatedWorkspaceUpstreamGet(
    options,
    () => {
      const validId = validateWorkspaceId(options.workspaceId);
      if (!validId) {
        return { ok: false, detail: "INVALID_WORKSPACE_ID" };
      }
      return {
        ok: true,
        path: buildWorkspaceDetailUpstreamPath(validId),
      };
    },
    (json) => {
      const item = parseWorkspaceDirectoryItem(json);
      return item ? (item as unknown as Record<string, unknown>) : null;
    },
    "Invalid workspace detail response format.",
  );
}

export async function handleWorkspaceUpdateBridgeRequest(
  options: HandleWorkspaceUpdateBridgeOptions,
): Promise<BridgeResult> {
  const { method, workspaceId, requestUrl, headers, readBodyText } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  if (method !== "PUT") {
    return workspaceErrorResult(405, "VALIDATION_ERROR", "Method not allowed.");
  }

  const { origin: expectedOrigin, secure } = resolveExpectedOrigin(
    headers,
    requestUrl,
  );
  const csrfCheck = verifySameOriginMutation(headers, expectedOrigin);
  if (!csrfCheck.ok) {
    return workspaceErrorResult(403, "CSRF_REJECTED", csrfCheck.detail);
  }

  const token = extractAuthTokenFromCookieHeader(headers.get("cookie"));
  if (!token) {
    return workspaceErrorResult(401, "UNAUTHENTICATED");
  }

  const validId = validateWorkspaceId(workspaceId);
  if (!validId) {
    return workspaceErrorResult(400, "VALIDATION_ERROR", "INVALID_WORKSPACE_ID");
  }

  const contentType = headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return workspaceErrorResult(
      400,
      "VALIDATION_ERROR",
      "JSON request body is required.",
    );
  }

  let parsedBody: Record<string, unknown>;
  try {
    const rawText = await readBodyText();
    const candidate: unknown = rawText ? JSON.parse(rawText) : null;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return workspaceErrorResult(
        400,
        "VALIDATION_ERROR",
        "Invalid JSON payload.",
      );
    }
    parsedBody = candidate as Record<string, unknown>;
  } catch {
    return workspaceErrorResult(
      400,
      "VALIDATION_ERROR",
      "Malformed JSON payload.",
    );
  }

  for (const key of Object.keys(parsedBody)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) {
      return workspaceErrorResult(
        400,
        "VALIDATION_ERROR",
        "UNKNOWN_METADATA_PROPERTY",
      );
    }
  }

  const validated = validateWorkspaceMetadataInput({
    version: parsedBody.version,
    enterpriseName: parsedBody.enterpriseName,
    contactName: parsedBody.contactName,
    contactEmail: parsedBody.contactEmail,
    contactPhone: parsedBody.contactPhone,
  });
  if (!validated.ok) {
    return workspaceErrorResult(400, "VALIDATION_ERROR", validated.code);
  }

  let baseUrl: string;
  try {
    baseUrl = resolveBackendBaseUrl(env);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return workspaceErrorResult(503, "BACKEND_UNAVAILABLE", err.detail);
    }
    return workspaceErrorResult(503, "BACKEND_UNAVAILABLE");
  }

  const upstreamPath = buildWorkspaceDetailUpstreamPath(validId);
  let upstreamRes: Response;
  try {
    upstreamRes = await callUpstream(
      baseUrl,
      upstreamPath,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          version: validated.payload.version,
          enterpriseName: validated.payload.enterpriseName,
          contactName: validated.payload.contactName,
          contactEmail: validated.payload.contactEmail,
          contactPhone: validated.payload.contactPhone,
        }),
      },
      fetchImpl,
    );
  } catch {
    return workspaceErrorResult(503, "BACKEND_UNAVAILABLE");
  }

  const parsedUpstream = await parseUpstreamJsonOrText(upstreamRes);
  if (!upstreamRes.ok) {
    return mapUpstreamWorkspaceError(
      upstreamRes.status,
      parsedUpstream.detail,
      secure,
    );
  }

  const sanitizedItem = parseWorkspaceDirectoryItem(parsedUpstream.json);
  if (!sanitizedItem) {
    return workspaceErrorResult(
      502,
      "UPSTREAM_ERROR",
      "Invalid workspace update response format.",
    );
  }

  return {
    status: 200,
    body: sanitizedItem as unknown as Record<string, unknown>,
  };
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

async function fetchWorkspaceBridgeJson(
  url: string,
  options?: {
    readonly method?: "GET" | "PUT";
    readonly body?: string;
    readonly csrf?: boolean;
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
  },
): Promise<Record<string, unknown> | null> {
  const fetchFn = options?.fetchImpl ?? fetch;
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.csrf) {
    headers[CSRF_HEADER_NAME] = CSRF_HEADER_VALUE;
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers,
      ...(options?.body !== undefined ? { body: options.body } : {}),
      signal: options?.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new WorkspaceServiceError("BACKEND_UNAVAILABLE", 503);
  }

  let data: Record<string, unknown> | null = null;
  try {
    const raw = await response.text();
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    }
  } catch {
    data = null;
  }

  if (!response.ok) {
    const code =
      typeof data?.errorCode === "string"
        ? (data.errorCode as WorkspaceErrorCode)
        : response.status === 401
          ? "UNAUTHENTICATED"
          : response.status === 403
            ? "FORBIDDEN"
            : response.status === 404
              ? "NOT_FOUND"
              : response.status === 409
                ? "CONFLICT"
                : response.status === 400
                  ? "VALIDATION_ERROR"
                  : response.status === 503 || response.status === 502
                    ? "BACKEND_UNAVAILABLE"
                    : "UPSTREAM_ERROR";
    const detail = typeof data?.detail === "string" ? data.detail : undefined;
    throw new WorkspaceServiceError(code, response.status, detail);
  }

  return data;
}

export async function fetchWorkspacePage(
  query: WorkspaceListQuery = {},
  options?: {
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
  },
): Promise<WorkspacePageResponse> {
  const validated = validateWorkspaceListQuery({
    search: query.search,
    page: query.page,
    size: query.size,
  });
  if (!validated.ok) {
    throw new WorkspaceServiceError("VALIDATION_ERROR", 400, validated.detail);
  }

  const qs = buildWorkspaceQueryParams(validated.query).toString();
  const data = await fetchWorkspaceBridgeJson(`/api/workspaces?${qs}`, options);

  const pageResponse = parseWorkspacePagePayload(data);
  if (!pageResponse) {
    throw new WorkspaceServiceError(
      "UPSTREAM_ERROR",
      502,
      "Invalid workspace list payload.",
    );
  }

  return pageResponse;
}

export async function fetchWorkspaceDetail(
  workspaceId: string,
  options?: {
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
  },
): Promise<WorkspaceDirectoryItem> {
  const validId = validateWorkspaceId(workspaceId);
  if (!validId) {
    throw new WorkspaceServiceError(
      "VALIDATION_ERROR",
      400,
      "INVALID_WORKSPACE_ID",
    );
  }

  const data = await fetchWorkspaceBridgeJson(
    `/api/workspaces/${encodeURIComponent(validId)}`,
    options,
  );

  const item = parseWorkspaceDirectoryItem(data);
  if (!item) {
    throw new WorkspaceServiceError(
      "UPSTREAM_ERROR",
      502,
      "Invalid workspace detail payload.",
    );
  }

  return item;
}

export async function updateWorkspaceMetadata(
  workspaceId: string,
  payload: WorkspaceMetadataUpdatePayload,
  options?: {
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
  },
): Promise<WorkspaceDirectoryItem> {
  const validId = validateWorkspaceId(workspaceId);
  if (!validId) {
    throw new WorkspaceServiceError(
      "VALIDATION_ERROR",
      400,
      "INVALID_WORKSPACE_ID",
    );
  }

  const validated = validateWorkspaceMetadataInput(payload);
  if (!validated.ok) {
    throw new WorkspaceServiceError("VALIDATION_ERROR", 400, validated.code);
  }

  const data = await fetchWorkspaceBridgeJson(
    `/api/workspaces/${encodeURIComponent(validId)}`,
    {
      method: "PUT",
      csrf: true,
      body: JSON.stringify({
        version: validated.payload.version,
        enterpriseName: validated.payload.enterpriseName,
        contactName: validated.payload.contactName,
        contactEmail: validated.payload.contactEmail,
        contactPhone: validated.payload.contactPhone,
      }),
      signal: options?.signal,
      fetchImpl: options?.fetchImpl,
    },
  );

  const item = parseWorkspaceDirectoryItem(data);
  if (!item) {
    throw new WorkspaceServiceError(
      "UPSTREAM_ERROR",
      502,
      "Invalid workspace update payload.",
    );
  }

  return item;
}
