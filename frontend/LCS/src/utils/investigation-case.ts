import type { Enterprise } from "@/types/enterprise";
import type { ProjectItem, TransactionRisk, UserRole } from "@/types/fraudguard";
import type {
  AssignInvestigatorInput,
  ConfirmedInvestigationReportView,
  ConfirmInvestigationCaseReportInput,
  CreateInvestigationCaseInput,
  InvestigationCase,
  InvestigationCaseActorInput,
  InvestigationCaseActorRef,
  InvestigationCaseAlertLink,
  InvestigationCaseAlertReportItem,
  InvestigationCaseCommandResult,
  InvestigationCaseConclusion,
  InvestigationCaseCreationEligibility,
  InvestigationCaseCreationEligibilityResult,
  InvestigationCaseError,
  InvestigationCaseErrorCode,
  InvestigationCaseEvent,
  InvestigationCaseEventType,
  InvestigationCaseReadAccess,
  InvestigationCaseReportVersion,
  InvestigationCaseStatus,
  ReadConfirmedInvestigationReportResult,
  ReadInternalInvestigationCaseResult,
  ReadInvestigationCaseInput,
  RequestInvestigationCaseRevisionInput,
  SelfAssignInvestigationCaseInput,
  SubmitInvestigationReportInput,
} from "@/types/investigation-case";
import {
  checkEnterpriseOperationalEligibility,
  isEnterpriseOperating,
  isEnterpriseSubscriptionActive,
  parseStrictIsoTimestamp,
} from "@/utils/enterprise-lifecycle";

const VALID_CASE_STATUSES = new Set<InvestigationCaseStatus>([
  "Open",
  "Investigating",
  "Pending Review",
  "Closed",
]);

const KNOWN_USER_ROLES = new Set<UserRole>([
  "Platform Admin",
  "Implementation Staff",
  "SME Admin",
  "Operator",
  "Investigator",
  "Viewer",
]);

