"use client";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  MessageSquare,
  Upload,
} from "lucide-react";
import type {
  DeploymentSpecification,
  Enterprise,
  IntakeDocumentItem,
  OnboardingStage,
  SupplementRequestRecord,
} from "@/types/enterprise";
import type { OnboardingFileLike } from "@/utils/enterprise";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  selectedEnterprise: Enterprise;
  spec: DeploymentSpecification;
  currentStage: OnboardingStage;
  canEdit: boolean;
  intakeDocs: IntakeDocumentItem[];
  supplementRequests: SupplementRequestRecord[];
  latestPendingSupplement?: SupplementRequestRecord;
  onUploadIntakeDocument: (file: OnboardingFileLike) => Promise<void>;
  onPreviewDoc: (doc: IntakeDocumentItem) => void;
  onDownloadDoc: (doc: {
    name: string;
    content?: string;
    dataUrl?: string;
    mimeType?: string;
  }) => void;
  onOpenReceiveSupplementModal: () => void;
  onOpenSupplementModal: () => void;
  onStartClarification: () => void;
}

export function OnboardingIntakeScreen({
  vi,
  selectedEnterprise,
  spec,
  currentStage,
  canEdit,
  intakeDocs,
  supplementRequests,
  latestPendingSupplement,
  onUploadIntakeDocument,
  onPreviewDoc,
  onDownloadDoc,
  onOpenReceiveSupplementModal,
  onOpenSupplementModal,
  onStartClarification,
}: Props) {
  return (
    <>
      {currentStage === "supplement_pending" && latestPendingSupplement && (
        <section className={styles.onboardingWarningCallout} role="status">
          <div className={styles.onboardingTitleRow}>
            <div>
              <strong>
                {vi
                  ? `Hồ sơ đang ở trạng thái Chờ bổ sung (Ghi nhận lúc ${latestPendingSupplement.requestedAt} bởi ${latestPendingSupplement.requestedBy})`
                  : `Profile is Awaiting Supplement (Recorded at ${latestPendingSupplement.requestedAt} by ${latestPendingSupplement.requestedBy})`}
              </strong>
              {latestPendingSupplement.items.length > 0 && (
                <ul style={{ margin: "8px 0 4px", paddingLeft: "20px" }}>
                  {latestPendingSupplement.items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
              {latestPendingSupplement.note && (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>{vi ? "Ghi chú trao đổi:" : "Note:"}</strong> {latestPendingSupplement.note}
                </p>
              )}
              {latestPendingSupplement.guidanceFileName && (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>{vi ? "Tệp mẫu tham khảo đã đính kèm:" : "Attached sample file:"}</strong>{" "}
                  {latestPendingSupplement.guidanceFileName}
                </p>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onOpenReceiveSupplementModal}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {vi
                  ? "Ghi nhận đã nhận tài liệu/thông tin bổ sung"
                  : "Record received supplement info"}
              </button>
            )}
          </div>
        </section>
      )}

      <div className={styles.onboardingTwoColGrid}>
        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <Building2 size={16} aria-hidden="true" />
                {vi ? "Thông tin doanh nghiệp & Phạm vi triển khai" : "Enterprise Info & Deployment Scope"}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? "Thông tin hồ sơ ban đầu của doanh nghiệp và đầu mối phối hợp làm rõ đặc tả."
                  : "Initial enterprise profile and primary contact for specification clarification."}
              </p>
            </div>
          </div>
          <div className={styles.onboardingCardBody}>
            <dl className={styles.onboardingInfoList}>
              <dt>{vi ? "Tên doanh nghiệp" : "Enterprise name"}</dt>
              <dd>{selectedEnterprise.name}</dd>
              <dt>{vi ? "Mã hồ sơ" : "Profile code"}</dt>
              <dd>{selectedEnterprise.code ?? selectedEnterprise.id}</dd>
              <dt>{vi ? "Mô hình hoạt động" : "Business model"}</dt>
              <dd>
                {spec.businessModel ??
                  (vi ? "Thương mại & Dịch vụ SME" : "SME Commerce & Services")}
              </dd>
              <dt>{vi ? "Người đại diện" : "Representative"}</dt>
              <dd>
                {spec.representativeName ?? (vi ? "Chưa cập nhật" : "Not specified")}
                {spec.representativeRole ? ` (${spec.representativeRole})` : ""}
              </dd>
              <dt>{vi ? "Email liên hệ" : "Contact email"}</dt>
              <dd>{spec.representativeEmail ?? spec.smeAdminEmail ?? "—"}</dd>
              <dt>{vi ? "Tài khoản SME Admin" : "SME Admin account"}</dt>
              <dd>
                {spec.smeAdminName ?? spec.representativeName ?? "—"}
                {spec.smeAdminEmail ? ` · ${spec.smeAdminEmail}` : ""}
              </dd>
              <dt>{vi ? "Dự án / Workspace" : "Projects / Workspaces"}</dt>
              <dd>
                {selectedEnterprise.projectIds.join(", ") ||
                  (vi ? "Chưa gắn dự án" : "None")}
              </dd>
            </dl>

            <div className={styles.onboardingScopeCallout}>
              <strong>{vi ? "Nguyên tắc phạm vi triển khai:" : "Deployment scope principle:"}</strong>{" "}
              {spec.deploymentScopeNote ??
                (vi
                  ? "1 workspace = 1 phạm vi triển khai chính + 1 bộ cấu hình phát hiện theo phiên bản."
                  : "1 workspace = 1 primary deployment scope + 1 versioned detection configuration.")}
            </div>

            {spec.intakeReviewNote && (
              <div className={styles.onboardingScopeCallout}>
                <strong>{vi ? "Ghi chú rà soát ban đầu:" : "Initial review note:"}</strong>{" "}
                {spec.intakeReviewNote}
              </div>
            )}
          </div>
        </section>

        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <FileText size={16} aria-hidden="true" />
                {vi
                  ? "Tài liệu tiếp nhận & Dữ liệu mẫu ban đầu"
                  : "Intake Documents & Initial Samples"}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? "Tiếp nhận tài liệu doanh nghiệp cung cấp (.docx, .xlsx, .pdf, .txt, .csv, .json, .md), xem nội dung hoặc tải tệp gốc."
                  : "Accept enterprise documents (.docx, .xlsx, .pdf, .txt, .csv, .json, .md), inspect content or download original files."}
              </p>
            </div>
            {canEdit && (
              <label className={styles.onboardingBtnSecondary} style={{ cursor: "pointer" }}>
                <Upload size={14} aria-hidden="true" />
                <span>{vi ? "Thêm tệp hồ sơ" : "Add intake file"}</span>
                <input
                  type="file"
                  accept=".docx,.xlsx,.pdf,.txt,.csv,.json,.md"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await onUploadIntakeDocument(file);
                  }}
                />
              </label>
            )}
          </div>

          <div className={styles.onboardingCardBody}>
            {intakeDocs.length === 0 ? (
              <div className={styles.onboardingEmptyBox}>
                <FileText size={24} aria-hidden="true" />
                <p>
                  {vi
                    ? "Chưa có tài liệu tiếp nhận nào được lưu trong hồ sơ của doanh nghiệp này."
                    : "No intake documents recorded for this enterprise yet."}
                </p>
              </div>
            ) : (
              intakeDocs.map((doc) => (
                <div key={doc.id} className={styles.onboardingDocItem}>
                  <div className={styles.onboardingDocMeta}>
                    <div className={styles.onboardingDocName}>
                      [{doc.format}] {doc.name}
                    </div>
                    <div className={styles.onboardingDocDesc}>{doc.summary}</div>
                    <span className={styles.findingMeta}>
                      {vi ? "Tiếp nhận lúc:" : "Received at:"} {doc.receivedAt}
                    </span>
                  </div>
                  <div className={styles.onboardingDocActions}>
                    <button
                      type="button"
                      className={styles.onboardingBtnSecondary}
                      onClick={() => onPreviewDoc(doc)}
                    >
                      <Eye size={14} aria-hidden="true" />
                      {vi ? "Xem nội dung" : "View content"}
                    </button>
                    <button
                      type="button"
                      className={styles.onboardingBtnSecondary}
                      onClick={() => onDownloadDoc(doc)}
                    >
                      <Download size={14} aria-hidden="true" />
                      {vi ? "Tải tệp" : "Download"}
                    </button>
                  </div>
                </div>
              ))
            )}

            {supplementRequests.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <strong style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>
                  {vi ? "Lịch sử yêu cầu bổ sung hồ sơ:" : "Supplement request history:"}
                </strong>
                <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                  {supplementRequests.map((req) => (
                    <div key={req.id} className={styles.onboardingItemRow}>
                      <div className={styles.onboardingItemContent}>
                        <div className={styles.onboardingItemTitle}>
                          <span>
                            {vi ? "Yêu cầu lúc" : "Requested at"} {req.requestedAt}
                          </span>
                          <span
                            className={styles.onboardingStageBadge}
                            data-stage={req.receivedAt ? "confirmed" : "supplement_pending"}
                          >
                            {req.receivedAt
                              ? vi
                                ? `Đã nhận bổ sung (${req.receivedAt})`
                                : `Received (${req.receivedAt})`
                              : vi
                              ? "Đang chờ bổ sung"
                              : "Awaiting supplement"}
                          </span>
                        </div>
                        {req.items.length > 0 && (
                          <div className={styles.onboardingItemDetail}>
                            {req.items.join("; ")}
                          </div>
                        )}
                        {req.note && (
                          <div className={styles.onboardingItemDetail}>
                            {vi ? "Ghi chú:" : "Note:"} {req.note}
                          </div>
                        )}
                        {req.guidanceFileName && (
                          <div className={styles.onboardingItemDetail}>
                            {vi ? "Tệp mẫu đính kèm:" : "Guidance attachment:"}{" "}
                            <strong>{req.guidanceFileName}</strong>{" "}
                            {(req.guidanceFileDataUrl || req.guidanceFileContent) && (
                              <button
                                type="button"
                                className={styles.onboardingBtnSecondary}
                                style={{ marginLeft: "8px", padding: "2px 8px", fontSize: "11px" }}
                                onClick={() =>
                                  onDownloadDoc({
                                    name: req.guidanceFileName!,
                                    content: req.guidanceFileContent,
                                    dataUrl: req.guidanceFileDataUrl,
                                    mimeType: req.guidanceFileMimeType,
                                  })
                                }
                              >
                                <Download size={12} aria-hidden="true" />
                                {vi ? "Tải tệp mẫu" : "Download sample"}
                              </button>
                            )}
                          </div>
                        )}
                        {req.receivedNote && (
                          <div className={styles.onboardingItemDetail}>
                            <strong>{vi ? "Thông tin đã nhận:" : "Received info:"}</strong>{" "}
                            {req.receivedNote}
                            {req.receivedDocumentName ? ` (${req.receivedDocumentName})` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className={styles.onboardingActionBar}>
        <p className={styles.onboardingOversightNote}>
          {vi
            ? "Rà soát thông tin và tài liệu tiếp nhận của doanh nghiệp. Nếu chưa đủ thông tin, ghi nhận yêu cầu bổ sung; nếu đã đủ, chuyển sang làm rõ đặc tả."
            : "Review intake documents and profile info. Record a supplement request if incomplete, or proceed to specification clarification."}
        </p>
        {canEdit && (
          <div className={styles.onboardingActionButtons}>
            <button
              type="button"
              className={styles.onboardingBtnSecondary}
              onClick={onOpenSupplementModal}
            >
              <MessageSquare size={15} aria-hidden="true" />
              {vi ? "Yêu cầu bổ sung thông tin" : "Request supplement info"}
            </button>
            {currentStage === "supplement_pending" && (
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onOpenReceiveSupplementModal}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {vi
                  ? "Ghi nhận đã nhận thông tin bổ sung"
                  : "Record received supplement"}
              </button>
            )}
            <button
              type="button"
              className={styles.onboardingBtnPrimary}
              onClick={onStartClarification}
            >
              {vi ? "Bắt đầu làm rõ đặc tả" : "Proceed to clarify specification"}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </footer>
    </>
  );
}
