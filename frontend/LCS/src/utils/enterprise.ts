import { isSandboxTransaction } from '@/utils/transaction-origin';
import { normalizeFields, validateDataSchema, type DataField } from '@/utils/ingestion-validation';
import type { AuditLogEntry, ProjectItem, TransactionRisk, UserProfile } from '@/types/fraudguard';
import type { InvestigationCase } from '@/types/investigation-case';
import type { LegacyCaseArchiveLike } from '@/utils/permissions';
import type {
  ClarifiedConditionItem,
  ClarifiedFieldItem,
  DeploymentSpecification,
  Enterprise,
  IntakeDocumentItem,
  OnboardingStage,
  ServicePlan,
  SpecificationSnapshot
} from "@/types/enterprise";

const INTERNAL_CASE_AUDIT_ACTIONS = new Set<string>([
  'CASE_STATUS_UPDATED',
  'CASE_CREATED',
  'INVESTIGATOR_ASSIGNED',
  'OPERATOR_SELF_ASSIGNED',
  'REPORT_SUBMITTED',
  'REVISION_REQUESTED',
  'REPORT_CONFIRMED_AND_CLOSED',
]);

const SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS = new Set<string>([
  'REPORT_SUBMITTED',
  'REVISION_REQUESTED',
]);

const CONCLUDED_LEGACY_CASE_STATUSES = new Set<string>([
  'Confirmed Fraud',
  'False Alarm',
  'Resolved',
]);

const ACTIVE_INVESTIGATION_CASE_STATUSES = new Set<string>([
  'Open',
  'Investigating',
  'Pending Review',
]);

const LEGACY_CASE_FIELDS: readonly (keyof TransactionRisk)[] = [
  'caseId',
  'caseStatus',
  'assignedInvestigator',
  'assignedInvestigatorId',
  'assignedAt',
  'investigationNotes',
  'investigationReport',
  'caseDecision',
];

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonicalValue(v)]);
    return Object.fromEntries(entries);
  }
  return value === undefined ? null : value;
}

function collectAllowedInvestigatorLinks(
  user: UserProfile,
  investigationCases: readonly InvestigationCase[],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[],
): { txIds: Set<string>; alertIds: Set<string> } {
  const txIds = new Set<string>();
  const alertIds = new Set<string>();
  if (!user.enterpriseId) return { txIds, alertIds };

  for (const c of investigationCases) {
    if (c.enterpriseId !== user.enterpriseId || c.assignee?.actorId !== user.id) continue;
    for (const alertId of c.alertIds) {
      if (alertId.trim()) alertIds.add(alertId.trim());
    }
    for (const alert of c.alerts) {
      if (alert.transactionId) txIds.add(alert.transactionId);
      if (alert.alertId.trim()) alertIds.add(alert.alertId.trim());
    }
  }

  for (const entry of legacyCaseArchive) {
    if (entry.enterpriseId !== user.enterpriseId || entry.canResolveAssigneeId !== user.id) continue;
    for (const txId of entry.transactionIds ?? []) {
      if (txId) txIds.add(txId);
    }
    for (const alertId of entry.alertIds ?? []) {
      if (alertId.trim()) alertIds.add(alertId.trim());
    }
    for (const tx of entry.transactions ?? []) {
      if (tx.id) txIds.add(tx.id);
      if (tx.alertId?.trim()) alertIds.add(tx.alertId.trim());
    }
  }

  return { txIds, alertIds };
}

export function canDeploy(user: UserProfile, enterprise: Enterprise) { return user.role === 'Implementation Staff' && user.id === enterprise.deploymentStaffId; }
export function transactionsForEnterprise(
  transactions: TransactionRisk[],
  user: UserProfile,
  enterprises: Enterprise[],
  investigationCases: readonly InvestigationCase[] = [],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[] = [],
) {
  const projects = enterprises.find(e => e.id === user.enterpriseId)?.projectIds ?? [];
  if (!['SME Admin', 'Operator', 'Investigator'].includes(user.role)) return [];
  if (user.role !== 'Investigator') {
    return transactions.filter(tx => projects.includes(tx.projectId));
  }
  if (investigationCases.length === 0 && legacyCaseArchive.length === 0) {
    return transactions.filter(tx =>
      projects.includes(tx.projectId) &&
      tx.scoringSource === 'AI' &&
      !!tx.caseId &&
      (tx.assignedInvestigatorId ? tx.assignedInvestigatorId === user.id : tx.assignedInvestigator === user.name),
    );
  }
  const allowed = collectAllowedInvestigatorLinks(user, investigationCases, legacyCaseArchive);
  return transactions.filter(
    tx =>
      projects.includes(tx.projectId) &&
      (allowed.txIds.has(tx.id) || (Boolean(tx.alertId?.trim()) && allowed.alertIds.has(tx.alertId!.trim()))),
  );
}

function isArchiveAuditEntryBlocked(entry: LegacyCaseArchiveLike, enterpriseId: string): boolean {
  return (
    !entry.enterpriseId ||
    entry.enterpriseId !== enterpriseId ||
    entry.reasonCode === 'CROSS_TENANT_CONFLICT' ||
    entry.reasonCode === 'UNKNOWN_ENTERPRISE'
  );
}