function fail(code: InvestigationCaseErrorCode, error: string): InvestigationCaseError {
  return { ok: false, code, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  return Object.freeze(value);
}

function freezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function parseIsoTimestampField(
  at: unknown,
  fieldLabel: string,
): { ok: true; iso: string; ms: number } | InvestigationCaseError {
  if (typeof at !== "string") {
    return fail(
      "INVALID_TIMESTAMP",
      `${fieldLabel} phải là chuỗi ISO-8601 có thông tin múi giờ.`,
    );
  }
  const parsed = parseStrictIsoTimestamp(at);
  if (!parsed.ok || !Number.isFinite(parsed.ms)) {
    return fail(
      "INVALID_TIMESTAMP",
      `${fieldLabel} phải là chuỗi ISO-8601 hợp lệ và có múi giờ (Z hoặc +HH:MM).`,
    );
  }
  return { ok: true, iso: parsed.iso, ms: parsed.ms };
}

function resolveStrictTimestamp(
  at: string | undefined,
): { ok: true; iso: string; ms: number } | InvestigationCaseError {
  return parseIsoTimestampField(at, "Thời điểm thao tác");
}

/**
 * Enforces monotonic UTC-millisecond chronology for post-create transitions against
 * stored case timestamps, preventing silent clock drift or out-of-order events.
 */
function resolveMonotonicTransitionTimestamp(
  investigationCase: InvestigationCase,
  at: string | undefined,
): { ok: true; iso: string; ms: number } | InvestigationCaseError {
  const opTs = resolveStrictTimestamp(at);
  if (!opTs.ok) return opTs;

  const created = parseIsoTimestampField(
    investigationCase.createdAt,
    "Mốc thời gian createdAt của case",
  );
  if (!created.ok) return created;

  const updated = parseIsoTimestampField(
    investigationCase.updatedAt,
    "Mốc thời gian updatedAt của case",
  );
  if (!updated.ok) return updated;

  if (updated.ms < created.ms) {
    return fail(
      "TIMESTAMP_OUT_OF_ORDER",
      "Mốc thời gian updatedAt của case không được sớm hơn createdAt.",
    );
  }

  let floorMs = updated.ms;
  let prevEventMs: number | undefined;
  for (let i = 0; i < investigationCase.history.length; i += 1) {
    const event = investigationCase.history[i];
    if (!isPlainObject(event)) {
      return fail("INVALID_CASE", "Lịch sử sự kiện của case không hợp lệ.");
    }
    const eventTs = parseIsoTimestampField(
      event.at,
      `Mốc thời gian history[${i}].at`,
    );
    if (!eventTs.ok) return eventTs;
    if (eventTs.ms < created.ms || eventTs.ms > updated.ms) {
      return fail(
        "TIMESTAMP_OUT_OF_ORDER",
        `Mốc thời gian history[${i}].at nằm ngoài khoảng [createdAt, updatedAt] của case.`,
      );
    }
    if (prevEventMs !== undefined && eventTs.ms < prevEventMs) {
      return fail(
        "TIMESTAMP_OUT_OF_ORDER",
        `Mốc thời gian history[${i}].at sớm hơn sự kiện liền trước.`,
      );
    }
    prevEventMs = eventTs.ms;
    floorMs = Math.max(floorMs, eventTs.ms);
  }

  const milestoneChecks: Array<{ value: unknown; label: string }> = [];
  if (investigationCase.assignedAt !== undefined) {
    milestoneChecks.push({
      value: investigationCase.assignedAt,
      label: "Mốc thời gian assignedAt của case",
    });
  }
  for (let i = 0; i < investigationCase.reports.length; i += 1) {
    const report = investigationCase.reports[i];
    if (!isPlainObject(report)) {
      return fail("INVALID_CASE", "Danh sách phiên bản báo cáo của case không hợp lệ.");
    }
    if (report.submittedAt !== undefined) {
      milestoneChecks.push({
        value: report.submittedAt,
        label: `Mốc thời gian reports[${i}].submittedAt`,
      });
    }
  }

  for (const milestone of milestoneChecks) {
    const parsed = parseIsoTimestampField(milestone.value, milestone.label);
    if (!parsed.ok) return parsed;
    if (parsed.ms < created.ms || parsed.ms > updated.ms) {
      return fail(
        "TIMESTAMP_OUT_OF_ORDER",
        `${milestone.label} nằm ngoài khoảng [createdAt, updatedAt] của case.`,
      );
    }
    floorMs = Math.max(floorMs, parsed.ms);
  }

  if (opTs.ms < floorMs) {
    return fail(
      "TIMESTAMP_OUT_OF_ORDER",
      "Thời điểm thao tác không được sớm hơn mốc thời gian đã ghi nhận của case.",
    );
  }

  return opTs;
}

function nextUniqueDeterministicId(
  provided: string | undefined,
  prefix: string,
  usedIds: Set<string>,
  invalidCode: "INVALID_ID" | "INVALID_REPORT_ID",
  duplicateCode: "DUPLICATE_EVENT_ID" | "DUPLICATE_REPORT_ID",
  emptyError: string,
  duplicateError: string,
): { ok: true; id: string } | InvestigationCaseError {
  if (provided !== undefined) {
    if (typeof provided !== "string" || !provided.trim()) {
      return fail(invalidCode, emptyError);
    }
    const clean = provided.trim();
    if (usedIds.has(clean)) {
      return fail(duplicateCode, duplicateError);
    }
    return { ok: true, id: clean };
  }
  let seq = usedIds.size + 1;
  let candidate = `${prefix}-${seq}`;
  while (usedIds.has(candidate)) {
    seq += 1;
    candidate = `${prefix}-${seq}`;
  }
  return { ok: true, id: candidate };
}

function resolveCaseEventId(
  caseId: string,
  history: readonly InvestigationCaseEvent[],
  provided: string | undefined,
): { ok: true; id: string } | InvestigationCaseError {
  const usedEventIds = new Set(history.map(e => e.eventId));
  return nextUniqueDeterministicId(
    provided,
    `${caseId}-evt`,
    usedEventIds,
    "INVALID_ID",
    "DUPLICATE_EVENT_ID",
    "Mã sự kiện (eventId) không được để trống.",
    "Mã sự kiện bị trùng lặp trong lịch sử case.",
  );
}

function validateActor(
  actor: InvestigationCaseActorInput | undefined,
): { ok: true; ref: InvestigationCaseActorRef } | InvestigationCaseError {
  if (
    !isPlainObject(actor) ||
    typeof actor.id !== "string" ||
    !actor.id.trim() ||
    typeof actor.role !== "string" ||
    !KNOWN_USER_ROLES.has(actor.role as UserRole)
  ) {
    return fail("INVALID_ACTOR", "Thông tin người thực hiện (actor) không hợp lệ.");
  }
  const cleanEnterpriseId =
    typeof actor.enterpriseId === "string" && actor.enterpriseId.trim()
      ? actor.enterpriseId.trim()
      : undefined;
  const cleanName =
    typeof actor.name === "string" && actor.name.trim() ? actor.name.trim() : undefined;

  return {
    ok: true,
    ref: {
      actorId: actor.id.trim(),
      role: actor.role as UserRole,
      ...(cleanEnterpriseId ? { enterpriseId: cleanEnterpriseId } : {}),
      ...(cleanName ? { name: cleanName } : {}),
    },
  };
}

function validateTenantRole(
  actor: InvestigationCaseActorInput | undefined,
  allowedRoles: readonly UserRole[],
  enterpriseId: string,
  roleError: string,
  tenantError: string,
): { ok: true; ref: InvestigationCaseActorRef } | InvestigationCaseError {
  const actorResult = validateActor(actor);
  if (!actorResult.ok) return actorResult;
  if (!allowedRoles.includes(actorResult.ref.role)) {
    return fail("FORBIDDEN_ROLE", roleError);
  }
  if (!actorResult.ref.enterpriseId || actorResult.ref.enterpriseId !== enterpriseId) {
    return fail("FORBIDDEN_TENANT", tenantError);
  }
  return actorResult;
}

function validateCaseEntity(
  investigationCase: InvestigationCase | undefined,
): { ok: true; value: InvestigationCase } | InvestigationCaseError {
  if (
    !isPlainObject(investigationCase) ||
    typeof investigationCase.caseId !== "string" ||
    !investigationCase.caseId.trim() ||
    typeof investigationCase.enterpriseId !== "string" ||
    !investigationCase.enterpriseId.trim() ||
    typeof investigationCase.status !== "string" ||
    !VALID_CASE_STATUSES.has(investigationCase.status as InvestigationCaseStatus) ||
    !Array.isArray(investigationCase.alertIds) ||
    investigationCase.alertIds.length === 0 ||
    !Array.isArray(investigationCase.alerts) ||
    investigationCase.alerts.length !== investigationCase.alertIds.length ||
    !Array.isArray(investigationCase.reports) ||
    !Array.isArray(investigationCase.history)
  ) {
    return fail("INVALID_CASE", "Hồ sơ case điều tra không hợp lệ.");
  }
  return { ok: true, value: investigationCase };
}

function requireNonClosedCaseAndState(
  investigationCase: InvestigationCase | undefined,
  expectedStatus: Exclude<InvestigationCaseStatus, "Closed">,
): { ok: true; value: InvestigationCase } | InvestigationCaseError {
  const caseCheck = validateCaseEntity(investigationCase);
  if (!caseCheck.ok) return caseCheck;
  if (caseCheck.value.status === "Closed") {
    return fail("CASE_ALREADY_CLOSED", "Case đã đóng (Closed), không thể chỉnh sửa hoặc ghi thêm.");
  }
  if (caseCheck.value.status !== expectedStatus) {
    return fail(
      "INVALID_STATE",
      `Thao tác chỉ hợp lệ khi case ở trạng thái ${expectedStatus} (hiện tại: ${caseCheck.value.status}).`,
    );
  }
  return caseCheck;
}

function findPendingReviewReport(
  investigationCase: InvestigationCase,
): InvestigationCaseReportVersion | null {
  if (
    typeof investigationCase.pendingReviewReportId !== "string" ||
    !investigationCase.pendingReviewReportId.trim() ||
    typeof investigationCase.pendingReviewReportVersion !== "number"
  ) {
    return null;
  }
  return (
    investigationCase.reports.find(
      r =>
        r.reportId === investigationCase.pendingReviewReportId &&
        r.version === investigationCase.pendingReviewReportVersion,
    ) ?? null
  );
}

function findConfirmedReport(
  investigationCase: InvestigationCase,
): InvestigationCaseReportVersion | null {
  if (investigationCase.status !== "Closed" || !isPlainObject(investigationCase.conclusion)) {
    return null;
  }
  const { reportId, reportVersion } = investigationCase.conclusion;
  if (typeof reportId !== "string" || typeof reportVersion !== "number") return null;
  return (
    investigationCase.reports.find(
      r => r.reportId === reportId && r.version === reportVersion,
    ) ?? null
  );
}

function mapWf01EligibilityError(
  reasonCode: ReturnType<typeof checkEnterpriseOperationalEligibility>["reasonCode"],
  reason?: string,
): InvestigationCaseError {
  switch (reasonCode) {
    case "ENTERPRISE_NOT_FOUND":
      return fail("ENTERPRISE_NOT_FOUND", reason ?? "Không tìm thấy doanh nghiệp.");
    case "UNINITIALIZED_LEGACY":
      return fail(
        "ENTERPRISE_LIFECYCLE_UNINITIALIZED",
        reason ?? "Doanh nghiệp chưa khởi tạo vòng đời WF-01.",
      );
    case "NOT_OPERATING":
      return fail(
        "ENTERPRISE_NOT_OPERATING",
        reason ?? "Doanh nghiệp chưa ở trạng thái Operating.",
      );
    case "MISSING_SERVICE_PLAN":
      return fail("MISSING_SERVICE_PLAN", reason ?? "Doanh nghiệp chưa có gói dịch vụ hợp lệ.");
    case "PLAN_NOT_SUBSCRIPTION":
      return fail(
        "PLAN_NOT_SUBSCRIPTION",
        reason ?? "Chỉ doanh nghiệp gói Subscription mới được mở case điều tra AI.",
      );
    case "SUBSCRIPTION_NOT_STARTED":
      return fail(
        "SUBSCRIPTION_NOT_STARTED",
        reason ?? "Gói Subscription của doanh nghiệp chưa bắt đầu hiệu lực.",
      );
    case "SUBSCRIPTION_EXPIRED":
      return fail(
        "SUBSCRIPTION_EXPIRED",
        reason ?? "Gói Subscription đã hết hạn; không thể tạo case mới.",
      );
    case "INVALID_TIMESTAMP":
      return fail("INVALID_TIMESTAMP", reason ?? "Thời điểm kiểm tra không hợp lệ.");
    default:
      return fail(
        "ENTERPRISE_NOT_OPERATING",
        reason ?? "Doanh nghiệp chưa đủ điều kiện mở case điều tra.",
      );
  }
}

/**
 * Verifies WF-01 operational status and active Subscription window at case creation.
 * Existing cases never re-run this check after creation.
 */
export function checkInvestigationCaseCreationEligibility(
  enterprise: Enterprise | undefined,
  at: string,
): InvestigationCaseCreationEligibilityResult {
  const ts = resolveStrictTimestamp(at);
  if (!ts.ok) return ts;

  const eligibility = checkEnterpriseOperationalEligibility(enterprise, {
    at: ts.iso,
    requireSubscription: true,
  });
  if (!eligibility.eligible) {
    return mapWf01EligibilityError(eligibility.reasonCode, eligibility.reason);
  }

  if (
    !enterprise ||
    !isEnterpriseOperating(enterprise) ||
    !isEnterpriseSubscriptionActive(enterprise, ts.iso) ||
    !enterprise.lifecycle?.activation ||
    !enterprise.lifecycle.subscription ||
    !eligibility.status ||
    !eligibility.plan
  ) {
    return fail(
      "ENTERPRISE_NOT_OPERATING",
      "Không thể xác nhận snapshot vận hành và gói Subscription hợp lệ từ dữ liệu WF-01.",
    );
  }

  const snapshot: InvestigationCaseCreationEligibility = {
    verifiedAt: ts.iso,
    operatingStatus: eligibility.status,
    servicePlan: eligibility.plan,
    activatedAt: enterprise.lifecycle.activation.activatedAt,
    configVersion: enterprise.lifecycle.activation.configVersion,
    subscriptionStartedAt: enterprise.lifecycle.subscription.startedAt,
    subscriptionExpiresAt: enterprise.lifecycle.subscription.expiresAt,
    subscriptionDuration: {
      value: enterprise.lifecycle.subscription.duration.value,
      unit: enterprise.lifecycle.subscription.duration.unit,
    },
  };

  return { ok: true, eligibility: freezeClone(snapshot) };
}

export function evaluateInvestigationCaseReadAccess(
  investigationCase: InvestigationCase,
  actor: InvestigationCaseActorInput,
): InvestigationCaseReadAccess {
  const caseCheck = validateCaseEntity(investigationCase);
  if (!caseCheck.ok) {
    return {
      canViewInternalCase: false,
      canViewConfirmedReport: false,
      reasonCode: caseCheck.code,
      reason: caseCheck.error,
    };
  }

  const actorCheck = validateActor(actor);
  if (!actorCheck.ok) {
    return {
      canViewInternalCase: false,
      canViewConfirmedReport: false,
      reasonCode: actorCheck.code,
      reason: actorCheck.error,
    };
  }

  const ref = actorCheck.ref;
  if (
    ref.role === "Platform Admin" ||
    ref.role === "Implementation Staff" ||
    ref.role === "Viewer"
  ) {
    return {
      canViewInternalCase: false,
      canViewConfirmedReport: false,
      reasonCode: "FORBIDDEN_ROLE",
      reason: `${ref.role} không có quyền mặc định truy cập hồ sơ điều tra nội bộ.`,
    };
  }

  const caseEnterpriseId = caseCheck.value.enterpriseId.trim();
  if (!ref.enterpriseId || ref.enterpriseId !== caseEnterpriseId) {
    return {
      canViewInternalCase: false,
      canViewConfirmedReport: false,
      reasonCode: "FORBIDDEN_TENANT",
      reason: "Người dùng không thuộc doanh nghiệp sở hữu case.",
    };
  }

  const hasConfirmed = findConfirmedReport(caseCheck.value) !== null;

  if (ref.role === "Operator") {
    return {
      canViewInternalCase: true,
      canViewConfirmedReport: hasConfirmed,
      ...(hasConfirmed
        ? {}
        : {
            reasonCode: "REPORT_NOT_CONFIRMED" as const,
            reason: "Case chưa có báo cáo và kết luận được xác nhận.",
          }),
    };
  }

  if (ref.role === "Investigator") {
    const assignee = caseCheck.value.assignee;
    if (!assignee || assignee.actorId !== ref.actorId || assignee.role !== "Investigator") {
      return {
        canViewInternalCase: false,
        canViewConfirmedReport: false,
        reasonCode: "FORBIDDEN_ASSIGNEE",
        reason: "Investigator chỉ được truy cập case được phân công theo đúng user ID.",
      };
    }
    return {
      canViewInternalCase: true,
      canViewConfirmedReport: hasConfirmed,
      ...(hasConfirmed
        ? {}
        : {
            reasonCode: "REPORT_NOT_CONFIRMED" as const,
            reason: "Case chưa có báo cáo và kết luận được xác nhận.",
          }),
    };
  }

  // SME Admin may view only confirmed reports/conclusions in their own tenant.
  return {
    canViewInternalCase: false,
    canViewConfirmedReport: hasConfirmed,
    ...(hasConfirmed
      ? {}
      : {
          reasonCode: "REPORT_NOT_CONFIRMED" as const,
          reason: "SME Admin chỉ được xem báo cáo và kết luận đã xác nhận.",
        }),
  };
}

export function readInternalInvestigationCase(
  input: ReadInvestigationCaseInput,
): ReadInternalInvestigationCaseResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu yêu cầu đọc case không hợp lệ.");
  }
  const access = evaluateInvestigationCaseReadAccess(input.investigationCase, input.actor);
  if (!access.canViewInternalCase) {
    if (
      input.actor?.role === "SME Admin" &&
      (access.canViewConfirmedReport || access.reasonCode === "REPORT_NOT_CONFIRMED")
    ) {
      return fail(
        "FORBIDDEN_ROLE",
        "SME Admin chỉ được xem báo cáo và kết luận đã xác nhận, không truy cập hồ sơ điều tra nội bộ.",
      );
    }
    return fail(
      access.reasonCode ?? "FORBIDDEN_ROLE",
      access.reason ?? "Không có quyền truy cập hồ sơ điều tra nội bộ.",
    );
  }
  return { ok: true, investigationCase: freezeClone(input.investigationCase) };
}

