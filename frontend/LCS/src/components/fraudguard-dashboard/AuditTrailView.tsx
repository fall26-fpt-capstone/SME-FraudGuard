"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type {
  AuditLogEntry,
  ExtendedAuditAction,
} from "@/types/fraudguard";
import { useLanguage } from "@/context/LanguageContext";
import type { TranslationKey } from "@/config/translations";
import styles from "./SecurityDashboard.module.css";

type AuditTrailEntry = Omit<AuditLogEntry, "action"> & {
  action: ExtendedAuditAction;
};

interface AuditTrailViewProps {
  initialLogs: readonly AuditTrailEntry[];
}

function formatAuditTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return `${d.toLocaleTimeString(locale)} · ${d.toLocaleDateString(locale)}`;
}

const CASE_AUDIT_ACTIONS: readonly ExtendedAuditAction[] = [
  "CASE_CREATED",
  "INVESTIGATOR_ASSIGNED",
  "OPERATOR_SELF_ASSIGNED",
  "REPORT_SUBMITTED",
  "REVISION_REQUESTED",
  "REPORT_CONFIRMED_AND_CLOSED",
  "REPORT_FEEDBACK_SENT",
  "CASE_STATUS_UPDATED",
];

const ACTION_CLASSES: Record<ExtendedAuditAction, string> = {
  CASE_CREATED: styles.auditActionCreate,
  INVESTIGATOR_ASSIGNED: styles.auditActionUpdate,
  OPERATOR_SELF_ASSIGNED: styles.auditActionUpdate,
  REPORT_SUBMITTED: styles.auditActionCreate,
  REVISION_REQUESTED: styles.auditActionSecurity,
  REPORT_CONFIRMED_AND_CLOSED: styles.auditActionCreate,
  REPORT_FEEDBACK_SENT: styles.auditActionCreate,
  CASE_STATUS_UPDATED: styles.auditActionUpdate,
  RULE_CREATED: styles.auditActionCreate,
  RULE_UPDATED: styles.auditActionUpdate,
  PROJECT_UPDATED: styles.auditActionUpdate,
  RULE_TOGGLED: styles.auditActionSecurity,
  RULE_DELETED: styles.auditActionDelete,
  API_KEY_GENERATED: styles.auditActionSecurity,
  WEBHOOK_UPDATED: styles.auditActionUpdate,
  ALERT_REVIEWED: styles.auditActionCreate,
  EXPORT_GENERATED: styles.auditActionUpdate,
};

const ACTION_KEY_MAP: Record<
  ExtendedAuditAction,
  keyof TranslationKey["auditTrailView"]["actions"]
> = {
  CASE_CREATED: "caseStatusUpdated",
  INVESTIGATOR_ASSIGNED: "caseStatusUpdated",
  OPERATOR_SELF_ASSIGNED: "caseStatusUpdated",
  REPORT_SUBMITTED: "caseStatusUpdated",
  REVISION_REQUESTED: "caseStatusUpdated",
  REPORT_CONFIRMED_AND_CLOSED: "caseStatusUpdated",
  REPORT_FEEDBACK_SENT: "caseStatusUpdated",
  CASE_STATUS_UPDATED: "caseStatusUpdated",
  RULE_CREATED: "ruleCreated",
  RULE_UPDATED: "ruleUpdated",
  PROJECT_UPDATED: "projectUpdated",
  RULE_TOGGLED: "ruleToggled",
  RULE_DELETED: "ruleDeleted",
  API_KEY_GENERATED: "apiKeyGenerated",
  WEBHOOK_UPDATED: "webhookUpdated",
  ALERT_REVIEWED: "alertReviewed",
  EXPORT_GENERATED: "exportGenerated",
};

const WF04_ACTION_KEY_MAP: Partial<
  Record<ExtendedAuditAction, keyof TranslationKey["wf04Phase2a"]["auditActions"]>
> = {
  CASE_CREATED: "caseCreated",
  INVESTIGATOR_ASSIGNED: "investigatorAssigned",
  OPERATOR_SELF_ASSIGNED: "operatorSelfAssigned",
  CASE_STATUS_UPDATED: "caseStatusUpdated",
};

const WF04_PHASE2B_ACTION_KEY_MAP: Partial<
  Record<ExtendedAuditAction, keyof TranslationKey["wf04Phase2b"]["auditActions"]>