export function auditForUser(
  logs: AuditLogEntry[],
  user: UserProfile,
  enterprises: Enterprise[],
  transactions: TransactionRisk[],
  investigationCases: readonly InvestigationCase[] = [],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[] = [],
) {
  const allowed = visibleEnterprises(user, enterprises);
  const caseById = new Map(investigationCases.map(c => [c.caseId, c]));
  const archiveByTarget = new Map<string, LegacyCaseArchiveLike>();
  for (const entry of legacyCaseArchive) {
    if (entry.legacyCaseId) archiveByTarget.set(entry.legacyCaseId, entry);
    if (entry.archiveId) archiveByTarget.set(entry.archiveId, entry);
  }

  return logs.filter(log => {
    if (log.action === 'REPORT_FEEDBACK_SENT') {
      if (user.role === 'Platform Admin') return true;
      if (!['SME Admin', 'Operator'].includes(user.role) || !user.enterpriseId) return false;
      if (log.enterpriseId) return log.enterpriseId === user.enterpriseId;
      const matchedFeedbackCase = caseById.get(log.target);
      if (matchedFeedbackCase) return matchedFeedbackCase.enterpriseId === user.enterpriseId;
      const userEnterprise = enterprises.find(e => e.id === user.enterpriseId);
      if (!userEnterprise) return false;
      return (
        log.target === userEnterprise.id ||
        log.target === userEnterprise.name ||
        userEnterprise.projectIds.includes(log.target)
      );
    }

    const matchedCase = caseById.get(log.target);
    const matchedArchive = archiveByTarget.get(log.target);
    const isInternalCaseLog =
      INTERNAL_CASE_AUDIT_ACTIONS.has(log.action) || Boolean(matchedCase) || Boolean(matchedArchive);

    if (isInternalCaseLog) {
      if (!['SME Admin', 'Operator'].includes(user.role) || !user.enterpriseId) return false;
      if (log.enterpriseId && log.enterpriseId !== user.enterpriseId) return false;
      if (matchedCase && matchedCase.enterpriseId !== user.enterpriseId) return false;
      if (matchedArchive && isArchiveAuditEntryBlocked(matchedArchive, user.enterpriseId)) return false;

      const userEnterprise = enterprises.find(e => e.id === user.enterpriseId);
      const transaction = transactions.find(tx => tx.id === log.target || tx.caseId === log.target);
      const belongsToTenant =
        log.enterpriseId === user.enterpriseId ||
        matchedCase?.enterpriseId === user.enterpriseId ||
        matchedArchive?.enterpriseId === user.enterpriseId ||
        (Boolean(userEnterprise) &&
          (log.target === userEnterprise!.id ||
            log.target === userEnterprise!.name ||
            userEnterprise!.projectIds.includes(log.target) ||
            (Boolean(transaction) && userEnterprise!.projectIds.includes(transaction!.projectId))));
      if (!belongsToTenant) return false;

      if (user.role === 'Operator') return true;
      if (SME_HIDDEN_INTERNAL_WORKFLOW_ACTIONS.has(log.action)) return false;
      if (matchedCase) {
        return (
          matchedCase.status === 'Closed' &&
          Boolean(matchedCase.conclusion) &&
          matchedCase.reports.some(
            r =>
              r.reportId === matchedCase.conclusion?.reportId &&
              r.version === matchedCase.conclusion?.reportVersion,
          )
        );
      }
      if (matchedArchive) {
        const archiveStatus =
          matchedArchive.originalStatus ??
          matchedArchive.legacyCaseStatus ??
          matchedArchive.transactions?.find(tx => Boolean(tx.caseStatus))?.caseStatus ??
          '';
        return CONCLUDED_LEGACY_CASE_STATUSES.has(archiveStatus);
      }
      return Boolean(transaction && CONCLUDED_LEGACY_CASE_STATUSES.has(transaction.caseStatus ?? ''));
    }

    if (user.role === 'Platform Admin') return true;
    if (!['Implementation Staff', 'SME Admin', 'Operator'].includes(user.role)) return false;
    if (log.enterpriseId) return allowed.some(e => e.id === log.enterpriseId);
    const transaction = transactions.find(tx => tx.id === log.target || tx.caseId === log.target);
    return allowed.some(
      e =>
        log.target === e.id ||
        log.target === e.name ||
        e.projectIds.includes(log.target) ||
        (Boolean(transaction) && e.projectIds.includes(transaction!.projectId)),
    );
  });
}

/** Detects whether any legacy transaction-embedded case field changed between two snapshots. */
export function hasLegacyCaseFieldPatch(prev: TransactionRisk, next: TransactionRisk): boolean {
  return LEGACY_CASE_FIELDS.some(
    field => JSON.stringify(canonicalValue(prev[field])) !== JSON.stringify(canonicalValue(next[field])),
  );
}

