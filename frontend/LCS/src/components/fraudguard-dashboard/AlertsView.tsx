"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import type { Enterprise } from "@/types/enterprise";
import type {
  CaseStatus,
  RiskLevel,
  ScoringSource,
  TransactionRisk,
  UserProfile,
} from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseErrorCode,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import type { LegacyCaseArchiveEntry } from "@/utils/case-migration";
import {
  canActorViewLegacyArchiveEntry,
  isAlertBlockedByCasesOrLegacy,
} from "@/utils/case-migration";
import {
  checkInvestigationCaseCreationEligibility,
  evaluateInvestigationCaseReadAccess,
} from "@/utils/investigation-case";
import type { InvestigationActionOutcome } from "@/hooks/useInvestigationCases";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { ScoringSourceBadge } from "./ScoringSourceBadge";
import { transactionLabel } from "./ReadableConditions";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./SecurityDashboard.module.css";
import list from "./AlertsView.module.css";

interface AlertsViewProps {
  fixedSource?: ScoringSource;
  transactions: TransactionRisk[];
  onReview: (transaction: TransactionRisk) => void;
  canManageCases?: boolean;
  selectedAlertId?: string;
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveEntry[];
  enterprises?: readonly Enterprise[];
  currentUser?: UserProfile;
  onCreateInvestigationCase?: (
    selectedAlertIds: string[],
    note?: string,
  ) => InvestigationActionOutcome;
  onOpenInvestigationCase?: (caseId: string) => void;
  wf04DemoActive?: boolean;
  onLoadWf04Demo?: () => void;
  onRestorePreDemo?: () => void;
  selectionResetKey?: string | number;
}

type TriageFilter = "all" | "pending" | "linked" | "monitoring";

function findLinkedCase(
  alert: TransactionRisk,
  cases: readonly InvestigationCase[],
): InvestigationCase | undefined {
  const alertId = alert.alertId?.trim();
  return cases.find(
    (item) =>
      item.alerts.some(
        (member) =>
          member.transactionId === alert.id ||
          Boolean(alertId && member.alertId === alertId),
      ) || Boolean(alertId && item.alertIds.includes(alertId)),
  );
}

function findLinkedArchive(
  alert: TransactionRisk,
  archive: readonly LegacyCaseArchiveEntry[],
): LegacyCaseArchiveEntry | undefined {
  const alertId = alert.alertId?.trim();
  const caseId = alert.caseId?.trim();
  return archive.find(
    (entry) =>
      entry.transactionIds.includes(alert.id) ||
      Boolean(alertId && entry.alertIds.includes(alertId)) ||
      Boolean(caseId && entry.legacyCaseId === caseId),
  );
}

function hasAnyCaseLink(
  alert: TransactionRisk,
  cases: readonly InvestigationCase[],
  archive: readonly LegacyCaseArchiveEntry[],
): boolean {
  return (
    Boolean(findLinkedCase(alert, cases)) ||
    Boolean(findLinkedArchive(alert, archive)) ||
    isAlertBlockedByCasesOrLegacy(alert, cases, archive)
  );
}

function getWf04CasePillClass(status: InvestigationCaseStatus): string {
  switch (status) {
    case "Open":
      return list.statusOpen;
    case "Investigating":
      return list.statusInvestigating;
    case "Pending Review":
      return list.statusReported;
    case "Closed":
      return list.statusClean;
    default:
      return list.statusRule;
  }
}

function getLegacyCasePillClass(status?: CaseStatus): string {
  switch (status) {
    case "Open":
      return list.statusOpen;
    case "Assigned":
      return list.statusAssigned;
    case "Investigating":
      return list.statusInvestigating;
    case "Reported":
      return list.statusReported;
    case "Confirmed Fraud":
      return list.statusConfirmed;
    case "False Alarm":
    case "Resolved":
      return list.statusClean;
    default:
      return list.statusRule;
  }
}

function getPageNumbers(current: number, total: number): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: Array<number | "..."> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("...");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < total - 1) items.push("...");
  items.push(total);
  return items;
}

