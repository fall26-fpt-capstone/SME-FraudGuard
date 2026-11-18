import { transactionsForEnterprise } from './enterprise';
import { isSandboxTransaction } from './transaction-origin';
import type { TransactionRisk, UserProfile } from '@/types/fraudguard';
import type { Enterprise } from '@/types/enterprise';
import type { InvestigationCase } from '@/types/investigation-case';
import type { LegacyCaseArchiveLike } from './permissions';

export interface NotificationItem {
  id: string;
  kind: 'case' | 'legacy_case' | 'alert';
  label: string;
  time?: string;
  reference: string;
  caseId?: string;
  archiveId?: string;
  transaction?: TransactionRisk;
  investigationCase?: InvestigationCase;
}

export type CaseNotificationItem = NotificationItem;

export interface BuildCaseNotificationsParams {
  transactions: TransactionRisk[];
  investigationCases?: readonly InvestigationCase[];
  legacyArchive?: readonly LegacyCaseArchiveLike[];
  currentUser: UserProfile;
  enterprises: Enterprise[];
  vi?: boolean;
}

const CONCLUDED_LEGACY_STATUSES = new Set(['Confirmed Fraud', 'False Alarm', 'Resolved']);
const BLOCKED_ARCHIVE_REASONS = new Set(['CROSS_TENANT_CONFLICT', 'UNKNOWN_ENTERPRISE']);

