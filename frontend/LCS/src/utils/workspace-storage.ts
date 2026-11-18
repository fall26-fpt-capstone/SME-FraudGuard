import type { Enterprise } from "@/types/enterprise";
import type {
  AuditLogEntry,
  ProjectItem,
  RuleTemplate,
  TransactionRisk,
  UserProfile,
} from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseActorRef,
  InvestigationCaseAlertLink,
  InvestigationCaseConclusion,
  InvestigationCaseCreationEligibility,
  InvestigationCaseEvent,
  InvestigationCaseReportVersion,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import {
  CASE_MIGRATION_VERSION,
  migrateWorkspaceLegacyCases,
  type LegacyCaseArchiveEntry,
  type LegacyCaseArchiveReasonCode,
  type WorkspaceMigrationMeta,
} from "@/utils/case-migration";
import { reconcileEnterpriseProjects } from "@/utils/enterprise";
import { parseStrictIsoTimestamp } from "@/utils/enterprise-lifecycle";
import {
  isValidReportFeedbackList,
  validateReportFeedbackList,
} from "@/utils/report-feedback";
import {
  migrateProjectSets,
  type LegacyRuleSet,
  type ManagedRuleSet,
} from "@/utils/rule-set-lifecycle";

export const WORKSPACE_STORAGE_KEY_V4 = "fraudguard-demo-workspace-v4" as const;
export const WORKSPACE_BACKUP_KEY_V3 = "fraudguard-demo-workspace-v3-backup" as const;
export const WORKSPACE_RECOVERY_JOURNAL_KEY_V4 =
  "fraudguard-demo-workspace-v4-recovery" as const;
export const WORKSPACE_STORAGE_KEY_V3 = "fraudguard-demo-workspace-v3" as const;
export const WORKSPACE_STORAGE_KEY_V2 = "fraudguard-demo-workspace-v2" as const;
export const USERS_STORAGE_KEY_V1 = "fraudguard-demo-users-v1" as const;
export const WORKSPACE_SCHEMA_VERSION = 4 as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type WorkspaceRestoreStatus =
  | "pending"
  | "ready"
  | "blocked_corrupt"
  | "blocked_unsupported_version"
  | "recovery_required";

export type WorkspaceStorageErrorCode =
  | "CORRUPT_WORKSPACE_JSON"
  | "INVALID_WORKSPACE_SHAPE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "BACKUP_WRITE_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_ROLLBACK_FAILED"
  | "STORAGE_CLEANUP_FAILED"
  | "STORAGE_RECOVERY_REQUIRED"
  | "RESTORE_NOT_READY";

export type WorkspaceRecoveryCommitState = "pending" | "committed_cleanup_pending";

export interface PreDemoWorkspaceSnapshot {
  readonly savedAt: string;
  readonly rules: readonly RuleTemplate[];
  readonly ruleSets: readonly ManagedRuleSet[];
  readonly enterprises: readonly Enterprise[];
  readonly legacyUnassigned: readonly LegacyRuleSet[];
  readonly projects: readonly ProjectItem[];
  readonly transactions: readonly TransactionRisk[];
  readonly auditLogs: readonly AuditLogEntry[];
  readonly users: readonly UserProfile[];
  readonly investigationCases: readonly InvestigationCase[];
  readonly legacyCaseArchive: readonly LegacyCaseArchiveEntry[];
  readonly reportFeedbacks?: readonly InvestigationReportFeedback[];
  readonly migrationMeta: WorkspaceMigrationMeta;
}

export interface WorkspacePayloadV4 {
  readonly schemaVersion: 4;
  readonly rules: readonly RuleTemplate[];
  readonly ruleSets: readonly ManagedRuleSet[];
  readonly enterprises: readonly Enterprise[];
  readonly legacyUnassigned: readonly LegacyRuleSet[];
  readonly projects: readonly ProjectItem[];
  readonly transactions: readonly TransactionRisk[];
  readonly auditLogs: readonly AuditLogEntry[];
  readonly investigationCases: readonly InvestigationCase[];
  readonly legacyCaseArchive: readonly LegacyCaseArchiveEntry[];
  readonly reportFeedbacks?: readonly InvestigationReportFeedback[];
  readonly migrationMeta: WorkspaceMigrationMeta;
  readonly wf04DemoActive?: boolean;
  readonly preDemoSnapshot?: PreDemoWorkspaceSnapshot;
}

export interface WorkspaceRecoveryJournal {
  readonly version: 1;
  readonly recordedAt: string;
  readonly operation: string;
  readonly commitState?: WorkspaceRecoveryCommitState;
  readonly hadPriorWorkspaceV4: boolean;
  readonly priorWorkspaceV4Raw: string | null;
  readonly hadPriorUsersV1: boolean;
  readonly priorUsersV1Raw: string | null;
  readonly pendingPreDemoSnapshot?: PreDemoWorkspaceSnapshot;
  readonly committedV4Digest?: string;
  readonly committedUsersDigest?: string;
  readonly committedHasUsers?: boolean;
  readonly committedAt?: string;
}

export interface WorkspaceRestoreArgs {
  storage?: StorageLike;
  defaultRules: readonly RuleTemplate[];
  defaultEnterprises: readonly Enterprise[];
  defaultProjects: readonly ProjectItem[];
  defaultTransactions: readonly TransactionRisk[];
  defaultAuditLogs: readonly AuditLogEntry[];
  defaultUsers: readonly UserProfile[];
  extraFallbackEnterprises?: readonly Enterprise[];
  migratedAt: string;
}

export interface WorkspaceRestoreResult {
  readonly status: WorkspaceRestoreStatus;
  readonly canPersist: boolean;
  readonly payload: WorkspacePayloadV4;
  readonly users: readonly UserProfile[];
  readonly migratedFromVersion?: 2 | 3;
  readonly errorCode?: WorkspaceStorageErrorCode;
  readonly error?: string;
  readonly cleanupPending?: boolean;
  readonly recoveryJournal?: WorkspaceRecoveryJournal;
}

export type PersistCoordinatedResult =
  | {
      readonly ok: true;
      readonly payload: WorkspacePayloadV4;
      readonly users?: readonly UserProfile[];
      readonly committed?: true;
      readonly cleanupPending?: false;
      readonly rolledBack: false;
      readonly rollbackFailed: false;
      readonly recoveryRequired: false;
    }
  | {
      readonly ok: false;
      readonly errorCode: WorkspaceStorageErrorCode;
      readonly error: string;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly rolledBack: boolean;
      readonly rollbackFailed: boolean;
      readonly recoveryRequired: boolean;
      readonly recoveryJournal?: WorkspaceRecoveryJournal;
      readonly preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot;
    };

export type PersistWorkspaceResult = PersistCoordinatedResult;

const ENTERPRISE_USER_ROLES = new Set<string>(["SME Admin", "Operator", "Investigator"]);
const ALL_USER_ROLES = new Set<string>([
  "Platform Admin",
  "Implementation Staff",
  "SME Admin",
  "Operator",
  "Investigator",
  "Viewer",
]);
const VALID_CASE_STATUSES = new Set<InvestigationCaseStatus>([
  "Open",
  "Investigating",
  "Pending Review",
  "Closed",
]);
const VALID_CASE_EVENT_TYPES = new Set<string>([
  "CASE_CREATED",
  "INVESTIGATOR_ASSIGNED",
  "OPERATOR_SELF_ASSIGNED",
  "REPORT_SUBMITTED",
  "REVISION_REQUESTED",
  "REPORT_CONFIRMED_AND_CLOSED",
]);
const VALID_ARCHIVE_REASON_CODES = new Set<LegacyCaseArchiveReasonCode>([
  "MISSING_PROJECT_MAPPING",
  "CROSS_TENANT_CONFLICT",
  "INELIGIBLE_SOURCE_OR_RISK",
  "MISSING_ALERT_ID",
  "MISSING_CREATION_PROVENANCE",
  "MISSING_OPERATING_SUBSCRIPTION",
  "CONFLICTING_MULTI_TX_RECORDS",
  "UNRESOLVED_ASSIGNEE_ID",
  "INCOMPLETE_REPORT_OR_DECISION",
  "UNSUPPORTED_LEGACY_STATUS",
]);
const VALID_SOURCE_SCHEMAS = new Set<string>(["seed", "v2", "v3", "v4"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoTimestampString(value: unknown): value is string {
  return isNonEmptyString(value) && parseStrictIsoTimestamp(value).ok;
}

function resolveStorage(explicit?: StorageLike): StorageLike | undefined {
  if (explicit) return explicit;
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return undefined;
}

function isValidRuleShape(item: unknown): item is RuleTemplate {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isPlainRecord(item.conditionGroup) &&
    Array.isArray(item.conditionGroup.children) &&
    isPlainRecord(item.appliesTo) &&
    Array.isArray(item.appliesTo.projects)
  );
}

function isValidManagedRuleSetShape(item: unknown): item is ManagedRuleSet {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.enterpriseId) &&
    Array.isArray(item.projectIds) &&
    item.projectIds.every(isNonEmptyString) &&
    Array.isArray(item.versions)
  );
}

function isValidProjectShape(item: unknown): item is ProjectItem {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    typeof item.name === "string" &&
    isPlainRecord(item.quota)
  );
}

function isValidEnterpriseShape(item: unknown): item is Enterprise {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.name) &&
    Array.isArray(item.projectIds) &&
    item.projectIds.every(isNonEmptyString)
  );
}

function isValidTransactionShape(item: unknown): item is TransactionRisk {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.projectId) &&
    typeof item.projectName === "string" &&
    typeof item.transactionReference === "string" &&
    isNonEmptyString(item.processedAt) &&
    Array.isArray(item.triggeredRules)
  );
}

function isValidAuditLogShape(item: unknown): item is AuditLogEntry {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.timestamp) &&
    isPlainRecord(item.actor) &&
    typeof item.actor.name === "string" &&
    typeof item.actor.email === "string" &&
    typeof item.actor.role === "string" &&
    isNonEmptyString(item.action) &&
    typeof item.target === "string" &&
    typeof item.details === "string"
  );
}

function isValidActorRefShape(value: unknown): value is InvestigationCaseActorRef {
  if (!isPlainRecord(value)) return false;
  if (!isNonEmptyString(value.actorId)) return false;
  if (typeof value.role !== "string" || !ALL_USER_ROLES.has(value.role)) return false;
  if (value.enterpriseId !== undefined && !isNonEmptyString(value.enterpriseId)) return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  return true;
}

