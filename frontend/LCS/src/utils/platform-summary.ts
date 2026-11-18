import { isSandboxTransaction } from './transaction-origin';
import type { TransactionRisk } from '@/types/fraudguard';
import type { InvestigationReportFeedback } from '@/types/report-feedback';

export interface PlatformSummaryOptions {
  wf04Managed?: boolean;
  reportFeedbacks?: readonly InvestigationReportFeedback[];
}

export interface PlatformSummaryTrendBucket {
  time: string;
  aiRequests: number;
  fallbackRequests: number;
}

export interface PlatformSummaryResult<TFeedback = TransactionRisk | InvestigationReportFeedback> {
  fallbackRate: number | null;
  trend: PlatformSummaryTrendBucket[];
  feedback: TFeedback[];
}

export function platformSummary(transactions: TransactionRisk[]): PlatformSummaryResult<TransactionRisk>;
export function platformSummary(
  transactions: TransactionRisk[],
  options: { wf04Managed: true; reportFeedbacks?: readonly InvestigationReportFeedback[] },
): PlatformSummaryResult<InvestigationReportFeedback>;
export function platformSummary(
  transactions: TransactionRisk[],
  options?: PlatformSummaryOptions,
): PlatformSummaryResult;
export function platformSummary(
  transactions: TransactionRisk[],
  options?: PlatformSummaryOptions,
): PlatformSummaryResult {
  transactions = transactions.filter(tx => !isSandboxTransaction(tx));
  const ai = transactions.filter(t => t.scoringSource === 'AI');
  const fallback = transactions.filter(t => t.scoringSource === 'RULE_FALLBACK');
  const buckets = new Map<string, PlatformSummaryTrendBucket>();
  for (const tx of [...ai, ...fallback]) {
    const date = new Date(tx.processedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const time = date.toISOString().slice(0, 13) + ':00Z';
    const row = buckets.get(time) ?? { time, aiRequests: 0, fallbackRequests: 0 };
    if (tx.scoringSource === 'AI') row.aiRequests++;
    else row.fallbackRequests++;
    buckets.set(time, row);
  }
  return {
    fallbackRate:
      ai.length + fallback.length ? (fallback.length / (ai.length + fallback.length)) * 100 : null,
    trend: [...buckets.values()].sort((a, b) => a.time.localeCompare(b.time)),
    feedback: options?.wf04Managed
      ? [...(options.reportFeedbacks ?? [])]
      : ai.filter(
          tx => tx.caseDecision && ['Confirmed Fraud', 'False Alarm'].includes(tx.caseDecision.status),
        ),
  };
}