/** Counts non-sandbox AI abnormal alerts not linked to any InvestigationCase, legacy transaction case, or blocking archive entry. */
export function countOpenUnlinkedAlerts(
  transactions: readonly TransactionRisk[],
  investigationCases: readonly InvestigationCase[] = [],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[] = [],
): number {
  const blockedTxIds = new Set<string>();
  const blockedAlertIds = new Set<string>();

  for (const c of investigationCases) {
    for (const alertId of c.alertIds) {
      if (alertId.trim()) blockedAlertIds.add(alertId.trim());
    }
    for (const alert of c.alerts) {
      if (alert.transactionId) blockedTxIds.add(alert.transactionId);
      if (alert.alertId.trim()) blockedAlertIds.add(alert.alertId.trim());
    }
  }

  for (const entry of legacyCaseArchive) {
    if (entry.blocksAlertCreation === false) continue;
    for (const txId of entry.transactionIds ?? []) {
      if (txId) blockedTxIds.add(txId);
    }
    for (const alertId of entry.alertIds ?? []) {
      if (alertId.trim()) blockedAlertIds.add(alertId.trim());
    }
    for (const tx of entry.transactions ?? []) {
      if (tx.id) blockedTxIds.add(tx.id);
      if (tx.alertId?.trim()) blockedAlertIds.add(tx.alertId.trim());
    }
  }

  let count = 0;
  for (const tx of transactions) {
    if (isSandboxTransaction(tx)) continue;
    if (tx.scoringSource !== 'AI' || tx.riskLevel !== 'Abnormal') continue;
    if (tx.caseId?.trim() || tx.caseStatus?.trim()) continue;
    if (blockedTxIds.has(tx.id)) continue;
    if (tx.alertId?.trim() && blockedAlertIds.has(tx.alertId.trim())) continue;
    count += 1;
  }
  return count;
}

/** Counts active workflow cases (`Open`, `Investigating`, `Pending Review`), strictly 1 per unique caseId. */
export function countActiveInvestigationCases(investigationCases: readonly InvestigationCase[]): number {
  const activeIds = new Set<string>();
  for (const c of investigationCases) {
    if (ACTIVE_INVESTIGATION_CASE_STATUSES.has(c.status)) {
      activeIds.add(c.caseId);
    }
  }
  return activeIds.size;
}
export function visibleEnterprises(user: UserProfile, enterprises: Enterprise[]) {
 if (user.role === 'Platform Admin') return enterprises;
 if (user.role === 'Implementation Staff') return enterprises.filter(e => canDeploy(user, e));
 return enterprises.filter(e => e.id === user.enterpriseId);
}

export function enterpriseUsage(enterprise: Enterprise, transactions: TransactionRisk[]) {
 const scoped = transactions.filter(tx => !isSandboxTransaction(tx) && enterprise.projectIds.includes(tx.projectId));
 return { total: scoped.length, ai: scoped.filter(tx => tx.scoringSource === 'AI').length, rule: scoped.filter(tx => tx.scoringSource === 'RULE').length, fallback: scoped.filter(tx => tx.scoringSource === 'RULE_FALLBACK').length };
}
export function enterprisePlan(enterprise: Enterprise): ServicePlan | undefined {
 if (enterprise.plan) return enterprise.plan;
 // Preserve plans previously shown for these demo enterprises; no default for new customers.
 if (enterprise.id === 'tenant-greenmart') return 'Free';
 if (['tenant-techpay','tenant-fastretail','tenant-edulearn'].includes(enterprise.id)) return 'Subscription';
 return undefined;
}


export function generateEnterpriseCode(name: string, idOrSeed?: string): string {
  if (!name || !name.trim()) return 'DN-1001';
  const cleanName = name.trim();
  const removeAccents = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

  const ignoredWords = new Set([
    'cong', 'ty', 'tnhh', 'co', 'phan', 'cp', 'tap', 'doan', 'doanh', 'nghiep', 'thuong', 'mai', 'dich', 'vu',
    'company', 'corp', 'corporation', 'ltd', 'limited', 'inc', 'co', 'enterprise'
  ]);

  const words = cleanName.split(/\s+/).filter(Boolean);
  const coreWords = words.filter(w => {
    const normalized = removeAccents(w.toLowerCase()).replace(/[^a-z0-9]/g, '');
    return !ignoredWords.has(normalized);
  });

  const candidateWords = coreWords.length > 0 ? coreWords : words;

  let prefix = '';
  if (candidateWords.length >= 2) {
    const first = removeAccents(candidateWords[0])[0] || '';
    const second = removeAccents(candidateWords[1])[0] || '';
    prefix = (first + second).toUpperCase();
  } else if (candidateWords.length === 1) {
    const cleanWord = removeAccents(candidateWords[0]).replace(/[^a-zA-Z0-9]/g, '');
    prefix = cleanWord.slice(0, Math.min(3, cleanWord.length)).toUpperCase();
  }

  if (!prefix || prefix.length < 2) {
    const rawLetters = removeAccents(cleanName).replace(/[^a-zA-Z0-9]/g, '');
    prefix = (rawLetters.slice(0, 2) || 'DN').toUpperCase();
  }

  const seedStr = idOrSeed || cleanName;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const num = Math.abs(hash % 9000) + 1000;
  return `${prefix}-${num}`;
}

export function formatEnterpriseCode(enterprise: Enterprise): string {
  if (enterprise.code && /^[A-Za-z0-9]{2,5}-\d{4}$/.test(enterprise.code)) {
    return enterprise.code.toUpperCase();
  }
  return generateEnterpriseCode(enterprise.name, enterprise.id);
}

export function truncateText(text?: string, maxLength = 16): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength) + '...';
}

export function resolveOnboardingStage(enterprise?: Enterprise): OnboardingStage {
  const spec = enterprise?.specification;
  if (spec?.stage) return spec.stage;
  if (spec?.confirmedAt || spec?.enterpriseConfirmation?.confirmedAt) return 'confirmed';
  if (spec?.sentSnapshot) return (spec.feedbackHistory?.length ?? 0) > 0 ? 'waiting_reconfirmation' : 'waiting_confirmation';
  if ((spec?.conditionsList?.length ?? 0) > 0 || (spec?.schema?.length ?? 0) > 0 || spec?.requirements?.trim()) return 'clarifying';
  return 'intake';
}