function isValidCreationEligibilityShape(
  value: unknown,
): value is InvestigationCaseCreationEligibility {
  if (!isPlainRecord(value)) return false;
  if (!isValidIsoTimestampString(value.verifiedAt)) return false;
  if (value.operatingStatus !== "Operating") return false;
  if (value.servicePlan !== "Subscription") return false;
  if (!isValidIsoTimestampString(value.activatedAt)) return false;
  if (!isNonEmptyString(value.configVersion)) return false;
  if (!isValidIsoTimestampString(value.subscriptionStartedAt)) return false;
  if (!isValidIsoTimestampString(value.subscriptionExpiresAt)) return false;
  if (!isPlainRecord(value.subscriptionDuration)) return false;
  if (
    typeof value.subscriptionDuration.value !== "number" ||
    !Number.isFinite(value.subscriptionDuration.value) ||
    value.subscriptionDuration.value <= 0
  ) {
    return false;
  }
  if (!isNonEmptyString(value.subscriptionDuration.unit)) return false;
  return true;
}

function isValidAlertLinkShape(value: unknown): value is InvestigationCaseAlertLink {
  if (!isPlainRecord(value)) return false;
  if (!isNonEmptyString(value.alertId)) return false;
  if (!isNonEmptyString(value.transactionId)) return false;
  if (!isNonEmptyString(value.transactionReference)) return false;
  if (!isNonEmptyString(value.projectId)) return false;
  if (typeof value.projectName !== "string") return false;
  if (typeof value.transactionType !== "string") return false;
  if (typeof value.entityReference !== "string") return false;
  if (value.scoringSource !== "AI") return false;
  if (value.riskLevel !== "Abnormal") return false;
  if (!isValidIsoTimestampString(value.processedAt)) return false;
  if (value.alertName !== undefined && typeof value.alertName !== "string") return false;
  if (
    value.confidence !== undefined &&
    (typeof value.confidence !== "number" || !Number.isFinite(value.confidence))
  ) {
    return false;
  }
  if (value.modelVersion !== undefined && typeof value.modelVersion !== "string") return false;
  if (value.explanation !== undefined && typeof value.explanation !== "string") return false;
  return true;
}

function isValidAlertResultListForCase(
  value: unknown,
  expectedAlertIds: ReadonlySet<string>,
): boolean {
  if (!Array.isArray(value) || value.length !== expectedAlertIds.size) return false;
  const seenAlertIds = new Set<string>();
  for (const entry of value) {
    if (!isPlainRecord(entry)) return false;
    if (!isNonEmptyString(entry.alertId)) return false;
    if (!isNonEmptyString(entry.transactionId)) return false;
    if (!isNonEmptyString(entry.transactionReference)) return false;
    if (!isNonEmptyString(entry.resultText)) return false;
    if (!isNonEmptyString(entry.evidence)) return false;
    const cleanAlertId = entry.alertId.trim();
    if (!expectedAlertIds.has(cleanAlertId) || seenAlertIds.has(cleanAlertId)) {
      return false;
    }
    seenAlertIds.add(cleanAlertId);
  }
  return seenAlertIds.size === expectedAlertIds.size;
}

function isValidReportVersionShape(
  value: unknown,
  expectedAlertIds: ReadonlySet<string>,
): value is InvestigationCaseReportVersion {
  if (!isPlainRecord(value)) return false;
  if (!isNonEmptyString(value.reportId)) return false;
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1
  ) {
    return false;
  }
  if (!isValidActorRefShape(value.submittedBy)) return false;
  if (!isValidIsoTimestampString(value.submittedAt)) return false;
  if (!isNonEmptyString(value.summary)) return false;
  if (!isValidAlertResultListForCase(value.alertResults, expectedAlertIds)) return false;
  return true;
}

function isValidConclusionShape(
  value: unknown,
  expectedAlertIds: ReadonlySet<string>,
  reports: readonly InvestigationCaseReportVersion[],
): value is InvestigationCaseConclusion {
  if (!isPlainRecord(value)) return false;
  if (!isNonEmptyString(value.reportId)) return false;
  if (
    typeof value.reportVersion !== "number" ||
    !Number.isInteger(value.reportVersion) ||
    value.reportVersion < 1
  ) {
    return false;
  }
  const matchingReport = reports.find(
    r => r.reportId === value.reportId && r.version === value.reportVersion,
  );
  if (!matchingReport) return false;
  if (!isValidActorRefShape(value.confirmedBy)) return false;
  if (!isValidIsoTimestampString(value.confirmedAt)) return false;
  if (!isNonEmptyString(value.summary)) return false;
  if (!isValidAlertResultListForCase(value.alertResults, expectedAlertIds)) return false;
  return true;
}

function isValidCaseEventShape(value: unknown): value is InvestigationCaseEvent {
  if (!isPlainRecord(value)) return false;
  if (!isNonEmptyString(value.eventId)) return false;
  if (typeof value.type !== "string" || !VALID_CASE_EVENT_TYPES.has(value.type)) return false;
  if (!isValidIsoTimestampString(value.at)) return false;
  if (!isValidActorRefShape(value.actor)) return false;
  if (
    value.fromStatus !== null &&
    (typeof value.fromStatus !== "string" ||
      !VALID_CASE_STATUSES.has(value.fromStatus as InvestigationCaseStatus))
  ) {
    return false;
  }
  if (
    typeof value.toStatus !== "string" ||
    !VALID_CASE_STATUSES.has(value.toStatus as InvestigationCaseStatus)
  ) {
    return false;
  }
  if (value.assignee !== undefined && !isValidActorRefShape(value.assignee)) return false;
  if (value.reportId !== undefined && !isNonEmptyString(value.reportId)) return false;
  if (
    value.reportVersion !== undefined &&
    (typeof value.reportVersion !== "number" ||
      !Number.isInteger(value.reportVersion) ||
      value.reportVersion < 1)
  ) {
    return false;
  }
  if (value.reason !== undefined && typeof value.reason !== "string") return false;
  if (value.note !== undefined && typeof value.note !== "string") return false;
  return true;
}

/**
 * Reusable deep structural validator for `InvestigationCase` at the storage restore boundary.
 */
export function isValidInvestigationCaseShape(item: unknown): item is InvestigationCase {
  if (!isPlainRecord(item)) return false;
  if (!isNonEmptyString(item.caseId)) return false;
  if (!isNonEmptyString(item.enterpriseId)) return false;
  if (
    typeof item.status !== "string" ||
    !VALID_CASE_STATUSES.has(item.status as InvestigationCaseStatus)
  ) {
    return false;
  }

  const createdParsed = isNonEmptyString(item.createdAt)
    ? parseStrictIsoTimestamp(item.createdAt)
    : { ok: false as const };
  const updatedParsed = isNonEmptyString(item.updatedAt)
    ? parseStrictIsoTimestamp(item.updatedAt)
    : { ok: false as const };
  if (!createdParsed.ok || !updatedParsed.ok || updatedParsed.ms < createdParsed.ms) {
    return false;
  }

  if (!isValidActorRefShape(item.createdBy)) return false;
  if (!isValidCreationEligibilityShape(item.creationEligibility)) return false;

  if (!Array.isArray(item.alertIds) || item.alertIds.length === 0) return false;
  if (!Array.isArray(item.alerts) || item.alerts.length !== item.alertIds.length) return false;

  const expectedAlertIds = new Set<string>();
  for (const rawId of item.alertIds) {
    if (!isNonEmptyString(rawId)) return false;
    const cleanId = rawId.trim();
    if (expectedAlertIds.has(cleanId)) return false;
    expectedAlertIds.add(cleanId);
  }

  const linkedAlertIds = new Set<string>();
  const linkedTxIds = new Set<string>();
  for (const alertLink of item.alerts) {
    if (!isValidAlertLinkShape(alertLink)) return false;
    const cleanAlertId = alertLink.alertId.trim();
    const cleanTxId = alertLink.transactionId.trim();
    if (
      !expectedAlertIds.has(cleanAlertId) ||
      linkedAlertIds.has(cleanAlertId) ||
      linkedTxIds.has(cleanTxId)
    ) {
      return false;
    }
    linkedAlertIds.add(cleanAlertId);
    linkedTxIds.add(cleanTxId);
  }
  if (linkedAlertIds.size !== expectedAlertIds.size) return false;

  if (
    item.assignmentMode !== undefined &&
    item.assignmentMode !== "assigned" &&
    item.assignmentMode !== "self_investigated"
  ) {
    return false;
  }
  if (item.assignee !== undefined && !isValidActorRefShape(item.assignee)) return false;
  if (item.assignedBy !== undefined && !isValidActorRefShape(item.assignedBy)) return false;
  if (item.assignedAt !== undefined && !isValidIsoTimestampString(item.assignedAt)) {
    return false;
  }
  if (item.status !== "Open" && !isValidActorRefShape(item.assignee)) {
    return false;
  }

  if (!Array.isArray(item.reports)) return false;
  const seenReportIds = new Set<string>();
  const seenReportVersions = new Set<number>();
  const validatedReports: InvestigationCaseReportVersion[] = [];
  for (const report of item.reports) {
    if (!isValidReportVersionShape(report, expectedAlertIds)) return false;
    if (seenReportIds.has(report.reportId) || seenReportVersions.has(report.version)) {
      return false;
    }
    seenReportIds.add(report.reportId);
    seenReportVersions.add(report.version);
    validatedReports.push(report);
  }

  if (item.status === "Pending Review") {
    if (
      !isNonEmptyString(item.pendingReviewReportId) ||
      typeof item.pendingReviewReportVersion !== "number" ||
      !Number.isInteger(item.pendingReviewReportVersion)
    ) {
      return false;
    }
    const pendingMatch = validatedReports.some(
      r =>
        r.reportId === item.pendingReviewReportId &&
        r.version === item.pendingReviewReportVersion,
    );
    if (!pendingMatch) return false;
  } else if (
    item.pendingReviewReportId !== undefined ||
    item.pendingReviewReportVersion !== undefined
  ) {
    const pendingMatch = validatedReports.some(
      r =>
        r.reportId === item.pendingReviewReportId &&
        r.version === item.pendingReviewReportVersion,
    );
    if (!pendingMatch) return false;
  }

  if (item.status === "Closed") {
    if (!isValidConclusionShape(item.conclusion, expectedAlertIds, validatedReports)) {
      return false;
    }
    if (item.closedAt !== undefined && !isValidIsoTimestampString(item.closedAt)) {
      return false;
    }
  } else if (item.conclusion !== undefined || item.closedAt !== undefined) {
    return false;
  }

  if (!Array.isArray(item.history) || item.history.length === 0) return false;
  const seenEventIds = new Set<string>();
  for (const event of item.history) {
    if (!isValidCaseEventShape(event)) return false;
    if (seenEventIds.has(event.eventId)) return false;
    seenEventIds.add(event.eventId);
  }

  return true;
}