export function readConfirmedInvestigationReport(
  input: ReadInvestigationCaseInput,
): ReadConfirmedInvestigationReportResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu yêu cầu đọc báo cáo không hợp lệ.");
  }
  const access = evaluateInvestigationCaseReadAccess(input.investigationCase, input.actor);
  if (!access.canViewConfirmedReport) {
    return fail(
      access.reasonCode ?? "REPORT_NOT_CONFIRMED",
      access.reason ?? "Chưa thể xem báo cáo xác nhận của case này.",
    );
  }

  const confirmedReport = findConfirmedReport(input.investigationCase);
  if (!confirmedReport || !input.investigationCase.conclusion || !input.investigationCase.closedAt) {
    return fail("REPORT_NOT_CONFIRMED", "Case chưa có báo cáo và kết luận đã xác nhận.");
  }

  const view: ConfirmedInvestigationReportView = {
    caseId: input.investigationCase.caseId,
    enterpriseId: input.investigationCase.enterpriseId,
    status: "Closed",
    alertIds: [...input.investigationCase.alertIds],
    alerts: structuredClone(input.investigationCase.alerts),
    createdAt: input.investigationCase.createdAt,
    updatedAt: input.investigationCase.updatedAt,
    closedAt: input.investigationCase.closedAt,
    confirmedReport: structuredClone(confirmedReport),
    conclusion: structuredClone(input.investigationCase.conclusion),
  };

  return { ok: true, view: freezeClone(view) };
}