function latestTimestamp(candidates: readonly (string | undefined)[]): string | undefined {
  return candidates
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function caseNotificationLabel(c: InvestigationCase, vi: boolean): string {
  if (c.status === 'Closed') {
    const version = c.conclusion?.reportVersion;
    if (version !== undefined) {
      return vi
        ? `Đã xác nhận báo cáo v${version} và đóng hồ sơ`
        : `Report v${version} confirmed and case closed`;
    }
    return vi ? 'Đã xác nhận kết luận và đóng hồ sơ' : 'Case concluded and closed';
  }
  if (c.status === 'Pending Review') {
    const version = c.pendingReviewReportVersion;
    if (version !== undefined) {
      return vi
        ? `Đã gửi báo cáo v${version} chờ duyệt`
        : `Report v${version} submitted for review`;
    }
    return vi ? 'Hồ sơ chờ duyệt báo cáo' : 'Case report pending review';
  }
  if (
    c.status === 'Investigating' &&
    (c.reports.length > 0 || c.history.some((e) => e.type === 'REVISION_REQUESTED'))
  ) {
    return vi ? 'Yêu cầu bổ sung báo cáo điều tra' : 'Investigation report revision requested';
  }
  const labels: Record<'Open' | 'Investigating', [string, string]> = {
    Open: ['Hồ sơ điều tra mới mở', 'Investigation case opened'],
    Investigating: ['Đang điều tra hồ sơ', 'Case under investigation'],
  };
  return labels[c.status][vi ? 0 : 1];
}

function legacyStatusLabel(status: string, vi: boolean): string {
  const labels: Record<string, [string, string]> = {
    Open: ['Có cảnh báo AI mới', 'New AI alert'],
    Assigned: ['Đã giao người điều tra', 'Investigator assigned'],
    Investigating: ['Đang điều tra', 'Investigation in progress'],
    Reported: ['Đã gửi báo cáo điều tra', 'Investigation report submitted'],
    'Confirmed Fraud': ['Đã xác nhận gian lận', 'Fraud confirmed'],
    'False Alarm': ['Đã xác nhận cảnh báo nhầm', 'False alarm confirmed'],
    Resolved: ['Đã hoàn tất xử lý', 'Case resolved'],
  };
  return (labels[status] ?? labels.Open)[vi ? 0 : 1];
}

function canViewCaseNotification(c: InvestigationCase, user: UserProfile): boolean {
  if (!user.enterpriseId || c.enterpriseId !== user.enterpriseId) return false;
  if (user.role === 'Operator') return true;
  if (user.role === 'Investigator') {
    return c.assignee?.actorId === user.id && c.assignee?.role === 'Investigator';
  }
  if (user.role === 'SME Admin') {
    return (
      c.status === 'Closed' &&
      Boolean(c.conclusion) &&
      c.reports.some(
        (r) =>
          r.reportId === c.conclusion?.reportId &&
          r.version === c.conclusion?.reportVersion,
      )
    );
  }
  return false;
}

function canViewLegacyNotification(entry: LegacyCaseArchiveLike, user: UserProfile, status: string): boolean {
  if (!user.enterpriseId || !entry.enterpriseId || entry.enterpriseId !== user.enterpriseId) return false;
  if (entry.reasonCode && BLOCKED_ARCHIVE_REASONS.has(entry.reasonCode)) return false;
  if (user.role === 'Operator') return true;
  if (user.role === 'Investigator') return entry.canResolveAssigneeId === user.id;
  if (user.role === 'SME Admin') return CONCLUDED_LEGACY_STATUSES.has(status);
  return false;
}

/**
 * Builds role-, tenant-, and assignee-scoped notifications across workflow cases,
 * migrated legacy archives, and unlinked abnormal alerts with deterministic IDs.
 */
export function buildCaseNotifications({
  transactions,
  investigationCases = [],
  legacyArchive = [],
  currentUser,
  enterprises,
  vi = false,
}: BuildCaseNotificationsParams): NotificationItem[] {
  if (['Platform Admin', 'Implementation Staff', 'Viewer'].includes(currentUser.role)) {
    return [];
  }

  const visibleTransactions = transactionsForEnterprise(
    transactions,
    currentUser,
    enterprises,
    investigationCases,
    legacyArchive,
  );
  const txById = new Map(visibleTransactions.map((tx) => [tx.id, tx]));
  const txByAlertId = new Map<string, TransactionRisk>();
  for (const tx of visibleTransactions) {
    if (tx.alertId?.trim()) txByAlertId.set(tx.alertId.trim(), tx);
  }

  const linkedTxIds = new Set<string>();
  const linkedAlertIds = new Set<string>();
  for (const c of investigationCases) {
    for (const alertId of c.alertIds) {
      if (alertId.trim()) linkedAlertIds.add(alertId.trim());
    }
    for (const alert of c.alerts) {
      if (alert.transactionId) linkedTxIds.add(alert.transactionId);
      if (alert.alertId.trim()) linkedAlertIds.add(alert.alertId.trim());
    }
  }
  for (const entry of legacyArchive) {
    for (const txId of entry.transactionIds ?? []) {
      if (txId) linkedTxIds.add(txId);
    }
    for (const alertId of entry.alertIds ?? []) {
      if (alertId.trim()) linkedAlertIds.add(alertId.trim());
    }
    for (const tx of entry.transactions ?? []) {
      if (tx.id) linkedTxIds.add(tx.id);
      if (tx.alertId?.trim()) linkedAlertIds.add(tx.alertId.trim());
    }
  }

  const items: NotificationItem[] = [];

  for (const c of investigationCases) {
    if (!canViewCaseNotification(c, currentUser)) continue;
    const primaryAlert = c.alerts[0];
    const linkedTx =
      (primaryAlert?.transactionId ? txById.get(primaryAlert.transactionId) : undefined) ??
      (primaryAlert?.alertId ? txByAlertId.get(primaryAlert.alertId) : undefined);

    const latestEvent = c.history[c.history.length - 1];
    items.push({
      id: JSON.stringify([
        'case',
        c.caseId,
        c.status,
        c.assignee?.actorId ?? null,
        c.assignedAt ?? null,
        c.pendingReviewReportId ?? null,
        c.pendingReviewReportVersion ?? null,
        c.reports.length,
        latestEvent?.eventId ?? null,
        c.conclusion?.reportId ?? null,
        c.closedAt ?? null,
        c.updatedAt,
      ]),
      kind: 'case',
      label: caseNotificationLabel(c, vi),
      time: latestTimestamp([
        c.closedAt,
        c.conclusion?.confirmedAt,
        c.updatedAt,
        ...c.reports.map((r) => r.submittedAt),
        c.assignedAt,
        c.createdAt,
      ]),
      reference: c.caseId,
      caseId: c.caseId,
      transaction: linkedTx,
      investigationCase: c,
    });
  }

  for (const entry of legacyArchive) {
    const status =
      entry.originalStatus ??
      entry.legacyCaseStatus ??
      entry.transactions?.find((tx) => Boolean(tx.caseStatus))?.caseStatus ??
      'Open';
    if (!canViewLegacyNotification(entry, currentUser, status)) continue;
    const firstArchiveTxId = entry.transactionIds?.[0] ?? entry.transactions?.[0]?.id;
    const archiveTime = latestTimestamp(
      (entry.transactions ?? []).map((tx) => (txById.get(tx.id) ? notificationTime(txById.get(tx.id)!) : undefined)),
    );
    items.push({
      id: JSON.stringify([
        'legacy_case',
        entry.archiveId ?? entry.legacyCaseId ?? '',
        status,
        entry.canResolveAssigneeId ?? null,
      ]),
      kind: 'legacy_case',
      label: legacyStatusLabel(status, vi),
      time: archiveTime,
      reference: entry.legacyCaseId ?? entry.archiveId ?? 'Legacy Case',
      caseId: entry.legacyCaseId,
      archiveId: entry.archiveId,
      transaction: firstArchiveTxId ? txById.get(firstArchiveTxId) : undefined,
    });
  }

  if (currentUser.role === 'Operator' || currentUser.role === 'SME Admin') {
    for (const tx of visibleTransactions) {
      if (isSandboxTransaction(tx) || tx.riskLevel !== 'Abnormal' || !tx.alertId) continue;
      if (tx.caseId?.trim() || tx.caseStatus?.trim()) continue;
      if (linkedTxIds.has(tx.id) || (tx.alertId.trim() && linkedAlertIds.has(tx.alertId.trim()))) continue;

      items.push({
        id: notificationId(tx),
        kind: 'alert',
        label: notificationLabel(tx, vi),
        time: notificationTime(tx),
        reference: tx.transactionReference,
        transaction: tx,
      });
    }
  }

  return items.sort((a, b) => {
    const diff = (Date.parse(b.time ?? '') || 0) - (Date.parse(a.time ?? '') || 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export function notificationId(tx: TransactionRisk) {
 return JSON.stringify([tx.id, tx.caseStatus, tx.assignedInvestigatorId ?? tx.assignedInvestigator, tx.assignedAt, tx.caseDecision?.decidedAt, tx.investigationReport?.submittedAt]);
}
export function notificationTime(tx: TransactionRisk) {
 return [tx.processedAt, tx.assignedAt, tx.caseDecision?.decidedAt, tx.investigationReport?.submittedAt]
  .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
  .sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
}
export function notificationFeed(transactions: TransactionRisk[]) {
 return transactions.filter(tx=>!isSandboxTransaction(tx) && tx.riskLevel==='Abnormal' && (tx.alertId || tx.caseId)).slice()
  .sort((a,b)=>(Date.parse(notificationTime(b) ?? '')||0)-(Date.parse(notificationTime(a) ?? '')||0));
}
export function notificationLabel(tx: TransactionRisk, vi: boolean) {
 if(tx.scoringSource !== 'AI') return vi ? (tx.scoringSource === 'RULE_FALLBACK' ? 'Cảnh báo từ quy tắc dự phòng' : 'Giao dịch cần kiểm tra') : (tx.scoringSource === 'RULE_FALLBACK' ? 'Rules fallback alert' : 'Transaction to review');
 const labels: Record<string,[string,string]> = {
  Open:['Có cảnh báo AI mới','New AI alert'], Assigned:['Đã giao người điều tra','Investigator assigned'],
  Investigating:['Đang điều tra','Investigation in progress'],Reported:['Đã gửi báo cáo điều tra','Investigation report submitted'],
  'Confirmed Fraud':['Đã xác nhận gian lận','Fraud confirmed'], 'False Alarm':['Đã xác nhận cảnh báo nhầm','False alarm confirmed'],Resolved:['Đã hoàn tất xử lý','Case resolved']
 };
 return (labels[tx.caseStatus ?? 'Open'] ?? labels.Open)[vi ? 0 : 1];
}