function isValidInvestigationCaseList(items: unknown): items is InvestigationCase[] {
  if (!Array.isArray(items)) return false;
  const seenCaseIds = new Set<string>();
  for (const item of items) {
    if (!isValidInvestigationCaseShape(item)) return false;
    const cleanCaseId = item.caseId.trim();
    if (seenCaseIds.has(cleanCaseId)) return false;
    seenCaseIds.add(cleanCaseId);
  }
  return true;
}

/**
 * Reusable deep structural validator for `LegacyCaseArchiveEntry` at the storage restore boundary.
 * Allows missing provenance fields while enforcing valid arrays and transaction objects used by callers.
 */
export function isValidLegacyArchiveShape(item: unknown): item is LegacyCaseArchiveEntry {
  if (!isPlainRecord(item)) return false;
  if (!isNonEmptyString(item.archiveId)) return false;
  if (
    typeof item.reasonCode !== "string" ||
    !VALID_ARCHIVE_REASON_CODES.has(item.reasonCode as LegacyCaseArchiveReasonCode)
  ) {
    return false;
  }
  if (item.reason !== undefined && typeof item.reason !== "string") return false;
  if (item.blocksAlertCreation !== true) return false;
  if (
    item.requiresManualReconciliation !== undefined &&
    typeof item.requiresManualReconciliation !== "boolean"
  ) {
    return false;
  }
  if (!Array.isArray(item.alertIds) || !item.alertIds.every(isNonEmptyString)) return false;
  if (
    !Array.isArray(item.transactionIds) ||
    item.transactionIds.length === 0 ||
    !item.transactionIds.every(isNonEmptyString)
  ) {
    return false;
  }
  if (
    item.transactionRefs !== undefined &&
    (!Array.isArray(item.transactionRefs) ||
      !item.transactionRefs.every(ref => typeof ref === "string"))
  ) {
    return false;
  }
  if (
    !Array.isArray(item.transactions) ||
    item.transactions.length === 0 ||
    !item.transactions.every(isValidTransactionShape)
  ) {
    return false;
  }
  if (item.legacyCaseId !== undefined && typeof item.legacyCaseId !== "string") return false;
  if (item.legacyCaseStatus !== undefined && typeof item.legacyCaseStatus !== "string") {
    return false;
  }
  if (item.enterpriseId !== undefined && !isNonEmptyString(item.enterpriseId)) return false;
  if (item.canResolveAssigneeId !== undefined && !isNonEmptyString(item.canResolveAssigneeId)) {
    return false;
  }
  if (
    item.assigneeResolutionSource !== undefined &&
    item.assigneeResolutionSource !== "id" &&
    item.assigneeResolutionSource !== "unique_tenant_name"
  ) {
    return false;
  }
  if (
    item.assignedInvestigatorName !== undefined &&
    typeof item.assignedInvestigatorName !== "string"
  ) {
    return false;
  }
  return true;
}

function isValidMigrationMetaShape(value: unknown): value is WorkspaceMigrationMeta {
  if (!isPlainRecord(value)) return false;
  if (typeof value.migrationVersion !== "number" || !Number.isFinite(value.migrationVersion)) {
    return false;
  }
  if (value.migratedAt !== undefined && !isValidIsoTimestampString(value.migratedAt)) {
    return false;
  }
  if (
    value.sourceSchema !== undefined &&
    (typeof value.sourceSchema !== "string" || !VALID_SOURCE_SCHEMAS.has(value.sourceSchema))
  ) {
    return false;
  }
  if (value.migratedCaseCount !== undefined && typeof value.migratedCaseCount !== "number") {
    return false;
  }
  if (value.archivedLegacyCount !== undefined && typeof value.archivedLegacyCount !== "number") {
    return false;
  }
  if (
    value.preservedExistingCaseCount !== undefined &&
    typeof value.preservedExistingCaseCount !== "number"
  ) {
    return false;
  }
  if (
    value.notes !== undefined &&
    (!Array.isArray(value.notes) || !value.notes.every(note => typeof note === "string"))
  ) {
    return false;
  }
  return true;
}

function isValidUserShape(item: unknown): item is UserProfile {
  return (
    isPlainRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.enterpriseId) &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.email) &&
    typeof item.role === "string" &&
    ENTERPRISE_USER_ROLES.has(item.role)
  );
}

function isValidAnyUserProfileShape(item: unknown): item is UserProfile {
  if (!isPlainRecord(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (!isNonEmptyString(item.email)) return false;
  if (typeof item.role !== "string" || !ALL_USER_ROLES.has(item.role)) return false;
  if (item.enterpriseId !== undefined && !isNonEmptyString(item.enterpriseId)) return false;
  if (ENTERPRISE_USER_ROLES.has(item.role) && !isNonEmptyString(item.enterpriseId)) {
    return false;
  }
  return true;
}

/**
 * Reusable deep structural validator for `PreDemoWorkspaceSnapshot`.
 */
export function isValidPreDemoSnapshotShape(
  value: unknown,
): value is PreDemoWorkspaceSnapshot {
  if (!isPlainRecord(value)) return false;
  if (!isValidIsoTimestampString(value.savedAt)) return false;
  if (!Array.isArray(value.rules) || !value.rules.every(isValidRuleShape)) return false;
  if (
    !Array.isArray(value.ruleSets) ||
    !value.ruleSets.every(isValidManagedRuleSetShape)
  ) {
    return false;
  }
  if (
    !Array.isArray(value.enterprises) ||
    !value.enterprises.every(isValidEnterpriseShape)
  ) {
    return false;
  }
  if (!Array.isArray(value.legacyUnassigned)) return false;
  if (!Array.isArray(value.projects) || !value.projects.every(isValidProjectShape)) {
    return false;
  }
  if (
    !Array.isArray(value.transactions) ||
    !value.transactions.every(isValidTransactionShape)
  ) {
    return false;
  }
  if (!Array.isArray(value.auditLogs) || !value.auditLogs.every(isValidAuditLogShape)) {
    return false;
  }
  if (
    !Array.isArray(value.users) ||
    value.users.length === 0 ||
    !value.users.every(isValidAnyUserProfileShape)
  ) {
    return false;
  }
  if (!isValidInvestigationCaseList(value.investigationCases)) return false;
  if (
    !Array.isArray(value.legacyCaseArchive) ||
    !value.legacyCaseArchive.every(isValidLegacyArchiveShape)
  ) {
    return false;
  }
  if (
    value.reportFeedbacks !== undefined &&
    !isValidReportFeedbackList(value.reportFeedbacks)
  ) {
    return false;
  }
  if (!isValidMigrationMetaShape(value.migrationMeta)) return false;
  return true;
}

/**
 * Validates an untrusted parsed v4 workspace object before state hydration or persistence.
 */
export function validateWorkspacePayloadV4(
  value: unknown,
):
  | { readonly ok: true; readonly value: WorkspacePayloadV4 }
  | {
      readonly ok: false;
      readonly errorCode: WorkspaceStorageErrorCode;
      readonly error: string;
    } {
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Dữ liệu workspace v4 không phải đối tượng hợp lệ.",
    };
  }
  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_SCHEMA_VERSION",
      error: `Phiên bản workspace schema '${String(value.schemaVersion)}' không được hỗ trợ (yêu cầu v${WORKSPACE_SCHEMA_VERSION}); đã khóa ghi đè storage.`,
    };
  }

  const hasValidCoreSlices =
    Array.isArray(value.rules) &&
    value.rules.every(isValidRuleShape) &&
    Array.isArray(value.ruleSets) &&
    value.ruleSets.every(isValidManagedRuleSetShape) &&
    Array.isArray(value.enterprises) &&
    value.enterprises.every(isValidEnterpriseShape) &&
    (value.legacyUnassigned === undefined || Array.isArray(value.legacyUnassigned)) &&
    Array.isArray(value.projects) &&
    value.projects.every(isValidProjectShape) &&
    Array.isArray(value.transactions) &&
    value.transactions.every(isValidTransactionShape) &&
    Array.isArray(value.auditLogs) &&
    value.auditLogs.every(isValidAuditLogShape) &&
    isValidInvestigationCaseList(value.investigationCases) &&
    Array.isArray(value.legacyCaseArchive) &&
    value.legacyCaseArchive.every(isValidLegacyArchiveShape) &&
    isValidMigrationMetaShape(value.migrationMeta) &&
    (value.wf04DemoActive === undefined || typeof value.wf04DemoActive === "boolean");

  if (!hasValidCoreSlices) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Cấu trúc các trường trong workspace v4 không hợp lệ; đã khóa ghi đè storage.",
    };
  }

  if (value.reportFeedbacks !== undefined) {
    const feedbackValidation = validateReportFeedbackList(value.reportFeedbacks);
    if (!feedbackValidation.ok) {
      return {
        ok: false,
        errorCode: "INVALID_WORKSPACE_SHAPE",
        error: `Dữ liệu phản hồi báo cáo điều tra (reportFeedbacks) không hợp lệ: ${feedbackValidation.reason}`,
      };
    }
  }

  if (
    value.preDemoSnapshot !== undefined &&
    !isValidPreDemoSnapshotShape(value.preDemoSnapshot)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Bản chụp khôi phục trước demo (preDemoSnapshot) không hợp lệ; đã khóa ghi đè storage.",
    };
  }

  if (
    value.wf04DemoActive === true &&
    !isValidPreDemoSnapshotShape(value.preDemoSnapshot)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Trạng thái demo WF-04 đang bật nhưng thiếu bản chụp khôi phục hợp lệ (preDemoSnapshot).",
    };
  }

  return {
    ok: true,
    value: value as unknown as WorkspacePayloadV4,
  };
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let codePoint = input.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function sha256HexSync(input: string): string {
  const bytes = encodeUtf8Bytes(input);
  const paddedLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLenHi = Math.floor(bytes.length / 0x20000000) >>> 0;
  const bitLenLo = (bytes.length << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map(word => word.toString(16).padStart(8, "0")).join("");
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item =>
      item === undefined || typeof item === "function" || typeof item === "symbol"
        ? null
        : canonicalizeJsonValue(item),
    );
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const prop = obj[key];
    if (prop === undefined || typeof prop === "function" || typeof prop === "symbol") {
      continue;
    }
    sorted[key] = canonicalizeJsonValue(prop);
  }
  return sorted;
}

