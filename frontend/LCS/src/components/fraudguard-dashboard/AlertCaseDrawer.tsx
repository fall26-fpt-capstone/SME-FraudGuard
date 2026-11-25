"use client";

import { useEffect, useState } from "react";
import { isCaseAssignee } from '@/utils/case-workflow';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type {
  CaseDecision,
  CaseNote,
  CaseStatus,
  InvestigationFinding,
  InvestigationReport,
  RolePermissions,
  TransactionRisk,
  UserProfile,
  UserRole,
} from "@/types/fraudguard";
import type {
  InvestigationCase,
  InvestigationCaseStatus,
} from "@/types/investigation-case";
import {
  canActorViewLegacyArchiveEntry,
  type LegacyCaseArchiveEntry,
} from "@/utils/case-migration";
import { evaluateInvestigationCaseReadAccess } from "@/utils/investigation-case";
import { RuleEvaluationDetails } from "./RuleEvaluationDetails";
import { transactionLabel } from "./ReadableConditions";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { ScoringSourceBadge } from "./ScoringSourceBadge";
import { useToast } from "@/context/ToastProvider";
import { useLanguage } from "@/context/LanguageContext";
import type { Language, TranslationKey } from "@/config/translations";
import styles from "./SecurityDashboard.module.css";
import {
  CheckCircle2,
  AlertOctagon,
  UserCheck,
  Clock,
  RotateCcw,
  Check,
  Send,
  Play,
  ShieldCheck,
  User,
} from "lucide-react";

interface AlertCaseDrawerProps {
  transaction: TransactionRisk | null;
  investigators?: string[];
  open: boolean;
  onClose: () => void;
  onUpdateTransaction?: (updated: TransactionRisk) => void;
  permissions?: RolePermissions;
  currentRole?: UserRole;
  currentUserName?: string;
  currentUserId?: string;
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveEntry[];
  users?: readonly UserProfile[];
  currentUser?: UserProfile;
  onOpenInvestigationCase?: (caseId: string) => void;
  wf04Managed?: boolean;
}

