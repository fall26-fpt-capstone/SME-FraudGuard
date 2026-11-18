"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Send } from "lucide-react";
import type { Enterprise } from "@/types/enterprise";
import type { UserProfile } from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type {
  InvestigationReportFeedback,
  InvestigationReportFeedbackErrorCode,
} from "@/types/report-feedback";
import type {
  SubmitConfirmedReportFeedbackCommandArgs,
  SubmitFeedbackOutcome,
} from "@/hooks/useInvestigationCases";
import { buildConfirmedReportFeedbackPreview } from "@/utils/report-feedback";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastProvider";
import type { TranslationKey } from "@/config/translations";
import styles from "./SecurityDashboard.module.css";

export interface ReportFeedbackModalProps {
  open: boolean;
  caseId: string | null;
  actor?: UserProfile;
  cases: readonly InvestigationCase[];
  enterprises: readonly Enterprise[];
  users?: readonly UserProfile[];
  feedbacks?: readonly InvestigationReportFeedback[];
  onClose: () => void;
  onSubmit?: (args: SubmitConfirmedReportFeedbackCommandArgs) => SubmitFeedbackOutcome;
}

export function mapFeedbackErrorMessage(
  code: InvestigationReportFeedbackErrorCode,
  fallbackMessage: string,
  t: TranslationKey,
): string {
  switch (code) {
    case "INVALID_FEEDBACK_INPUT":
      return t.wf04Phase2c.errors.invalidInput;
    case "FORBIDDEN_ROLE":
      return t.wf04Phase2c.errors.forbiddenRole;
    case "FORBIDDEN_TENANT":
      return t.wf04Phase2c.errors.forbiddenTenant;
    case "CASE_NOT_FOUND":
      return t.wf04Phase2c.errors.caseNotFound;
    case "CASE_NOT_CLOSED":
      return t.wf04Phase2c.errors.caseNotClosed;
    case "MISSING_CONFIRMED_REPORT":
      return t.wf04Phase2c.errors.missingConfirmedReport;
    case "MISSING_REPORT_ID":
      return t.wf04Phase2c.errors.missingReportId;
    case "INVALID_REPORT_ID":
      return t.wf04Phase2c.errors.invalidReportId;
    case "MISSING_REPORT_VERSION":
      return t.wf04Phase2c.errors.missingReportVersion;
    case "INVALID_REPORT_VERSION":
      return t.wf04Phase2c.errors.invalidReportVersion;
    case "REPORT_VERSION_MISMATCH":
      return t.wf04Phase2c.errors.reportVersionMismatch;
    case "STALE_REPORT_VERSION":
      return t.wf04Phase2c.errors.staleReportVersion;
    case "INVALID_TIMESTAMP":
      return t.wf04Phase2c.errors.invalidTimestamp;
    case "TIMESTAMP_OUT_OF_ORDER":
      return t.wf04Phase2c.errors.timestampOutOfOrder;
    case "DUPLICATE_REPORT_FEEDBACK":
      return t.wf04Phase2c.errors.duplicateFeedback;
    case "FORBIDDEN_READ":
      return t.wf04Phase2c.errors.forbiddenRead;
    case "FEEDBACK_NOT_FOUND":
      return t.wf04Phase2c.errors.feedbackNotFound;
    default:
      return fallbackMessage;
  }
}

function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return "-";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(locale);
}