function computeCanonicalJsonDigestFromValue(value: unknown): string {
  const canonicalJson = JSON.stringify(canonicalizeJsonValue(value));
  return `sha256:${sha256HexSync(canonicalJson)}`;
}

function computeRawJsonDigest(
  raw: string,
): { readonly ok: true; readonly digest: string } | { readonly ok: false } {
  const parsed = parseJsonSafe(raw);
  if (!parsed.ok) return { ok: false };
  return { ok: true, digest: computeCanonicalJsonDigestFromValue(parsed.value) };
}

function isValidSha256DigestString(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isValidRecoveryJournalShape(value: unknown): value is WorkspaceRecoveryJournal {
  if (!isPlainRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isValidIsoTimestampString(value.recordedAt)) return false;
  if (!isNonEmptyString(value.operation)) return false;
  if (typeof value.hadPriorWorkspaceV4 !== "boolean") return false;
  if (
    value.hadPriorWorkspaceV4
      ? typeof value.priorWorkspaceV4Raw !== "string"
      : value.priorWorkspaceV4Raw !== null
  ) {
    return false;
  }
  if (typeof value.hadPriorUsersV1 !== "boolean") return false;
  if (
    value.hadPriorUsersV1
      ? typeof value.priorUsersV1Raw !== "string"
      : value.priorUsersV1Raw !== null
  ) {
    return false;
  }
  if (
    value.commitState !== undefined &&
    value.commitState !== "pending" &&
    value.commitState !== "committed_cleanup_pending"
  ) {
    return false;
  }
  if (value.commitState === "committed_cleanup_pending") {
    if (!isValidSha256DigestString(value.committedV4Digest)) return false;
    if (typeof value.committedHasUsers !== "boolean") return false;
    if (
      value.committedHasUsers
        ? !isValidSha256DigestString(value.committedUsersDigest)
        : value.committedUsersDigest !== undefined &&
          !isValidSha256DigestString(value.committedUsersDigest)
    ) {
      return false;
    }
    if (value.committedAt !== undefined && !isValidIsoTimestampString(value.committedAt)) {
      return false;
    }
  } else if (
    value.committedV4Digest !== undefined ||
    value.committedUsersDigest !== undefined ||
    value.committedHasUsers !== undefined ||
    value.committedAt !== undefined
  ) {
    return false;
  }
  if (
    value.pendingPreDemoSnapshot !== undefined &&
    !isValidPreDemoSnapshotShape(value.pendingPreDemoSnapshot)
  ) {
    return false;
  }
  return true;
}

function buildSeedPayload(args: {
  defaultRules: readonly RuleTemplate[];
  defaultEnterprises: readonly Enterprise[];
  defaultProjects: readonly ProjectItem[];
  defaultTransactions: readonly TransactionRisk[];
  defaultAuditLogs: readonly AuditLogEntry[];
  users: readonly UserProfile[];
  migratedAt: string;
}): WorkspacePayloadV4 {
  const enterprises = structuredClone([...args.defaultEnterprises]);
  const projects = structuredClone([...args.defaultProjects]);
  const transactions = structuredClone([...args.defaultTransactions]);
  const migration = migrateWorkspaceLegacyCases({
    transactions,
    enterprises,
    projects,
    users: args.users,
    sourceSchema: "seed",
    migratedAt: args.migratedAt,
  });

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    rules: structuredClone([...args.defaultRules]),
    ruleSets: [],
    enterprises,
    legacyUnassigned: [],
    projects,
    transactions,
    auditLogs: structuredClone([...args.defaultAuditLogs]),
    investigationCases: migration.cases,
    legacyCaseArchive: migration.legacyArchive,
    reportFeedbacks: [],
    migrationMeta: migration.migrationMeta,
  };
}

function mergeEnterpriseUsersWithDefaults(
  defaultUsers: readonly UserProfile[],
  enterpriseUsers: readonly UserProfile[],
): UserProfile[] {
  const platformUsers = defaultUsers.filter(u => !u.enterpriseId);
  const merged = new Map<string, UserProfile>();
  for (const user of platformUsers) merged.set(user.id, structuredClone(user));
  for (const user of enterpriseUsers) merged.set(user.id, structuredClone(user));
  return [...merged.values()];
}

function parseEnterpriseUsersRaw(
  rawUsers: string | null,
  defaultUsers: readonly UserProfile[],
):
  | { readonly ok: true; readonly users: UserProfile[] }
  | { readonly ok: false; readonly errorCode: WorkspaceStorageErrorCode; readonly error: string } {
  if (rawUsers === null) {
    return { ok: true, users: structuredClone([...defaultUsers]) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUsers);
  } catch {
    return {
      ok: false,
      errorCode: "CORRUPT_WORKSPACE_JSON",
      error: "Dữ liệu thành viên (fraudguard-demo-users-v1) bị hỏng JSON; giữ nguyên storage để tránh ghi đè.",
    };
  }

  if (!Array.isArray(parsed) || !parsed.every(isValidAnyUserProfileShape)) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Dữ liệu thành viên không đúng cấu trúc hợp lệ; không ghi đè storage.",
    };
  }

  return {
    ok: true,
    users: mergeEnterpriseUsersWithDefaults(
      defaultUsers,
      parsed.filter(isValidUserShape),
    ),
  };
}

export function restoreEnterpriseUsers(
  defaultUsers: readonly UserProfile[],
  storage?: StorageLike,
):
  | { readonly ok: true; readonly users: UserProfile[] }
  | { readonly ok: false; readonly errorCode: WorkspaceStorageErrorCode; readonly error: string } {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return { ok: true, users: structuredClone([...defaultUsers]) };
  }

  let rawUsers: string | null;
  try {
    rawUsers = targetStorage.getItem(USERS_STORAGE_KEY_V1);
  } catch (err) {
    return {
      ok: false,
      errorCode: "STORAGE_READ_FAILED",
      error: err instanceof Error ? err.message : "Không thể đọc dữ liệu thành viên từ storage.",
    };
  }

  return parseEnterpriseUsersRaw(rawUsers, defaultUsers);
}

export function persistEnterpriseUsers(
  users: readonly UserProfile[],
  restoreStatus: WorkspaceRestoreStatus,
  storage?: StorageLike,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly errorCode: WorkspaceStorageErrorCode; readonly error: string } {
  if (restoreStatus !== "ready") {
    return {
      ok: false,
      errorCode: "RESTORE_NOT_READY",
      error: "Chưa khôi phục workspace hợp lệ nên chặn ghi đè dữ liệu thành viên.",
    };
  }
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return {
      ok: false,
      errorCode: "STORAGE_UNAVAILABLE",
      error: "Trình duyệt/môi trường hiện tại không hỗ trợ localStorage.",
    };
  }
  try {
    targetStorage.setItem(
      USERS_STORAGE_KEY_V1,
      JSON.stringify(users.filter(u => Boolean(u.enterpriseId))),
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      errorCode: "STORAGE_WRITE_FAILED",
      error: err instanceof Error ? err.message : "Không thể lưu danh sách thành viên vào storage.",
    };
  }
}

function parseJsonSafe(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function mergeProjectsWithDefaults(
  savedProjects: readonly ProjectItem[],
  defaultProjects: readonly ProjectItem[],
): ProjectItem[] {
  return [
    ...structuredClone([...savedProjects]),
    ...structuredClone(defaultProjects.filter(p => !savedProjects.some(old => old.id === p.id))),
  ];
}

function hydrateValidatedV4Payload(
  v4Obj: WorkspacePayloadV4,
  defaultProjects: readonly ProjectItem[],
  allFallbackEnterprises: readonly Enterprise[],
): WorkspacePayloadV4 {
  const mergedProjects = mergeProjectsWithDefaults(v4Obj.projects, defaultProjects);
  const loadedRuleSets = structuredClone([...v4Obj.ruleSets]);
  const reconciledEnterprises = reconcileEnterpriseProjects(
    [...v4Obj.enterprises],
    [...allFallbackEnterprises],
    mergedProjects,
    loadedRuleSets,
  );

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    rules: structuredClone([...v4Obj.rules]),
    ruleSets: loadedRuleSets,
    enterprises: reconciledEnterprises,
    legacyUnassigned: structuredClone([...(v4Obj.legacyUnassigned ?? [])]),
    projects: mergedProjects,
    transactions: structuredClone([...v4Obj.transactions]),
    auditLogs: structuredClone([...v4Obj.auditLogs]),
    investigationCases: structuredClone([...v4Obj.investigationCases]),
    legacyCaseArchive: structuredClone([...v4Obj.legacyCaseArchive]),
    reportFeedbacks: structuredClone([...(v4Obj.reportFeedbacks ?? [])]),
    migrationMeta: structuredClone(v4Obj.migrationMeta),
    ...(typeof v4Obj.wf04DemoActive === "boolean" ? { wf04DemoActive: v4Obj.wf04DemoActive } : {}),
    ...(v4Obj.preDemoSnapshot !== undefined
      ? {
          preDemoSnapshot: {
            ...structuredClone(v4Obj.preDemoSnapshot),
            reportFeedbacks: structuredClone([...(v4Obj.preDemoSnapshot.reportFeedbacks ?? [])]),
          },
        }
      : {}),
  };
}

/**
 * Restores workspace v4, safely upgrades legacy v3/v2 after backing up source to
 * `fraudguard-demo-workspace-v3-backup`, and blocks persistence if JSON/schema is invalid,
 * recovery is pending, or backup fails so source storage is never overwritten or deleted.
 */
