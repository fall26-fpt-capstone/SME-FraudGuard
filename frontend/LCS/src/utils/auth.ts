import type {
  AuthenticatedUserRole,
  AuthClientSession,
  AuthPortal,
  AuthSessionAccount,
  BackendRole,
  LoginNoticeReason,
  LoginRequestPayload,
  PasswordChangePayload,
} from "@/types/auth";
import type { UserProfile, UserRole } from "@/types/fraudguard";

export const THEME_STORAGE_KEY = "fraudguard_preferred_theme";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BACKEND_ROLE_MAP: Record<BackendRole, AuthenticatedUserRole> = {
  PLATFORM_ADMIN: "Platform Admin",
  IMPLEMENTATION_STAFF: "Implementation Staff",
  SME_ADMIN: "SME Admin",
  OPERATOR: "Operator",
  INVESTIGATOR: "Investigator",
};

const ROLE_AVATAR_BG: Record<AuthenticatedUserRole, string> = {
  "Platform Admin": "#b45309",
  "Implementation Staff": "#0369a1",
  "SME Admin": "#6d28d9",
  Operator: "#1d4ed8",
  Investigator: "#0f766e",
};

export function isBackendRole(value: unknown): value is BackendRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BACKEND_ROLE_MAP, value);
}

export function isPlatformBackendRole(role: BackendRole): boolean {
  return role === "PLATFORM_ADMIN" || role === "IMPLEMENTATION_STAFF";
}

const ALLOWED_LOGIN_NOTICE_REASONS = new Set<LoginNoticeReason>([
  "auth_required",
  "session_expired",
  "signed_out",
  "logout_expired",
  "logout_unconfirmed",
]);

export function parseLoginNoticeReason(
  rawReason: string | readonly string[] | undefined,
): LoginNoticeReason | undefined {
  const candidate = Array.isArray(rawReason) ? rawReason[0] : rawReason;
  return typeof candidate === "string" &&
    ALLOWED_LOGIN_NOTICE_REASONS.has(candidate as LoginNoticeReason)
    ? (candidate as LoginNoticeReason)
    : undefined;
}

export function resolvePortalForRole(
  role: BackendRole | UserRole | null | undefined,
): AuthPortal | null {
  if (
    role === "PLATFORM_ADMIN" ||
    role === "IMPLEMENTATION_STAFF" ||
    role === "Platform Admin" ||
    role === "Implementation Staff"
  ) {
    return "PLATFORM";
  }
  if (
    role === "SME_ADMIN" ||
    role === "OPERATOR" ||
    role === "INVESTIGATOR" ||
    role === "SME Admin" ||
    role === "Operator" ||
    role === "Investigator"
  ) {
    return "ENTERPRISE";
  }
  return null;
}

export function resolveLoginPathForPortal(
  portal?: AuthPortal | null,
): "/login" | "/platform/login" {
  return portal === "PLATFORM" ? "/platform/login" : "/login";
}

export function buildLoginRedirectPath(
  portal?: AuthPortal | null,
  reason?: LoginNoticeReason,
): string {
  const basePath = resolveLoginPathForPortal(portal);
  return reason ? `${basePath}?reason=${reason}` : basePath;
}

export function mapBackendRoleToUserRole(role: unknown): AuthenticatedUserRole | null {
  if (!isBackendRole(role)) {
    return null;
  }
  return BACKEND_ROLE_MAP[role];
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function parseSanitizedSessionAccount(value: unknown): AuthSessionAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accountId = typeof record.accountId === "string" ? record.accountId.trim() : "";
  const loginName = typeof record.loginName === "string" ? record.loginName : "";
  const role = record.role;
  const rawWorkspaceId = record.workspaceId;
  const rawWorkspaceKey = record.workspaceKey;
  const mustChangePassword = record.mustChangePassword;

  if (!UUID_PATTERN.test(accountId)) {
    return null;
  }
  if (!loginName.trim() || loginName.length > 128) {
    return null;
  }
  if (!isBackendRole(role)) {
    return null;
  }
  if (typeof mustChangePassword !== "boolean") {
    return null;
  }

  if (isPlatformBackendRole(role)) {
    if (rawWorkspaceId !== null || rawWorkspaceKey !== null) {
      return null;
    }
    return {
      accountId,
      loginName,
      role,
      workspaceId: null,
      workspaceKey: null,
      mustChangePassword,
    };
  }

  if (
    typeof rawWorkspaceId !== "string" ||
    !UUID_PATTERN.test(rawWorkspaceId) ||
    typeof rawWorkspaceKey !== "string" ||
    !rawWorkspaceKey.trim() ||
    rawWorkspaceKey.length > 64
  ) {
    return null;
  }

  return {
    accountId,
    loginName,
    role,
    workspaceId: rawWorkspaceId,
    workspaceKey: rawWorkspaceKey,
    mustChangePassword,
  };
}

