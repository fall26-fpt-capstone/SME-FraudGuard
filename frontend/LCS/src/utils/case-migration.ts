import type { Enterprise } from "@/types/enterprise";
import type {
  CaseStatus,
  ProjectItem,
  TransactionRisk,
  UserProfile,
  UserRole,
} from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseActorRef,
  InvestigationCaseAlertLink,
  InvestigationCaseConclusion,
  InvestigationCaseEvent,
  InvestigationCaseReportVersion,
} from "@/types/investigation-case";
import { parseStrictIsoTimestamp } from "@/utils/enterprise-lifecycle";
import { checkInvestigationCaseCreationEligibility } from "@/utils/investigation-case";

export const CASE_MIGRATION_VERSION = 1 as const;

export type LegacyCaseArchiveReasonCode =
  | "MISSING_PROJECT_MAPPING"
  | "CROSS_TENANT_CONFLICT"
  | "INELIGIBLE_SOURCE_OR_RISK"
  | "MISSING_ALERT_ID"
  | "MISSING_CREATION_PROVENANCE"
  | "MISSING_OPERATING_SUBSCRIPTION"
  | "CONFLICTING_MULTI_TX_RECORDS"
  | "UNRESOLVED_ASSIGNEE_ID"
  | "INCOMPLETE_REPORT_OR_DECISION"
  | "UNSUPPORTED_LEGACY_STATUS";

export interface LegacyCaseArchiveEntry {
  readonly archiveId: string;
  readonly legacyCaseId?: string;
  readonly legacyCaseStatus?: CaseStatus | string;
  readonly enterpriseId?: string;
  readonly alertIds: readonly string[];
  readonly transactionIds: readonly string[];
  readonly transactionRefs: readonly string[];
  readonly canResolveAssigneeId?: string;
  readonly assigneeResolutionSource?: "id" | "unique_tenant_name";
  readonly assignedInvestigatorName?: string;
  readonly reasonCode: LegacyCaseArchiveReasonCode;
  readonly reason: string;
  readonly blocksAlertCreation: true;
  readonly requiresManualReconciliation: true;
  readonly transactions: readonly TransactionRisk[];
}

export interface WorkspaceMigrationMeta {
  readonly migrationVersion: number;
  readonly migratedAt: string;
  readonly sourceSchema: "seed" | "v2" | "v3" | "v4";
  readonly migratedCaseCount: number;
  readonly archivedLegacyCount: number;
  readonly preservedExistingCaseCount: number;
  readonly notes: readonly string[];
}

export interface CaseMigrationInput {
  transactions: readonly TransactionRisk[];
  enterprises: readonly Enterprise[];
  projects?: readonly Pick<ProjectItem, "id">[];
  users?: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[];
  existingCases?: readonly InvestigationCase[];
  existingArchive?: readonly LegacyCaseArchiveEntry[];
  sourceSchema?: WorkspaceMigrationMeta["sourceSchema"];
  migratedAt: string;
}

export interface CaseMigrationResult {
  readonly cases: readonly InvestigationCase[];
  readonly legacyArchive: readonly LegacyCaseArchiveEntry[];
  readonly migrationMeta: WorkspaceMigrationMeta;
}