export function restoreWorkspaceSnapshot(args: WorkspaceRestoreArgs): WorkspaceRestoreResult {
  const usersResult = restoreEnterpriseUsers(args.defaultUsers, args.storage);
  const fallbackSeed = buildSeedPayload({
    defaultRules: args.defaultRules,
    defaultEnterprises: args.defaultEnterprises,
    defaultProjects: args.defaultProjects,
    defaultTransactions: args.defaultTransactions,
    defaultAuditLogs: args.defaultAuditLogs,
    users: usersResult.ok ? usersResult.users : args.defaultUsers,
    migratedAt: args.migratedAt,
  });

  if (!usersResult.ok) {
    return {
      status: "blocked_corrupt",
      canPersist: false,
      payload: fallbackSeed,
      users: structuredClone([...args.defaultUsers]),
      errorCode: usersResult.errorCode,
      error: usersResult.error,
    };
  }

  const users = usersResult.users;
  const targetStorage = resolveStorage(args.storage);
  if (!targetStorage) {
    return {
      status: "ready",
      canPersist: true,
      payload: fallbackSeed,
      users,
    };
  }

  let rawRecovery: string | null = null;
  let rawV4: string | null = null;
  let rawUsers: string | null = null;
  let rawV3: string | null = null;
  let rawV2: string | null = null;
  try {
    rawRecovery = targetStorage.getItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4);
    rawV4 = targetStorage.getItem(WORKSPACE_STORAGE_KEY_V4);
    rawUsers = targetStorage.getItem(USERS_STORAGE_KEY_V1);
    rawV3 = targetStorage.getItem(WORKSPACE_STORAGE_KEY_V3);
    rawV2 = targetStorage.getItem(WORKSPACE_STORAGE_KEY_V2);
  } catch (err) {
    return {
      status: "blocked_corrupt",
      canPersist: false,
      payload: fallbackSeed,
      users,
      errorCode: "STORAGE_READ_FAILED",
      error: err instanceof Error ? err.message : "Không thể đọc dữ liệu workspace từ storage.",
    };
  }

  const allFallbackEnterprises = [
    ...args.defaultEnterprises,
    ...(args.extraFallbackEnterprises ?? []),
  ];

  if (rawRecovery !== null) {
    const parsedJournal = parseJsonSafe(rawRecovery);
    if (!parsedJournal.ok || !isValidRecoveryJournalShape(parsedJournal.value)) {
      return {
        status: "blocked_corrupt",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: parsedJournal.ok ? "INVALID_WORKSPACE_SHAPE" : "CORRUPT_WORKSPACE_JSON",
        error: "Nhật ký phục hồi storage (recovery journal) bị hỏng; đã khóa tự động ghi đè.",
      };
    }

    const journal = parsedJournal.value;

    if (journal.commitState === "committed_cleanup_pending") {
      if (rawV4 === null) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: "INVALID_WORKSPACE_SHAPE",
          error:
            "Nhật ký phục hồi ghi nhận thao tác đã commit nhưng không tìm thấy dữ liệu workspace v4 tương ứng.",
          recoveryJournal: structuredClone(journal),
        };
      }
      const parsedCommittedV4 = parseJsonSafe(rawV4);
      if (!parsedCommittedV4.ok) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: "CORRUPT_WORKSPACE_JSON",
          error: "Dữ liệu workspace v4 đã commit bị hỏng JSON; đã khóa ghi đè.",
          recoveryJournal: structuredClone(journal),
        };
      }
      const validatedCommittedV4 = validateWorkspacePayloadV4(parsedCommittedV4.value);
      if (!validatedCommittedV4.ok) {
        return {
          status:
            validatedCommittedV4.errorCode === "UNSUPPORTED_SCHEMA_VERSION"
              ? "blocked_unsupported_version"
              : "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: validatedCommittedV4.errorCode,
          error: validatedCommittedV4.error,
          recoveryJournal: structuredClone(journal),
        };
      }

      const currentV4Digest = computeCanonicalJsonDigestFromValue(parsedCommittedV4.value);
      if (currentV4Digest !== journal.committedV4Digest) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: "INVALID_WORKSPACE_SHAPE",
          error:
            "Mã kiểm tra dữ liệu workspace v4 không khớp với nhật ký commit đang chờ dọn; đã khóa tự động ghi đè.",
          recoveryJournal: structuredClone(journal),
        };
      }

      if (journal.committedHasUsers) {
        const currentUsersDigestRes =
          rawUsers !== null ? computeRawJsonDigest(rawUsers) : { ok: false as const };
        if (
          !currentUsersDigestRes.ok ||
          currentUsersDigestRes.digest !== journal.committedUsersDigest
        ) {
          return {
            status: "blocked_corrupt",
            canPersist: false,
            payload: fallbackSeed,
            users,
            errorCode: "INVALID_WORKSPACE_SHAPE",
            error:
              "Mã kiểm tra dữ liệu thành viên không khớp với nhật ký commit đang chờ dọn; đã khóa tự động ghi đè.",
            recoveryJournal: structuredClone(journal),
          };
        }
      } else if (journal.committedUsersDigest !== undefined) {
        const currentUsersDigestRes =
          rawUsers !== null ? computeRawJsonDigest(rawUsers) : { ok: false as const };
        if (
          !currentUsersDigestRes.ok ||
          currentUsersDigestRes.digest !== journal.committedUsersDigest
        ) {
          return {
            status: "blocked_corrupt",
            canPersist: false,
            payload: fallbackSeed,
            users,
            errorCode: "INVALID_WORKSPACE_SHAPE",
            error:
              "Trạng thái danh sách thành viên không khớp với nhật ký commit đang chờ dọn; đã khóa tự động ghi đè.",
            recoveryJournal: structuredClone(journal),
          };
        }
      } else if (rawUsers !== null) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: "INVALID_WORKSPACE_SHAPE",
          error:
            "Phát hiện khóa thành viên không khớp với nhật ký commit đang chờ dọn; đã khóa tự động ghi đè.",
          recoveryJournal: structuredClone(journal),
        };
      }

      const committedPayload = hydrateValidatedV4Payload(
        validatedCommittedV4.value,
        args.defaultProjects,
        allFallbackEnterprises,
      );

      return {
        status: "recovery_required",
        canPersist: false,
        cleanupPending: true,
        payload: committedPayload,
        users,
        errorCode: "STORAGE_CLEANUP_FAILED",
        error:
          "Dữ liệu workspace và thành viên mới đã được lưu an toàn, nhưng chưa xóa xong nhật ký phục hồi. Hãy thử dọn lại trước khi tiếp tục lưu.",
        recoveryJournal: structuredClone(journal),
      };
    }

    let recoveredUsers = users;
    if (journal.hadPriorUsersV1 && journal.priorUsersV1Raw !== null) {
      const priorUsersRes = parseEnterpriseUsersRaw(
        journal.priorUsersV1Raw,
        args.defaultUsers,
      );
      if (!priorUsersRes.ok) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: priorUsersRes.errorCode,
          error: priorUsersRes.error,
          recoveryJournal: structuredClone(journal),
        };
      }
      recoveredUsers = priorUsersRes.users;
    } else if (!journal.hadPriorUsersV1) {
      recoveredUsers = structuredClone([...args.defaultUsers]);
    }

    let recoveredPayload = fallbackSeed;
    if (journal.hadPriorWorkspaceV4 && journal.priorWorkspaceV4Raw !== null) {
      const parsedPriorV4 = parseJsonSafe(journal.priorWorkspaceV4Raw);
      if (!parsedPriorV4.ok) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: "CORRUPT_WORKSPACE_JSON",
          error: "Bản sao lưu trước phục hồi trong nhật ký bị hỏng JSON; đã khóa tự động ghi đè.",
          recoveryJournal: structuredClone(journal),
        };
      }
      const validatedPriorV4 = validateWorkspacePayloadV4(parsedPriorV4.value);
      if (!validatedPriorV4.ok) {
        return {
          status: "blocked_corrupt",
          canPersist: false,
          payload: fallbackSeed,
          users,
          errorCode: validatedPriorV4.errorCode,
          error: validatedPriorV4.error,
          recoveryJournal: structuredClone(journal),
        };
      }
      recoveredPayload = hydrateValidatedV4Payload(
        validatedPriorV4.value,
        args.defaultProjects,
        allFallbackEnterprises,
      );
    } else if (!journal.hadPriorWorkspaceV4 && rawV4 !== null) {
      const parsedCandidate = parseJsonSafe(rawV4);
      if (parsedCandidate.ok) {
        const validatedCandidate = validateWorkspacePayloadV4(parsedCandidate.value);
        if (validatedCandidate.ok) {
          recoveredPayload = hydrateValidatedV4Payload(
            validatedCandidate.value,
            args.defaultProjects,
            allFallbackEnterprises,
          );
        }
      }
    }

    if (journal.pendingPreDemoSnapshot && !recoveredPayload.preDemoSnapshot) {
      recoveredPayload = {
        ...recoveredPayload,
        wf04DemoActive: true,
        preDemoSnapshot: structuredClone(journal.pendingPreDemoSnapshot),
      };
    }

    return {
      status: "recovery_required",
      canPersist: false,
      cleanupPending: false,
      payload: recoveredPayload,
      users: recoveredUsers,
      errorCode: "STORAGE_RECOVERY_REQUIRED",
      error:
        "Phát hiện thao tác lưu workspace/thành viên trước đó bị gián đoạn khi rollback. Hãy bấm Lưu lại để đồng bộ an toàn.",
      recoveryJournal: structuredClone(journal),
    };
  }

  if (rawV4 !== null) {
    const parsedV4 = parseJsonSafe(rawV4);
    if (!parsedV4.ok || !isPlainRecord(parsedV4.value)) {
      return {
        status: "blocked_corrupt",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: parsedV4.ok ? "INVALID_WORKSPACE_SHAPE" : "CORRUPT_WORKSPACE_JSON",
        error: "Dữ liệu workspace v4 bị hỏng JSON hoặc sai cấu trúc; đã khóa ghi đè để bảo toàn storage.",
      };
    }

    const validation = validateWorkspacePayloadV4(parsedV4.value);
    if (!validation.ok) {
      return {
        status:
          validation.errorCode === "UNSUPPORTED_SCHEMA_VERSION"
            ? "blocked_unsupported_version"
            : "blocked_corrupt",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: validation.errorCode,
        error: validation.error,
      };
    }

    const payload = hydrateValidatedV4Payload(
      validation.value,
      args.defaultProjects,
      allFallbackEnterprises,
    );

    // If a pre-demo restore staged preDemoSnapshot with wf04DemoActive: false and was interrupted
    // before finalizing, keep preDemoSnapshot intact and require coordinated recovery.
    if (payload.wf04DemoActive === false && payload.preDemoSnapshot !== undefined) {
      const stagedSnap = payload.preDemoSnapshot;
      return {
        status: "recovery_required",
        canPersist: false,
        payload: {
          ...payload,
          wf04DemoActive: true,
          preDemoSnapshot: structuredClone(stagedSnap),
        },
        users: structuredClone([...stagedSnap.users]),
        errorCode: "STORAGE_RECOVERY_REQUIRED",
        error:
          "Khôi phục dữ liệu trước demo chưa hoàn tất đồng bộ danh sách thành viên; đã giữ nguyên bản chụp trước demo để tiếp tục khôi phục.",
      };
    }

    return {
      status: "ready",
      canPersist: true,
      payload,
      users,
    };
  }

  const rawLegacy = rawV3 ?? rawV2;
  if (rawLegacy !== null) {
    const sourceVersion: 2 | 3 = rawV3 !== null ? 3 : 2;
    const parsedLegacy = parseJsonSafe(rawLegacy);
    if (!parsedLegacy.ok || !isPlainRecord(parsedLegacy.value)) {
      return {
        status: "blocked_corrupt",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: parsedLegacy.ok ? "INVALID_WORKSPACE_SHAPE" : "CORRUPT_WORKSPACE_JSON",
        error: `Dữ liệu workspace v${sourceVersion} bị hỏng JSON hoặc sai cấu trúc; đã giữ nguyên bản gốc và chặn ghi đè.`,
      };
    }

    const legacyObj = parsedLegacy.value;
    if (
      "schemaVersion" in legacyObj &&
      legacyObj.schemaVersion !== undefined &&
      legacyObj.schemaVersion !== 2 &&
      legacyObj.schemaVersion !== 3
    ) {
      return {
        status: "blocked_unsupported_version",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: "UNSUPPORTED_SCHEMA_VERSION",
        error: `Phiên bản schema '${String(legacyObj.schemaVersion)}' trên khóa v${sourceVersion} không được hỗ trợ.`,
      };
    }

    const validLegacyArrays =
      Array.isArray(legacyObj.rules) &&
      legacyObj.rules.every(isValidRuleShape) &&
      (legacyObj.projects === undefined ||
        (Array.isArray(legacyObj.projects) && legacyObj.projects.every(isValidProjectShape))) &&
      (legacyObj.transactions === undefined ||
        (Array.isArray(legacyObj.transactions) &&
          legacyObj.transactions.every(isValidTransactionShape))) &&
      (legacyObj.auditLogs === undefined ||
        (Array.isArray(legacyObj.auditLogs) && legacyObj.auditLogs.every(isValidAuditLogShape))) &&
      (sourceVersion === 2 ||
        legacyObj.enterprises === undefined ||
        (Array.isArray(legacyObj.enterprises) &&
          legacyObj.enterprises.every(isValidEnterpriseShape))) &&
      (legacyObj.investigationCases === undefined ||
        isValidInvestigationCaseList(legacyObj.investigationCases)) &&
      (legacyObj.legacyCaseArchive === undefined ||
        (Array.isArray(legacyObj.legacyCaseArchive) &&
          legacyObj.legacyCaseArchive.every(isValidLegacyArchiveShape))) &&
      (legacyObj.reportFeedbacks === undefined ||
        isValidReportFeedbackList(legacyObj.reportFeedbacks));

    if (!validLegacyArrays) {
      return {
        status: "blocked_corrupt",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: "INVALID_WORKSPACE_SHAPE",
        error: `Cấu trúc dữ liệu workspace v${sourceVersion} không hợp lệ; không ghi đè bản gốc.`,
      };
    }

    try {
      targetStorage.setItem(WORKSPACE_BACKUP_KEY_V3, rawLegacy);
    } catch (err) {
      return {
        status: "pending",
        canPersist: false,
        payload: fallbackSeed,
        users,
        errorCode: "BACKUP_WRITE_FAILED",
        error:
          err instanceof Error
            ? `Không thể sao lưu workspace v${sourceVersion} trước nâng cấp: ${err.message}`
            : `Không thể sao lưu workspace v${sourceVersion} trước nâng cấp; đã hủy nâng cấp để bảo toàn dữ liệu gốc.`,
      };
    }

    const loadedProjects = Array.isArray(legacyObj.projects)
      ? mergeProjectsWithDefaults(legacyObj.projects as ProjectItem[], args.defaultProjects)
      : structuredClone([...args.defaultProjects]);

    let loadedRuleSets: ManagedRuleSet[] = [];
    let loadedLegacyUnassigned: LegacyRuleSet[] = [];
    if (Array.isArray(legacyObj.ruleSets)) {
      if (sourceVersion === 3) {
        loadedRuleSets = structuredClone(legacyObj.ruleSets as ManagedRuleSet[]);
        loadedLegacyUnassigned = structuredClone(
          (legacyObj.legacyUnassigned as LegacyRuleSet[] | undefined) ?? [],
        );
      } else {
        const migratedSets = migrateProjectSets(
          legacyObj.ruleSets as LegacyRuleSet[],
          [...args.defaultEnterprises],
        );
        loadedRuleSets = migratedSets.sets;
        loadedLegacyUnassigned = migratedSets.unassigned;
      }
    }

    const loadedEnterprises =
      sourceVersion === 3 && Array.isArray(legacyObj.enterprises)
        ? reconcileEnterpriseProjects(
            legacyObj.enterprises as Enterprise[],
            allFallbackEnterprises,
            loadedProjects,
            loadedRuleSets,
          )
        : structuredClone([...args.defaultEnterprises]);

    const loadedTransactions = Array.isArray(legacyObj.transactions)
      ? structuredClone(legacyObj.transactions as TransactionRisk[])
      : structuredClone([...args.defaultTransactions]);

    const loadedAuditLogs = Array.isArray(legacyObj.auditLogs)
      ? structuredClone(legacyObj.auditLogs as AuditLogEntry[])
      : structuredClone([...args.defaultAuditLogs]);

    const migrated = migrateWorkspaceLegacyCases({
      transactions: loadedTransactions,
      enterprises: loadedEnterprises,
      projects: loadedProjects,
      users,
      existingCases: Array.isArray(legacyObj.investigationCases)
        ? (legacyObj.investigationCases as InvestigationCase[])
        : undefined,
      existingArchive: Array.isArray(legacyObj.legacyCaseArchive)
        ? (legacyObj.legacyCaseArchive as LegacyCaseArchiveEntry[])
        : undefined,
      sourceSchema: sourceVersion === 2 ? "v2" : "v3",
      migratedAt: args.migratedAt,
    });

    const upgradedPayload: WorkspacePayloadV4 = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      rules: structuredClone(legacyObj.rules as RuleTemplate[]),
      ruleSets: loadedRuleSets,
      enterprises: loadedEnterprises,
      legacyUnassigned: loadedLegacyUnassigned,
      projects: loadedProjects,
      transactions: loadedTransactions,
      auditLogs: loadedAuditLogs,
      investigationCases: migrated.cases,
      legacyCaseArchive: migrated.legacyArchive,
      reportFeedbacks: Array.isArray(legacyObj.reportFeedbacks)
        ? structuredClone(legacyObj.reportFeedbacks as InvestigationReportFeedback[])
        : [],
      migrationMeta: {
        ...migrated.migrationMeta,
        migrationVersion: CASE_MIGRATION_VERSION,
      },
    };

    try {
      targetStorage.setItem(WORKSPACE_STORAGE_KEY_V4, JSON.stringify(upgradedPayload));
      return {
        status: "ready",
        canPersist: true,
        payload: upgradedPayload,
        users,
        migratedFromVersion: sourceVersion,
      };
    } catch (err) {
      return {
        status: "ready",
        canPersist: false,
        payload: upgradedPayload,
        users,
        migratedFromVersion: sourceVersion,
        errorCode: "STORAGE_WRITE_FAILED",
        error:
          err instanceof Error
            ? `Đã chuyển dữ liệu vào bộ nhớ phiên nhưng ghi v4 thất bại: ${err.message}`
            : "Đã chuyển dữ liệu vào bộ nhớ phiên nhưng không thể ghi vào localStorage.",
      };
    }
  }

  return {
    status: "ready",
    canPersist: true,
    payload: fallbackSeed,
    users,
  };
}

