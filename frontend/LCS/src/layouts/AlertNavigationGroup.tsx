"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { ScoringSource } from "@/types/fraudguard";
import { getOperatorAlertSources } from "@/routes/navigation";
import { useLanguage } from "@/context/LanguageContext";
import styles from "@/components/fraudguard-dashboard/SecurityDashboard.module.css";

export interface AlertNavigationProps {
  alertPlan?: string;
  activeAlertSource?: ScoringSource;
  onAlertSourceChange?: (source: ScoringSource) => void;
}

export function AlertNavigationGroup({ alertPlan, activeAlertSource, onAlertSourceChange, collapsed = false, onExpand }: AlertNavigationProps & { collapsed?: boolean; onExpand?: () => void }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(true);
  const sources = getOperatorAlertSources(alertPlan);
  const labels = { AI: t.nav.items.aiAlerts, RULE_FALLBACK: t.nav.items.fallbackAlerts, RULE: t.nav.items.ruleAlerts };
  return <div>
    <button type="button" className={styles.secondaryNavButton} aria-label={t.nav.items.recentAlerts} title={t.nav.items.recentAlerts} aria-expanded={!collapsed && expanded} onClick={() => { if (collapsed) { onExpand?.(); setExpanded(true); } else setExpanded(value => !value); }}>
      <span className={styles.navItemIcon}><AlertTriangle size={16} /></span>
      <span className={styles.navItemText}>{t.nav.items.recentAlerts}</span>
      {!collapsed && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
    </button>
    {!collapsed && expanded && <div className={styles.alertNavChildren}>
      {sources.map(source => <button type="button" key={source} className={`${styles.secondaryNavButton} ${activeAlertSource === source ? styles.secondaryNavButtonActive : ""}`} aria-current={activeAlertSource === source ? "page" : undefined} onClick={() => onAlertSourceChange?.(source)}>{labels[source]}</button>)}
    </div>}
  </div>;
}