function validateAlertProjectOwnership(
  tx: TransactionRisk,
  enterprise: Enterprise,
  enterprises?: readonly Enterprise[],
  projects?: readonly Pick<ProjectItem, "id">[],
): InvestigationCaseError | null {
  const projectId = typeof tx.projectId === "string" ? tx.projectId.trim() : "";
  if (!projectId) {
    return fail("INVALID_PROJECT_MAPPING", "Alert thiếu mã dự án (projectId) hợp lệ.");
  }
  if (projects !== undefined) {
    if (!Array.isArray(projects) || !projects.some(p => isPlainObject(p) && p.id === projectId)) {
      return fail(
        "INVALID_PROJECT_MAPPING",
        `Dự án '${projectId}' không tồn tại trong danh mục dự án.`,
      );
    }
  }
  if (enterprises !== undefined) {
    if (!Array.isArray(enterprises)) {
      return fail("INVALID_PROJECT_MAPPING", "Danh sách doanh nghiệp đối chiếu không hợp lệ.");
    }
    const owners = enterprises.filter(
      e => isPlainObject(e) && Array.isArray(e.projectIds) && e.projectIds.includes(projectId),
    );
    if (owners.length === 0) {
      return fail(
        "INVALID_PROJECT_MAPPING",
        `Dự án '${projectId}' chưa được ánh xạ tới doanh nghiệp nào.`,
      );
    }
    if (owners.length > 1) {
      return fail(
        "INVALID_PROJECT_MAPPING",
        `Dự án '${projectId}' bị ánh xạ trùng tới nhiều doanh nghiệp.`,
      );
    }
    if (owners[0].id !== enterprise.id) {
      return fail(
        "CROSS_TENANT_ALERT",
        `Alert thuộc dự án '${projectId}' của doanh nghiệp khác.`,
      );
    }
  }
  if (!Array.isArray(enterprise.projectIds) || enterprise.projectIds.length === 0) {
    return fail(
      "INVALID_PROJECT_MAPPING",
      "Doanh nghiệp chưa có phạm vi dự án hợp lệ để đối chiếu alert.",
    );
  }
  if (!enterprise.projectIds.includes(projectId)) {
    return fail(
      "CROSS_TENANT_ALERT",
      `Alert thuộc dự án '${projectId}' không nằm trong phạm vi của doanh nghiệp ${enterprise.id}.`,
    );
  }
  return null;
}

function toAlertLink(tx: TransactionRisk): InvestigationCaseAlertLink {
  const alertId = tx.alertId!.trim();
  const link: InvestigationCaseAlertLink = {
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
    ...(typeof tx.alertName === "string" && tx.alertName.trim()
      ? { alertName: tx.alertName.trim() }
      : {}),
    ...(typeof tx.confidence === "number" ? { confidence: tx.confidence } : {}),
    ...(typeof tx.modelVersion === "string" && tx.modelVersion.trim()
      ? { modelVersion: tx.modelVersion.trim() }
      : {}),
    ...(typeof tx.explanation === "string" && tx.explanation.trim()
      ? { explanation: tx.explanation.trim() }
      : {}),
  };
  return link;
}

/**
 * Creates a new `Open` investigation case atomically after checking tenant eligibility,
 * alert uniqueness across `input.existingCases` (mandatory; pass `[]` explicitly when none),
 * and WF-01 Operating + Subscription window.
 */
