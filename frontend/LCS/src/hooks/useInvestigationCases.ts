import { useCallback, useEffect, useReducer, useRef } from "react";

import type { Enterprise } from "@/types/enterprise";
import type {
  AuditAction,
  AuditLogEntry,
  ProjectItem,
  TransactionRisk,
  UserProfile,
} from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseActorInput,
  InvestigationCaseAlertReportItemInput,
  InvestigationCaseErrorCode,
  InvestigationCaseEvent,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import type {
  FeedbackActorDirectoryEntry,
  InvestigationReportFeedback,
  InvestigationReportFeedbackErrorCode,
} from "@/types/report-feedback";
import {
  isAlertBlockedByCasesOrLegacy,
  type LegacyCaseArchiveEntry,
} from "@/utils/case-migration";
import { parseStrictIsoTimestamp } from "@/utils/enterprise-lifecycle";
import {
  assignInvestigatorToCase,
  confirmInvestigationCaseReport,
  createInvestigationCase,
  requestInvestigationCaseRevision,
  selfAssignInvestigationCase,
  submitInvestigationReport,
} from "@/utils/investigation-case";
import { submitConfirmedReportFeedback } from "@/utils/report-feedback";
import {
  persistWorkspaceAndUsers,
  persistWorkspaceSnapshot,
  type PersistCoordinatedResult,
  type PersistWorkspaceResult,
  type PreDemoWorkspaceSnapshot,
  type StorageLike,
  type WorkspacePayloadV4,
  type WorkspaceRecoveryJournal,
  type WorkspaceRestoreStatus,
  type WorkspaceStorageErrorCode,
} from "@/utils/workspace-storage";

export type InvestigationHookActor = InvestigationCaseActorInput & {
  email?: string;
  ipAddress?: string;
};

export interface InvestigationCasesSnapshot {
  readonly cases: readonly InvestigationCase[];
  readonly feedbacks?: readonly InvestigationReportFeedback[];
  readonly enterprises: readonly Enterprise[];
  readonly projects?: readonly Pick<ProjectItem, "id">[];
  readonly alerts: readonly TransactionRisk[];
  readonly legacyArchive: readonly LegacyCaseArchiveEntry[];
  readonly users: readonly (InvestigationCaseActorInput & { email?: string })[];
}

export interface CreateCaseCommandArgs {
  alertIds: readonly string[];
  caseId?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
}

export interface AssignInvestigatorCommandArgs {
  caseId: string;
  assigneeId: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
}

export interface SelfAssignCaseCommandArgs {
  caseId: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
}

export interface SubmitInvestigationReportCommandArgs {
  caseId: string;
  summary: string;
  alertResults: readonly InvestigationCaseAlertReportItemInput[];
  expectedStatus?: InvestigationCaseStatus;
  expectedBaseVersion?: number;
  reportId?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
}

export interface RequestInvestigationRevisionCommandArgs {
  caseId: string;
  reason: string;
  expectedReportId: string;
  expectedReportVersion: number;
  eventId?: string;
  auditId?: string;
  at?: string;
  ipAddress?: string;
}

export interface ConfirmInvestigationReportCommandArgs {
  caseId: string;
  reportId: string;
  reportVersion: number;
  finalSummary?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
}

export interface SubmitConfirmedReportFeedbackCommandArgs {
  caseId: string;
  expectedReportId: string;
  expectedReportVersion: number;
  smeComment?: string;
  feedbackId?: string;
  auditId?: string;
  at?: string;
  ipAddress?: string;
}

export interface InvestigationHookStorageError {
  readonly code:
    | WorkspaceStorageErrorCode
    | InvestigationCaseErrorCode
    | InvestigationReportFeedbackErrorCode;
  readonly error: string;
  readonly committed?: boolean;
  readonly cleanupPending?: boolean;
  readonly rolledBack?: boolean;
  readonly rollbackFailed?: boolean;
  readonly recoveryRequired?: boolean;
  readonly recoveryJournal?: WorkspaceRecoveryJournal;
  readonly preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot;
}

export type PureCaseCommandExecutionResult =
  | {
      readonly ok: true;
      readonly investigationCase: InvestigationCase;
      readonly event: InvestigationCaseEvent;
      readonly auditEntry: AuditLogEntry;
      readonly nextCases: readonly InvestigationCase[];
    }
  | {
      readonly ok: false;
      readonly code: InvestigationCaseErrorCode;
      readonly error: string;
    };

export type InvestigationActionOutcome =
  | {
      readonly ok: true;
      readonly investigationCase: InvestigationCase;
      readonly event: InvestigationCaseEvent;
      readonly auditEntry: AuditLogEntry;
      readonly persisted: boolean;
      readonly storageError: InvestigationHookStorageError | null;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly rolledBack?: boolean;
      readonly rollbackFailed?: boolean;
      readonly recoveryRequired?: boolean;
    }
  | {
      readonly ok: false;
      readonly code: InvestigationCaseErrorCode;
      readonly error: string;
    };

export type PureFeedbackCommandExecutionResult =
  | {
      readonly ok: true;
      readonly feedback: InvestigationReportFeedback;
      readonly feedbacks: readonly InvestigationReportFeedback[];
      readonly auditEntry: AuditLogEntry;
    }
  | {
      readonly ok: false;
      readonly code: InvestigationReportFeedbackErrorCode;
      readonly error: string;
      readonly existingFeedbackId?: string;
    };

export type SubmitFeedbackOutcome =
  | {
      readonly ok: true;
      readonly feedback: InvestigationReportFeedback;
      readonly feedbacks: readonly InvestigationReportFeedback[];
      readonly auditEntry: AuditLogEntry;
      readonly persisted: boolean;
      readonly storageError: InvestigationHookStorageError | null;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly rolledBack?: boolean;
      readonly rollbackFailed?: boolean;
      readonly recoveryRequired?: boolean;
    }
  | {
      readonly ok: false;
      readonly code: InvestigationReportFeedbackErrorCode;
      readonly error: string;
      readonly existingFeedbackId?: string;
    };

export interface RetryPersistOutcome {
  readonly ok: boolean;
  readonly persistedAt: string | null;
  readonly storageError: InvestigationHookStorageError | null;
  readonly committed?: boolean;
  readonly cleanupPending?: boolean;
  readonly rolledBack?: boolean;
  readonly rollbackFailed?: boolean;
  readonly recoveryRequired?: boolean;
}

export interface InvestigationCasesState {
  readonly inMemoryCases: readonly InvestigationCase[];
  readonly lastPersistedCases: readonly InvestigationCase[];
  readonly inMemoryFeedbacks: readonly InvestigationReportFeedback[];
  readonly lastPersistedFeedbacks: readonly InvestigationReportFeedback[];
  readonly lastPersistedAt: string | null;
  readonly hasUnsavedChanges: boolean;
  readonly committed: boolean;
  readonly cleanupPending: boolean;
  readonly storageError: InvestigationHookStorageError | null;
}

export type InvestigationCasesReducerAction =
  | {
      readonly type: "COMMAND_COMMITTED";
      readonly nextCases: readonly InvestigationCase[];
      readonly persisted: boolean;
      readonly persistedAt?: string;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly storageError?: InvestigationHookStorageError | null;
    }
  | {
      readonly type: "FEEDBACK_COMMITTED";
      readonly nextFeedbacks: readonly InvestigationReportFeedback[];
      readonly persisted: boolean;
      readonly persistedAt?: string;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly storageError?: InvestigationHookStorageError | null;
    }
  | {
      readonly type: "PERSIST_SUCCEEDED";
      readonly persistedCases: readonly InvestigationCase[];
      readonly persistedFeedbacks?: readonly InvestigationReportFeedback[];
      readonly persistedAt: string;
    }
  | {
      readonly type: "PERSIST_FAILED";
      readonly storageError: InvestigationHookStorageError;
    }
  | {
      readonly type: "REPLACE_CASES";
      readonly nextCases: readonly InvestigationCase[];
      readonly nextFeedbacks?: readonly InvestigationReportFeedback[];
      readonly persisted: boolean;
      readonly persistedAt: string | null;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly storageError?: InvestigationHookStorageError | null;
    }
  | {
      readonly type: "REPLACE_FEEDBACKS";
      readonly nextFeedbacks: readonly InvestigationReportFeedback[];
      readonly persisted: boolean;
      readonly persistedAt: string | null;
      readonly committed?: boolean;
      readonly cleanupPending?: boolean;
      readonly storageError?: InvestigationHookStorageError | null;
    };