export function toClientSession(
  account: AuthSessionAccount,
  expiresAt?: string,
): AuthClientSession | null {
  const displayRole = mapBackendRoleToUserRole(account.role);
  if (!displayRole) {
    return null;
  }
  const normalizedExpiry =
    typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt))
      ? new Date(expiresAt).toISOString()
      : undefined;
  return {
    account,
    displayRole,
    ...(normalizedExpiry ? { expiresAt: normalizedExpiry } : {}),
  };
}

/**
 * Adapts a verified backend session into the shared header/sidebar shell profile
 * without inventing full names, contact emails, plans, or workspace UUIDs.
 */
export function sessionToShellUserProfile(session: AuthClientSession): UserProfile {
  const trimmed = session.account.loginName.trim();
  const avatarLetter = (trimmed[0] ?? "U").toUpperCase();
  return {
    id: session.account.accountId,
    name: session.account.loginName,
    email: "",
    role: session.displayRole,
    enterpriseId: session.account.workspaceId ?? undefined,
    title: session.displayRole,
    avatarLetter,
    avatarBg: ROLE_AVATAR_BG[session.displayRole],
    description: "",
  };
}

export type LoginValidationErrorCode =
  | "LOGIN_REQUIRED"
  | "LOGIN_TOO_LONG"
  | "PASSWORD_REQUIRED"
  | "PASSWORD_TOO_LONG"
  | "PORTAL_REQUIRED";

export type LoginValidationResult =
  | { readonly ok: true; readonly payload: LoginRequestPayload }
  | {
      readonly ok: false;
      readonly field: "loginName" | "password" | "portal";
      readonly code: LoginValidationErrorCode;
    };

export function buildLoginRequestPayload(input: {
  readonly loginName: string;
  readonly password: string;
  readonly portal: AuthPortal;
}): LoginValidationResult {
  const cleanLogin = typeof input.loginName === "string" ? input.loginName.trim() : "";
  if (!cleanLogin) {
    return { ok: false, field: "loginName", code: "LOGIN_REQUIRED" };
  }
  if (cleanLogin.length > 128) {
    return { ok: false, field: "loginName", code: "LOGIN_TOO_LONG" };
  }

  if (input.portal !== "PLATFORM" && input.portal !== "ENTERPRISE") {
    return { ok: false, field: "portal", code: "PORTAL_REQUIRED" };
  }

  const password = typeof input.password === "string" ? input.password : "";
  if (!password || password.trim().length === 0) {
    return { ok: false, field: "password", code: "PASSWORD_REQUIRED" };
  }
  if (password.length > 72 || utf8ByteLength(password) > 72) {
    return { ok: false, field: "password", code: "PASSWORD_TOO_LONG" };
  }

  return {
    ok: true,
    payload: {
      loginName: cleanLogin,
      password,
      portal: input.portal,
    },
  };
}

export type PasswordValidationErrorCode =
  | "CURRENT_PASSWORD_REQUIRED"
  | "CURRENT_PASSWORD_TOO_LONG"
  | "NEW_PASSWORD_REQUIRED"
  | "NEW_PASSWORD_TOO_SHORT"
  | "NEW_PASSWORD_TOO_LONG"
  | "NEW_PASSWORD_UNCHANGED"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_MISMATCH";

export type PasswordValidationResult =
  | { readonly ok: true; readonly payload: PasswordChangePayload }
  | {
      readonly ok: false;
      readonly field: "currentPassword" | "newPassword" | "confirmation";
      readonly code: PasswordValidationErrorCode;
    };

export function validatePasswordChangeInput(input: {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmation: string;
}): PasswordValidationResult {
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!currentPassword || currentPassword.trim().length === 0) {
    return {
      ok: false,
      field: "currentPassword",
      code: "CURRENT_PASSWORD_REQUIRED",
    };
  }
  if (currentPassword.length > 72 || utf8ByteLength(currentPassword) > 72) {
    return {
      ok: false,
      field: "currentPassword",
      code: "CURRENT_PASSWORD_TOO_LONG",
    };
  }

  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  if (!newPassword || newPassword.trim().length === 0) {
    return { ok: false, field: "newPassword", code: "NEW_PASSWORD_REQUIRED" };
  }
  if (newPassword.length < 12) {
    return { ok: false, field: "newPassword", code: "NEW_PASSWORD_TOO_SHORT" };
  }
  if (newPassword.length > 72 || utf8ByteLength(newPassword) > 72) {
    return { ok: false, field: "newPassword", code: "NEW_PASSWORD_TOO_LONG" };
  }
  if (newPassword === currentPassword) {
    return { ok: false, field: "newPassword", code: "NEW_PASSWORD_UNCHANGED" };
  }

  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
  if (!confirmation || confirmation.trim().length === 0) {
    return { ok: false, field: "confirmation", code: "CONFIRMATION_REQUIRED" };
  }
  if (confirmation !== newPassword) {
    return { ok: false, field: "confirmation", code: "CONFIRMATION_MISMATCH" };
  }

  return {
    ok: true,
    payload: {
      currentPassword,
      newPassword,
      confirmation,
    },
  };
}

export function readPreferredTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    return "light";
  }
}

export function writePreferredTheme(theme: "light" | "dark"): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore restricted storage environments.
  }
}