export function createInvestigationCase(
  input: CreateInvestigationCaseInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu tạo case không hợp lệ.");
  }

  const cleanCaseId = typeof input.caseId === "string" ? input.caseId.trim() : "";
  if (!cleanCaseId) {
    return fail("MISSING_CASE_ID", "Phải cung cấp mã case (caseId) xác định.");
  }

  const ts = resolveStrictTimestamp(input.at);
  if (!ts.ok) return ts;

  if (!isPlainObject(input.enterprise) || typeof input.enterprise.id !== "string" || !input.enterprise.id.trim()) {
    return fail("ENTERPRISE_NOT_FOUND", "Không tìm thấy hồ sơ doanh nghiệp hợp lệ.");
  }
  const enterpriseId = input.enterprise.id.trim();

  const actorCheck = validateTenantRole(
    input.actor,
    ["Operator"],
    enterpriseId,
    "Chỉ Operator cùng doanh nghiệp mới được phép tạo case điều tra.",
    "Operator không thuộc doanh nghiệp sở hữu case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const eligibilityCheck = checkInvestigationCaseCreationEligibility(input.enterprise, ts.iso);
  if (!eligibilityCheck.ok) return eligibilityCheck;

  if (
    !Object.prototype.hasOwnProperty.call(input, "existingCases") ||
    input.existingCases === undefined ||
    input.existingCases === null
  ) {
    return fail(
      "MISSING_EXISTING_CASES",
      "Phải truyền danh sách existingCases (dùng [] nếu chưa có case nào) để kiểm tra trùng mã case và alert đã gắn.",
    );
  }
  if (!Array.isArray(input.existingCases)) {
    return fail("INVALID_CASE", "Danh sách case hiện có không hợp lệ.");
  }
  const existingCases = input.existingCases;
  if (
    existingCases.some(
      c => isPlainObject(c) && typeof c.caseId === "string" && c.caseId.trim() === cleanCaseId,
    )
  ) {
    return fail("DUPLICATE_CASE_ID", `Mã case '${cleanCaseId}' đã tồn tại.`);
  }

  const eventIdRes = resolveCaseEventId(cleanCaseId, [], input.eventId);
  if (!eventIdRes.ok) return eventIdRes;

  if (!Array.isArray(input.alertIds) || input.alertIds.length === 0) {
    return fail("EMPTY_ALERT_LIST", "Phải chọn ít nhất một AI Alert đủ điều kiện để tạo case.");
  }
  if (!Array.isArray(input.alerts)) {
    return fail("ALERT_NOT_FOUND", "Danh sách alert nguồn không hợp lệ.");
  }

  const linkedAlertIds = new Set<string>();
  for (const existing of existingCases) {
    if (!isPlainObject(existing)) continue;
    if (Array.isArray(existing.alertIds)) {
      for (const id of existing.alertIds) {
        if (typeof id === "string" && id.trim()) linkedAlertIds.add(id.trim());
      }
    }
    if (Array.isArray(existing.alerts)) {
      for (const link of existing.alerts) {
        if (isPlainObject(link) && typeof link.alertId === "string" && link.alertId.trim()) {
          linkedAlertIds.add(link.alertId.trim());
        }
      }
    }
  }

  const seenSelected = new Set<string>();
  const validatedLinks: InvestigationCaseAlertLink[] = [];

  // Validate every selected alert atomically before building the new Open case.
  for (const rawAlertId of input.alertIds) {
    if (typeof rawAlertId !== "string" || !rawAlertId.trim()) {
      return fail("INVALID_ALERT_ID", "Danh sách chọn chứa alertId không hợp lệ.");
    }
    const alertId = rawAlertId.trim();
    if (seenSelected.has(alertId)) {
      return fail("DUPLICATE_ALERT_ID", `Alert '${alertId}' bị chọn lặp lại trong danh sách.`);
    }
    seenSelected.add(alertId);

    // Match strictly by alertId; never substitute transaction id without explicit mapping.
    const matches = input.alerts.filter(
      tx => isPlainObject(tx) && typeof tx.alertId === "string" && tx.alertId.trim() === alertId,
    );
    if (matches.length === 0) {
      return fail("ALERT_NOT_FOUND", `Không tìm thấy AI Alert có mã '${alertId}'.`);
    }
    if (matches.length > 1) {
      return fail(
        "AMBIGUOUS_ALERT_MAPPING",
        `Có nhiều hơn một bản ghi trùng mã alert '${alertId}'.`,
      );
    }

    const tx = matches[0];
    if (tx.scoringSource !== "AI") {
      return fail(
        "INELIGIBLE_ALERT_SOURCE",
        `Alert '${alertId}' có nguồn '${String(tx.scoringSource)}' không đủ điều kiện điều tra WF-04.`,
      );
    }
    if (tx.riskLevel !== "Abnormal") {
      return fail(
        "INELIGIBLE_ALERT_RISK_LEVEL",
        `Alert '${alertId}' có mức '${String(tx.riskLevel)}', chỉ AI Alert Abnormal mới được đưa vào điều tra.`,
      );
    }

    const projectError = validateAlertProjectOwnership(
      tx,
      input.enterprise,
      input.enterprises,
      input.projects,
    );
    if (projectError) return projectError;

    if (linkedAlertIds.has(alertId)) {
      return fail(
        "ALERT_ALREADY_LINKED",
        `Alert '${alertId}' đã được liên kết với một case khác.`,
      );
    }
    if (
      (typeof tx.caseId === "string" && tx.caseId.trim().length > 0) ||
      (tx.caseStatus !== undefined && tx.caseStatus !== null && String(tx.caseStatus).trim().length > 0)
    ) {
      return fail(
        "ALERT_LEGACY_LINKED",
        `Alert '${alertId}' đang mang liên kết case legacy và chưa được chuyển đổi.`,
      );
    }

    validatedLinks.push(toAlertLink(tx));
  }

  const cleanNote = typeof input.note === "string" && input.note.trim() ? input.note.trim() : undefined;
  const event: InvestigationCaseEvent = {
    eventId: eventIdRes.id,
    type: "CASE_CREATED",
    at: ts.iso,
    actor: structuredClone(actorCheck.ref),
    fromStatus: null,
    toStatus: "Open",
    ...(cleanNote ? { note: cleanNote } : {}),
  };

  const newCase: InvestigationCase = {
    caseId: cleanCaseId,
    enterpriseId,
    status: "Open",
    alertIds: validatedLinks.map(a => a.alertId),
    alerts: validatedLinks,
    createdBy: structuredClone(actorCheck.ref),
    createdAt: ts.iso,
    updatedAt: ts.iso,
    creationEligibility: structuredClone(eligibilityCheck.eligibility),
    reports: [],
    history: [structuredClone(event)],
  };

  return {
    ok: true,
    investigationCase: freezeClone(newCase),
    event: freezeClone(event),
  };
}

