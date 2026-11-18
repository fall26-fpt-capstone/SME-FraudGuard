"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Eye, ShieldAlert } from "lucide-react";
import { downloadCSV, exportInvestigationCasesCSV } from "@/utils/export-csv";
import type { Enterprise } from "@/types/enterprise";
import type {
  CaseStatus,
  InvestigationFinding,
  RolePermissions,
  TransactionRisk,
  UserProfile,
} from "@/types/fraudguard";
import type {
  ConfirmedInvestigationReportView,
  InvestigationCase,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import type {
  SubmitConfirmedReportFeedbackCommandArgs,
  SubmitFeedbackOutcome,
} from "@/hooks/useInvestigationCases";
import { type LegacyCaseArchiveEntry } from "@/utils/case-migration";
import {
  readConfirmedInvestigationReport,
  readInternalInvestigationCase,
} from "@/utils/investigation-case";
import { findFeedbackForConfirmedReport } from "@/utils/report-feedback";
import { ReportFeedbackModal } from "./ReportFeedbackModal";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { ScoringSourceBadge } from "./ScoringSourceBadge";
import { useToast } from "@/context/ToastProvider";
import { useLanguage } from "@/context/LanguageContext";
import type { TranslationKey } from "@/config/translations";
import styles from "./SecurityDashboard.module.css";

interface ReportsViewProps {
  transactions: TransactionRisk[];
  currentUser?: UserProfile;
  permissions?: RolePermissions;
  onReview?: (transaction: TransactionRisk) => void;
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveEntry[];
  enterprises?: readonly Enterprise[];
  users?: readonly UserProfile[];
  onOpenInvestigationCase?: (caseId: string) => void;
  reportFeedbacks?: readonly InvestigationReportFeedback[];
  onSubmitReportFeedback?: (
    args: SubmitConfirmedReportFeedbackCommandArgs,
  ) => SubmitFeedbackOutcome;
}

function getWf04StatusBadgeClass(status: InvestigationCaseStatus): string {
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

function getWf04StatusLabel(
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

function getFindingBadgeStyle(
  finding: InvestigationFinding,
  t: TranslationKey,
): { bg: string; text: string; border: string; label: string } {
  switch (finding) {
    case "Suspicious":
      return {
        bg: "rgba(237, 103, 117, 0.15)",
        text: "var(--security-red)",
        border: "var(--critical-border)",
        label: t.findings.suspicious,
      };
    case "Legitimate":
      return {
        bg: "rgba(120, 201, 172, 0.15)",
        text: "var(--security-green)",
        border: "var(--low-border)",
        label: t.findings.legitimate,
      };
    case "Need More Info":
      return {
        bg: "rgba(173, 138, 243, 0.15)",
        text: "var(--security-purple)",
        border: "var(--medium-border)",
        label: t.findings.needMoreInfo,
      };
  }
}

function getDecisionBadgeStyle(
  status: CaseStatus,
  t: TranslationKey,
): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case "Reported":
      return {
        label: t.caseStatus.reported,
        bg: "var(--high-bg)",
        text: "var(--high-text)",
        border: "var(--high-border)",
      };
    case "Confirmed Fraud":
      return {
        label: t.caseStatus.confirmedFraud,
        bg: "var(--critical-bg)",
        text: "var(--critical-text)",
        border: "var(--critical-border)",
      };
    case "False Alarm":
      return {
        label: t.caseStatus.falseAlarm,
        bg: "rgba(120, 201, 172, 0.15)",
        text: "var(--security-green)",
        border: "var(--low-border)",
      };
    case "Resolved":
      return {
        label: t.caseStatus.resolved,
        bg: "rgba(120, 201, 172, 0.15)",
        text: "var(--security-green)",
        border: "var(--low-border)",
      };
    case "Investigating":
      return {
        label: t.caseStatus.investigating,
        bg: "rgba(173, 138, 243, 0.15)",
        text: "var(--security-purple)",
        border: "var(--medium-border)",
      };
    case "Assigned":
      return {
        label: t.caseStatus.assigned,
        bg: "rgba(113, 185, 244, 0.15)",
        text: "var(--security-blue)",
        border: "var(--security-border-strong)",
      };
    case "Open":
      return {
        label: t.caseStatus.open,
        bg: "rgba(237, 167, 101, 0.15)",
        text: "var(--security-orange)",
        border: "var(--high-border)",
      };
  }
}

export function ReportsView({
  transactions,
  currentUser,
  permissions,
  onReview,
  investigationCases,
  enterprises,
  users,
  onOpenInvestigationCase,
  reportFeedbacks = [],
  onSubmitReportFeedback,
}: ReportsViewProps) {
  const { t, language } = useLanguage();
  const dateLocale = language === "vi" ? "vi-VN" : "en-US";
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<number>(30);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterFinding, setFilterFinding] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [wf04Range, setWf04Range] = useState<"all" | number>("all");
  const [wf04StatusFilter, setWf04StatusFilter] = useState<"all" | InvestigationCaseStatus>("all");
  const [inspectedCaseId, setInspectedCaseId] = useState<string | null>(null);
  const [selectedVersionByCase, setSelectedVersionByCase] = useState<Record<string, number>>({});
  const [feedbackCaseId, setFeedbackCaseId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setInspectedCaseId(null);
    setSelectedVersionByCase({});
    setFeedbackCaseId(null);
  }, [currentUser?.id, currentUser?.role, currentUser?.enterpriseId]);

  const isWf04Mode = investigationCases !== undefined;

  const txLookup = useMemo(() => {
    const byId = new Map<string, TransactionRisk>();
    const byAlertId = new Map<string, TransactionRisk>();
    for (const tx of transactions) {
      byId.set(tx.id, tx);
      if (tx.alertId) byAlertId.set(tx.alertId, tx);
    }
    return { byId, byAlertId };
  }, [transactions]);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users ?? []) {
      map.set(user.id, user.name);
    }
    return map;
  }, [users]);

  const enterpriseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ent of enterprises ?? []) {
      map.set(ent.id, ent.name);
    }
    return map;
  }, [enterprises]);

  const wf04Authorized = useMemo(() => {
    if (!isWf04Mode) {
      return {
        denied: false,
        isSmeAdmin: false,
        internalCases: [] as InvestigationCase[],
        confirmedViews: [] as ConfirmedInvestigationReportView[],
        confirmedRawCases: [] as InvestigationCase[],
      };
    }
    if (
      !currentUser ||
      !currentUser.enterpriseId ||
      ["Platform Admin", "Implementation Staff", "Viewer"].includes(currentUser.role)
    ) {
      return {
        denied: true,
        isSmeAdmin: false,
        internalCases: [] as InvestigationCase[],
        confirmedViews: [] as ConfirmedInvestigationReportView[],
        confirmedRawCases: [] as InvestigationCase[],
      };
    }

    if (currentUser.role === "SME Admin") {
      const confirmedViews: ConfirmedInvestigationReportView[] = [];
      const confirmedRawCases: InvestigationCase[] = [];
      for (const c of investigationCases ?? []) {
        const res = readConfirmedInvestigationReport({
          investigationCase: c,
          actor: currentUser,
        });
        if (res.ok) {
          confirmedViews.push(res.view);
          confirmedRawCases.push(c);
        }
      }
      return {
        denied: false,
        isSmeAdmin: true,
        internalCases: [] as InvestigationCase[],
        confirmedViews,
        confirmedRawCases,
      };
    }

    const internalCases: InvestigationCase[] = [];
    for (const c of investigationCases ?? []) {
      const res = readInternalInvestigationCase({
        investigationCase: c,
        actor: currentUser,
      });
      if (res.ok) {
        internalCases.push(res.investigationCase);
      }
    }
    return {
      denied: false,
      isSmeAdmin: false,
      internalCases,
      confirmedViews: [] as ConfirmedInvestigationReportView[],
      confirmedRawCases: [] as InvestigationCase[],
    };
  }, [isWf04Mode, currentUser, investigationCases]);

  const wf04Projects = useMemo(() => {
    const map = new Map<string, string>();
    const collectAlerts = (alerts: InvestigationCase["alerts"]) => {
      for (const alert of alerts) {
        const tx =
          txLookup.byId.get(alert.transactionId) ??
          txLookup.byAlertId.get(alert.alertId);
        if (tx) map.set(tx.projectId, tx.projectName);
      }
    };
    wf04Authorized.internalCases.forEach((c) => collectAlerts(c.alerts));
    wf04Authorized.confirmedViews.forEach((v) => collectAlerts(v.alerts));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [wf04Authorized, txLookup]);

  const wf04FilteredInternalCases = useMemo(() => {
    const now = Date.now();
    const cutoff =
      wf04Range === "all" ? null : now - wf04Range * 24 * 60 * 60 * 1000;
    return wf04Authorized.internalCases
      .filter((c) => {
        if (cutoff !== null) {
          const ts = Date.parse(c.updatedAt || c.createdAt);
          if (!Number.isFinite(ts) || ts < cutoff) return false;
        }
        if (wf04StatusFilter !== "all" && c.status !== wf04StatusFilter) return false;
        if (filterProject !== "all") {
          const matchesProject = c.alerts.some((alert) => {
            const tx =
              txLookup.byId.get(alert.transactionId) ??
              txLookup.byAlertId.get(alert.alertId);
            return tx?.projectId === filterProject;
          });
          if (!matchesProject) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          (Date.parse(b.updatedAt || b.createdAt) || 0) -
          (Date.parse(a.updatedAt || a.createdAt) || 0),
      );
  }, [wf04Authorized.internalCases, wf04Range, wf04StatusFilter, filterProject, txLookup]);

  const wf04FilteredConfirmedViews = useMemo(() => {
    const now = Date.now();
    const cutoff =
      wf04Range === "all" ? null : now - wf04Range * 24 * 60 * 60 * 1000;
    return wf04Authorized.confirmedViews
      .filter((v) => {
        if (cutoff !== null) {
          const ts = Date.parse(v.closedAt || v.updatedAt);
          if (!Number.isFinite(ts) || ts < cutoff) return false;
        }
        if (filterProject !== "all") {
          const matchesProject = v.alerts.some((alert) => {
            const tx =
              txLookup.byId.get(alert.transactionId) ??
              txLookup.byAlertId.get(alert.alertId);
            return tx?.projectId === filterProject;
          });
          if (!matchesProject) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          (Date.parse(b.closedAt || b.updatedAt) || 0) -
          (Date.parse(a.closedAt || a.updatedAt) || 0),
      );
  }, [wf04Authorized.confirmedViews, wf04Range, filterProject, txLookup]);

  const wf04StatusChartData = useMemo(() => {
    return [
      {
        name: t.wf04Phase2a.caseQueue.statuses.open,
        count: wf04FilteredInternalCases.filter((c) => c.status === "Open").length,
        color: "#eda765",
      },
      {
        name: t.wf04Phase2a.caseQueue.statuses.investigating,
        count: wf04FilteredInternalCases.filter((c) => c.status === "Investigating").length,
        color: "#71b9f4",
      },
      {
        name: t.wf04Phase2a.caseQueue.statuses.pendingReview,
        count: wf04FilteredInternalCases.filter((c) => c.status === "Pending Review").length,
        color: "#ad8af3",
      },
      {
        name: t.wf04Phase2a.caseQueue.statuses.closed,
        count: wf04FilteredInternalCases.filter((c) => c.status === "Closed").length,
        color: "#78c9ac",
      },
    ].filter((item) => item.count > 0);
  }, [wf04FilteredInternalCases, t]);

  const isInvestigator = currentUser?.role === "Investigator";

  /* ─────────────────────────────────────────────────────────────
     INVESTIGATOR SPECIFIC DATA & LOGIC
  ───────────────────────────────────────────────────────────── */
  const investigatorCases = useMemo(() => {
    if (!isInvestigator) return [];
    return transactions.filter(
      (tx) =>
        tx.scoringSource === "AI" && tx.caseId &&
        (tx.assignedInvestigatorId
          ? tx.assignedInvestigatorId === currentUser?.id
          : tx.assignedInvestigator === currentUser?.name),
    );
  }, [transactions, isInvestigator, currentUser?.id, currentUser?.name]);

  const filteredInvestigatorCases = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - range * 24 * 60 * 60 * 1000);

    return investigatorCases
      .filter((tx) => {
        const d = new Date(tx.processedAt);
        if (!Number.isFinite(d.getTime()) || d < cutoff || d > now) return false;
        if (filterProject !== "all" && tx.projectId !== filterProject) return false;
        if (filterStatus !== "all" && tx.caseStatus !== filterStatus) return false;
        if (filterFinding !== "all") {
          if (!tx.investigationReport) return false;
          if (tx.investigationReport.finding !== filterFinding) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime(),
      );
  }, [investigatorCases, range, filterProject, filterStatus, filterFinding]);

  const investigatorStats = useMemo(() => {
    const total = filteredInvestigatorCases.length;
    const reported = filteredInvestigatorCases.filter(
      (tx) => tx.caseStatus === "Reported",
    ).length;
    const confirmedFraud = filteredInvestigatorCases.filter(
      (tx) => tx.caseStatus === "Confirmed Fraud",
    ).length;
    const falseAlarm = filteredInvestigatorCases.filter(
      (tx) => tx.caseStatus === "False Alarm",
    ).length;
    const investigating = filteredInvestigatorCases.filter(
      (tx) => tx.caseStatus === "Investigating",
    ).length;
    const resolved = filteredInvestigatorCases.filter(
      (tx) => tx.caseStatus === "Resolved",
    ).length;

    // Finding breakdown
    const suspiciousFindings = filteredInvestigatorCases.filter(
      (tx) => tx.investigationReport?.finding === "Suspicious",
    ).length;
    const legitimateFindings = filteredInvestigatorCases.filter(
      (tx) => tx.investigationReport?.finding === "Legitimate",
    ).length;
    const needMoreInfoFindings = filteredInvestigatorCases.filter(
      (tx) => tx.investigationReport?.finding === "Need More Info",
    ).length;

    return {
      total,
      reported,
      confirmedFraud,
      falseAlarm,
      investigating,
      resolved,
      suspiciousFindings,
      legitimateFindings,
      needMoreInfoFindings,
    };
  }, [filteredInvestigatorCases]);

  /* ─────────────────────────────────────────────────────────────
     EXECUTIVE / MACRO DATA & LOGIC (Non-Investigator roles)
  ───────────────────────────────────────────────────────────── */
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    const sourceList = isInvestigator ? investigatorCases : transactions;
    sourceList.forEach((tx) => map.set(tx.projectId, tx.projectName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [transactions, investigatorCases, isInvestigator]);

  const filteredMacro = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - range * 24 * 60 * 60 * 1000);

    return transactions.filter((tx) => {
      const d = new Date(tx.processedAt);
      if (!Number.isFinite(d.getTime()) || d < cutoff || d > now) return false;
      if (filterProject !== "all" && tx.projectId !== filterProject) return false;
      return true;
    });
  }, [transactions, range, filterProject]);

  const macroMetrics = useMemo(() => {
    const total = filteredMacro.length;
    const highRisk = filteredMacro.filter(
      (tx) => tx.riskLevel === "Abnormal",
    ).length;
    const confirmed = filteredMacro.filter(
      (tx) => tx.caseStatus === "Confirmed Fraud",
    ).length;
    const falseAlarms = filteredMacro.filter(
      (tx) => tx.caseStatus === "False Alarm",
    ).length;
    const resolvedCases = confirmed + falseAlarms;
    const aiCount = filteredMacro.filter((tx) => tx.scoringSource === "AI").length;
    const fallbackCount = filteredMacro.filter(
      (tx) => tx.scoringSource === "RULE_FALLBACK",
    ).length;

    return {
      total,
      highRisk,
      fraudRate: total > 0 ? ((highRisk / total) * 100).toFixed(1) : "0",
      falseAlarmRate:
        resolvedCases > 0 ? ((falseAlarms / resolvedCases) * 100).toFixed(1) : null,
      aiCoverage: total > 0 ? ((aiCount / total) * 100).toFixed(1) : "0",
      fallbackRate: total > 0 ? ((fallbackCount / total) * 100).toFixed(1) : "0",
    };
  }, [filteredMacro]);

  const conclusionData = useMemo(() => {
    return [
      {
        name: t.reportsView.execCharts.legendConfirmed,
        count: filteredMacro.filter((tx) => tx.caseStatus === "Confirmed Fraud").length,
        color: "#ed6775",
      },
      {
        name: t.reportsView.execCharts.legendInvestigating,
        count: filteredMacro.filter(
          (tx) =>
            tx.caseStatus === "Investigating" ||
            tx.caseStatus === "Reported" ||
            tx.caseStatus === "Assigned",
        ).length,
        color: "#eda765",
      },
      {
        name: t.reportsView.execCharts.legendFalseAlarm,
        count: filteredMacro.filter((tx) => tx.caseStatus === "False Alarm").length,
        color: "#78c9ac",
      },
      {
        name: t.reportsView.execCharts.legendOpen,
        count: filteredMacro.filter(
          (tx) => tx.scoringSource === "AI" && !!tx.caseId && tx.caseStatus === "Open",
        ).length,
        color: "#ad8af3",
      },
      { name: language === "vi" ? "Đã xử lý" : "Resolved", count: filteredMacro.filter(tx => tx.scoringSource === "AI" && !!tx.caseId && tx.caseStatus === "Resolved").length, color: "#71b9f4" },
    ].filter((d) => d.count > 0);
  }, [filteredMacro, t, language]);

  const scoringData = useMemo(() => {
    return [
      {
        name: t.reportsView.execCharts.legendAi,
        count: filteredMacro.filter((tx) => tx.scoringSource === "AI").length,
        color: "#ad8af3",
      },
      {
        name: t.reportsView.execCharts.legendRule,
        count: filteredMacro.filter((tx) => tx.scoringSource === "RULE").length,
        color: "#71b9f4",
      },
      {
        name: t.reportsView.execCharts.legendFallback,
        count: filteredMacro.filter(
          (tx) => tx.scoringSource === "RULE_FALLBACK",
        ).length,
        color: "#eda765",
      },
    ];
  }, [filteredMacro, t]);

  const projectStats = useMemo(() => {
    return projects.map((p) => {
      const pTxns = filteredMacro.filter((tx) => tx.projectId === p.id);
      const highCount = pTxns.filter(
        (tx) => tx.riskLevel === "Abnormal",
      ).length;
      const fraudCount = pTxns.filter(
        (tx) => tx.caseStatus === "Confirmed Fraud",
      ).length;
      return {
        id: p.id,
        name: p.name,
        total: pTxns.length,
        highRisk: highCount,
        confirmed: fraudCount,
      };
    });
  }, [projects, filteredMacro]);

  const handleExportSummaryCSV = () => {
    if (!permissions?.canExport) return;
    const headers = [
      "Project Name",
      "Total Analyzed",
      "High Risk Count",
      "Confirmed Fraud",
      "Risk Percentage",
    ];
    const rows = projectStats.map((p) => [
      p.name,
      p.total,
      p.highRisk,
      p.confirmed,
      p.total > 0 ? `${((p.highRisk / p.total) * 100).toFixed(1)}%` : "0%",
    ]);

    downloadCSV([headers, ...rows], `fraudguard_report_summary_${new Date().toISOString().slice(0, 10)}.csv`);

    toast(
      "success",
      language === "vi"
        ? "Đã xuất báo cáo tổng kết FraudGuard định dạng CSV"
        : "FraudGuard summary report exported to CSV",
    );
  };

  const resolveCaseProjectsText = (alerts: InvestigationCase["alerts"]): string => {
    const names = new Set<string>();
    for (const alert of alerts) {
      const tx =
        txLookup.byId.get(alert.transactionId) ??
        txLookup.byAlertId.get(alert.alertId);
      if (tx?.projectName) names.add(tx.projectName);
    }
    return names.size > 0 ? Array.from(names).join(", ") : "-";
  };

  const resolveActorName = (actorRef?: { actorId: string; name?: string }): string => {
    if (!actorRef) return t.wf04Phase2a.caseQueue.unassignedLabel;
    return userNameById.get(actorRef.actorId) || actorRef.name || actorRef.actorId;
  };

  const handleExportWf04Cases = () => {
    if (!permissions?.canExport || !currentUser) return;
    const casesToExport = wf04Authorized.isSmeAdmin
      ? wf04Authorized.confirmedRawCases.filter((c) =>
          wf04FilteredConfirmedViews.some((v) => v.caseId === c.caseId),
        )
      : wf04FilteredInternalCases;
    exportInvestigationCasesCSV(
      casesToExport,
      users ?? [],
      `fraudguard_cases_${new Date().toISOString().slice(0, 10)}.csv`,
      currentUser,
    );
    toast(
      "success",
      language === "vi"
        ? "Đã xuất báo cáo hồ sơ điều tra định dạng CSV"
        : "Investigation case report exported to CSV",
    );
  };

  if (isWf04Mode) {
    if (wf04Authorized.denied) {
      return (
        <>
          <div className={styles.pageHeading}>
            <div>
              <h1>{t.reportsView.execTitle}</h1>
              <p>{t.reportsView.execSubtitle}</p>
            </div>
          </div>
          <div
            className={`${styles.roleNoticeBanner} ${
              currentUser?.role === "Platform Admin"
                ? styles.roleNoticePlatformAdmin
                : currentUser?.role === "Implementation Staff"
                  ? styles.roleNoticeRiskStaff
                  : styles.roleNoticeViewer
            }`}
          >
            <div className={styles.roleNoticeLeft}>
              <ShieldAlert size={18} className={styles.roleNoticeIcon} aria-hidden="true" />
              <div>
                <strong>{t.wf04Phase2a.caseQueue.noInternalAccessTitle}</strong>
                <p style={{ margin: "4px 0 0" }}>{t.wf04Phase2a.caseQueue.noInternalAccessDesc}</p>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (wf04Authorized.isSmeAdmin) {
      const confirmedAlertsCount = wf04FilteredConfirmedViews.reduce(
        (sum, view) => sum + view.alertIds.length,
        0,
      );
      const inspectedConfirmedView = inspectedCaseId
        ? wf04FilteredConfirmedViews.find((v) => v.caseId === inspectedCaseId) ?? null
        : null;
      return (
        <>
          <div className={styles.pageHeading}>
            <div>
              <h1>{t.reportsView.execTitle}</h1>
              <p>{t.reportsView.execSubtitle}</p>
            </div>
            {permissions?.canExport && (
              <button
                className={styles.btnPrimary}
                onClick={handleExportWf04Cases}
                type="button"
              >
                <Download size={15} style={{ marginRight: 6 }} aria-hidden="true" />
                {t.reportsView.btnExport}
              </button>
            )}
          </div>

          <div className={styles.roleNoticeBanner} style={{ marginBottom: 18 }}>
            <div className={styles.roleNoticeLeft}>
              <span>{t.wf04Phase2b.reportsView.smeAdminConfirmedOnlyDesc}</span>
            </div>
          </div>

          <div className={styles.toolbar} style={{ marginBottom: 20 }}>
            <div className={styles.toolbarGroup}>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>{t.reportsView.invFilters.timeRange}</span>
                <select
                  className={styles.control}
                  aria-label={t.reportsView.invFilters.timeRange}
                  value={String(wf04Range)}
                  onChange={(e) =>
                    setWf04Range(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                >
                  <option value="all">{t.wf04Phase2a.caseQueue.tabAll}</option>
                  <option value="7">{t.reportsView.invFilters.days7}</option>
                  <option value="30">{t.reportsView.invFilters.days30}</option>
                  <option value="90">{t.reportsView.invFilters.days90}</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>{t.reportsView.invFilters.project}</span>
                <select
                  className={styles.control}
                  aria-label={t.reportsView.invFilters.project}
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                >
                  <option value="all">{t.reportsView.invFilters.allProjects}</option>
                  {wf04Projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <section className={styles.caseMetricsGrid} style={{ marginBottom: 20 }}>
            <article className={styles.statCard}>
              <div className={styles.statLabel}>
                {t.wf04Phase2b.reportsView.confirmedCasesCountLabel}
              </div>
              <strong className={styles.statValue}>{wf04FilteredConfirmedViews.length}</strong>
              <span className={styles.statDescription}>
                {t.wf04Phase2b.reportsView.confirmedCasesCountDesc}
              </span>
            </article>
            <article className={styles.statCard}>
              <div className={styles.statLabel}>{t.wf04Phase2a.caseQueue.alertCountLabel}</div>
              <strong className={styles.statValue}>{confirmedAlertsCount}</strong>
              <span className={styles.statDescription}>
                {t.wf04Phase2a.caseQueue.alertCountBadge.replace(
                  "{count}",
                  String(confirmedAlertsCount),
                )}
              </span>
            </article>
          </section>

          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
              <div>
                <h2>{t.wf04Phase2b.reportsView.sectionTitle}</h2>
                <p className={styles.muted}>{t.wf04Phase2b.reportsView.sectionSubtitle}</p>
              </div>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t.wf04Phase2a.caseQueue.caseCodeLabel}</th>
                    <th>{t.wf04Phase2a.caseQueue.enterpriseLabel}</th>
                    <th>{t.reportsView.invTable.colProject}</th>
                    <th>{t.wf04Phase2a.caseQueue.alertCountLabel}</th>
                    <th>{t.wf04Phase2a.caseQueue.reportConclusionLabel}</th>
                    <th>{t.wf04Phase2a.caseQueue.statusLabel}</th>
                    <th>{t.wf04Phase2a.caseQueue.updatedAtLabel}</th>
                    <th style={{ textAlign: "right" }}>
                      {t.wf04Phase2a.caseQueue.actionsLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {wf04FilteredConfirmedViews.length === 0 ? (
                    <tr>
                      <td className={styles.emptyState} colSpan={8}>
                        {t.wf04Phase2c.smeFeedback.emptyConfirmedNotice}
                      </td>
                    </tr>
                  ) : (
                    wf04FilteredConfirmedViews.map((view) => {
                      const isInspecting = inspectedConfirmedView?.caseId === view.caseId;
                      const sentFeedback = findFeedbackForConfirmedReport({
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
                            <div className={styles.muted} style={{ fontSize: 12, marginTop: 2 }}>
                              v{view.conclusion.reportVersion}
                            </div>
                          </td>
                          <td>{enterpriseNameById.get(view.enterpriseId) ?? view.enterpriseId}</td>
                          <td>{resolveCaseProjectsText(view.alerts)}</td>
                          <td>
                            <span className={styles.ruleTag}>
                              {t.wf04Phase2a.caseQueue.alertCountBadge.replace(
                                "{count}",
                                String(view.alertIds.length),
                              )}
                            </span>
                          </td>
                          <td style={{ maxWidth: 320, whiteSpace: "normal" }}>
                            {view.conclusion.summary}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${getWf04StatusBadgeClass(view.status)}`}>
                              {getWf04StatusLabel(view.status, t)}
                            </span>
                            {sentFeedback && (
                              <div style={{ marginTop: 6 }}>
                                <span className={styles.feedbackCountBadge}>
                                  {t.wf04Phase2c.smeFeedback.sentBadge}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            {new Date(view.closedAt || view.updatedAt).toLocaleString(dateLocale)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {sentFeedback ? (
                                <button
                                  type="button"
                                  className={styles.button}
                                  onClick={() => setFeedbackCaseId(view.caseId)}
                                >
                                  {t.wf04Phase2c.smeFeedback.viewSentBtn}
                                </button>
                              ) : (
                                onSubmitReportFeedback && (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => setFeedbackCaseId(view.caseId)}
                                  >
                                    {t.wf04Phase2c.smeFeedback.sendBtn}
                                  </button>
                                )
                              )}
                              <button
                                type="button"
                                className={styles.button}
                                aria-expanded={isInspecting}
                                onClick={() =>
                                  setInspectedCaseId(isInspecting ? null : view.caseId)
                                }
                              >
                                {isInspecting
                                  ? t.wf04Phase2b.versionViewer.hideVersionBtn
                                  : t.wf04Phase2b.versionViewer.viewVersionBtn}
                              </button>
                              {onOpenInvestigationCase && (
                                <button
                                  type="button"
                                  className={styles.button}
                                  onClick={() => onOpenInvestigationCase(view.caseId)}
                                >
                                  <Eye size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} aria-hidden="true" />
                                  {t.wf04Phase2a.alertQueue.viewCaseBtn}
                                </button>
                              )}
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

          {inspectedConfirmedView && (() => {
            const inspectedSentFeedback = findFeedbackForConfirmedReport({
              feedbacks: reportFeedbacks,
              enterpriseId: inspectedConfirmedView.enterpriseId,
              caseId: inspectedConfirmedView.caseId,
              reportId: inspectedConfirmedView.conclusion.reportId,
              reportVersion: inspectedConfirmedView.conclusion.reportVersion,
            });
            return (
            <section className={styles.panel} style={{ marginTop: 18 }}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {inspectedConfirmedView.caseId} ·{" "}
                    {t.wf04Phase2b.reportsView.alertEvaluationsHeading}
                  </h2>
                  <p className={styles.muted}>
                    {t.wf04Phase2b.confirmClose.confirmedVersionLabel}: v
                    {inspectedConfirmedView.conclusion.reportVersion} (
                    {inspectedConfirmedView.conclusion.reportId})
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {inspectedSentFeedback ? (
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => setFeedbackCaseId(inspectedConfirmedView.caseId)}
                    >
                      {t.wf04Phase2c.smeFeedback.viewSentBtn}
                    </button>
                  ) : (
                    onSubmitReportFeedback && (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={() => setFeedbackCaseId(inspectedConfirmedView.caseId)}
                      >
                        {t.wf04Phase2c.smeFeedback.sendBtn}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setInspectedCaseId(null)}
                  >
                    {t.wf04Phase2b.versionViewer.hideVersionBtn}
                  </button>
                </div>
              </div>
              <div className={styles.confirmReviewPanel}>
                <p style={{ margin: 0 }}>{inspectedConfirmedView.conclusion.summary}</p>
                <div className={styles.reportAlertList}>
                  {inspectedConfirmedView.conclusion.alertResults.map((item) => (
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
            </section>
            );
          })()}
          <ReportFeedbackModal
            open={Boolean(feedbackCaseId && wf04Authorized.isSmeAdmin)}
            caseId={feedbackCaseId}
            actor={currentUser}
            cases={investigationCases ?? []}
            enterprises={enterprises ?? []}
            users={users}
            feedbacks={reportFeedbacks}
            onClose={() => setFeedbackCaseId(null)}
            onSubmit={onSubmitReportFeedback}
          />
        </>
      );
    }

    const totalCases = wf04FilteredInternalCases.length;
    const pendingReviewCount = wf04FilteredInternalCases.filter(
      (c) => c.status === "Pending Review",
    ).length;
    const closedCount = wf04FilteredInternalCases.filter(
      (c) => c.status === "Closed",
    ).length;
    const totalReportVersions = wf04FilteredInternalCases.reduce(
      (sum, c) => sum + c.reports.length,
      0,
    );
    const hasWf04Filter =
      wf04Range !== "all" || filterProject !== "all" || wf04StatusFilter !== "all";
    const inspectedInternalCase = inspectedCaseId
      ? wf04FilteredInternalCases.find((c) => c.caseId === inspectedCaseId) ?? null
      : null;
    const inspectedVersionNumber = inspectedInternalCase
      ? (selectedVersionByCase[inspectedInternalCase.caseId] ??
        (inspectedInternalCase.reports.length > 0
          ? inspectedInternalCase.reports[inspectedInternalCase.reports.length - 1].version
          : undefined))
      : undefined;
    const inspectedReportVersion =
      inspectedInternalCase && inspectedVersionNumber !== undefined
        ? inspectedInternalCase.reports.find((r) => r.version === inspectedVersionNumber) ??
          inspectedInternalCase.reports[inspectedInternalCase.reports.length - 1]
        : undefined;

    return (
      <>
        <div className={styles.pageHeading}>
          <div>
            <h1>{isInvestigator ? t.reportsView.invTitle : t.reportsView.execTitle}</h1>
            <p>{isInvestigator ? t.reportsView.invSubtitle : t.reportsView.execSubtitle}</p>
          </div>
          {permissions?.canExport && (
            <button
              className={styles.btnPrimary}
              onClick={handleExportWf04Cases}
              type="button"
            >
              <Download size={15} style={{ marginRight: 6 }} aria-hidden="true" />
              {t.reportsView.btnExport}
            </button>
          )}
        </div>

        <div className={styles.drawerReadOnlyNotice} style={{ marginBottom: 18 }}>
          {t.wf04Phase2b.reportsView.sectionSubtitle}
        </div>

        <div className={styles.toolbar} style={{ marginBottom: 20 }}>
          <div className={styles.toolbarGroup}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.timeRange}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.timeRange}
                value={String(wf04Range)}
                onChange={(e) =>
                  setWf04Range(e.target.value === "all" ? "all" : Number(e.target.value))
                }
              >
                <option value="all">{t.wf04Phase2a.caseQueue.tabAll}</option>
                <option value="7">{t.reportsView.invFilters.days7}</option>
                <option value="30">{t.reportsView.invFilters.days30}</option>
                <option value="90">{t.reportsView.invFilters.days90}</option>
              </select>
            </label>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.project}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.project}
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
              >
                <option value="all">{t.reportsView.invFilters.allProjects}</option>
                {wf04Projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.status}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.status}
                value={wf04StatusFilter}
                onChange={(e) =>
                  setWf04StatusFilter(e.target.value as "all" | InvestigationCaseStatus)
                }
              >
                <option value="all">{t.wf04Phase2a.caseQueue.tabAll}</option>
                <option value="Open">{t.wf04Phase2a.caseQueue.statuses.open}</option>
                <option value="Investigating">
                  {t.wf04Phase2a.caseQueue.statuses.investigating}
                </option>
                <option value="Pending Review">
                  {t.wf04Phase2a.caseQueue.statuses.pendingReview}
                </option>
                <option value="Closed">{t.wf04Phase2a.caseQueue.statuses.closed}</option>
              </select>
            </label>
            {hasWf04Filter && (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => {
                  setWf04Range("all");
                  setFilterProject("all");
                  setWf04StatusFilter("all");
                }}
              >
                {t.wf04Phase2a.caseQueue.resetFiltersBtn}
              </button>
            )}
          </div>
        </div>

        <section className={styles.caseMetricsGrid} style={{ marginBottom: 20 }}>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>
              {t.wf04Phase2b.reportsView.casesCountLabel}
            </div>
            <strong className={styles.statValue}>{totalCases}</strong>
            <span className={styles.statDescription}>
              {t.wf04Phase2b.reportsView.casesCountDesc}
            </span>
          </article>
          <article className={`${styles.statCard} ${styles.statWarning}`}>
            <div className={styles.statLabel}>
              {t.wf04Phase2b.reportsView.pendingReviewCountLabel}
            </div>
            <strong className={styles.statValue}>{pendingReviewCount}</strong>
            <span className={styles.statDescription}>
              {t.wf04Phase2b.reportsView.pendingReviewCountDesc}
            </span>
          </article>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>
              {t.wf04Phase2b.reportsView.confirmedCasesCountLabel}
            </div>
            <strong className={styles.statValue} style={{ color: "var(--security-green)" }}>
              {closedCount}
            </strong>
            <span className={styles.statDescription}>
              {t.wf04Phase2b.reportsView.confirmedCasesCountDesc}
            </span>
          </article>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>
              {t.wf04Phase2b.reportsView.reportVersionsCountLabel}
            </div>
            <strong className={styles.statValue} style={{ color: "var(--security-blue)" }}>
              {totalReportVersions}
            </strong>
            <span className={styles.statDescription}>
              {t.wf04Phase2b.reportsView.reportVersionsCountDesc}
            </span>
          </article>
        </section>

        <section className={styles.panel} style={{ marginBottom: 20 }}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{t.reportsView.execCharts.outcomesTitle}</h2>
              <p className={styles.muted}>{t.reportsView.execCharts.outcomesDesc}</p>
            </div>
          </div>
          <div className={styles.chartArea} style={{ height: 240 }}>
            {wf04StatusChartData.length === 0 ? (
              <p className={styles.ruleEmpty}>{t.wf04Phase2a.caseQueue.emptyQueue}</p>
            ) : mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wf04StatusChartData}>
                  <CartesianGrid stroke="var(--security-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--security-muted)" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="var(--security-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--security-panel)",
                      border: "1px solid var(--security-border)",
                      borderRadius: 4,
                      color: "var(--security-text)",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {wf04StatusChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.tablePanel}`}>
          <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
            <div>
              <h2>{t.wf04Phase2b.reportsView.sectionTitle}</h2>
              <p className={styles.muted}>
                {t.reportsView.invTable.subtitle.replace(
                  "{count}",
                  String(wf04FilteredInternalCases.length),
                )}
              </p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.wf04Phase2a.caseQueue.caseCodeLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.enterpriseLabel}</th>
                  <th>{t.reportsView.invTable.colProject}</th>
                  <th>{t.wf04Phase2a.caseQueue.alertCountLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.statusLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.assigneeLabel}</th>
                  <th>{t.wf04Phase2a.caseQueue.reportPreviewSectionTitle}</th>
                  <th>{t.wf04Phase2a.caseQueue.updatedAtLabel}</th>
                  <th style={{ textAlign: "right" }}>
                    {t.wf04Phase2a.caseQueue.actionsLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {wf04FilteredInternalCases.length === 0 ? (
                  <tr>
                    <td className={styles.emptyState} colSpan={9}>
                      {wf04Authorized.internalCases.length === 0
                        ? t.wf04Phase2b.reportsView.noReportsEmpty
                        : t.wf04Phase2a.caseQueue.filterNoResults}
                    </td>
                  </tr>
                ) : (
                  wf04FilteredInternalCases.map((c) => {
                    const latestReport =
                      c.reports.length > 0 ? c.reports[c.reports.length - 1] : undefined;
                    const previewText =
                      c.conclusion?.summary ??
                      latestReport?.summary ??
                      t.wf04Phase2a.caseQueue.reportPreviewEmpty;
                    const isInspecting = inspectedInternalCase?.caseId === c.caseId;
                    return (
                      <tr key={c.caseId}>
                        <td>
                          <strong>{c.caseId}</strong>
                          {latestReport && (
                            <div className={styles.muted} style={{ fontSize: 12, marginTop: 2 }}>
                              v{latestReport.version} ({c.reports.length})
                            </div>
                          )}
                        </td>
                        <td>{enterpriseNameById.get(c.enterpriseId) ?? c.enterpriseId}</td>
                        <td>{resolveCaseProjectsText(c.alerts)}</td>
                        <td>
                          <span className={styles.ruleTag}>
                            {t.wf04Phase2a.caseQueue.alertCountBadge.replace(
                              "{count}",
                              String(c.alertIds.length),
                            )}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${getWf04StatusBadgeClass(c.status)}`}>
                            {getWf04StatusLabel(c.status, t)}
                          </span>
                        </td>
                        <td>{resolveActorName(c.assignee)}</td>
                        <td style={{ maxWidth: 280, whiteSpace: "normal" }}>{previewText}</td>
                        <td>{new Date(c.updatedAt || c.createdAt).toLocaleString(dateLocale)}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {c.reports.length > 0 && (
                              <button
                                type="button"
                                className={styles.button}
                                aria-expanded={isInspecting}
                                onClick={() =>
                                  setInspectedCaseId(isInspecting ? null : c.caseId)
                                }
                              >
                                {isInspecting
                                  ? t.wf04Phase2b.versionViewer.hideVersionBtn
                                  : t.wf04Phase2b.versionViewer.viewVersionBtn}
                              </button>
                            )}
                            {onOpenInvestigationCase && (
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => onOpenInvestigationCase(c.caseId)}
                              >
                                <Eye size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} aria-hidden="true" />
                                {t.wf04Phase2a.alertQueue.viewCaseBtn}
                              </button>
                            )}
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

        {inspectedInternalCase && inspectedReportVersion && (
          <section className={styles.panel} style={{ marginTop: 18 }}>
            <div className={styles.panelHeader}>
              <div>
                <h2>
                  {inspectedInternalCase.caseId} ·{" "}
                  {t.wf04Phase2b.reportsView.alertEvaluationsHeading}
                </h2>
                <p className={styles.muted}>
                  {t.wf04Phase2b.versionViewer.submittedByLabel}:{" "}
                  {resolveActorName(inspectedReportVersion.submittedBy)} ·{" "}
                  {new Date(inspectedReportVersion.submittedAt).toLocaleString(dateLocale)}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>
                    {t.wf04Phase2b.reportsView.versionSelectorLabel}
                  </span>
                  <select
                    className={styles.control}
                    aria-label={t.wf04Phase2b.reportsView.versionSelectorLabel}
                    value={String(inspectedReportVersion.version)}
                    onChange={(e) =>
                      setSelectedVersionByCase((prev) => ({
                        ...prev,
                        [inspectedInternalCase.caseId]: Number(e.target.value),
                      }))
                    }
                  >
                    {inspectedInternalCase.reports.map((rep) => (
                      <option key={rep.reportId} value={String(rep.version)}>
                        {t.wf04Phase2b.versionViewer.versionItemLabel.replace(
                          "{version}",
                          String(rep.version),
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setInspectedCaseId(null)}
                >
                  {t.wf04Phase2b.versionViewer.hideVersionBtn}
                </button>
              </div>
            </div>
            <div className={styles.reportVersionCard}>
              <p style={{ margin: 0 }}>{inspectedReportVersion.summary}</p>
              <div className={styles.reportAlertList}>
                {inspectedReportVersion.alertResults.map((item) => (
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
          </section>
        )}
      </>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER INVESTIGATOR VIEW
  ───────────────────────────────────────────────────────────── */
  if (isInvestigator) {
    return (
      <>
        <div className={styles.pageHeading}>
          <div>
            <h1>{t.reportsView.invTitle}</h1>
            <p>{t.reportsView.invSubtitle}</p>
          </div>
        </div>

        {/* Investigator KPI Cards */}
        <section className={styles.metricsGrid} style={{ marginTop: 20 }}>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>{t.reportsView.kpis.totalAssigned}</div>
            <strong className={styles.statValue}>{investigatorStats.total}</strong>
            <span className={styles.statDescription}>
              {t.reportsView.kpis.totalAssignedDesc}
            </span>
          </article>
          <article className={`${styles.statCard} ${styles.statWarning}`}>
            <div className={styles.statLabel}>
              {t.reportsView.kpis.awaitingApproval}
            </div>
            <strong className={styles.statValue}>{investigatorStats.reported}</strong>
            <span className={styles.statDescription}>
              {t.reportsView.kpis.awaitingApprovalDesc}
            </span>
          </article>
          <article className={`${styles.statCard} ${styles.statCritical}`}>
            <div className={styles.statLabel}>
              {t.reportsView.kpis.confirmedFraud}
            </div>
            <strong className={styles.statValue}>
              {investigatorStats.confirmedFraud}
            </strong>
            <span className={styles.statDescription}>
              {t.reportsView.kpis.confirmedFraudDesc}
            </span>
          </article>
          <article className={styles.statCard}>
            <div className={styles.statLabel}>{t.reportsView.kpis.falseAlarm}</div>
            <strong
              className={styles.statValue}
              style={{ color: "var(--security-green)" }}
            >
              {investigatorStats.falseAlarm}
            </strong>
            <span className={styles.statDescription}>
              {t.reportsView.kpis.falseAlarmDesc}
            </span>
          </article>
        </section>

        {/* Toolbar Filters for Investigator */}
        <div className={styles.toolbar} style={{ marginTop: 20, marginBottom: 20 }}>
          <div className={styles.toolbarGroup}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.timeRange}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.timeRange}
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
              >
                <option value={7}>{t.reportsView.invFilters.days7}</option>
                <option value={30}>{t.reportsView.invFilters.days30}</option>
                <option value={90}>{t.reportsView.invFilters.days90}</option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.project}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.project}
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
              >
                <option value="all">{t.reportsView.invFilters.allProjects}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.finding}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.finding}
                value={filterFinding}
                onChange={(e) => setFilterFinding(e.target.value)}
              >
                <option value="all">{t.reportsView.invFilters.allFindings}</option>
                <option value="Suspicious">{t.findings.suspicious}</option>
                <option value="Legitimate">{t.findings.legitimate}</option>
                <option value="Need More Info">{t.findings.needMoreInfo}</option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t.reportsView.invFilters.status}</span>
              <select
                className={styles.control}
                aria-label={t.reportsView.invFilters.status}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">{t.reportsView.invFilters.allStatuses}</option>
                <option value="Reported">{t.caseStatus.reported}</option>
                <option value="Confirmed Fraud">{t.caseStatus.confirmedFraud}</option>
                <option value="False Alarm">{t.caseStatus.falseAlarm}</option>
                <option value="Resolved">{t.caseStatus.resolved}</option>
                <option value="Investigating">{t.caseStatus.investigating}</option>
              </select>
            </label>
          </div>
        </div>

        {/* Investigator Case History Table */}
        <section className={`${styles.panel} ${styles.tablePanel}`}>
          <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
            <div>
              <h2>{t.reportsView.invTable.title}</h2>
              <p className={styles.muted}>
                {t.reportsView.invTable.subtitle.replace(
                  "{count}",
                  String(filteredInvestigatorCases.length),
                )}
              </p>
            </div>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.reportsView.invTable.colCase}</th>
                  <th>{t.reportsView.invTable.colProject}</th>
                  <th>{t.table.columns.assessment}</th>

                  <th>{t.reportsView.invTable.colFinding}</th>
                  <th>{t.reportsView.invTable.colDecision}</th>
                  <th>{t.reportsView.invTable.colTime}</th>
                  <th style={{ textAlign: "right" }}>
                    {t.reportsView.invTable.colActions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInvestigatorCases.length === 0 ? (
                  <tr>
                    <td className={styles.emptyState} colSpan={7}>
                      {t.reportsView.invTable.emptyMessage}
                    </td>
                  </tr>
                ) : (
                  filteredInvestigatorCases.map((tx) => {
                    const findingStyle = tx.investigationReport
                      ? getFindingBadgeStyle(tx.investigationReport.finding, t)
                      : null;
                    const decisionStyle = tx.caseStatus
                      ? getDecisionBadgeStyle(tx.caseStatus, t)
                      : null;

                    return (
                      <tr key={tx.id}>
                        <td>
                          <span className={styles.findingName}>
                            {tx.caseId || "N/A"}
                          </span>
                          <span className={styles.findingMeta}>
                            Ref: {tx.transactionReference}
                          </span>
                          <span className={styles.findingMeta}>
                            Entity: {tx.entityReference}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--security-text)" }}>
                            {tx.projectName}
                          </span>
                          <span className={styles.findingMeta}>
                            {tx.transactionType}
                            {tx.amount != null
                              ? ` · ${tx.amount.toLocaleString(dateLocale)} ${tx.currency}`
                              : ""}
                          </span>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            <RiskLevelBadge riskLevel={tx.riskLevel} />

                          </div>
                          <ScoringSourceBadge source={tx.scoringSource} />
                        </td>
                        <td>
                          {findingStyle ? (
                            <div>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: findingStyle.bg,
                                  color: findingStyle.text,
                                  border: `1px solid ${findingStyle.border}`,
                                  marginBottom: 4,
                                }}
                              >
                                {findingStyle.label}
                              </span>
                              {tx.investigationReport?.notes && (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: 12,
                                    color: "var(--security-text-secondary)",
                                    lineHeight: 1.4,
                                    maxWidth: 320,
                                    whiteSpace: "normal",
                                  }}
                                >
                                  {tx.investigationReport.notes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--security-muted)", fontSize: 12 }}>
                              {t.reportsView.invTable.noReportYet}
                            </span>
                          )}
                        </td>
                        <td>
                          {decisionStyle ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 9px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                background: decisionStyle.bg,
                                color: decisionStyle.text,
                                border: `1px solid ${decisionStyle.border}`,
                              }}
                            >
                              {decisionStyle.label}
                            </span>
                          ) : (
                            <span style={{ color: "var(--security-muted)", fontSize: 12 }}>
                              {tx.caseStatus || t.reportsView.invTable.pendingDecision}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "var(--security-text)" }}>
                            {new Date(tx.processedAt).toLocaleDateString(dateLocale)}
                          </span>
                          <span className={styles.findingMeta}>
                            {new Date(tx.processedAt).toLocaleTimeString(dateLocale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {onReview && (
                            <button
                              className={styles.button}
                              onClick={() => onReview(tx)}
                              type="button"
                              title={t.reportsView.invTable.viewDetails}
                              style={{ fontSize: 12, padding: "6px 12px" }}
                            >
                              <Eye
                                size={13}
                                style={{ marginRight: 5, verticalAlign: "-2px" }}
                              />
                              {t.reportsView.invTable.viewDetails}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER EXECUTIVE / MACRO VIEW (SME Admin, Operation, Viewer, etc.)
  ───────────────────────────────────────────────────────────── */
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>{t.reportsView.execTitle}</h1>
          <p>{t.reportsView.execSubtitle}</p>
        </div>
        {permissions?.canExport && (
          <button
            className={styles.btnPrimary}
            onClick={handleExportSummaryCSV}
            type="button"
          >
            <Download size={15} style={{ marginRight: 6 }} />
            {t.reportsView.btnExport}
          </button>
        )}
      </div>

      {/* Toolbar Filters */}
      <div className={styles.toolbar} style={{ marginTop: 24, marginBottom: 20 }}>
        <div className={styles.toolbarGroup}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t.reportsView.invFilters.timeRange}</span>
            <select
              className={styles.control}
              aria-label={t.reportsView.invFilters.timeRange}
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
            >
              <option value={7}>{t.reportsView.invFilters.days7}</option>
              <option value={30}>{t.reportsView.invFilters.days30}</option>
              <option value={90}>{t.reportsView.invFilters.days90}</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t.reportsView.invFilters.project}</span>
            <select
              className={styles.control}
              aria-label={t.reportsView.invFilters.project}
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="all">{t.reportsView.invFilters.allProjects}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* KPI Cards */}
      <section className={styles.metricsGrid}>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.reportsView.execKpis.analyzedTxns}</div>
          <strong className={styles.statValue}>{macroMetrics.total}</strong>
          <span className={styles.statDescription}>
            {t.reportsView.execKpis.inLastDays.replace("{range}", String(range))}
          </span>
        </article>
        <article className={`${styles.statCard} ${styles.statCritical}`}>
          <div className={styles.statLabel}>{t.reportsView.execKpis.anomalyRate}</div>
          <strong className={styles.statValue}>{macroMetrics.fraudRate}%</strong>
          <span className={styles.statDescription}>
            {t.reportsView.execKpis.anomalyRateDesc
              .replace("{count}", String(macroMetrics.highRisk))}
          </span>
        </article>
        <article className={`${styles.statCard} ${styles.statWarning}`}>
          <div className={styles.statLabel}>
            {t.reportsView.execKpis.falseAlarmRate}
          </div>
          <strong className={styles.statValue}>{macroMetrics.falseAlarmRate === null ? '-' : `${macroMetrics.falseAlarmRate}%`}</strong>
          <span className={styles.statDescription}>
            {macroMetrics.falseAlarmRate === null
              ? (language === 'vi' ? 'Chưa có kết luận gian lận hoặc cảnh báo nhầm để tính tỷ lệ.' : 'No confirmed fraud or false alarm conclusions yet.')
              : t.reportsView.execKpis.falseAlarmRateDesc}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.reportsView.execKpis.aiCoverage}</div>
          <strong
            className={styles.statValue}
            style={{ color: "var(--security-purple)" }}
          >
            {macroMetrics.aiCoverage}%
          </strong>
          <span className={styles.statDescription}>
            {t.reportsView.execKpis.fallbackCoverage.replace(
              "{rate}",
              macroMetrics.fallbackRate,
            )}
          </span>
        </article>
      </section>

      {/* Charts Grid */}
      <section className={styles.chartGrid} style={{ marginBottom: 20 }}>
        {/* Chart 1: Case Conclusion Breakdown */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{t.reportsView.execCharts.outcomesTitle}</h2>
              <p className={styles.muted}>{t.reportsView.execCharts.outcomesDesc}</p>
            </div>
          </div>
          <div className={styles.chartArea} style={{ height: 260 }}>
            {!conclusionData.length ? <p className={styles.ruleEmpty}>{language === 'vi' ? 'Chưa có hồ sơ điều tra trong khoảng đã chọn.' : 'No investigation cases in this period.'}</p> : mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conclusionData}>
                  <CartesianGrid
                    stroke="var(--security-border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="name"
                    stroke="var(--security-muted)"
                    fontSize={11}
                  />
                  <YAxis stroke="var(--security-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--security-panel)",
                      border: "1px solid var(--security-border)",
                      borderRadius: 4,
                      color: "var(--security-text)",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {conclusionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        {/* Chart 2: Scoring Source Breakdown */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{t.reportsView.execCharts.scoringTitle}</h2>
              <p className={styles.muted}>{t.reportsView.execCharts.scoringDesc}</p>
            </div>
          </div>
          <div className={styles.chartArea} style={{ height: 260 }}>
            {!filteredMacro.length ? <p className={styles.ruleEmpty}>{language === 'vi' ? 'Chưa có giao dịch trong khoảng đã chọn. Thử chọn khoảng thời gian dài hơn.' : 'No transactions in this period. Try a longer time range.'}</p> : mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoringData}>
                  <CartesianGrid
                    stroke="var(--security-border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="name"
                    stroke="var(--security-muted)"
                    fontSize={11}
                  />
                  <YAxis stroke="var(--security-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--security-panel)",
                      border: "1px solid var(--security-border)",
                      borderRadius: 4,
                      color: "var(--security-text)",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoringData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      </section>

      {/* Project Breakdown Table */}
      <section className={`${styles.panel} ${styles.tablePanel}`}>
        <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
          <div>
            <h2>{t.reportsView.execTable.title}</h2>
            <p className={styles.muted}>{t.reportsView.execTable.subtitle}</p>
          </div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.reportsView.execTable.colProject}</th>
                <th>{t.reportsView.execTable.colTotal}</th>
                <th>{t.reportsView.execTable.colAnomaly}</th>
                <th>{t.reportsView.execTable.colConfirmed}</th>
                <th>{t.reportsView.execTable.colRate}</th>
              </tr>
            </thead>
            <tbody>
              {projectStats.map((stat) => (
                <tr key={stat.id}>
                  <td style={{ fontWeight: 600, color: "var(--security-text)" }}>
                    {stat.name}
                  </td>
                  <td>{stat.total.toLocaleString(dateLocale)}</td>
                  <td style={{ color: "var(--security-orange)" }}>
                    {stat.highRisk}
                  </td>
                  <td style={{ color: "var(--security-red)", fontWeight: 600 }}>
                    {stat.confirmed}
                  </td>
                  <td>
                    {stat.total > 0
                      ? `${((stat.highRisk / stat.total) * 100).toFixed(1)}%`
                      : "0%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
