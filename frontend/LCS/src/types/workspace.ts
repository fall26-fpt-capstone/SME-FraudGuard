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
  | "VALIDATION_ERROR"
  | "BACKEND_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export interface WorkspaceApiErrorBody {
  readonly errorCode: WorkspaceErrorCode;
  readonly status: number;
  readonly detail?: string;
}
