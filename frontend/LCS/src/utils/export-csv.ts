import type { TransactionRisk, UserProfile } from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type { LegacyCaseArchiveLike } from "@/utils/permissions";

export interface TransactionCaseSummary {
  caseId: string;
  caseStatus: string;
}

export interface ExportTransactionsCSVOptions {
  investigationCases?: readonly InvestigationCase[];
  legacyArchive?: readonly LegacyCaseArchiveLike[];
  currentUser?: UserProfile;
}

const UNAUTHORIZED_CASE_ROLES = new Set(["Platform Admin", "Implementation Staff", "Viewer"]);
const CONCLUDED_LEGACY_STATUSES = new Set(["Confirmed Fraud", "False Alarm", "Resolved"]);
const BLOCKED_ARCHIVE_REASONS = new Set(["CROSS_TENANT_CONFLICT", "UNKNOWN_ENTERPRISE"]);

function isConfirmedClosedCase(c: InvestigationCase): boolean {
  return (
    c.status === "Closed" &&
    Boolean(c.conclusion) &&
    c.reports.some(
      (r) =>
        r.reportId === c.conclusion?.reportId &&
        r.version === c.conclusion?.reportVersion,
    )
  );
}

function findMatchingCase(tx: TransactionRisk, cases: readonly InvestigationCase[]): InvestigationCase | undefined {
  const txAlertId = tx.alertId?.trim() ?? "";
  return (
    cases.find(
      (c) =>
        c.alerts.some((a) => a.transactionId === tx.id || (Boolean(txAlertId) && a.alertId === txAlertId)) ||
        (Boolean(txAlertId) && c.alertIds.includes(txAlertId)),
    ) ?? (tx.caseId?.trim() ? cases.find((c) => c.caseId === tx.caseId?.trim()) : undefined)
  );
}

function findMatchingArchive(
  tx: TransactionRisk,
  legacyArchive: readonly LegacyCaseArchiveLike[],
): LegacyCaseArchiveLike | undefined {
  const txAlertId = tx.alertId?.trim();
  const txCaseId = tx.caseId?.trim();
  return legacyArchive.find(
    (entry) =>
      entry.transactionIds?.includes(tx.id) ||
      Boolean(txAlertId && entry.alertIds?.includes(txAlertId)) ||
      entry.transactions?.some((item) => item.id === tx.id || Boolean(txAlertId && item.alertId === txAlertId)) ||
      Boolean(txCaseId && entry.legacyCaseId === txCaseId),
  );
}

/**
 * Resolves CSV-safe Case ID and Case Status for a transaction, enforcing tenant, role,
 * assignee, and confirmed-report read guards when `currentUser` is supplied.
 */
export function resolveTransactionCaseSummary(
  tx: TransactionRisk,
  cases: readonly InvestigationCase[] = [],
  legacyArchive: readonly LegacyCaseArchiveLike[] = [],
  currentUser?: UserProfile,
): TransactionCaseSummary {
  if (currentUser && UNAUTHORIZED_CASE_ROLES.has(currentUser.role)) {
    return { caseId: "", caseStatus: "" };
  }

  const matchedCase = findMatchingCase(tx, cases);
  if (matchedCase) {
    if (!currentUser) {
      return { caseId: matchedCase.caseId, caseStatus: matchedCase.status };
    }
    if (!currentUser.enterpriseId || matchedCase.enterpriseId !== currentUser.enterpriseId) {
      return { caseId: "", caseStatus: "" };
    }
    if (currentUser.role === "Operator") {
      return { caseId: matchedCase.caseId, caseStatus: matchedCase.status };
    }
    if (currentUser.role === "Investigator") {
      return matchedCase.assignee?.actorId === currentUser.id && matchedCase.assignee?.role === "Investigator"
        ? { caseId: matchedCase.caseId, caseStatus: matchedCase.status }
        : { caseId: "", caseStatus: "" };
    }
    if (currentUser.role === "SME Admin") {
      return isConfirmedClosedCase(matchedCase)
        ? { caseId: matchedCase.caseId, caseStatus: matchedCase.status }
        : { caseId: "", caseStatus: "" };
    }
    return { caseId: "", caseStatus: "" };
  }

  const matchedArchive = findMatchingArchive(tx, legacyArchive);
  if (matchedArchive) {
    if (matchedArchive.reasonCode && BLOCKED_ARCHIVE_REASONS.has(matchedArchive.reasonCode)) {
      return { caseId: "", caseStatus: "" };
    }
    const archiveStatus =
      matchedArchive.originalStatus ??
      matchedArchive.legacyCaseStatus ??
      matchedArchive.transactions?.find((item) => Boolean(item.caseStatus))?.caseStatus ??
      "";
    const archiveCaseId = matchedArchive.legacyCaseId ?? matchedArchive.archiveId ?? tx.caseId ?? "";
    if (!currentUser) {
      return { caseId: archiveCaseId, caseStatus: archiveStatus };
    }
    if (!currentUser.enterpriseId || !matchedArchive.enterpriseId || matchedArchive.enterpriseId !== currentUser.enterpriseId) {
      return { caseId: "", caseStatus: "" };
    }
    if (currentUser.role === "Operator") {
      return { caseId: archiveCaseId, caseStatus: archiveStatus };
    }
    if (currentUser.role === "Investigator") {
      return matchedArchive.canResolveAssigneeId === currentUser.id
        ? { caseId: archiveCaseId, caseStatus: archiveStatus }
        : { caseId: "", caseStatus: "" };
    }
    if (currentUser.role === "SME Admin") {
      return CONCLUDED_LEGACY_STATUSES.has(archiveStatus)
        ? { caseId: archiveCaseId, caseStatus: archiveStatus }
        : { caseId: "", caseStatus: "" };
    }
    return { caseId: "", caseStatus: "" };
  }

  if (!currentUser) {
    return { caseId: tx.caseId ?? "", caseStatus: tx.caseStatus ?? "" };
  }
  if (currentUser.role === "Operator") {
    return { caseId: tx.caseId ?? "", caseStatus: tx.caseStatus ?? "" };
  }
  if (currentUser.role === "Investigator") {
    if (cases.length > 0 || legacyArchive.length > 0) {
      return { caseId: "", caseStatus: "" };
    }
    const matchesLegacyAssignee =
      tx.scoringSource === "AI" &&
      Boolean(tx.caseId) &&
      (tx.assignedInvestigatorId ? tx.assignedInvestigatorId === currentUser.id : tx.assignedInvestigator === currentUser.name);
    return matchesLegacyAssignee ? { caseId: tx.caseId ?? "", caseStatus: tx.caseStatus ?? "" } : { caseId: "", caseStatus: "" };
  }
  if (currentUser.role === "SME Admin") {
    return CONCLUDED_LEGACY_STATUSES.has(tx.caseStatus ?? "")
      ? { caseId: tx.caseId ?? "", caseStatus: tx.caseStatus ?? "" }
      : { caseId: "", caseStatus: "" };
  }
  return { caseId: "", caseStatus: "" };
}