function transitionOpenToInvestigating(args: {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorRef;
  assignee: InvestigationCaseActorRef;
  assignmentMode: "assigned" | "self_investigated";
  eventType: Extract<
    InvestigationCaseEventType,
    "INVESTIGATOR_ASSIGNED" | "OPERATOR_SELF_ASSIGNED"
  >;
  at: string;
  eventId?: string;
  note?: string;
}): InvestigationCaseCommandResult {
  const { investigationCase, actor, assignee, assignmentMode, eventType, at, eventId, note } = args;
  const eventIdRes = resolveCaseEventId(investigationCase.caseId, investigationCase.history, eventId);
  if (!eventIdRes.ok) return eventIdRes;

  const cleanNote = typeof note === "string" && note.trim() ? note.trim() : undefined;
  const event: InvestigationCaseEvent = {
    eventId: eventIdRes.id,
    type: eventType,
    at,
    actor: structuredClone(actor),
    fromStatus: "Open",
    toStatus: "Investigating",
    assignee: structuredClone(assignee),
    ...(cleanNote ? { note: cleanNote } : {}),
  };

  const nextCase: InvestigationCase = {
    ...structuredClone(investigationCase),
    status: "Investigating",
    assignmentMode,
    assignee: structuredClone(assignee),
    assignedBy: structuredClone(actor),
    assignedAt: at,
    updatedAt: at,
    history: [...structuredClone(investigationCase.history), structuredClone(event)],
  };

  return {
    ok: true,
    investigationCase: freezeClone(nextCase),
    event: freezeClone(event),
  };
}

export function assignInvestigatorToCase(
  input: AssignInvestigatorInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu phân công không hợp lệ.");
  }
  const caseCheck = requireNonClosedCaseAndState(input.investigationCase, "Open");
  if (!caseCheck.ok) return caseCheck;

  const actorCheck = validateTenantRole(
    input.actor,
    ["Operator"],
    caseCheck.value.enterpriseId.trim(),
    "Chỉ Operator cùng doanh nghiệp mới được phân công Investigator.",
    "Operator không thuộc doanh nghiệp sở hữu case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const ts = resolveMonotonicTransitionTimestamp(caseCheck.value, input.at);
  if (!ts.ok) return ts;

  const cleanAssigneeId = typeof input.assigneeId === "string" ? input.assigneeId.trim() : "";
  if (!cleanAssigneeId) {
    return fail("MISSING_ASSIGNEE_ID", "Phải cung cấp user ID của Investigator được phân công.");
  }
  if (!Array.isArray(input.users)) {
    return fail("INVALID_USER_DIRECTORY", "Danh sách người dùng để tra cứu phân công không hợp lệ.");
  }

  const actorMatches = input.users.filter(
    u => isPlainObject(u) && typeof u.id === "string" && u.id.trim() === actorCheck.ref.actorId,
  );
  if (actorMatches.length > 1) {
    return fail("AMBIGUOUS_USER", "Danh sách người dùng có trùng lặp ID của actor.");
  }
  if (
    actorMatches.length === 1 &&
    (actorMatches[0].role !== actorCheck.ref.role ||
      actorMatches[0].enterpriseId?.trim() !== actorCheck.ref.enterpriseId)
  ) {
    return fail("INVALID_ACTOR", "Thông tin actor không khớp dữ liệu người dùng.");
  }

  // Resolve assignee strictly by user ID, never by display name.
  const matchedAssignees = input.users.filter(
    u => isPlainObject(u) && typeof u.id === "string" && u.id.trim() === cleanAssigneeId,
  );
  if (matchedAssignees.length === 0) {
    return fail("ASSIGNEE_NOT_FOUND", `Không tìm thấy người dùng với ID '${cleanAssigneeId}'.`);
  }
  if (matchedAssignees.length > 1) {
    return fail("AMBIGUOUS_USER", `Có nhiều người dùng trùng ID '${cleanAssigneeId}'.`);
  }

  const assigneeCheck = validateActor(matchedAssignees[0]);
  if (!assigneeCheck.ok) return assigneeCheck;
  if (assigneeCheck.ref.role !== "Investigator") {
    return fail(
      "INVALID_ASSIGNEE_ROLE",
      `Chỉ được phân công người dùng có vai trò Investigator (nhận được: ${assigneeCheck.ref.role}).`,
    );
  }
  if (assigneeCheck.ref.enterpriseId !== caseCheck.value.enterpriseId.trim()) {
    return fail(
      "ASSIGNEE_TENANT_MISMATCH",
      "Investigator được phân công phải thuộc cùng doanh nghiệp với case.",
    );
  }

  return transitionOpenToInvestigating({
    investigationCase: caseCheck.value,
    actor: actorCheck.ref,
    assignee: assigneeCheck.ref,
    assignmentMode: "assigned",
    eventType: "INVESTIGATOR_ASSIGNED",
    at: ts.iso,
    eventId: input.eventId,
    note: input.note,
  });
}

export function selfAssignInvestigationCase(
  input: SelfAssignInvestigationCaseInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu tự đảm nhận điều tra không hợp lệ.");
  }
  const caseCheck = requireNonClosedCaseAndState(input.investigationCase, "Open");
  if (!caseCheck.ok) return caseCheck;

  const actorCheck = validateTenantRole(
    input.actor,
    ["Operator"],
    caseCheck.value.enterpriseId.trim(),
    "Chỉ Operator cùng doanh nghiệp mới được tự đảm nhận điều tra case.",
    "Operator không thuộc doanh nghiệp sở hữu case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const ts = resolveMonotonicTransitionTimestamp(caseCheck.value, input.at);
  if (!ts.ok) return ts;

  return transitionOpenToInvestigating({
    investigationCase: caseCheck.value,
    actor: actorCheck.ref,
    assignee: actorCheck.ref,
    assignmentMode: "self_investigated",
    eventType: "OPERATOR_SELF_ASSIGNED",
    at: ts.iso,
    eventId: input.eventId,
    note: input.note,
  });
}

