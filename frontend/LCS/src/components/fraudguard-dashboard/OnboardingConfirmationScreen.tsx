"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  MessageSquare,
  Plus,
} from "lucide-react";
import type { UserProfile } from "@/types/fraudguard";
import type {
  DeploymentSpecification,
  Enterprise,
  EnterpriseFeedbackRecord,
  OnboardingStage,
  SpecificationSnapshot,
} from "@/types/enterprise";
import { downloadTextBlob, formatSnapshotText } from "@/utils/enterprise";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  selectedEnterprise: Enterprise;
  spec: DeploymentSpecification;
  currentStage: OnboardingStage;
  canEdit: boolean;
  currentUser: UserProfile;
  assignedStaffName: string;
  readiness: {
    ready: boolean;
    enterpriseConfirmed: boolean;
    dataAndEvaluationClarified: boolean;
    missingItems: string[];
  };
  feedbackList: EnterpriseFeedbackRecord[];
  activeSentSnapshot?: SpecificationSnapshot;
  activeConfirmedSnapshot?: SpecificationSnapshot;
  onOpenSentSnapshotModal: (snapshot: SpecificationSnapshot) => void;
  feedbackTime: string;
  onFeedbackTimeChange: (value: string) => void;
  feedbackChannel: string;
  onFeedbackChannelChange: (value: string) => void;
  feedbackContact: string;
  onFeedbackContactChange: (value: string) => void;
  feedbackContent: string;
  onFeedbackContentChange: (value: string) => void;
  feedbackError: string;
  onRecordFeedbackAndRevise: () => void;
  onOpenConfirmationModal: () => void;
  onToggleDataAndEvaluationClarified: (checked: boolean) => void;
  onProvisionWorkspace?: (enterpriseId: string) => boolean;
  onProvisionClick: (enterprise: Enterprise) => void;
  onSwitchToDraftStep: () => void;
  onOpenRules: (enterpriseId: string) => void;
}