export interface UseInvestigationCasesOptions {
  readonly enterprises: readonly Enterprise[];
  readonly projects?: readonly Pick<ProjectItem, "id">[];
  readonly alerts: readonly TransactionRisk[];
  readonly legacyArchive: readonly LegacyCaseArchiveEntry[];
  readonly users: readonly UserProfile[];
  readonly currentActor: InvestigationHookActor;
  readonly cases?: readonly InvestigationCase[];
  readonly initialCases?: readonly InvestigationCase[];
  readonly feedbacks?: readonly InvestigationReportFeedback[];
  readonly initialFeedbacks?: readonly InvestigationReportFeedback[];
  readonly restoreStatus?: WorkspaceRestoreStatus;
  readonly initialPersistedAt?: string | null;
  readonly storage?: StorageLike;
  readonly now?: () => string;
  readonly persistUsersWithWorkspace?: boolean;
  readonly buildWorkspacePayload?: (args: {
    nextCases: readonly InvestigationCase[];
    nextFeedbacks?: readonly InvestigationReportFeedback[];
    auditEntry?: AuditLogEntry;
  }) => WorkspacePayloadV4;
  readonly persistCases?: (args: {
    nextCases: readonly InvestigationCase[];
    nextFeedbacks?: readonly InvestigationReportFeedback[];
    auditEntry?: AuditLogEntry;
    allowRecoveryOverwrite?: boolean;
  }) =>
    | PersistCoordinatedResult
    | PersistWorkspaceResult
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly errorCode: WorkspaceStorageErrorCode;
        readonly error: string;
        readonly committed?: boolean;
        readonly cleanupPending?: boolean;
        readonly rolledBack?: boolean;
        readonly rollbackFailed?: boolean;
        readonly recoveryRequired?: boolean;
        readonly recoveryJournal?: WorkspaceRecoveryJournal;
        readonly preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot;
      };
  readonly onCasesChange?: (nextCases: readonly InvestigationCase[]) => void;
  readonly onFeedbacksChange?: (nextFeedbacks: readonly InvestigationReportFeedback[]) => void;
  readonly onAuditEntry?: (auditEntry: AuditLogEntry) => void;
}