export function nextSpecificationVersion(previousVersion?: string): string {
  if (!previousVersion) return 'v1.0';
  const match = /^v?(\d+)\.(\d+)$/.exec(previousVersion.trim());
  if (!match) return 'v1.0';
  return `v${Number(match[1])}.${Number(match[2]) + 1}`;
}

function isPlaceholderText(value?: string): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(tbd|todo|placeholder|n\/a|chưa rõ|đang cập nhật|\.\.\.)$/i.test(trimmed);
}

export function validateSpecificationSampleData(
  sampleJson: string | undefined,
  schema: DataField[],
  projectIds?: string[],
  vi = true
): { valid: boolean; error?: string } {
  const raw = sampleJson?.trim() ?? '';
  if (!raw || raw === '[]') {
    return {
      valid: false,
      error: vi
        ? 'Chưa có dữ liệu giao dịch mẫu (sampleJson) hợp lệ để đối chiếu và kiểm thử bộ quy tắc (cần từ 1–1000 giao dịch mẫu).'
        : 'Sample transaction data (sampleJson) is missing or empty (1–1000 sample transactions required).'
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      error: vi
        ? 'Dữ liệu giao dịch mẫu (sampleJson) không đúng định dạng JSON.'
        : 'Sample transaction data (sampleJson) is not valid JSON.'
    };
  }
  if (!Array.isArray(data) || data.length === 0 || data.length > 1000) {
    return {
      valid: false,
      error: vi
        ? 'Dữ liệu giao dịch mẫu cần chứa từ 1 đến 1000 bản ghi giao dịch.'
        : 'Expected 1–1000 sample transactions.'
    };
  }
  const ids = new Set<string>();
  for (const item of data) {
    const row = item as Record<string, unknown> | null;
    if (
      !row ||
      ['id', 'ref', 'projectId', 'transactionType'].some(
        key => typeof row[key] !== 'string' || !(row[key] as string).trim()
      )
    ) {
      return {
        valid: false,
        error: vi
          ? 'Mỗi giao dịch mẫu cần có đầy đủ id, ref, projectId và transactionType.'
          : 'Each sample transaction needs id, ref, projectId and transactionType.'
      };
    }
    const id = row.id as string;
    if (ids.has(id)) {
      return {
        valid: false,
        error: vi
          ? `Trùng mã giao dịch mẫu (id): ${id}.`
          : `Duplicate sample transaction id: ${id}.`
      };
    }
    ids.add(id);
    const fields = row.fields;
    if (
      !fields ||
      Array.isArray(fields) ||
      typeof fields !== 'object' ||
      Object.values(fields as Record<string, unknown>).some(
        value =>
          !['string', 'number', 'boolean'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value))
      )
    ) {
      return {
        valid: false,
        error: vi
          ? `Giao dịch mẫu (${id}) có trường fields không hợp lệ (chỉ chấp nhận chuỗi, số hữu hạn hoặc boolean).`
          : `Sample transaction (${id}) has invalid fields (must contain text, finite numbers or booleans).`
      };
    }
    if (
      row.expected !== undefined &&
      !['Normal', 'Abnormal', 'Undetermined'].includes(String(row.expected))
    ) {
      return {
        valid: false,
        error: vi
          ? `Giao dịch mẫu (${id}) có giá trị expected không hợp lệ.`
          : `Sample transaction (${id}) has invalid expected result.`
      };
    }
    if (schema.length > 0) {
      try {
        normalizeFields(fields as Record<string, unknown>, schema);
      } catch (err) {
        return {
          valid: false,
          error: vi
            ? `Dữ liệu giao dịch mẫu (${id}) không khớp danh mục trường dữ liệu: ${(err as Error).message}`
            : `Sample transaction (${id}) does not match schema: ${(err as Error).message}`
        };
      }
    }
    if (projectIds !== undefined) {
      if (projectIds.length === 0) {
        return {
          valid: false,
          error: vi
            ? 'Doanh nghiệp chưa có dự án/phạm vi triển khai hợp lệ (projectIds đang trống). Cần Platform Admin khởi tạo workspace triển khai tại mục Thiết lập Doanh nghiệp (hoặc tạo dự án tại mục Dự án & Tích hợp).'
            : 'Enterprise has no assigned project scope (projectIds is empty). Platform Admin must provision the workspace in Enterprise Setup (or create a project in Projects & Integration).'
        };
      }
      const projectId = row.projectId as string;
      if (!projectIds.includes(projectId)) {
        return {
          valid: false,
          error: vi
            ? `Giao dịch mẫu (${id}) có projectId '${projectId}' không thuộc phạm vi dự án của doanh nghiệp (${projectIds.join(', ')}).`
            : `Sample transaction (${id}) has projectId '${projectId}' outside enterprise scope (${projectIds.join(', ')}).`
        };
      }
    }
  }
  return { valid: true };
}