export function ReportFeedbackModal({
  open,
  caseId,
  actor,
  cases,
  enterprises,
  users,
  feedbacks = [],
  onClose,
  onSubmit,
}: ReportFeedbackModalProps) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const dateLocale = language === "vi" ? "vi-VN" : "en-US";

  const [smeComment, setSmeComment] = useState("");
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const previewResult = useMemo(() => {
    if (!open || !caseId || !actor) return null;
    return buildConfirmedReportFeedbackPreview({
      actor,
      caseId,
      cases,
      enterprises,
      users,
      existingFeedbacks: feedbacks,
    });
  }, [open, caseId, actor, cases, enterprises, users, feedbacks]);

  const isRoleAuthorized = Boolean(
    actor && actor.role === "SME Admin" && Boolean(actor.enterpriseId),
  );
  const isScopeAuthorized = Boolean(
    isRoleAuthorized && previewResult && previewResult.ok,
  );
  const existingFeedback =
    previewResult && previewResult.ok ? previewResult.existingFeedback : undefined;

  // Wipe unsent comment and close immediately without discard prompt on actor/role/tenant loss.
  useEffect(() => {
    setSmeComment("");
    setDiscardPromptOpen(false);
    setSubmitError(null);
    setStorageWarning(null);
    setIsSubmitting(false);
  }, [actor?.id, actor?.role, actor?.enterpriseId, caseId, open]);

  useEffect(() => {
    if (!open) return;
    if (
      !actor ||
      actor.role !== "SME Admin" ||
      !actor.enterpriseId ||
      (previewResult &&
        !previewResult.ok &&
        (previewResult.code === "FORBIDDEN_ROLE" ||
          previewResult.code === "FORBIDDEN_TENANT" ||
          previewResult.code === "FORBIDDEN_READ"))
    ) {
      setSmeComment("");
      setDiscardPromptOpen(false);
      setSubmitError(null);
      setStorageWarning(null);
      onClose();
    }
  }, [open, actor, previewResult, onClose]);

  const isDirty = Boolean(
    open &&
      isScopeAuthorized &&
      !existingFeedback &&
      smeComment.trim().length > 0,
  );

  const handleRequestClose = () => {
    if (isDirty) {
      setDiscardPromptOpen(true);
      return;
    }
    setSmeComment("");
    setDiscardPromptOpen(false);
    setSubmitError(null);
    setStorageWarning(null);
    onClose();
  };

  const handleConfirmDiscard = () => {
    setSmeComment("");
    setDiscardPromptOpen(false);
    setSubmitError(null);
    setStorageWarning(null);
    onClose();
  };

  const dialogRef = useDialogFocus(
    Boolean(open && isRoleAuthorized && previewResult !== null),
    handleRequestClose,
  );

  if (!open || !caseId || !actor || !isRoleAuthorized || !previewResult) {
    return null;
  }

  if (!previewResult.ok) {
    return (
      <div className={styles.feedbackModalOverlay} onClick={handleRequestClose}>
        <div
          ref={dialogRef}
          className={styles.feedbackModalDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wf04-feedback-modal-title"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.builderHeader}>
            <div>
              <h2 id="wf04-feedback-modal-title" className={styles.builderTitle}>
                {t.wf04Phase2c.smeFeedback.modalSendTitle}
              </h2>
            </div>
            <button
              type="button"
              className={styles.drawerCloseBtn}
              onClick={handleRequestClose}
              aria-label={t.wf04Phase2c.smeFeedback.closeBtn}
            >
              ✕
            </button>
          </div>
          <div className={styles.builderBody}>
            <div className={styles.modalErrorBanner} role="alert">
              {mapFeedbackErrorMessage(previewResult.code, previewResult.message, t)}
            </div>
          </div>
          <div className={styles.builderFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleRequestClose}
            >
              {t.wf04Phase2c.smeFeedback.closeBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const snap = existingFeedback ? existingFeedback.snapshot : previewResult.snapshot;

  const handleConfirmSend = () => {
    if (existingFeedback || !onSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setStorageWarning(null);
    const trimmed = smeComment.trim();
    const outcome = onSubmit({
      caseId: snap.caseId,
      expectedReportId: snap.reportId,
      expectedReportVersion: snap.reportVersion,
      ...(trimmed ? { smeComment: trimmed } : {}),
    });
    setIsSubmitting(false);

    if (!outcome.ok) {
      setSubmitError(mapFeedbackErrorMessage(outcome.code, outcome.error, t));
      return;
    }

    setSmeComment("");
    setDiscardPromptOpen(false);
    if (!outcome.persisted) {
      setStorageWarning(t.wf04Phase2c.errors.storageSaveFailed);
      return;
    }

    toast(
      "success",
      t.wf04Phase2c.smeFeedback.sendSuccessToast
        .replace("{code}", snap.caseId)
        .replace("{version}", String(snap.reportVersion)),
    );
  };

  return (
    <div className={styles.feedbackModalOverlay} onClick={handleRequestClose}>
      <div
        ref={dialogRef}
        className={styles.feedbackModalDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wf04-feedback-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.builderHeader}>
          <div>
            <h2 id="wf04-feedback-modal-title" className={styles.builderTitle}>
              {existingFeedback
                ? t.wf04Phase2c.smeFeedback.modalViewTitle
                    .replace("{code}", snap.caseId)
                    .replace("{version}", String(snap.reportVersion))
                : t.wf04Phase2c.smeFeedback.modalSendTitle}
            </h2>
            <p className={styles.muted} style={{ margin: "4px 0 0" }}>
              {existingFeedback
                ? t.wf04Phase2c.smeFeedback.modalViewSubtitle
                : t.wf04Phase2c.smeFeedback.modalSendSubtitle
                    .replace("{code}", snap.caseId)
                    .replace("{version}", String(snap.reportVersion))}
            </p>
          </div>
          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={handleRequestClose}
            aria-label={t.wf04Phase2c.smeFeedback.closeBtn}
          >
            ✕
          </button>
        </div>

        <div className={styles.builderBody}>
          {submitError && (
            <div className={styles.modalErrorBanner} role="alert" style={{ marginBottom: 14 }}>
              {submitError}
            </div>
          )}

          {storageWarning && (
            <div className={styles.modalErrorBanner} role="alert" style={{ marginBottom: 14 }}>
              {storageWarning}
            </div>
          )}

          {discardPromptOpen && isDirty && (
            <div
              className={styles.discardConfirmPanel}
              role="region"
              aria-live="polite"
              style={{ marginBottom: 14 }}
            >
              <div>
                <strong>{t.wf04Phase2c.smeFeedback.discardConfirmTitle}</strong>
                <p style={{ margin: "4px 0 0" }}>
                  {t.wf04Phase2c.smeFeedback.discardConfirmMessage}
                </p>
              </div>
              <div className={styles.feedbackActionRow}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setDiscardPromptOpen(false)}
                >
                  {t.wf04Phase2c.smeFeedback.keepEditingBtn}
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleConfirmDiscard}
                >
                  {t.wf04Phase2c.smeFeedback.discardConfirmBtn}
                </button>
              </div>
            </div>
          )}

          {existingFeedback ? (
            <div className={styles.feedbackSentBanner} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={16} aria-hidden="true" />
                <strong>{t.wf04Phase2c.smeFeedback.sentBadge}</strong>
              </div>
              <span>
                {t.wf04Phase2c.smeFeedback.sentMetaLabel
                  .replace(
                    "{actor}",
                    existingFeedback.submittedBy.name ||
                      existingFeedback.submittedBy.actorId,
                  )
                  .replace(
                    "{time}",
                    formatDateTime(existingFeedback.submittedAt, dateLocale),
                  )}
              </span>
            </div>
          ) : (
            <>
              <div className={styles.drawerReadOnlyNotice} style={{ marginBottom: 10 }}>
                {t.wf04Phase2c.smeFeedback.previewNotice}
              </div>
              <div className={styles.feedbackLocalNote} style={{ marginBottom: 10 }}>
                {t.wf04Phase2c.smeFeedback.localDemoNotice}
              </div>
              <div className={styles.reportDraftNotice} style={{ marginBottom: 14 }}>
                <span>{t.wf04Phase2c.smeFeedback.draftInMemoryNote}</span>
              </div>
            </>
          )}

          <div className={styles.feedbackMetaStrip} style={{ marginBottom: 14 }}>
            <div className={styles.feedbackMetaItem}>
              <span className={styles.feedbackMetaLabel}>
                {t.wf04Phase2c.smeFeedback.enterpriseLabel}
              </span>
              <strong className={styles.feedbackMetaValue}>{snap.enterpriseName}</strong>
            </div>
            <div className={styles.feedbackMetaItem}>
              <span className={styles.feedbackMetaLabel}>
                {t.wf04Phase2c.smeFeedback.caseCodeLabel}
              </span>
              <strong className={styles.feedbackMetaValue}>{snap.caseId}</strong>
            </div>
            <div className={styles.feedbackMetaItem}>
              <span className={styles.feedbackMetaLabel}>
                {t.wf04Phase2c.smeFeedback.reportVersionLabel}
              </span>
              <strong className={styles.feedbackMetaValue}>
                v{snap.reportVersion} ({snap.reportId})
              </strong>
            </div>
            <div className={styles.feedbackMetaItem}>
              <span className={styles.feedbackMetaLabel}>
                {t.wf04Phase2c.smeFeedback.confirmedByLabel}
              </span>
              <strong className={styles.feedbackMetaValue}>
                {snap.confirmedBy.name || snap.confirmedBy.actorId}
              </strong>
            </div>
            <div className={styles.feedbackMetaItem}>
              <span className={styles.feedbackMetaLabel}>
                {t.wf04Phase2c.smeFeedback.confirmedAtLabel}
              </span>
              <strong className={styles.feedbackMetaValue}>
                {formatDateTime(snap.confirmedAt, dateLocale)}
              </strong>
            </div>
            {existingFeedback && (
              <>
                <div className={styles.feedbackMetaItem}>
                  <span className={styles.feedbackMetaLabel}>
                    {t.wf04Phase2c.smeFeedback.submittedByLabel}
                  </span>
                  <strong className={styles.feedbackMetaValue}>
                    {existingFeedback.submittedBy.name ||
                      existingFeedback.submittedBy.actorId}
                  </strong>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <span className={styles.feedbackMetaLabel}>
                    {t.wf04Phase2c.smeFeedback.submittedAtLabel}
                  </span>
                  <strong className={styles.feedbackMetaValue}>
                    {formatDateTime(existingFeedback.submittedAt, dateLocale)}
                  </strong>
                </div>
              </>
            )}
          </div>

          <div className={styles.confirmReviewPanel} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={14} aria-hidden="true" />
              <strong>{t.wf04Phase2c.smeFeedback.reportSummaryHeading}</strong>
            </div>
            <p style={{ margin: 0 }}>{snap.reportSummary}</p>

            <strong style={{ marginTop: 6 }}>
              {t.wf04Phase2c.smeFeedback.conclusionSummaryHeading}
            </strong>
            <p style={{ margin: 0 }}>{snap.conclusionSummary}</p>

            <strong style={{ marginTop: 6 }}>
              {t.wf04Phase2c.smeFeedback.perAlertHeading.replace(
                "{count}",
                String(snap.alertResults.length),
              )}
            </strong>
            <div className={styles.reportAlertList}>
              {snap.alertResults.map((item) => (
                <div key={item.alertId} className={styles.reportAlertResultRow}>
                  <div>
                    {item.alertName && <strong>{item.alertName}</strong>}
                    <div className={styles.muted}>
                      {t.wf04Phase2c.smeFeedback.alertMetaLabel
                        .replace("{alertId}", item.alertId)
                        .replace("{txRef}", item.transactionReference)
                        .replace("{project}", item.projectName)}
                    </div>
                    <span className={styles.ruleTag} style={{ marginTop: 4 }}>
                      {t.wf04Phase2c.smeFeedback.scoringSourceAiLabel}
                    </span>
                  </div>
                  <div>
                    <div className={styles.muted} style={{ fontSize: 11 }}>
                      {t.wf04Phase2c.smeFeedback.alertResultLabel}
                    </div>
                    <div>{item.resultText}</div>
                  </div>
                  <div>
                    <div className={styles.muted} style={{ fontSize: 11 }}>
                      {t.wf04Phase2c.smeFeedback.alertEvidenceLabel}
                    </div>
                    <div>{item.evidence}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {existingFeedback ? (
            <div className={styles.reportFieldGroup}>
              <span className={styles.reportFieldLabel}>
                {t.wf04Phase2c.smeFeedback.commentReadOnlyLabel}
              </span>
              <div className={styles.feedbackCommentReadOnly}>
                {existingFeedback.smeComment || t.wf04Phase2c.smeFeedback.noCommentText}
              </div>
            </div>
          ) : (
            <div className={styles.reportFieldGroup}>
              <label htmlFor="wf04-sme-feedback-comment" className={styles.reportFieldLabel}>
                {t.wf04Phase2c.smeFeedback.commentLabel}
              </label>
              <textarea
                id="wf04-sme-feedback-comment"
                rows={3}
                maxLength={2000}
                className={styles.feedbackCommentBox}
                placeholder={t.wf04Phase2c.smeFeedback.commentPlaceholder}
                value={smeComment}
                onChange={(e) => setSmeComment(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={styles.builderFooter}>
          {existingFeedback ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleRequestClose}
            >
              {t.wf04Phase2c.smeFeedback.closeBtn}
            </button>
          ) : (
            <div className={styles.feedbackActionRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleRequestClose}
              >
                {t.wf04Phase2c.smeFeedback.cancelBtn}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={isSubmitting || !onSubmit}
                onClick={handleConfirmSend}
              >
                <Send size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                {isSubmitting
                  ? t.wf04Phase2c.smeFeedback.sendingBtn
                  : t.wf04Phase2c.smeFeedback.confirmSendBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
