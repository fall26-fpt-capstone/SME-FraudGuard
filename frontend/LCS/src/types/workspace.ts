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

export interface WorkspaceHistoryQuery {
  readonly page?: number;
  readonly size?: number;
}

export interface NormalizedWorkspaceHistoryQuery {
  readonly page: number;
  readonly size: number;
}

export interface WorkspaceHistoryItem {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly workspaceVersion: number;
  readonly occurredAt: string;
  readonly details: Record<string, unknown> | null;
}

export interface WorkspaceHistoryPageResponse {
  readonly items: readonly WorkspaceHistoryItem[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface WorkspaceStaffAssignmentsQuery {
  readonly page?: number;
  readonly size?: number;
}

export type NormalizedWorkspaceStaffAssignmentsQuery =
  NormalizedWorkspaceHistoryQuery;

export interface WorkspaceStaffAssignmentItem {
  readonly staffId: string;
  readonly assignedAt: string;
}

export interface WorkspaceStaffAssignmentPageResponse {
  readonly items: readonly WorkspaceStaffAssignmentItem[];
  readonly workspaceVersion: number;
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface WorkspaceEligibleStaffQuery {
  readonly search?: string;
  readonly page?: number;
  readonly size?: number;
}

export type NormalizedWorkspaceEligibleStaffQuery =
  NormalizedWorkspaceListQuery;

export interface WorkspaceEligibleStaffItem {
  readonly id: string;
  readonly loginName: string;
}

export interface WorkspaceEligibleStaffPageResponse {
  readonly items: readonly WorkspaceEligibleStaffItem[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface WorkspaceAssignStaffPayload {
  readonly staffId: string;
  readonly version: number;
}

export interface WorkspaceStaffAssignmentResult {
  readonly workspaceId: string;
  readonly staffId: string;
  readonly assigned: boolean;
  readonly workspaceVersion: number;
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
