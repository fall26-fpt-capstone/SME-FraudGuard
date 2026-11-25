import type { UserRole } from "./fraudguard";

export type AuthPortal = "PLATFORM" | "ENTERPRISE";

export type LoginNoticeReason =
  | "auth_required"
  | "session_expired"
  | "signed_out"
  | "logout_expired"
  | "logout_unconfirmed";

export type BackendRole =
  | "PLATFORM_ADMIN"
  | "IMPLEMENTATION_STAFF"
  | "SME_ADMIN"
  | "OPERATOR"
  | "INVESTIGATOR";

export type AuthenticatedUserRole = Exclude<UserRole, "Viewer">;

export interface LoginRequestPayload {
  readonly loginName: string;
  readonly password: string;
  readonly portal: AuthPortal;
  readonly workspaceId: string | null;
}

export interface PasswordChangePayload {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmation: string;
}

export interface AuthSessionAccount {
  readonly accountId: string;
  readonly loginName: string;
  readonly role: BackendRole;
  readonly workspaceId: string | null;
  readonly mustChangePassword: boolean;
}

export interface AuthClientSession {
  readonly account: AuthSessionAccount;
  readonly displayRole: AuthenticatedUserRole;
  readonly expiresAt?: string;
}

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_CURRENT_PASSWORD"
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN_FLOW"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "CSRF_REJECTED"
  | "BACKEND_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export interface AuthApiErrorBody {
  readonly errorCode: AuthErrorCode;
  readonly status: number;
  readonly detail?: string;
}

export type LogoutRevocationReason =
  | "REVOKED"
  | "NO_ACTIVE_TOKEN"
  | "TOKEN_EXPIRED_OR_INVALID"
  | "BACKEND_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export interface LogoutResult {
  readonly localCleared: true;
  readonly serverRevoked: boolean;
  readonly reason: LogoutRevocationReason;
}