const CONCLUDED_LEGACY_STATUSES = new Set<string>([
  "Confirmed Fraud",
  "False Alarm",
  "Resolved",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveTxEnterpriseId(
  tx: TransactionRisk,
  enterprises: readonly Enterprise[],
  validProjectIds: Set<string> | null,
): { ok: true; enterpriseId: string; enterprise: Enterprise } | { ok: false } {
  const projectId = readTrimmedString(tx.projectId);
  if (!projectId) return { ok: false };
  if (validProjectIds && !validProjectIds.has(projectId)) return { ok: false };
  const matches = enterprises.filter(
    e => Array.isArray(e.projectIds) && e.projectIds.includes(projectId),
  );
  if (matches.length !== 1) return { ok: false };
  return { ok: true, enterpriseId: matches[0].id, enterprise: matches[0] };
}

function resolveArchiveAssignee(
  group: readonly TransactionRisk[],
  resolvedEnterpriseId: string | undefined,
  users: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[],
): { id?: string; source?: "id" | "unique_tenant_name"; displayName?: string } {
  const rawNames = [
    ...new Set(group.map(tx => readTrimmedString(tx.assignedInvestigator)).filter(Boolean)),
  ] as string[];
  const rawIds = [
    ...new Set(group.map(tx => readTrimmedString(tx.assignedInvestigatorId)).filter(Boolean)),
  ] as string[];

  const displayName = rawNames.length === 1 ? rawNames[0] : undefined;
  if (!resolvedEnterpriseId || rawNames.length > 1 || rawIds.length > 1) {
    return { displayName };
  }

  const tenantUsers = users.filter(u => u.enterpriseId === resolvedEnterpriseId);
  if (rawIds.length === 1) {
    const byId = tenantUsers.filter(
      u => u.id === rawIds[0] && (u.role === "Investigator" || u.role === "Operator"),
    );
    if (byId.length === 1) {
      return { id: byId[0].id, source: "id", displayName: displayName ?? byId[0].name };
    }
    return { displayName };
  }

  if (rawNames.length === 1) {
    const byName = tenantUsers.filter(
      u => u.role === "Investigator" && u.name.trim() === rawNames[0],
    );
    if (byName.length === 1) {
      return {
        id: byName[0].id,
        source: "unique_tenant_name",
        displayName: rawNames[0],
      };
    }
  }

  return { displayName };
}

function archiveEntryFromGroup(args: {
  archiveId: string;
  legacyCaseId?: string;
  legacyCaseStatus?: string;
  enterpriseId?: string;
  reasonCode: LegacyCaseArchiveReasonCode;
  reason: string;
  group: readonly TransactionRisk[];
  users: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[];
}): LegacyCaseArchiveEntry {
  const { archiveId, legacyCaseId, legacyCaseStatus, enterpriseId, reasonCode, reason, group, users } = args;
  const assignee = resolveArchiveAssignee(group, enterpriseId, users);
  return {
    archiveId,
    ...(legacyCaseId ? { legacyCaseId } : {}),
    ...(legacyCaseStatus ? { legacyCaseStatus } : {}),
    ...(enterpriseId ? { enterpriseId } : {}),
    alertIds: [
      ...new Set(group.map(tx => readTrimmedString(tx.alertId)).filter(Boolean)),
    ] as string[],
    transactionIds: group.map(tx => tx.id),
    transactionRefs: group.map(tx => tx.transactionReference),
    ...(assignee.id ? { canResolveAssigneeId: assignee.id } : {}),
    ...(assignee.source ? { assigneeResolutionSource: assignee.source } : {}),
    ...(assignee.displayName ? { assignedInvestigatorName: assignee.displayName } : {}),
    reasonCode,
    reason,
    blocksAlertCreation: true,
    requiresManualReconciliation: true,
    transactions: structuredClone(group),
  };
}

function normalizeMultiTxKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function readCreationProvenance(
  tx: TransactionRisk,
  enterpriseId: string,
  users: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[],
): { ok: true; createdAt: string; createdBy: InvestigationCaseActorRef } | { ok: false } {
  const raw = tx as unknown as Record<string, unknown>;
  const rawCreatedAt = readTrimmedString(raw.createdAt) ?? readTrimmedString(raw.caseCreatedAt);
  if (!rawCreatedAt) return { ok: false };
  const parsedCreatedAt = parseStrictIsoTimestamp(rawCreatedAt);
  if (!parsedCreatedAt.ok) return { ok: false };

  let creatorId: string | undefined;
  let creatorRole: UserRole | undefined;
  let creatorName: string | undefined;
  let creatorEnterpriseId: string | undefined;

  if (isPlainRecord(raw.createdBy)) {
    creatorId = readTrimmedString(raw.createdBy.actorId) ?? readTrimmedString(raw.createdBy.id);
    creatorRole = readTrimmedString(raw.createdBy.role) as UserRole | undefined;
    creatorName = readTrimmedString(raw.createdBy.name);
    creatorEnterpriseId = readTrimmedString(raw.createdBy.enterpriseId);
  } else {
    creatorId = readTrimmedString(raw.createdById);
    creatorRole = readTrimmedString(raw.createdByRole) as UserRole | undefined;
  }

  if (!creatorId) return { ok: false };

  const matchedUsers = users.filter(u => u.id === creatorId);
  if (matchedUsers.length > 1) return { ok: false };
  if (matchedUsers.length === 1) {
    const user = matchedUsers[0];
    if (user.role !== "Operator" || user.enterpriseId !== enterpriseId) return { ok: false };
    return {
      ok: true,
      createdAt: parsedCreatedAt.iso,
      createdBy: {
        actorId: user.id,
        role: "Operator",
        enterpriseId,
        name: user.name,
      },
    };
  }

  if (creatorRole !== "Operator" || creatorEnterpriseId !== enterpriseId) {
    return { ok: false };
  }

  return {
    ok: true,
    createdAt: parsedCreatedAt.iso,
    createdBy: {
      actorId: creatorId,
      role: "Operator",
      enterpriseId,
      ...(creatorName ? { name: creatorName } : {}),
    },
  };
}

function buildAlertLink(tx: TransactionRisk, alertId: string): InvestigationCaseAlertLink {
  return {
    alertId,
    transactionId: tx.id,
    transactionReference: tx.transactionReference,
    projectId: tx.projectId.trim(),
    projectName: tx.projectName,
    transactionType: tx.transactionType,
    entityReference: tx.entityReference,
    scoringSource: "AI",
    riskLevel: "Abnormal",
    processedAt: tx.processedAt,
    ...(readTrimmedString(tx.alertName) ? { alertName: readTrimmedString(tx.alertName) } : {}),
    ...(typeof tx.confidence === "number" ? { confidence: tx.confidence } : {}),
    ...(readTrimmedString(tx.modelVersion)
      ? { modelVersion: readTrimmedString(tx.modelVersion) }
      : {}),
    ...(readTrimmedString(tx.explanation)
      ? { explanation: readTrimmedString(tx.explanation) }
      : {}),
  };
}

function resolveUserByIdInTenant(
  actorId: string,
  allowedRoles: readonly UserRole[],
  enterpriseId: string,
  users: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[],
): InvestigationCaseActorRef | null {
  const matches = users.filter(
    u => u.id === actorId && u.enterpriseId === enterpriseId && allowedRoles.includes(u.role),
  );
  if (matches.length !== 1) return null;
  return {
    actorId: matches[0].id,
    role: matches[0].role,
    enterpriseId,
    name: matches[0].name,
  };
}

function tryMigrateGroup(args: {
  legacyCaseId: string;
  group: readonly TransactionRisk[];
  enterprises: readonly Enterprise[];
  validProjectIds: Set<string> | null;
  users: readonly Pick<UserProfile, "id" | "name" | "role" | "enterpriseId">[];
}): { ok: true; investigationCase: InvestigationCase } | { ok: false; entry: LegacyCaseArchiveEntry } {
  const { legacyCaseId, group, enterprises, validProjectIds, users } = args;
  const rawStatuses = [
    ...new Set(group.map(tx => readTrimmedString(tx.caseStatus)).filter(Boolean)),
  ] as string[];
  const groupStatus = rawStatuses.length === 1 ? rawStatuses[0] : undefined;

  const tenantResolutions = group.map(tx => resolveTxEnterpriseId(tx, enterprises, validProjectIds));
  if (tenantResolutions.some(r => !r.ok)) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        reasonCode: "MISSING_PROJECT_MAPPING",
        reason: "Không ánh xạ được duy nhất projectId của giao dịch legacy về một doanh nghiệp hợp lệ.",
        group,
        users,
      }),
    };
  }

  const resolvedEnterpriseIds = new Set(
    tenantResolutions.map(r => (r.ok ? r.enterpriseId : "")),
  );
  if (resolvedEnterpriseIds.size !== 1) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        reasonCode: "CROSS_TENANT_CONFLICT",
        reason: "Các giao dịch dùng chung legacy caseId thuộc nhiều doanh nghiệp khác nhau.",
        group,
        users,
      }),
    };
  }

  const enterprise = (tenantResolutions[0] as { ok: true; enterprise: Enterprise }).enterprise;
  const enterpriseId = enterprise.id;

  if (group.length > 1) {
    const first = group[0];
    const hasConflict = group.some(tx => {
      const fRaw = first as unknown as Record<string, unknown>;
      const tRaw = tx as unknown as Record<string, unknown>;
      return (
        readTrimmedString(tx.caseStatus) !== readTrimmedString(first.caseStatus) ||
        readTrimmedString(tx.assignedInvestigatorId) !==
          readTrimmedString(first.assignedInvestigatorId) ||
        readTrimmedString(tx.assignedInvestigator) !==
          readTrimmedString(first.assignedInvestigator) ||
        readTrimmedString(tx.assignedAt) !== readTrimmedString(first.assignedAt) ||
        normalizeMultiTxKey(tx.investigationReport) !==
          normalizeMultiTxKey(first.investigationReport) ||
        normalizeMultiTxKey(tx.caseDecision) !== normalizeMultiTxKey(first.caseDecision) ||
        normalizeMultiTxKey(tx.investigationNotes) !==
          normalizeMultiTxKey(first.investigationNotes) ||
        readTrimmedString(tRaw.createdAt ?? tRaw.caseCreatedAt) !==
          readTrimmedString(fRaw.createdAt ?? fRaw.caseCreatedAt) ||
        normalizeMultiTxKey(tRaw.createdBy ?? tRaw.createdById) !==
          normalizeMultiTxKey(fRaw.createdBy ?? fRaw.createdById)
      );
    });
    if (hasConflict) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: groupStatus,
          enterpriseId,
          reasonCode: "CONFLICTING_MULTI_TX_RECORDS",
          reason: "Nhiều giao dịch có cùng legacy caseId nhưng mâu thuẫn trạng thái, người phụ trách hoặc báo cáo.",
          group,
          users,
        }),
      };
    }
  }

  if (group.some(tx => tx.scoringSource !== "AI" || tx.riskLevel !== "Abnormal")) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        enterpriseId,
        reasonCode: "INELIGIBLE_SOURCE_OR_RISK",
        reason: "Bản ghi legacy không phải nguồn AI hoặc không ở mức Abnormal theo tiêu chuẩn WF-04.",
        group,
        users,
      }),
    };
  }

  const alertIds: string[] = [];
  const seenAlertIds = new Set<string>();
  const alertLinks: InvestigationCaseAlertLink[] = [];
  for (const tx of group) {
    const cleanAlertId = readTrimmedString(tx.alertId);
    if (!cleanAlertId) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: groupStatus,
          enterpriseId,
          reasonCode: "MISSING_ALERT_ID",
          reason: "Giao dịch legacy thiếu mã alertId hợp lệ.",
          group,
          users,
        }),
      };
    }
    if (seenAlertIds.has(cleanAlertId)) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: groupStatus,
          enterpriseId,
          reasonCode: "CONFLICTING_MULTI_TX_RECORDS",
          reason: `Legacy caseId '${legacyCaseId}' chứa alertId trùng lặp '${cleanAlertId}'.`,
          group,
          users,
        }),
      };
    }
    seenAlertIds.add(cleanAlertId);
    alertIds.push(cleanAlertId);
    alertLinks.push(buildAlertLink(tx, cleanAlertId));
  }

  const representative = group[0];
  const provenance = readCreationProvenance(representative, enterpriseId, users);
  if (!provenance.ok) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        enterpriseId,
        reasonCode: "MISSING_CREATION_PROVENANCE",
        reason: "Thiếu thông tin người tạo (createdBy/ID) hoặc thời điểm tạo case tường minh (không suy từ processedAt).",
        group,
        users,
      }),
    };
  }

  const eligibilityRes = checkInvestigationCaseCreationEligibility(enterprise, provenance.createdAt);
  if (!eligibilityRes.ok) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        enterpriseId,
        reasonCode: "MISSING_OPERATING_SUBSCRIPTION",
        reason: `Doanh nghiệp không chứng minh được trạng thái Operating + Subscription tại thời điểm mở case (${eligibilityRes.code}).`,
        group,
        users,
      }),
    };
  }

  const status = groupStatus;
  if (
    !status ||
    !["Open", "Assigned", "Investigating", "Reported", "Confirmed Fraud", "False Alarm", "Resolved"].includes(
      status,
    )
  ) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: groupStatus,
        enterpriseId,
        reasonCode: "UNSUPPORTED_LEGACY_STATUS",
        reason: "Trạng thái case legacy không hợp lệ để chuyển đổi.",
        group,
        users,
      }),
    };
  }

  const createdMs = parseStrictIsoTimestamp(provenance.createdAt);
  if (!createdMs.ok) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: status,
        enterpriseId,
        reasonCode: "MISSING_CREATION_PROVENANCE",
        reason: "Thời điểm tạo case không hợp lệ.",
        group,
        users,
      }),
    };
  }

  const notesSummary =
    Array.isArray(representative.investigationNotes) && representative.investigationNotes.length > 0
      ? representative.investigationNotes.map(n => `[${n.time} - ${n.author}] ${n.text}`).join(" | ")
      : undefined;

  const history: InvestigationCaseEvent[] = [
    {
      eventId: `${legacyCaseId}-legacy-evt-1`,
      type: "CASE_CREATED",
      at: provenance.createdAt,
      actor: structuredClone(provenance.createdBy),
      fromStatus: null,
      toStatus: "Open",
      ...(notesSummary ? { note: notesSummary } : {}),
    },
  ];

  if (status === "Open") {
    if (
      representative.assignedAt ||
      representative.assignedInvestigatorId ||
      representative.investigationReport ||
      representative.caseDecision
    ) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: status,
          enterpriseId,
          reasonCode: "INCOMPLETE_REPORT_OR_DECISION",
          reason: "Case ở trạng thái Open nhưng lại mang dữ liệu phân công/báo cáo mâu thuẫn.",
          group,
          users,
        }),
      };
    }
    return {
      ok: true,
      investigationCase: {
        caseId: legacyCaseId,
        enterpriseId,
        status: "Open",
        alertIds,
        alerts: alertLinks,
        createdBy: structuredClone(provenance.createdBy),
        createdAt: provenance.createdAt,
        updatedAt: provenance.createdAt,
        creationEligibility: structuredClone(eligibilityRes.eligibility),
        reports: [],
        history,
      },
    };
  }

  const assigneeId = readTrimmedString(representative.assignedInvestigatorId);
  const assigneeRef = assigneeId
    ? resolveUserByIdInTenant(assigneeId, ["Investigator", "Operator"], enterpriseId, users)
    : null;
  const parsedAssignedAt = representative.assignedAt
    ? parseStrictIsoTimestamp(representative.assignedAt)
    : { ok: false as const };

  if (!assigneeRef || !parsedAssignedAt.ok || parsedAssignedAt.ms < createdMs.ms) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: status,
        enterpriseId,
        reasonCode: "UNRESOLVED_ASSIGNEE_ID",
        reason: "Thiếu assignedInvestigatorId định danh duy nhất cùng doanh nghiệp hoặc mốc assignedAt không hợp lệ.",
        group,
        users,
      }),
    };
  }

  const isSelfAssigned =
    assigneeRef.role === "Operator" && assigneeRef.actorId === provenance.createdBy.actorId;
  history.push({
    eventId: `${legacyCaseId}-legacy-evt-2`,
    type: isSelfAssigned ? "OPERATOR_SELF_ASSIGNED" : "INVESTIGATOR_ASSIGNED",
    at: parsedAssignedAt.iso,
    actor: structuredClone(provenance.createdBy),
    fromStatus: "Open",
    toStatus: "Investigating",
    assignee: structuredClone(assigneeRef),
  });

  if (status === "Assigned" || status === "Investigating") {
    if (representative.investigationReport || representative.caseDecision) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: status,
          enterpriseId,
          reasonCode: "INCOMPLETE_REPORT_OR_DECISION",
          reason: "Trạng thái điều tra đang mở lại có sẵn báo cáo hoặc quyết định đóng.",
          group,
          users,
        }),
      };
    }
    return {
      ok: true,
      investigationCase: {
        caseId: legacyCaseId,
        enterpriseId,
        status: "Investigating",
        alertIds,
        alerts: alertLinks,
        createdBy: structuredClone(provenance.createdBy),
        createdAt: provenance.createdAt,
        updatedAt: parsedAssignedAt.iso,
        creationEligibility: structuredClone(eligibilityRes.eligibility),
        assignmentMode: isSelfAssigned ? "self_investigated" : "assigned",
        assignee: structuredClone(assigneeRef),
        assignedBy: structuredClone(provenance.createdBy),
        assignedAt: parsedAssignedAt.iso,
        reports: [],
        history,
      },
    };
  }

  const report = representative.investigationReport;
  const reportNotes = readTrimmedString(report?.notes);
  const reportEvidence = readTrimmedString(report?.evidenceNotes);
  const reportSubmittedBy = readTrimmedString(report?.submittedBy);
  const parsedSubmittedAt = report?.submittedAt
    ? parseStrictIsoTimestamp(report.submittedAt)
    : { ok: false as const };
  const submitterMatchesAssignee =
    Boolean(reportSubmittedBy) &&
    (reportSubmittedBy === assigneeRef.actorId || reportSubmittedBy === assigneeRef.name);

  if (
    !report ||
    !reportNotes ||
    !reportEvidence ||
    !parsedSubmittedAt.ok ||
    parsedSubmittedAt.ms < parsedAssignedAt.ms ||
    !submitterMatchesAssignee
  ) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: status,
        enterpriseId,
        reasonCode: "INCOMPLETE_REPORT_OR_DECISION",
        reason: "Báo cáo legacy thiếu nội dung, bằng chứng, thời điểm nộp hoặc không khớp người phụ trách.",
        group,
        users,
      }),
    };
  }

  const reportId = `${legacyCaseId}-legacy-report-v1`;
  const reportResultText = `[Legacy ${report.finding}] ${reportNotes}`;
  const reportVersion: InvestigationCaseReportVersion = {
    reportId,
    version: 1,
    submittedBy: structuredClone(assigneeRef),
    submittedAt: parsedSubmittedAt.iso,
    summary: notesSummary ? `${reportNotes} (${notesSummary})` : reportNotes,
    alertResults: alertLinks.map(link => ({
      alertId: link.alertId,
      transactionId: link.transactionId,
      transactionReference: link.transactionReference,
      resultText: reportResultText,
      evidence: reportEvidence,
    })),
  };

  history.push({
    eventId: `${legacyCaseId}-legacy-evt-3`,
    type: "REPORT_SUBMITTED",
    at: parsedSubmittedAt.iso,
    actor: structuredClone(assigneeRef),
    fromStatus: "Investigating",
    toStatus: "Pending Review",
    reportId,
    reportVersion: 1,
  });

  if (status === "Reported") {
    if (representative.caseDecision) {
      return {
        ok: false,
        entry: archiveEntryFromGroup({
          archiveId: `legacy:${legacyCaseId}`,
          legacyCaseId,
          legacyCaseStatus: status,
          enterpriseId,
          reasonCode: "INCOMPLETE_REPORT_OR_DECISION",
          reason: "Case ở trạng thái Reported nhưng đã tồn tại caseDecision.",
          group,
          users,
        }),
      };
    }
    return {
      ok: true,
      investigationCase: {
        caseId: legacyCaseId,
        enterpriseId,
        status: "Pending Review",
        alertIds,
        alerts: alertLinks,
        createdBy: structuredClone(provenance.createdBy),
        createdAt: provenance.createdAt,
        updatedAt: parsedSubmittedAt.iso,
        creationEligibility: structuredClone(eligibilityRes.eligibility),
        assignmentMode: isSelfAssigned ? "self_investigated" : "assigned",
        assignee: structuredClone(assigneeRef),
        assignedBy: structuredClone(provenance.createdBy),
        assignedAt: parsedAssignedAt.iso,
        pendingReviewReportId: reportId,
        pendingReviewReportVersion: 1,
        reports: [reportVersion],
        history,
      },
    };
  }

  const decision = representative.caseDecision;
  const rawDecision = decision as unknown as Record<string, unknown> | undefined;
  const decidedById = readTrimmedString(rawDecision?.decidedById);
  const decidedByText = readTrimmedString(decision?.decidedBy);
  const deciderCandidateId = decidedById ?? decidedByText;
  const deciderRef = deciderCandidateId
    ? resolveUserByIdInTenant(deciderCandidateId, ["Operator"], enterpriseId, users)
    : null;
  const parsedDecidedAt = decision?.decidedAt
    ? parseStrictIsoTimestamp(decision.decidedAt)
    : { ok: false as const };

  if (
    !decision ||
    decision.status !== status ||
    !deciderRef ||
    !parsedDecidedAt.ok ||
    parsedDecidedAt.ms < parsedSubmittedAt.ms
  ) {
    return {
      ok: false,
      entry: archiveEntryFromGroup({
        archiveId: `legacy:${legacyCaseId}`,
        legacyCaseId,
        legacyCaseStatus: status,
        enterpriseId,
        reasonCode: "INCOMPLETE_REPORT_OR_DECISION",
        reason: "Case đã kết thúc nhưng thiếu caseDecision hợp lệ hoặc thiếu ID Operator xác nhận.",
        group,
        users,
      }),
    };
  }

  const directive = readTrimmedString(decision.directive);
  const conclusionSummary = directive
    ? `[Legacy ${decision.status}] ${directive}`
    : `[Legacy ${decision.status}] ${reportVersion.summary}`;
  const conclusion: InvestigationCaseConclusion = {
    reportId,
    reportVersion: 1,
    confirmedBy: structuredClone(deciderRef),
    confirmedAt: parsedDecidedAt.iso,
    summary: conclusionSummary,
    alertResults: structuredClone(reportVersion.alertResults),
  };

  history.push({
    eventId: `${legacyCaseId}-legacy-evt-4`,
    type: "REPORT_CONFIRMED_AND_CLOSED",
    at: parsedDecidedAt.iso,
    actor: structuredClone(deciderRef),
    fromStatus: "Pending Review",
    toStatus: "Closed",
    reportId,
    reportVersion: 1,
    ...(directive ? { note: directive } : {}),
  });

  return {
    ok: true,
    investigationCase: {
      caseId: legacyCaseId,
      enterpriseId,
      status: "Closed",
      alertIds,
      alerts: alertLinks,
      createdBy: structuredClone(provenance.createdBy),
      createdAt: provenance.createdAt,
      updatedAt: parsedDecidedAt.iso,
      creationEligibility: structuredClone(eligibilityRes.eligibility),
      assignmentMode: isSelfAssigned ? "self_investigated" : "assigned",
      assignee: structuredClone(assigneeRef),
      assignedBy: structuredClone(provenance.createdBy),
      assignedAt: parsedAssignedAt.iso,
      reports: [reportVersion],
      conclusion,
      closedAt: parsedDecidedAt.iso,
      history,
    },
  };
}