> = {
  REPORT_SUBMITTED: "reportSubmitted",
  REVISION_REQUESTED: "revisionRequested",
  REPORT_CONFIRMED_AND_CLOSED: "reportConfirmedClosed",
};

const WF04_PHASE2C_ACTION_KEY_MAP: Partial<
  Record<ExtendedAuditAction, keyof TranslationKey["wf04Phase2c"]["auditActions"]>
> = {
  REPORT_FEEDBACK_SENT: "reportFeedbackSent",
};

export function AuditTrailView({ initialLogs }: AuditTrailViewProps) {
  const { t, language } = useLanguage();
  const dateLocale = language === "vi" ? "vi-VN" : "en-US";
  const logs = initialLogs;
  const [query, setQuery] = useState("");
  const [actionCategory, setActionCategory] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Filter logs
  const filtered = useMemo(() => {
    return logs.filter((log) => {
      // Category filter
      if (actionCategory === "cases" && !CASE_AUDIT_ACTIONS.includes(log.action)) {
        return false;
      }
      if (
        actionCategory === "rules" &&
        !["RULE_CREATED", "RULE_UPDATED", "RULE_TOGGLED", "RULE_DELETED"].includes(log.action)
      ) {
        return false;
      }
      if (
        actionCategory === "security" &&
        !["API_KEY_GENERATED", "WEBHOOK_UPDATED"].includes(log.action)
      ) {
        return false;
      }

      // Query search
      if (!query.trim()) return true;
      const target = [
        log.actor.name,
        log.actor.email,
        log.target,
        log.details,
        log.ipAddress,
        log.action,
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(query.toLowerCase());
    });
  }, [logs, actionCategory, query]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageLogs = filtered.slice(startIdx, startIdx + pageSize);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      cases: logs.filter((l) => CASE_AUDIT_ACTIONS.includes(l.action)).length,
      rules: logs.filter((l) =>
        ["RULE_CREATED", "RULE_UPDATED", "RULE_TOGGLED", "RULE_DELETED"].includes(l.action),
      ).length,
      security: logs.filter((l) =>
        ["API_KEY_GENERATED", "WEBHOOK_UPDATED"].includes(l.action),
      ).length,
    };
  }, [logs]);

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>{t.auditTrailView.title}</h1>
          <p>{t.auditTrailView.subtitle}</p>
        </div>
      </div>

      {/* Stats */}
      <section className={styles.metricsGrid} style={{ marginTop: 24 }}>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.auditTrailView.kpis.totalLogs}</div>
          <strong className={styles.statValue}>{stats.total}</strong>
          <span className={styles.statDescription}>{t.auditTrailView.kpis.totalLogsDesc}</span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.auditTrailView.kpis.caseChanges}</div>
          <strong
            className={styles.statValue}
            style={{ color: "var(--security-blue)" }}
          >
            {stats.cases}
          </strong>
          <span className={styles.statDescription}>{t.auditTrailView.kpis.caseChangesDesc}</span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.auditTrailView.kpis.ruleUpdates}</div>
          <strong
            className={styles.statValue}
            style={{ color: "var(--security-purple)" }}
          >
            {stats.rules}
          </strong>
          <span className={styles.statDescription}>{t.auditTrailView.kpis.ruleUpdatesDesc}</span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.auditTrailView.kpis.securityEvents}</div>
          <strong
            className={styles.statValue}
            style={{ color: "var(--security-orange)" }}
          >
            {stats.security}
          </strong>
          <span className={styles.statDescription}>{t.auditTrailView.kpis.securityEventsDesc}</span>
        </article>
      </section>

      {/* Toolbar Filters */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup} style={{ alignItems: "flex-end" }}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>
              {language === "vi" ? "Tìm kiếm" : "Search"}
            </span>
            <div className={styles.searchFieldWrap}>
              <Search size={15} className={styles.searchFieldIcon} aria-hidden="true" />
              <input
                className={styles.searchInput}
                type="search"
                aria-label={t.auditTrailView.searchPlaceholder}
                placeholder={t.auditTrailView.searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>
              {t.auditTrailView.filterCategory}
            </span>
            <select
              className={styles.control}
              aria-label={t.auditTrailView.filterCategory}
              value={actionCategory}
              onChange={(e) => {
                setActionCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t.auditTrailView.categories.all}</option>
              <option value="cases">{t.auditTrailView.categories.cases}</option>
              <option value="rules">{t.auditTrailView.categories.rules}</option>
              <option value="security">{t.auditTrailView.categories.security}</option>
            </select>
          </label>
        </div>
      </div>

      {/* Audit Log Table */}
      <section className={`${styles.panel} ${styles.tablePanel}`}>
        <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
          <div>
            <h2>{t.auditTrailView.title}</h2>
            <p className={styles.muted}>{t.auditTrailView.subtitle}</p>
          </div>
          <span className={styles.muted}>
            {filtered.length} {t.auditTrailView.eventsCount}
          </span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.auditTrailView.table.time}</th>
                <th>{t.auditTrailView.table.actor}</th>
                <th>{t.auditTrailView.table.action}</th>
                <th>{t.auditTrailView.table.target}</th>
                <th>{t.auditTrailView.table.details}</th>
                <th>{t.auditTrailView.table.ip}</th>
              </tr>
            </thead>
            <tbody>
              {pageLogs.length === 0 ? (
                <tr>
                  <td className={styles.emptyState} colSpan={6}>
                    {t.auditTrailView.table.emptyMessage}
                  </td>
                </tr>
              ) : (
                pageLogs.map((log) => {
                  const actionClass = ACTION_CLASSES[log.action] || styles.auditActionUpdate;
                  const wf04Phase2cKey = WF04_PHASE2C_ACTION_KEY_MAP[log.action];
                  const wf04Phase2bKey = WF04_PHASE2B_ACTION_KEY_MAP[log.action];
                  const wf04Key = WF04_ACTION_KEY_MAP[log.action];
                  const actionKey = ACTION_KEY_MAP[log.action];
                  const actionLabel =
                    wf04Phase2cKey && t.wf04Phase2c?.auditActions
                      ? t.wf04Phase2c.auditActions[wf04Phase2cKey]
                      : wf04Phase2bKey && t.wf04Phase2b?.auditActions
                        ? t.wf04Phase2b.auditActions[wf04Phase2bKey]
                        : wf04Key && t.wf04Phase2a?.auditActions
                          ? t.wf04Phase2a.auditActions[wf04Key]
                          : actionKey && t.auditTrailView.actions
                            ? t.auditTrailView.actions[actionKey]
                            : log.action;
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, color: "var(--security-muted)" }}>
                        {formatAuditTime(log.timestamp, dateLocale)}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            className={styles.avatar}
                            style={{
                              width: 28,
                              height: 28,
                              fontSize: 12,
                              background:
                                log.actor.role === "SME Admin"
                                  ? "var(--medium-bg)"
                                  : "var(--security-tab-active-bg)",
                              color:
                                log.actor.role === "SME Admin"
                                  ? "var(--medium-text)"
                                  : "var(--security-tab-active-text)",
                              border:
                                log.actor.role === "SME Admin"
                                  ? "1px solid var(--medium-border)"
                                  : "1px solid var(--security-tab-active-border)",
                            }}
                          >
                            {log.actor.name.charAt(0)}
                          </div>
                          <div>
                            <span
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                color: "var(--security-text)",
                              }}
                            >
                              {log.actor.name}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: 12,
                                color: "var(--security-muted)",
                              }}
                            >
                              {log.actor.role}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.auditActionBadge} ${actionClass}`}
                        >
                          {actionLabel}
                        </span>
                      </td>
                      <td>
                        <span className={styles.ruleTag}>{log.target}</span>
                      </td>
                      <td
                        style={{
                          maxWidth: 380,
                          whiteSpace: "normal",
                          lineHeight: 1.4,
                          fontSize: 12,
                          color: "var(--security-text-secondary)",
                        }}
                      >
                        {log.details}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {log.ipAddress}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className={styles.pagination}>
          <div className={styles.paginationInfo}>
            {t.auditTrailView.showing} {filtered.length === 0 ? 0 : startIdx + 1}–
            {Math.min(startIdx + pageSize, filtered.length)} {t.auditTrailView.of} {filtered.length}
          </div>
          <div className={styles.paginationControls}>
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label={t.auditTrailView.prevPage}
              type="button"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`${styles.paginationBtn} ${
                  p === safePage ? styles.paginationBtnActive : ""
                }`}
                onClick={() => setPage(p)}
                type="button"
              >
                {p}
              </button>
            ))}
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label={t.auditTrailView.nextPage}
              type="button"
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
