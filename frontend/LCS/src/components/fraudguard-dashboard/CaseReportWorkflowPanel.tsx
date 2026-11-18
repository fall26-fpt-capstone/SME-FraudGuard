"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  RotateCcw,
  Send,
} from "lucide-react";
import type { TransactionRisk, UserProfile } from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseErrorCode,
  InvestigationCaseReportVersion,
} from "@/types/investigation-case";
import type {
  ConfirmInvestigationReportCommandArgs,
  InvestigationActionOutcome,
  RequestInvestigationRevisionCommandArgs,
  SubmitInvestigationReportCommandArgs,
} from "@/hooks/useInvestigationCases";
import type { TranslationKey } from "@/config/translations";
import { useLanguage } from "@/context/LanguageContext";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { ScoringSourceBadge } from "./ScoringSourceBadge";
import styles from "./SecurityDashboard.module.css";

export interface ReportDraftAlertEntry {
  resultText: string;
  evidence: string;
}

export interface ReportDraftState {
  summary: string;
  perAlert: Record<string, ReportDraftAlertEntry>;
}

export type PendingModalLeaveAction =
  | { type: "close" }
  | { type: "switch"; caseId: string };

export function buildReportDraftScopeKey(
  caseId: string,
  actorId: string,
  baseReportVersion: number,
): string {
  return `${caseId}::${actorId}::v${baseReportVersion}`;
}

export function buildReportDraftBaseline(
  investigationCase: InvestigationCase,
): ReportDraftState {
  const latestReport =
    investigationCase.reports.length > 0
      ? investigationCase.reports[investigationCase.reports.length - 1]
      : undefined;
  const perAlert: Record<string, ReportDraftAlertEntry> = {};
  for (const alert of investigationCase.alerts) {
    const existing = latestReport?.alertResults.find(
      (item) => item.alertId === alert.alertId,
    );
    perAlert[alert.alertId] = {
      resultText: existing?.resultText ?? "",
      evidence: existing?.evidence ?? "",
    };
  }
  return {
    summary: latestReport?.summary ?? "",
    perAlert,
  };
}

export function isReportDraftDirty(
  draft: ReportDraftState | undefined,
  investigationCase: InvestigationCase,
): boolean {
  if (!draft) return false;
  const baseline = buildReportDraftBaseline(investigationCase);
  if (draft.summary !== baseline.summary) return true;
  for (const alert of investigationCase.alerts) {
    const currentItem = draft.perAlert[alert.alertId];
    const baseItem = baseline.perAlert[alert.alertId];
    if (!currentItem) continue;
    if (
      currentItem.resultText !== (baseItem?.resultText ?? "") ||
      currentItem.evidence !== (baseItem?.evidence ?? "")
    ) {
      return true;
    }
  }
  return false;
}

export function mapPhase2bErrorMessage(
  code: InvestigationCaseErrorCode,
  fallbackError: string,
  t: TranslationKey,
): string {
  switch (code) {
    case "FORBIDDEN_ASSIGNEE":
      return t.wf04Phase2b.errors.forbiddenAssignee;
    case "FORBIDDEN_TENANT":
      return t.wf04Phase2b.errors.forbiddenEnterprise;
    case "FORBIDDEN_ROLE":
      return t.wf04Phase2b.errors.forbiddenRole;
    case "INVALID_STATE":
      return t.wf04Phase2b.errors.invalidStatus;
    case "CASE_ALREADY_CLOSED":
      return t.wf04Phase2b.errors.caseAlreadyClosed;
    case "STALE_REPORT_VERSION":
      return t.wf04Phase2b.errors.staleReportVersion;
    case "REPORT_VERSION_MISMATCH":
      return t.wf04Phase2b.errors.reportVersionMismatch;
    case "NO_PENDING_REPORT":
      return t.wf04Phase2b.errors.noPendingReport;
    case "MISSING_ALERT_RESULT":
      return t.wf04Phase2b.errors.missingAlertResult;
    case "MISSING_ALERT_EVIDENCE":
      return t.wf04Phase2b.errors.missingAlertEvidence;
    case "MISSING_REPORT_SUMMARY":
      return t.wf04Phase2b.errors.missingReportSummary;
    case "MISSING_REVISION_REASON":
      return t.wf04Phase2b.errors.missingRevisionReason;
    case "MISSING_CONCLUSION_SUMMARY":
      return t.wf04Phase2b.errors.missingConclusionSummary;
    case "TIMESTAMP_OUT_OF_ORDER":
      return t.wf04Phase2a.caseQueue.timestampOutOfOrderError;
    case "INVALID_TIMESTAMP":
      return t.wf04Phase2a.caseQueue.invalidTimestampError;
    default:
      return fallbackError;
  }
}