export function serializeCSV(rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + rows.map(row => row.map(cell => {
    const value = String(cell ?? '');
    const safe = typeof cell === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

export function downloadCSV(rows: readonly (readonly unknown[])[], filename: string) {
  const url = URL.createObjectURL(new Blob([serializeCSV(rows)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convert an array of transactions into a CSV string and trigger a download.
 */
export function exportTransactionsCSV(
  transactions: TransactionRisk[],
  filename = "fraudguard-transactions.csv",
  options?: ExportTransactionsCSVOptions,
) {
  const baseHeaders = [
    "Detection Result",
    "Transaction Ref",
    "Project",
    "Type",
    "Detection Source",
    "Triggered Rules",
    "Applicable Rules", "Evaluated Rules", "Matched Rules", "Failed Rules", "Processing Status",
    "Explanation",
    "Entity",
    "Amount",
    "Currency",
  ];
  const headers = options
    ? [...baseHeaders, "Case ID", "Case Status", "Processed At"]
    : [...baseHeaders, "Case Status", "Processed At"];

  const rows = transactions.map((t) => {
    const commonCols = [
      t.riskLevel,
      t.transactionReference,
      t.projectName,
      t.transactionType,
      t.scoringSource,
      t.triggeredRules.join("; "),
      t.ruleEvaluation?.applicable ?? "", t.ruleEvaluation?.evaluated ?? "", t.ruleEvaluation?.matched ?? "", t.ruleEvaluation?.failed ?? "", t.ruleEvaluation?.status ?? "",
      t.explanation ?? "",
      t.entityReference,
      t.amount ?? "",
      t.currency ?? "",
    ];
    if (!options) {
      return [...commonCols, t.caseStatus ?? "", t.processedAt];
    }
    const summary = resolveTransactionCaseSummary(
      t,
      options.investigationCases ?? [],
      options.legacyArchive ?? [],
      options.currentUser,
    );
    return [...commonCols, summary.caseId, summary.caseStatus, t.processedAt];
  });

  downloadCSV([headers, ...rows], filename);
}

function canReadCaseRow(c: InvestigationCase, currentUser?: UserProfile): boolean {
  if (!currentUser || !currentUser.enterpriseId || UNAUTHORIZED_CASE_ROLES.has(currentUser.role)) {
    return false;
  }
  if (c.enterpriseId !== currentUser.enterpriseId) return false;
  if (currentUser.role === "Operator") return true;
  if (currentUser.role === "Investigator") {
    return c.assignee?.actorId === currentUser.id && c.assignee?.role === "Investigator";
  }
  if (currentUser.role === "SME Admin") {
    return isConfirmedClosedCase(c);
  }
  return false;
}

/**
 * Builds role-safe CSV rows for `InvestigationCase` exports (1 row per unique authorized case).
 * Returns an empty array when `currentUser` lacks case-export access.
 */
export function buildInvestigationCasesCSVRows(
  cases: readonly InvestigationCase[],
  users: readonly UserProfile[] = [],
  currentUser?: UserProfile,
): unknown[][] {
  if (!currentUser || !currentUser.enterpriseId || UNAUTHORIZED_CASE_ROLES.has(currentUser.role)) {
    return [];
  }
  const seenCaseIds = new Set<string>();
  const uniqueAuthorized: InvestigationCase[] = [];
  for (const c of cases) {
    if (seenCaseIds.has(c.caseId)) continue;
    if (!canReadCaseRow(c, currentUser)) continue;
    seenCaseIds.add(c.caseId);
    uniqueAuthorized.push(c);
  }

  const usersById = new Map(users.map((u) => [u.id, u]));

  if (currentUser.role === "SME Admin") {
    const headers = [
      "Case ID",
      "Status",
      "Alert Count",
      "Transaction Refs",
      "Confirmed Report Version",
      "Confirmed Summary",
      "Confirmed At",
      "Closed At",
    ];
    const rows = uniqueAuthorized.map((c) => {
      const confirmedReport = c.reports.find(
        (r) =>
          r.reportId === c.conclusion?.reportId &&
          r.version === c.conclusion?.reportVersion,
      );
      const txRefs = c.alerts.map((a) => a.transactionReference).filter(Boolean).join("; ");
      return [
        c.caseId,
        c.status,
        c.alerts.length || c.alertIds.length,
        txRefs,
        c.conclusion?.reportVersion ?? "",
        c.conclusion?.summary ?? confirmedReport?.summary ?? "",
        c.conclusion?.confirmedAt ?? "",
        c.closedAt ?? "",
      ];
    });
    return [headers, ...rows];
  }

  const headers = [
    "Case ID",
    "Status",
    "Alert Count",
    "Transaction Refs",
    "Assignee",
    "Confirmed Summary",
    "Report Summary",
    "Created At",
    "Updated At",
    "Closed At",
  ];
  const rows = uniqueAuthorized.map((c) => {
    const assigneeName = c.assignee
      ? (usersById.get(c.assignee.actorId)?.name ?? c.assignee.name ?? "")
      : "";
    const activeReport =
      c.reports.find(
        (r) =>
          r.reportId === c.conclusion?.reportId &&
          r.version === c.conclusion?.reportVersion,
      ) ??
      c.reports.find(
        (r) =>
          r.reportId === c.pendingReviewReportId &&
          r.version === c.pendingReviewReportVersion,
      ) ??
      c.reports[c.reports.length - 1];
    const txRefs = c.alerts.map((a) => a.transactionReference).filter(Boolean).join("; ");
    return [
      c.caseId,
      c.status,
      c.alerts.length || c.alertIds.length,
      txRefs,
      assigneeName,
      c.conclusion?.summary ?? "",
      activeReport?.summary ?? "",
      c.createdAt,
      c.updatedAt,
      c.closedAt ?? "",
    ];
  });
  return [headers, ...rows];
}

/**
 * Exports authorized investigation cases (strictly 1 row per case) using WF-04 read guards.
 */
export function exportInvestigationCasesCSV(
  cases: readonly InvestigationCase[],
  users: readonly UserProfile[] = [],
  filename = "fraudguard-investigation-cases.csv",
  currentUser?: UserProfile,
): boolean {
  const rows = buildInvestigationCasesCSVRows(cases, users, currentUser);
  if (rows.length === 0) return false;
  downloadCSV(rows, filename);
  return true;
}

/**
 * Download a standardized SME Transaction Ingestion CSV template (Module M0 & Review 1 Spec).
 */
export function downloadCSVTemplate() {
  const headers = [
    "transaction_reference",
    "timestamp",
    "amount",
    "currency",
    "transaction_type",
    "user_hash",
    "device_hash",
    "ip_hash",
    "channel",
    "payment_method",
  ];

  const sampleRows = [
    [
      "2026-09-30T10:15:00Z",
      "2500000",
      "VND",
      "subscription",
      "usr_edtech_991",
      "dev_ios_442",
      "113.161.42.18",
      "mobile_app",
      "credit_card",
    ],
    [
      "2026-09-30T10:16:30Z",
      "15000000",
      "VND",
      "refund",
      "usr_edtech_882",
      "dev_win_112",
      "203.113.152.8",
      "web",
      "bank_transfer",
    ],
    [
      "2026-09-30T10:20:15Z",
      "750000",
      "VND",
      "payment",
      "usr_edtech_773",
      "dev_android_901",
      "14.162.180.22",
      "mobile_app",
      "e_wallet",
    ],
  ];

  const csvContent = [
    headers.join(","),
    ...sampleRows.map((values, index) =>
      ["DEMO-IMPORT-" + (index + 1), ...values]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sme_fraudguard_ingestion_template.csv";
  link.click();
  URL.revokeObjectURL(url);
}