export function evaluateSetupReadiness(
  spec?: DeploymentSpecification,
  vi = true,
  enterprise?: Pick<Enterprise, 'projectIds'>
) {
  const missingItems: string[] = [];
  const enterpriseConfirmed = Boolean(spec?.enterpriseConfirmation?.confirmedAt || spec?.confirmedAt);
  if (!enterpriseConfirmed) {
    missingItems.push(
      vi
        ? 'Chưa ghi nhận xác nhận yêu cầu nghiệp vụ từ đại diện doanh nghiệp.'
        : 'Enterprise business requirement confirmation has not been recorded.'
    );
  }

  const targetSnapshot = spec?.confirmedSnapshot ?? spec?.sentSnapshot ?? spec?.savedDraft;
  const conditions = targetSnapshot?.conditionsList ?? spec?.conditionsList ?? [];
  const schema = targetSnapshot?.schema ?? spec?.schema ?? [];
  const requirementsText = targetSnapshot?.requirements ?? spec?.requirements ?? '';
  const sampleJson =
    spec?.sampleJson && spec.sampleJson.trim() && spec.sampleJson.trim() !== '[]'
      ? spec.sampleJson
      : targetSnapshot?.sampleJson ?? spec?.sampleJson ?? '';

  if (isPlaceholderText(requirementsText)) {
    missingItems.push(
      vi
        ? 'Chưa làm rõ phạm vi và mục tiêu phát hiện bất thường của doanh nghiệp (không dùng nội dung placeholder).'
        : 'Enterprise detection scope and objectives are missing or contain placeholder text.'
    );
  }

  const validConditions = conditions.filter(
    c => !isPlaceholderText(c.name) && !isPlaceholderText(c.criteria) && !isPlaceholderText(c.scope)
  );
  if (validConditions.length === 0 || validConditions.length !== conditions.length) {
    missingItems.push(
      vi
        ? 'Cần làm rõ ít nhất một điều kiện phát hiện bất thường có đầy đủ tên điều kiện, tiêu chí đánh giá và phạm vi áp dụng.'
        : 'At least one detection condition must have a clarified name, evaluation criteria, and applicable scope.'
    );
  }

  let schemaValid = false;
  if (schema.length === 0) {
    missingItems.push(
      vi
        ? 'Chưa có danh mục trường dữ liệu đầu vào (schema) của doanh nghiệp.'
        : 'Transaction data field catalog (schema) is empty.'
    );
  } else {
    try {
      validateDataSchema(schema);
      schemaValid = true;
    } catch (err) {
      missingItems.push(
        vi
          ? `Danh mục trường dữ liệu có tên trường không hợp lệ hoặc bị trùng lặp: ${(err as Error).message}`
          : `Data field catalog contains invalid or duplicate field names: ${(err as Error).message}`
      );
    }
  }

  let projectScopeValid = true;
  if (enterprise && enterprise.projectIds.length === 0) {
    projectScopeValid = false;
    missingItems.push(
      vi
        ? 'Doanh nghiệp chưa có dự án/phạm vi triển khai hợp lệ (projectIds đang trống). Cần Platform Admin khởi tạo workspace triển khai tại mục Thiết lập Doanh nghiệp (hoặc tạo dự án tại mục Dự án & Tích hợp).'
        : 'Enterprise has no assigned project scope (projectIds is empty). Platform Admin must provision the workspace in Enterprise Setup (or create a project in Projects & Integration).'
    );
  }

  let sampleValid = true;
  if (enterprise || (sampleJson.trim() && sampleJson.trim() !== '[]')) {
    const sampleCheck = validateSpecificationSampleData(
      sampleJson,
      schemaValid ? schema : [],
      enterprise && enterprise.projectIds.length > 0 ? enterprise.projectIds : undefined,
      vi
    );
    if (!sampleCheck.valid && sampleCheck.error) {
      sampleValid = false;
      if (!missingItems.includes(sampleCheck.error)) {
        missingItems.push(sampleCheck.error);
      }
    }
  }

  const explicitClarified = spec?.dataAndEvaluationClarified === true;
  if (!explicitClarified) {
    missingItems.push(
      vi
        ? 'Implementation Staff chưa xác nhận hoàn tất làm rõ dữ liệu và cách đánh giá kỹ thuật.'
        : 'Implementation Staff has not confirmed that data fields and evaluation criteria are fully clarified.'
    );
  }

  const dataAndEvaluationClarified =
    explicitClarified &&
    !isPlaceholderText(requirementsText) &&
    conditions.length > 0 &&
    validConditions.length === conditions.length &&
    schemaValid &&
    projectScopeValid &&
    sampleValid;

  return {
    enterpriseConfirmed,
    dataAndEvaluationClarified,
    ready: enterpriseConfirmed && dataAndEvaluationClarified && missingItems.length === 0,
    missingItems
  };
}

