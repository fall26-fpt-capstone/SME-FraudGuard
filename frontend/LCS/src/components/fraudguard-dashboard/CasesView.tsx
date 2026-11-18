"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { Enterprise } from "@/types/enterprise";
import type {
  RolePermissions,
  TransactionRisk,
  UserProfile,
  UserRole,
} from "@/types/fraudguard";
import type {
  ConfirmedInvestigationReportView,
  InvestigationCase,
  InvestigationCaseEvent,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import type {
  ConfirmInvestigationReportCommandArgs,
  InvestigationActionOutcome,
  RequestInvestigationRevisionCommandArgs,
  SubmitConfirmedReportFeedbackCommandArgs,
  SubmitFeedbackOutcome,
  SubmitInvestigationReportCommandArgs,
} from "@/hooks/useInvestigationCases";
import { type LegacyCaseArchiveEntry } from "@/utils/case-migration";
import {
  readConfirmedInvestigationReport,
  readInternalInvestigationCase,
} from "@/utils/investigation-case";
import { findFeedbackForConfirmedReport } from "@/utils/report-feedback";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastProvider";
import type { TranslationKey } from "@/config/translations";
import {
  buildReportDraftBaseline,
  buildReportDraftScopeKey,
  CaseReportWorkflowPanel,
  isReportDraftDirty,
  mapPhase2bErrorMessage,
  type PendingModalLeaveAction,
  type ReportDraftState,
} from "./CaseReportWorkflowPanel";
import { ReportFeedbackModal } from "./ReportFeedbackModal";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { ScoringSourceBadge } from "./ScoringSourceBadge";
import styles from "./SecurityDashboard.module.css";

type QueueStatusFilter = "all" | InvestigationCaseStatus;

export interface CasesViewProps {
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveEntry[];
  transactions: TransactionRisk[];
  enterprises?: readonly Enterprise[];
  investigatorUsers?: readonly UserProfile[];
  users?: readonly UserProfile[];
  investigators?: string[];
  permissions?: RolePermissions;
  currentUser?: UserProfile;
  currentRole?: UserRole;
  currentUserName?: string;
  currentUserId?: string;
  selectedCaseId?: string | null;
  onSelectCaseId?: (caseId: string | null) => void;
  onAssignInvestigator?: (
    caseId: string,
    assigneeId: string,
  ) => InvestigationActionOutcome;
  onSelfAssignCase?: (caseId: string) => InvestigationActionOutcome;
  onSubmitReport?: (
    args: SubmitInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  onRequestRevision?: (
    args: RequestInvestigationRevisionCommandArgs,
  ) => InvestigationActionOutcome;
  onConfirmAndCloseReport?: (
    args: ConfirmInvestigationReportCommandArgs,
  ) => InvestigationActionOutcome;
  reportFeedbacks?: readonly InvestigationReportFeedback[];
  onSubmitReportFeedback?: (
    args: SubmitConfirmedReportFeedbackCommandArgs,
  ) => SubmitFeedbackOutcome;
  onReviewTransaction?: (tx: TransactionRisk) => void;
  onReview?: (tx: TransactionRisk) => void;
  onUpdateTransaction?: (updated: TransactionRisk) => void;
  wf04DemoActive?: boolean;
  onLoadWf04Demo?: () => void;
  onRestorePreDemo?: () => void;
}

function getCaseStatusBadgeClass(status: InvestigationCaseStatus): string {
  switch (status) {
    case "Open":
      return styles.caseStatusBadgeOpen;
    case "Investigating":
      return styles.caseStatusBadgeInvestigating;
    case "Pending Review":
      return styles.caseStatusBadgePendingReview;
    case "Closed":
      return styles.caseStatusBadgeClosed;
  }
}

function getCaseStatusLabel(
  status: InvestigationCaseStatus,
  t: TranslationKey,
): string {
  switch (status) {
    case "Open":
      return t.wf04Phase2a.caseQueue.statuses.open;
    case "Investigating":
      return t.wf04Phase2a.caseQueue.statuses.investigating;
    case "Pending Review":
      return t.wf04Phase2a.caseQueue.statuses.pendingReview;
    case "Closed":
      return t.wf04Phase2a.caseQueue.statuses.closed;
  }
}

function getTimelineEventLabel(
  event: InvestigationCaseEvent,
  t: TranslationKey,
): string {
  switch (event.type) {
    case "CASE_CREATED":
      return t.wf04Phase2a.auditActions.caseCreated;
    case "INVESTIGATOR_ASSIGNED":
      return t.wf04Phase2a.auditActions.investigatorAssigned;
    case "OPERATOR_SELF_ASSIGNED":
      return t.wf04Phase2a.auditActions.operatorSelfAssigned;
    case "REPORT_SUBMITTED":
      return t.wf04Phase2b.versionViewer.eventReportSubmitted.replace(
        "{version}",
        String(event.reportVersion ?? 1),
      );
    case "REVISION_REQUESTED":
      return t.wf04Phase2b.versionViewer.eventRevisionRequested.replace(
        "{version}",
        String(event.reportVersion ?? 1),
      );
    case "REPORT_CONFIRMED_AND_CLOSED":
      return t.wf04Phase2b.versionViewer.eventConfirmedClosed.replace(
        "{version}",
        String(event.reportVersion ?? 1),
      );
    default:
      return t.wf04Phase2a.auditActions.caseStatusUpdated;
  }
}

function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return "-";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(locale);
}

export interface CaseProcessingHistoryRow {
  readonly eventId: string;
  readonly eventLabel: string;
  readonly actorName: string;
  readonly dateTimeText: string;
  readonly reason?: string;
  readonly note?: string;
}

const HISTORY_INLINE_DETAIL_MAX_LENGTH = 140;

export function buildCaseProcessingHistoryRows(args: {
  readonly history: readonly InvestigationCaseEvent[];
  readonly resolveActorName: (actorRef?: { actorId: string; name?: string }) => string;
  readonly dateLocale: string;
  readonly t: TranslationKey;
}): CaseProcessingHistoryRow[] {
  const { history, resolveActorName, dateLocale, t } = args;
  const sorted = history
    .map((evt, originalIndex) => ({
      evt,
      originalIndex,
      parsedMs: Date.parse(evt.at),
    }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.parsedMs);
      const bValid = Number.isFinite(b.parsedMs);
      if (aValid && bValid && a.parsedMs !== b.parsedMs) {
        return a.parsedMs - b.parsedMs;
      }
      return a.originalIndex - b.originalIndex;
    });

  return sorted.map(({ evt, parsedMs }) => {
    let dateTimeText = "-";
    if (Number.isFinite(parsedMs)) {
      const dateObj = new Date(parsedMs);
      const dateText = dateObj.toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeText = dateObj.toLocaleTimeString(dateLocale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      dateTimeText = `${dateText} ${timeText}`;
    } else if (evt.at) {
      dateTimeText = evt.at;
    }

    const reason = evt.reason?.trim() || undefined;
    const note = evt.note?.trim() || undefined;

    return {
      eventId: evt.eventId,
      eventLabel: getTimelineEventLabel(evt, t),
      actorName: evt.actor ? resolveActorName(evt.actor) : "-",
      dateTimeText,
      ...(reason ? { reason } : {}),
      ...(note ? { note } : {}),
    };
  });
}

export function CasesView({
  investigationCases = [],
  transactions,
  enterprises = [],
  investigatorUsers = [],
  users = [],
  permissions,
  currentUser,
  currentRole,
  currentUserName,
  currentUserId,
  selectedCaseId,
  onSelectCaseId,
  onAssignInvestigator,
  onSelfAssignCase,
  onSubmitReport,
  onRequestRevision,
  onConfirmAndCloseReport,
  reportFeedbacks = [],
  onSubmitReportFeedback,
  onReviewTransaction,
  onReview,
}: CasesViewProps) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const dateLocale = language === "vi" ? "vi-VN" : "en-US";

  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeDraftByCase, setAssigneeDraftByCase] = useState<Record<string, string>>({});
  const [internalSelectedCaseId, setInternalSelectedCaseId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
  const [draftsByScopeKey, setDraftsByScopeKey] = useState<
    Record<string, ReportDraftState>
  >({});
  const [pendingLeaveAction, setPendingLeaveAction] =
    useState<PendingModalLeaveAction | null>(null);
  const [feedbackModalCaseId, setFeedbackModalCaseId] = useState<string | null>(null);

  const openAlertInspection = onReviewTransaction ?? onReview;
  const activeCaseId =
    selectedCaseId !== undefined ? selectedCaseId : internalSelectedCaseId;

  const setActiveCaseId = (caseId: string | null) => {
    setActionError(null);
    if (onSelectCaseId) {
      onSelectCaseId(caseId);
    } else {
      setInternalSelectedCaseId(caseId);
    }
  };

  const mergedUsers = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) map.set(u.id, u);
    for (const u of investigatorUsers) map.set(u.id, u);
    return Array.from(map.values());
  }, [users, investigatorUsers]);

  const effectiveActor = useMemo<UserProfile | undefined>(() => {
    if (currentUser) return currentUser;
    if (currentUserId) {
      const matched = mergedUsers.find((u) => u.id === currentUserId);
      if (matched) return matched;
    }
    if (!currentRole) return undefined;
    return {
      id: currentUserId ?? "",
      name: currentUserName ?? "",
      email: "",
      role: currentRole,
      title: "",
      avatarLetter: "",
      avatarBg: "",
      description: "",
    };
  }, [currentUser, currentUserId, currentUserName, currentRole, mergedUsers]);

  const userById = useMemo(() => {
    return new Map(mergedUsers.map((u) => [u.id, u]));
  }, [mergedUsers]);

  const enterpriseNameById = useMemo(() => {
    return new Map(enterprises.map((e) => [e.id, e.name]));
  }, [enterprises]);

  const txLookup = useMemo(() => {
    const byId = new Map<string, TransactionRisk>();
    const byAlertId = new Map<string, TransactionRisk>();
    for (const tx of transactions) {
      byId.set(tx.id, tx);
      if (tx.alertId) byAlertId.set(tx.alertId, tx);
    }
    return { byId, byAlertId };
  }, [transactions]);

  const resolveActorDisplayName = (actorRef?: { actorId: string; name?: string }): string => {
    if (!actorRef) return t.wf04Phase2a.caseQueue.unassignedLabel;
    return userById.get(actorRef.actorId)?.name || actorRef.name || actorRef.actorId;
  };

  const isNoAccessRole =
    !effectiveActor ||
    !effectiveActor.enterpriseId ||
    ["Platform Admin", "Implementation Staff", "Viewer"].includes(effectiveActor.role);

  const isSmeAdmin = !isNoAccessRole && effectiveActor?.role === "SME Admin";
  const isOperator =
    !isNoAccessRole &&
    effectiveActor?.role === "Operator" &&
    permissions?.canManageCases !== false;
  const isInvestigator = !isNoAccessRole && effectiveActor?.role === "Investigator";

  const authorizedInternalCases = useMemo<InvestigationCase[]>(() => {
    if (isNoAccessRole || isSmeAdmin || !effectiveActor) return [];
    const list: InvestigationCase[] = [];
    for (const c of investigationCases) {
      const res = readInternalInvestigationCase({
        investigationCase: c,
        actor: effectiveActor,
      });
      if (res.ok) list.push(res.investigationCase);
    }
    return list.sort(
      (a, b) =>
        (Date.parse(b.updatedAt || b.createdAt) || 0) -
        (Date.parse(a.updatedAt || a.createdAt) || 0),
    );
  }, [isNoAccessRole, isSmeAdmin, effectiveActor, investigationCases]);

  const authorizedConfirmedReports = useMemo<ConfirmedInvestigationReportView[]>(() => {
    if (isNoAccessRole || !isSmeAdmin || !effectiveActor) return [];
    const list: ConfirmedInvestigationReportView[] = [];
    for (const c of investigationCases) {
      const res = readConfirmedInvestigationReport({
        investigationCase: c,
        actor: effectiveActor,
      });
      if (res.ok) list.push(res.view);
    }
    return list.sort(
      (a, b) =>
        (Date.parse(b.closedAt || b.updatedAt) || 0) -
        (Date.parse(a.closedAt || a.updatedAt) || 0),
    );
  }, [isNoAccessRole, isSmeAdmin, effectiveActor, investigationCases]);

  const authorizedDetail = useMemo<
    | { mode: "internal"; item: InvestigationCase }
    | { mode: "confirmed"; item: ConfirmedInvestigationReportView }
    | null
  >(() => {
    if (!activeCaseId || isNoAccessRole || !effectiveActor) return null;
    if (isSmeAdmin) {
      const match = authorizedConfirmedReports.find((v) => v.caseId === activeCaseId);
      return match ? { mode: "confirmed", item: match } : null;
    }
    const match = authorizedInternalCases.find((c) => c.caseId === activeCaseId);
    return match ? { mode: "internal", item: match } : null;
  }, [
    activeCaseId,
    isNoAccessRole,
    effectiveActor,
    isSmeAdmin,
    authorizedConfirmedReports,
    authorizedInternalCases,
  ]);

  const activeInternalCase =
    authorizedDetail?.mode === "internal" ? authorizedDetail.item : null;
  const isAuthorableActiveCase = Boolean(
    activeInternalCase &&
      effectiveActor &&
      activeInternalCase.status === "Investigating" &&
      activeInternalCase.enterpriseId === effectiveActor.enterpriseId &&
      activeInternalCase.assignee?.actorId === effectiveActor.id &&
      (effectiveActor.role === "Investigator" || effectiveActor.role === "Operator"),
  );
  const activeLatestReport =
    activeInternalCase && activeInternalCase.reports.length > 0
      ? activeInternalCase.reports[activeInternalCase.reports.length - 1]
      : undefined;
  const activeBaseVersion = activeLatestReport ? activeLatestReport.version : 0;
  const activeScopeKey =
    activeInternalCase && effectiveActor
      ? buildReportDraftScopeKey(
          activeInternalCase.caseId,
          effectiveActor.id,
          activeBaseVersion,
        )
      : null;
  const isActiveDraftDirty = Boolean(
    isAuthorableActiveCase &&
      activeInternalCase &&
      activeScopeKey &&
      isReportDraftDirty(draftsByScopeKey[activeScopeKey], activeInternalCase),
  );

  // Isolate drafts strictly by actor/role/enterprise and drop immediately when role/tenant switches.
  useEffect(() => {
    setDraftsByScopeKey({});
    setPendingLeaveAction(null);
    setActionError(null);
    setFeedbackModalCaseId(null);
  }, [effectiveActor?.id, effectiveActor?.role, effectiveActor?.enterpriseId]);

  useEffect(() => {
    if (!isSmeAdmin || !activeCaseId) {
      setFeedbackModalCaseId(null);
    }
  }, [isSmeAdmin, activeCaseId]);

  useEffect(() => {
    if (!isAuthorableActiveCase) {
      setPendingLeaveAction(null);
    }
  }, [isAuthorableActiveCase]);

  // Clear modal immediately if role/user/tenant switches away from authorized scope.
  useEffect(() => {
    if (activeCaseId && !authorizedDetail) {
      if (onSelectCaseId) {
        onSelectCaseId(null);
      } else {
        setInternalSelectedCaseId(null);
      }
      setPendingLeaveAction(null);
      setActionError(null);
    }
  }, [activeCaseId, authorizedDetail, onSelectCaseId]);

  const handleCloseModal = () => {
    if (isAuthorableActiveCase && isActiveDraftDirty) {
      setPendingLeaveAction({ type: "close" });
      return;
    }
    setPendingLeaveAction(null);
    setActiveCaseId(null);
  };

  const requestOpenCaseId = (targetCaseId: string) => {
    if (
      activeCaseId &&
      activeCaseId !== targetCaseId &&
      isAuthorableActiveCase &&
      isActiveDraftDirty
    ) {
      setPendingLeaveAction({ type: "switch", caseId: targetCaseId });
      return;
    }
    setPendingLeaveAction(null);
    setActiveCaseId(targetCaseId);
  };

  const handleConfirmLeaveWithDiscard = (scopeKeyToClear: string) => {
    const leaveAction = pendingLeaveAction;
    setDraftsByScopeKey((prev) => {
      if (!(scopeKeyToClear in prev)) return prev;
      const next = { ...prev };
      delete next[scopeKeyToClear];
      return next;
    });
    setPendingLeaveAction(null);
    setActionError(null);
    if (leaveAction?.type === "switch") {
      setActiveCaseId(leaveAction.caseId);
    } else {
      setActiveCaseId(null);
    }
  };

  const detailModalRef = useDialogFocus(Boolean(authorizedDetail), handleCloseModal);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredInternalCases = useMemo(() => {
    return authorizedInternalCases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const assigneeText = resolveActorDisplayName(c.assignee).toLowerCase();
      const enterpriseText = (enterpriseNameById.get(c.enterpriseId) ?? c.enterpriseId).toLowerCase();
      const alertText = c.alerts
        .map((a) => `${a.alertId} ${a.transactionReference}`)
        .join(" ")
        .toLowerCase();
      return (
        c.caseId.toLowerCase().includes(normalizedQuery) ||
        assigneeText.includes(normalizedQuery) ||
        enterpriseText.includes(normalizedQuery) ||
        alertText.includes(normalizedQuery)
      );
    });
  }, [authorizedInternalCases, statusFilter, normalizedQuery, enterpriseNameById, userById, t]);

  const filteredConfirmedReports = useMemo(() => {
    return authorizedConfirmedReports.filter((view) => {
      if (!normalizedQuery) return true;
      const enterpriseText = (
        enterpriseNameById.get(view.enterpriseId) ?? view.enterpriseId
      ).toLowerCase();
      const alertText = view.alerts
        .map((a) => `${a.alertId} ${a.transactionReference}`)
        .join(" ")
        .toLowerCase();
      return (
        view.caseId.toLowerCase().includes(normalizedQuery) ||
        view.conclusion.summary.toLowerCase().includes(normalizedQuery) ||
        enterpriseText.includes(normalizedQuery) ||
        alertText.includes(normalizedQuery)
      );
    });
  }, [authorizedConfirmedReports, normalizedQuery, enterpriseNameById]);

  const internalCounts = useMemo(() => {
    return {
      all: authorizedInternalCases.length,
      open: authorizedInternalCases.filter((c) => c.status === "Open").length,
      investigating: authorizedInternalCases.filter((c) => c.status === "Investigating").length,
      pendingReview: authorizedInternalCases.filter((c) => c.status === "Pending Review").length,
      closed: authorizedInternalCases.filter((c) => c.status === "Closed").length,
    };
  }, [authorizedInternalCases]);

  const getTenantInvestigators = (enterpriseId: string): UserProfile[] => {
    const source = investigatorUsers.length > 0 ? investigatorUsers : mergedUsers;
    return source.filter(
      (u) => u.role === "Investigator" && u.enterpriseId === enterpriseId,
    );
  };

  const handleAssignSubmit = (caseId: string) => {
    if (!onAssignInvestigator) return;
    const targetAssigneeId = assigneeDraftByCase[caseId];
    if (!targetAssigneeId) return;
    setBusyCaseId(caseId);
    setActionError(null);
    const outcome = onAssignInvestigator(caseId, targetAssigneeId);
    setBusyCaseId(null);
    if (!outcome.ok) {
      const msg = mapPhase2bErrorMessage(outcome.code, outcome.error, t);
      setActionError(msg);
      toast("error", msg);
      return;
    }
    toast(
      "success",
      language === "vi"
        ? `Đã phân công hồ sơ ${caseId} và chuyển sang Đang điều tra.`
        : `Assigned case ${caseId} and moved to Investigating.`,
    );
  };

  const handleSelfAssignSubmit = (caseId: string) => {
    if (!onSelfAssignCase) return;
    setBusyCaseId(caseId);
    setActionError(null);
    const outcome = onSelfAssignCase(caseId);
    setBusyCaseId(null);
    if (!outcome.ok) {
      const msg = mapPhase2bErrorMessage(outcome.code, outcome.error, t);
      setActionError(msg);
      toast("error", msg);
      return;
    }
    toast(
      "success",
      language === "vi"
        ? `Đã tự nhận hồ sơ ${caseId} để điều tra.`
        : `Self-assigned case ${caseId} to start investigation.`,
    );
  };

  if (isNoAccessRole) {
    return (
      <>
        <div className={styles.pageHeading}>
          <div>
            <h1>{t.caseQueue.opTitle}</h1>
            <p>{t.caseQueue.opSubtitle}</p>
          </div>
        </div>

        <div
          className={`${styles.roleNoticeBanner} ${
            effectiveActor?.role === "Platform Admin"
              ? styles.roleNoticePlatformAdmin
              : effectiveActor?.role === "Implementation Staff"
                ? styles.roleNoticeRiskStaff
                : styles.roleNoticeViewer
          }`}
        >
          <div className={styles.roleNoticeLeft}>
            <ShieldAlert size={18} className={styles.roleNoticeIcon} aria-hidden="true" />
            <div>
              <strong>{t.wf04Phase2a.caseQueue.noInternalAccessTitle}</strong>
              <p style={{ margin: "4px 0 0" }}>
                {t.wf04Phase2a.caseQueue.noInternalAccessDesc}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const renderCaseDetailModal = () => {
    if (!authorizedDetail) return null;

    if (authorizedDetail.mode === "confirmed") {
      const view = authorizedDetail.item;
      const existingFeedback = findFeedbackForConfirmedReport({
        feedbacks: reportFeedbacks,
        enterpriseId: view.enterpriseId,
        caseId: view.caseId,
        reportId: view.conclusion.reportId,
        reportVersion: view.conclusion.reportVersion,
      });
      return (
        <div className={styles.builderOverlay}>
          <div
            ref={detailModalRef}
            className={`${styles.builderModal} ${styles.caseDetailModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wf04-case-detail-title"
            tabIndex={-1}
          >
            <div className={styles.builderHeader}>
              <div>
                <h2 id="wf04-case-detail-title" className={styles.builderTitle}>
                  {t.wf04Phase2a.caseQueue.detailModalTitle.replace("{code}", view.caseId)}
                </h2>
                <span className={styles.muted}>
                  {enterpriseNameById.get(view.enterpriseId) ?? view.enterpriseId}
                </span>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={handleCloseModal}
                aria-label={t.wf04Phase2a.caseQueue.closeModalBtn}
              >
                ✕
              </button>
            </div>

            <div className={styles.builderBody}>
              <div className={styles.roleNoticeBanner} style={{ marginBottom: 14 }}>
                <div className={styles.roleNoticeLeft}>
                  <span>{t.wf04Phase2a.caseQueue.smeAdminConfirmedOnlyNotice}</span>
                </div>
              </div>

              <div className={styles.caseDetailSection}>
                <h3 className={styles.drawerSectionTitle}>
                  {t.wf04Phase2a.caseQueue.caseSummarySectionTitle}
                </h3>
                <div className={styles.drawerRow}>
                  <span className={styles.drawerLabel}>
                    {t.wf04Phase2a.caseQueue.caseCodeLabel}
                  </span>
                  <strong>{view.caseId}</strong>
                </div>
                <div className={styles.drawerRow}>
                  <span className={styles.drawerLabel}>
                    {t.wf04Phase2a.caseQueue.statusLabel}
                  </span>
                  <span className={`${styles.badge} ${getCaseStatusBadgeClass(view.status)}`}>
                    {getCaseStatusLabel(view.status, t)}
                  </span>
                </div>
                <div className={styles.drawerRow}>
                  <span className={styles.drawerLabel}>
                    {t.wf04Phase2a.caseQueue.updatedAtLabel}
                  </span>
                  <span>{formatDateTime(view.closedAt || view.updatedAt, dateLocale)}</span>
                </div>
              </div>

              <div className={styles.caseDetailSection}>
                <h3 className={styles.drawerSectionTitle}>
                  {t.wf04Phase2a.caseQueue.linkedAlertsSectionTitle.replace(
                    "{count}",
                    String(view.alerts.length),
                  )}
                </h3>
                <div className={styles.caseAlertChipList}>
                  {view.alerts.map((alert) => {
                    const matchedTx =
                      txLookup.byId.get(alert.transactionId) ??
                      txLookup.byAlertId.get(alert.alertId);
                    return (
                      <div key={alert.alertId} className={styles.noteItem}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <strong>{alert.transactionReference}</strong>{" "}
                            <span className={styles.muted}>({alert.alertId})</span>
                            {matchedTx && (
                              <div className={styles.muted} style={{ marginTop: 4 }}>
                                {matchedTx.projectName} · {matchedTx.entityReference}
                              </div>
                            )}
                          </div>
                          {openAlertInspection && matchedTx && (
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => openAlertInspection(matchedTx)}
                            >
                              <Eye size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                              {t.wf04Phase2a.caseQueue.openSourceAlertBtn}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.caseDetailSection}>
                <div className={styles.confirmReviewPanel}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{t.wf04Phase2b.confirmClose.closedBannerTitle}</strong>
                    <span className={styles.reportVersionBadgeConfirmed}>
                      {t.wf04Phase2b.versionViewer.confirmedTag} (v{view.conclusion.reportVersion})
                    </span>
                  </div>
                  <p className={styles.muted} style={{ margin: 0 }}>
                    {t.wf04Phase2b.confirmClose.closedReadOnlyNotice.replace(
                      "{version}",
                      String(view.conclusion.reportVersion),
                    )}
                  </p>
                  <div className={styles.drawerRow}>
                    <span className={styles.drawerLabel}>
                      {t.wf04Phase2b.confirmClose.confirmedByLabel}
                    </span>
                    <strong>{resolveActorDisplayName(view.conclusion.confirmedBy)}</strong>
                  </div>
                  <div className={styles.drawerRow}>
                    <span className={styles.drawerLabel}>
                      {t.wf04Phase2b.confirmClose.confirmedAtLabel}
                    </span>
                    <span>
                      {formatDateTime(view.conclusion.confirmedAt || view.closedAt, dateLocale)}
                    </span>
                  </div>
                  <div className={styles.drawerRow}>
                    <span className={styles.drawerLabel}>
                      {t.wf04Phase2b.confirmClose.confirmedVersionLabel}
                    </span>
                    <span>
                      v{view.conclusion.reportVersion} ({view.conclusion.reportId})
                    </span>
                  </div>
                  <div>
                    <p style={{ margin: "4px 0 4px", fontWeight: 600, fontSize: 13 }}>
                      {t.wf04Phase2b.confirmClose.finalConclusionHeading}
                    </p>
                    <p style={{ margin: 0 }}>{view.conclusion.summary}</p>
                  </div>
                  <div className={styles.reportAlertList}>
                    {view.conclusion.alertResults.map((item) => (
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
            </div>

            <div className={styles.builderFooter}>
              <div className={styles.feedbackActionRow}>
                {existingFeedback ? (
                  <>
                    <span className={styles.feedbackCountBadge}>
                      {t.wf04Phase2c.smeFeedback.sentBadge}
                    </span>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => setFeedbackModalCaseId(view.caseId)}
                    >
                      {t.wf04Phase2c.smeFeedback.viewSentBtn}
                    </button>
                  </>
                ) : (
                  onSubmitReportFeedback && (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => setFeedbackModalCaseId(view.caseId)}
                    >
                      {t.wf04Phase2c.smeFeedback.sendBtn}
                    </button>
                  )
                )}
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleCloseModal}
                >
                  {t.wf04Phase2a.caseQueue.closeModalBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const c = authorizedDetail.item;
    const tenantInvestigators = getTenantInvestigators(c.enterpriseId);
    const selectedAssigneeId = assigneeDraftByCase[c.caseId] ?? "";
    const canAssignHere = isOperator && c.status === "Open";
    const modalScopeKey = effectiveActor
      ? buildReportDraftScopeKey(
          c.caseId,
          effectiveActor.id,
          c.reports.length > 0 ? c.reports[c.reports.length - 1].version : 0,
        )
      : "";
    const modalDraft =
      (modalScopeKey ? draftsByScopeKey[modalScopeKey] : undefined) ??
      buildReportDraftBaseline(c);
    const hasUnsentModalDraft = Boolean(modalScopeKey && draftsByScopeKey[modalScopeKey]);

    return (
      <div className={styles.builderOverlay}>
        <div
          ref={detailModalRef}
          className={`${styles.builderModal} ${styles.caseDetailModal}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wf04-case-detail-title"
          tabIndex={-1}
        >
          <div className={styles.builderHeader}>
            <div>
              <h2 id="wf04-case-detail-title" className={styles.builderTitle}>
                {t.wf04Phase2a.caseQueue.detailModalTitle.replace("{code}", c.caseId)}
              </h2>
              <span className={styles.muted}>
                {enterpriseNameById.get(c.enterpriseId) ?? c.enterpriseId}
              </span>
            </div>
            <button
              type="button"
              className={styles.drawerCloseBtn}
              onClick={handleCloseModal}
              aria-label={t.wf04Phase2a.caseQueue.closeModalBtn}
            >
              ✕
            </button>
          </div>

          <div className={styles.builderBody}>
            {actionError && (
              <div className={styles.modalErrorBanner} role="alert" style={{ marginBottom: 14 }}>
                {actionError}
              </div>
            )}

            {isInvestigator && !isAuthorableActiveCase && (
              <div className={styles.drawerReadOnlyNotice} style={{ marginBottom: 14 }}>
                {t.wf04Phase2a.caseQueue.readOnlyPermissionNotice}
              </div>
            )}

            <div className={styles.caseDetailSection}>
              <h3 className={styles.drawerSectionTitle}>
                {t.wf04Phase2a.caseQueue.caseSummarySectionTitle}
              </h3>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.wf04Phase2a.caseQueue.caseCodeLabel}</span>
                <strong>{c.caseId}</strong>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.wf04Phase2a.caseQueue.statusLabel}</span>
                <span className={`${styles.badge} ${getCaseStatusBadgeClass(c.status)}`}>
                  {getCaseStatusLabel(c.status, t)}
                </span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.wf04Phase2a.caseQueue.createdAtLabel}</span>
                <span>{formatDateTime(c.createdAt, dateLocale)}</span>
              </div>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.wf04Phase2a.caseQueue.updatedAtLabel}</span>
                <span>{formatDateTime(c.updatedAt, dateLocale)}</span>
              </div>
            </div>

            <div className={styles.caseDetailSection}>
              <h3 className={styles.drawerSectionTitle}>
                {t.wf04Phase2a.caseQueue.assignmentSectionTitle}
              </h3>
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.wf04Phase2a.caseQueue.assigneeLabel}</span>
                <strong>{resolveActorDisplayName(c.assignee)}</strong>
              </div>
              {c.assignedBy && (
                <div className={styles.drawerRow}>
                  <span className={styles.drawerLabel}>
                    {t.wf04Phase2a.caseQueue.assignedByLabel}
                  </span>
                  <span>{resolveActorDisplayName(c.assignedBy)}</span>
                </div>
              )}
              {c.assignedAt && (
                <div className={styles.drawerRow}>
                  <span className={styles.drawerLabel}>
                    {t.wf04Phase2a.caseQueue.assignedAtLabel}
                  </span>
                  <span>{formatDateTime(c.assignedAt, dateLocale)}</span>
                </div>
              )}

              {canAssignHere && (
                <div className={styles.caseAssignRow} style={{ marginTop: 12 }}>
                  <label className={styles.filterField} style={{ minWidth: 220 }}>
                    <span className={styles.filterLabel}>
                      {t.wf04Phase2a.caseQueue.assignInvestigatorLabel}
                    </span>
                    <select
                      className={styles.control}
                      aria-label={t.wf04Phase2a.caseQueue.assignInvestigatorLabel}
                      value={selectedAssigneeId}
                      onChange={(e) =>
                        setAssigneeDraftByCase((prev) => ({
                          ...prev,
                          [c.caseId]: e.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {t.wf04Phase2a.caseQueue.selectInvestigatorPlaceholder}
                      </option>
                      {tenantInvestigators.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={!selectedAssigneeId || busyCaseId === c.caseId || !onAssignInvestigator}
                    onClick={() => handleAssignSubmit(c.caseId)}
                  >
                    <UserCheck size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                    {busyCaseId === c.caseId
                      ? t.wf04Phase2a.caseQueue.assigningBtn
                      : t.wf04Phase2a.caseQueue.assignBtn}
                  </button>

                  {onSelfAssignCase && (
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={busyCaseId === c.caseId}
                      onClick={() => handleSelfAssignSubmit(c.caseId)}
                    >
                      <UserPlus size={14} style={{ marginRight: 6 }} aria-hidden="true" />
                      {t.wf04Phase2a.caseQueue.selfAssignBtn}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.caseDetailSection}>
              <h3 className={styles.drawerSectionTitle}>
                {t.wf04Phase2a.caseQueue.linkedAlertsSectionTitle.replace(
                  "{count}",
                  String(c.alerts.length),
                )}
              </h3>
              <div className={styles.caseAlertChipList}>
                {c.alerts.map((alert) => {
                  const matchedTx =
                    txLookup.byId.get(alert.transactionId) ??
                    txLookup.byAlertId.get(alert.alertId);
                  return (
                    <div key={alert.alertId} className={styles.noteItem}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{alert.transactionReference}</strong>{" "}
                          <span className={styles.muted}>({alert.alertId})</span>
                          {matchedTx && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginTop: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              <RiskLevelBadge riskLevel={matchedTx.riskLevel} />
                              <ScoringSourceBadge source={matchedTx.scoringSource} />
                              <span className={styles.muted}>
                                {matchedTx.projectName} · {matchedTx.entityReference}
                              </span>
                            </div>
                          )}
                        </div>
                        {openAlertInspection && matchedTx && (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => openAlertInspection(matchedTx)}
                          >
                            <Eye size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                            {t.wf04Phase2a.caseQueue.openSourceAlertBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {effectiveActor && (
              <CaseReportWorkflowPanel
                investigationCase={c}
                effectiveActor={effectiveActor}
                dateLocale={dateLocale}
                txLookup={txLookup}
                resolveActorDisplayName={resolveActorDisplayName}
                draftState={modalDraft}
                hasExistingUnsentDraft={hasUnsentModalDraft}
                isDirty={isActiveDraftDirty}
                pendingLeaveAction={pendingLeaveAction}
                onDraftChange={(key, nextDraft) =>
                  setDraftsByScopeKey((prev) => ({ ...prev, [key]: nextDraft }))
                }
                onClearDraft={(key) =>
                  setDraftsByScopeKey((prev) => {
                    if (!(key in prev)) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })
                }
                onCancelLeave={() => setPendingLeaveAction(null)}
                onConfirmLeave={handleConfirmLeaveWithDiscard}
                onSubmitReport={onSubmitReport}
                onRequestRevision={onRequestRevision}
                onConfirmAndCloseReport={onConfirmAndCloseReport}
                onOpenSourceAlert={openAlertInspection}
                onActionError={setActionError}
              />
            )}

            <div className={styles.caseDetailSection}>
              <h3 className={styles.drawerSectionTitle}>
                {t.wf04Phase2a.caseQueue.timelineSectionTitle}
              </h3>
              {c.history.length === 0 ? (
                <p className={styles.muted}>{t.wf04Phase2a.caseQueue.timelineEmpty}</p>
              ) : (
                <div className={styles.caseHistoryTableWrap}>
                  <table className={styles.caseHistoryTable}>
                    <thead>
                      <tr>
                        <th scope="col">{t.wf04Phase2a.caseQueue.timelineColEvent}</th>
                        <th scope="col">{t.wf04Phase2a.caseQueue.timelineColPerformedBy}</th>
                        <th scope="col">{t.wf04Phase2a.caseQueue.timelineColDateTime}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildCaseProcessingHistoryRows({
                        history: c.history,
                        resolveActorName: resolveActorDisplayName,
                        dateLocale,
                        t,
                      }).map((row) => {
                        const detailLength =
                          (row.reason?.length ?? 0) + (row.note?.length ?? 0);
                        const hasExtraText = Boolean(row.reason || row.note);
                        const extraContent = hasExtraText ? (
                          <div className={styles.caseHistoryDetailBox}>
                            {row.reason && (
                              <p className={styles.caseTimelineNote}>
                                <strong>{t.wf04Phase2b.versionViewer.revisionReasonLabel}:</strong>{" "}
                                {row.reason}
                              </p>
                            )}
                            {row.note && (
                              <p className={styles.caseTimelineNote}>
                                <strong>{t.wf04Phase2a.caseQueue.timelineNoteLabel}:</strong>{" "}
                                {row.note}
                              </p>
                            )}
                          </div>
                        ) : null;

                        return (
                          <tr key={row.eventId}>
                            <td className={styles.caseHistoryEventCell}>
                              <strong className={styles.caseHistoryEventTitle}>
                                {row.eventLabel}
                              </strong>
                              {hasExtraText &&
                                (detailLength > HISTORY_INLINE_DETAIL_MAX_LENGTH ? (
                                  <details className={styles.caseHistoryDetails}>
                                    <summary className={styles.caseHistorySummary}>
                                      {t.wf04Phase2a.caseQueue.timelineExpandDetailsLabel}
                                    </summary>
                                    {extraContent}
                                  </details>
                                ) : (
                                  extraContent
                                ))}
                            </td>
                            <td className={styles.caseHistoryActorCell}>{row.actorName}</td>
                            <td className={styles.caseHistoryDateTimeCell}>{row.dateTimeText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className={styles.builderFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleCloseModal}
            >
              {t.wf04Phase2a.caseQueue.closeModalBtn}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isSmeAdmin) {
    const hasSearch = normalizedQuery.length > 0;
    return (
      <>
        <div className={styles.pageHeading}>
          <div>
            <h1>{t.caseQueue.opTitle}</h1>
            <p>{t.caseQueue.opSubtitle}</p>
          </div>
        </div>

        <div className={styles.roleNoticeBanner} style={{ marginBottom: 18 }}>
          <div className={styles.roleNoticeLeft}>
            <span>{t.wf04Phase2a.caseQueue.smeAdminConfirmedOnlyNotice}</span>
          </div>
        </div>

        <section className={styles.caseMetricsGrid} style={{ marginBottom: 18 }}>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>{t.wf04Phase2a.caseQueue.statuses.closed}</div>
            <strong className={styles.statValue}>{authorizedConfirmedReports.length}</strong>
            <span className={styles.statDescription}>
              {t.wf04Phase2a.caseQueue.confirmedCasesMetricDesc}
            </span>
          </article>
        </section>

        <section className={`${styles.panel} ${styles.tablePanel}`}>
          <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
            <div>
              <h2>{t.caseQueue.opTitle}</h2>
              <p className={styles.muted}>{t.wf04Phase2a.caseQueue.smeAdminConfirmedOnlyNotice}</p>
            </div>
          </div>

          <div className={styles.tableControls}>
            <div className={styles.toolbarGroup}>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>{t.wf04Phase2a.caseQueue.searchLabel}</span>
                <div className={styles.searchFieldWrap}>
                  <Search size={15} className={styles.searchFieldIcon} aria-hidden="true" />
                  <input
                    type="search"
                    className={styles.searchInput}
                    placeholder={t.wf04Phase2a.caseQueue.searchPlaceholder}
                    aria-label={t.wf04Phase2a.caseQueue.searchLabel}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </label>
              {hasSearch && (
                <button
                  type="button"
                  className={styles.clearFilters}
                  onClick={() => setSearchQuery("")}
                >
                  <RotateCcw size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                  {t.wf04Phase2a.caseQueue.resetFiltersBtn}
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.wf04Phase2a.caseQueue.caseCodeLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.enterpriseLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.alertCountLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.statusLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.reportConclusionLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.updatedAtLabel}</th>
                  <th style={{ textAlign: "right" }}>{t.wf04Phase2a.caseQueue.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {filteredConfirmedReports.length === 0 ? (
                  <tr>
                    <td className={styles.emptyState} colSpan={7}>
                      <div>
                        <p style={{ margin: "0 0 10px" }}>
                          {authorizedConfirmedReports.length === 0
                            ? t.wf04Phase2a.caseQueue.smeAdminEmptyConfirmed
                            : t.wf04Phase2a.caseQueue.filterNoResults}
                        </p>
                        {hasSearch && (
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => setSearchQuery("")}
                          >
                            {t.wf04Phase2a.caseQueue.resetFiltersBtn}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredConfirmedReports.map((view) => {
                    const rowFeedback = findFeedbackForConfirmedReport({
                      feedbacks: reportFeedbacks,
                      enterpriseId: view.enterpriseId,
                      caseId: view.caseId,
                      reportId: view.conclusion.reportId,
                      reportVersion: view.conclusion.reportVersion,
                    });
                    return (
                    <tr key={view.caseId}>
                      <td>
                        <strong>{view.caseId}</strong>
                      </td>
                      <td>{enterpriseNameById.get(view.enterpriseId) ?? view.enterpriseId}</td>
                      <td>
                        <span className={styles.ruleTag}>
                          {t.wf04Phase2a.caseQueue.alertCountBadge.replace(
                            "{count}",
                            String(view.alertIds.length),
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${getCaseStatusBadgeClass(view.status)}`}>
                          {getCaseStatusLabel(view.status, t)}
                        </span>
                        {rowFeedback && (
                          <div style={{ marginTop: 6 }}>
                            <span className={styles.feedbackCountBadge}>
                              {t.wf04Phase2c.smeFeedback.sentBadge}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 320, whiteSpace: "normal" }}>
                        {view.conclusion.summary}
                      </td>
                      <td>{formatDateTime(view.closedAt || view.updatedAt, dateLocale)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => setActiveCaseId(view.caseId)}
                        >
                          <Eye size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                          {t.wf04Phase2a.caseQueue.openCaseDetailBtn}
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {renderCaseDetailModal()}
        <ReportFeedbackModal
          open={Boolean(feedbackModalCaseId && isSmeAdmin)}
          caseId={feedbackModalCaseId}
          actor={effectiveActor}
          cases={investigationCases}
          enterprises={enterprises}
          users={mergedUsers}
          feedbacks={reportFeedbacks}
          onClose={() => setFeedbackModalCaseId(null)}
          onSubmit={onSubmitReportFeedback}
        />
      </>
    );
  }

  const hasFilters = statusFilter !== "all" || normalizedQuery.length > 0;
  const resetQueueFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
  };

  const statusTabs: Array<{ key: QueueStatusFilter; label: string; count: number }> = [
    { key: "all", label: t.wf04Phase2a.caseQueue.tabAll, count: internalCounts.all },
    { key: "Open", label: t.wf04Phase2a.caseQueue.statuses.open, count: internalCounts.open },
    {
      key: "Investigating",
      label: t.wf04Phase2a.caseQueue.statuses.investigating,
      count: internalCounts.investigating,
    },
    {
      key: "Pending Review",
      label: t.wf04Phase2a.caseQueue.statuses.pendingReview,
      count: internalCounts.pendingReview,
    },
    {
      key: "Closed",
      label: t.wf04Phase2a.caseQueue.statuses.closed,
      count: internalCounts.closed,
    },
  ];

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>{isInvestigator ? t.caseQueue.invTitle : t.caseQueue.opTitle}</h1>
          <p>{isInvestigator ? t.caseQueue.invSubtitle : t.caseQueue.opSubtitle}</p>
        </div>
      </div>

      {actionError && (
        <div className={styles.modalErrorBanner} role="alert" style={{ marginBottom: 16 }}>
          {actionError}
        </div>
      )}

      <section className={styles.caseMetricsGrid} style={{ marginBottom: 20 }}>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.wf04Phase2a.caseQueue.tabAll}</div>
          <strong className={styles.statValue}>{internalCounts.all}</strong>
          <span className={styles.statDescription}>
            {t.wf04Phase2a.caseQueue.allCasesMetricDesc}
          </span>
        </article>
        <article className={`${styles.statCard} ${styles.statWarning}`}>
          <div className={styles.statLabel}>{t.wf04Phase2a.caseQueue.statuses.open}</div>
          <strong className={styles.statValue}>{internalCounts.open}</strong>
          <span className={styles.statDescription}>
            {t.wf04Phase2a.caseQueue.statuses.open}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>
            {t.wf04Phase2a.caseQueue.statuses.investigating}
          </div>
          <strong className={styles.statValue} style={{ color: "var(--security-blue)" }}>
            {internalCounts.investigating}
          </strong>
          <span className={styles.statDescription}>
            {t.wf04Phase2a.caseQueue.statuses.investigating}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>
            {t.wf04Phase2a.caseQueue.statuses.pendingReview}
          </div>
          <strong className={styles.statValue} style={{ color: "var(--security-purple)" }}>
            {internalCounts.pendingReview}
          </strong>
          <span className={styles.statDescription}>
            {t.wf04Phase2a.caseQueue.statuses.pendingReview}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.wf04Phase2a.caseQueue.statuses.closed}</div>
          <strong className={styles.statValue} style={{ color: "var(--security-green)" }}>
            {internalCounts.closed}
          </strong>
          <span className={styles.statDescription}>
            {t.wf04Phase2a.caseQueue.statuses.closed}
          </span>
        </article>
      </section>

      <section className={`${styles.panel} ${styles.tablePanel}`}>
        <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
          <div>
            <h2>{isInvestigator ? t.caseQueue.invTitle : t.caseQueue.opTitle}</h2>
            <p className={styles.muted}>{t.wf04Phase2b.reportsView.sectionSubtitle}</p>
          </div>
        </div>

        <div className={styles.tableControls}>
          <div className={styles.tabs} role="tablist" aria-label={t.wf04Phase2a.caseQueue.statusLabel}>
            {statusTabs.map((tabItem) => (
              <button
                key={tabItem.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === tabItem.key}
                className={`${styles.tab} ${statusFilter === tabItem.key ? styles.tabActive : ""}`}
                onClick={() => setStatusFilter(tabItem.key)}
              >
                <span>{tabItem.label}</span>
                <span className={styles.tabCount}>{tabItem.count}</span>
              </button>
            ))}
          </div>

          <div className={styles.toolbarGroup}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.wf04Phase2a.caseQueue.searchLabel}</span>
              <div className={styles.searchFieldWrap}>
                <Search size={15} className={styles.searchFieldIcon} aria-hidden="true" />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder={t.wf04Phase2a.caseQueue.searchPlaceholder}
                  aria-label={t.wf04Phase2a.caseQueue.searchLabel}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>
            {hasFilters && (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={resetQueueFilters}
              >
                <RotateCcw size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                {t.wf04Phase2a.caseQueue.resetFiltersBtn}
              </button>
            )}
          </div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.wf04Phase2a.caseQueue.caseCodeLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.enterpriseLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.alertCountLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.statusLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.assigneeLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.createdAtLabel}</th>
                <th>{t.wf04Phase2a.caseQueue.updatedAtLabel}</th>
                <th style={{ textAlign: "right" }}>{t.wf04Phase2a.caseQueue.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filteredInternalCases.length === 0 ? (
                <tr>
                  <td className={styles.emptyState} colSpan={8}>
                    <div>
                      <p style={{ margin: "0 0 8px" }}>
                        {authorizedInternalCases.length === 0
                          ? t.wf04Phase2a.caseQueue.emptyQueue
                          : t.wf04Phase2a.caseQueue.filterNoResults}
                      </p>
                      {authorizedInternalCases.length === 0 ? (
                        <p className={styles.muted} style={{ margin: "0 0 12px" }}>
                          {t.wf04Phase2a.caseQueue.emptyQueueActionHint}
                        </p>
                      ) : (
                        hasFilters && (
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={resetQueueFilters}
                          >
                            {t.wf04Phase2a.caseQueue.resetFiltersBtn}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInternalCases.map((c) => {
                  const tenantInvestigators = getTenantInvestigators(c.enterpriseId);
                  const selectedAssigneeId = assigneeDraftByCase[c.caseId] ?? "";
                  const canAssignRow = isOperator && c.status === "Open";
                  const latestRep =
                    c.reports.length > 0 ? c.reports[c.reports.length - 1] : undefined;
                  const rowSummary = c.conclusion?.summary ?? latestRep?.summary;

                  return (
                    <tr key={c.caseId}>
                      <td>
                        <strong>{c.caseId}</strong>
                        {!isInvestigator && latestRep && (
                          <div
                            className={styles.muted}
                            style={{ fontSize: 12, marginTop: 4, maxWidth: 260, whiteSpace: "normal" }}
                          >
                            v{latestRep.version}
                            {rowSummary
                              ? ` · ${rowSummary.length > 68 ? `${rowSummary.slice(0, 68)}...` : rowSummary}`
                              : ""}
                          </div>
                        )}
                      </td>
                      <td>{enterpriseNameById.get(c.enterpriseId) ?? c.enterpriseId}</td>
                      <td>
                        <span className={styles.ruleTag}>
                          {t.wf04Phase2a.caseQueue.alertCountBadge.replace(
                            "{count}",
                            String(c.alertIds.length),
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${getCaseStatusBadgeClass(c.status)}`}>
                          {getCaseStatusLabel(c.status, t)}
                        </span>
                      </td>
                      <td>{resolveActorDisplayName(c.assignee)}</td>
                      <td>{formatDateTime(c.createdAt, dateLocale)}</td>
                      <td>{formatDateTime(c.updatedAt, dateLocale)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className={styles.caseAssignRow}
                          style={{ justifyContent: "flex-end" }}
                        >
                          {canAssignRow && (
                            <>
                              <select
                                className={styles.control}
                                aria-label={`${t.wf04Phase2a.caseQueue.assignInvestigatorLabel} (${c.caseId})`}
                                value={selectedAssigneeId}
                                onChange={(e) =>
                                  setAssigneeDraftByCase((prev) => ({
                                    ...prev,
                                    [c.caseId]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  {t.wf04Phase2a.caseQueue.selectInvestigatorPlaceholder}
                                </option>
                                {tenantInvestigators.map((inv) => (
                                  <option key={inv.id} value={inv.id}>
                                    {inv.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className={styles.btnPrimary}
                                disabled={
                                  !selectedAssigneeId ||
                                  busyCaseId === c.caseId ||
                                  !onAssignInvestigator
                                }
                                onClick={() => handleAssignSubmit(c.caseId)}
                              >
                                {busyCaseId === c.caseId
                                  ? t.wf04Phase2a.caseQueue.assigningBtn
                                  : t.wf04Phase2a.caseQueue.assignBtn}
                              </button>
                              {onSelfAssignCase && (
                                <button
                                  type="button"
                                  className={styles.btnSecondary}
                                  disabled={busyCaseId === c.caseId}
                                  onClick={() => handleSelfAssignSubmit(c.caseId)}
                                >
                                  {t.wf04Phase2a.caseQueue.selfAssignBtn}
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => requestOpenCaseId(c.caseId)}
                          >
                            <Eye size={13} style={{ marginRight: 5 }} aria-hidden="true" />
                            {t.wf04Phase2a.caseQueue.openCaseDetailBtn}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {renderCaseDetailModal()}
    </>
  );
}
