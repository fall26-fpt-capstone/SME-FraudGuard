import type { Enterprise } from "@/types/enterprise";
import type { AuditLogEntry, UserRole } from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type {
  BuildConfirmedReportFeedbackPreviewArgs,
  BuildConfirmedReportFeedbackPreviewResult,
  FeedbackActorDirectoryEntry,
  InvestigationActorReference,
  InvestigationReportFeedback,
  InvestigationReportFeedbackAlertItem,
  InvestigationReportFeedbackErrorCode,
  InvestigationReportFeedbackSnapshot,
  ReadReportFeedbackDetailResult,
  SubmitConfirmedReportFeedbackArgs,
  SubmitConfirmedReportFeedbackResult,
} from "@/types/report-feedback";
import { parseStrictIsoTimestamp } from "@/utils/enterprise-lifecycle";
import { readConfirmedInvestigationReport } from "@/utils/investigation-case";

const MAX_SME_COMMENT_LENGTH = 2000;

const KNOWN_USER_ROLES = new Set<UserRole>([
  "Platform Admin",
  "Implementation Staff",
  "SME Admin",
  "Operator",
  "Investigator",
  "Viewer",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function failFeedback(
  code: InvestigationReportFeedbackErrorCode,
  message: string,
  existingFeedbackId?: string,
): {
  readonly ok: false;
  readonly code: InvestigationReportFeedbackErrorCode;
  readonly message: string;
  readonly existingFeedbackId?: string;
} {
  return {
    ok: false,
    code,
    message,
    ...(existingFeedbackId ? { existingFeedbackId } : {}),
  };
}

function isActorInactive(actor: FeedbackActorDirectoryEntry): boolean {
  if (actor.isActive === false || actor.disabled === true) return true;
  if (typeof actor.status === "string") {
    const cleanStatus = actor.status.trim().toLowerCase();
    if (
      cleanStatus === "inactive" ||
      cleanStatus === "disabled" ||
      cleanStatus === "suspended"
    ) {
      return true;
    }
  }
  return false;
}

function toFeedbackActorRef(
  actor: FeedbackActorDirectoryEntry,
): InvestigationActorReference {
  const cleanName = typeof actor.name === "string" && actor.name.trim() ? actor.name.trim() : undefined;
  const cleanEnterpriseId =
    typeof actor.enterpriseId === "string" && actor.enterpriseId.trim()
      ? actor.enterpriseId.trim()
      : undefined;
  return {
    actorId: actor.id.trim(),
    actorRole: actor.role,
    ...(cleanEnterpriseId ? { enterpriseId: cleanEnterpriseId } : {}),
    ...(cleanName ? { name: cleanName } : {}),
  };
}

function resolveAuthoritativeActor(args: {
  actor: unknown;
  users?: readonly FeedbackActorDirectoryEntry[];
  allowedRoles: readonly UserRole[];
  roleDeniedMessage: string;
  requireEnterpriseId: boolean;
}):
  | {
      readonly ok: true;
      readonly ref: InvestigationActorReference;
      readonly email: string;
    }
  | ReturnType<typeof failFeedback> {
  if (!isPlainObject(args.actor) || !isNonEmptyString(args.actor.id)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Thiếu thông tin người thực hiện hợp lệ.");
  }

  const rawActor = args.actor as unknown as FeedbackActorDirectoryEntry;
  if (typeof rawActor.role !== "string" || !KNOWN_USER_ROLES.has(rawActor.role)) {
    return failFeedback("FORBIDDEN_ROLE", args.roleDeniedMessage);
  }
  if (isActorInactive(rawActor)) {
    return failFeedback("FORBIDDEN_ROLE", "Tài khoản thực hiện đang bị vô hiệu hóa.");
  }

  let authoritative = rawActor;
  if (args.users !== undefined) {
    if (!Array.isArray(args.users)) {
      return failFeedback("INVALID_FEEDBACK_INPUT", "Danh bạ người dùng không hợp lệ.");
    }
    const cleanId = rawActor.id.trim();
    const matches = args.users.filter(
      item => isPlainObject(item) && typeof item.id === "string" && item.id.trim() === cleanId,
    );
    if (matches.length !== 1) {
      return failFeedback(
        "FORBIDDEN_ROLE",
        "Không xác minh được tài khoản hợp lệ trong danh bạ người dùng.",
      );
    }
    const directoryUser = matches[0];
    if (isActorInactive(directoryUser)) {
      return failFeedback("FORBIDDEN_ROLE", "Tài khoản trong danh bạ đang bị vô hiệu hóa.");
    }
    if (
      directoryUser.role !== rawActor.role ||
      (directoryUser.enterpriseId?.trim() || "") !== (rawActor.enterpriseId?.trim() || "")
    ) {
      return failFeedback(
        "FORBIDDEN_ROLE",
        "Thông tin vai trò hoặc doanh nghiệp của tài khoản không khớp danh bạ.",
      );
    }
    authoritative = directoryUser;
  }

  if (!args.allowedRoles.includes(authoritative.role)) {
    return failFeedback("FORBIDDEN_ROLE", args.roleDeniedMessage);
  }

  const ref = toFeedbackActorRef(authoritative);
  if (args.requireEnterpriseId && !ref.enterpriseId) {
    return failFeedback(
      "FORBIDDEN_TENANT",
      "Tài khoản chưa gắn với doanh nghiệp hợp lệ.",
    );
  }

  const email =
    typeof authoritative.email === "string" && authoritative.email.trim()
      ? authoritative.email.trim()
      : "";
  return { ok: true, ref, email };
}

function compareFeedbackNewestFirst(
  a: InvestigationReportFeedback,
  b: InvestigationReportFeedback,
): number {
  const tsA = parseStrictIsoTimestamp(a.submittedAt);
  const tsB = parseStrictIsoTimestamp(b.submittedAt);
  const msA = tsA.ok ? tsA.ms : Number.NEGATIVE_INFINITY;
  const msB = tsB.ok ? tsB.ms : Number.NEGATIVE_INFINITY;
  if (msB !== msA) return msB - msA;
  return a.feedbackId.localeCompare(b.feedbackId);
}

function buildFeedbackProjectionCore(params: {
  actor: unknown;
  caseId: unknown;
  cases: unknown;
  enterprises: unknown;
  users?: readonly FeedbackActorDirectoryEntry[];
  expectedReportId?: unknown;
  expectedReportVersion?: unknown;
  requireExpectedVersion: boolean;
  smeComment?: unknown;
  submittedAt?: unknown;
  requireSubmittedAt: boolean;
  existingFeedbacks?: readonly InvestigationReportFeedback[];
}):
  | {
      readonly ok: true;
      readonly actorEmail: string;
      readonly caseItem: InvestigationCase;
      readonly enterprise: Enterprise;
      readonly snapshot: InvestigationReportFeedbackSnapshot;
      readonly existingFeedback?: InvestigationReportFeedback;
    }
  | ReturnType<typeof failFeedback> {
  const actorRes = resolveAuthoritativeActor({
    actor: params.actor,
    users: params.users,
    allowedRoles: ["SME Admin"],
    roleDeniedMessage: "Chỉ SME Admin của doanh nghiệp mới được xem trước và gửi feedback.",
    requireEnterpriseId: true,
  });
  if (!actorRes.ok) return actorRes;

  if (!isNonEmptyString(params.caseId)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Thiếu mã hồ sơ điều tra.");
  }
  if (!Array.isArray(params.cases) || !Array.isArray(params.enterprises)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Danh sách hồ sơ hoặc doanh nghiệp không hợp lệ.");
  }

  const cleanCaseId = params.caseId.trim();
  const matchedCases = (params.cases as readonly unknown[]).filter(
    (item): item is InvestigationCase =>
      isPlainObject(item) && typeof item.caseId === "string" && item.caseId.trim() === cleanCaseId,
  );
  if (matchedCases.length === 0) {
    return failFeedback("CASE_NOT_FOUND", `Không tìm thấy hồ sơ điều tra '${cleanCaseId}'.`);
  }
  if (matchedCases.length > 1) {
    return failFeedback("INVALID_FEEDBACK_INPUT", `Phát hiện trùng lặp mã hồ sơ '${cleanCaseId}'.`);
  }
  const caseItem = matchedCases[0];

  const actorEnterpriseId = actorRes.ref.enterpriseId!;
  if (
    typeof caseItem.enterpriseId !== "string" ||
    caseItem.enterpriseId.trim() !== actorEnterpriseId
  ) {
    return failFeedback(
      "FORBIDDEN_TENANT",
      "SME Admin chỉ được gửi feedback cho báo cáo thuộc doanh nghiệp của mình.",
    );
  }

  if (caseItem.status !== "Closed") {
    return failFeedback(
      "CASE_NOT_CLOSED",
      "Chỉ có thể gửi feedback khi hồ sơ điều tra đã được xác nhận và đóng (Closed).",
    );
  }

  const confirmedRead = readConfirmedInvestigationReport({
    investigationCase: caseItem,
    actor: {
      id: actorRes.ref.actorId,
      role: actorRes.ref.actorRole,
      enterpriseId: actorEnterpriseId,
      ...(actorRes.ref.name ? { name: actorRes.ref.name } : {}),
    },
  });
  if (!confirmedRead.ok) {
    return failFeedback(
      confirmedRead.code === "FORBIDDEN_TENANT" ? "FORBIDDEN_TENANT" : "MISSING_CONFIRMED_REPORT",
      confirmedRead.error,
    );
  }

  const confirmedView = confirmedRead.view;
  const { confirmedReport, conclusion } = confirmedView;

  if (params.requireExpectedVersion || params.expectedReportId !== undefined) {
    if (params.expectedReportId === undefined || params.expectedReportId === null) {
      return failFeedback("MISSING_REPORT_ID", "Thiếu mã báo cáo xác nhận cần gửi feedback.");
    }
    if (!isNonEmptyString(params.expectedReportId)) {
      return failFeedback("INVALID_REPORT_ID", "Mã báo cáo xác nhận không hợp lệ.");
    }
    const cleanExpectedId = params.expectedReportId.trim();
    if (cleanExpectedId !== confirmedReport.reportId) {
      const isOldReportId = caseItem.reports.some(r => r.reportId === cleanExpectedId);
      return failFeedback(
        isOldReportId ? "STALE_REPORT_VERSION" : "REPORT_VERSION_MISMATCH",
        "Báo cáo được chọn không khớp với phiên bản đã xác nhận hiện hành; vui lòng mở lại báo cáo.",
      );
    }
  }

  if (params.requireExpectedVersion || params.expectedReportVersion !== undefined) {
    if (params.expectedReportVersion === undefined || params.expectedReportVersion === null) {
      return failFeedback("MISSING_REPORT_VERSION", "Thiếu số phiên bản báo cáo cần gửi feedback.");
    }
    if (
      typeof params.expectedReportVersion !== "number" ||
      !Number.isFinite(params.expectedReportVersion) ||
      !Number.isInteger(params.expectedReportVersion) ||
      params.expectedReportVersion <= 0
    ) {
      return failFeedback("INVALID_REPORT_VERSION", "Số phiên bản báo cáo không hợp lệ.");
    }
    if (params.expectedReportVersion !== confirmedReport.version) {
      const isOldVersion = caseItem.reports.some(r => r.version === params.expectedReportVersion);
      return failFeedback(
        isOldVersion ? "STALE_REPORT_VERSION" : "REPORT_VERSION_MISMATCH",
        `Phiên bản báo cáo v${params.expectedReportVersion} không khớp với bản đã xác nhận v${confirmedReport.version}.`,
      );
    }
  }

  const matchedEnterprise = (params.enterprises as readonly unknown[]).find(
    (e): e is Enterprise =>
      isPlainObject(e) && typeof e.id === "string" && e.id.trim() === actorEnterpriseId,
  );
  if (!matchedEnterprise || !isNonEmptyString(matchedEnterprise.name)) {
    return failFeedback(
      "INVALID_FEEDBACK_INPUT",
      "Không tìm thấy thông tin doanh nghiệp hợp lệ cho hồ sơ này.",
    );
  }

  let cleanComment: string | undefined;
  if (params.smeComment !== undefined) {
    if (typeof params.smeComment !== "string") {
      return failFeedback("INVALID_FEEDBACK_INPUT", "Nhận xét của SME Admin phải là văn bản.");
    }
    const trimmed = params.smeComment.trim();
    if (trimmed.length > MAX_SME_COMMENT_LENGTH) {
      return failFeedback(
        "INVALID_FEEDBACK_INPUT",
        `Nhận xét không được vượt quá ${MAX_SME_COMMENT_LENGTH} ký tự.`,
      );
    }
    if (trimmed.length > 0) {
      cleanComment = trimmed;
    }
  }

  const confirmedTs = parseStrictIsoTimestamp(conclusion.confirmedAt);
  if (!confirmedTs.ok) {
    return failFeedback("INVALID_TIMESTAMP", "Mốc thời gian xác nhận báo cáo không hợp lệ.");
  }

  let cleanSubmittedAt = "";
  if (params.requireSubmittedAt || params.submittedAt !== undefined) {
    if (typeof params.submittedAt !== "string") {
      return failFeedback(
        "INVALID_TIMESTAMP",
        "Thời điểm gửi feedback phải là chuỗi ISO-8601 có múi giờ.",
      );
    }
    const submittedTs = parseStrictIsoTimestamp(params.submittedAt);
    if (!submittedTs.ok) {
      return failFeedback(
        "INVALID_TIMESTAMP",
        "Thời điểm gửi feedback phải là chuỗi ISO-8601 hợp lệ và có múi giờ.",
      );
    }
    if (submittedTs.ms < confirmedTs.ms) {
      return failFeedback(
        "TIMESTAMP_OUT_OF_ORDER",
        "Thời điểm gửi feedback không được sớm hơn thời điểm báo cáo được xác nhận.",
      );
    }
    cleanSubmittedAt = submittedTs.iso;
  }

  const alertLinkById = new Map(confirmedView.alerts.map(link => [link.alertId, link]));
  const projectedAlerts: InvestigationReportFeedbackAlertItem[] = [];
  for (const item of conclusion.alertResults) {
    const link = alertLinkById.get(item.alertId);
    if (
      !link ||
      link.scoringSource !== "AI" ||
      !isNonEmptyString(link.projectName) ||
      !isNonEmptyString(item.transactionReference) ||
      !isNonEmptyString(item.resultText) ||
      !isNonEmptyString(item.evidence)
    ) {
      return failFeedback(
        "INVALID_FEEDBACK_INPUT",
        `Dữ liệu kết quả/bằng chứng cho cảnh báo '${item.alertId}' không hợp lệ để tạo feedback.`,
      );
    }
    const cleanAlertName =
      typeof link.alertName === "string" && link.alertName.trim()
        ? link.alertName.trim()
        : undefined;
    projectedAlerts.push({
      alertId: item.alertId.trim(),
      ...(cleanAlertName ? { alertName: cleanAlertName } : {}),
      transactionReference: item.transactionReference.trim(),
      projectName: link.projectName.trim(),
      scoringSource: "AI",
      resultText: item.resultText.trim(),
      evidence: item.evidence.trim(),
    });
  }

  if (projectedAlerts.length === 0) {
    return failFeedback(
      "MISSING_CONFIRMED_REPORT",
      "Báo cáo xác nhận không có danh sách kết quả cảnh báo AI.",
    );
  }

  const confirmedByName =
    typeof conclusion.confirmedBy.name === "string" && conclusion.confirmedBy.name.trim()
      ? conclusion.confirmedBy.name.trim()
      : undefined;
  const confirmedByEnterpriseId =
    typeof conclusion.confirmedBy.enterpriseId === "string" &&
    conclusion.confirmedBy.enterpriseId.trim()
      ? conclusion.confirmedBy.enterpriseId.trim()
      : undefined;

  const snapshot: InvestigationReportFeedbackSnapshot = {
    enterpriseId: actorEnterpriseId,
    enterpriseName: matchedEnterprise.name.trim(),
    caseId: confirmedView.caseId,
    reportId: confirmedReport.reportId,
    reportVersion: confirmedReport.version,
    reportSummary: confirmedReport.summary.trim(),
    conclusionSummary: conclusion.summary.trim(),
    confirmedBy: {
      actorId: conclusion.confirmedBy.actorId.trim(),
      actorRole: conclusion.confirmedBy.role,
      ...(confirmedByEnterpriseId ? { enterpriseId: confirmedByEnterpriseId } : {}),
      ...(confirmedByName ? { name: confirmedByName } : {}),
    },
    confirmedAt: confirmedTs.iso,
    submittedBy: actorRes.ref,
    submittedAt: cleanSubmittedAt,
    ...(cleanComment ? { smeComment: cleanComment } : {}),
    alertResults: projectedAlerts,
  };

  const existingFeedback =
    Array.isArray(params.existingFeedbacks)
      ? params.existingFeedbacks.find(
          fb =>
            fb.enterpriseId === actorEnterpriseId &&
            fb.caseId === confirmedView.caseId &&
            fb.reportId === confirmedReport.reportId &&
            fb.reportVersion === confirmedReport.version,
        )
      : undefined;

  return {
    ok: true,
    actorEmail: actorRes.email,
    caseItem,
    enterprise: matchedEnterprise,
    snapshot,
    ...(existingFeedback ? { existingFeedback: freezeClone(existingFeedback) } : {}),
  };
}

/**
 * Projects a confirmed WF-04 report into a 1:1 WYSIWYG allowlist snapshot for SME Admin preview
 * without reading internal drafts, unconfirmed reports, assignee internals, or raw transaction fields.
 */
export function buildConfirmedReportFeedbackPreview(
  args: BuildConfirmedReportFeedbackPreviewArgs,
): BuildConfirmedReportFeedbackPreviewResult {
  if (!isPlainObject(args)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Tham số xem trước feedback không hợp lệ.");
  }

  const projected = buildFeedbackProjectionCore({
    actor: args.actor,
    caseId: args.caseId,
    cases: args.cases,
    enterprises: args.enterprises,
    users: args.users,
    expectedReportId: args.expectedReportId,
    expectedReportVersion: args.expectedReportVersion,
    requireExpectedVersion: false,
    smeComment: args.smeComment,
    submittedAt: args.submittedAt,
    requireSubmittedAt: false,
    existingFeedbacks: args.existingFeedbacks,
  });

  if (!projected.ok) return projected;
  return {
    ok: true,
    snapshot: freezeClone(projected.snapshot),
    ...(projected.existingFeedback ? { existingFeedback: projected.existingFeedback } : {}),
  };
}

export const projectConfirmedReportFeedbackSnapshot = buildConfirmedReportFeedbackPreview;

/**
 * Validates authoritative SME Admin, Closed case, exact confirmed reportId/version, strict ISO
 * ordering, and deduplication before producing an immutable `InvestigationReportFeedback` and 1 audit log.
 */
export function submitConfirmedReportFeedback(
  args: SubmitConfirmedReportFeedbackArgs,
): SubmitConfirmedReportFeedbackResult {
  if (!isPlainObject(args)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Dữ liệu gửi feedback không hợp lệ.");
  }
  if (!isNonEmptyString(args.feedbackId)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Thiếu mã feedback hợp lệ.");
  }
  if (!Array.isArray(args.existingFeedbacks)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Danh sách feedback hiện có không hợp lệ.");
  }

  const cleanFeedbackId = args.feedbackId.trim();

  const projected = buildFeedbackProjectionCore({
    actor: args.actor,
    caseId: args.caseId,
    cases: args.cases,
    enterprises: args.enterprises,
    users: args.users,
    expectedReportId: args.expectedReportId,
    expectedReportVersion: args.expectedReportVersion,
    requireExpectedVersion: true,
    smeComment: args.smeComment,
    submittedAt: args.submittedAt,
    requireSubmittedAt: true,
    existingFeedbacks: args.existingFeedbacks,
  });
  if (!projected.ok) return projected;

  if (projected.existingFeedback) {
    return failFeedback(
      "DUPLICATE_REPORT_FEEDBACK",
      "Phiên bản báo cáo xác nhận này đã được gửi feedback trước đó.",
      projected.existingFeedback.feedbackId,
    );
  }

  const duplicateFeedbackId = args.existingFeedbacks.find(
    item => isPlainObject(item) && typeof item.feedbackId === "string" && item.feedbackId.trim() === cleanFeedbackId,
  );
  if (duplicateFeedbackId) {
    return failFeedback(
      "INVALID_FEEDBACK_INPUT",
      `Mã feedback '${cleanFeedbackId}' đã tồn tại.`,
      duplicateFeedbackId.feedbackId,
    );
  }

  const snapshot = projected.snapshot;
  const feedback: InvestigationReportFeedback = {
    feedbackId: cleanFeedbackId,
    enterpriseId: snapshot.enterpriseId,
    caseId: snapshot.caseId,
    reportId: snapshot.reportId,
    reportVersion: snapshot.reportVersion,
    submittedBy: snapshot.submittedBy,
    submittedAt: snapshot.submittedAt,
    ...(snapshot.smeComment ? { smeComment: snapshot.smeComment } : {}),
    snapshot,
  };

  const nextFeedbacks = [...structuredClone(args.existingFeedbacks), feedback].sort(
    compareFeedbackNewestFirst,
  );

  const cleanAuditId =
    typeof args.auditId === "string" && args.auditId.trim()
      ? args.auditId.trim()
      : `${cleanFeedbackId}-audit`;
  const cleanIpAddress =
    typeof args.ipAddress === "string" && args.ipAddress.trim()
      ? args.ipAddress.trim()
      : "127.0.0.1";

  const auditLog: AuditLogEntry = {
    enterpriseId: snapshot.enterpriseId,
    id: cleanAuditId,
    timestamp: snapshot.submittedAt,
    actor: {
      name: snapshot.submittedBy.name ?? snapshot.submittedBy.actorId,
      email: projected.actorEmail,
      role: snapshot.submittedBy.actorRole,
    },
    action: "REPORT_FEEDBACK_SENT",
    target: snapshot.caseId,
    ipAddress: cleanIpAddress,
    details: `Gửi phản hồi ${cleanFeedbackId} cho báo cáo xác nhận ${snapshot.reportId} (v${snapshot.reportVersion}) của doanh nghiệp ${snapshot.enterpriseName} (${snapshot.enterpriseId}) thuộc hồ sơ ${snapshot.caseId}.`,
  };

  return {
    ok: true,
    value: freezeClone({
      feedbacks: nextFeedbacks,
      feedback,
      auditLog,
    }),
  };
}

/**
 * Returns submitted feedback snapshots visible to the current role (Platform Admin sees all;
 * SME Admin sees own tenant only; all other roles receive empty list). Sorted newest-first.
 */
export function readReportFeedbacksForUser(args: {
  readonly actor: FeedbackActorDirectoryEntry;
  readonly feedbacks: readonly InvestigationReportFeedback[];
  readonly users?: readonly FeedbackActorDirectoryEntry[];
}): readonly InvestigationReportFeedback[] {
  if (!isPlainObject(args) || !Array.isArray(args.feedbacks)) {
    return freezeClone([]);
  }
  const actorRes = resolveAuthoritativeActor({
    actor: args.actor,
    users: args.users,
    allowedRoles: ["Platform Admin", "SME Admin"],
    roleDeniedMessage: "Vai trò này không được quyền đọc feedback báo cáo.",
    requireEnterpriseId: args.actor?.role === "SME Admin",
  });
  if (!actorRes.ok) {
    return freezeClone([]);
  }

  const scoped =
    actorRes.ref.actorRole === "Platform Admin"
      ? args.feedbacks
      : args.feedbacks.filter(item => item.enterpriseId === actorRes.ref.enterpriseId);

  return freezeClone([...scoped].sort(compareFeedbackNewestFirst));
}

/**
 * Reads a single submitted feedback record with strict role and tenant enforcement.
 */
export function readReportFeedbackDetailForUser(args: {
  readonly actor: FeedbackActorDirectoryEntry;
  readonly feedbacks: readonly InvestigationReportFeedback[];
  readonly feedbackId: string;
  readonly users?: readonly FeedbackActorDirectoryEntry[];
}): ReadReportFeedbackDetailResult {
  if (!isPlainObject(args) || !Array.isArray(args.feedbacks)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Dữ liệu đọc chi tiết feedback không hợp lệ.");
  }

  const actorRes = resolveAuthoritativeActor({
    actor: args.actor,
    users: args.users,
    allowedRoles: ["Platform Admin", "SME Admin"],
    roleDeniedMessage: "Vai trò này không có quyền đọc feedback báo cáo đã gửi.",
    requireEnterpriseId: args.actor?.role === "SME Admin",
  });
  if (!actorRes.ok) {
    return actorRes;
  }

  if (!isNonEmptyString(args.feedbackId)) {
    return failFeedback("INVALID_FEEDBACK_INPUT", "Thiếu mã feedback cần xem.");
  }
  const cleanId = args.feedbackId.trim();
  const target = args.feedbacks.find(
    item => isPlainObject(item) && typeof item.feedbackId === "string" && item.feedbackId.trim() === cleanId,
  );
  if (!target) {
    return failFeedback("FEEDBACK_NOT_FOUND", `Không tìm thấy feedback '${cleanId}'.`);
  }

  if (
    actorRes.ref.actorRole === "SME Admin" &&
    target.enterpriseId !== actorRes.ref.enterpriseId
  ) {
    return failFeedback(
      "FORBIDDEN_TENANT",
      "SME Admin chỉ được xem feedback thuộc doanh nghiệp của mình.",
    );
  }

  return {
    ok: true,
    value: freezeClone(target),
  };
}

/**
 * Finds whether feedback has already been sent for an exact confirmed report identity.
 */
export function findFeedbackForConfirmedReport(args: {
  readonly feedbacks: readonly InvestigationReportFeedback[];
  readonly enterpriseId: string;
  readonly caseId: string;
  readonly reportId: string;
  readonly reportVersion: number;
}): InvestigationReportFeedback | undefined {
  if (
    !isPlainObject(args) ||
    !Array.isArray(args.feedbacks) ||
    !isNonEmptyString(args.enterpriseId) ||
    !isNonEmptyString(args.caseId) ||
    !isNonEmptyString(args.reportId) ||
    typeof args.reportVersion !== "number" ||
    !Number.isInteger(args.reportVersion) ||
    args.reportVersion <= 0
  ) {
    return undefined;
  }

  const match = args.feedbacks.find(
    fb =>
      fb.enterpriseId === args.enterpriseId.trim() &&
      fb.caseId === args.caseId.trim() &&
      fb.reportId === args.reportId.trim() &&
      fb.reportVersion === args.reportVersion,
  );
  return match ? freezeClone(match) : undefined;
}

function isValidFeedbackActorReference(
  value: unknown,
  requiredRole?: UserRole,
  requiredEnterpriseId?: string,
): value is InvestigationActorReference {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.actorId)) return false;
  if (
    typeof value.actorRole !== "string" ||
    !KNOWN_USER_ROLES.has(value.actorRole as UserRole)
  ) {
    return false;
  }
  if (requiredRole !== undefined && value.actorRole !== requiredRole) return false;
  if (
    value.enterpriseId !== undefined &&
    !isNonEmptyString(value.enterpriseId)
  ) {
    return false;
  }
  if (
    requiredEnterpriseId !== undefined &&
    value.enterpriseId !== requiredEnterpriseId
  ) {
    return false;
  }
  if (value.name !== undefined && !isNonEmptyString(value.name)) return false;
  return true;
}