export function reconcileEnterpriseProjects(
  savedEnterprises: Enterprise[],
  fallbackEnterprises: Enterprise[],
  allProjects: Pick<ProjectItem, 'id' | 'code'>[],
  ruleSets: { enterpriseId: string; projectIds: string[] }[] = []
): Enterprise[] {
  const validProjectIds = new Set(allProjects.map(p => p.id));
  const hasProjectCatalog = validProjectIds.size > 0;
  const canonicalOwner = new Map<string, string>();
  for (const fb of fallbackEnterprises) {
    for (const pid of fb.projectIds ?? []) {
      if (!hasProjectCatalog || validProjectIds.has(pid)) {
        canonicalOwner.set(pid, fb.id);
      }
    }
  }

  const claimedByEnterprise = new Map<string, string>();
  const validSavedMap = new Map<string, string[]>();

  for (const savedEnt of savedEnterprises) {
    const rawIds = Array.isArray(savedEnt.projectIds) ? savedEnt.projectIds : [];
    const kept = rawIds.filter(pid => {
      if (hasProjectCatalog && !validProjectIds.has(pid)) return false;
      const seedOwner = canonicalOwner.get(pid);
      if (seedOwner && seedOwner !== savedEnt.id) return false;
      const alreadyClaimed = claimedByEnterprise.get(pid);
      if (alreadyClaimed && alreadyClaimed !== savedEnt.id) return false;
      return true;
    });
    for (const pid of kept) claimedByEnterprise.set(pid, savedEnt.id);
    validSavedMap.set(savedEnt.id, kept);
  }

  return savedEnterprises.map(savedEnt => {
    const fallback = fallbackEnterprises.find(d => d.id === savedEnt.id);
    let resolvedIds = [...(validSavedMap.get(savedEnt.id) ?? [])];

    if (resolvedIds.length === 0) {
      // 1. Restore from canonical seed projectIds if the project exists and is not claimed by another enterprise
      const fromSeed = (fallback?.projectIds ?? []).filter(pid => {
        if (hasProjectCatalog && !validProjectIds.has(pid)) return false;
        const owner = claimedByEnterprise.get(pid);
        return !owner || owner === savedEnt.id;
      });
      if (fromSeed.length > 0) {
        resolvedIds = fromSeed;
      }
    }

    if (resolvedIds.length === 0) {
      // 2. Restore from existing rule sets belonging to this enterprise
      const fromSets = ruleSets
        .filter(s => s.enterpriseId === savedEnt.id)
        .flatMap(s => s.projectIds ?? [])
        .filter(pid => {
          if (hasProjectCatalog && !validProjectIds.has(pid)) return false;
          const seedOwner = canonicalOwner.get(pid);
          if (seedOwner && seedOwner !== savedEnt.id) return false;
          const owner = claimedByEnterprise.get(pid);
          return !owner || owner === savedEnt.id;
        });
      if (fromSets.length > 0) {
        resolvedIds = [...new Set(fromSets)];
      }
    }

    if (resolvedIds.length === 0) {
      // 3. Restore from workspace project created specifically for this enterprise (workspace-<id> or code === id)
      const fromWorkspace = allProjects
        .filter(p => p.id === `workspace-${savedEnt.id}` || p.code === savedEnt.id)
        .map(p => p.id)
        .filter(pid => {
          const seedOwner = canonicalOwner.get(pid);
          if (seedOwner && seedOwner !== savedEnt.id) return false;
          const owner = claimedByEnterprise.get(pid);
          return !owner || owner === savedEnt.id;
        });
      if (fromWorkspace.length > 0) {
        resolvedIds = [...new Set(fromWorkspace)];
      }
    }

    for (const pid of resolvedIds) claimedByEnterprise.set(pid, savedEnt.id);

    const mergedSpec = fallback
      ? savedEnt.specification
        ? { ...fallback.specification, ...savedEnt.specification }
        : fallback.specification
      : savedEnt.specification;

    const reconciled: Enterprise = {
      ...(fallback ?? {}),
      ...savedEnt,
      code: savedEnt.code ?? fallback?.code,
      projectIds: resolvedIds,
      specification: mergedSpec
    };

    if (reconciled.specification) {
      const readiness = evaluateSetupReadiness(reconciled.specification, true, reconciled);
      reconciled.specification = {
        ...reconciled.specification,
        confirmedAt: readiness.ready
          ? reconciled.specification.confirmedAt ||
            reconciled.specification.enterpriseConfirmation?.confirmedAt ||
            new Date().toISOString()
          : undefined,
        confirmedBy: readiness.ready
          ? reconciled.specification.enterpriseConfirmation?.confirmedBy ||
            reconciled.specification.confirmedBy
          : undefined
      };
    }

    return reconciled;
  });
}

export function validateOnboardingSave(
  owner: Enterprise | undefined,
  currentUser: UserProfile,
  specification: DeploymentSpecification,
  vi = true
): { ok: boolean; error?: string; specification?: DeploymentSpecification } {
  if (!owner) {
    return {
      ok: false,
      error: vi
        ? 'Không tìm thấy hồ sơ doanh nghiệp cần lưu.'
        : 'Enterprise profile not found.'
    };
  }
  if (!canDeploy(currentUser, owner)) {
    return {
      ok: false,
      error: vi
        ? `Bạn không có quyền cập nhật đặc tả của ${owner.name} (chỉ Implementation Staff được phân công phụ trách doanh nghiệp này mới được phép lưu).`
        : `You do not have permission to update ${owner.name} (only the assigned Implementation Staff may save).`
    };
  }
  if (specification.stage === 'confirmed' || specification.enterpriseConfirmation) {
    const ec = specification.enterpriseConfirmation;
    if (!ec || !ec.confirmedBy?.trim() || !ec.confirmedAt?.trim() || !ec.note?.trim() || !ec.channel?.trim()) {
      return {
        ok: false,
        error: vi
          ? 'Vui lòng nhập đầy đủ Người đại diện xác nhận, Thời điểm xác nhận, Kênh xác nhận và Ghi chú nội dung xác nhận.'
          : 'Please enter the confirming representative, timestamp, channel, and confirmation note.'
      };
    }
  }
  if (specification.schema && specification.schema.length > 0) {
    try {
      validateDataSchema(specification.schema);
    } catch (err) {
      return {
        ok: false,
        error: vi
          ? `Danh mục trường dữ liệu (schema) không hợp lệ: ${(err as Error).message}`
          : `Invalid data field catalog (schema): ${(err as Error).message}`
      };
    }
  }

  const readiness = evaluateSetupReadiness(specification, vi, owner);

  // If a caller explicitly sets confirmedAt without enterpriseConfirmation (legacy direct confirmation),
  // enforce full readiness and return the specific blocking reason.
  if (specification.confirmedAt && !specification.enterpriseConfirmation) {
    if (!readiness.ready) {
      return {
        ok: false,
        error:
          readiness.missingItems[0] ||
          (vi
            ? 'Đặc tả chưa đủ điều kiện sẵn sàng thiết lập quy tắc.'
            : 'Specification is not ready for rule setup.')
      };
    }
  }

  // Separate enterprise business confirmation (enterpriseConfirmation) from setup readiness (confirmedAt):
  // Enterprise confirmation is saved when valid, while confirmedAt is only populated when readiness.ready is true.
  const unlocked = readiness.ready;
  const normalizedSpec: DeploymentSpecification = {
    ...specification,
    confirmedAt: unlocked
      ? specification.confirmedAt || specification.enterpriseConfirmation?.confirmedAt || new Date().toISOString()
      : undefined,
    confirmedBy: unlocked
      ? specification.enterpriseConfirmation?.confirmedBy || specification.confirmedBy || currentUser.name
      : undefined
  };

  return { ok: true, specification: normalizedSpec };
}