function restoreKeyToPriorState(
  storage: StorageLike,
  key: string,
  hadPrior: boolean,
  priorRaw: string | null,
): void {
  if (hadPrior && priorRaw !== null) {
    storage.setItem(key, priorRaw);
    return;
  }
  if (typeof storage.removeItem === "function") {
    storage.removeItem(key);
    return;
  }
  throw new Error(`Storage implementation lacks removeItem("${key}") for rollback.`);
}

function cleanupRecoveryJournal(
  storage: StorageLike,
  committedJournal: WorkspaceRecoveryJournal,
  preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot,
): PersistCoordinatedResult | null {
  if (typeof storage.removeItem !== "function") {
    return {
      ok: false,
      errorCode: "STORAGE_CLEANUP_FAILED",
      error:
        "Bộ nhớ trình duyệt không hỗ trợ removeItem để xóa nhật ký phục hồi sau khi đã lưu dữ liệu chính.",
      committed: true,
      cleanupPending: true,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: true,
      recoveryJournal: committedJournal,
      ...(preservePreDemoSnapshot ? { preservePreDemoSnapshot } : {}),
    };
  }
  try {
    storage.removeItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4);
    return null;
  } catch (cleanupErr) {
    return {
      ok: false,
      errorCode: "STORAGE_CLEANUP_FAILED",
      error:
        cleanupErr instanceof Error
          ? `Dữ liệu mới đã được lưu an toàn nhưng chưa xóa được nhật ký phục hồi: ${cleanupErr.message}`
          : "Dữ liệu mới đã được lưu an toàn nhưng chưa xóa được nhật ký phục hồi.",
      committed: true,
      cleanupPending: true,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: true,
      recoveryJournal: committedJournal,
      ...(preservePreDemoSnapshot ? { preservePreDemoSnapshot } : {}),
    };
  }
}

/**
 * Shared coordinator for workspace v4 and enterprise users v1 persistence.
 * Captures prior raw state of both keys before writing, aborts on read error,
 * rolls back newly created or modified keys on partial failure, marks committed
 * state in the recovery journal before journal deletion, and preserves recovery
 * invariants across interrupted cleanup or rollback failures.
 */
