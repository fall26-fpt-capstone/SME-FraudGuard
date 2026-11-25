"use client";

import { RefreshCw, Zap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./SecurityDashboard.module.css";

export function PlatformHealthOverview() {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>{t.platformHealthView.title}</h1>
          <p>{language === 'vi' ? 'Theo dõi doanh nghiệp và phương pháp đánh giá giao dịch. Dấu - là chỉ số chưa có dữ liệu.' : 'Review enterprises and transaction evaluation methods. - indicates an unavailable metric.'}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={styles.button}
            disabled title={language === 'vi' ? 'Chưa có kết nối giám sát' : 'Monitoring connection unavailable'}
            type="button"
          >
            <RefreshCw size={13} style={{ marginRight: 6 }} />
            {t.platformHealthView.btnRefresh}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <section className={styles.metricsGrid} style={{ marginTop: 24 }}>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.platformHealthView.kpis.uptime}</div>
          <strong className={styles.statValue} style={{ color: "var(--security-green)" }}>
            -
          </strong>
          <span className={styles.statDescription}>
            {language === 'vi' ? 'Chưa có dữ liệu thời gian hoạt động' : 'Uptime data unavailable'}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.platformHealthView.kpis.latency}</div>
          <strong className={styles.statValue} style={{ color: "var(--security-blue)" }}>
            -
          </strong>
          <span className={styles.statDescription}>
            {language === 'vi' ? 'Chưa có số đo thời gian xử lý' : 'Processing time measurements unavailable'}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.platformHealthView.kpis.fallback}</div>
          <strong className={styles.statValue} style={{ color: "var(--security-orange)" }}>
            -
          </strong>
          <span className={styles.statDescription}>
            {language === 'vi' ? 'Tỷ lệ dự phòng trong lượt AI và dự phòng đã ghi nhận' : 'Fallback share of recorded AI and fallback evaluations'}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.platformHealthView.kpis.activeTenants}</div>
          <strong className={styles.statValue}>-</strong>
          <span className={styles.statDescription}>
            {t.platformHealthView.kpis.activeTenantsDesc}
          </span>
        </article>
      </section>

      {/* Failover Mechanism Callout */}
      <div className={styles.fallbackCallout}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Zap size={22} color="var(--security-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--security-text)", marginBottom: 3 }}>
              {t.platformHealthView.failoverTitle}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--security-text-secondary)", lineHeight: 1.5 }}>
              {t.platformHealthView.failoverDesc}
            </p>
          </div>
        </div>
        <span
          className={styles.badge}
          style={{
            background: "var(--high-bg)",
            color: "var(--high-text)",
            border: "1px solid var(--high-border)",
            padding: "6px 12px",
            fontSize: 12,
          }}
        >
          {language === 'vi' ? 'Quy tắc dự phòng' : 'Rules fallback'}
        </span>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{t.platformHealthView.microservicesTitle}</h2>
      <div className={styles.servicesGrid}>
        {["AI Detection Inference Engine", "Dynamic Rule Engine Gateway", "Ingestion Message Stream", "Database"].map(name => (
          <article key={name} className={styles.serviceCard}>
            <div className={styles.serviceCardHeader}>
              <h3 className={styles.serviceTitle}>{name}</h3>
              <span className={styles.serviceStatusBadge}>{vi ? "Chưa có số liệu" : "No measurements"}</span>
            </div>
          </article>
        ))}
      </div>
      {[
        t.wf04Phase2c.platformHealth.sectionTitle,
        vi ? "Lượt xử lý theo thời gian ghi nhận" : "Evaluations by recorded time",
        vi ? "Doanh nghiệp và gói dịch vụ" : "Enterprises and service plans",
      ].map(title => (
        <section key={title} className={styles.panel}>
          <div className={styles.panelHeader}><h2>{title}</h2></div>
          <p className={styles.muted}>{vi ? "Chưa có dữ liệu hiển thị." : "Data unavailable."}</p>
        </section>
      ))}
    </>
  );
}