export function submitInvestigationReport(
  input: SubmitInvestigationReportInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu gửi báo cáo không hợp lệ.");
  }
  const caseCheck = requireNonClosedCaseAndState(input.investigationCase, "Investigating");
  if (!caseCheck.ok) return caseCheck;

  const actorCheck = validateTenantRole(
    input.actor,
    ["Investigator", "Operator"],
    caseCheck.value.enterpriseId.trim(),
    "Chỉ người phụ trách điều tra (Investigator được giao hoặc Operator tự đảm nhận) mới được gửi báo cáo.",
    "Người gửi báo cáo không thuộc doanh nghiệp của case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const assignee = caseCheck.value.assignee;
  if (
    !assignee ||
    assignee.actorId !== actorCheck.ref.actorId ||
    assignee.role !== actorCheck.ref.role
  ) {
    return fail(
      "FORBIDDEN_ASSIGNEE",
      "Chỉ đúng người phụ trách đang điều tra (theo user ID) mới được viết và gửi báo cáo.",
    );
  }

  const ts = resolveMonotonicTransitionTimestamp(caseCheck.value, input.at);
  if (!ts.ok) return ts;

  const cleanSummary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!cleanSummary) {
    return fail("MISSING_REPORT_SUMMARY", "Báo cáo điều tra phải có phần tổng kết chung không rỗng.");
  }

  if (!Array.isArray(input.alertResults)) {
    return fail(
      "INVALID_REPORT_ALERT_RESULTS",
      "Báo cáo phải cung cấp danh sách kết quả và bằng chứng cho từng AI Alert.",
    );
  }

  const caseAlertById = new Map<string, InvestigationCaseAlertLink>();
  for (const link of caseCheck.value.alerts) {
    caseAlertById.set(link.alertId, link);
  }

  const normalizedByAlertId = new Map<string, InvestigationCaseAlertReportItem>();
  for (const item of input.alertResults) {
    if (!isPlainObject(item) || typeof item.alertId !== "string" || !item.alertId.trim()) {
      return fail(
        "INVALID_REPORT_ALERT_RESULTS",
        "Mỗi mục kết quả trong báo cáo phải có mã alertId hợp lệ.",
      );
    }
    const alertId = item.alertId.trim();
    if (normalizedByAlertId.has(alertId)) {
      return fail("DUPLICATE_REPORT_ALERT", `Báo cáo bị trùng lặp alert '${alertId}'.`);
    }
    const caseAlert = caseAlertById.get(alertId);
    if (!caseAlert) {
      return fail(
        "EXTRA_REPORT_ALERT",
        `Báo cáo chứa alert '${alertId}' không thuộc danh sách alert của case.`,
      );
    }
    const cleanResult = typeof item.resultText === "string" ? item.resultText.trim() : "";
    if (!cleanResult) {
      return fail(
        "MISSING_ALERT_RESULT",
        `Alert '${alertId}' chưa có nội dung kết quả điều tra.`,
      );
    }
    const cleanEvidence = typeof item.evidence === "string" ? item.evidence.trim() : "";
    if (!cleanEvidence) {
      return fail(
        "MISSING_ALERT_EVIDENCE",
        `Alert '${alertId}' chưa có nội dung bằng chứng điều tra.`,
      );
    }
    normalizedByAlertId.set(alertId, {
      alertId,
      transactionId: caseAlert.transactionId,
      transactionReference: caseAlert.transactionReference,
      resultText: cleanResult,
      evidence: cleanEvidence,
    });
  }

  const orderedAlertResults: InvestigationCaseAlertReportItem[] = [];
  for (const expectedAlertId of caseCheck.value.alertIds) {
    const item = normalizedByAlertId.get(expectedAlertId);
    if (!item) {
      return fail(
        "MISSING_REPORT_ALERT",
        `Báo cáo thiếu kết quả/bằng chứng cho alert '${expectedAlertId}'.`,
      );
    }
    orderedAlertResults.push(item);
  }

  const nextVersion = caseCheck.value.reports.length + 1;
  const usedReportIds = new Set(caseCheck.value.reports.map(r => r.reportId));
  const reportIdRes = nextUniqueDeterministicId(
    input.reportId,
    `${caseCheck.value.caseId}-report-v${nextVersion}`,
    usedReportIds,
    "INVALID_REPORT_ID",
    "DUPLICATE_REPORT_ID",
    "Mã báo cáo (reportId) không được để trống.",
    "Mã báo cáo đã tồn tại trong lịch sử phiên bản của case.",
  );
  if (!reportIdRes.ok) return reportIdRes;

  const eventIdRes = resolveCaseEventId(
    caseCheck.value.caseId,
    caseCheck.value.history,
    input.eventId,
  );
  if (!eventIdRes.ok) return eventIdRes;

  const reportVersion: InvestigationCaseReportVersion = {
    reportId: reportIdRes.id,
    version: nextVersion,
    submittedBy: structuredClone(actorCheck.ref),
    submittedAt: ts.iso,
    summary: cleanSummary,
    alertResults: orderedAlertResults,
  };

  const cleanNote = typeof input.note === "string" && input.note.trim() ? input.note.trim() : undefined;
  const event: InvestigationCaseEvent = {
    eventId: eventIdRes.id,
    type: "REPORT_SUBMITTED",
    at: ts.iso,
    actor: structuredClone(actorCheck.ref),
    fromStatus: "Investigating",
    toStatus: "Pending Review",
    reportId: reportVersion.reportId,
    reportVersion: reportVersion.version,
    ...(cleanNote ? { note: cleanNote } : {}),
  };

  const nextCase: InvestigationCase = {
    ...structuredClone(caseCheck.value),
    status: "Pending Review",
    pendingReviewReportId: reportVersion.reportId,
    pendingReviewReportVersion: reportVersion.version,
    updatedAt: ts.iso,
    reports: [...structuredClone(caseCheck.value.reports), structuredClone(reportVersion)],
    history: [...structuredClone(caseCheck.value.history), structuredClone(event)],
  };

  return {
    ok: true,
    investigationCase: freezeClone(nextCase),
    event: freezeClone(event),
  };
}

export function requestInvestigationCaseRevision(
  input: RequestInvestigationCaseRevisionInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu yêu cầu bổ sung không hợp lệ.");
  }
  const caseCheck = requireNonClosedCaseAndState(input.investigationCase, "Pending Review");
  if (!caseCheck.ok) return caseCheck;

  const actorCheck = validateTenantRole(
    input.actor,
    ["Operator"],
    caseCheck.value.enterpriseId.trim(),
    "Chỉ Operator cùng doanh nghiệp mới được yêu cầu bổ sung báo cáo.",
    "Operator không thuộc doanh nghiệp sở hữu case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const ts = resolveMonotonicTransitionTimestamp(caseCheck.value, input.at);
  if (!ts.ok) return ts;

  const cleanReason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!cleanReason) {
    return fail("MISSING_REVISION_REASON", "Phải nhập lý do khi yêu cầu bổ sung báo cáo.");
  }

  const pendingReport = findPendingReviewReport(caseCheck.value);
  if (!pendingReport) {
    return fail("NO_PENDING_REPORT", "Không tìm thấy phiên bản báo cáo đang chờ duyệt.");
  }

  const eventIdRes = resolveCaseEventId(
    caseCheck.value.caseId,
    caseCheck.value.history,
    input.eventId,
  );
  if (!eventIdRes.ok) return eventIdRes;

  const event: InvestigationCaseEvent = {
    eventId: eventIdRes.id,
    type: "REVISION_REQUESTED",
    at: ts.iso,
    actor: structuredClone(actorCheck.ref),
    fromStatus: "Pending Review",
    toStatus: "Investigating",
    reportId: pendingReport.reportId,
    reportVersion: pendingReport.version,
    reason: cleanReason,
  };

  const nextCase: InvestigationCase = {
    ...structuredClone(caseCheck.value),
    status: "Investigating",
    pendingReviewReportId: undefined,
    pendingReviewReportVersion: undefined,
    updatedAt: ts.iso,
    history: [...structuredClone(caseCheck.value.history), structuredClone(event)],
  };

  return {
    ok: true,
    investigationCase: freezeClone(nextCase),
    event: freezeClone(event),
  };
}