export function persistWorkspaceAndUsers(args: {
  payload: WorkspacePayloadV4;
  users?: readonly UserProfile[];
  restoreStatus: WorkspaceRestoreStatus;
  storage?: StorageLike;
  operation?: string;
  allowRecoveryOverwrite?: boolean;
  preservePreDemoSnapshotUntilCommitted?: PreDemoWorkspaceSnapshot;
}): PersistCoordinatedResult {
  const canWriteInCurrentStatus =
    args.restoreStatus === "ready" ||
    (Boolean(args.allowRecoveryOverwrite) && args.restoreStatus === "recovery_required");

  if (!canWriteInCurrentStatus) {
    return {
      ok: false,
      errorCode:
        args.restoreStatus === "recovery_required"
          ? "STORAGE_RECOVERY_REQUIRED"
          : "RESTORE_NOT_READY",
      error:
        args.restoreStatus === "recovery_required"
          ? "Storage đang ở trạng thái cần phục hồi đồng bộ trước khi ghi tự động."
          : "Không thể lưu dữ liệu khi trạng thái khôi phục chưa sẵn sàng hoặc đang bị khóa.",
      committed: false,
      cleanupPending: false,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: args.restoreStatus === "recovery_required",
      preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
    };
  }

  const targetStorage = resolveStorage(args.storage);
  if (!targetStorage) {
    return {
      ok: false,
      errorCode: "STORAGE_UNAVAILABLE",
      error: "Không có localStorage khả dụng để lưu dữ liệu.",
      committed: false,
      cleanupPending: false,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: false,
      preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
    };
  }

  let priorWorkspaceV4Raw: string | null = null;
  let priorUsersV1Raw: string | null = null;
  let existingJournalRaw: string | null = null;
  try {
    priorWorkspaceV4Raw = targetStorage.getItem(WORKSPACE_STORAGE_KEY_V4);
    priorUsersV1Raw = targetStorage.getItem(USERS_STORAGE_KEY_V1);
    existingJournalRaw = targetStorage.getItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4);
  } catch (err) {
    return {
      ok: false,
      errorCode: "STORAGE_READ_FAILED",
      error:
        err instanceof Error
          ? `Không thể đọc trạng thái storage trước khi lưu: ${err.message}`
          : "Không thể đọc trạng thái storage trước khi lưu; đã dừng ghi để bảo toàn dữ liệu.",
      committed: false,
      cleanupPending: false,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: false,
      preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
    };
  }

  let existingJournal: WorkspaceRecoveryJournal | null = null;
  if (existingJournalRaw !== null) {
    const parsedJournal = parseJsonSafe(existingJournalRaw);
    if (!parsedJournal.ok || !isValidRecoveryJournalShape(parsedJournal.value)) {
      return {
        ok: false,
        errorCode: parsedJournal.ok ? "INVALID_WORKSPACE_SHAPE" : "CORRUPT_WORKSPACE_JSON",
        error: "Nhật ký phục hồi storage không hợp lệ; đã dừng ghi để bảo toàn dữ liệu.",
        committed: false,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: false,
        preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
      };
    }
    existingJournal = parsedJournal.value;
  }

  if (args.payload.reportFeedbacks !== undefined) {
    const feedbackValidation = validateReportFeedbackList(args.payload.reportFeedbacks);
    if (!feedbackValidation.ok) {
      return {
        ok: false,
        errorCode: "INVALID_WORKSPACE_SHAPE",
        error: `Dữ liệu phản hồi báo cáo điều tra (reportFeedbacks) không hợp lệ: ${feedbackValidation.reason}`,
        committed: false,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: false,
        preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
      };
    }
  }

  const normalizedPayload: WorkspacePayloadV4 = {
    ...args.payload,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
  };
  const serializedV4 = JSON.stringify(normalizedPayload);
  const v4DigestRes = computeRawJsonDigest(serializedV4);
  if (!v4DigestRes.ok) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Không thể tuần tự hóa payload workspace v4 để tính mã kiểm tra.",
      committed: false,
      cleanupPending: false,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: false,
      preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
    };
  }
  const targetV4Digest = v4DigestRes.digest;

  const serializedUsers =
    args.users !== undefined
      ? JSON.stringify(args.users.filter(u => Boolean(u.enterpriseId)))
      : undefined;
  let targetUsersDigest: string | undefined;
  if (serializedUsers !== undefined) {
    const usersDigestRes = computeRawJsonDigest(serializedUsers);
    if (!usersDigestRes.ok) {
      return {
        ok: false,
        errorCode: "INVALID_WORKSPACE_SHAPE",
        error: "Không thể tuần tự hóa danh sách thành viên để tính mã kiểm tra.",
        committed: false,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: false,
        preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
      };
    }
    targetUsersDigest = usersDigestRes.digest;
  } else if (priorUsersV1Raw !== null) {
    const priorUsersDigestRes = computeRawJsonDigest(priorUsersV1Raw);
    if (!priorUsersDigestRes.ok) {
      return {
        ok: false,
        errorCode: "CORRUPT_WORKSPACE_JSON",
        error: "Dữ liệu thành viên hiện có bị hỏng JSON; dừng ghi để bảo toàn storage.",
        committed: false,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: false,
        preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
      };
    }
    targetUsersDigest = priorUsersDigestRes.digest;
  }

  const demoRestoreFinalized =
    normalizedPayload.wf04DemoActive === false &&
    normalizedPayload.preDemoSnapshot === undefined;
  const preservePreDemoOnCleanup = demoRestoreFinalized
    ? undefined
    : args.preservePreDemoSnapshotUntilCommitted;

  if (existingJournal !== null) {
    if (existingJournal.commitState === "committed_cleanup_pending") {
      const storageV4DigestRes =
        priorWorkspaceV4Raw !== null
          ? computeRawJsonDigest(priorWorkspaceV4Raw)
          : { ok: false as const };
      const storageUsersDigestRes =
        priorUsersV1Raw !== null ? computeRawJsonDigest(priorUsersV1Raw) : null;
      const storageUsersMatches = existingJournal.committedHasUsers
        ? storageUsersDigestRes !== null &&
          storageUsersDigestRes.ok &&
          storageUsersDigestRes.digest === existingJournal.committedUsersDigest
        : existingJournal.committedUsersDigest !== undefined
          ? storageUsersDigestRes !== null &&
            storageUsersDigestRes.ok &&
            storageUsersDigestRes.digest === existingJournal.committedUsersDigest
          : priorUsersV1Raw === null;

      if (
        !storageV4DigestRes.ok ||
        storageV4DigestRes.digest !== existingJournal.committedV4Digest ||
        !storageUsersMatches
      ) {
        return {
          ok: false,
          errorCode: "INVALID_WORKSPACE_SHAPE",
          error:
            "Trạng thái dữ liệu trong storage không khớp với nhật ký commit đang chờ dọn; đã dừng ghi.",
          committed: false,
          cleanupPending: false,
          rolledBack: false,
          rollbackFailed: false,
          recoveryRequired: true,
          recoveryJournal: existingJournal,
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      }

      if (!args.allowRecoveryOverwrite) {
        return {
          ok: false,
          errorCode: "STORAGE_CLEANUP_FAILED",
          error:
            "Đang chờ dọn nhật ký phục hồi sau khi đã lưu dữ liệu chính; chặn tự động ghi đè.",
          committed: true,
          cleanupPending: true,
          rolledBack: false,
          rollbackFailed: false,
          recoveryRequired: true,
          recoveryJournal: existingJournal,
          ...(preservePreDemoOnCleanup ? { preservePreDemoSnapshot: preservePreDemoOnCleanup } : {}),
        };
      }

      const callerMatchesCommittedUsers =
        serializedUsers !== undefined
          ? targetUsersDigest === existingJournal.committedUsersDigest
          : true;

      if (targetV4Digest === existingJournal.committedV4Digest && callerMatchesCommittedUsers) {
        const cleanupError = cleanupRecoveryJournal(
          targetStorage,
          existingJournal,
          preservePreDemoOnCleanup,
        );
        if (cleanupError) return cleanupError;
        return {
          ok: true,
          payload: normalizedPayload,
          users: args.users,
          committed: true,
          cleanupPending: false,
          rolledBack: false,
          rollbackFailed: false,
          recoveryRequired: false,
        };
      }

      // Caller has newer edits while a committed_cleanup_pending journal sits in storage:
      // transition the journal back to pending pointing at the already-committed raw state first.
      const advancedPendingJournal: WorkspaceRecoveryJournal = {
        version: 1,
        recordedAt: new Date().toISOString(),
        operation: args.operation ?? "persistWorkspaceAndUsers",
        commitState: "pending",
        hadPriorWorkspaceV4: priorWorkspaceV4Raw !== null,
        priorWorkspaceV4Raw,
        hadPriorUsersV1: priorUsersV1Raw !== null,
        priorUsersV1Raw,
        ...(args.preservePreDemoSnapshotUntilCommitted
          ? {
              pendingPreDemoSnapshot: structuredClone(
                args.preservePreDemoSnapshotUntilCommitted,
              ),
            }
          : {}),
      };
      try {
        targetStorage.setItem(
          WORKSPACE_RECOVERY_JOURNAL_KEY_V4,
          JSON.stringify(advancedPendingJournal),
        );
        existingJournal = advancedPendingJournal;
      } catch (err) {
        return {
          ok: false,
          errorCode: "STORAGE_CLEANUP_FAILED",
          error:
            err instanceof Error
              ? `Không thể cập nhật nhật ký phục hồi trước thao tác mới: ${err.message}`
              : "Không thể cập nhật nhật ký phục hồi trước thao tác mới.",
          committed: true,
          cleanupPending: true,
          rolledBack: false,
          rollbackFailed: false,
          recoveryRequired: true,
          recoveryJournal: existingJournal,
          ...(preservePreDemoOnCleanup ? { preservePreDemoSnapshot: preservePreDemoOnCleanup } : {}),
        };
      }
    } else if (!args.allowRecoveryOverwrite) {
      return {
        ok: false,
        errorCode: "STORAGE_RECOVERY_REQUIRED",
        error:
          "Phát hiện nhật ký phục hồi chưa hoàn tất; chặn ghi đè tự động cho đến khi thực hiện phục hồi.",
        committed: false,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: true,
        recoveryJournal: existingJournal,
        preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
      };
    }
  }

  const rollbackHadPriorV4 =
    existingJournal !== null ? existingJournal.hadPriorWorkspaceV4 : priorWorkspaceV4Raw !== null;
  const rollbackPriorV4Raw =
    existingJournal !== null ? existingJournal.priorWorkspaceV4Raw : priorWorkspaceV4Raw;
  const rollbackHadPriorUsers =
    existingJournal !== null ? existingJournal.hadPriorUsersV1 : priorUsersV1Raw !== null;
  const rollbackPriorUsersRaw =
    existingJournal !== null ? existingJournal.priorUsersV1Raw : priorUsersV1Raw;

  const needsTwoPhasePreDemoGuard =
    args.users !== undefined &&
    args.preservePreDemoSnapshotUntilCommitted !== undefined &&
    normalizedPayload.preDemoSnapshot === undefined;

  const firstWritePayload: WorkspacePayloadV4 = needsTwoPhasePreDemoGuard
    ? {
        ...normalizedPayload,
        preDemoSnapshot: structuredClone(args.preservePreDemoSnapshotUntilCommitted),
      }
    : normalizedPayload;

  try {
    targetStorage.setItem(WORKSPACE_STORAGE_KEY_V4, JSON.stringify(firstWritePayload));
  } catch (err) {
    return {
      ok: false,
      errorCode: "STORAGE_WRITE_FAILED",
      error:
        err instanceof Error
          ? `Lưu workspace thất bại: ${err.message}`
          : "Không thể ghi dữ liệu workspace vào localStorage.",
      committed: false,
      cleanupPending: false,
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: existingJournal !== null,
      ...(existingJournal !== null ? { recoveryJournal: existingJournal } : {}),
      preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
    };
  }

  if (serializedUsers !== undefined) {
    try {
      targetStorage.setItem(USERS_STORAGE_KEY_V1, serializedUsers);
    } catch (usersErr) {
      try {
        restoreKeyToPriorState(
          targetStorage,
          WORKSPACE_STORAGE_KEY_V4,
          rollbackHadPriorV4,
          rollbackPriorV4Raw,
        );
        return {
          ok: false,
          errorCode: "STORAGE_WRITE_FAILED",
          error:
            usersErr instanceof Error
              ? `Lưu danh sách thành viên thất bại (đã hoàn tác workspace): ${usersErr.message}`
              : "Lưu danh sách thành viên thất bại; đã hoàn tác workspace về trạng thái trước đó.",
          committed: false,
          cleanupPending: false,
          rolledBack: true,
          rollbackFailed: false,
          recoveryRequired: existingJournal !== null,
          ...(existingJournal !== null ? { recoveryJournal: existingJournal } : {}),
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      } catch (rollbackErr) {
        const journal: WorkspaceRecoveryJournal = {
          version: 1,
          recordedAt: new Date().toISOString(),
          operation: args.operation ?? "persistWorkspaceAndUsers",
          commitState: "pending",
          hadPriorWorkspaceV4: rollbackHadPriorV4,
          priorWorkspaceV4Raw: rollbackPriorV4Raw,
          hadPriorUsersV1: rollbackHadPriorUsers,
          priorUsersV1Raw: rollbackPriorUsersRaw,
          ...(args.preservePreDemoSnapshotUntilCommitted
            ? {
                pendingPreDemoSnapshot: structuredClone(
                  args.preservePreDemoSnapshotUntilCommitted,
                ),
              }
            : {}),
        };
        try {
          targetStorage.setItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4, JSON.stringify(journal));
        } catch {
          // Best-effort journal write; staged payload also preserves preDemoSnapshot if applicable.
        }
        return {
          ok: false,
          errorCode: "STORAGE_ROLLBACK_FAILED",
          error:
            rollbackErr instanceof Error
              ? `Ghi thành viên thất bại và hoàn tác workspace không thành công: ${rollbackErr.message}`
              : "Ghi thành viên thất bại và không thể hoàn tác workspace; cần phục hồi đồng bộ.",
          committed: false,
          cleanupPending: false,
          rolledBack: false,
          rollbackFailed: true,
          recoveryRequired: true,
          recoveryJournal: journal,
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      }
    }
  }

  if (needsTwoPhasePreDemoGuard) {
    try {
      targetStorage.setItem(WORKSPACE_STORAGE_KEY_V4, serializedV4);
    } catch (finalizeErr) {
      try {
        restoreKeyToPriorState(
          targetStorage,
          USERS_STORAGE_KEY_V1,
          rollbackHadPriorUsers,
          rollbackPriorUsersRaw,
        );
        restoreKeyToPriorState(
          targetStorage,
          WORKSPACE_STORAGE_KEY_V4,
          rollbackHadPriorV4,
          rollbackPriorV4Raw,
        );
        return {
          ok: false,
          errorCode: "STORAGE_WRITE_FAILED",
          error:
            finalizeErr instanceof Error
              ? `Không thể hoàn tất bước dọn snapshot demo (đã hoàn tác): ${finalizeErr.message}`
              : "Không thể hoàn tất lưu khôi phục demo; đã hoàn tác về trạng thái trước đó.",
          committed: false,
          cleanupPending: false,
          rolledBack: true,
          rollbackFailed: false,
          recoveryRequired: existingJournal !== null,
          ...(existingJournal !== null ? { recoveryJournal: existingJournal } : {}),
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      } catch {
        return {
          ok: false,
          errorCode: "STORAGE_ROLLBACK_FAILED",
          error:
            "Không thể hoàn tất dọn snapshot sau khôi phục demo; bản chụp trước demo vẫn được giữ nguyên để phục hồi.",
          committed: false,
          cleanupPending: false,
          rolledBack: false,
          rollbackFailed: true,
          recoveryRequired: true,
          ...(existingJournal !== null ? { recoveryJournal: existingJournal } : {}),
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      }
    }
  }

  if (existingJournal !== null) {
    const committedJournal: WorkspaceRecoveryJournal = {
      version: 1,
      recordedAt: existingJournal.recordedAt,
      operation: existingJournal.operation,
      commitState: "committed_cleanup_pending",
      hadPriorWorkspaceV4: rollbackHadPriorV4,
      priorWorkspaceV4Raw: rollbackPriorV4Raw,
      hadPriorUsersV1: rollbackHadPriorUsers,
      priorUsersV1Raw: rollbackPriorUsersRaw,
      ...(!demoRestoreFinalized && existingJournal.pendingPreDemoSnapshot
        ? {
            pendingPreDemoSnapshot: structuredClone(
              existingJournal.pendingPreDemoSnapshot,
            ),
          }
        : {}),
      committedV4Digest: targetV4Digest,
      committedHasUsers: serializedUsers !== undefined,
      ...(targetUsersDigest !== undefined ? { committedUsersDigest: targetUsersDigest } : {}),
      committedAt: new Date().toISOString(),
    };

    try {
      targetStorage.setItem(
        WORKSPACE_RECOVERY_JOURNAL_KEY_V4,
        JSON.stringify(committedJournal),
      );
    } catch (markerErr) {
      try {
        if (serializedUsers !== undefined) {
          restoreKeyToPriorState(
            targetStorage,
            USERS_STORAGE_KEY_V1,
            rollbackHadPriorUsers,
            rollbackPriorUsersRaw,
          );
        }
        restoreKeyToPriorState(
          targetStorage,
          WORKSPACE_STORAGE_KEY_V4,
          rollbackHadPriorV4,
          rollbackPriorV4Raw,
        );
        return {
          ok: false,
          errorCode: "STORAGE_WRITE_FAILED",
          error:
            markerErr instanceof Error
              ? `Không thể ghi dấu xác nhận commit vào nhật ký phục hồi (đã hoàn tác): ${markerErr.message}`
              : "Không thể ghi dấu xác nhận commit vào nhật ký phục hồi; đã hoàn tác dữ liệu về trạng thái trước đó.",
          committed: false,
          cleanupPending: false,
          rolledBack: true,
          rollbackFailed: false,
          recoveryRequired: true,
          recoveryJournal: existingJournal,
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      } catch (rollbackErr) {
        return {
          ok: false,
          errorCode: "STORAGE_ROLLBACK_FAILED",
          error:
            rollbackErr instanceof Error
              ? `Ghi dấu xác nhận commit thất bại và hoàn tác không thành công: ${rollbackErr.message}`
              : "Ghi dấu xác nhận commit thất bại và không thể hoàn tác về trạng thái trước đó.",
          committed: false,
          cleanupPending: false,
          rolledBack: false,
          rollbackFailed: true,
          recoveryRequired: true,
          recoveryJournal: existingJournal,
          preservePreDemoSnapshot: args.preservePreDemoSnapshotUntilCommitted,
        };
      }
    }

    const cleanupError = cleanupRecoveryJournal(
      targetStorage,
      committedJournal,
      preservePreDemoOnCleanup,
    );
    if (cleanupError) return cleanupError;
  }

  return {
    ok: true,
    payload: normalizedPayload,
    users: args.users,
    committed: true,
    cleanupPending: false,
    rolledBack: false,
    rollbackFailed: false,
    recoveryRequired: false,
  };
}

/**
 * Explicit recovery helper that re-persists workspace and users with `allowRecoveryOverwrite: true`
 * and clears any pending recovery journal upon success.
 */
export function recoverWorkspaceStorage(args: {
  payload: WorkspacePayloadV4;
  users?: readonly UserProfile[];
  restoreStatus: WorkspaceRestoreStatus;
  storage?: StorageLike;
}): PersistCoordinatedResult {
  return persistWorkspaceAndUsers({
    payload: args.payload,
    users: args.users,
    restoreStatus: args.restoreStatus,
    storage: args.storage,
    operation: "recoverWorkspaceStorage",
    allowRecoveryOverwrite: true,
  });
}

/**
 * Persists a complete v4 workspace payload without overwriting blocked/unrestored storage.
 */
export function persistWorkspaceSnapshot(
  payload: WorkspacePayloadV4,
  restoreStatus: WorkspaceRestoreStatus,
  storage?: StorageLike,
  options?: { allowRecoveryOverwrite?: boolean },
): PersistWorkspaceResult {
  return persistWorkspaceAndUsers({
    payload,
    restoreStatus,
    storage,
    operation: "persistWorkspaceSnapshot",
    allowRecoveryOverwrite: options?.allowRecoveryOverwrite,
  });
}

/**
 * Unified writer for partial workspace slice updates (e.g. onboarding actions) so
 * cases, legacy archive, migration metadata, users, and schemaVersion stay consistent.
 */
export function mergeAndPersistWorkspaceSlice(args: {
  currentPayload: WorkspacePayloadV4;
  patch: Partial<Omit<WorkspacePayloadV4, "schemaVersion">>;
  restoreStatus: WorkspaceRestoreStatus;
  users?: readonly UserProfile[];
  storage?: StorageLike;
  allowRecoveryOverwrite?: boolean;
}): PersistWorkspaceResult {
  const nextPayload: WorkspacePayloadV4 = {
    ...args.currentPayload,
    ...args.patch,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
  };

  return persistWorkspaceAndUsers({
    payload: nextPayload,
    users: args.users,
    restoreStatus: args.restoreStatus,
    storage: args.storage,
    operation: "mergeAndPersistWorkspaceSlice",
    allowRecoveryOverwrite: args.allowRecoveryOverwrite,
  });
}
