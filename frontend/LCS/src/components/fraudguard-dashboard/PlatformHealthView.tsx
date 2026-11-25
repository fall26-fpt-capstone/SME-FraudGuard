"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MicroserviceHealth, TransactionRisk, UserProfile } from "@/types/fraudguard";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import {
  initialMicroservices,
} from "../../data/fraudguard-platform";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./SecurityDashboard.module.css";
import { useDialogFocus } from '@/hooks/useDialogFocus';

import { platformSummary } from '@/utils/platform-summary';
import { enterprisePlan, enterpriseUsage } from "@/utils/enterprise";
import {
  readReportFeedbackDetailForUser,
  readReportFeedbacksForUser,
} from "@/utils/report-feedback";
import { type Enterprise, type ServicePlan } from "@/types/enterprise";

function formatTimestamp(iso: string, locale: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(locale);
}

export function PlatformHealthView({
  enterprises,
  transactions,
  onPlanChange,
  wf04Managed = false,
  reportFeedbacks,
  currentUser,
  users,
}: {
  enterprises: Enterprise[];
  transactions: TransactionRisk[];
  onPlanChange: (id: string, plan: ServicePlan) => void;
  wf04Managed?: boolean;
  reportFeedbacks?: readonly InvestigationReportFeedback[];
  currentUser?: UserProfile;
  users?: readonly UserProfile[];
}) {
  const { t, language } = useLanguage();
  const summary = platformSummary(
    transactions,
    wf04Managed ? { wf04Managed: true, reportFeedbacks } : undefined,
  );
  const dateLocale = language === "vi" ? "vi-VN" : "en-US";
  const [mounted, setMounted] = useState(false);
  const [services] = useState<MicroserviceHealth[]>(initialMicroservices);

  const [selectedTenant, setSelectedTenant] = useState<Enterprise | null>(null);
  const tenantRef = useDialogFocus(!!selectedTenant, () => setSelectedTenant(null));
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  const visibleFeedbacks =
    wf04Managed && currentUser?.role === "Platform Admin"
      ? readReportFeedbacksForUser({
          actor: currentUser,
          feedbacks: reportFeedbacks ?? [],
          users,
        })
      : [];

  const feedbackDetailResult =
    wf04Managed &&
    selectedFeedbackId &&
    currentUser?.role === "Platform Admin"
      ? readReportFeedbackDetailForUser({
          actor: currentUser,
          feedbacks: reportFeedbacks ?? [],
          feedbackId: selectedFeedbackId,
          users,
        })
      : null;
  const selectedFeedbackDetail = feedbackDetailResult?.ok ? feedbackDetailResult.value : null;
  const feedbackModalRef = useDialogFocus(Boolean(selectedFeedbackDetail), () =>
    setSelectedFeedbackId(null),
  );

  useEffect(() => {
    if (selectedFeedbackId && !selectedFeedbackDetail) {
      setSelectedFeedbackId(null);
    }
  }, [selectedFeedbackId, selectedFeedbackDetail]);

  const ph = t.wf04Phase2c.platformHealth;
  const sme = t.wf04Phase2c.smeFeedback;


  useEffect(() => {
    setMounted(true);
  }, []);



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
            {summary.fallbackRate === null ? '-' : summary.fallbackRate.toFixed(1) + '%'}
          </strong>
          <span className={styles.statDescription}>
            {language === 'vi' ? 'Tỷ lệ dự phòng trong lượt AI và dự phòng đã ghi nhận' : 'Fallback share of recorded AI and fallback evaluations'}
          </span>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statLabel}>{t.platformHealthView.kpis.activeTenants}</div>
          <strong className={styles.statValue}>{enterprises.length}</strong>
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

      {/* Microservices Health Grid */}
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
        {t.platformHealthView.microservicesTitle}
      </h2>
      <div className={styles.servicesGrid}>
        {services.map((svc) => (
          <article key={svc.id} className={styles.serviceCard}>
            <div className={styles.serviceCardHeader}>
              <div>
                <h3 className={styles.serviceTitle}>{svc.name}</h3>
                <span className={styles.serviceType}>{svc.type}</span>
              </div>
              <span className={styles.serviceStatusBadge}>
                
                {language === 'vi' ? 'Chưa có số liệu' : 'No measurements'}
              </span>
            </div>

            <div className={styles.serviceMetricGrid}>
              <div className={styles.serviceMetricItem}>
                <span className={styles.serviceMetricLabel}>
                  {t.platformHealthView.metrics.latency}
                </span>
                <span className={styles.serviceMetricVal} style={{ color: "var(--security-blue)" }}>
                  -
                </span>
              </div>
              <div className={styles.serviceMetricItem}>
                <span className={styles.serviceMetricLabel}>
                  {t.platformHealthView.metrics.throughput}
                </span>
                <span className={styles.serviceMetricVal}>-</span>
              </div>
              <div className={styles.serviceMetricItem}>
                <span className={styles.serviceMetricLabel}>
                  {t.platformHealthView.metrics.cpuLoad}
                </span>
                <span className={styles.serviceMetricVal}>-</span>
              </div>
              <div className={styles.serviceMetricItem}>
                <span className={styles.serviceMetricLabel}>
                  {t.platformHealthView.metrics.memory}
                </span>
                <span className={styles.serviceMetricVal}>-</span>
              </div>
            </div>

            <div className={styles.serviceFooter}>
              <span>{t.platformHealthView.metrics.uptime}: -</span>
              <button
                className={styles.button}
                style={{ fontSize: 12, padding: "4px 10px", minHeight: 32 }}
                title={language === 'vi' ? 'Chưa có kết nối giám sát' : 'Monitoring connection unavailable'}
                disabled
                type="button"
              >
                {t.platformHealthView.metrics.btnPing}
              </button>
            </div>
          </article>
        ))}
      </div>

      {wf04Managed ? (
        <section className={styles.panel} aria-label={ph.sectionTitle}>
          <div className={styles.feedbackTableHeader}>
            <div>
              <h2>{ph.sectionTitle}</h2>
              <p className={styles.muted}>{ph.sectionSubtitle}</p>
            </div>
            <span className={styles.feedbackCountBadge}>
              {ph.countValueLabel.replace("{count}", String(visibleFeedbacks.length))}
            </span>
          </div>

          <p className={styles.feedbackLocalNote}>{ph.infoOnlyNote}</p>

          {visibleFeedbacks.length === 0 ? (
            <div className={styles.feedbackEmptyState}>{ph.emptyState}</div>
          ) : (
            <div className={styles.feedbackTableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{ph.colEnterprise}</th>
                    <th>{ph.colCaseId}</th>
                    <th>{ph.colVersion}</th>
                    <th>{ph.colSubmittedBy}</th>
                    <th>{ph.colSubmittedAt}</th>
                    <th>{ph.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFeedbacks.map((fb) => (
                    <tr key={fb.feedbackId} className={styles.feedbackTableRow}>
                      <td className={styles.feedbackCellWrap}>
                        <strong>{fb.snapshot.enterpriseName}</strong>
                      </td>
                      <td className={styles.feedbackCellWrap}>{fb.caseId}</td>
                      <td>v{fb.reportVersion}</td>
                      <td className={styles.feedbackCellWrap}>
                        {fb.submittedBy.name || fb.submittedBy.actorId}
                      </td>
                      <td>{formatTimestamp(fb.submittedAt, dateLocale)}</td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.button} ${styles.feedbackDetailBtn}`}
                          onClick={() => setSelectedFeedbackId(fb.feedbackId)}
                        >
                          {ph.viewDetailBtn}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className={styles.panel}><h2>{language === 'vi' ? 'Kết luận điều tra đã lưu' : 'Saved investigation conclusions'}</h2><p>{language === 'vi' ? 'Các kết luận này có thể dùng để đối chiếu và chuẩn bị dữ liệu cải thiện AI; chưa đồng nghĩa với việc mô hình đã được huấn luyện lại.' : 'These conclusions support review and preparation of AI improvement data; they do not mean the model has been retrained.'}</p><strong>{summary.feedback.length} {language === 'vi' ? 'kết luận đã xác nhận' : 'confirmed conclusions'}</strong></section>
      )}
      {/* Fallback & Traffic Hourly Chart */}
      <section className={styles.panel} style={{ marginBottom: 28 }}>
        <div className={styles.panelHeader} style={{ marginBottom: 14 }}>
          <div>
            <h2>{language === 'vi' ? 'Lượt xử lý theo thời gian ghi nhận' : 'Evaluations by recorded time'}</h2>
            <span className={styles.muted}>
              {language === 'vi' ? 'Theo thời điểm ghi nhận (UTC)' : 'By recorded timestamp (UTC)'}
            </span>
          </div>
          <div className={styles.legend}>
            <span>
              <span className={styles.legendDot} style={{ background: "var(--security-purple)" }} />
              {t.platformHealthView.chart.aiLabel}
            </span>
            <span>
              <span className={styles.legendDot} style={{ background: "var(--security-orange)" }} />
              {t.platformHealthView.chart.fallbackLabel}
            </span>
          </div>
        </div>

        <div className={styles.chartArea} style={{ height: 260 }}>
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.trend}>
                <defs>
                  <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--security-purple)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--security-purple)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="fbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--security-orange)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--security-orange)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--security-border)" />
                <XAxis dataKey="time" stroke="var(--security-muted)" fontSize={11} />
                <YAxis stroke="var(--security-muted)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--security-panel)",
                    borderColor: "var(--security-border)",
                    borderRadius: 6,
                    color: "var(--security-text)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="aiRequests"
                  name={t.platformHealthView.chart.aiLabel}
                  stroke="var(--security-purple)"
                  fillOpacity={1}
                  fill="url(#aiGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="fallbackRequests"
                  name={t.platformHealthView.chart.fallbackLabel}
                  stroke="var(--security-orange)"
                  fillOpacity={1}
                  fill="url(#fbGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>{language === 'vi' ? 'Doanh nghiệp và gói dịch vụ' : 'Enterprises and service plans'}</h2><p className={styles.muted}>{language === 'vi' ? 'Danh sách dùng chung với trang thiết lập. Số lượt bên dưới tính từ dữ liệu giao dịch demo đã lưu, không phải hóa đơn hoặc số liệu tháng.' : 'Shared with enterprise setup. Counts reflect saved demo transactions, not billing or monthly usage.'}</p></div></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{language === 'vi' ? 'Doanh nghiệp' : 'Enterprise'}</th><th>{language === 'vi' ? 'Gói dịch vụ' : 'Plan'}</th><th>{language === 'vi' ? 'Kiểm tra bằng quy tắc' : 'Rule checks'}</th><th>{language === 'vi' ? 'Lượt phân tích AI' : 'AI analyses'}</th><th>{language === 'vi' ? 'Hạn mức AI' : 'AI allowance'}</th><th>{language === 'vi' ? 'Chi tiết' : 'Details'}</th></tr></thead><tbody>
        {enterprises.map(item=>{const usage=enterpriseUsage(item,transactions),plan=enterprisePlan(item);return <tr key={item.id}>
          <td><strong>{item.name}</strong></td><td><select className={styles.control} aria-label={(language==='vi'?'Gói dịch vụ của ':'Plan for ')+item.name} value={plan??''} onChange={e=>onPlanChange(item.id,e.target.value as ServicePlan)}><option value="" disabled>{language==='vi'?'Chưa chọn gói':'Plan not selected'}</option><option value="Free">Free: {language==='vi'?'Quy tắc':'Rules'}</option><option value="Subscription">Subscription: AI</option></select></td>
          <td>{(usage.rule+usage.fallback).toLocaleString(dateLocale)}<p className={styles.muted}>{language==='vi'?'Không tính lượt AI':'No AI usage charged'}</p></td>
          <td>{plan==='Free'?(language==='vi'?'Không áp dụng':'Not applicable'):plan?usage.ai.toLocaleString(dateLocale):'-'}</td>
          <td>{plan==='Free'?(language==='vi'?'Không áp dụng':'Not applicable'):(language==='vi'?'Chưa thiết lập':'Not configured')}</td>
          <td><button className={styles.button} onClick={()=>setSelectedTenant(item)}>{language==='vi'?'Xem chi tiết':'View details'}</button></td>
        </tr>;})}</tbody></table></div>
        <p className={styles.muted}>{language==='vi'?'Đổi gói chỉ cập nhật cấu hình demo. Chưa thu phí, gọi AI hay tự chuyển cơ chế xử lý trên máy chủ.':'Plan changes update demo configuration only. No billing, AI execution or server routing is performed.'}</p>
      </section>
      {selectedTenant && <div className={styles.builderOverlay} onClick={e=>{if(e.target===e.currentTarget)setSelectedTenant(null);}}><div ref={tenantRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={selectedTenant.name} className={styles.builderModal}>
        <div className={styles.builderHeader}><h2>{selectedTenant.name}</h2><button className={styles.button} onClick={()=>setSelectedTenant(null)}>{language==='vi'?'Đóng':'Close'}</button></div>
        <div className={styles.builderBody}><dl className={styles.evaluationFields}>{Object.entries(enterpriseUsage(selectedTenant,transactions)).map(([key,value])=><div key={key}><dt>{({total:language==='vi'?'Tổng giao dịch':'Total transactions',ai:language==='vi'?'Nguồn AI':'AI source',rule:language==='vi'?'Nguồn quy tắc':'Rule source',fallback:language==='vi'?'Quy tắc dự phòng':'Rule fallback'})[key]}</dt><dd>{value.toLocaleString(dateLocale)}</dd></div>)}</dl><p className={styles.muted}>{language==='vi'?'Thống kê nguồn xử lý của dữ liệu đã lưu. Đổi gói không thay đổi lịch sử giao dịch.':'Recorded detection sources. Changing plans does not rewrite transaction history.'}</p></div>
      </div></div>}

      {selectedFeedbackDetail && (
        <div
          className={styles.feedbackModalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedFeedbackId(null);
          }}
        >
          <section
            ref={feedbackModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pa-feedback-detail-title"
            className={styles.feedbackModalDialog}
          >
            <header className={styles.builderHeader}>
              <div>
                <h2 id="pa-feedback-detail-title" className={styles.builderTitle}>
                  {ph.detailTitle
                    .replace("{code}", selectedFeedbackDetail.snapshot.caseId)
                    .replace("{version}", String(selectedFeedbackDetail.snapshot.reportVersion))}
                </h2>
                <p className={styles.muted}>{ph.detailSubtitle}</p>
              </div>
              <button
                type="button"
                className={styles.button}
                onClick={() => setSelectedFeedbackId(null)}
              >
                {ph.closeDetailBtn}
              </button>
            </header>

            <div className={styles.builderBody}>
              <div className={styles.drawerReadOnlyNotice} role="status">
                <strong>{ph.readOnlyNotice}</strong>
              </div>

              <dl className={styles.feedbackMetaStrip}>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.enterpriseLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {selectedFeedbackDetail.snapshot.enterpriseName}
                  </dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.caseCodeLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>{selectedFeedbackDetail.snapshot.caseId}</dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.reportVersionLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {selectedFeedbackDetail.snapshot.reportId} (v{selectedFeedbackDetail.snapshot.reportVersion})
                  </dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.confirmedByLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {selectedFeedbackDetail.snapshot.confirmedBy.name ||
                      selectedFeedbackDetail.snapshot.confirmedBy.actorId}
                  </dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.confirmedAtLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {formatTimestamp(selectedFeedbackDetail.snapshot.confirmedAt, dateLocale)}
                  </dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.submittedByLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {selectedFeedbackDetail.snapshot.submittedBy.name ||
                      selectedFeedbackDetail.snapshot.submittedBy.actorId}
                  </dd>
                </div>
                <div className={styles.feedbackMetaItem}>
                  <dt className={styles.feedbackMetaLabel}>{sme.submittedAtLabel}</dt>
                  <dd className={styles.feedbackMetaValue}>
                    {formatTimestamp(selectedFeedbackDetail.snapshot.submittedAt, dateLocale)}
                  </dd>
                </div>
              </dl>

              <div className={styles.confirmReviewPanel}>
                <strong>{sme.reportSummaryHeading}</strong>
                <p>{selectedFeedbackDetail.snapshot.reportSummary}</p>
              </div>

              <div className={styles.confirmReviewPanel}>
                <strong>{sme.conclusionSummaryHeading}</strong>
                <p>{selectedFeedbackDetail.snapshot.conclusionSummary}</p>
              </div>

              <div className={styles.feedbackCommentReadOnly}>
                <strong>{sme.commentReadOnlyLabel}</strong>
                <p>
                  {selectedFeedbackDetail.snapshot.smeComment
                    ? selectedFeedbackDetail.snapshot.smeComment
                    : sme.noCommentText}
                </p>
              </div>

              <div>
                <strong>
                  {sme.perAlertHeading.replace(
                    "{count}",
                    String(selectedFeedbackDetail.snapshot.alertResults.length),
                  )}
                </strong>
                <ul className={styles.reportAlertList}>
                  {selectedFeedbackDetail.snapshot.alertResults.map((alert) => (
                    <li key={alert.alertId} className={styles.reportAlertResultRow}>
                      <div>
                        <strong>{alert.alertName || alert.alertId}</strong>
                        <p className={styles.muted}>
                          {sme.alertMetaLabel
                            .replace("{alertId}", alert.alertId)
                            .replace("{txRef}", alert.transactionReference)
                            .replace("{project}", alert.projectName)}{" "}
                          / {sme.scoringSourceAiLabel}
                        </p>
                      </div>
                      <div className={styles.feedbackCellWrap}>
                        <strong>{sme.alertResultLabel}:</strong> {alert.resultText}
                      </div>
                      <div className={styles.feedbackCellWrap}>
                        <strong>{sme.alertEvidenceLabel}:</strong> {alert.evidence}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <footer className={styles.builderFooter}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setSelectedFeedbackId(null)}
              >
                {ph.closeDetailBtn}
              </button>
            </footer>
          </section>
        </div>
      )}

    </>
  );
}