export const MAX_ONBOARDING_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB limit for browser localStorage safety

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, '');
  if (!clean) return new Uint8Array(0);
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
  const out = new Uint8Array(byteLength);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) break;
    if (outIdx < byteLength) out[outIdx++] = (c0 << 2) | (c1 >> 4);
    if (outIdx < byteLength) out[outIdx++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (outIdx < byteLength) out[outIdx++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

export function encodeUtf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const encoded = unescape(encodeURIComponent(text));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) out[i] = encoded.charCodeAt(i);
  return out;
}

export function decodeUtf8Bytes(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
}

export function isPreviewableDocumentFormat(formatOrName: string): boolean {
  const cleaned = formatOrName.trim().replace(/^.*\./, '').toUpperCase();
  return ['TXT', 'CSV', 'JSON', 'MD'].includes(cleaned);
}

export function isDocumentPreviewSupported(
  doc: Pick<IntakeDocumentItem, 'format' | 'name' | 'content' | 'previewSupported'>
): boolean {
  if (doc.previewSupported === false) return false;
  if (!isPreviewableDocumentFormat(doc.format || doc.name)) return false;
  return Boolean(doc.content && doc.content.length > 0);
}

export function inferDocumentMimeType(filename: string, providedType?: string): string {
  const ext = filename.trim().split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
      return 'application/pdf';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'md':
    case 'txt':
      return 'text/plain;charset=utf-8';
    default:
      return providedType || 'application/octet-stream';
  }
}

export interface OnboardingFileLike {
  name: string;
  size: number;
  type?: string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
}

export interface ReadOnboardingAttachmentResult {
  name: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  previewSupported: boolean;
  content: string;
  dataUrl: string;
}

export async function readOnboardingAttachment(
  file: OnboardingFileLike,
  vi = true
): Promise<ReadOnboardingAttachmentResult> {
  const ext = file.name.trim().split('.').pop()?.toLowerCase() ?? '';
  const allowedExts = ['docx', 'xlsx', 'pdf', 'txt', 'csv', 'json', 'md'];
  if (!allowedExts.includes(ext)) {
    throw new Error(
      vi
        ? `Định dạng tệp '${file.name}' không được hỗ trợ. Vui lòng chọn tệp .docx, .xlsx, .pdf, .txt, .csv, .json hoặc .md.`
        : `Unsupported file format '${file.name}'. Please select .docx, .xlsx, .pdf, .txt, .csv, .json, or .md.`
    );
  }
  if (!file.size || file.size <= 0) {
    throw new Error(
      vi
        ? `Tệp '${file.name}' đang trống (0 byte). Vui lòng chọn tệp có dữ liệu hợp lệ.`
        : `File '${file.name}' is empty (0 bytes).`
    );
  }
  if (file.size > MAX_ONBOARDING_ATTACHMENT_BYTES) {
    throw new Error(
      vi
        ? `Tệp '${file.name}' vượt quá giới hạn 2 MB cho bộ nhớ trình duyệt. Vui lòng chọn tệp nhỏ hơn 2 MB.`
        : `File '${file.name}' exceeds the 2 MB browser storage limit.`
    );
  }

  const format = ext.toUpperCase();
  const mimeType = inferDocumentMimeType(file.name, file.type);
  const previewSupported = isPreviewableDocumentFormat(format);

  let rawBytes: Uint8Array;
  if (typeof file.arrayBuffer === 'function') {
    const buf = await file.arrayBuffer();
    rawBytes = new Uint8Array(buf);
  } else if (previewSupported && typeof file.text === 'function') {
    // Only allow fallback to file.text() for text formats in minimal test mocks; never for .docx/.xlsx/.pdf
    const txt = await file.text();
    rawBytes = encodeUtf8Bytes(txt);
  } else {
    throw new Error(
      vi
        ? `Không thể đọc dữ liệu nhị phân gốc của tệp .${format} ('${file.name}'). Hệ thống không dùng file.text() cho định dạng nhị phân.`
        : `Cannot read binary buffer of .${format} ('${file.name}'). Binary formats are never read via file.text().`
    );
  }

  if (rawBytes.length === 0) {
    throw new Error(
      vi
        ? `Tệp '${file.name}' không có dữ liệu hợp lệ.`
        : `File '${file.name}' contains no valid data.`
    );
  }

  // Validate OpenXML ZIP header (PK\x03\x04) for .docx and .xlsx so corrupted/renamed text files are rejected
  if (ext === 'docx' || ext === 'xlsx') {
    if (rawBytes.length < 4 || rawBytes[0] !== 0x50 || rawBytes[1] !== 0x4b) {
      throw new Error(
        vi
          ? `Tệp '${file.name}' không đúng cấu trúc nhị phân OpenXML (.${ext}) hợp lệ.`
          : `File '${file.name}' is not a valid OpenXML (.${ext}) binary archive.`
      );
    }
  }

  const base64 = bytesToBase64(rawBytes);
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const content = previewSupported ? decodeUtf8Bytes(rawBytes) : '';

  return {
    name: file.name,
    format,
    mimeType,
    sizeBytes: rawBytes.length,
    previewSupported,
    content,
    dataUrl
  };
}