interface CaseReportWorkflowPanelProps {
  investigationCase: InvestigationCase;
  effectiveActor: UserProfile;
  dateLocale: string;
  txLookup: {
    byId: Map<string, TransactionRisk>;
    byAlertId: Map<string, TransactionRisk>;
  };
  resolveActorDisplayName: (actorRef?: { actorId: string; name?: string }) => string;
  draftState: ReportDraftState;
  hasExistingUnsentDraft: boolean;
  isDirty: boolean;
  pendingLeaveAction: PendingModalLeaveAction | null;
  onDraftChange: (scopeKey: string, nextDraft: ReportDraftState) => void;
  onClearDraft: (scopeKey: string) => void;
  onCancelLeave: () => void;
  onConfirmLeave: (scopeKey: string) => void;
  onSubmitReport?: (
    args: SubmitInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  onRequestRevision?: (
    args: RequestInvestigationRevisionCommandArgs,
  ) => InvestigationActionOutcome;
  onConfirmAndCloseReport?: (
    args: ConfirmInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  onOpenSourceAlert?: (tx: TransactionRisk) => void;
  onActionError: (errorMessage: string | null) => void;
}

interface ValidationErrors {
  summary?: string;
  perAlert: Record<string, { resultText?: string; evidence?: string }>;
}

function formatPanelDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return "-";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(locale);
}

export function CaseReportWorkflowPanel({
  investigationCase: c,
  effectiveActor,
  dateLocale,
  txLookup,
  resolveActorDisplayName,
  draftState,
  hasExistingUnsentDraft,
  isDirty,
  pendingLeaveAction,
  onDraftChange,
  onClearDraft,
  onCancelLeave,
  onConfirmLeave,
  onSubmitReport,
  onRequestRevision,
  onConfirmAndCloseReport,
  onOpenSourceAlert,
  onActionError,
}: CaseReportWorkflowPanelProps) {
  const { t } = useLanguage();

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({
    perAlert: {},
  });
  const [revisionFormOpen, setRevisionFormOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [confirmPanelOpen, setConfirmPanelOpen] = useState(false);
  const [finalSummary, setFinalSummary] = useState("");
  const [finalSummaryError, setFinalSummaryError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"submit" | "revision" | "confirm" | null>(
    null,
  );
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [expandedVersionIds, setExpandedVersionIds] = useState<Record<string, boolean>>({});

  const latestReport =
    c.reports.length > 0 ? c.reports[c.reports.length - 1] : undefined;
  const baseVersion = latestReport ? latestReport.version : 0;
  const nextVersion = c.reports.length + 1;
  const scopeKey = buildReportDraftScopeKey(c.caseId, effectiveActor.id, baseVersion);

  const isSameEnterprise = c.enterpriseId === effectiveActor.enterpriseId;
  const isOperatorInTenant = isSameEnterprise && effectiveActor.role === "Operator";
  const canAuthorReport =
    c.status === "Investigating" &&
    isSameEnterprise &&
    c.assignee?.actorId === effectiveActor.id &&
    (effectiveActor.role === "Investigator" || effectiveActor.role === "Operator");

  const activePendingReport: InvestigationCaseReportVersion | undefined =
    c.status === "Pending Review"
      ? c.pendingReviewReportId !== undefined
        ? c.reports.find(
            (rep) =>
              rep.reportId === c.pendingReviewReportId &&
              (c.pendingReviewReportVersion === undefined ||
                rep.version === c.pendingReviewReportVersion),
          )
        : latestReport
      : undefined;

  let latestRevisionReason: string | undefined;
  let latestRevisionReportVersion: number | undefined;
  for (let i = c.history.length - 1; i >= 0; i -= 1) {
    const evt = c.history[i];
    if (evt.type === "REVISION_REQUESTED" && evt.reason) {
      latestRevisionReason = evt.reason;
      latestRevisionReportVersion = evt.reportVersion;
      break;
    }
  }

  useEffect(() => {
    setExpandedVersionIds({});
    setStorageWarning(null);
  }, [c.caseId, effectiveActor.id]);

  useEffect(() => {
    setFieldErrors({ perAlert: {} });
    setRevisionFormOpen(false);
    setRevisionReason("");
    setRevisionError(null);
    setConfirmPanelOpen(false);
    setFinalSummary(activePendingReport?.summary ?? "");
    setFinalSummaryError(null);
    setBusyAction(null);
  }, [
    c.caseId,
    c.status,
    c.pendingReviewReportId,
    c.pendingReviewReportVersion,
    effectiveActor.id,
    activePendingReport?.summary,
  ]);

  const updateAlertField = (
    alertId: string,
    field: "resultText" | "evidence",
    value: string,
  ) => {
    const existing = draftState.perAlert[alertId] ?? { resultText: "", evidence: "" };
    onDraftChange(scopeKey, {
      ...draftState,
      perAlert: {
        ...draftState.perAlert,
        [alertId]: {
          ...existing,
          [field]: value,
        },
      },
    });
    if (fieldErrors.perAlert[alertId]?.[field]) {
      setFieldErrors((prev) => ({
        ...prev,
        perAlert: {
          ...prev.perAlert,
          [alertId]: {
            ...prev.perAlert[alertId],
            [field]: undefined,
          },
        },
      }));
    }
  };

  const updateSummaryField = (value: string) => {
    onDraftChange(scopeKey, {
      ...draftState,
      summary: value,
    });
    if (fieldErrors.summary) {
      setFieldErrors((prev) => ({ ...prev, summary: undefined }));
    }
  };

  const handleSubmitReportClick = () => {
    if (!canAuthorReport || !onSubmitReport) return;

    const nextPerAlertErrors: Record<string, { resultText?: string; evidence?: string }> =
      {};
    let hasValidationError = false;

    for (const alert of c.alerts) {
      const entry = draftState.perAlert[alert.alertId];
      const resultTrimmed = (entry?.resultText ?? "").trim();
      const evidenceTrimmed = (entry?.evidence ?? "").trim();
      if (!resultTrimmed || !evidenceTrimmed) {
        hasValidationError = true;
        nextPerAlertErrors[alert.alertId] = {
          ...(resultTrimmed ? {} : { resultText: t.wf04Phase2b.reportForm.resultRequiredError }),
          ...(evidenceTrimmed
            ? {}
            : { evidence: t.wf04Phase2b.reportForm.evidenceRequiredError }),
        };
      }
    }

    const summaryTrimmed = draftState.summary.trim();
    const summaryErr = summaryTrimmed
      ? undefined
      : t.wf04Phase2b.reportForm.summaryRequiredError;
    if (summaryErr) {
      hasValidationError = true;
    }

    if (hasValidationError) {
      setFieldErrors({
        summary: summaryErr,
        perAlert: nextPerAlertErrors,
      });
      return;
    }

    setBusyAction("submit");
    onActionError(null);
    setStorageWarning(null);
    const outcome = onSubmitReport({
      caseId: c.caseId,
      summary: summaryTrimmed,
      alertResults: c.alerts.map((alert) => ({
        alertId: alert.alertId,
        resultText: (draftState.perAlert[alert.alertId]?.resultText ?? "").trim(),
        evidence: (draftState.perAlert[alert.alertId]?.evidence ?? "").trim(),
      })),
      expectedStatus: "Investigating",
      expectedBaseVersion: baseVersion,
    });
    setBusyAction(null);

    if (!outcome.ok) {
      onActionError(mapPhase2bErrorMessage(outcome.code, outcome.error, t));
      return;
    }

    onClearDraft(scopeKey);
    setFieldErrors({ perAlert: {} });
    if (!outcome.persisted) {
      setStorageWarning(t.wf04Phase2b.errors.storageSyncWarning);
    }
  };

  const handleRevisionSubmit = () => {
    if (!isOperatorInTenant || !activePendingReport || !onRequestRevision) return;
    const trimmedReason = revisionReason.trim();
    if (!trimmedReason) {
      setRevisionError(t.wf04Phase2b.revisionForm.reasonRequiredError);
      return;
    }
    setBusyAction("revision");
    setRevisionError(null);
    onActionError(null);
    setStorageWarning(null);
    const outcome = onRequestRevision({
      caseId: c.caseId,
      reason: trimmedReason,
      expectedReportId: activePendingReport.reportId,
      expectedReportVersion: activePendingReport.version,
    });
    setBusyAction(null);

    if (!outcome.ok) {
      onActionError(mapPhase2bErrorMessage(outcome.code, outcome.error, t));
      return;
    }

    setRevisionFormOpen(false);
    setRevisionReason("");
    if (!outcome.persisted) {
      setStorageWarning(t.wf04Phase2b.errors.storageSyncWarning);
    }
  };

  const handleConfirmCloseSubmit = () => {
    if (!isOperatorInTenant || !activePendingReport || !onConfirmAndCloseReport) return;
    const trimmedFinal = finalSummary.trim();
    if (!trimmedFinal) {
      setFinalSummaryError(t.wf04Phase2b.confirmClose.finalSummaryRequiredError);
      return;
    }
    setBusyAction("confirm");
    setFinalSummaryError(null);
    onActionError(null);
    setStorageWarning(null);
    const outcome = onConfirmAndCloseReport({
      caseId: c.caseId,
      reportId: activePendingReport.reportId,
      reportVersion: activePendingReport.version,
      finalSummary: trimmedFinal,
    });
    setBusyAction(null);

    if (!outcome.ok) {
      onActionError(mapPhase2bErrorMessage(outcome.code, outcome.error, t));
      return;
    }

    setConfirmPanelOpen(false);
    if (!outcome.persisted) {
      setStorageWarning(t.wf04Phase2b.errors.storageSyncWarning);
    }
  };

  const hasPerAlertErrors = Object.values(fieldErrors.perAlert).some(
    (item) => Boolean(item?.resultText) || Boolean(item?.evidence),
  );

  const toggleVersionExpanded = (reportId: string) => {
    setExpandedVersionIds((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const findRevisionReasonForReport = (
    rep: InvestigationCaseReportVersion,
  ): string | undefined => {
    for (let i = c.history.length - 1; i >= 0; i -= 1) {
      const evt = c.history[i];
      if (
        evt.type === "REVISION_REQUESTED" &&
        evt.reportId === rep.reportId &&
        evt.reportVersion === rep.version &&
        evt.reason
      ) {
        return evt.reason;
      }
    }
    return undefined;
  };

  return (
    <>
      {storageWarning && (
        <div className={styles.reportRevisionBanner} role="status" style={{ marginBottom: 14 }}>
          {storageWarning}
        </div>
      )}

      {canAuthorReport && pendingLeaveAction && isDirty && (
        <div
          className={styles.discardConfirmPanel}
          role="region"
          aria-live="polite"
          style={{ marginBottom: 14 }}
        >
          <div>
            <strong>{t.wf04Phase2b.reportForm.discardDraftTitle}</strong>
            <p style={{ margin: "4px 0 0" }}>
              {t.wf04Phase2b.reportForm.discardDraftMessage}
            </p>
          </div>
          <div className={styles.reportFormActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onCancelLeave}
            >
              {t.wf04Phase2b.reportForm.keepEditingBtn}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onConfirmLeave(scopeKey)}
            >
              {t.wf04Phase2b.reportForm.discardDraftConfirmBtn}
            </button>
          </div>
        </div>
      )}

      {canAuthorReport && (
        <div className={styles.caseDetailSection}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <h3 className={styles.drawerSectionTitle} style={{ margin: 0 }}>
              {t.wf04Phase2b.reportForm.formTitle}
            </h3>
            <span className={styles.reportVersionBadgePending}>
              {t.wf04Phase2b.reportForm.versionBadge.replace(
                "{version}",
                String(nextVersion),
              )}
            </span>
          </div>
          <p className={styles.muted} style={{ margin: "0 0 12px" }}>
            {t.wf04Phase2b.reportForm.formSubtitle}
          </p>

          {effectiveActor.role === "Operator" && (
            <div className={styles.drawerReadOnlyNotice} style={{ marginBottom: 12 }}>
              {t.wf04Phase2b.confirmClose.selfInvestigationTwoStepHint}
            </div>
          )}

          {latestRevisionReason && (
            <div className={styles.reportRevisionBanner} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={15} aria-hidden="true" />
                <strong>
                  {t.wf04Phase2b.reportForm.revisionReasonCalloutLabel}
                  {latestRevisionReportVersion
                    ? ` (v${latestRevisionReportVersion})`
                    : ""}
                </strong>
              </div>
              <span>{latestRevisionReason}</span>
            </div>
          )}

          <div className={styles.reportDraftNotice} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {hasExistingUnsentDraft && isDirty ? (
                <strong>{t.wf04Phase2b.reportForm.draftRestoredNotice}</strong>
              ) : latestReport ? (
                <strong>
                  {t.wf04Phase2b.reportForm.editingBaseHint.replace(
                    "{version}",
                    String(latestReport.version),
                  )}
                </strong>
              ) : null}
              <span>{t.wf04Phase2b.reportForm.draftInMemoryNote}</span>
            </div>
          </div>

          <div className={styles.reportForm}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 13 }}>
                {t.wf04Phase2b.reportForm.perAlertHeading.replace(
                  "{count}",
                  String(c.alerts.length),
                )}
              </strong>
              <span className={styles.muted}>
                {t.wf04Phase2b.reportForm.evidenceScopeNote}
              </span>
            </div>

            <div className={styles.reportAlertList}>
              {c.alerts.map((alert) => {
                const matchedTx =
                  txLookup.byId.get(alert.transactionId) ??
                  txLookup.byAlertId.get(alert.alertId);
                const draftEntry = draftState.perAlert[alert.alertId] ?? {
                  resultText: "",
                  evidence: "",
                };
                const err = fieldErrors.perAlert[alert.alertId];
                const resultInputId = `wf04-alert-result-${alert.alertId}`;
                const evidenceInputId = `wf04-alert-evidence-${alert.alertId}`;
                const resultErrId = `wf04-alert-result-err-${alert.alertId}`;
                const evidenceErrId = `wf04-alert-evidence-err-${alert.alertId}`;

                return (
                  <div key={alert.alertId} className={styles.reportAlertCard}>
                    <div className={styles.reportAlertHeader}>
                      <div>
                        <strong>
                          {t.wf04Phase2b.reportForm.alertCardTitle.replace(
                            "{code}",
                            alert.alertId,
                          )}
                        </strong>{" "}
                        <span className={styles.muted}>
                          ({t.wf04Phase2b.reportForm.alertSourceMeta.replace(
                            "{txRef}",
                            alert.transactionReference,
                          )})
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <RiskLevelBadge riskLevel={alert.riskLevel} />
                        <ScoringSourceBadge source={alert.scoringSource} />
                        {onOpenSourceAlert && matchedTx && (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => onOpenSourceAlert(matchedTx)}
                          >
                            <Eye size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                            {t.wf04Phase2a.caseQueue.openSourceAlertBtn}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={styles.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
                      {alert.projectName} · {alert.entityReference} · {alert.transactionType} ·{" "}
                      {formatPanelDateTime(alert.processedAt, dateLocale)}
                      {matchedTx?.amount != null
                        ? ` · ${matchedTx.amount.toLocaleString(dateLocale)} ${matchedTx.currency || "VND"}`
                        : ""}
                      {alert.modelVersion ? ` · ${alert.modelVersion}` : ""}
                      {(alert.explanation || matchedTx?.explanation) && (
                        <div style={{ marginTop: 4 }}>
                          {alert.explanation || matchedTx?.explanation}
                        </div>
                      )}
                    </div>

                    <div className={styles.reportFieldGroup}>
                      <label htmlFor={resultInputId} className={styles.reportFieldLabel}>
                        {t.wf04Phase2b.reportForm.resultLabel}
                      </label>
                      <textarea
                        id={resultInputId}
                        rows={2}
                        className={`${styles.formTextarea} ${err?.resultText ? styles.reportInputInvalid : ""}`}
                        placeholder={t.wf04Phase2b.reportForm.resultPlaceholder}
                        value={draftEntry.resultText}
                        aria-invalid={Boolean(err?.resultText)}
                        aria-describedby={err?.resultText ? resultErrId : undefined}
                        onChange={(e) =>
                          updateAlertField(alert.alertId, "resultText", e.target.value)
                        }
                      />
                      {err?.resultText && (
                        <p id={resultErrId} className={styles.reportFieldError}>
                          {err.resultText}
                        </p>
                      )}
                    </div>

                    <div className={styles.reportFieldGroup}>
                      <label htmlFor={evidenceInputId} className={styles.reportFieldLabel}>
                        {t.wf04Phase2b.reportForm.evidenceLabel}
                      </label>
                      <textarea
                        id={evidenceInputId}
                        rows={2}
                        className={`${styles.formTextarea} ${err?.evidence ? styles.reportInputInvalid : ""}`}
                        placeholder={t.wf04Phase2b.reportForm.evidencePlaceholder}
                        value={draftEntry.evidence}
                        aria-invalid={Boolean(err?.evidence)}
                        aria-describedby={err?.evidence ? evidenceErrId : undefined}
                        onChange={(e) =>
                          updateAlertField(alert.alertId, "evidence", e.target.value)
                        }
                      />
                      {err?.evidence && (
                        <p id={evidenceErrId} className={styles.reportFieldError}>
                          {err.evidence}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.reportFieldGroup}>
              <label htmlFor="wf04-report-summary" className={styles.reportFieldLabel}>
                {t.wf04Phase2b.reportForm.summaryLabel}
              </label>
              <textarea
                id="wf04-report-summary"
                rows={3}
                className={`${styles.formTextarea} ${fieldErrors.summary ? styles.reportInputInvalid : ""}`}
                placeholder={t.wf04Phase2b.reportForm.summaryPlaceholder}
                value={draftState.summary}
                aria-invalid={Boolean(fieldErrors.summary)}
                aria-describedby={
                  fieldErrors.summary ? "wf04-report-summary-err" : undefined
                }
                onChange={(e) => updateSummaryField(e.target.value)}
              />
              {fieldErrors.summary && (
                <p id="wf04-report-summary-err" className={styles.reportFieldError}>
                  {fieldErrors.summary}
                </p>
              )}
            </div>

            {hasPerAlertErrors && (
              <div className={styles.modalErrorBanner} role="alert">
                {t.wf04Phase2b.reportForm.alertErrorsSummary}
              </div>
            )}

            <div className={styles.reportFormActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!onSubmitReport || busyAction === "submit"}
                onClick={handleSubmitReportClick}
              >
                <Send size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                {busyAction === "submit"
                  ? t.wf04Phase2b.reportForm.submittingReportBtn
                  : latestReport
                    ? t.wf04Phase2b.reportForm.resubmitReportBtn
                    : t.wf04Phase2b.reportForm.submitReportBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {c.status === "Pending Review" && activePendingReport && (
        <div className={styles.caseDetailSection}>
          <div className={styles.reportDraftNotice} style={{ marginBottom: 12 }}>
            <span>
              {t.wf04Phase2b.reportForm.readOnlySubmittedNotice.replace(
                "{version}",
                String(activePendingReport.version),
              )}
            </span>
          </div>

          <div className={styles.reportVersionCard}>
            <div className={styles.reportVersionHeader}>
              <div>
                <strong>
                  {t.wf04Phase2b.versionViewer.versionItemLabel.replace(
                    "{version}",
                    String(activePendingReport.version),
                  )}
                </strong>{" "}
                <span className={styles.muted}>({activePendingReport.reportId})</span>
              </div>
              <span className={styles.reportVersionBadgePending}>
                {t.wf04Phase2b.versionViewer.latestPendingTag}
              </span>
            </div>

            <div className={styles.muted} style={{ fontSize: 12 }}>
              {t.wf04Phase2b.versionViewer.submittedByLabel}:{" "}
              {resolveActorDisplayName(activePendingReport.submittedBy)} ·{" "}
              {t.wf04Phase2b.versionViewer.submittedAtLabel}:{" "}
              {formatPanelDateTime(activePendingReport.submittedAt, dateLocale)}
            </div>

            <div>
              <p style={{ margin: "6px 0 4px", fontWeight: 600, fontSize: 13 }}>
                {t.wf04Phase2b.confirmClose.reviewSummaryHeading}
              </p>
              <p style={{ margin: 0 }}>{activePendingReport.summary}</p>
            </div>

            <div style={{ marginTop: 6 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13 }}>
                {t.wf04Phase2b.confirmClose.reviewPerAlertHeading}
              </p>
              <div className={styles.reportAlertList}>
                {activePendingReport.alertResults.map((item) => (
                  <div key={item.alertId} className={styles.reportAlertResultRow}>
                    <div>
                      <strong>{item.transactionReference}</strong>
                      <div className={styles.muted}>{item.alertId}</div>
                    </div>
                    <div>
                      <div className={styles.muted} style={{ fontSize: 11 }}>
                        {t.wf04Phase2b.reportsView.alertResultCol}
                      </div>
                      <div>{item.resultText}</div>
                    </div>
                    <div>
                      <div className={styles.muted} style={{ fontSize: 11 }}>
                        {t.wf04Phase2b.reportsView.alertEvidenceCol}
                      </div>
                      <div>{item.evidence}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isOperatorInTenant && !revisionFormOpen && !confirmPanelOpen && (
              <div className={styles.reportFormActions} style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={!onRequestRevision}
                  onClick={() => {
                    setRevisionFormOpen(true);
                    setConfirmPanelOpen(false);
                    setRevisionError(null);
                  }}
                >
                  <RotateCcw size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                  {t.wf04Phase2b.revisionForm.openRevisionBtn}
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!onConfirmAndCloseReport}
                  onClick={() => {
                    setConfirmPanelOpen(true);
                    setRevisionFormOpen(false);
                    setFinalSummary(activePendingReport.summary);
                    setFinalSummaryError(null);
                  }}
                >
                  <CheckCircle2 size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                  {t.wf04Phase2b.confirmClose.openConfirmStepBtn}
                </button>
              </div>
            )}
          </div>

          {isOperatorInTenant && revisionFormOpen && (
            <div className={styles.reportRevisionBanner} style={{ marginTop: 12 }}>
              <strong>{t.wf04Phase2b.revisionForm.sectionTitle}</strong>
              <div className={styles.reportFieldGroup}>
                <label htmlFor="wf04-revision-reason" className={styles.reportFieldLabel}>
                  {t.wf04Phase2b.revisionForm.reasonLabel}
                </label>
                <textarea
                  id="wf04-revision-reason"
                  rows={3}
                  className={`${styles.formTextarea} ${revisionError ? styles.reportInputInvalid : ""}`}
                  placeholder={t.wf04Phase2b.revisionForm.reasonPlaceholder}
                  value={revisionReason}
                  aria-invalid={Boolean(revisionError)}
                  aria-describedby={revisionError ? "wf04-revision-reason-err" : undefined}
                  onChange={(e) => {
                    setRevisionReason(e.target.value);
                    if (revisionError) setRevisionError(null);
                  }}
                />
                {revisionError && (
                  <p id="wf04-revision-reason-err" className={styles.reportFieldError}>
                    {revisionError}
                  </p>
                )}
              </div>
              <div className={styles.reportFormActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setRevisionFormOpen(false);
                    setRevisionError(null);
                  }}
                >
                  {t.wf04Phase2b.revisionForm.cancelRevisionBtn}
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={busyAction === "revision" || !onRequestRevision}
                  onClick={handleRevisionSubmit}
                >
                  {busyAction === "revision"
                    ? t.wf04Phase2b.revisionForm.submittingRevisionBtn
                    : t.wf04Phase2b.revisionForm.submitRevisionBtn}
                </button>
              </div>
            </div>
          )}

          {isOperatorInTenant && confirmPanelOpen && (
            <div className={styles.confirmReviewPanel} style={{ marginTop: 12 }}>
              <div>
                <h4 style={{ margin: "0 0 4px" }}>
                  {t.wf04Phase2b.confirmClose.confirmStepTitle}
                </h4>
                <p className={styles.muted} style={{ margin: 0 }}>
                  {t.wf04Phase2b.confirmClose.confirmStepSubtitle}
                </p>
              </div>
              <div>
                <span className={styles.reportVersionBadgeConfirmed}>
                  {t.wf04Phase2b.confirmClose.reviewingVersionBadge
                    .replace("{version}", String(activePendingReport.version))
                    .replace("{reportId}", activePendingReport.reportId)}
                </span>
              </div>
              <div className={styles.muted} style={{ fontSize: 12 }}>
                {t.wf04Phase2b.confirmClose.finalSummaryHint}
              </div>
              <div className={styles.reportFieldGroup}>
                <label htmlFor="wf04-final-summary" className={styles.reportFieldLabel}>
                  {t.wf04Phase2b.confirmClose.finalSummaryLabel}
                </label>
                <textarea
                  id="wf04-final-summary"
                  rows={3}
                  className={`${styles.formTextarea} ${finalSummaryError ? styles.reportInputInvalid : ""}`}
                  placeholder={t.wf04Phase2b.confirmClose.finalSummaryPlaceholder}
                  value={finalSummary}
                  aria-invalid={Boolean(finalSummaryError)}
                  aria-describedby={finalSummaryError ? "wf04-final-summary-err" : undefined}
                  onChange={(e) => {
                    setFinalSummary(e.target.value);
                    if (finalSummaryError) setFinalSummaryError(null);
                  }}
                />
                {finalSummaryError && (
                  <p id="wf04-final-summary-err" className={styles.reportFieldError}>
                    {finalSummaryError}
                  </p>
                )}
              </div>
              <div className={styles.reportFormActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setConfirmPanelOpen(false);
                    setFinalSummaryError(null);
                  }}
                >
                  {t.wf04Phase2b.confirmClose.backToReviewBtn}
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={busyAction === "confirm" || !onConfirmAndCloseReport}
                  onClick={handleConfirmCloseSubmit}
                >
                  <Lock size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                  {busyAction === "confirm"
                    ? t.wf04Phase2b.confirmClose.confirmingBtn
                    : t.wf04Phase2b.confirmClose.confirmAndCloseBtn}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {c.status === "Closed" && c.conclusion && (
        <div className={styles.caseDetailSection}>
          <div className={styles.confirmReviewPanel}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Lock size={15} aria-hidden="true" />
                <strong>{t.wf04Phase2b.confirmClose.closedBannerTitle}</strong>
              </div>
              <span className={styles.reportVersionBadgeConfirmed}>
                {t.wf04Phase2b.versionViewer.confirmedTag} (v{c.conclusion.reportVersion})
              </span>
            </div>
            <p className={styles.muted} style={{ margin: 0 }}>
              {t.wf04Phase2b.confirmClose.closedReadOnlyNotice.replace(
                "{version}",
                String(c.conclusion.reportVersion),
              )}
            </p>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>
                {t.wf04Phase2b.confirmClose.confirmedByLabel}
              </span>
              <strong>{resolveActorDisplayName(c.conclusion.confirmedBy)}</strong>
            </div>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>
                {t.wf04Phase2b.confirmClose.confirmedAtLabel}
              </span>
              <span>
                {formatPanelDateTime(c.conclusion.confirmedAt || c.closedAt, dateLocale)}
              </span>
            </div>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>
                {t.wf04Phase2b.confirmClose.confirmedVersionLabel}
              </span>
              <span>
                v{c.conclusion.reportVersion} ({c.conclusion.reportId})
              </span>
            </div>
            <div>
              <p style={{ margin: "4px 0 4px", fontWeight: 600, fontSize: 13 }}>
                {t.wf04Phase2b.confirmClose.finalConclusionHeading}
              </p>
              <p style={{ margin: 0 }}>{c.conclusion.summary}</p>
            </div>
            <div className={styles.reportAlertList}>
              {c.conclusion.alertResults.map((item) => (
                <div key={item.alertId} className={styles.reportAlertResultRow}>
                  <div>
                    <strong>{item.transactionReference}</strong>
                    <div className={styles.muted}>{item.alertId}</div>
                  </div>
                  <div>
                    <div className={styles.muted} style={{ fontSize: 11 }}>
                      {t.wf04Phase2b.reportsView.alertResultCol}
                    </div>
                    <div>{item.resultText}</div>
                  </div>
                  <div>
                    <div className={styles.muted} style={{ fontSize: 11 }}>
                      {t.wf04Phase2b.reportsView.alertEvidenceCol}
                    </div>
                    <div>{item.evidence}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={styles.caseDetailSection}>
        <h3 className={styles.drawerSectionTitle}>
          {t.wf04Phase2b.versionViewer.versionsHeading.replace(
            "{count}",
            String(c.reports.length),
          )}
        </h3>
        {c.reports.length === 0 ? (
          <p className={styles.muted}>{t.wf04Phase2b.versionViewer.noVersionsEmpty}</p>
        ) : (
          <ul className={styles.reportVersionList}>
            {c.reports
              .slice()
              .reverse()
              .map((rep) => {
                const isConfirmedVersion =
                  c.status === "Closed" &&
                  c.conclusion?.reportId === rep.reportId &&
                  c.conclusion?.reportVersion === rep.version;
                const isPendingVersion =
                  c.status === "Pending Review" &&
                  c.pendingReviewReportId === rep.reportId &&
                  (c.pendingReviewReportVersion === undefined ||
                    c.pendingReviewReportVersion === rep.version);
                const isExpanded = Boolean(expandedVersionIds[rep.reportId]);
                const revReason = findRevisionReasonForReport(rep);

                return (
                  <li key={rep.reportId} className={styles.reportVersionCard}>
                    <div className={styles.reportVersionHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <FileText size={14} aria-hidden="true" />
                        <strong>
                          {t.wf04Phase2b.versionViewer.versionItemLabel.replace(
                            "{version}",
                            String(rep.version),
                          )}
                        </strong>
                        {isConfirmedVersion ? (
                          <span className={styles.reportVersionBadgeConfirmed}>
                            {t.wf04Phase2b.versionViewer.confirmedTag}
                          </span>
                        ) : isPendingVersion ? (
                          <span className={styles.reportVersionBadgePending}>
                            {t.wf04Phase2b.versionViewer.latestPendingTag}
                          </span>
                        ) : (
                          <span className={styles.reportVersionBadgeSuperseded}>
                            {t.wf04Phase2b.versionViewer.supersededTag}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className={styles.button}
                        aria-expanded={isExpanded}
                        onClick={() => toggleVersionExpanded(rep.reportId)}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} style={{ marginRight: 5 }} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} style={{ marginRight: 5 }} aria-hidden="true" />
                        )}
                        {isExpanded
                          ? t.wf04Phase2b.versionViewer.hideVersionBtn
                          : t.wf04Phase2b.versionViewer.viewVersionBtn}
                      </button>
                    </div>

                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      {t.wf04Phase2b.versionViewer.submittedByLabel}:{" "}
                      {resolveActorDisplayName(rep.submittedBy)} ·{" "}
                      {t.wf04Phase2b.versionViewer.submittedAtLabel}:{" "}
                      {formatPanelDateTime(rep.submittedAt, dateLocale)}
                    </div>

                    {revReason && (
                      <div className={styles.reportRevisionBanner}>
                        <strong>{t.wf04Phase2b.versionViewer.revisionReasonLabel}:</strong>
                        <span>{revReason}</span>
                      </div>
                    )}

                    {isExpanded && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                        {!isPendingVersion && !isConfirmedVersion && (
                          <div className={styles.drawerReadOnlyNotice}>
                            {t.wf04Phase2b.versionViewer.oldVersionReadOnlyNote.replace(
                              "{version}",
                              String(rep.version),
                            )}
                          </div>
                        )}
                        <p style={{ margin: 0 }}>{rep.summary}</p>
                        <div className={styles.reportAlertList}>
                          {rep.alertResults.map((item) => (
                            <div key={item.alertId} className={styles.reportAlertResultRow}>
                              <div>
                                <strong>{item.transactionReference}</strong>
                                <div className={styles.muted}>{item.alertId}</div>
                              </div>
                              <div>
                                <div className={styles.muted} style={{ fontSize: 11 }}>
                                  {t.wf04Phase2b.reportsView.alertResultCol}
                                </div>
                                <div>{item.resultText}</div>
                              </div>
                              <div>
                                <div className={styles.muted} style={{ fontSize: 11 }}>
                                  {t.wf04Phase2b.reportsView.alertEvidenceCol}
                                </div>
                                <div>{item.evidence}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </>
  );
}