function formatAlertDateTime(date: Date, locale: string): string {
  const datePart = date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${datePart} - ${timePart}`;
}

export function AlertsView({
  fixedSource,
  transactions,
  onReview,
  canManageCases = false,
  selectedAlertId,
  investigationCases = [],
  legacyCaseArchive = [],
  enterprises = [],
  currentUser,
  onCreateInvestigationCase,
  onOpenInvestigationCase,
  selectionResetKey,
}: AlertsViewProps) {
  const { t, language } = useLanguage();
  const l = t.alertsView.list;
  const wf = t.wf04Phase2a;
  const aq = wf.alertQueue;
  const isVi = language === "vi";
  const locale = isVi ? "vi-VN" : "en-US";

  const [triage, setTriage] = useState<TriageFilter>("all");
  const [source, setSource] = useState<"all" | ScoringSource>("all");
  const [risk, setRisk] = useState<"all" | RiskLevel>("all");
  const [project, setProject] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [caseNote, setCaseNote] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const createModalRef = useDialogFocus(createModalOpen, () => {
    setCreateModalOpen(false);
    setCreateError(null);
  });

  const currentEnterprise = useMemo(
    () =>
      currentUser?.enterpriseId
        ? enterprises.find((item) => item.id === currentUser.enterpriseId)
        : undefined,
    [enterprises, currentUser?.enterpriseId],
  );

  const enterpriseEligibility = useMemo(() => {
    if (!currentEnterprise) return null;
    return checkInvestigationCaseCreationEligibility(
      currentEnterprise,
      new Date().toISOString(),
    );
  }, [currentEnterprise]);

  const isMonitoringOnlySource = fixedSource === "RULE_FALLBACK" || fixedSource === "RULE";
  const showSelectionUi = Boolean(onCreateInvestigationCase) && !isMonitoringOnlySource;
  const isOperatorActor = canManageCases && (!currentUser || currentUser.role === "Operator");

  const all = useMemo(
    () =>
      transactions
        .filter((a) => Boolean(a.alertId) && (!fixedSource || a.scoringSource === fixedSource))
        .slice()
        .sort((a, b) => (Date.parse(b.processedAt) || 0) - (Date.parse(a.processedAt) || 0)),
    [transactions, fixedSource],
  );

  const projects = useMemo(
    () => Array.from(new Map(all.map((a) => [a.projectId, a.projectName]))),
    [all],
  );

  const isPendingUnlinkedAlert = useMemo(
    () => (alert: TransactionRisk) =>
      alert.scoringSource === "AI" &&
      alert.riskLevel === "Abnormal" &&
      !hasAnyCaseLink(alert, investigationCases, legacyCaseArchive),
    [investigationCases, legacyCaseArchive],
  );

  const isMonitoringOnlyAlert = useMemo(
    () => (alert: TransactionRisk) =>
      !hasAnyCaseLink(alert, investigationCases, legacyCaseArchive) &&
      !isPendingUnlinkedAlert(alert),
    [investigationCases, legacyCaseArchive, isPendingUnlinkedAlert],
  );

  const counts = useMemo(
    () => ({
      all: all.length,
      pending: all.filter(isPendingUnlinkedAlert).length,
      linked: all.filter((a) => hasAnyCaseLink(a, investigationCases, legacyCaseArchive)).length,
      monitoring: all.filter(isMonitoringOnlyAlert).length,
    }),
    [all, isPendingUnlinkedAlert, isMonitoringOnlyAlert, investigationCases, legacyCaseArchive],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return all.filter((a) => {
      const linked = hasAnyCaseLink(a, investigationCases, legacyCaseArchive);
      if (triage === "pending" && !isPendingUnlinkedAlert(a)) return false;
      if (triage === "linked" && !linked) return false;
      if (triage === "monitoring" && !isMonitoringOnlyAlert(a)) return false;
      if (source !== "all" && a.scoringSource !== source) return false;
      if (risk !== "all" && a.riskLevel !== risk) return false;
      if (project !== "all" && a.projectId !== project) return false;
      if (!q) return true;
      const linkedCase = findLinkedCase(a, investigationCases);
      const canSeeCaseId =
        linkedCase &&
        (!currentUser ||
          (() => {
            const access = evaluateInvestigationCaseReadAccess(linkedCase, currentUser);
            return access.canViewInternalCase || access.canViewConfirmedReport;
          })());
      const title = a.alertName?.trim() || transactionLabel(a.transactionType, isVi);
      return [
        title,
        a.alertId,
        a.transactionReference,
        a.entityReference,
        a.projectName,
        canSeeCaseId ? linkedCase.caseId : undefined,
        a.caseId,
        a.explanation,
      ].some((value) => value?.toLocaleLowerCase().includes(q));
    }).sort((a, b) =>
      Number(isPendingUnlinkedAlert(b)) - Number(isPendingUnlinkedAlert(a)) ||
      (Date.parse(b.processedAt) || 0) - (Date.parse(a.processedAt) || 0),
    );
  }, [
    all,
    triage,
    source,
    risk,
    project,
    query,
    isVi,
    investigationCases,
    legacyCaseArchive,
    isPendingUnlinkedAlert,
    isMonitoringOnlyAlert,
    currentUser,
  ]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = useMemo(
    () => filtered.slice((current - 1) * pageSize, current * pageSize),
    [filtered, current, pageSize],
  );
  const fromIdx = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const toIdx = Math.min(current * pageSize, filtered.length);
  const pageNumbers = getPageNumbers(current, pages);
  const hasActiveFilters =
    triage !== "all" || source !== "all" || risk !== "all" || project !== "all" || query.trim() !== "";

  // Clear checkbox selection and close create modal on any filter, search, page, actor, or tenant switch.
  useEffect(() => {
    setSelectedAlertIds([]);
    setCreateModalOpen(false);
    setCaseNote("");
    setCreateError(null);
  }, [
    triage,
    source,
    risk,
    project,
    query,
    current,
    pageSize,
    currentUser?.id,
    currentUser?.enterpriseId,
    selectionResetKey,
  ]);

  const getRowSelectionState = useCallback(
    (alert: TransactionRisk): { eligible: boolean; alertId?: string; disabledReason?: string } => {
      const cleanAlertId = alert.alertId?.trim();
      const linkedCase = findLinkedCase(alert, investigationCases);
      const linkedArchive = findLinkedArchive(alert, legacyCaseArchive);

      if (!isOperatorActor) {
        return { eligible: false, disabledReason: aq.disabledPermissionReason };
      }
      if (enterpriseEligibility && !enterpriseEligibility.ok) {
        if (enterpriseEligibility.code === "PLAN_NOT_SUBSCRIPTION") {
          return { eligible: false, disabledReason: aq.disabledFreePlanReason };
        }
        if (
          enterpriseEligibility.code === "ENTERPRISE_NOT_OPERATING" ||
          enterpriseEligibility.code === "ENTERPRISE_LIFECYCLE_UNINITIALIZED" ||
          enterpriseEligibility.code === "ENTERPRISE_NOT_FOUND"
        ) {
          return { eligible: false, disabledReason: aq.disabledEnterpriseReason };
        }
        return { eligible: false, disabledReason: aq.disabledSubscriptionReason };
      }
      if (!currentEnterprise && enterprises.length > 0) {
        return { eligible: false, disabledReason: aq.disabledEnterpriseReason };
      }
      if (alert.scoringSource !== "AI" || alert.riskLevel !== "Abnormal") {
        return {
          eligible: false,
          disabledReason:
            alert.scoringSource === "RULE_FALLBACK"
              ? aq.disabledFallbackAlertReason
              : alert.scoringSource !== "AI"
                ? aq.disabledRuleAlertReason
                : l.noCaseMonitoring,
        };
      }
      if (linkedCase) {
        return { eligible: false, disabledReason: aq.disabledAlreadyLinkedReason };
      }
      if (linkedArchive || alert.caseId?.trim() || alert.caseStatus?.trim()) {
        return { eligible: false, disabledReason: aq.disabledLegacyReason };
      }
      if (!cleanAlertId) {
        return { eligible: false, disabledReason: l.noCaseMonitoring };
      }
      return { eligible: true, alertId: cleanAlertId };
    },
    [
      investigationCases,
      legacyCaseArchive,
      isOperatorActor,
      enterpriseEligibility,
      currentEnterprise,
      enterprises.length,
      aq.disabledPermissionReason,
      aq.disabledFreePlanReason,
      aq.disabledEnterpriseReason,
      aq.disabledSubscriptionReason,
      aq.disabledFallbackAlertReason,
      aq.disabledRuleAlertReason,
      aq.disabledAlreadyLinkedReason,
      aq.disabledLegacyReason,
      l.noCaseMonitoring,
    ],
  );

  const pageEligibleAlertIds = useMemo(() => {
    if (!showSelectionUi || !isOperatorActor) return [];
    const ids: string[] = [];
    for (const row of rows) {
      const state = getRowSelectionState(row);
      if (state.eligible && state.alertId) {
        ids.push(state.alertId);
      }
    }
    return ids;
  }, [showSelectionUi, isOperatorActor, rows, getRowSelectionState]);

  const selectedSet = useMemo(() => new Set(selectedAlertIds), [selectedAlertIds]);
  const allPageEligibleSelected =
    pageEligibleAlertIds.length > 0 && pageEligibleAlertIds.every((id) => selectedSet.has(id));
  const somePageEligibleSelected = pageEligibleAlertIds.some((id) => selectedSet.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageEligibleSelected && !allPageEligibleSelected;
    }
  }, [somePageEligibleSelected, allPageEligibleSelected]);

  const selectedAlertRows = useMemo(() => {
    if (!selectedAlertIds.length) return [];
    const idSet = new Set(selectedAlertIds);
    return all.filter((item) => item.alertId && idSet.has(item.alertId.trim()));
  }, [all, selectedAlertIds]);

  const toggleAlertSelection = (alertId: string) => {
    setCreateError(null);
    setSelectedAlertIds((prev) =>
      prev.includes(alertId) ? prev.filter((id) => id !== alertId) : [...prev, alertId],
    );
  };

  const toggleSelectAllOnPage = () => {
    setCreateError(null);
    if (allPageEligibleSelected) {
      const pageSet = new Set(pageEligibleAlertIds);
      setSelectedAlertIds((prev) => prev.filter((id) => !pageSet.has(id)));
      return;
    }
    setSelectedAlertIds(pageEligibleAlertIds);
  };

  const mapCreateErrorCode = (code: InvestigationCaseErrorCode, fallback: string): string => {
    switch (code) {
      case "EMPTY_ALERT_LIST":
        return aq.emptySelectionError;
      case "DUPLICATE_ALERT_ID":
      case "ALERT_ALREADY_LINKED":
        return aq.duplicateAlertError;
      case "INELIGIBLE_ALERT_SOURCE":
      case "INELIGIBLE_ALERT_RISK_LEVEL":
        return aq.ruleAlertCreateError;
      case "ALERT_LEGACY_LINKED":
        return aq.legacyAlertCreateError;
      case "CROSS_TENANT_ALERT":
      case "FORBIDDEN_TENANT":
        return aq.mixedEnterpriseError;
      case "FORBIDDEN_ROLE":
        return aq.permissionCreateError;
      case "ENTERPRISE_NOT_FOUND":
      case "ENTERPRISE_LIFECYCLE_UNINITIALIZED":
      case "ENTERPRISE_NOT_OPERATING":
      case "MISSING_SERVICE_PLAN":
      case "PLAN_NOT_SUBSCRIPTION":
      case "SUBSCRIPTION_NOT_STARTED":
      case "SUBSCRIPTION_EXPIRED":
        return aq.enterpriseIneligibleError;
      default:
        return fallback || aq.createCaseErrorFallback;
    }
  };

  const handleConfirmCreateCase = () => {
    if (!onCreateInvestigationCase) return;
    if (selectedAlertIds.length === 0) {
      setCreateError(aq.emptySelectionError);
      return;
    }
    const outcome = onCreateInvestigationCase(
      selectedAlertIds,
      caseNote.trim() || undefined,
    );
    if (!outcome.ok) {
      setCreateError(mapCreateErrorCode(outcome.code, outcome.error));
      return;
    }
    setSelectedAlertIds([]);
    setCaseNote("");
    setCreateError(null);
    setCreateModalOpen(false);
  };

  const reset = () => {
    setTriage("all");
    setSource("all");
    setRisk("all");
    setProject("all");
    setQuery("");
    setPage(1);
    setSelectedAlertIds([]);
  };

  const wf04StatusLabels: Record<InvestigationCaseStatus, string> = {
    Open: wf.caseQueue.statuses.open,
    Investigating: wf.caseQueue.statuses.investigating,
    "Pending Review": wf.caseQueue.statuses.pendingReview,
    Closed: wf.caseQueue.statuses.closed,
  };

  const legacyStatusLabels: Record<CaseStatus, string> = {
    Open: t.caseStatus.open,
    Assigned: t.caseStatus.assigned,
    Investigating: t.caseStatus.investigating,
    Reported: t.caseStatus.reported,
    "Confirmed Fraud": t.caseStatus.confirmedFraud,
    "False Alarm": t.caseStatus.falseAlarm,
    Resolved: t.caseStatus.resolved,
  };

  const triageTabs: Array<{ id: TriageFilter; label: string; count: number; urgent?: boolean }> = [
    { id: "all", label: l.allAlertsTab, count: counts.all },
    { id: "pending", label: l.needsCaseTab, count: counts.pending, urgent: counts.pending > 0 },
    { id: "linked", label: l.hasCaseTab, count: counts.linked },
    { id: "monitoring", label: l.monitoringTab, count: counts.monitoring },
  ];

  const headingTitle =
    fixedSource === "AI"
      ? t.nav.items.aiAlerts
      : fixedSource === "RULE_FALLBACK"
        ? t.nav.items.fallbackAlerts
        : fixedSource === "RULE"
          ? t.nav.items.ruleAlerts
          : t.alertsView.title;
  const subtitle =
    fixedSource === "AI"
      ? l.aiSubtitle
      : fixedSource === "RULE_FALLBACK"
        ? l.fallbackSubtitle
        : fixedSource === "RULE"
          ? l.ruleSubtitle
          : canManageCases
            ? l.operatorSubtitle
            : t.alertsView.subtitle;
  const emptyNoAlertsMessage =
    fixedSource === "AI"
      ? l.noAiAlerts
      : fixedSource === "RULE_FALLBACK"
        ? l.noFallbackAlerts
        : fixedSource === "RULE"
          ? l.noRuleAlerts
          : l.noAlerts;
  const rangeText =
    filtered.length === 0
      ? `0 / ${all.length} ${l.count}`
      : l.showingRange
          .replace("{from}", String(fromIdx))
          .replace("{to}", String(toIdx))
          .replace("{total}", String(filtered.length)) + ` ${l.count}`;

  return (
    <div className={list.alertsView}>
      <div className={styles.pageHeading}>
        <div>
          <h1>{headingTitle}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className={list.controlsArea}>
        {!isMonitoringOnlySource && (
          <div className={list.triageTabs} role="group" aria-label={l.summary}>
            {triageTabs.map((tab) => {
              const active = triage === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${list.triageBtn} ${active ? list.triageBtnActive : ""}`}
                  aria-pressed={active}
                  onClick={() => {
                    setTriage(tab.id);
                    setPage(1);
                  }}
                >
                  <span>{tab.label}</span>
                  <span className={`${list.triageCount} ${tab.urgent && !active ? list.triageCountPending : ""}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className={list.filters}>
          <label className={`${list.filterField} ${list.searchField}`}>
            <span>{l.search}</span>
            <div className={list.searchInputWrap}>
              <Search size={15} className={list.searchIcon} aria-hidden="true" />
              <input
                className={list.controlInput}
                type="search"
                value={query}
                placeholder={l.searchHint}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>

          <label className={list.filterField}>
            <span>{l.source}</span>
            <select
              className={list.controlSelect}
              value={fixedSource ?? source}
              disabled={Boolean(fixedSource)}
              onChange={(e) => {
                setSource(e.target.value as "all" | ScoringSource);
                setPage(1);
              }}
            >
              {!fixedSource && <option value="all">{l.allSources}</option>}
              {(!fixedSource || fixedSource === "AI") && <option value="AI">{l.ai}</option>}
              {(!fixedSource || fixedSource === "RULE") && <option value="RULE">{l.rule}</option>}
              {(!fixedSource || fixedSource === "RULE_FALLBACK") && <option value="RULE_FALLBACK">{l.fallback}</option>}
            </select>
          </label>

          <label className={list.filterField}>
            <span>{l.riskLabel}</span>
            <select
              className={list.controlSelect}
              value={risk}
              onChange={(e) => {
                setRisk(e.target.value as "all" | RiskLevel);
                setPage(1);
              }}
            >
              <option value="all">{l.allRisks}</option>
              <option value="Abnormal">{t.alertsView.filterAnomaly}</option>
              <option value="Normal">{t.alertsView.filterNormal}</option>
              <option value="Undetermined">{l.undetermined}</option>
            </select>
          </label>

          <label className={list.filterField}>
            <span>{t.alertsView.filterProjectLabel}</span>
            <select
              className={list.controlSelect}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t.alertsView.filterAllProjects}</option>
              {projects.map(([id, projectName]) => (
                <option key={id} value={id}>
                  {projectName}
                </option>
              ))}
            </select>
          </label>

          {showSelectionUi && isOperatorActor && pageEligibleAlertIds.length > 0 && (
            <button
              type="button"
              className={list.resetBtn}
              onClick={toggleSelectAllOnPage}
            >
              <span>{allPageEligibleSelected ? aq.clearSelectionBtn : aq.selectAllPageLabel}</span>
            </button>
          )}

          {hasActiveFilters && (
            <button type="button" className={list.resetBtn} onClick={reset}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>{l.reset}</span>
            </button>
          )}
        </div>
      </div>

      {showSelectionUi && isOperatorActor && selectedAlertIds.length > 0 && (
        <div className={list.alertSelectionBar} role="region" aria-live="polite">
          <strong>{aq.selectionCountLabel.replace("{count}", String(selectedAlertIds.length))}</strong>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setSelectedAlertIds([]);
                setCreateError(null);
              }}
            >
              {aq.clearSelectionBtn}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setCreateError(null);
                setCreateModalOpen(true);
              }}
            >
              {aq.createCaseBtn}
            </button>
          </div>
        </div>
      )}

      <section className={`${styles.panel} ${list.panel}`} aria-label={headingTitle}>
        {rows.length > 0 ? (
          <div className={list.tableWrap}>
            <table className={list.dataTable}>
              <caption className={list.srOnly}>{headingTitle}</caption>
              <thead>
                <tr>
                  {showSelectionUi && (
                    <th scope="col" className={list.alertCheckboxCell}>
                      <label className={list.alertCheckboxLabel}>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className={list.alertCheckboxInput}
                          disabled={!isOperatorActor || pageEligibleAlertIds.length === 0}
                          checked={allPageEligibleSelected}
                          onChange={toggleSelectAllOnPage}
                          aria-label={aq.selectAllPageAria}
                        />
                        <span className={list.srOnly}>{aq.selectAllPageLabel}</span>
                      </label>
                    </th>
                  )}
                  <th scope="col">{l.indexCol}</th>
                  <th scope="col">{l.detectedAt}</th>
                  <th scope="col">{l.name}</th>
                  <th scope="col" className={list.colProject}>
                    {l.projectCol}
                  </th>
                  <th scope="col">{l.source}</th>
                  <th scope="col">{l.result}</th>
                  <th scope="col" className={list.theadRight}>
                    {l.confidenceCol}
                  </th>
                  <th scope="col">{l.caseStatus}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, index) => {
                  const rowNumber = (current - 1) * pageSize + index + 1;
                  const selectionState = getRowSelectionState(a);
                  const isChecked = Boolean(selectionState.alertId && selectedSet.has(selectionState.alertId));
                  const linkedCase = findLinkedCase(a, investigationCases);
                  const linkedArchive = findLinkedArchive(a, legacyCaseArchive);
                  const caseAccess =
                    linkedCase && currentUser
                      ? evaluateInvestigationCaseReadAccess(linkedCase, currentUser)
                      : linkedCase
                        ? { canViewInternalCase: true, canViewConfirmedReport: true }
                        : null;
                  const canViewLinkedCase = Boolean(
                    linkedCase &&
                      caseAccess &&
                      (caseAccess.canViewInternalCase || caseAccess.canViewConfirmedReport),
                  );
                  const canViewArchive = Boolean(
                    linkedArchive &&
                      (!currentUser || canActorViewLegacyArchiveEntry(linkedArchive, currentUser)),
                  );

                  const pendingCase = isPendingUnlinkedAlert(a);
                  const selected = selectedAlertId === a.id || isChecked;
                  const date = new Date(a.processedAt);
                  const hasValidDate = !Number.isNaN(date.getTime());
                  const title = a.alertName?.trim() || transactionLabel(a.transactionType, isVi);
                  const confidenceText =
                    a.scoringSource === "AI" && typeof a.confidence === "number" && Number.isFinite(a.confidence)
                      ? `${Math.round(a.confidence * 100)}%`
                      : "-";
                  const ctaHint =
                    canManageCases && pendingCase
                      ? l.openCaseCta
                      : linkedCase || a.caseId
                        ? l.viewCaseCta
                        : l.details;

                  const statusChip = pendingCase
                    ? { text: l.pendingActionBadge, cls: list.statusPending }
                    : linkedCase
                      ? canViewLinkedCase
                        ? {
                            text: wf04StatusLabels[linkedCase.status],
                            cls: getWf04CasePillClass(linkedCase.status),
                          }
                        : { text: l.linked, cls: list.statusRule }
                      : linkedArchive || a.caseId
                        ? {
                            text: canViewArchive && a.caseStatus
                              ? legacyStatusLabels[a.caseStatus]
                              : l.linked,
                            cls: canViewArchive
                              ? getLegacyCasePillClass(a.caseStatus)
                              : list.statusRule,
                          }
                        : {
                            text: l.noCaseMonitoring,
                            cls: list.statusRule,
                          };

                  const reasonId = `alert-disabled-${a.id}`;
                  const showDisabledReason = Boolean(
                    showSelectionUi &&
                      !selectionState.eligible &&
                      selectionState.disabledReason &&
                      !(canViewLinkedCase && linkedCase),
                  );

                  return (
                    <tr
                      key={a.id}
                      className={`${pendingCase ? list.rowPending : ""} ${selected ? list.rowSelected : ""}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, a, input, label")) return;
                        if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
                        onReview(a);
                      }}
                    >
                      {showSelectionUi && (
                        <td className={list.alertCheckboxCell} data-label={aq.selectColumnLabel}>
                          <label
                            className={list.alertCheckboxLabel}
                            title={selectionState.disabledReason}
                          >
                            <input
                              type="checkbox"
                              className={list.alertCheckboxInput}
                              disabled={!selectionState.eligible}
                              checked={isChecked}
                              aria-label={aq.selectAlertAria.replace(
                                "{code}",
                                a.alertId || a.transactionReference,
                              )}
                              aria-describedby={showDisabledReason ? reasonId : undefined}
                              onChange={() => {
                                if (selectionState.eligible && selectionState.alertId) {
                                  toggleAlertSelection(selectionState.alertId);
                                }
                              }}
                            />
                          </label>
                        </td>
                      )}

                      <td className={list.colIndex} data-label={l.indexCol}>
                        {rowNumber}
                      </td>

                      <td className={list.colTime} data-label={l.detectedAt}>
                        {hasValidDate ? (
                          <time dateTime={date.toISOString()}>{formatAlertDateTime(date, locale)}</time>
                        ) : (
                          <span>{l.noTime}</span>
                        )}
                      </td>

                      <td className={list.cellSpanFull} data-label={l.name}>
                        <button
                          type="button"
                          className={list.alertCellBtn}
                          onClick={() => onReview(a)}
                          title={a.explanation || `${title} (${a.alertId})`}
                          aria-label={`${ctaHint}: ${a.alertId || a.transactionReference}`}
                        >
                          <span className={list.alertTitleText}>{title}</span>
                          <span className={list.alertSubCode}>
                            <span className={list.codeToken}>{a.transactionReference}</span>
                            {a.alertId && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={list.codeToken}>{a.alertId}</span>
                              </>
                            )}
                          </span>
                        </button>
                      </td>

                      <td className={list.colProject} data-label={l.projectCol}>
                        <span className={list.projectText}>{a.projectName}</span>
                      </td>

                      <td className={list.badgeCell} data-label={l.source}>
                        <ScoringSourceBadge source={a.scoringSource} />
                      </td>

                      <td className={list.badgeCell} data-label={l.result}>
                        <RiskLevelBadge riskLevel={a.riskLevel} />
                      </td>

                      <td className={list.colConfidence} data-label={l.confidenceCol}>
                        {confidenceText}
                      </td>

                      <td className={list.cellSpanFull} data-label={l.caseStatus}>
                        <div className={list.statusCellWrap}>
                          <div className={list.statusStack}>
                            <span className={`${list.pill} ${statusChip.cls}`}>{statusChip.text}</span>
                            {canViewLinkedCase && linkedCase && (
                              <>
                                <span className={list.caseCodeSub}>
                                  {aq.linkedCaseBadge.replace("{code}", linkedCase.caseId)}
                                </span>
                                {onOpenInvestigationCase && (
                                  <button
                                    type="button"
                                    className={list.alertLinkedCaseBtn}
                                    onClick={() => onOpenInvestigationCase(linkedCase.caseId)}
                                  >
                                    {aq.viewCaseBtn}
                                  </button>
                                )}
                              </>
                            )}
                            {!linkedCase && (linkedArchive || a.caseId) && canViewArchive && (
                              <span className={list.caseCodeSub}>
                                {wf.legacy.legacyAlertBadge}:{" "}
                                {linkedArchive?.legacyCaseId || a.caseId}
                              </span>
                            )}
                            {showDisabledReason && (
                              <span id={reasonId} className={list.alertDisabledReason}>
                                {selectionState.disabledReason}
                              </span>
                            )}
                          </div>
                          <ChevronRight size={15} className={list.rowArrow} aria-hidden="true" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={list.empty}>
            <p className={list.emptyTitle}>
              {all.length ? t.alertsView.emptyMessage : emptyNoAlertsMessage}
            </p>
            {all.length > 0 && hasActiveFilters && (
              <>
                <p className={list.emptyDesc}>
                  {isMonitoringOnlySource ? l.filterSummaryEmptyMonitoring : l.filterSummaryEmpty}
                </p>
                <button type="button" className={list.resetBtn} onClick={reset}>
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>{l.reset}</span>
                </button>
              </>
            )}
          </div>
        )}

        <footer className={list.footer}>
          <span className={list.rangeLabel} aria-live="polite">
            {rangeText}
          </span>

          <nav className={list.pageNav} aria-label={l.page}>
            <button
              type="button"
              className={list.pageBtn}
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              aria-label={l.previous}
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>

            {pageNumbers.map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className={list.pageEllipsis} aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`${list.pageNumBtn} ${item === current ? list.pageNumActive : ""}`}
                  aria-current={item === current ? "page" : undefined}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              ),
            )}

            <button
              type="button"
              className={list.pageBtn}
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
              aria-label={l.next}
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </nav>

          <label className={list.pageSizeLabel}>
            <select
              className={list.pageSizeSelect}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>{l.recordsPerPage}</span>
          </label>
        </footer>
      </section>

      {createModalOpen && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCreateModalOpen(false);
              setCreateError(null);
            }
          }}
        >
          <section
            ref={createModalRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-case-modal-title"
            tabIndex={-1}
          >
            <header className={styles.onboardingModalHeader}>
              <div>
                <h2 id="create-case-modal-title">{aq.createCaseModalTitle}</h2>
                <p className={styles.onboardingFormHint}>{aq.createCaseModalSubtitle}</p>
              </div>
              <button
                type="button"
                className={styles.button}
                aria-label={aq.cancelBtn}
                onClick={() => {
                  setCreateModalOpen(false);
                  setCreateError(null);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.onboardingModalBody}>
              {createError && (
                <div className={styles.modalErrorBanner} role="alert">
                  {createError}
                </div>
              )}

              <div>
                <strong className={styles.onboardingFormLabel}>{aq.selectedAlertsHeading}</strong>
                <ul className={list.createCasePreviewList}>
                  {selectedAlertRows.map((item) => (
                    <li key={item.id} className={list.createCasePreviewItem}>
                      <div>
                        <strong>{item.alertId}</strong> ({item.transactionReference})
                        <div>{item.alertName?.trim() || transactionLabel(item.transactionType, isVi)}</div>
                      </div>
                      <span className={list.projectText}>{item.projectName}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <label className={styles.onboardingFormField}>
                <span className={styles.onboardingFormLabel}>{aq.caseNoteLabel}</span>
                <textarea
                  className={styles.onboardingFormInput}
                  rows={3}
                  value={caseNote}
                  placeholder={aq.caseNotePlaceholder}
                  onChange={(e) => setCaseNote(e.target.value)}
                />
              </label>
            </div>

            <footer className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setCreateModalOpen(false);
                  setCreateError(null);
                }}
              >
                {aq.cancelBtn}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleConfirmCreateCase}
              >
                {aq.confirmCreateCaseBtn}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
