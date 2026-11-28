export interface WorkspaceDirectoryItem {
  readonly id: string;
  readonly workspaceKey: string;
  readonly enterpriseName: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceMetadataUpdatePayload {
  readonly version: number;
  readonly enterpriseName: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
}

export interface WorkspaceListQuery {
  readonly search?: string;
  readonly page?: number;
  readonly size?: number;
}

export interface NormalizedWorkspaceListQuery {
  readonly search: string;
  readonly page: number;
  readonly size: number;
}

export interface WorkspacePageResponse {
  readonly items: readonly WorkspaceDirectoryItem[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export type WorkspaceErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CSRF_REJECTED"
  | "VALIDATION_ERROR"
  | "BACKEND_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export type WorkspaceConflictReason =
  | "STALE_VERSION"
  | "DUPLICATE_NAME"
  | "UNKNOWN";

export interface WorkspaceApiErrorBody {
  readonly errorCode: WorkspaceErrorCode;
  readonly status: number;
  readonly detail?: string;
}