/**
 * Deterministically and idempotently migrates legacy transaction-bound case records:
 * strictly validated groups become `InvestigationCase[]`, while incomplete/conflicting
 * legacy records move verbatim into read-only `LegacyCaseArchiveEntry[]` without fabricating provenance.
 */
export function migrateWorkspaceLegacyCases(input: CaseMigrationInput): CaseMigrationResult {
  const parsedMigratedAt = parseStrictIsoTimestamp(input.migratedAt);
  const safeMigratedAt = parsedMigratedAt.ok ? parsedMigratedAt.iso : input.migratedAt;
  const users = input.users ?? [];
  const validProjectIds = input.projects ? new Set(input.projects.map(p => p.id)) : null;

  const cases = structuredClone([...(input.existingCases ?? [])]);
  const legacyArchive = structuredClone([...(input.existingArchive ?? [])]);
  const preservedExistingCaseCount = cases.length;

  const knownCaseIds = new Set(cases.map(c => c.caseId));
  const knownAlertIds = new Set<string>([
    ...cases.flatMap(c => c.alertIds),
    ...legacyArchive.flatMap(a => a.alertIds),
  ]);
  const knownTxIds = new Set<string>([
    ...cases.flatMap(c => c.alerts.map(a => a.transactionId)),
    ...legacyArchive.flatMap(a => a.transactionIds),
  ]);
  const knownArchiveIds = new Set(legacyArchive.map(a => a.archiveId));

  const groups = new Map<string, { legacyCaseId?: string; rows: TransactionRisk[] }>();
  for (const tx of input.transactions) {
    const cleanCaseId = readTrimmedString(tx.caseId);
    const cleanCaseStatus = readTrimmedString(tx.caseStatus);
    if (!cleanCaseId && !cleanCaseStatus) continue;

    const key = cleanCaseId ? `case:${cleanCaseId}` : `singleton:${tx.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(tx);
    } else {
      groups.set(key, { legacyCaseId: cleanCaseId, rows: [tx] });
    }
  }

  let migratedCaseCount = 0;
  let archivedLegacyCount = 0;
  const notes: string[] = [];

  for (const { legacyCaseId, rows } of groups.values()) {
    const allAlreadyRecorded = rows.every(tx => knownTxIds.has(tx.id));
    if (allAlreadyRecorded) continue;

    if (!legacyCaseId) {
      for (const tx of rows) {
        if (knownTxIds.has(tx.id)) continue;
        const tenantRes = resolveTxEnterpriseId(tx, input.enterprises, validProjectIds);
        const archiveId = `legacy:tx:${tx.id}`;
        if (knownArchiveIds.has(archiveId)) continue;
        const entry = archiveEntryFromGroup({
          archiveId,
          legacyCaseStatus: readTrimmedString(tx.caseStatus),
          enterpriseId: tenantRes.ok ? tenantRes.enterpriseId : undefined,
          reasonCode: "MISSING_CREATION_PROVENANCE",
          reason: "Giao dịch mang caseStatus nhưng không có caseId hợp lệ.",
          group: [tx],
          users,
        });
        legacyArchive.push(entry);
        knownArchiveIds.add(archiveId);
        knownTxIds.add(tx.id);
        for (const aid of entry.alertIds) knownAlertIds.add(aid);
        archivedLegacyCount += 1;
      }
      continue;
    }

    const archiveId = `legacy:${legacyCaseId}`;
    const remainingRows = rows.filter(tx => !knownTxIds.has(tx.id));
    if (remainingRows.length === 0) continue;

    if (knownCaseIds.has(legacyCaseId) || knownArchiveIds.has(archiveId)) {
      const strayArchiveId = `legacy:${legacyCaseId}:conflict:${remainingRows[0].id}`;
      if (!knownArchiveIds.has(strayArchiveId)) {
        const tenantSet = new Set(
          remainingRows
            .map(tx => resolveTxEnterpriseId(tx, input.enterprises, validProjectIds))
            .filter(r => r.ok)
            .map(r => (r as { ok: true; enterpriseId: string }).enterpriseId),
        );
        const entry = archiveEntryFromGroup({
          archiveId: strayArchiveId,
          legacyCaseId,
          legacyCaseStatus: readTrimmedString(remainingRows[0].caseStatus),
          enterpriseId: tenantSet.size === 1 ? [...tenantSet][0] : undefined,
          reasonCode: "CONFLICTING_MULTI_TX_RECORDS",
          reason: `Phát hiện bản ghi phát sinh trùng legacy caseId '${legacyCaseId}' đã xử lý trước đó.`,
          group: remainingRows,
          users,
        });
        legacyArchive.push(entry);
        knownArchiveIds.add(strayArchiveId);
        for (const tx of remainingRows) knownTxIds.add(tx.id);
        for (const aid of entry.alertIds) knownAlertIds.add(aid);
        archivedLegacyCount += 1;
      }
      continue;
    }

    const alertConflict = remainingRows.some(tx => {
      const aid = readTrimmedString(tx.alertId);
      return Boolean(aid && knownAlertIds.has(aid));
    });
    if (alertConflict) {
      const tenantSet = new Set(
        remainingRows
          .map(tx => resolveTxEnterpriseId(tx, input.enterprises, validProjectIds))
          .filter(r => r.ok)
          .map(r => (r as { ok: true; enterpriseId: string }).enterpriseId),
      );
      const entry = archiveEntryFromGroup({
        archiveId,
        legacyCaseId,
        legacyCaseStatus: readTrimmedString(remainingRows[0].caseStatus),
        enterpriseId: tenantSet.size === 1 ? [...tenantSet][0] : undefined,
        reasonCode: "CONFLICTING_MULTI_TX_RECORDS",
        reason: `Alert thuộc legacy caseId '${legacyCaseId}' đã nằm trong một hồ sơ khác.`,
        group: remainingRows,
        users,
      });
      legacyArchive.push(entry);
      knownArchiveIds.add(archiveId);
      for (const tx of remainingRows) knownTxIds.add(tx.id);
      for (const aid of entry.alertIds) knownAlertIds.add(aid);
      archivedLegacyCount += 1;
      continue;
    }

    const migrated = tryMigrateGroup({
      legacyCaseId,
      group: remainingRows,
      enterprises: input.enterprises,
      validProjectIds,
      users,
    });

    if (migrated.ok) {
      cases.push(migrated.investigationCase);
      knownCaseIds.add(migrated.investigationCase.caseId);
      for (const aid of migrated.investigationCase.alertIds) knownAlertIds.add(aid);
      for (const tx of remainingRows) knownTxIds.add(tx.id);
      migratedCaseCount += 1;
    } else {
      legacyArchive.push(migrated.entry);
      knownArchiveIds.add(migrated.entry.archiveId);
      for (const tx of remainingRows) knownTxIds.add(tx.id);
      for (const aid of migrated.entry.alertIds) knownAlertIds.add(aid);
      archivedLegacyCount += 1;
    }
  }

  if (archivedLegacyCount > 0) {
    notes.push(
      `Đã lưu trữ ${archivedLegacyCount} nhóm hồ sơ legacy cần đối chiếu (giữ nguyên bản gốc, không tự hợp thức hóa).`,
    );
  }

  return {
    cases,
    legacyArchive,
    migrationMeta: {
      migrationVersion: CASE_MIGRATION_VERSION,
      migratedAt: safeMigratedAt,
      sourceSchema: input.sourceSchema ?? "v3",
      migratedCaseCount,
      archivedLegacyCount,
      preservedExistingCaseCount,
      notes,
    },
  };
}

/**
 * Enforces read-only access boundaries on archived legacy records: unresolved tenants,
 * Platform Admin, Implementation Staff, and Viewer are always denied.
 */
export function canActorViewLegacyArchiveEntry(
  entry: LegacyCaseArchiveEntry,
  actor: Pick<UserProfile, "id" | "role" | "enterpriseId">,
): boolean {
  if (!entry.enterpriseId) return false;
  if (
    actor.role === "Platform Admin" ||
    actor.role === "Implementation Staff" ||
    actor.role === "Viewer"
  ) {
    return false;
  }
  if (!actor.enterpriseId || actor.enterpriseId !== entry.enterpriseId) return false;
  if (actor.role === "Operator") return true;
  if (actor.role === "Investigator") {
    return Boolean(entry.canResolveAssigneeId && entry.canResolveAssigneeId === actor.id);
  }
  if (actor.role === "SME Admin") {
    return (
      entry.reasonCode !== "CROSS_TENANT_CONFLICT" &&
      CONCLUDED_LEGACY_STATUSES.has(String(entry.legacyCaseStatus ?? ""))
    );
  }
  return false;
}

/**
 * Checks whether a transaction/alert is already bound to a WF-04 `InvestigationCase`,
 * an archived legacy case, or raw legacy `caseId`/`caseStatus` fields.
 */
export function isAlertBlockedByCasesOrLegacy(
  tx: TransactionRisk,
  cases: readonly InvestigationCase[],
  legacyArchive: readonly LegacyCaseArchiveEntry[],
): boolean {
  const cleanAlertId = readTrimmedString(tx.alertId);
  if (readTrimmedString(tx.caseId) || readTrimmedString(tx.caseStatus)) {
    return true;
  }
  if (
    cases.some(
      c =>
        (cleanAlertId ? c.alertIds.includes(cleanAlertId) : false) ||
        c.alerts.some(
          a => a.transactionId === tx.id || (cleanAlertId ? a.alertId === cleanAlertId : false),
        ),
    )
  ) {
    return true;
  }
  return legacyArchive.some(
    entry =>
      entry.blocksAlertCreation &&
      (entry.transactionIds.includes(tx.id) ||
        (cleanAlertId ? entry.alertIds.includes(cleanAlertId) : false)),
  );
}