export function resolveDocumentDownloadBytes(doc: {
  name: string;
  content?: string;
  dataUrl?: string;
  mimeType?: string;
}): { filename: string; mimeType: string; bytes: Uint8Array } | null {
  const mimeType = doc.mimeType || inferDocumentMimeType(doc.name);
  if (doc.dataUrl && doc.dataUrl.includes(';base64,')) {
    const base64Part = doc.dataUrl.slice(doc.dataUrl.indexOf(';base64,') + 8);
    const bytes = base64ToBytes(base64Part);
    if (bytes.length > 0) {
      return { filename: doc.name, mimeType, bytes };
    }
  }
  if (doc.content && doc.content.length > 0 && isPreviewableDocumentFormat(doc.name)) {
    return { filename: doc.name, mimeType, bytes: encodeUtf8Bytes(doc.content) };
  }
  return null;
}

export function triggerDocumentDownload(doc: {
  name: string;
  content?: string;
  dataUrl?: string;
  mimeType?: string;
}): boolean {
  const payload = resolveDocumentDownloadBytes(doc);
  if (!payload) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  const blob = new Blob([new Uint8Array(payload.bytes)], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function downloadTextBlob(filename: string, content: string): boolean {
  return triggerDocumentDownload({
    name: filename,
    content,
    mimeType: 'text/plain;charset=utf-8'
  });
}

export function formatSnapshotText(
  enterpriseName: string,
  snapshot: SpecificationSnapshot,
  vi: boolean
): string {
  const condLines = snapshot.conditionsList.map(
    (c, idx) => `  ${idx + 1}. ${c.name}\n     - ${vi ? 'Tiêu chí' : 'Criteria'}: ${c.criteria}\n     - ${vi ? 'Phạm vi' : 'Scope'}: ${c.scope}`
  );
  const fieldLines = snapshot.schema.map(
    (f, idx) =>
      `  ${idx + 1}. ${f.name} (${f.type}, ${f.required ? (vi ? 'Bắt buộc' : 'Required') : vi ? 'Tùy chọn' : 'Optional'})${
        f.description ? ` · ${f.description}` : ''
      }`
  );
  return [
    `${vi ? 'ĐẶC TẢ YÊU CẦU TRIỂN KHAI' : 'DEPLOYMENT SPECIFICATION'}: ${enterpriseName}`,
    `${vi ? 'Phiên bản' : 'Version'}: ${snapshot.version}`,
    `${vi ? 'Cập nhật lúc' : 'Updated at'}: ${snapshot.updatedAt}`,
    snapshot.sentAt ? `${vi ? 'Ghi nhận gửi lúc' : 'Sent at'}: ${snapshot.sentAt} (${snapshot.sentBy ?? ''})` : '',
    snapshot.revisionSummary ? `${vi ? 'Tóm tắt chỉnh sửa' : 'Revision summary'}: ${snapshot.revisionSummary}` : '',
    '',
    `1. ${vi ? 'MỤC TIÊU & PHẠM VI PHÁT HIỆN' : 'DETECTION OBJECTIVES & SCOPE'}:`,
    snapshot.requirements || '-',
    '',
    `2. ${vi ? 'DANH SÁCH ĐIỀU KIỆN PHÁT HIỆN BẤT THƯỜNG' : 'ABNORMAL DETECTION CONDITIONS'} (${snapshot.conditionsList.length}):`,
    ...(condLines.length ? condLines : ['-']),
    '',
    `3. ${vi ? 'DANH MỤC TRƯỜNG DỮ LIỆU ĐẦU VÀO' : 'DATA FIELD CATALOG'} (${snapshot.schema.length}):`,
    ...(fieldLines.length ? fieldLines : ['-'])
  ]
    .filter(Boolean)
    .join('\n');
}

export function serializeConditionsSummary(list: ClarifiedConditionItem[]): string {
  return list.map((c, idx) => `${idx + 1}. ${c.name}: ${c.criteria} (${c.scope})`).join('\n');
}

export function serializeFieldsSummary(list: ClarifiedFieldItem[]): string {
  return list
    .map(f => `${f.name} (${f.type}, ${f.required ? 'bắt buộc' : 'tùy chọn'})${f.description ? ` - ${f.description}` : ''}`)
    .join(', ');
}