export interface UseInvestigationCasesResult {
  readonly cases: readonly InvestigationCase[];
  readonly lastPersistedCases: readonly InvestigationCase[];
  readonly feedbacks: readonly InvestigationReportFeedback[];
  readonly lastPersistedFeedbacks: readonly InvestigationReportFeedback[];
  readonly lastPersistedAt: string | null;
  readonly hasUnsavedChanges: boolean;
  readonly committed: boolean;
  readonly cleanupPending: boolean;
  readonly storageError: InvestigationHookStorageError | null;
  readonly createCase: (args: CreateCaseCommandArgs) => InvestigationActionOutcome;
  readonly assignInvestigator: (
    args: AssignInvestigatorCommandArgs,
  ) => InvestigationActionOutcome;
  readonly selfAssign: (args: SelfAssignCaseCommandArgs) => InvestigationActionOutcome;
  readonly submitReport: (
    args: SubmitInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  readonly requestRevision: (
    args: RequestInvestigationRevisionCommandArgs,
  ) => InvestigationActionOutcome;
  readonly confirmAndCloseReport: (
    args: ConfirmInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  readonly submitReportFeedback: (
    args: SubmitConfirmedReportFeedbackCommandArgs,
  ) => SubmitFeedbackOutcome;
  readonly retryPersist: (options?: {
    allowRecoveryOverwrite?: boolean;
    operation?: string;
  }) => RetryPersistOutcome;
  readonly replaceCases: (
    nextCases: readonly InvestigationCase[],
    options?: {
      nextFeedbacks?: readonly InvestigationReportFeedback[];
      persisted?: boolean;
      persistedAt?: string | null;
      committed?: boolean;
      cleanupPending?: boolean;
      storageError?: InvestigationHookStorageError | null;
    },
  ) => void;
  readonly replaceFeedbacks: (
    nextFeedbacks: readonly InvestigationReportFeedback[],
    options?: {
      persisted?: boolean;
      persistedAt?: string | null;
      committed?: boolean;
      cleanupPending?: boolean;
      storageError?: InvestigationHookStorageError | null;
    },
  ) => void;
}

let generatedIdCounter = 0;

function nextSequenceNumber(): number {
  generatedIdCounter += 1;
  return generatedIdCounter;
}

function defaultNowIso(): string {
  return new Date().toISOString();
}

function resolveDefaultCaseId(
  cases: readonly InvestigationCase[],
  legacyArchive: readonly LegacyCaseArchiveEntry[],
): string {
  const usedIds = new Set<string>();
  for (const item of cases) {
    usedIds.add(item.caseId);
  }
  for (const archived of legacyArchive) {
    if (archived.legacyCaseId) {
      usedIds.add(archived.legacyCaseId);
    }
  }

  let ordinal = cases.length + 1;
  while (ordinal < cases.length + 100000) {
    const candidate = `CASE-WF04-${String(ordinal).padStart(4, "0")}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
    ordinal += 1;
  }
  return `CASE-WF04-${String(nextSequenceNumber()).padStart(6, "0")}`;
}

function resolveDefaultEventId(existingCase?: InvestigationCase): string {
  const usedEventIds = new Set<string>(
    existingCase ? existingCase.history.map(event => event.eventId) : [],
  );
  let candidate = `evt-wf04-${String(nextSequenceNumber()).padStart(6, "0")}`;
  while (usedEventIds.has(candidate)) {
    candidate = `evt-wf04-${String(nextSequenceNumber()).padStart(6, "0")}`;
  }
  return candidate;
}

function resolveDefaultAuditId(atIso: string): string {
  const parsed = parseStrictIsoTimestamp(atIso);
  const stamp = parsed.ok ? parsed.ms : 0;
  return `aud-wf04-${stamp}-${String(nextSequenceNumber()).padStart(4, "0")}`;
}

function resolveDefaultFeedbackId(
  feedbacks: readonly InvestigationReportFeedback[],
  atIso: string,
): string {
  const usedIds = new Set(feedbacks.map(item => item.feedbackId));
  const parsed = parseStrictIsoTimestamp(atIso);
  const stamp = parsed.ok ? parsed.ms : 0;
  let candidate = `fb-wf04-${stamp}-${String(nextSequenceNumber()).padStart(4, "0")}`;
  while (usedIds.has(candidate)) {
    candidate = `fb-wf04-${stamp}-${String(nextSequenceNumber()).padStart(4, "0")}`;
  }
  return candidate;
}

function resolveActorAuditDetails(
  actor: InvestigationHookActor,
  users: readonly (InvestigationCaseActorInput & { email?: string })[],
): { name: string; email: string; role: string } {
  const directoryMatch = users.find(user => user.id === actor.id);
  const cleanName = actor.name?.trim() || directoryMatch?.name?.trim() || actor.id;
  const cleanEmail = actor.email?.trim() || directoryMatch?.email?.trim() || "";
  return {
    name: cleanName,
    email: cleanEmail,
    role: actor.role,
  };
}

function buildCaseAuditEntry(params: {
  auditId: string;
  enterpriseId: string;
  caseId: string;
  at: string;
  action: AuditAction;
  actor: InvestigationHookActor;
  users: readonly (InvestigationCaseActorInput & { email?: string })[];
  details: string;
  ipAddress?: string;
}): AuditLogEntry {
  return {
    enterpriseId: params.enterpriseId,
    id: params.auditId,
    timestamp: params.at,
    actor: resolveActorAuditDetails(params.actor, params.users),
    action: params.action,
    target: params.caseId,
    ipAddress: params.ipAddress?.trim() || "127.0.0.1",
    details: params.details,
  };
}

export function createInitialInvestigationCasesState(
  initialCases: readonly InvestigationCase[] = [],
  initialPersistedAt: string | null = null,
  initialFeedbacks: readonly InvestigationReportFeedback[] = [],
): InvestigationCasesState {
  const casesSnapshot = [...initialCases];
  const feedbacksSnapshot = [...initialFeedbacks];
  return {
    inMemoryCases: casesSnapshot,
    lastPersistedCases: casesSnapshot,
    inMemoryFeedbacks: feedbacksSnapshot,
    lastPersistedFeedbacks: feedbacksSnapshot,
    lastPersistedAt: initialPersistedAt,
    hasUnsavedChanges: false,
    committed: true,
    cleanupPending: false,
    storageError: null,
  };
}

export function investigationCasesReducer(
  state: InvestigationCasesState,
  action: InvestigationCasesReducerAction,
): InvestigationCasesState {
  switch (action.type) {
    case "COMMAND_COMMITTED": {
      const nextCases = [...action.nextCases];
      if (action.persisted) {
        return {
          inMemoryCases: nextCases,
          lastPersistedCases: nextCases,
          inMemoryFeedbacks: state.inMemoryFeedbacks,
          lastPersistedFeedbacks: state.inMemoryFeedbacks,
          lastPersistedAt: action.persistedAt ?? state.lastPersistedAt,
          hasUnsavedChanges: false,
          committed: true,
          cleanupPending: false,
          storageError: null,
        };
      }
      const nextError = action.storageError ?? state.storageError;
      const isCommitted = Boolean(action.committed ?? nextError?.committed);
      const isCleanupPending = Boolean(action.cleanupPending ?? nextError?.cleanupPending);
      return {
        inMemoryCases: nextCases,
        lastPersistedCases: isCommitted ? nextCases : state.lastPersistedCases,
        inMemoryFeedbacks: state.inMemoryFeedbacks,
        lastPersistedFeedbacks: isCommitted ? state.inMemoryFeedbacks : state.lastPersistedFeedbacks,
        lastPersistedAt: state.lastPersistedAt,
        hasUnsavedChanges: true,
        committed: isCommitted,
        cleanupPending: isCleanupPending,
        storageError: nextError,
      };
    }
    case "FEEDBACK_COMMITTED": {
      const nextFeedbacks = [...action.nextFeedbacks];
      if (action.persisted) {
        return {
          inMemoryCases: state.inMemoryCases,
          lastPersistedCases: state.inMemoryCases,
          inMemoryFeedbacks: nextFeedbacks,
          lastPersistedFeedbacks: nextFeedbacks,
          lastPersistedAt: action.persistedAt ?? state.lastPersistedAt,
          hasUnsavedChanges: false,
          committed: true,
          cleanupPending: false,
          storageError: null,
        };
      }
      const nextError = action.storageError ?? state.storageError;
      const isCommitted = Boolean(action.committed ?? nextError?.committed);
      const isCleanupPending = Boolean(action.cleanupPending ?? nextError?.cleanupPending);
      return {
        inMemoryCases: state.inMemoryCases,
        lastPersistedCases: isCommitted ? state.inMemoryCases : state.lastPersistedCases,
        inMemoryFeedbacks: nextFeedbacks,
        lastPersistedFeedbacks: isCommitted ? nextFeedbacks : state.lastPersistedFeedbacks,
        lastPersistedAt: state.lastPersistedAt,
        hasUnsavedChanges: true,
        committed: isCommitted,
        cleanupPending: isCleanupPending,
        storageError: nextError,
      };
    }
    case "PERSIST_SUCCEEDED": {
      const persistedSnapshot = [...action.persistedCases];
      const persistedFeedbackSnapshot = action.persistedFeedbacks
        ? [...action.persistedFeedbacks]
        : state.inMemoryFeedbacks;
      const casesMatch =
        state.inMemoryCases.length === persistedSnapshot.length &&
        state.inMemoryCases.every((item, idx) => item === persistedSnapshot[idx]);
      const feedbacksMatch =
        state.inMemoryFeedbacks.length === persistedFeedbackSnapshot.length &&
        state.inMemoryFeedbacks.every((item, idx) => item === persistedFeedbackSnapshot[idx]);
      const matchesInMemory = casesMatch && feedbacksMatch;
      return {
        inMemoryCases: state.inMemoryCases,
        lastPersistedCases: persistedSnapshot,
        inMemoryFeedbacks: state.inMemoryFeedbacks,
        lastPersistedFeedbacks: persistedFeedbackSnapshot,
        lastPersistedAt: action.persistedAt,
        hasUnsavedChanges: !matchesInMemory,
        committed: matchesInMemory,
        cleanupPending: false,
        storageError: null,
      };
    }
    case "PERSIST_FAILED": {
      const isCommitted = Boolean(action.storageError.committed);
      const isCleanupPending = Boolean(action.storageError.cleanupPending);
      return {
        ...state,
        lastPersistedCases: isCommitted ? state.inMemoryCases : state.lastPersistedCases,
        lastPersistedFeedbacks: isCommitted ? state.inMemoryFeedbacks : state.lastPersistedFeedbacks,
        hasUnsavedChanges: true,
        committed: isCommitted,
        cleanupPending: isCleanupPending,
        storageError: action.storageError,
      };
    }
    case "REPLACE_CASES": {
      const nextSnapshot = [...action.nextCases];
      const hasNextFeedbacks = action.nextFeedbacks !== undefined;
      const nextFeedbackSnapshot = hasNextFeedbacks
        ? [...(action.nextFeedbacks ?? [])]
        : state.inMemoryFeedbacks;
      const isCommitted =
        action.persisted || Boolean(action.committed ?? action.storageError?.committed);
      const isCleanupPending =
        !action.persisted &&
        Boolean(action.cleanupPending ?? action.storageError?.cleanupPending);
      return {
        inMemoryCases: nextSnapshot,
        lastPersistedCases: isCommitted ? nextSnapshot : state.lastPersistedCases,
        inMemoryFeedbacks: nextFeedbackSnapshot,
        lastPersistedFeedbacks: hasNextFeedbacks
          ? isCommitted
            ? nextFeedbackSnapshot
            : state.lastPersistedFeedbacks
          : state.lastPersistedFeedbacks,
        lastPersistedAt: action.persisted ? action.persistedAt : state.lastPersistedAt,
        hasUnsavedChanges: !action.persisted,
        committed: isCommitted,
        cleanupPending: isCleanupPending,
        storageError: action.storageError ?? null,
      };
    }
    case "REPLACE_FEEDBACKS": {
      const nextFeedbackSnapshot = [...action.nextFeedbacks];
      const isCommitted =
        action.persisted || Boolean(action.committed ?? action.storageError?.committed);
      const isCleanupPending =
        !action.persisted &&
        Boolean(action.cleanupPending ?? action.storageError?.cleanupPending);
      return {
        inMemoryCases: state.inMemoryCases,
        lastPersistedCases: state.lastPersistedCases,
        inMemoryFeedbacks: nextFeedbackSnapshot,
        lastPersistedFeedbacks: isCommitted ? nextFeedbackSnapshot : state.lastPersistedFeedbacks,
        lastPersistedAt: action.persisted ? action.persistedAt : state.lastPersistedAt,
        hasUnsavedChanges: !action.persisted,
        committed: isCommitted,
        cleanupPending: isCleanupPending,
        storageError: action.storageError ?? null,
      };
    }
    default:
      return state;
  }
}

/**
 * Validates Operator tenant ownership, non-legacy alert eligibility, and creates an `Open`
 * investigation case plus one audit entry outside React state updaters.
 */
export function executeCreateCaseAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  alertIds: readonly string[];
  caseId?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  if (!actor || !actor.id || !actor.role) {
    return {
      ok: false,
      code: "INVALID_ACTOR",
      error: "Thiếu thông tin người thực hiện thao tác.",
    };
  }
  if (actor.role !== "Operator") {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error: "Chỉ Operator cùng doanh nghiệp mới được tạo vụ việc điều tra.",
    };
  }

  const enterprise = snapshot.enterprises.find(item => item.id === actor.enterpriseId);
  if (!enterprise) {
    return {
      ok: false,
      code: "ENTERPRISE_NOT_FOUND",
      error: "Không xác định được doanh nghiệp hợp lệ của Operator để tạo vụ việc.",
    };
  }

  const normalizedAlerts = new Map<string, TransactionRisk>();
  for (const tx of snapshot.alerts) {
    const cleanAlertId = typeof tx.alertId === "string" ? tx.alertId.trim() : "";
    if (cleanAlertId && !normalizedAlerts.has(cleanAlertId)) {
      normalizedAlerts.set(cleanAlertId, tx);
    }
  }

  for (const rawAlertId of params.alertIds) {
    const cleanId = rawAlertId.trim();
    const matchedTx = normalizedAlerts.get(cleanId);
    const archivedDirect = snapshot.legacyArchive.some(
      entry => entry.blocksAlertCreation && entry.alertIds.includes(cleanId),
    );
    const blockedByLegacyOnly = matchedTx
      ? isAlertBlockedByCasesOrLegacy(matchedTx, [], snapshot.legacyArchive)
      : archivedDirect;
    const alreadyInCurrentCase = matchedTx
      ? isAlertBlockedByCasesOrLegacy(matchedTx, snapshot.cases, [])
      : snapshot.cases.some(c => c.alertIds.includes(cleanId));

    if (!alreadyInCurrentCase && blockedByLegacyOnly) {
      return {
        ok: false,
        code: "ALERT_LEGACY_LINKED",
        error: `Cảnh báo ${cleanId} đã gắn với hồ sơ vụ việc legacy trước đó và không thể tạo vụ việc mới.`,
      };
    }
  }

  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const caseId =
    params.caseId !== undefined
      ? params.caseId
      : resolveDefaultCaseId(snapshot.cases, snapshot.legacyArchive);
  const eventId = params.eventId !== undefined ? params.eventId : resolveDefaultEventId();

  const commandResult = createInvestigationCase({
    caseId,
    enterprise,
    actor,
    alertIds: params.alertIds,
    alerts: snapshot.alerts,
    at,
    existingCases: snapshot.cases,
    enterprises: snapshot.enterprises,
    projects: snapshot.projects,
    eventId,
    note: params.note,
  });

  if (!commandResult.ok) {
    return {
      ok: false,
      code: commandResult.code,
      error: commandResult.error,
    };
  }

  const { investigationCase, event } = commandResult;
  const auditId = params.auditId ?? resolveDefaultAuditId(event.at);
  const auditEntry = buildCaseAuditEntry({
    auditId,
    enterpriseId: investigationCase.enterpriseId,
    caseId: investigationCase.caseId,
    at: event.at,
    action: "CASE_CREATED",
    actor,
    users: snapshot.users,
    ipAddress: params.ipAddress,
    details: `Tạo vụ việc điều tra ${investigationCase.caseId} từ ${investigationCase.alertIds.length} cảnh báo AI (Open).`,
  });

  return {
    ok: true,
    investigationCase,
    event,
    auditEntry,
    nextCases: [...snapshot.cases, investigationCase],
  };
}

/**
 * Validates and executes initial Investigator assignment (`Open -> Investigating`)
 * plus one audit entry outside React state updaters.
 */
export function executeAssignInvestigatorAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  assigneeId: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  const targetIndex = snapshot.cases.findIndex(item => item.caseId === params.caseId);
  if (targetIndex < 0) {
    return {
      ok: false,
      code: "INVALID_CASE",
      error: `Không tìm thấy vụ việc điều tra ${params.caseId}.`,
    };
  }

  const targetCase = snapshot.cases[targetIndex];
  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const eventId =
    params.eventId !== undefined ? params.eventId : resolveDefaultEventId(targetCase);

  const commandResult = assignInvestigatorToCase({
    investigationCase: targetCase,
    actor,
    assigneeId: params.assigneeId,
    users: snapshot.users,
    at,
    eventId,
    note: params.note,
  });

  if (!commandResult.ok) {
    return {
      ok: false,
      code: commandResult.code,
      error: commandResult.error,
    };
  }

  const { investigationCase, event } = commandResult;
  const nextCases = snapshot.cases.map((item, idx) =>
    idx === targetIndex ? investigationCase : item,
  );
  const assigneeLabel = investigationCase.assignee?.name ?? params.assigneeId;
  const auditEntry = buildCaseAuditEntry({
    auditId: params.auditId ?? resolveDefaultAuditId(event.at),
    enterpriseId: investigationCase.enterpriseId,
    caseId: investigationCase.caseId,
    at: event.at,
    action: "INVESTIGATOR_ASSIGNED",
    actor,
    users: snapshot.users,
    ipAddress: params.ipAddress,
    details: `Giao vụ việc ${investigationCase.caseId} cho Investigator ${assigneeLabel} (Open -> Investigating).`,
  });

  return {
    ok: true,
    investigationCase,
    event,
    auditEntry,
    nextCases,
  };
}

/**
 * Validates and executes Operator initial self-investigation (`Open -> Investigating`)
 * plus one audit entry outside React state updaters.
 */
export function executeSelfAssignCaseAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  const targetIndex = snapshot.cases.findIndex(item => item.caseId === params.caseId);
  if (targetIndex < 0) {
    return {
      ok: false,
      code: "INVALID_CASE",
      error: `Không tìm thấy vụ việc điều tra ${params.caseId}.`,
    };
  }

  const targetCase = snapshot.cases[targetIndex];
  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const eventId =
    params.eventId !== undefined ? params.eventId : resolveDefaultEventId(targetCase);

  const commandResult = selfAssignInvestigationCase({
    investigationCase: targetCase,
    actor,
    at,
    eventId,
    note: params.note,
  });

  if (!commandResult.ok) {
    return {
      ok: false,
      code: commandResult.code,
      error: commandResult.error,
    };
  }

  const { investigationCase, event } = commandResult;
  const nextCases = snapshot.cases.map((item, idx) =>
    idx === targetIndex ? investigationCase : item,
  );
  const auditEntry = buildCaseAuditEntry({
    auditId: params.auditId ?? resolveDefaultAuditId(event.at),
    enterpriseId: investigationCase.enterpriseId,
    caseId: investigationCase.caseId,
    at: event.at,
    action: "OPERATOR_SELF_ASSIGNED",
    actor,
    users: snapshot.users,
    ipAddress: params.ipAddress,
    details: `Operator tự nhận điều tra vụ việc ${investigationCase.caseId} (Open -> Investigating).`,
  });

  return {
    ok: true,
    investigationCase,
    event,
    auditEntry,
    nextCases,
  };
}

function resolveTargetCaseOrFail(
  cases: readonly InvestigationCase[],
  caseId: string,
):
  | { readonly ok: true; readonly index: number; readonly targetCase: InvestigationCase }
  | { readonly ok: false; readonly code: InvestigationCaseErrorCode; readonly error: string } {
  const index = cases.findIndex(item => item.caseId === caseId);
  if (index < 0) {
    return {
      ok: false,
      code: "INVALID_CASE",
      error: `Không tìm thấy vụ việc điều tra ${caseId}.`,
    };
  }
  return { ok: true, index, targetCase: cases[index] };
}

function finalizeCaseTransitionResult(params: {
  snapshot: InvestigationCasesSnapshot;
  targetIndex: number;
  actor: InvestigationHookActor;
  action: AuditAction;
  auditId?: string;
  ipAddress?: string;
  commandResult: ReturnType<typeof assignInvestigatorToCase>;
  details: (investigationCase: InvestigationCase, event: InvestigationCaseEvent) => string;
}): PureCaseCommandExecutionResult {
  if (!params.commandResult.ok) {
    return {
      ok: false,
      code: params.commandResult.code,
      error: params.commandResult.error,
    };
  }
  const { investigationCase, event } = params.commandResult;
  const nextCases = params.snapshot.cases.map((item, idx) =>
    idx === params.targetIndex ? investigationCase : item,
  );
  const auditEntry = buildCaseAuditEntry({
    auditId: params.auditId ?? resolveDefaultAuditId(event.at),
    enterpriseId: investigationCase.enterpriseId,
    caseId: investigationCase.caseId,
    at: event.at,
    action: params.action,
    actor: params.actor,
    users: params.snapshot.users,
    ipAddress: params.ipAddress,
    details: params.details(investigationCase, event),
  });
  return {
    ok: true,
    investigationCase,
    event,
    auditEntry,
    nextCases,
  };
}

/**
 * Validates and executes versioned report submission (`Investigating -> Pending Review`)
 * plus one `REPORT_SUBMITTED` audit entry outside React state updaters.
 * Preserves explicit `at` or `now()` verbatim without +1ms shifts or fallbacks.
 */
export function executeSubmitInvestigationReportAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  summary: string;
  alertResults: readonly InvestigationCaseAlertReportItemInput[];
  expectedStatus?: InvestigationCaseStatus;
  expectedBaseVersion?: number;
  reportId?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  const targetRes = resolveTargetCaseOrFail(snapshot.cases, params.caseId);
  if (!targetRes.ok) return targetRes;

  const { index: targetIndex, targetCase } = targetRes;

  if (params.expectedStatus !== undefined && targetCase.status !== params.expectedStatus) {
    if (targetCase.status === "Closed") {
      return {
        ok: false,
        code: "CASE_ALREADY_CLOSED",
        error: `Vụ việc ${targetCase.caseId} đã đóng và không thể gửi thêm báo cáo.`,
      };
    }
    return {
      ok: false,
      code: "INVALID_STATE",
      error: `Trạng thái vụ việc ${targetCase.caseId} đã thay đổi (${targetCase.status}); vui lòng mở lại trước khi gửi báo cáo.`,
    };
  }

  const actorMatchesAssignee =
    Boolean(actor?.id) &&
    Boolean(targetCase.assignee) &&
    targetCase.assignee?.actorId === actor.id.trim() &&
    targetCase.assignee?.role === actor.role &&
    actor.enterpriseId?.trim() === targetCase.enterpriseId.trim();

  if (
    actorMatchesAssignee &&
    targetCase.status === "Investigating" &&
    params.expectedBaseVersion !== undefined &&
    targetCase.reports.length !== params.expectedBaseVersion
  ) {
    return {
      ok: false,
      code: "STALE_REPORT_VERSION",
      error:
        "Phiên bản báo cáo nền đã thay đổi; vui lòng mở lại hồ sơ để làm việc trên phiên bản mới nhất.",
    };
  }

  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const eventId =
    params.eventId !== undefined ? params.eventId : resolveDefaultEventId(targetCase);

  const commandResult = submitInvestigationReport({
    investigationCase: targetCase,
    actor,
    summary: params.summary,
    alertResults: params.alertResults,
    at,
    reportId: params.reportId,
    eventId,
    note: params.note,
  });

  return finalizeCaseTransitionResult({
    snapshot,
    targetIndex,
    actor,
    action: "REPORT_SUBMITTED",
    auditId: params.auditId,
    ipAddress: params.ipAddress,
    commandResult,
    details: (nextCase, event) =>
      `Gửi báo cáo điều tra ${event.reportId ?? ""} (v${event.reportVersion ?? nextCase.reports.length}) cho vụ việc ${nextCase.caseId} (Investigating -> Pending Review).`,
  });
}

/**
 * Validates displayed pending report ID/version at coordinator boundary and executes
 * revision request (`Pending Review -> Investigating`) plus one `REVISION_REQUESTED` audit entry.
 */
export function executeRequestInvestigationRevisionAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  reason: string;
  expectedReportId: string;
  expectedReportVersion: number;
  eventId?: string;
  auditId?: string;
  at?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  const targetRes = resolveTargetCaseOrFail(snapshot.cases, params.caseId);
  if (!targetRes.ok) return targetRes;

  const { index: targetIndex, targetCase } = targetRes;

  if (targetCase.status === "Closed") {
    return {
      ok: false,
      code: "CASE_ALREADY_CLOSED",
      error: `Vụ việc ${targetCase.caseId} đã đóng và không thể yêu cầu bổ sung.`,
    };
  }
  if (targetCase.status !== "Pending Review") {
    return {
      ok: false,
      code: "INVALID_STATE",
      error: `Vụ việc ${targetCase.caseId} không ở trạng thái Pending Review (hiện tại: ${targetCase.status}); vui lòng tải lại nội dung mới nhất.`,
    };
  }

  if (!actor || !actor.id || !actor.role) {
    return {
      ok: false,
      code: "INVALID_ACTOR",
      error: "Thiếu thông tin người thực hiện thao tác.",
    };
  }
  if (actor.role !== "Operator") {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error: "Chỉ Operator cùng doanh nghiệp mới được yêu cầu bổ sung báo cáo.",
    };
  }
  if (!actor.enterpriseId || actor.enterpriseId.trim() !== targetCase.enterpriseId.trim()) {
    return {
      ok: false,
      code: "FORBIDDEN_TENANT",
      error: "Operator không thuộc doanh nghiệp sở hữu vụ việc.",
    };
  }

  const pendingReport = targetCase.reports.find(
    report =>
      report.reportId === targetCase.pendingReviewReportId &&
      report.version === targetCase.pendingReviewReportVersion,
  );
  if (!pendingReport) {
    return {
      ok: false,
      code: "NO_PENDING_REPORT",
      error: "Không tìm thấy phiên bản báo cáo đang chờ duyệt.",
    };
  }

  const latestReport = targetCase.reports[targetCase.reports.length - 1];
  if (
    !latestReport ||
    pendingReport.reportId !== latestReport.reportId ||
    pendingReport.version !== latestReport.version
  ) {
    return {
      ok: false,
      code: "STALE_REPORT_VERSION",
      error: "Chỉ được yêu cầu bổ sung cho phiên bản báo cáo mới nhất đang chờ duyệt.",
    };
  }

  if (params.expectedReportId === undefined || params.expectedReportId === null) {
    return {
      ok: false,
      code: "MISSING_REPORT_ID",
      error: "Phải cung cấp mã báo cáo đang xem khi yêu cầu bổ sung.",
    };
  }
  if (typeof params.expectedReportId !== "string" || !params.expectedReportId.trim()) {
    return {
      ok: false,
      code: "INVALID_REPORT_ID",
      error: "Mã báo cáo yêu cầu bổ sung không hợp lệ.",
    };
  }
  const cleanExpectedId = params.expectedReportId.trim();

  if (params.expectedReportVersion === undefined || params.expectedReportVersion === null) {
    return {
      ok: false,
      code: "MISSING_REPORT_VERSION",
      error: "Phải cung cấp số phiên bản báo cáo đang xem khi yêu cầu bổ sung.",
    };
  }
  if (
    typeof params.expectedReportVersion !== "number" ||
    !Number.isFinite(params.expectedReportVersion) ||
    !Number.isInteger(params.expectedReportVersion) ||
    params.expectedReportVersion <= 0
  ) {
    return {
      ok: false,
      code: "INVALID_REPORT_VERSION",
      error: "Số phiên bản báo cáo yêu cầu bổ sung không hợp lệ.",
    };
  }

  if (cleanExpectedId !== pendingReport.reportId) {
    if (targetCase.reports.some(r => r.reportId === cleanExpectedId)) {
      return {
        ok: false,
        code: "STALE_REPORT_VERSION",
        error: `Báo cáo '${cleanExpectedId}' là phiên bản cũ; vui lòng mở lại báo cáo mới nhất v${pendingReport.version}.`,
      };
    }
    return {
      ok: false,
      code: "REPORT_NOT_FOUND",
      error: `Không tìm thấy báo cáo '${cleanExpectedId}' trong vụ việc.`,
    };
  }

  if (params.expectedReportVersion !== pendingReport.version) {
    if (targetCase.reports.some(r => r.version === params.expectedReportVersion)) {
      return {
        ok: false,
        code: "STALE_REPORT_VERSION",
        error: `Phiên bản v${params.expectedReportVersion} đã bị thay thế; vui lòng mở lại phiên bản mới nhất v${pendingReport.version}.`,
      };
    }
    return {
      ok: false,
      code: "REPORT_VERSION_MISMATCH",
      error: `Phiên bản v${params.expectedReportVersion} không khớp phiên bản đang chờ duyệt v${pendingReport.version}.`,
    };
  }

  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const eventId =
    params.eventId !== undefined ? params.eventId : resolveDefaultEventId(targetCase);

  const commandResult = requestInvestigationCaseRevision({
    investigationCase: targetCase,
    actor,
    reason: params.reason,
    at,
    eventId,
  });

  return finalizeCaseTransitionResult({
    snapshot,
    targetIndex,
    actor,
    action: "REVISION_REQUESTED",
    auditId: params.auditId,
    ipAddress: params.ipAddress,
    commandResult,
    details: (nextCase, event) =>
      `Yêu cầu bổ sung báo cáo v${event.reportVersion ?? pendingReport.version} cho vụ việc ${nextCase.caseId} (Pending Review -> Investigating).`,
  });
}

/**
 * Validates and executes confirmation & closure (`Pending Review -> Closed`) bound strictly
 * to displayed `reportId` & `reportVersion` plus one `REPORT_CONFIRMED_AND_CLOSED` audit entry.
 */
export function executeConfirmInvestigationCaseReportAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  reportId: string;
  reportVersion: number;
  finalSummary?: string;
  eventId?: string;
  auditId?: string;
  at?: string;
  note?: string;
  ipAddress?: string;
  now?: () => string;
}): PureCaseCommandExecutionResult {
  const { snapshot, actor } = params;
  const targetRes = resolveTargetCaseOrFail(snapshot.cases, params.caseId);
  if (!targetRes.ok) return targetRes;

  const { index: targetIndex, targetCase } = targetRes;
  const at = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const eventId =
    params.eventId !== undefined ? params.eventId : resolveDefaultEventId(targetCase);

  const commandResult = confirmInvestigationCaseReport({
    investigationCase: targetCase,
    actor,
    at,
    reportId: params.reportId,
    reportVersion: params.reportVersion,
    finalSummary: params.finalSummary,
    eventId,
    note: params.note,
  });

  return finalizeCaseTransitionResult({
    snapshot,
    targetIndex,
    actor,
    action: "REPORT_CONFIRMED_AND_CLOSED",
    auditId: params.auditId,
    ipAddress: params.ipAddress,
    commandResult,
    details: (nextCase, event) =>
      `Xác nhận báo cáo ${event.reportId ?? params.reportId} (v${event.reportVersion ?? params.reportVersion}) và đóng vụ việc ${nextCase.caseId} (Pending Review -> Closed).`,
  });
}

/**
 * Pure coordinator executor for SME Admin feedback on a confirmed investigation report.
 * Resolves latest actor directory record outside React reducers, passes verbatim timestamp,
 * prevents duplicate/stale submissions, and emits zero side effects on validation failure.
 */
export function executeSubmitConfirmedReportFeedbackAction(params: {
  snapshot: InvestigationCasesSnapshot;
  actor: InvestigationHookActor;
  caseId: string;
  expectedReportId: string;
  expectedReportVersion: number;
  smeComment?: string;
  feedbackId?: string;
  auditId?: string;
  at?: string;
  ipAddress?: string;
  now?: () => string;
}): PureFeedbackCommandExecutionResult {
  const { snapshot, actor } = params;
  const existingFeedbacks = snapshot.feedbacks ?? [];
  const submittedAt = params.at !== undefined ? params.at : (params.now ?? defaultNowIso)();
  const feedbackId =
    params.feedbackId !== undefined
      ? params.feedbackId
      : resolveDefaultFeedbackId(existingFeedbacks, submittedAt);
  const auditId =
    params.auditId !== undefined ? params.auditId : resolveDefaultAuditId(submittedAt);

  const directoryUsers: FeedbackActorDirectoryEntry[] = snapshot.users.map(user => ({
    ...user,
    name: user.name?.trim() || user.id,
  }));
  const directoryMatch = directoryUsers.find(user => user.id === actor.id);
  const actorInput: FeedbackActorDirectoryEntry = {
    ...actor,
    name: actor.name?.trim() || directoryMatch?.name || actor.id,
    ...(actor.email?.trim()
      ? { email: actor.email.trim() }
      : directoryMatch?.email
        ? { email: directoryMatch.email }
        : {}),
  };

  const result = submitConfirmedReportFeedback({
    feedbackId,
    actor: actorInput,
    caseId: params.caseId,
    expectedReportId: params.expectedReportId,
    expectedReportVersion: params.expectedReportVersion,
    submittedAt,
    cases: snapshot.cases,
    enterprises: snapshot.enterprises,
    existingFeedbacks,
    users: directoryUsers,
    smeComment: params.smeComment,
    auditId,
    ipAddress: params.ipAddress ?? actor.ipAddress,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.message,
      ...(result.existingFeedbackId ? { existingFeedbackId: result.existingFeedbackId } : {}),
    };
  }

  return {
    ok: true,
    feedback: result.value.feedback,
    feedbacks: result.value.feedbacks,
    auditEntry: result.value.auditLog,
  };
}

function toHookStorageError(failed: {
  readonly errorCode: WorkspaceStorageErrorCode;
  readonly error: string;
  readonly committed?: boolean;
  readonly cleanupPending?: boolean;
  readonly rolledBack?: boolean;
  readonly rollbackFailed?: boolean;
  readonly recoveryRequired?: boolean;
  readonly recoveryJournal?: WorkspaceRecoveryJournal;
  readonly preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot;
}): InvestigationHookStorageError {
  return {
    code: failed.errorCode,
    error: failed.error,
    ...(failed.committed !== undefined ? { committed: failed.committed } : {}),
    ...(failed.cleanupPending !== undefined ? { cleanupPending: failed.cleanupPending } : {}),
    ...(failed.rolledBack !== undefined ? { rolledBack: failed.rolledBack } : {}),
    ...(failed.rollbackFailed !== undefined ? { rollbackFailed: failed.rollbackFailed } : {}),
    ...(failed.recoveryRequired !== undefined ? { recoveryRequired: failed.recoveryRequired } : {}),
    ...(failed.recoveryJournal !== undefined ? { recoveryJournal: failed.recoveryJournal } : {}),
    ...(failed.preservePreDemoSnapshot !== undefined
      ? { preservePreDemoSnapshot: failed.preservePreDemoSnapshot }
      : {}),
  };
}

/**
 * Stateful case-command coordinator for WF-04 Phase 2A & 2B (`create`, `assign`, `selfAssign`,
 * `submitReport`, `requestRevision`, `confirmAndCloseReport`).
 * Keeps latest cases synced across rapid clicks, runs pure validation outside React
 * state updaters, and preserves in-memory cases if localStorage persistence fails.
 */
export function useInvestigationCases(
  options: UseInvestigationCasesOptions,
): UseInvestigationCasesResult {
  const {
    enterprises,
    projects,
    alerts,
    legacyArchive,
    users,
    currentActor,
    cases: controlledCases,
    initialCases = [],
    feedbacks: controlledFeedbacks,
    initialFeedbacks = [],
    restoreStatus = "ready",
    initialPersistedAt = null,
    storage,
    now = defaultNowIso,
    persistUsersWithWorkspace = false,
    buildWorkspacePayload,
    persistCases,
    onCasesChange,
    onFeedbacksChange,
    onAuditEntry,
  } = options;

  const [state, dispatch] = useReducer(
    investigationCasesReducer,
    {
      cases: controlledCases ?? initialCases,
      feedbacks: controlledFeedbacks ?? initialFeedbacks,
      persistedAt: initialPersistedAt,
    },
    init =>
      createInitialInvestigationCasesState(
        init.cases,
        init.persistedAt,
        init.feedbacks,
      ),
  );

  const latestCasesRef = useRef<readonly InvestigationCase[]>(
    controlledCases ?? initialCases,
  );
  const lastControlledPropRef = useRef<readonly InvestigationCase[] | undefined>(
    controlledCases,
  );
  const latestFeedbacksRef = useRef<readonly InvestigationReportFeedback[]>(
    controlledFeedbacks ?? initialFeedbacks,
  );
  const lastControlledFeedbacksRef = useRef<
    readonly InvestigationReportFeedback[] | undefined
  >(controlledFeedbacks);

  useEffect(() => {
    if (
      controlledCases !== undefined &&
      controlledCases !== lastControlledPropRef.current
    ) {
      lastControlledPropRef.current = controlledCases;
      latestCasesRef.current = controlledCases;
      dispatch({
        type: "REPLACE_CASES",
        nextCases: controlledCases,
        persisted: !state.hasUnsavedChanges,
        persistedAt: state.lastPersistedAt,
        committed: state.committed,
        cleanupPending: state.cleanupPending,
        storageError: state.storageError,
      });
    }
  }, [
    controlledCases,
    state.cleanupPending,
    state.committed,
    state.hasUnsavedChanges,
    state.lastPersistedAt,
    state.storageError,
  ]);

  useEffect(() => {
    if (
      controlledFeedbacks !== undefined &&
      controlledFeedbacks !== lastControlledFeedbacksRef.current
    ) {
      lastControlledFeedbacksRef.current = controlledFeedbacks;
      latestFeedbacksRef.current = controlledFeedbacks;
      dispatch({
        type: "REPLACE_FEEDBACKS",
        nextFeedbacks: controlledFeedbacks,
        persisted: !state.hasUnsavedChanges,
        persistedAt: state.lastPersistedAt,
        committed: state.committed,
        cleanupPending: state.cleanupPending,
        storageError: state.storageError,
      });
    }
  }, [
    controlledFeedbacks,
    state.cleanupPending,
    state.committed,
    state.hasUnsavedChanges,
    state.lastPersistedAt,
    state.storageError,
  ]);

  useEffect(() => {
    if (controlledCases === undefined) {
      latestCasesRef.current = state.inMemoryCases;
    }
  }, [controlledCases, state.inMemoryCases]);

  useEffect(() => {
    if (controlledFeedbacks === undefined) {
      latestFeedbacksRef.current = state.inMemoryFeedbacks;
    }
  }, [controlledFeedbacks, state.inMemoryFeedbacks]);

  const tryPersistSnapshot = useCallback(
    (
      nextCases: readonly InvestigationCase[],
      nextFeedbacks: readonly InvestigationReportFeedback[],
      auditEntry?: AuditLogEntry,
      persistOpts?: { allowRecoveryOverwrite?: boolean; operation?: string },
    ):
      | { readonly ok: true }
      | { readonly ok: false; readonly storageError: InvestigationHookStorageError } => {
      if (buildWorkspacePayload) {
        const payload = buildWorkspacePayload({ nextCases, nextFeedbacks, auditEntry });
        const persistRes = persistUsersWithWorkspace
          ? persistWorkspaceAndUsers({
              payload,
              users,
              restoreStatus,
              storage,
              operation: persistOpts?.operation ?? "useInvestigationCases",
              allowRecoveryOverwrite: persistOpts?.allowRecoveryOverwrite,
            })
          : persistWorkspaceSnapshot(payload, restoreStatus, storage, {
              allowRecoveryOverwrite: persistOpts?.allowRecoveryOverwrite,
            });
        if (!persistRes.ok) {
          return {
            ok: false,
            storageError: toHookStorageError(persistRes),
          };
        }
        return { ok: true };
      }
      if (persistCases) {
        const customRes = persistCases({
          nextCases,
          nextFeedbacks,
          auditEntry,
          allowRecoveryOverwrite: persistOpts?.allowRecoveryOverwrite,
        });
        if (!customRes.ok) {
          return {
            ok: false,
            storageError: toHookStorageError(customRes),
          };
        }
        return { ok: true };
      }
      return { ok: true };
    },
    [
      buildWorkspacePayload,
      persistCases,
      persistUsersWithWorkspace,
      restoreStatus,
      storage,
      users,
    ],
  );

  const commitCommandResult = useCallback(
    (commandResult: PureCaseCommandExecutionResult): InvestigationActionOutcome => {
      if (!commandResult.ok) {
        return {
          ok: false,
          code: commandResult.code,
          error: commandResult.error,
        };
      }

      const { investigationCase, event, auditEntry, nextCases } = commandResult;
      latestCasesRef.current = nextCases;

      const persistRes = tryPersistSnapshot(
        nextCases,
        latestFeedbacksRef.current,
        auditEntry,
        {
          allowRecoveryOverwrite: false,
          operation: "case_command",
        },
      );
      if (persistRes.ok) {
        dispatch({
          type: "COMMAND_COMMITTED",
          nextCases,
          persisted: true,
          persistedAt: event.at,
          committed: true,
          cleanupPending: false,
          storageError: null,
        });
      } else {
        dispatch({
          type: "COMMAND_COMMITTED",
          nextCases,
          persisted: false,
          committed: persistRes.storageError.committed,
          cleanupPending: persistRes.storageError.cleanupPending,
          storageError: persistRes.storageError,
        });
      }

      onCasesChange?.(nextCases);
      onAuditEntry?.(auditEntry);

      return {
        ok: true,
        investigationCase,
        event,
        auditEntry,
        persisted: persistRes.ok,
        storageError: persistRes.ok ? null : persistRes.storageError,
        committed: persistRes.ok ? true : persistRes.storageError.committed,
        cleanupPending: persistRes.ok ? false : persistRes.storageError.cleanupPending,
        rolledBack: persistRes.ok ? false : persistRes.storageError.rolledBack,
        rollbackFailed: persistRes.ok ? false : persistRes.storageError.rollbackFailed,
        recoveryRequired: persistRes.ok ? false : persistRes.storageError.recoveryRequired,
      };
    },
    [onAuditEntry, onCasesChange, tryPersistSnapshot],
  );

  const executeWithSnapshot = useCallback(
    <TArgs extends object>(
      args: TArgs,
      executor: (
        params: TArgs & {
          snapshot: InvestigationCasesSnapshot;
          actor: InvestigationHookActor;
          now: () => string;
        },
      ) => PureCaseCommandExecutionResult,
    ): InvestigationActionOutcome => {
      const result = executor({
        ...args,
        snapshot: {
          cases: latestCasesRef.current,
          enterprises,
          projects,
          alerts,
          legacyArchive,
          users,
        },
        actor: currentActor,
        now,
      });
      return commitCommandResult(result);
    },
    [
      alerts,
      commitCommandResult,
      currentActor,
      enterprises,
      legacyArchive,
      now,
      projects,
      users,
    ],
  );

  const createCase = useCallback(
    (args: CreateCaseCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeCreateCaseAction),
    [executeWithSnapshot],
  );

  const assignInvestigator = useCallback(
    (args: AssignInvestigatorCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeAssignInvestigatorAction),
    [executeWithSnapshot],
  );

  const selfAssign = useCallback(
    (args: SelfAssignCaseCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeSelfAssignCaseAction),
    [executeWithSnapshot],
  );

  const submitReport = useCallback(
    (args: SubmitInvestigationReportCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeSubmitInvestigationReportAction),
    [executeWithSnapshot],
  );

  const requestRevision = useCallback(
    (args: RequestInvestigationRevisionCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeRequestInvestigationRevisionAction),
    [executeWithSnapshot],
  );

  const confirmAndCloseReport = useCallback(
    (args: ConfirmInvestigationReportCommandArgs): InvestigationActionOutcome =>
      executeWithSnapshot(args, executeConfirmInvestigationCaseReportAction),
    [executeWithSnapshot],
  );

  const submitReportFeedback = useCallback(
    (args: SubmitConfirmedReportFeedbackCommandArgs): SubmitFeedbackOutcome => {
      const commandResult = executeSubmitConfirmedReportFeedbackAction({
        ...args,
        snapshot: {
          cases: latestCasesRef.current,
          feedbacks: latestFeedbacksRef.current,
          enterprises,
          projects,
          alerts,
          legacyArchive,
          users,
        },
        actor: currentActor,
        now,
      });

      if (!commandResult.ok) {
        return {
          ok: false,
          code: commandResult.code,
          error: commandResult.error,
          ...(commandResult.existingFeedbackId
            ? { existingFeedbackId: commandResult.existingFeedbackId }
            : {}),
        };
      }

      const { feedback, feedbacks: nextFeedbacks, auditEntry } = commandResult;
      latestFeedbacksRef.current = nextFeedbacks;

      const persistRes = tryPersistSnapshot(
        latestCasesRef.current,
        nextFeedbacks,
        auditEntry,
        {
          allowRecoveryOverwrite: false,
          operation: "report_feedback",
        },
      );

      if (persistRes.ok) {
        dispatch({
          type: "FEEDBACK_COMMITTED",
          nextFeedbacks,
          persisted: true,
          persistedAt: feedback.submittedAt,
          committed: true,
          cleanupPending: false,
          storageError: null,
        });
      } else {
        dispatch({
          type: "FEEDBACK_COMMITTED",
          nextFeedbacks,
          persisted: false,
          committed: persistRes.storageError.committed,
          cleanupPending: persistRes.storageError.cleanupPending,
          storageError: persistRes.storageError,
        });
      }

      onFeedbacksChange?.(nextFeedbacks);
      onAuditEntry?.(auditEntry);

      return {
        ok: true,
        feedback,
        feedbacks: nextFeedbacks,
        auditEntry,
        persisted: persistRes.ok,
        storageError: persistRes.ok ? null : persistRes.storageError,
        committed: persistRes.ok ? true : persistRes.storageError.committed,
        cleanupPending: persistRes.ok ? false : persistRes.storageError.cleanupPending,
        rolledBack: persistRes.ok ? false : persistRes.storageError.rolledBack,
        rollbackFailed: persistRes.ok ? false : persistRes.storageError.rollbackFailed,
        recoveryRequired: persistRes.ok ? false : persistRes.storageError.recoveryRequired,
      };
    },
    [
      alerts,
      currentActor,
      enterprises,
      legacyArchive,
      now,
      onAuditEntry,
      onFeedbacksChange,
      projects,
      tryPersistSnapshot,
      users,
    ],
  );

  const retryPersist = useCallback(
    (retryOptions?: {
      allowRecoveryOverwrite?: boolean;
      operation?: string;
    }): RetryPersistOutcome => {
      const snapshotCases = latestCasesRef.current;
      const snapshotFeedbacks = latestFeedbacksRef.current;
      const persistRes = tryPersistSnapshot(snapshotCases, snapshotFeedbacks, undefined, {
        allowRecoveryOverwrite: retryOptions?.allowRecoveryOverwrite ?? true,
        operation: retryOptions?.operation ?? "retryPersist",
      });
      if (!persistRes.ok) {
        dispatch({
          type: "PERSIST_FAILED",
          storageError: persistRes.storageError,
        });
        return {
          ok: false,
          persistedAt: state.lastPersistedAt,
          storageError: persistRes.storageError,
          committed: persistRes.storageError.committed,
          cleanupPending: persistRes.storageError.cleanupPending,
          rolledBack: persistRes.storageError.rolledBack,
          rollbackFailed: persistRes.storageError.rollbackFailed,
          recoveryRequired: persistRes.storageError.recoveryRequired,
        };
      }

      const persistedAt = now();
      dispatch({
        type: "PERSIST_SUCCEEDED",
        persistedCases: snapshotCases,
        persistedFeedbacks: snapshotFeedbacks,
        persistedAt,
      });
      return {
        ok: true,
        persistedAt,
        storageError: null,
        committed: true,
        cleanupPending: false,
        rolledBack: false,
        rollbackFailed: false,
        recoveryRequired: false,
      };
    },
    [now, state.lastPersistedAt, tryPersistSnapshot],
  );

  const replaceCases = useCallback(
    (
      nextCases: readonly InvestigationCase[],
      replaceOptions?: {
        nextFeedbacks?: readonly InvestigationReportFeedback[];
        persisted?: boolean;
        persistedAt?: string | null;
        committed?: boolean;
        cleanupPending?: boolean;
        storageError?: InvestigationHookStorageError | null;
      },
    ) => {
      const normalized = [...nextCases];
      latestCasesRef.current = normalized;
      lastControlledPropRef.current = normalized;
      const normalizedFeedbacks =
        replaceOptions?.nextFeedbacks !== undefined
          ? [...replaceOptions.nextFeedbacks]
          : undefined;
      if (normalizedFeedbacks !== undefined) {
        latestFeedbacksRef.current = normalizedFeedbacks;
        lastControlledFeedbacksRef.current = normalizedFeedbacks;
      }
      dispatch({
        type: "REPLACE_CASES",
        nextCases: normalized,
        ...(normalizedFeedbacks !== undefined ? { nextFeedbacks: normalizedFeedbacks } : {}),
        persisted: replaceOptions?.persisted ?? true,
        persistedAt:
          replaceOptions?.persistedAt !== undefined
            ? replaceOptions.persistedAt
            : now(),
        committed: replaceOptions?.committed,
        cleanupPending: replaceOptions?.cleanupPending,
        storageError: replaceOptions?.storageError ?? null,
      });
    },
    [now],
  );

  const replaceFeedbacks = useCallback(
    (
      nextFeedbacks: readonly InvestigationReportFeedback[],
      replaceOptions?: {
        persisted?: boolean;
        persistedAt?: string | null;
        committed?: boolean;
        cleanupPending?: boolean;
        storageError?: InvestigationHookStorageError | null;
      },
    ) => {
      const normalizedFeedbacks = [...nextFeedbacks];
      latestFeedbacksRef.current = normalizedFeedbacks;
      lastControlledFeedbacksRef.current = normalizedFeedbacks;
      dispatch({
        type: "REPLACE_FEEDBACKS",
        nextFeedbacks: normalizedFeedbacks,
        persisted: replaceOptions?.persisted ?? true,
        persistedAt:
          replaceOptions?.persistedAt !== undefined
            ? replaceOptions.persistedAt
            : now(),
        committed: replaceOptions?.committed,
        cleanupPending: replaceOptions?.cleanupPending,
        storageError: replaceOptions?.storageError ?? null,
      });
    },
    [now],
  );

  return {
    cases: controlledCases ?? state.inMemoryCases,
    lastPersistedCases: state.lastPersistedCases,
    feedbacks: controlledFeedbacks ?? state.inMemoryFeedbacks,
    lastPersistedFeedbacks: state.lastPersistedFeedbacks,
    lastPersistedAt: state.lastPersistedAt,
    hasUnsavedChanges: state.hasUnsavedChanges,
    committed: state.committed,
    cleanupPending: state.cleanupPending,
    storageError: state.storageError,
    createCase,
    assignInvestigator,
    selfAssign,
    submitReport,
    requestRevision,
    confirmAndCloseReport,
    submitReportFeedback,
    retryPersist,
    replaceCases,
    replaceFeedbacks,
  };
}