/**
 * Confirms the pending latest report version and closes the case.
 * Both `input.reportId` and `input.reportVersion` are required and bound to the displayed pending report.
 */
export function confirmInvestigationCaseReport(
  input: ConfirmInvestigationCaseReportInput,
): InvestigationCaseCommandResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_CASE", "Dữ liệu xác nhận kết luận không hợp lệ.");
  }
  const caseCheck = requireNonClosedCaseAndState(input.investigationCase, "Pending Review");
  if (!caseCheck.ok) return caseCheck;

  const actorCheck = validateTenantRole(
    input.actor,
    ["Operator"],
    caseCheck.value.enterpriseId.trim(),
    "Chỉ Operator cùng doanh nghiệp mới được xác nhận kết luận và đóng case.",
    "Operator không thuộc doanh nghiệp sở hữu case.",
  );
  if (!actorCheck.ok) return actorCheck;

  const ts = resolveMonotonicTransitionTimestamp(caseCheck.value, input.at);
  if (!ts.ok) return ts;

  const pendingReport = findPendingReviewReport(caseCheck.value);
  if (!pendingReport) {
    return fail("NO_PENDING_REPORT", "Không có phiên bản báo cáo đang chờ duyệt để xác nhận.");
  }

  const latestReport = caseCheck.value.reports[caseCheck.value.reports.length - 1];
  if (
    !latestReport ||
    pendingReport.reportId !== latestReport.reportId ||
    pendingReport.version !== latestReport.version
  ) {
    return fail("STALE_REPORT_VERSION", "Chỉ được xác nhận phiên bản báo cáo mới nhất đang chờ duyệt.");
  }

  if (
    !Object.prototype.hasOwnProperty.call(input, "reportId") ||
    input.reportId === undefined ||
    input.reportId === null
  ) {
    return fail(
      "MISSING_REPORT_ID",
      "Phải cung cấp mã báo cáo (reportId) đang chờ duyệt để xác nhận.",
    );
  }
  if (typeof input.reportId !== "string" || !input.reportId.trim()) {
    return fail("INVALID_REPORT_ID", "Mã báo cáo xác nhận không hợp lệ.");
  }
  const targetId = input.reportId.trim();

  if (
    !Object.prototype.hasOwnProperty.call(input, "reportVersion") ||
    input.reportVersion === undefined ||
    input.reportVersion === null
  ) {
    return fail(
      "MISSING_REPORT_VERSION",
      "Phải cung cấp số phiên bản báo cáo (reportVersion) đang chờ duyệt để xác nhận.",
    );
  }
  if (
    typeof input.reportVersion !== "number" ||
    !Number.isFinite(input.reportVersion) ||
    !Number.isInteger(input.reportVersion) ||
    input.reportVersion <= 0
  ) {
    return fail("INVALID_REPORT_VERSION", "Số phiên bản báo cáo xác nhận không hợp lệ.");
  }

  if (targetId !== pendingReport.reportId) {
    if (caseCheck.value.reports.some(r => r.reportId === targetId)) {
      return fail(
        "STALE_REPORT_VERSION",
        `Báo cáo '${targetId}' là phiên bản cũ và không còn ở trạng thái chờ duyệt.`,
      );
    }
    return fail("REPORT_NOT_FOUND", `Không tìm thấy báo cáo '${targetId}' trong case.`);
  }

  if (input.reportVersion !== pendingReport.version) {
    if (caseCheck.value.reports.some(r => r.version === input.reportVersion)) {
      return fail(
        "STALE_REPORT_VERSION",
        `Phiên bản v${input.reportVersion} đã bị thay thế; chỉ được xác nhận v${pendingReport.version}.`,
      );
    }
    return fail(
      "REPORT_VERSION_MISMATCH",
      `Phiên bản v${input.reportVersion} không khớp phiên bản chờ duyệt v${pendingReport.version}.`,
    );
  }

  let finalSummary = pendingReport.summary;
  if (input.finalSummary !== undefined) {
    const trimmed = typeof input.finalSummary === "string" ? input.finalSummary.trim() : "";
    if (!trimmed) {
      return fail("MISSING_CONCLUSION_SUMMARY", "Tổng kết kết luận cuối cùng không được để trống.");
    }
    finalSummary = trimmed;
  }

  const eventIdRes = resolveCaseEventId(
    caseCheck.value.caseId,
    caseCheck.value.history,
    input.eventId,
  );
  if (!eventIdRes.ok) return eventIdRes;

  const conclusion: InvestigationCaseConclusion = {
    reportId: pendingReport.reportId,
    reportVersion: pendingReport.version,
    confirmedBy: structuredClone(actorCheck.ref),
    confirmedAt: ts.iso,
    summary: finalSummary,
    alertResults: pendingReport.alertResults.map(item => ({
      alertId: item.alertId,
      transactionId: item.transactionId,
      transactionReference: item.transactionReference,
      resultText: item.resultText,
      evidence: item.evidence,
    })),
  };

  const cleanNote = typeof input.note === "string" && input.note.trim() ? input.note.trim() : undefined;
  const event: InvestigationCaseEvent = {
    eventId: eventIdRes.id,
    type: "REPORT_CONFIRMED_AND_CLOSED",
    at: ts.iso,
    actor: structuredClone(actorCheck.ref),
    fromStatus: "Pending Review",
    toStatus: "Closed",
    reportId: pendingReport.reportId,
    reportVersion: pendingReport.version,
    ...(cleanNote ? { note: cleanNote } : {}),
  };

  const nextCase: InvestigationCase = {
    ...structuredClone(caseCheck.value),
    status: "Closed",
    pendingReviewReportId: undefined,
    pendingReviewReportVersion: undefined,
    conclusion: structuredClone(conclusion),
    closedAt: ts.iso,
    updatedAt: ts.iso,
    history: [...structuredClone(caseCheck.value.history), structuredClone(event)],
  };

  return {
    ok: true,
    investigationCase: freezeClone(nextCase),
    event: freezeClone(event),
  };
}