function getWf04CaseStatusBadgeClass(status: InvestigationCaseStatus): string {
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

function getWf04CaseStatusLabel(
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



interface RuleEvidenceDetail {
  code: string;
  name: string;
  observed: string;
  threshold: string;
}

function getRuleEvidenceDetails(transaction: TransactionRisk, language: Language): RuleEvidenceDetail[] {
  return transaction.triggeredRules.map((name) => {
    const evidence = transaction.ruleEvidence?.find((item) => item.code === name || item.name === name);
    return {
      code: evidence?.code ?? name,
      name: evidence?.name ?? name,
      observed: evidence?.observed ?? (language === "vi" ? "Chưa có dữ liệu bằng chứng chi tiết." : "Detailed evidence is not available."),
      threshold: evidence?.condition ?? (language === "vi" ? "Chưa có bản ghi điều kiện tại thời điểm phát hiện." : "No condition snapshot is available for this detection."),
    };
  });
}

const WORKFLOW_STEP_KEYS: Array<{ key: keyof TranslationKey["drawer"]["stepper"] }> = [
  { key: "created" },
  { key: "assigned" },
  { key: "investigating" },
  { key: "reported" },
  { key: "closed" },
];

function getWorkflowStepIndex(status?: CaseStatus): number {
  if (!status || status === "Open") return 0;
  if (status === "Assigned") return 1;
  if (status === "Investigating") return 2;
  if (status === "Reported") return 3;
  return 4; // Confirmed Fraud, False Alarm, Resolved
}

function getFindingInfo(finding: InvestigationFinding, t: TranslationKey) {
  switch (finding) {
    case "Suspicious":
      return {
        label: t.findings.suspicious,
        bg: "var(--critical-bg)",
        text: "var(--critical-text)",
        border: "var(--critical-border)",
        desc: t.findingsDetails.suspiciousDesc,
      };
    case "Legitimate":
      return {
        label: t.findings.legitimate,
        bg: "rgba(120, 201, 172, 0.15)",
        text: "var(--security-green)",
        border: "#3f665a",
        desc: t.findingsDetails.legitimateDesc,
      };
    case "Need More Info":
      return {
        label: t.findings.needMoreInfo,
        bg: "rgba(237, 167, 101, 0.15)",
        text: "var(--security-orange)",
        border: "#715139",
        desc: t.findingsDetails.needMoreInfoDesc,
      };
    default:
      return {
        label: finding,
        bg: "var(--security-control)",
        text: "var(--security-muted)",
        border: "var(--security-border)",
        desc: "",
      };
  }
}

export function AlertCaseDrawer({
  investigators = [],
  transaction,
  open,
  onClose,
  onUpdateTransaction,
  permissions,
  currentRole = "Operator",
  currentUserName = "Trần Mai Anh",
  currentUserId,
  investigationCases,
  legacyCaseArchive,
  users,
  currentUser,
  onOpenInvestigationCase,
  wf04Managed = false,
}: AlertCaseDrawerProps) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const drawerRef = useDialogFocus(open, onClose);

  // Investigator zone local inputs
  const [investigatorNote, setInvestigatorNote] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [selectedFinding, setSelectedFinding] = useState<InvestigationFinding>("Suspicious");
  const [reportNote, setReportNote] = useState("");

  // Operation zone local inputs
  const [selectedInvestigator, setSelectedInvestigator] = useState(
    transaction?.assignedInvestigator || investigators[0] || '',
  );
  const [operationFeedback, setOperationFeedback] = useState("");
  const [isMutating, setIsMutating] = useState(false);


  // Sync state when transaction opens/changes
  useEffect(() => {
    if (transaction) {
      setSelectedInvestigator(transaction.assignedInvestigator || investigators[0] || '');
      if (transaction.investigationReport) {
        setSelectedFinding(transaction.investigationReport.finding);
        setEvidenceNotes(transaction.investigationReport.evidenceNotes || "");
        setReportNote(transaction.investigationReport.notes || "");
      } else {
        setSelectedFinding("Suspicious");
        setEvidenceNotes("");
        setReportNote("");
      }
      setInvestigatorNote("");
      setOperationFeedback("");
    }
  }, [transaction?.id, transaction?.caseStatus]);

  if (!open || !transaction) return null;

  const numLocale = language === "vi" ? "vi-VN" : "en-US";
  const isWf04Locked =
    wf04Managed === true ||
    investigationCases !== undefined ||
    legacyCaseArchive !== undefined ||
    onOpenInvestigationCase !== undefined;

  const effectiveUser: UserProfile | undefined =
    currentUser ??
    (currentUserId && users ? users.find((u) => u.id === currentUserId) : undefined) ??
    (currentRole
      ? {
          id: currentUserId ?? "",
          name: currentUserName ?? "",
          email: "",
          role: currentRole,
          title: "",
          avatarLetter: "",
          avatarBg: "",
          description: "",
        }
      : undefined);

  const txAlertId = transaction.alertId;
  const linkedCase =
    isWf04Locked && investigationCases
      ? investigationCases.find(
          (c) =>
            c.alerts.some(
              (a) =>
                a.transactionId === transaction.id ||
                (txAlertId ? a.alertId === txAlertId : false),
            ) || (Boolean(transaction.caseId) && c.caseId === transaction.caseId),
        )
      : undefined;

  const linkedLegacyEntry =
    isWf04Locked && !linkedCase && legacyCaseArchive
      ? legacyCaseArchive.find(
          (entry) =>
            entry.transactionIds.includes(transaction.id) ||
            (txAlertId ? entry.alertIds.includes(txAlertId) : false) ||
            (Boolean(transaction.caseId) && entry.legacyCaseId === transaction.caseId),
        )
      : undefined;

  const linkedCaseAccess =
    linkedCase && effectiveUser
      ? evaluateInvestigationCaseReadAccess(linkedCase, effectiveUser)
      : null;
  const canViewLinkedCase = Boolean(
    linkedCaseAccess &&
      (linkedCaseAccess.canViewInternalCase || linkedCaseAccess.canViewConfirmedReport),
  );
  const canViewLegacyArchive = Boolean(
    linkedLegacyEntry &&
      effectiveUser &&
      canActorViewLegacyArchiveEntry(linkedLegacyEntry, effectiveUser),
  );

  const resolveCaseActorName = (actorRef?: { actorId: string; name?: string }): string => {
    if (!actorRef) return t.wf04Phase2a.caseQueue.unassignedLabel;
    const matched = users?.find((u) => u.id === actorRef.actorId);
    return matched?.name || actorRef.name || actorRef.actorId;
  };

  // Role permissions
  const isPlatformAdmin = currentRole === "Platform Admin";
  const isAIAlert = transaction.scoringSource === "AI" && transaction.riskLevel === "Abnormal";
  const isOperation = !isWf04Locked && isAIAlert && currentRole === "Operator" && permissions?.canManageCases !== false;
  const isInvestigator = currentRole === "Investigator";
  const canWorkOnCase = !isWf04Locked && isAIAlert && (isInvestigator || currentRole === "Operator") && isCaseAssignee(transaction, { id: currentUserId, name: currentUserName });
  const canSelfInvestigate = !isWf04Locked && isAIAlert && currentRole === "Operator" && (!transaction.caseId || transaction.caseStatus === "Open");
  const isViewer = currentRole === "Viewer" || currentRole === "SME Admin" || isPlatformAdmin || permissions?.isReadOnly;

  const currentStep = getWorkflowStepIndex(transaction.caseStatus);

  // Handlers (legacy fallback only when WF-04 lock is inactive)
  const handleSelfInvestigate = () => {
    if (isWf04Locked || !onUpdateTransaction || !canSelfInvestigate || !currentUserName) return;
    onUpdateTransaction({ ...transaction, caseId: transaction.caseId || 'CASE-' + crypto.randomUUID(), caseStatus: 'Investigating', assignedInvestigator: currentUserName, assignedAt: new Date().toISOString(), investigationNotes: [...(transaction.investigationNotes || []), { text: language === 'vi' ? 'Nhân viên vận hành bắt đầu tự điều tra.' : 'Operator started investigating.', author: currentUserName, time: new Date().toISOString() }] });
  };
  const handleCreateCase = () => {
    if (isWf04Locked || !onUpdateTransaction || !isOperation || transaction.caseId || transaction.riskLevel !== "Abnormal") return;
    setIsMutating(true);
    {
      const updated: TransactionRisk = {
        ...transaction,
        caseId: `CASE-${Date.now().toString().slice(-6)}`,
        caseStatus: "Open",
      };
      onUpdateTransaction(updated);
      setIsMutating(false);
      toast(
        "success",
        language === "vi"
          ? `Đã tạo Hồ sơ ${updated.caseId} cho giao dịch ${transaction.transactionReference}`
          : `Created Case ${updated.caseId} for transaction ${transaction.transactionReference}`,
      );
    }
  };

  const handleAssignInvestigator = () => {
    if (isWf04Locked || !onUpdateTransaction || !isOperation || !selectedInvestigator || ["Confirmed Fraud", "False Alarm", "Resolved"].includes(transaction.caseStatus || "")) return;
    setIsMutating(true);
    {
      const updated: TransactionRisk = {
        ...transaction,
        caseId: transaction.caseId || `CASE-${Date.now().toString().slice(-6)}`,
        caseStatus: "Assigned",
        assignedInvestigator: selectedInvestigator,
        assignedAt: new Date().toISOString(),
      };
      onUpdateTransaction(updated);
      setIsMutating(false);
      toast(
        "success",
        language === "vi"
          ? `Đã phân công hồ sơ cho Điều tra viên ${selectedInvestigator}`
          : `Assigned case to Investigator ${selectedInvestigator}`,
      );
    }
  };

  // Investigator: Accept case & start field investigation
  const handleStartInvestigating = () => {
    if (isWf04Locked || !onUpdateTransaction || !canWorkOnCase || transaction.caseStatus !== "Assigned") return;
    setIsMutating(true);
    {
      const startNote: CaseNote = {
        text:
          language === "vi"
            ? "Điều tra viên đã tiếp nhận hồ sơ và bắt đầu quy trình thẩm định thực địa."
            : "Investigator accepted the case and started field investigation.",
        time: new Date().toISOString(),
        author: currentUserName || "Nguyễn Văn An",
      };
      const updated: TransactionRisk = {
        ...transaction,
        caseStatus: "Investigating",
        investigationNotes: [...(transaction.investigationNotes || []), startNote],
      };
      onUpdateTransaction(updated);
      setIsMutating(false);
      toast(
        "info",
        language === "vi"
          ? `Đã tiếp nhận hồ sơ. Trạng thái chuyển sang: Đang xác minh`
          : `Case accepted. Status updated to: Investigating`,
      );
    }
  };

  // Add field notes
  const handleAddInvestigatorNote = () => {
    if (isWf04Locked || !onUpdateTransaction || !investigatorNote.trim() || !canWorkOnCase || transaction.caseStatus !== "Investigating") return;
    const newNote: CaseNote = {
      text: investigatorNote.trim(),
      time: new Date().toISOString(),
      author:
        currentUserName ||
        (isInvestigator
          ? "Nguyễn Văn An"
          : language === "vi"
            ? "Vận hành"
            : "Operations"),
    };
    const updated: TransactionRisk = {
      ...transaction,
      investigationNotes: [...(transaction.investigationNotes || []), newNote],
    };
    onUpdateTransaction(updated);
    setInvestigatorNote("");
    toast(
      "info",
      language === "vi" ? "Đã cập nhật nhật ký xác minh" : "Investigation notes updated",
    );
  };

  // Investigator: Submit official investigation report
  const handleSubmitInvestigationReport = () => {
    if (isWf04Locked || !onUpdateTransaction) return;
    if (!canWorkOnCase || transaction.caseStatus !== "Investigating" || !reportNote.trim()) {
      toast("error", language === "vi" ? "Hãy nhập kết quả điều tra cho hồ sơ được giao." : "Enter findings for your assigned case."); return;
    }
    setIsMutating(true);
    {
      const report: InvestigationReport = {
        finding: selectedFinding,
        notes: reportNote.trim(),
        evidenceNotes: evidenceNotes.trim() || undefined,
        submittedAt: new Date().toISOString(),
        submittedBy: currentUserName || transaction.assignedInvestigator || "Nguyễn Văn An",
      };
      const logNote: CaseNote = {
        text:
          language === "vi"
            ? `[Nộp Báo cáo]: Đã hoàn thành thẩm định với kết luận đề xuất: ${selectedFinding.toUpperCase()}.`
            : `[Report Submitted]: Completed verification with proposed finding: ${selectedFinding.toUpperCase()}.`,
        time: new Date().toISOString(),
        author: currentUserName || "Nguyễn Văn An",
      };
      const updated: TransactionRisk = {
        ...transaction,
        caseStatus: "Reported",
        investigationReport: report,
        investigationNotes: [...(transaction.investigationNotes || []), logNote],
      };
      onUpdateTransaction(updated);
      setIsMutating(false);
      toast(
        "success",
        language === "vi"
          ? `Đã lưu báo cáo điều tra`
          : `Investigation report saved`,
      );
    }
  };

  // Operation: Final Authority Decision
  const handleOperationDecision = (
    newStatus: "Confirmed Fraud" | "False Alarm" | "Resolved" | "Investigating",
  ) => {
    if (isWf04Locked || !onUpdateTransaction) return;
    if (!isOperation || !transaction.caseId || !operationFeedback.trim()) { toast("error", language === "vi" ? "Nhập lý do trước khi quyết định." : "Enter a reason before deciding."); return; }
    setIsMutating(true);
    {
      const isReinvestigate = newStatus === "Investigating";
      const decision: CaseDecision = {
        status: newStatus,
        decidedBy: `${currentUserName || "Trần Mai Anh"} (${language === "vi" ? "Vận hành" : "Operations"})`,
        decidedAt: new Date().toISOString(),
        directive: operationFeedback.trim() || undefined,
      };

      const updated: TransactionRisk = {
        ...transaction,
        caseStatus: newStatus,
        caseDecision: isReinvestigate ? undefined : decision,
      };

      if (operationFeedback.trim()) {
        const feedbackNote: CaseNote = {
          text: isReinvestigate
            ? `[${language === "vi" ? "Yêu cầu Thẩm tra lại từ Lãnh đạo" : "Re-investigation Request from Lead"}]: ${operationFeedback.trim()}`
            : `[${language === "vi" ? "Chỉ đạo Phê duyệt Vận hành" : "Operations Verdict Directive"}]: ${operationFeedback.trim()}`,
          time: new Date().toISOString(),
          author: `${currentUserName || "Trần Mai Anh"} (${language === "vi" ? "Trưởng nhóm Vận hành" : "Operations Lead"})`,
        };
        updated.investigationNotes = [...(updated.investigationNotes || []), feedbackNote];
      }

      onUpdateTransaction(updated);
      setIsMutating(false);

      const labelMap: Record<string, string> = {
        "Confirmed Fraud": t.caseStatus.confirmedFraud,
        "False Alarm": t.caseStatus.falseAlarm,
        Resolved: t.caseStatus.resolved,
        Investigating: t.caseStatus.investigating,
      };
      toast(
        "success",
        language === "vi"
          ? `Hồ sơ ${transaction.caseId} đã chuyển sang: ${labelMap[newStatus]}`
          : `Case ${transaction.caseId} transitioned to: ${labelMap[newStatus]}`,
      );
    }
  };

  const getStatusBadgeStyle = (status?: CaseStatus) => {
    switch (status) {
      case "Open":
        return { bg: "rgba(237, 167, 101, 0.15)", text: "var(--security-orange)", border: "#715139" };
      case "Assigned":
        return { bg: "rgba(113, 185, 244, 0.15)", text: "var(--security-blue)", border: "#2d5a7b" };
      case "Investigating":
        return { bg: "rgba(173, 138, 243, 0.15)", text: "var(--security-purple)", border: "#5c4778" };
      case "Reported":
        return { bg: "var(--high-bg)", text: "var(--high-text)", border: "var(--high-border)" };
      case "Confirmed Fraud":
        return { bg: "var(--critical-bg)", text: "var(--critical-text)", border: "var(--critical-border)" };
      case "False Alarm":
      case "Resolved":
        return { bg: "rgba(120, 201, 172, 0.15)", text: "var(--security-green)", border: "#3f665a" };
      default:
        return { bg: "var(--security-control)", text: "var(--security-muted)", border: "var(--security-border)" };
    }
  };

  const getStatusDisplayLabel = (status?: CaseStatus) => {
    switch (status) {
      case "Open":
        return t.caseStatus.open;
      case "Assigned":
        return t.caseStatus.assigned;
      case "Investigating":
        return t.caseStatus.investigating;
      case "Reported":
        return t.caseStatus.reported;
      case "Confirmed Fraud":
        return t.caseStatus.confirmedFraud;
      case "False Alarm":
        return t.caseStatus.falseAlarm;
      case "Resolved":
        return t.caseStatus.resolved;
      default:
        return status || "";
    }
  };

  const statusStyle = getStatusBadgeStyle(transaction.caseStatus);
  const ruleEvidences = getRuleEvidenceDetails(transaction, language);
  const nonAiMonitoringNotice =
    transaction.scoringSource === "RULE_FALLBACK"
      ? language === "vi"
        ? "Cảnh báo này do Rule Engine xử lý dự phòng khi dịch vụ AI không khả dụng, không phải kết quả suy luận của AI. Chỉ dùng để theo dõi, không tạo hồ sơ điều tra."
        : "This alert was handled by the backup Rule Engine while the AI service was unavailable, not by AI inference. It is for monitoring only and does not open an investigation case."
      : language === "vi"
        ? "Xem kết quả và lý do phát hiện ở trên. Cảnh báo quy tắc dùng để theo dõi; quy trình điều tra chỉ dành cho cảnh báo AI bất thường."
        : "Review the detection result and reasons above. Rule alerts are for monitoring only; investigation cases apply only to abnormal AI alerts.";
  const isCaseClosed =
    transaction.caseStatus === "Confirmed Fraud" ||
    transaction.caseStatus === "False Alarm" ||
    transaction.caseStatus === "Resolved";

  return (
    <>
      <div className={`${styles.drawerOverlay} ${styles.alertInspectionOverlay}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        className={`${styles.drawer} ${styles.alertInspectionDrawer}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${t.drawer.title}: ${transaction.transactionReference}`}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h2 className={styles.drawerTitle}>{t.drawer.title}</h2>
              {isWf04Locked ? (
                canViewLinkedCase && linkedCase ? (
                  <span
                    className={`${styles.badge} ${getWf04CaseStatusBadgeClass(linkedCase.status)}`}
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {getWf04CaseStatusLabel(linkedCase.status, t)}
                  </span>
                ) : null
              ) : (
                isAIAlert &&
                transaction.caseStatus && (
                  <span
                    className={styles.badge}
                    style={{
                      background: statusStyle.bg,
                      color: statusStyle.text,
                      borderColor: statusStyle.border,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {getStatusDisplayLabel(transaction.caseStatus)}
                  </span>
                )
              )}
            </div>
            <span style={{ fontSize: 12, color: "var(--security-muted)" }}>
              {transaction.transactionReference}{" "}
              {isWf04Locked
                ? canViewLinkedCase && linkedCase
                  ? `· Case ID: ${linkedCase.caseId}`
                  : canViewLegacyArchive && linkedLegacyEntry
                    ? `· Case ID: ${linkedLegacyEntry.legacyCaseId}`
                    : ""
                : isAIAlert && transaction.caseId
                  ? `· Case ID: ${transaction.caseId}`
                  : ""}
            </span>
          </div>
          <button
            className={styles.drawerCloseBtn}
            onClick={onClose}
            aria-label={language === 'vi' ? 'Đóng chi tiết giao dịch' : 'Close transaction details'}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Workflow Stepper (legacy standalone mode only) */}
          {!isWf04Locked && isAIAlert && transaction.caseId && (
            <div className={styles.stepperContainer} aria-label="Workflow progress">
              {WORKFLOW_STEP_KEYS.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isActive = idx === currentStep;
                return (
                  <div key={step.key} className={styles.stepperItem}>
                    <div
                      className={`${styles.stepperDot} ${
                        isActive
                          ? styles.stepperDotActive
                          : isCompleted
                            ? styles.stepperDotCompleted
                            : ""
                      }`}
                    >
                      {isCompleted ? <Check size={11} /> : idx + 1}
                    </div>
                    <span
                      className={`${styles.stepperLabel} ${
                        isActive ? styles.stepperLabelActive : ""
                      }`}
                    >
                      {t.drawer.stepper[step.key]}
                    </span>
                    {idx < WORKFLOW_STEP_KEYS.length - 1 && (
                      <div
                        className={`${styles.stepperLine} ${
                          isCompleted ? styles.stepperLineCompleted : ""
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Transaction info */}
          <div className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{t.drawer.txnInfoTitle}</h3>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.txnRef}</span>
              <strong style={{ fontFamily: "monospace" }}>{transaction.transactionReference}</strong>
            </div>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.customerEntity}</span>
              <span>{transaction.entityReference}</span>
            </div>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.project}</span>
              <span>{transaction.projectName}</span>
            </div>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.txnType}</span>
              <span>{transactionLabel(transaction.transactionType, language === 'vi')}</span>
            </div>
            {transaction.channel && (
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.drawer.channel}</span>
                <span style={{ fontWeight: 600, color: "var(--security-blue)" }}>
                  {transaction.channel}
                </span>
              </div>
            )}
            {transaction.deviceId && (
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.drawer.deviceId}</span>
                <span style={{ fontFamily: "monospace" }}>{transaction.deviceId}</span>
              </div>
            )}
            {transaction.amount != null && (
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.drawer.orderAmount}</span>
                <span style={{ fontWeight: 600 }}>
                  {transaction.amount.toLocaleString(numLocale)} {transaction.currency || "VND"}
                </span>
              </div>
            )}
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.processedAt}</span>
              <span>{new Date(transaction.processedAt).toLocaleString(numLocale)}</span>
            </div>
          </div>

          {/* Risk scoring */}
          <div className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{t.drawer.riskTitle}</h3>
            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.systemAssessment}</span>
              <RiskLevelBadge riskLevel={transaction.riskLevel} />
            </div>

            <div className={styles.drawerRow}>
              <span className={styles.drawerLabel}>{t.drawer.scoringSource}</span>
              <ScoringSourceBadge source={transaction.scoringSource} />
            </div>
            {transaction.scoringSource === 'AI' && <div className={styles.drawerRow}><span className={styles.drawerLabel}>{language === 'vi' ? 'Phiên bản mô hình' : 'Model version'}</span><span>{transaction.modelVersion || (language === 'vi' ? 'Chưa có thông tin' : 'Not provided')}</span></div>}
            {transaction.scoringSource === 'AI' && transaction.confidence != null && (
              <div className={styles.drawerRow}>
                <span className={styles.drawerLabel}>{t.drawer.confidence}</span>
                <span style={{ color: "var(--security-blue)", fontWeight: 600 }}>
                  {(transaction.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {transaction.ruleEvaluation && <div className={styles.drawerSection}><RuleEvaluationDetails evaluation={transaction.ruleEvaluation} technical={currentRole === 'Platform Admin' || currentRole === 'Implementation Staff'} /></div>}
          {/* Detection result & Evidence breakdown */}
          <div className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{t.drawer.evidenceTitle}</h3>
            {transaction.ruleEvaluation ? null : ruleEvidences.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {ruleEvidences.map((ev) => (
                  <div key={ev.code} className={styles.evidenceItemCard}>
                    <div className={styles.evidenceItemHeader}>
                      <span className={styles.evidenceItemName}>{ev.name}</span>
                    </div>
                    <div className={styles.evidenceRow}>
                      <div className={styles.evidenceCol}>
                        <span className={styles.evidenceColLabel}>{t.drawer.observedLabel}</span>
                        <span className={styles.evidenceObservedVal}>{ev.observed}</span>
                      </div>
                      <div className={styles.evidenceCol}>
                        <span className={styles.evidenceColLabel}>{t.drawer.thresholdLabel}</span>
                        <span className={styles.evidenceThresholdVal}>{ev.threshold}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: "6px 0", fontSize: 12, color: "var(--security-muted)" }}>
                {t.drawer.noRulesTriggered}
              </p>
            )}

            {transaction.explanation && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "var(--security-surface-subtle)",
                  border: "1px solid var(--security-border)",
                }}
              >
                <span className={styles.drawerLabel} style={{ display: "block", marginBottom: 4 }}>
                  {transaction.scoringSource === "AI"
                    ? t.drawer.aiAnalysis
                    : t.drawer.systemSummary}
                </span>
                <p
                  style={{
                    margin: 0,
                    color: "var(--security-text)",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {transaction.explanation}
                </p>
              </div>
            )}
          </div>

          {isWf04Locked ? (
            <div className={styles.drawerSection}>
              {(linkedCase || linkedLegacyEntry || isAIAlert) && (
                <h3 className={styles.drawerSectionTitle}>
                  {t.wf04Phase2a.caseQueue.caseSummarySectionTitle}
                </h3>
              )}
              {linkedCase ? (
                canViewLinkedCase ? (
                  <>
                    <div className={styles.drawerReadOnlyNotice} style={{ marginBottom: 12 }}>
                      {t.wf04Phase2a.alertQueue.linkedCaseDrawerNotice}
                    </div>
                    <div className={styles.drawerRow}>
                      <span className={styles.drawerLabel}>
                        {t.wf04Phase2a.caseQueue.caseCodeLabel}
                      </span>
                      <span className={styles.ruleTag}>
                        {t.wf04Phase2a.alertQueue.linkedCaseBadge.replace(
                          "{code}",
                          linkedCase.caseId,
                        )}
                      </span>
                    </div>
                    <div className={styles.drawerRow}>
                      <span className={styles.drawerLabel}>
                        {t.wf04Phase2a.caseQueue.statusLabel}
                      </span>
                      <span
                        className={`${styles.badge} ${getWf04CaseStatusBadgeClass(linkedCase.status)}`}
                      >
                        {getWf04CaseStatusLabel(linkedCase.status, t)}
                      </span>
                    </div>
                    {linkedCaseAccess?.canViewInternalCase && (
                      <div className={styles.drawerRow}>
                        <span className={styles.drawerLabel}>
                          {t.wf04Phase2a.caseQueue.assigneeLabel}
                        </span>
                        <strong>{resolveCaseActorName(linkedCase.assignee)}</strong>
                      </div>
                    )}
                    {onOpenInvestigationCase && (
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className={styles.drawerPrimaryBtn}
                          onClick={() => onOpenInvestigationCase(linkedCase.caseId)}
                        >
                          {t.wf04Phase2a.alertQueue.viewCaseBtn}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.drawerReadOnlyNotice}>
                    {currentRole === "Platform Admin" ||
                    currentRole === "Implementation Staff" ||
                    currentRole === "Viewer"
                      ? t.wf04Phase2a.caseQueue.noInternalAccessDesc
                      : t.wf04Phase2a.caseQueue.readOnlyPermissionNotice}
                  </div>
                )
              ) : linkedLegacyEntry ? (
                <div className={styles.drawerReadOnlyNotice}>
                  {canViewLegacyArchive ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span className={styles.ruleTag}>
                          {t.wf04Phase2a.legacy.legacyAlertBadge}
                        </span>
                        <strong>{linkedLegacyEntry.legacyCaseId}</strong>
                      </div>
                      <p style={{ margin: "0 0 6px" }}>{linkedLegacyEntry.reason}</p>
                      <p style={{ margin: 0 }}>{t.wf04Phase2a.legacy.legacyCannotEditNotice}</p>
                    </>
                  ) : (
                    <span>{t.wf04Phase2a.legacy.legacyCannotEditNotice}</span>
                  )}
                </div>
              ) : !isAIAlert ? (
                <p className={styles.muted}>{nonAiMonitoringNotice}</p>
              ) : (
                <div className={styles.drawerReadOnlyNotice}>
                  {t.wf04Phase2a.alertQueue.unlinkedAiDrawerNotice}
                </div>
              )}
            </div>
          ) : (
            <>
              {canSelfInvestigate && <div className={styles.drawerSection}><button type="button" className={styles.drawerPrimaryBtn} onClick={handleSelfInvestigate}>{language === 'vi' ? 'Tự điều tra' : 'Investigate myself'}</button><p className={styles.muted}>{language === 'vi' ? 'Tự ghi nhận kết quả hoặc tạo hồ sơ bên dưới để phân công điều tra.' : 'Record your own findings, or create a case below to assign an investigator.'}</p></div>}
              {!isAIAlert ? <div className={styles.drawerSection}><p className={styles.muted}>{nonAiMonitoringNotice}</p></div> : !transaction.caseId ? (
            <div className={styles.drawerSection}>
              <h3 className={styles.drawerSectionTitle}>{t.drawer.createCaseTitle}</h3>
              <p style={{ fontSize: 12, color: "var(--security-muted)", marginBottom: 12 }}>
                {t.drawer.createCaseDesc}
              </p>
              <button
                className={styles.drawerPrimaryBtn}
                onClick={handleCreateCase}
                disabled={isMutating || isViewer || !isOperation || transaction.riskLevel !== "Abnormal"}
                type="button"
              >
                {isMutating ? t.drawer.creatingCase : t.drawer.createCaseBtn}
              </button>
            </div>
          ) : (
            <>
              {/* ───────────────────────────────────────────────────────────── */}
              {/* BRANCH 1: INVESTIGATOR VIEW (Field Investigation Workbench)   */}
              {/* ───────────────────────────────────────────────────────────── */}
              {canWorkOnCase && (
                <div
                  className={styles.drawerSection}
                  style={{
                    border: "1px solid #2d5a7b",
                    borderRadius: 6,
                    padding: 16,
                    background: "rgba(113, 185, 244, 0.03)",
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3
                        className={styles.drawerSectionTitle}
                        style={{ margin: 0, color: "var(--security-blue)", fontSize: 13 }}
                      >
                        {currentRole === 'Operator' ? (language === 'vi' ? 'Điều tra của tôi' : 'My investigation') : t.drawer.investigatorWorkbench}
                      </h3>
                      <span style={{ fontSize: 12, color: "var(--security-muted)" }}>
                        {t.drawer.assignedTo}:{" "}
                        <strong>{transaction.assignedInvestigator || currentUserName}</strong>
                      </span>
                    </div>
                    <span
                      className={styles.badge}
                      style={{
                        background: "var(--security-tab-active-bg)",
                        color: "var(--security-tab-active-text)",
                        borderColor: "var(--security-tab-active-border)",
                      }}
                    >
                      {currentRole === 'Operator' ? 'Operator' : t.drawer.investigatorRoleBadge}
                    </span>
                  </div>

                  {/* State 1: Assigned (Waiting to accept) */}
                  {transaction.caseStatus === "Assigned" && (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 5,
                        background: "rgba(113, 185, 244, 0.1)",
                        border: "1px solid #2d5a7b",
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--security-text)",
                          marginBottom: 10,
                        }}
                      >
                        {t.drawer.assignedNotice}
                      </div>
                      <button
                        className={styles.drawerPrimaryBtn}
                        onClick={handleStartInvestigating}
                        disabled={isMutating}
                        type="button"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          background: "var(--security-blue)",
                        }}
                      >
                        <Play size={15} />
                        {isMutating ? t.drawer.processing : t.drawer.acceptCaseBtn}
                      </button>
                    </div>
                  )}

                  {/* State 2: Investigating (Active workspace to write & submit) */}
                  {transaction.caseStatus === "Investigating" && (
                    <>
                      {/* Investigation Notes History */}
                      <div style={{ marginBottom: 14 }}>
                        <span
                          className={styles.drawerLabel}
                          style={{ display: "block", marginBottom: 6 }}
                        >
                          {t.drawer.notesHistory}
                        </span>
                        {transaction.investigationNotes &&
                        transaction.investigationNotes.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              marginBottom: 8,
                              maxHeight: 180,
                              overflowY: "auto",
                            }}
                          >
                            {transaction.investigationNotes.map((n, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: "7px 10px",
                                  borderRadius: 6,
                                  background: "var(--security-control)",
                                  fontSize: 12,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    color: "var(--security-subtle)",
                                    marginBottom: 2,
                                  }}
                                >
                                  <strong style={{ color: "var(--security-text)" }}>
                                    {n.author}
                                  </strong>
                                  <span>{n.time}</span>
                                </div>
                                <div style={{ color: "var(--security-text-secondary)" }}>
                                  {n.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p
                            style={{
                              margin: "4px 0 8px",
                              fontSize: 12,
                              color: "var(--security-muted)",
                            }}
                          >
                            {t.drawer.notesEmpty}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            aria-label={t.drawer.notesHistory}
                            className={styles.searchInput}
                            placeholder={t.drawer.notePlaceholder}
                            value={investigatorNote}
                            onChange={(e) => setInvestigatorNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddInvestigatorNote()}
                            style={{ flex: 1, minHeight: 32, fontSize: 12 }}
                          />
                          <button
                            className={styles.button}
                            onClick={handleAddInvestigatorNote}
                            disabled={!investigatorNote.trim()}
                            type="button"
                            style={{ minHeight: 32 }}
                          >
                            {t.actions.record}
                          </button>
                        </div>
                      </div>

                      {/* Evidence Summary Input */}
                      <div style={{ marginBottom: 14 }}>
                        <label
                          className={styles.drawerLabel}
                          style={{ display: "block", marginBottom: 4 }}
                        >
                          {t.drawer.evidenceSummary}
                        </label>
                        <textarea
                          aria-label={t.drawer.evidenceSummary}
                          className={styles.searchInput}
                          rows={2}
                          placeholder={t.drawer.evidencePlaceholder}
                          value={evidenceNotes}
                          onChange={(e) => setEvidenceNotes(e.target.value)}
                          style={{
                            width: "100%",
                            height: 56,
                            fontSize: 12,
                            padding: "8px 10px",
                            resize: "vertical",
                          }}
                        />
                      </div>

                      {/* Suggested Result Selection */}
                      <div style={{ marginBottom: 14 }}>
                        <label
                          className={styles.drawerLabel}
                          style={{ display: "block", marginBottom: 6 }}
                        >
                          {t.drawer.suggestedFindingLabel}
                        </label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {(
                            ["Suspicious", "Legitimate", "Need More Info"] as InvestigationFinding[]
                          ).map((f) => {
                            const info = getFindingInfo(f, t);
                            const isChecked = selectedFinding === f;
                            return (
                              <label
                                key={f}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 10,
                                  padding: "8px 12px",
                                  borderRadius: 5,
                                  background: isChecked ? info.bg : "rgba(255, 255, 255, 0.02)",
                                  border: `1px solid ${isChecked ? info.border : "var(--security-border)"}`,
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="radio"
                                  name="invFinding"
                                  value={f}
                                  checked={isChecked}
                                  onChange={() => setSelectedFinding(f)}
                                  style={{ marginTop: 2 }}
                                />
                                <div>
                                  <div
                                    style={{ fontSize: 12, fontWeight: 600, color: info.text }}
                                  >
                                    {info.label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "var(--security-subtle)",
                                      marginTop: 2,
                                    }}
                                  >
                                    {info.desc}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Report Notes */}
                      <div style={{ marginBottom: 16 }}>
                        <label
                          className={styles.drawerLabel}
                          style={{ display: "block", marginBottom: 4 }}
                        >
                          {t.drawer.reportNotes}
                        </label>
                        <input
                          aria-label={t.drawer.reportNotes}
                          className={styles.searchInput}
                          placeholder={t.drawer.reportNotePlaceholder}
                          value={reportNote}
                          onChange={(e) => setReportNote(e.target.value)}
                          style={{ width: "100%", fontSize: 12 }}
                        />
                      </div>

                      {/* Submit Report Button */}
                      <button
                        className={styles.drawerPrimaryBtn}
                        onClick={handleSubmitInvestigationReport}
                        disabled={isMutating}
                        type="button"
                        style={{
                          background: "linear-gradient(135deg, #0284c7, #2563eb)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          fontWeight: 600,
                        }}
                      >
                        <Send size={15} />
                        {isMutating ? t.drawer.submittingReport : t.drawer.submitReportBtn}
                      </button>
                    </>
                  )}

                  {/* State 3: Reported (Submitted, Read-only view for Investigator) */}
                  {transaction.caseStatus === "Reported" && transaction.investigationReport && (
                    <div>
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: 6,
                          background: "var(--high-bg)",
                          border: "1px solid var(--high-border)",
                          marginBottom: 14,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: "var(--high-text)",
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          <Clock size={16} />
                          {t.drawer.reportSubmittedTitle}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--security-text-secondary)",
                            marginTop: 4,
                          }}
                        >
                          {t.drawer.reportSubmittedDesc} (
                          {new Date(
                            transaction.investigationReport.submittedAt,
                          ).toLocaleTimeString(numLocale, { hour: "2-digit", minute: "2-digit" })}
                          )
                        </div>
                      </div>

                      {/* Dossier Card */}
                      <div className={styles.dossierCard}>
                        <div className={styles.dossierHeader}>
                          <div className={styles.dossierAuthorInfo}>
                            <div className={styles.dossierAvatar}>
                              <User size={14} />
                            </div>
                            <div>
                              <div className={styles.dossierAuthorName}>
                                {t.drawer.dossierSubmittedBy}:{" "}
                                {transaction.investigationReport.submittedBy}
                              </div>
                              <div className={styles.dossierTime}>
                                {new Date(
                                  transaction.investigationReport.submittedAt,
                                ).toLocaleString(numLocale)}
                              </div>
                            </div>
                          </div>
                          {(() => {
                            const info = getFindingInfo(
                              transaction.investigationReport.finding,
                              t,
                            );
                            return (
                              <span
                                className={styles.badge}
                                style={{
                                  background: info.bg,
                                  color: info.text,
                                  borderColor: info.border,
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {t.drawer.dossierFindingLabel}: {info.label}
                              </span>
                            );
                          })()}
                        </div>

                        {transaction.investigationReport.evidenceNotes && (
                          <div className={styles.dossierEvidenceBox}>
                            <span className={styles.dossierEvidenceLabel}>
                              {t.drawer.dossierEvidenceLabel}
                            </span>
                            <p className={styles.dossierEvidenceText}>
                              {transaction.investigationReport.evidenceNotes}
                            </p>
                          </div>
                        )}

                        {transaction.investigationReport.notes && (
                          <div className={styles.dossierNotesBox}>
                            <strong>{t.drawer.dossierNotesLabel}</strong>{" "}
                            {transaction.investigationReport.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* State 4: Closed (Verdict received) */}
                  {isCaseClosed && (
                    <div>
                      <div className={styles.closedVerdictCard}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <ShieldCheck size={18} style={{ color: "var(--security-green)" }} />
                          <strong style={{ fontSize: 13, color: "var(--security-text)" }}>
                            {t.drawer.finalVerdict}
                          </strong>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--security-text-secondary)",
                            marginBottom: 6,
                          }}
                        >
                          {t.drawer.verdictStatus}:{" "}
                          <strong style={{ color: statusStyle.text }}>
                            {getStatusDisplayLabel(transaction.caseStatus)}
                          </strong>
                        </div>
                        {transaction.caseDecision?.directive && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--security-muted)",
                              background: "var(--security-surface-subtle)",
                              border: "1px solid var(--security-border)",
                              padding: "8px 10px",
                              borderRadius: 6,
                            }}
                          >
                            <strong>{t.drawer.directive}:</strong>{" "}
                            {transaction.caseDecision.directive}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isOperation && (
                <div
                  className={styles.drawerSection}
                  style={{
                    border: "1px solid var(--medium-border)",
                    borderRadius: 6,
                    padding: 16,
                    background: "var(--security-surface-subtle)",
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3
                        className={styles.drawerSectionTitle}
                        style={{ margin: 0, color: "var(--security-purple)", fontSize: 13 }}
                      >
                        {t.drawer.operationDeck}
                      </h3>
                      <span style={{ fontSize: 12, color: "var(--security-muted)" }}>
                        {t.drawer.authority}:{" "}
                        <strong>
                          {currentUserName || "Trần Mai Anh"} (
                          {language === "vi" ? "Trưởng nhóm Vận hành" : "Operations Lead"})
                        </strong>
                      </span>
                    </div>
                    <span
                      className={styles.badge}
                      style={{
                        background: "var(--medium-bg)",
                        color: "var(--medium-text)",
                        borderColor: "var(--medium-border)",
                      }}
                    >
                      {t.drawer.opsRoleBadge}
                    </span>
                  </div>

                  {/* 1. Assignment Control */}
                  {!isCaseClosed && (
                    <div
                      style={{
                        marginBottom: 14,
                        padding: "10px 12px",
                        borderRadius: 6,
                        background: "var(--security-surface-subtle)",
                        border: "1px solid var(--security-border)",
                      }}
                    >
                      <label
                        className={styles.drawerLabel}
                        style={{ display: "block", marginBottom: 6 }}
                      >
                        {t.drawer.assignInvestigatorLabel}
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select
                          aria-label={t.drawer.assignInvestigatorLabel}
                          className={styles.control}
                          value={selectedInvestigator}
                          onChange={(e) => setSelectedInvestigator(e.target.value)}
                          style={{ flex: 1, minHeight: 38 }}
                        >
                          {investigators.map((inv) => (
                            <option key={inv} value={inv}>
                              {inv} {inv === "Nguyễn Văn An" ? t.drawer.codExpert : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          className={styles.button}
                          onClick={handleAssignInvestigator}
                          disabled={isMutating}
                          type="button"
                          style={{ minHeight: 38 }}
                        >
                          <UserCheck size={14} style={{ marginRight: 4 }} />
                          {transaction.assignedInvestigator ? t.actions.reassign : t.actions.assign}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. Dossier Review from Investigator (READ-ONLY DOSSIER) */}
                  <div style={{ marginBottom: 14 }}>
                    <span
                      className={styles.drawerLabel}
                      style={{ display: "block", marginBottom: 8 }}
                    >
                      {t.drawer.dossierReviewTitle}
                    </span>

                    {transaction.caseStatus === "Open" && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: 6,
                          background: "var(--high-bg)",
                          border: "1px solid var(--high-border)",
                          fontSize: 12,
                          color: "var(--high-text)",
                        }}
                      >
                        {t.drawer.waitingForAssign}
                      </div>
                    )}

                    {(transaction.caseStatus === "Assigned" ||
                      transaction.caseStatus === "Investigating") && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: 6,
                          background: "var(--security-tab-active-bg)",
                          border: "1px solid var(--security-tab-active-border)",
                          fontSize: 12,
                          color: "var(--security-tab-active-text)",
                        }}
                      >
                        <div>
                          🔍{" "}
                          <strong>
                            {transaction.assignedInvestigator || "Nguyễn Văn An"}
                          </strong>{" "}
                          {t.drawer.inFieldProgress}
                        </div>
                        {transaction.investigationNotes &&
                          transaction.investigationNotes.length > 0 && (
                            <div
                              style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: "1px solid rgba(113, 185, 244, 0.2)",
                              }}
                            >
                              <div
                                style={{
                                  color: "var(--security-text)",
                                  fontWeight: 600,
                                  marginBottom: 4,
                                }}
                              >
                                {t.drawer.investigatorNotesTitle}
                              </div>
                              {transaction.investigationNotes.map((n, i) => (
                                <div
                                  key={i}
                                  style={{
                                    color: "var(--security-text-secondary)",
                                    marginBottom: 2,
                                  }}
                                >
                                  • [{n.time}] {n.author}: {n.text}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )}

                    {/* OFFICIAL SUBMITTED REPORT DOSSIER */}
                    {(transaction.caseStatus === "Reported" || isCaseClosed) &&
                      transaction.investigationReport && (
                        <div className={styles.dossierCard}>
                          <div className={styles.dossierHeader}>
                            <div className={styles.dossierAuthorInfo}>
                              <div className={styles.dossierAvatar}>
                                <User size={14} />
                              </div>
                              <div>
                                <div className={styles.dossierAuthorName}>
                                  {t.drawer.dossierSubmittedBy}:{" "}
                                  {transaction.investigationReport.submittedBy}
                                </div>
                                <div className={styles.dossierTime}>
                                  {new Date(
                                    transaction.investigationReport.submittedAt,
                                  ).toLocaleString(numLocale)}
                                </div>
                              </div>
                            </div>
                            <div>
                              {(() => {
                                const info = getFindingInfo(
                                  transaction.investigationReport.finding,
                                  t,
                                );
                                return (
                                  <span
                                    className={styles.badge}
                                    style={{
                                      background: info.bg,
                                      color: info.text,
                                      borderColor: info.border,
                                      fontSize: 12,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {t.drawer.dossierFindingLabel}: {info.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Evidence box */}
                          {transaction.investigationReport.evidenceNotes && (
                            <div className={styles.dossierEvidenceBox}>
                              <span className={styles.dossierEvidenceLabel}>
                                {t.drawer.dossierEvidenceLabel}
                              </span>
                              <p className={styles.dossierEvidenceText}>
                                {transaction.investigationReport.evidenceNotes}
                              </p>
                            </div>
                          )}

                          {/* Notes box */}
                          {transaction.investigationReport.notes && (
                            <div className={styles.dossierNotesBox}>
                              <strong>{t.drawer.dossierNotesLabel}</strong>{" "}
                              {transaction.investigationReport.notes}
                            </div>
                          )}

                          {/* Audit Trail Timeline */}
                          {transaction.investigationNotes &&
                            transaction.investigationNotes.length > 0 && (
                              <div
                                style={{
                                  marginTop: 10,
                                  paddingTop: 10,
                                  borderTop: "1px solid var(--security-border)",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--security-subtle)",
                                    fontWeight: 600,
                                    display: "block",
                                    marginBottom: 6,
                                  }}
                                >
                                  {t.drawer.historyAuditLabel}
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {transaction.investigationNotes.map((n, i) => (
                                    <div
                                      key={i}
                                      style={{ fontSize: 12, color: "var(--security-muted)" }}
                                    >
                                      <span style={{ color: "var(--security-subtle)" }}>
                                        [{n.time}]
                                      </span>{" "}
                                      <strong style={{ color: "var(--security-text)" }}>
                                        {n.author}:
                                      </strong>{" "}
                                      {n.text}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                  </div>

                  {/* 3. Final Authority Decision Deck */}
                  {!isCaseClosed ? (
                    <div className={styles.operationDecisionCard}>
                      <div className={styles.operationDecisionHeader}>
                        <h4 className={styles.operationDecisionTitle}>
                          {t.drawer.finalAuthorityTitle}
                        </h4>
                        <span style={{ fontSize: 12, color: "var(--security-muted)" }}>
                          {t.drawer.finalAuthoritySubtitle}
                        </span>
                      </div>

                      {/* Directive input */}
                      <label
                        className={styles.drawerLabel}
                        style={{ display: "block", marginBottom: 4 }}
                      >
                        {t.drawer.directiveLabel}
                      </label>
                      <input
                        aria-label={t.drawer.directiveLabel}
                        className={styles.decisionDirectiveInput}
                        placeholder={t.drawer.directivePlaceholder}
                        value={operationFeedback}
                        onChange={(e) => setOperationFeedback(e.target.value)}
                      />

                      {/* Action buttons */}
                      <div className={styles.decisionActionGrid}>
                        <button
                          className={`${styles.button} ${styles.decisionBtnFraud}`}
                          onClick={() => handleOperationDecision("Confirmed Fraud")}
                          disabled={isMutating}
                          type="button"
                        >
                          <AlertOctagon size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                          {t.drawer.confirmFraudBtn}
                        </button>

                        <button
                          className={`${styles.button} ${styles.decisionBtnFalseAlarm}`}
                          onClick={() => handleOperationDecision("False Alarm")}
                          disabled={isMutating}
                          type="button"
                        >
                          <CheckCircle2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                          {t.drawer.falseAlarmBtn}
                        </button>

                        {transaction.caseStatus === "Reported" && (
                          <button
                            className={`${styles.button} ${styles.decisionBtnReinvestigate}`}
                            onClick={() => handleOperationDecision("Investigating")}
                            disabled={isMutating}
                            type="button"
                          >
                            <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                            {t.drawer.reinvestigateBtn}
                          </button>
                        )}

                        <button
                          className={`${styles.button} ${styles.decisionBtnResolve}`}
                          onClick={() => handleOperationDecision("Resolved")}
                          disabled={isMutating}
                          type="button"
                        >
                          <Check size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                          {t.drawer.resolveCaseBtn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.closedVerdictCard}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <ShieldCheck size={18} style={{ color: "var(--security-green)" }} />
                        <strong style={{ fontSize: 13, color: "var(--security-text)" }}>
                          {t.drawer.closedVerdictTitle}
                        </strong>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--security-text-secondary)",
                          marginBottom: 6,
                        }}
                      >
                        {t.drawer.verdictStatus}:{" "}
                        <strong style={{ color: statusStyle.text }}>
                          {getStatusDisplayLabel(transaction.caseStatus)}
                        </strong>
                        {transaction.caseDecision?.decidedBy &&
                          ` · ${t.drawer.decidedByLabel}: ${transaction.caseDecision.decidedBy}`}
                      </div>
                      {transaction.caseDecision?.directive && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--security-muted)",
                            background: "var(--security-surface-subtle)",
                            border: "1px solid var(--security-border)",
                            padding: "8px 10px",
                            borderRadius: 6,
                          }}
                        >
                          <strong>{t.drawer.directiveIssuedLabel}</strong>{" "}
                          {transaction.caseDecision.directive}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* BRANCH 3: VIEWER (Read-only Summary)                          */}
              {/* ───────────────────────────────────────────────────────────── */}
              {isViewer && (
                <div
                  className={styles.drawerSection}
                  style={{
                    padding: 14,
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--security-muted)" }}>
                    {t.drawer.viewerNotice}
                  </div>
                </div>
              )}
            </>
          )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