function sameOptionalText(a: unknown, b: unknown): boolean {
  const normA = typeof a === "string" && a.trim() ? a.trim() : undefined;
  const normB = typeof b === "string" && b.trim() ? b.trim() : undefined;
  return normA === normB;
}

/**
 * Strictly validates an untrusted feedback collection at workspace restore/recovery boundaries.
 * Rejects corrupt items, broken invariants, role/tenant mismatches, or duplicate feedback keys
 * without silently filtering out invalid entries.
 */
export function validateReportFeedbackList(
  value: unknown,
):
  | { readonly ok: true; readonly value: InvestigationReportFeedback[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "Danh sách feedback phải là một mảng hợp lệ." };
  }

  const seenFeedbackIds = new Set<string>();
  const seenReportKeys = new Set<string>();

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!isPlainObject(item)) {
      return { ok: false, reason: `Phần tử feedback[${i}] không phải đối tượng hợp lệ.` };
    }
    if (
      !isNonEmptyString(item.feedbackId) ||
      !isNonEmptyString(item.enterpriseId) ||
      !isNonEmptyString(item.caseId) ||
      !isNonEmptyString(item.reportId)
    ) {
      return { ok: false, reason: `feedback[${i}] thiếu định danh bắt buộc.` };
    }
    if (
      typeof item.reportVersion !== "number" ||
      !Number.isFinite(item.reportVersion) ||
      !Number.isInteger(item.reportVersion) ||
      item.reportVersion <= 0
    ) {
      return { ok: false, reason: `feedback[${i}].reportVersion không hợp lệ.` };
    }

    const submittedTs = isNonEmptyString(item.submittedAt)
      ? parseStrictIsoTimestamp(item.submittedAt)
      : { ok: false as const };
    if (!submittedTs.ok) {
      return { ok: false, reason: `feedback[${i}].submittedAt không phải ISO-8601 hợp lệ.` };
    }

    if (
      item.smeComment !== undefined &&
      (typeof item.smeComment !== "string" || item.smeComment.length > MAX_SME_COMMENT_LENGTH)
    ) {
      return { ok: false, reason: `feedback[${i}].smeComment không hợp lệ.` };
    }

    if (!isValidFeedbackActorReference(item.submittedBy, "SME Admin", item.enterpriseId)) {
      return {
        ok: false,
        reason: `feedback[${i}].submittedBy phải là SME Admin thuộc đúng enterpriseId.`,
      };
    }

    const snap = item.snapshot;
    if (!isPlainObject(snap)) {
      return { ok: false, reason: `feedback[${i}].snapshot không hợp lệ.` };
    }
    if (
      !isNonEmptyString(snap.enterpriseId) ||
      !isNonEmptyString(snap.enterpriseName) ||
      !isNonEmptyString(snap.caseId) ||
      !isNonEmptyString(snap.reportId) ||
      !isNonEmptyString(snap.reportSummary) ||
      !isNonEmptyString(snap.conclusionSummary)
    ) {
      return { ok: false, reason: `feedback[${i}].snapshot thiếu trường nội dung bắt buộc.` };
    }
    if (
      snap.enterpriseId !== item.enterpriseId ||
      snap.caseId !== item.caseId ||
      snap.reportId !== item.reportId ||
      snap.reportVersion !== item.reportVersion ||
      snap.submittedAt !== item.submittedAt
    ) {
      return {
        ok: false,
        reason: `feedback[${i}] có thông tin định danh không khớp với snapshot bên trong.`,
      };
    }
    if (
      !isValidFeedbackActorReference(snap.submittedBy, "SME Admin", item.enterpriseId) ||
      snap.submittedBy.actorId !== item.submittedBy.actorId ||
      snap.submittedBy.enterpriseId !== item.submittedBy.enterpriseId ||
      !sameOptionalText(snap.submittedBy.name, item.submittedBy.name)
    ) {
      return {
        ok: false,
        reason: `feedback[${i}].snapshot.submittedBy không khớp với submittedBy cấp ngoài.`,
      };
    }
    if (!isValidFeedbackActorReference(snap.confirmedBy, "Operator", item.enterpriseId)) {
      return { ok: false, reason: `feedback[${i}].snapshot.confirmedBy không hợp lệ.` };
    }

    const confirmedTs = isNonEmptyString(snap.confirmedAt)
      ? parseStrictIsoTimestamp(snap.confirmedAt)
      : { ok: false as const };
    if (!confirmedTs.ok || submittedTs.ms < confirmedTs.ms) {
      return {
        ok: false,
        reason: `feedback[${i}].snapshot.confirmedAt không hợp lệ hoặc sau submittedAt.`,
      };
    }

    if (
      snap.smeComment !== undefined &&
      (typeof snap.smeComment !== "string" || snap.smeComment.length > MAX_SME_COMMENT_LENGTH)
    ) {
      return { ok: false, reason: `feedback[${i}].snapshot.smeComment không hợp lệ.` };
    }
    if (!sameOptionalText(item.smeComment, snap.smeComment)) {
      return {
        ok: false,
        reason: `feedback[${i}].smeComment không khớp với snapshot.smeComment.`,
      };
    }

    if (!Array.isArray(snap.alertResults) || snap.alertResults.length === 0) {
      return {
        ok: false,
        reason: `feedback[${i}].snapshot.alertResults phải là mảng không rỗng.`,
      };
    }
    const seenAlertIds = new Set<string>();
    for (let j = 0; j < snap.alertResults.length; j += 1) {
      const alertItem = snap.alertResults[j];
      if (!isPlainObject(alertItem)) {
        return {
          ok: false,
          reason: `feedback[${i}].snapshot.alertResults[${j}] không hợp lệ.`,
        };
      }
      if (
        !isNonEmptyString(alertItem.alertId) ||
        !isNonEmptyString(alertItem.transactionReference) ||
        !isNonEmptyString(alertItem.projectName) ||
        !isNonEmptyString(alertItem.resultText) ||
        !isNonEmptyString(alertItem.evidence) ||
        alertItem.scoringSource !== "AI"
      ) {
        return {
          ok: false,
          reason: `feedback[${i}].snapshot.alertResults[${j}] thiếu trường bắt buộc hoặc sai scoringSource.`,
        };
      }
      if (alertItem.alertName !== undefined && !isNonEmptyString(alertItem.alertName)) {
        return {
          ok: false,
          reason: `feedback[${i}].snapshot.alertResults[${j}].alertName không hợp lệ.`,
        };
      }
      const cleanAlertId = alertItem.alertId.trim();
      if (seenAlertIds.has(cleanAlertId)) {
        return {
          ok: false,
          reason: `feedback[${i}].snapshot.alertResults bị trùng alertId '${cleanAlertId}'.`,
        };
      }
      seenAlertIds.add(cleanAlertId);
    }

    const cleanFeedbackId = item.feedbackId.trim();
    if (seenFeedbackIds.has(cleanFeedbackId)) {
      return { ok: false, reason: `Trùng lặp feedbackId '${cleanFeedbackId}'.` };
    }
    seenFeedbackIds.add(cleanFeedbackId);

    const compositeKey = `${item.enterpriseId.trim()}::${item.caseId.trim()}::${item.reportId.trim()}::${item.reportVersion}`;
    if (seenReportKeys.has(compositeKey)) {
      return {
        ok: false,
        reason: `Trùng lặp feedback cho cùng bộ report xác nhận '${compositeKey}'.`,
      };
    }
    seenReportKeys.add(compositeKey);
  }

  return { ok: true, value: value as InvestigationReportFeedback[] };
}

export function isValidReportFeedbackList(
  value: unknown,
): value is InvestigationReportFeedback[] {
  return validateReportFeedbackList(value).ok;
}