export function OnboardingConfirmationScreen({
  vi,
  selectedEnterprise,
  spec,
  currentStage,
  canEdit,
  currentUser,
  assignedStaffName,
  readiness,
  feedbackList,
  activeSentSnapshot,
  activeConfirmedSnapshot,
  onOpenSentSnapshotModal,
  feedbackTime,
  onFeedbackTimeChange,
  feedbackChannel,
  onFeedbackChannelChange,
  feedbackContact,
  onFeedbackContactChange,
  feedbackContent,
  onFeedbackContentChange,
  feedbackError,
  onRecordFeedbackAndRevise,
  onOpenConfirmationModal,
  onToggleDataAndEvaluationClarified,
  onProvisionWorkspace,
  onProvisionClick,
  onSwitchToDraftStep,
  onOpenRules,
}: Props) {
  return (
    <>
      {/* Trạng thái Chờ xác nhận (Màn 4) hoặc Chờ xác nhận lại (Màn 4B): luôn có đủ 2 nhánh */}
      {currentStage !== "confirmed" && (
        <>
          <section className={styles.onboardingCard}>
            <div className={styles.onboardingCardHeader}>
              <div>
                <h2>
                  <FileText size={16} aria-hidden="true" />
                  {currentStage === "waiting_reconfirmation"
                    ? vi
                      ? `Bản cập nhật đặc tả đã gửi (${activeSentSnapshot?.version ?? "v1.0"}) — Đang chờ doanh nghiệp xác nhận lại`
                      : `Updated Specification Sent (${activeSentSnapshot?.version ?? "v1.0"}) — Awaiting Re-confirmation`
                    : vi
                    ? `Bản dự thảo đặc tả đã gửi (${activeSentSnapshot?.version ?? "v1.0"}) — Đang chờ doanh nghiệp xác nhận`
                    : `Draft Specification Sent (${activeSentSnapshot?.version ?? "v1.0"}) — Awaiting Confirmation`}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {activeSentSnapshot?.sentAt
                    ? vi
                      ? `Ghi nhận gửi lúc ${activeSentSnapshot.sentAt} bởi ${
                          activeSentSnapshot.sentBy || assignedStaffName
                        }. Bản đã gửi được đóng băng độc lập với bản nháp tiếp theo.`
                      : `Sent at ${activeSentSnapshot.sentAt} by ${
                          activeSentSnapshot.sentBy || assignedStaffName
                        }. Immutable snapshot.`
                    : vi
                    ? "Bạn có thể xem lại nội dung đặc tả hiện tại hoặc ghi nhận kết quả phản hồi / xác nhận từ doanh nghiệp."
                    : "Inspect the current specification or record enterprise feedback / confirmation."}
                </p>
              </div>
              {activeSentSnapshot && (
                <div className={styles.onboardingDocActions}>
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={() => onOpenSentSnapshotModal(activeSentSnapshot)}
                  >
                    <Eye size={14} aria-hidden="true" />
                    {vi ? "Xem bản đã gửi" : "View sent version"}
                  </button>
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={() =>
                      downloadTextBlob(
                        `Dac_ta_${selectedEnterprise.code ?? selectedEnterprise.id}_${activeSentSnapshot.version}.txt`,
                        formatSnapshotText(selectedEnterprise.name, activeSentSnapshot, vi)
                      )
                    }
                  >
                    <Download size={14} aria-hidden="true" />
                    {vi ? "Tải bản đã gửi" : "Download sent version"}
                  </button>
                </div>
              )}
            </div>

            {activeSentSnapshot?.revisionSummary && (
              <div className={styles.onboardingScopeCallout}>
                <strong>
                  {vi
                    ? "Nội dung đã cập nhật ở phiên bản này:"
                    : "Revision summary in this version:"}
                </strong>{" "}
                {activeSentSnapshot.revisionSummary}
              </div>
            )}
          </section>

          {/* HAI NHÁNH THAO TÁC BẮT BUỘC Ở CẢ MÀN 4 VÀ MÀN 4B */}
          <div className={styles.onboardingTwoColGrid}>
            {/* Nhánh 1: Doanh nghiệp yêu cầu chỉnh sửa tiếp */}
            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <MessageSquare size={16} aria-hidden="true" />
                    {vi
                      ? "Nhánh 1: Ghi nhận phản hồi & Yêu cầu chỉnh sửa tiếp"
                      : "Branch 1: Record Feedback & Request Further Revision"}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {vi
                      ? "Dùng khi doanh nghiệp phản hồi cần điều chỉnh thêm điều kiện phát hiện hoặc danh mục trường dữ liệu."
                      : "Use when the enterprise requests adjustments to detection conditions or data fields."}
                  </p>
                </div>
              </div>
              <div className={styles.onboardingCardBody}>
                <div className={styles.onboardingFormRow}>
                  <label className={styles.onboardingFieldLabel}>
                    <span>{vi ? "Thời điểm nhận phản hồi *" : "Feedback timestamp *"}</span>
                    <input
                      type="text"
                      className={styles.onboardingFieldInput}
                      disabled={!canEdit}
                      value={feedbackTime}
                      onChange={(e) => onFeedbackTimeChange(e.target.value)}
                      placeholder="DD/MM/YYYY HH:mm"
                    />
                  </label>
                  <label className={styles.onboardingFieldLabel}>
                    <span>{vi ? "Kênh trao đổi *" : "Communication channel *"}</span>
                    <select
                      className={styles.onboardingFieldSelect}
                      disabled={!canEdit}
                      value={feedbackChannel}
                      onChange={(e) => onFeedbackChannelChange(e.target.value)}
                    >
                      <option value="Email">Email</option>
                      <option value="Họp trực tiếp">Họp trực tiếp / Trực tuyến</option>
                      <option value="Điện thoại / Tin nhắn">Điện thoại / Tin nhắn</option>
                      <option value="Biên bản làm việc">Biên bản làm việc</option>
                    </select>
                  </label>
                </div>

                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Người đại diện phản hồi" : "Contact person"}</span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    disabled={!canEdit}
                    value={feedbackContact}
                    onChange={(e) => onFeedbackContactChange(e.target.value)}
                  />
                </label>

                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Nội dung phản hồi cần chỉnh sửa *" : "Feedback details *"}</span>
                  <textarea
                    className={styles.onboardingFieldTextarea}
                    disabled={!canEdit}
                    value={feedbackContent}
                    onChange={(e) => onFeedbackContentChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Ghi rõ yêu cầu điều chỉnh ngưỡng, điều kiện phát hiện hoặc trường dữ liệu từ phía doanh nghiệp..."
                        : "Record specific threshold, condition, or field changes requested by the enterprise..."
                    }
                  />
                </label>

                {feedbackError && (
                  <p className={styles.workflowError} role="alert" style={{ margin: 0 }}>
                    {feedbackError}
                  </p>
                )}

                {canEdit && (
                  <div style={{ marginTop: "auto" }}>
                    <button
                      type="button"
                      className={styles.onboardingBtnSecondary}
                      onClick={onRecordFeedbackAndRevise}
                    >
                      <Edit3 size={14} aria-hidden="true" />
                      {vi
                        ? "Ghi nhận phản hồi & Chuyển sang chỉnh sửa"
                        : "Record feedback & Revise draft"}
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Nhánh 2: Doanh nghiệp đã đồng ý xác nhận đặc tả */}
            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {vi
                      ? "Nhánh 2: Ghi nhận doanh nghiệp đã xác nhận đặc tả"
                      : "Branch 2: Record Enterprise Specification Confirmation"}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {vi
                      ? "Dùng khi đại diện doanh nghiệp xác nhận đồng ý nội dung điều kiện phát hiện và danh mục trường dữ liệu của phiên bản đã gửi."
                      : "Use when the enterprise representative confirms the sent detection conditions and data field catalog."}
                  </p>
                </div>
              </div>
              <div className={styles.onboardingCardBody}>
                <div className={styles.onboardingScopeCallout}>
                  <strong>{vi ? "Quy tắc luồng xác nhận:" : "Confirmation workflow rule:"}</strong>{" "}
                  {vi
                    ? "Không đi tắt trực tiếp từ 'Chờ xác nhận' hoặc 'Chờ xác nhận lại' sang thiết lập quy tắc. Phải ghi nhận xác nhận của doanh nghiệp vào hồ sơ và đối soát mức độ sẵn sàng dữ liệu trước."
                    : "Cannot jump directly from 'Awaiting confirmation' or 'Awaiting re-confirmation' to rule setup. Enterprise confirmation and data readiness must be recorded first."}
                </div>

                {feedbackList.length > 0 && (
                  <div>
                    <strong style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>
                      {vi
                        ? "Lịch sử phản hồi đã xử lý:"
                        : "Resolved feedback history:"}
                    </strong>
                    <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                      {feedbackList.map((fb) => (
                        <div key={fb.id} className={styles.onboardingItemRow}>
                          <div className={styles.onboardingItemContent}>
                            <div className={styles.onboardingItemTitle}>
                              <span>
                                {fb.contactPerson} ({fb.channel} · {fb.receivedAt})
                              </span>
                              <span className={styles.ruleTag}>{fb.versionTarget}</span>
                            </div>
                            <div className={styles.onboardingItemDetail}>{fb.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canEdit && (
                  <div style={{ marginTop: "auto" }}>
                    <button
                      type="button"
                      className={styles.onboardingBtnPrimary}
                      onClick={onOpenConfirmationModal}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                      {vi
                        ? "Mở hộp thoại ghi nhận doanh nghiệp đã xác nhận"
                        : "Open enterprise confirmation modal"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* MÀN 6: ĐẶC TẢ ĐÃ XÁC NHẬN & KIỂM TRA SẴN SÀNG THIẾT LẬP */}
      {currentStage === "confirmed" && activeConfirmedSnapshot && (
        <>
          <div className={styles.onboardingTwoColGrid}>
            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {vi
                      ? "1. Xác nhận yêu cầu nghiệp vụ từ doanh nghiệp"
                      : "1. Enterprise Business Requirement Confirmation"}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {vi
                      ? "Ghi nhận sự đồng thuận của đại diện doanh nghiệp đối với mục tiêu và phạm vi phát hiện."
                      : "Records the enterprise representative's confirmation of detection scope and requirements."}
                  </p>
                </div>
                <span
                  className={styles.onboardingStageBadge}
                  data-stage={readiness.enterpriseConfirmed ? "confirmed" : "supplement_pending"}
                >
                  {readiness.enterpriseConfirmed
                    ? vi
                      ? "Đã xác nhận"
                      : "Confirmed"
                    : vi
                    ? "Chưa xác nhận"
                    : "Unconfirmed"}
                </span>
              </div>
              <div className={styles.onboardingCardBody}>
                <dl className={styles.onboardingInfoList}>
                  <dt>{vi ? "Phiên bản xác nhận" : "Confirmed version"}</dt>
                  <dd>
                    {spec.enterpriseConfirmation?.version ?? activeConfirmedSnapshot.version}
                  </dd>
                  <dt>{vi ? "Đại diện xác nhận" : "Confirmed by"}</dt>
                  <dd>{spec.enterpriseConfirmation?.confirmedBy ?? spec.confirmedBy ?? "—"}</dd>
                  <dt>{vi ? "Thời điểm xác nhận" : "Confirmed at"}</dt>
                  <dd>{spec.enterpriseConfirmation?.confirmedAt ?? spec.confirmedAt ?? "—"}</dd>
                  <dt>{vi ? "Hình thức xác nhận" : "Channel"}</dt>
                  <dd>{spec.enterpriseConfirmation?.channel ?? "Biên bản / Email"}</dd>
                  <dt>{vi ? "Ghi chú xác nhận" : "Note"}</dt>
                  <dd>{spec.enterpriseConfirmation?.note ?? "—"}</dd>
                </dl>
              </div>
            </section>

            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <FileCheck2 size={16} aria-hidden="true" />
                    {vi
                      ? "2. Mức độ làm rõ dữ liệu & Cách đánh giá kỹ thuật"
                      : "2. Data & Evaluation Method Clarification Readiness"}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {vi
                      ? "Phân biệt việc doanh nghiệp đồng ý chủ trương với việc dữ liệu và tiêu chí đánh giá đã đủ để thiết lập quy tắc."
                      : "Distinguishes business agreement from technical readiness of data fields and evaluation criteria."}
                  </p>
                </div>
                <span
                  className={styles.onboardingStageBadge}
                  data-stage={
                    readiness.dataAndEvaluationClarified ? "confirmed" : "supplement_pending"
                  }
                >
                  {readiness.dataAndEvaluationClarified
                    ? vi
                      ? "Đã làm rõ đầy đủ"
                      : "Clarified"
                    : vi
                    ? "Cần làm rõ thêm"
                    : "Needs clarification"}
                </span>
              </div>
              <div className={styles.onboardingCardBody}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "4px",
                    border: "1px solid var(--security-border-strong)",
                    background: "var(--security-control)",
                    cursor: canEdit ? "pointer" : "default",
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(spec.dataAndEvaluationClarified)}
                    onChange={(e) => onToggleDataAndEvaluationClarified(e.target.checked)}
                  />
                  <span style={{ fontSize: "13px", lineHeight: 1.5 }}>
                    <strong>
                      {vi
                        ? "Xác nhận kỹ thuật (Implementation Staff):"
                        : "Technical Readiness Confirmation (Implementation Staff):"}
                    </strong>{" "}
                    {vi
                      ? "Tôi đã đối soát đầy đủ kiểu dữ liệu, tính bắt buộc của từng trường đầu vào và tiêu chí đánh giá cụ thể cho mọi điều kiện phát hiện (không dùng placeholder)."
                      : "I have verified all input field types, required flags, and explicit evaluation criteria without placeholders."}
                  </span>
                </label>

                {!readiness.ready && readiness.missingItems.length > 0 && (
                  <div className={styles.onboardingWarningCallout} role="alert">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontWeight: 700,
                      }}
                    >
                      <AlertTriangle size={16} aria-hidden="true" />
                      <span>
                        {vi
                          ? "Chưa đủ điều kiện chuyển sang thiết lập quy tắc. Các nội dung cần làm rõ:"
                          : "Not ready for rule setup. Specific items needing clarification:"}
                      </span>
                    </div>
                    <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                      {readiness.missingItems.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                    {selectedEnterprise.projectIds.length === 0 && (
                      <div
                        style={{
                          marginTop: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        {currentUser.role === "Platform Admin" && onProvisionWorkspace ? (
                          <button
                            type="button"
                            className={styles.onboardingBtnPrimary}
                            onClick={() => onProvisionClick(selectedEnterprise)}
                          >
                            <Plus size={14} aria-hidden="true" />
                            {vi
                              ? `Khởi tạo workspace triển khai (workspace-${selectedEnterprise.id})`
                              : `Provision workspace (workspace-${selectedEnterprise.id})`}
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", fontWeight: 600 }}>
                            {vi
                              ? `Hướng dẫn: Chuyển sang vai trò Platform Admin (Lê Hoàng Phúc) trên thanh công cụ -> bấm "Khởi tạo workspace triển khai (workspace-${selectedEnterprise.id})" tại hồ sơ này, sau đó cập nhật projectId trong dữ liệu giao dịch mẫu.`
                              : `Guidance: Switch to Platform Admin (Lê Hoàng Phúc) in the top bar -> click "Provision workspace (workspace-${selectedEnterprise.id})" on this profile, then update projectId in sample transactions.`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {readiness.ready && (
                  <div className={styles.onboardingSuccessCallout} role="status">
                    {vi
                      ? "Cả 2 điều kiện (Doanh nghiệp xác nhận yêu cầu & Dữ liệu/cách đánh giá đã làm rõ) đều đã hoàn tất. Hồ sơ sẵn sàng chuyển sang thiết lập bộ quy tắc."
                      : "Both enterprise confirmation and data/evaluation clarification are complete. Ready for rule setup."}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Nội dung bản đặc tả đã xác nhận (Readonly, lấy từ confirmedSnapshot bất biến) */}
          <div className={styles.onboardingTwoColGrid}>
            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <ClipboardList size={16} aria-hidden="true" />
                    {vi
                      ? `Điều kiện phát hiện đã xác nhận (${activeConfirmedSnapshot.version} · ${activeConfirmedSnapshot.conditionsList.length} điều kiện)`
                      : `Confirmed Detection Conditions (${activeConfirmedSnapshot.version} · ${activeConfirmedSnapshot.conditionsList.length})`}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {activeConfirmedSnapshot.requirements}
                  </p>
                </div>
              </div>
              <div className={styles.onboardingCardBody}>
                {activeConfirmedSnapshot.conditionsList.map((c, index) => (
                  <div key={c.id} className={styles.onboardingItemRow}>
                    <div className={styles.onboardingItemContent}>
                      <div className={styles.onboardingItemTitle}>
                        <span>
                          {index + 1}. {c.name}
                        </span>
                      </div>
                      <div className={styles.onboardingItemDetail}>
                        <strong>{vi ? "Tiêu chí đánh giá:" : "Criteria:"}</strong> {c.criteria}
                      </div>
                      <div className={styles.onboardingItemDetail}>
                        <strong>{vi ? "Phạm vi áp dụng:" : "Scope:"}</strong> {c.scope}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.onboardingCard}>
              <div className={styles.onboardingCardHeader}>
                <div>
                  <h2>
                    <FileCheck2 size={16} aria-hidden="true" />
                    {vi
                      ? `Danh mục trường dữ liệu đã xác nhận (${activeConfirmedSnapshot.version} · ${activeConfirmedSnapshot.schema.length} trường)`
                      : `Confirmed Data Field Catalog (${activeConfirmedSnapshot.version} · ${activeConfirmedSnapshot.schema.length})`}
                  </h2>
                  <p className={styles.onboardingCardSub}>
                    {vi
                      ? "Định nghĩa trường dữ liệu theo đặc tả riêng của doanh nghiệp (không áp đặt ý nghĩa mặc định ngoài đặc tả)."
                      : "Enterprise-specific field definitions as confirmed."}
                  </p>
                </div>
              </div>
              <div className={styles.onboardingCardBody}>
                {activeConfirmedSnapshot.schema.map((f, index) => (
                  <div key={`${f.name}-${index}`} className={styles.onboardingItemRow}>
                    <div className={styles.onboardingItemContent}>
                      <div className={styles.onboardingItemTitle}>
                        <code>{f.name}</code>
                        <span className={styles.ruleTag}>{f.type}</span>
                        <span
                          className={styles.onboardingStageBadge}
                          data-stage={f.required ? "intake" : "clarifying"}
                        >
                          {f.required
                            ? vi
                              ? "Bắt buộc"
                              : "Required"
                            : vi
                            ? "Tùy chọn"
                            : "Optional"}
                        </span>
                      </div>
                      {f.description && (
                        <div className={styles.onboardingItemDetail}>{f.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <footer className={styles.onboardingActionBar}>
            <p className={styles.onboardingOversightNote}>
              {vi
                ? "Bản đặc tả đã xác nhận được cố định làm căn cứ thiết lập bộ quy tắc. Nếu doanh nghiệp phát sinh thay đổi mới, mở bước Làm rõ để soạn phiên bản nháp tiếp theo."
                : "The confirmed specification is frozen as the baseline for rule configuration. Open Clarification to draft a new version if requirements change."}
            </p>
            <div className={styles.onboardingActionButtons}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={() =>
                  downloadTextBlob(
                    `Dac_ta_xac_nhan_${selectedEnterprise.code ?? selectedEnterprise.id}_${activeConfirmedSnapshot.version}.txt`,
                    formatSnapshotText(selectedEnterprise.name, activeConfirmedSnapshot, vi)
                  )
                }
              >
                <Download size={14} aria-hidden="true" />
                {vi ? "Tải bản đặc tả đã xác nhận" : "Download confirmed specification"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className={styles.onboardingBtnSecondary}
                  onClick={onSwitchToDraftStep}
                >
                  <Edit3 size={14} aria-hidden="true" />
                  {vi ? "Soạn bản nháp cập nhật mới" : "Prepare new draft revision"}
                </button>
              )}
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                disabled={!readiness.ready}
                onClick={() => {
                  if (readiness.ready) onOpenRules(selectedEnterprise.id);
                }}
              >
                {vi ? "Chuyển sang thiết lập quy tắc" : "Proceed to rule setup"}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </>
      )}
    </>
  );
}
