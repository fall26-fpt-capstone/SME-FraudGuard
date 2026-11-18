"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Layers,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
} from "lucide-react";
import type { UserProfile } from "@/types/fraudguard";
import type {
  DeploymentSpecification,
  Enterprise,
  EnterpriseFeedbackRecord,
  IntakeDocumentItem,
  OnboardingStage,
  SpecificationSnapshot,
  SupplementRequestRecord,
} from "@/types/enterprise";
import { enterprisePlan, formatEnterpriseCode } from "@/utils/enterprise";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  selectedEnterprise: Enterprise;
  spec: DeploymentSpecification;
  currentStage: OnboardingStage;
  stageLabels: Record<OnboardingStage, string>;
  assignedStaff?: UserProfile;
  smeAdminUser?: UserProfile;
  readiness: {
    ready: boolean;
    enterpriseConfirmed: boolean;
    dataAndEvaluationClarified: boolean;
    missingItems: string[];
  };
  intakeDocs: IntakeDocumentItem[];
  supplementRequests: SupplementRequestRecord[];
  feedbackList: EnterpriseFeedbackRecord[];
  activeSentSnapshot?: SpecificationSnapshot;
  activeConfirmedSnapshot?: SpecificationSnapshot;
  onProvisionWorkspace?: (enterpriseId: string) => boolean;
  onProvisionClick: (enterprise: Enterprise) => void;
  onOpenRules: (enterpriseId: string) => void;
  onPreviewDoc: (doc: IntakeDocumentItem) => void;
  onDownloadDoc: (doc: IntakeDocumentItem) => void;
  onOpenSentSnapshotModal: (snapshot: SpecificationSnapshot) => void;
  onBack: () => void;
}

function getInitials(name: string): string {
  if (!name || name === "Chưa phân công" || name === "Chưa khởi tạo" || name === "Unassigned" || name === "Unset") {
    return "--";
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function OnboardingPlatformAdminScreen({
  vi,
  selectedEnterprise,
  spec,
  currentStage,
  stageLabels,
  assignedStaff,
  smeAdminUser,
  readiness,
  intakeDocs,
  supplementRequests,
  feedbackList,
  activeSentSnapshot,
  activeConfirmedSnapshot,
  onProvisionWorkspace,
  onProvisionClick,
  onOpenRules,
  onPreviewDoc,
  onDownloadDoc,
  onOpenSentSnapshotModal,
  onBack,
}: Props) {
  const [activeTab, setActiveTab] = useState<"governance" | "spec" | "audit">("governance");

  const formattedCode = formatEnterpriseCode(selectedEnterprise);
  const plan = enterprisePlan(selectedEnterprise) ?? "Subscription";
  const businessModel = spec.businessModel ?? (vi ? "Thương mại & dịch vụ SME" : "SME Commerce");
  const staffName = assignedStaff?.name ?? (vi ? "Chưa phân công" : "Unassigned");
  const staffEmail = assignedStaff?.email ?? "";
  const adminName = smeAdminUser?.name ?? spec.smeAdminName ?? spec.representativeName ?? (vi ? "Chưa khởi tạo" : "Unset");
  const adminEmail = smeAdminUser?.email ?? spec.smeAdminEmail ?? spec.representativeEmail ?? "";

  const conditions = spec.conditionsList ?? [];
  const schemaFields = spec.schema ?? [];
  const confirmation = spec.enterpriseConfirmation;
  const isConfirmed = Boolean(spec.confirmedAt || spec.confirmedSnapshot || confirmation);
  const confirmedByName = confirmation?.confirmedBy ?? spec.confirmedBy;
  const confirmedAtDate = confirmation?.confirmedAt ?? spec.confirmedAt;
  const confirmedChannel = confirmation?.channel;
  const isClarified = Boolean(spec.dataAndEvaluationClarified);

  return (
    <div className={styles.onboardingContainer}>
      {/* Nút quay lại danh sách doanh nghiệp */}
      <div>
        <button
          type="button"
          className={styles.onboardingBtnSecondary}
          onClick={onBack}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {vi ? "Quay lại danh sách doanh nghiệp" : "Back to enterprises list"}
        </button>
      </div>

      {/* BANNER DÀNH RIÊNG CHO PLATFORM ADMIN */}
      <section className={styles.onboardingPlatformBanner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
              <span className={styles.onboardingPlatformBadge}>
                <ShieldCheck size={14} aria-hidden="true" />
                {vi ? "Quản trị Nền tảng (Platform Oversight)" : "Platform Oversight Console"}
              </span>
              <span className={styles.onboardingStageBadge} data-stage={currentStage}>
                {stageLabels[currentStage]}
              </span>
            </div>
            <h1 style={{ margin: "4px 0", fontSize: "22px", fontWeight: 700, color: "var(--security-text)" }}>
              {selectedEnterprise.name}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--security-text-secondary)" }}>
              {vi
                ? "Chế độ giám sát hạ tầng dự án, thẩm tra phân công triển khai và kiểm toán chất lượng hồ sơ đặc tả."
                : "Platform governance console for infrastructure scoping, deployment audit, and quality gating."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {readiness.ready ? (
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={() => onOpenRules(selectedEnterprise.id)}
              >
                <ArrowRight size={15} aria-hidden="true" />
                {vi ? "Mở Bộ Quy Tắc Doanh Nghiệp" : "Open Enterprise Rule Sets"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                disabled={true}
                title={vi ? "Hồ sơ chưa hoàn tất đủ điều kiện chuyển sang thiết lập quy tắc" : "Profile not ready for rule setup"}
              >
                {vi ? "Chuyển sang thiết lập quy tắc" : "Proceed to rule setup"}
              </button>
            )}
          </div>
        </div>

        {/* Thông tin định danh & gói dịch vụ */}
        <div className={styles.onboardingMetaRow} style={{ paddingTop: "12px", borderTop: "1px solid var(--security-border)" }}>
          <span className={styles.onboardingMetaItem}>
            <strong>{vi ? "Mã hồ sơ:" : "Code:"}</strong> {formattedCode}
          </span>
          <span className={styles.onboardingMetaItem}>
            <strong>{vi ? "Gói dịch vụ:" : "Plan:"}</strong> {plan}
          </span>
          <span className={styles.onboardingMetaItem}>
            <strong>{vi ? "Mô hình:" : "Model:"}</strong> {businessModel}
          </span>
          <span className={styles.onboardingMetaItem}>
            <strong>{vi ? "Nhân sự triển khai:" : "Staff:"}</strong> {staffName}
          </span>
          <span className={styles.onboardingMetaItem}>
            <strong>{vi ? "SME Admin:" : "Admin:"}</strong> {adminName}
          </span>
        </div>
      </section>

      {/* CẢNH BÁO NẾU CHƯA CÓ WORKSPACE (QUYỀN HẠN KHỞI TẠO CỦA PLATFORM ADMIN) */}
      {selectedEnterprise.projectIds.length === 0 && (
        <section className={styles.onboardingWarningCallout} role="status">
          <div className={styles.onboardingTitleRow}>
            <div>
              <strong>
                {vi
                  ? `Hồ sơ ${selectedEnterprise.name} hiện chưa có phạm vi dự án/workspace triển khai (projectIds đang trống)`
                  : `${selectedEnterprise.name} currently has no linked deployment project/workspace (projectIds is empty)`}
              </strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
                {vi
                  ? `Không gắn dự án của doanh nghiệp khác hoặc tự đoán mã dự án. Thao tác thiết lập tương ứng: Quản trị Nền tảng (Platform Admin - Lê Hoàng Phúc) chọn "Khởi tạo workspace triển khai" ngay tại hồ sơ này để cấp mã phạm vi chính thức (workspace-${selectedEnterprise.id}) mà vẫn giữ nguyên toàn bộ đặc tả, bản nháp, xác nhận và tài liệu đã lưu.`
                  : `Do not attach another enterprise's project or guess project codes. Corresponding setup action: Platform Admin clicks "Provision deployment workspace" on this profile to assign the official scope (workspace-${selectedEnterprise.id}) while preserving all saved specifications, drafts, confirmations, and documents.`}
              </p>
            </div>
            {onProvisionWorkspace && (
              <div className={styles.onboardingActionButtons}>
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
              </div>
            )}
          </div>
        </section>
      )}

      {/* THANH TAB ĐIỀU HƯỚNG GÓC NHÌN QUẢN TRỊ */}
      <div className={styles.tableControls} style={{ marginTop: "8px", borderBottom: "1px solid var(--security-border)" }}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "governance"}
            className={`${styles.tab} ${activeTab === "governance" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("governance")}
          >
            {vi ? "1. Tổng quan Quản trị & Hạ tầng" : "1. Governance & Infrastructure"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "spec"}
            className={`${styles.tab} ${activeTab === "spec" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("spec")}
          >
            {vi ? "2. Thẩm tra Bộ đặc tả & Tiêu chí" : "2. Specification & Criteria Audit"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "audit"}
            className={`${styles.tab} ${activeTab === "audit" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("audit")}
          >
            {vi ? "3. Hồ sơ Tài liệu & Nhật ký Trao đổi" : "3. Intake Documents & Audit Trail"}
          </button>
        </div>
      </div>

      {/* TAB 1: TỔNG QUAN QUẢN TRỊ & HẠ TẦNG */}
      {activeTab === "governance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* 3 Thẻ Quản trị then chốt */}
          <div className={styles.onboardingPlatformGrid3}>
            {/* Thẻ 1: Hạ tầng Workspace */}
            <div className={styles.entityCard}>
              <div className={styles.entityCardHeader}>
                <div className={styles.entityCardTitleWrap}>
                  <Server size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                  <span className={styles.entityCardTitle}>
                    {vi ? "Hạ tầng Workspace" : "Workspace Scope"}
                  </span>
                </div>
                <span className={selectedEnterprise.projectIds.length > 0 ? styles.entityCardPillPass : styles.entityCardPillPending}>
                  {selectedEnterprise.projectIds.length > 0 ? (vi ? "ĐÃ CẤP PHÁT" : "PROVISIONED") : (vi ? "CHƯA CẤP PHÁT" : "PENDING")}
                </span>
              </div>

              <div>
                {selectedEnterprise.projectIds.length > 0 ? (
                  <div className={styles.entityCodeBlock}>
                    <Layers size={14} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                    <code>{selectedEnterprise.projectIds.join(", ")}</code>
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--critical-text)", fontStyle: "italic" }}>
                    {vi ? "Chưa khởi tạo workspace triển khai" : "No workspace provisioned"}
                  </div>
                )}
              </div>

              <div className={styles.entityMetaFooter}>
                <span>{vi ? "Phân vùng: Single-tenant scope" : "Isolation: Single-tenant scope"}</span>
                <span>{selectedEnterprise.projectIds.length} workspace</span>
              </div>
            </div>

            {/* Thẻ 2: Nhân sự Triển khai */}
            <div className={styles.entityCard}>
              <div className={styles.entityCardHeader}>
                <div className={styles.entityCardTitleWrap}>
                  <UserCheck size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                  <span className={styles.entityCardTitle}>
                    {vi ? "Nhân sự Triển khai" : "Implementation Staff"}
                  </span>
                </div>
                <span className={assignedStaff ? styles.entityCardPillNeutral : styles.entityCardPillPending}>
                  {assignedStaff ? (vi ? "PHỤ TRÁCH" : "ASSIGNED") : (vi ? "CHƯA GÁN" : "UNASSIGNED")}
                </span>
              </div>

              <div className={styles.entityContactRow}>
                <div className={styles.entityAvatar} style={{ background: "var(--security-blue-bg)", color: "var(--security-blue)" }}>
                  {getInitials(staffName)}
                </div>
                <div className={styles.entityContactInfo}>
                  <strong className={styles.entityName} title={staffName}>{staffName}</strong>
                  <span className={styles.entityEmail} title={staffEmail || ""}>
                    {staffEmail || (vi ? "Chưa cập nhật email" : "No email")}
                  </span>
                </div>
              </div>

              <div className={styles.entityMetaFooter}>
                <span>{vi ? "Vai trò: Implementation Staff" : "Role: Implementation Staff"}</span>
                <span>{vi ? "Đặc tả & Kiểm thử" : "Spec & Testing"}</span>
              </div>
            </div>

            {/* Thẻ 3: Quản trị Doanh nghiệp (SME Admin) */}
            <div className={styles.entityCard}>
              <div className={styles.entityCardHeader}>
                <div className={styles.entityCardTitleWrap}>
                  <Building2 size={15} style={{ color: "var(--security-purple)" }} aria-hidden="true" />
                  <span className={styles.entityCardTitle}>
                    {vi ? "Đại diện Doanh nghiệp" : "SME Admin Account"}
                  </span>
                </div>
                <span className={adminEmail ? styles.entityCardPillNeutral : styles.entityCardPillPending}>
                  {adminEmail ? (vi ? "SME ADMIN" : "ACTIVE") : (vi ? "CHƯA GÁN" : "PENDING")}
                </span>
              </div>

              <div className={styles.entityContactRow}>
                <div className={styles.entityAvatar} style={{ background: "var(--security-purple-bg)", color: "var(--security-purple)" }}>
                  {getInitials(adminName)}
                </div>
                <div className={styles.entityContactInfo}>
                  <strong className={styles.entityName} title={adminName}>{adminName}</strong>
                  <span className={styles.entityEmail} title={adminEmail || ""}>
                    {adminEmail || (vi ? "Chưa cập nhật email" : "No email")}
                  </span>
                </div>
              </div>

              <div className={styles.entityMetaFooter}>
                <span>{vi ? "Tài khoản: SME Admin" : "Account: SME Admin"}</span>
                <span>{vi ? "Ký duyệt & Bàn giao" : "Sign-off & Handover"}</span>
              </div>
            </div>
          </div>

          {/* BẢNG KIỂM ĐỊNH 5 CỔNG CHẤT LƯỢNG (QUALITY GATES) */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle2 size={18} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                  {vi ? "Bảng Thẩm Tra 5 Cổng Chất Lượng Triển Khai (Quality Gates)" : "Deployment Quality Gates Audit"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi
                    ? "Platform Admin giám sát việc tuân thủ các cổng điều kiện trước khi cho phép doanh nghiệp vận hành quy tắc phát hiện."
                    : "Platform Admin oversight of quality gates before permitting rule operations."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Cổng điều kiện" : "Quality Gate"}</th>
                    <th>{vi ? "Tiêu chuẩn đánh giá" : "Criteria"}</th>
                    <th>{vi ? "Trạng thái thực tế tại hồ sơ" : "Actual Status"}</th>
                    <th>{vi ? "Kết quả" : "Gate Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong style={{ color: "var(--security-text)" }}>
                        {vi ? "1. Hồ sơ & Tài liệu tiếp nhận" : "1. Intake Documents"}
                      </strong>
                    </td>
                    <td>{vi ? "Có tài liệu nghiệp vụ do khách hàng cung cấp" : "Business documents uploaded"}</td>
                    <td>
                      {intakeDocs.length > 0 ? (
                        <span>
                          {intakeDocs.length} {vi ? "tài liệu đã tiếp nhận" : "documents"}
                          {supplementRequests.length > 0 && ` · ${supplementRequests.length} ${vi ? "yêu cầu bổ sung" : "supplements"}`}
                        </span>
                      ) : (
                        <span style={{ color: "var(--security-muted)" }}>{vi ? "Chưa có tệp tài liệu nào" : "No documents"}</span>
                      )}
                    </td>
                    <td>
                      <span className={intakeDocs.length > 0 ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}>
                        {intakeDocs.length > 0 ? (vi ? "ĐẠT" : "PASS") : (vi ? "CHỜ TÀI LIỆU" : "PENDING")}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong style={{ color: "var(--security-text)" }}>
                        {vi ? "2. Tiêu chí phát hiện gian lận" : "2. Detection Conditions"}
                      </strong>
                    </td>
                    <td>{vi ? "Đặc tả các kịch bản bất thường và ngưỡng cụ thể" : "Fraud detection criteria formulated"}</td>
                    <td>
                      {conditions.length > 0 ? (
                        <span>{conditions.length} {vi ? "điều kiện phát hiện đã hoàn thiện" : "conditions defined"}</span>
                      ) : (
                        <span style={{ color: "var(--security-muted)" }}>{vi ? "Chưa xác lập điều kiện nào" : "No conditions"}</span>
                      )}
                    </td>
                    <td>
                      <span className={conditions.length > 0 ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}>
                        {conditions.length > 0 ? (vi ? "ĐẠT" : "PASS") : (vi ? "CHƯA ĐẠT" : "PENDING")}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong style={{ color: "var(--security-text)" }}>
                        {vi ? "3. Danh mục Schema dữ liệu" : "3. Data Fields Schema"}
                      </strong>
                    </td>
                    <td>{vi ? "Chuẩn hóa tên trường, kiểu dữ liệu và tính bắt buộc" : "Data schema finalized"}</td>
                    <td>
                      {schemaFields.length > 0 ? (
                        <span>{schemaFields.length} {vi ? "trường dữ liệu đã chuẩn hóa" : "fields documented"}</span>
                      ) : (
                        <span style={{ color: "var(--security-muted)" }}>{vi ? "Chưa có danh mục schema" : "No schema"}</span>
                      )}
                    </td>
                    <td>
                      <span className={schemaFields.length > 0 ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}>
                        {schemaFields.length > 0 ? (vi ? "ĐẠT" : "PASS") : (vi ? "CHƯA ĐẠT" : "PENDING")}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong style={{ color: "var(--security-text)" }}>
                        {vi ? "4. Doanh nghiệp ký duyệt xác nhận" : "4. Client Sign-off"}
                      </strong>
                    </td>
                    <td>{vi ? "Biên bản ghi nhận xác nhận đặc tả từ đại diện SME" : "Signed confirmation from client"}</td>
                    <td>
                      {isConfirmed ? (
                        <span>
                          {vi ? "Đã xác nhận bởi:" : "Confirmed by:"}{" "}
                          <strong>{confirmedByName ?? "-"}</strong>
                          {confirmedAtDate && ` · ${confirmedAtDate}`}
                          {confirmedChannel && ` (${confirmedChannel})`}
                        </span>
                      ) : (
                        <span style={{ color: "var(--security-muted)" }}>{vi ? "Chưa có xác nhận nghiệp vụ" : "Pending client confirmation"}</span>
                      )}
                    </td>
                    <td>
                      <span className={isConfirmed ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}>
                        {isConfirmed ? (vi ? "ĐÃ XÁC NHẬN" : "CONFIRMED") : (vi ? "CHỜ XÁC NHẬN" : "PENDING")}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong style={{ color: "var(--security-text)" }}>
                        {vi ? "5. Nghiệm thu dữ liệu & kỹ thuật" : "5. Technical Clarification"}
                      </strong>
                    </td>
                    <td>{vi ? "Implementation Staff đối soát hoàn tất dữ liệu kiểm thử" : "Technical data verified by staff"}</td>
                    <td>
                      {isClarified ? (
                        <span>{vi ? "Implementation Staff đã đối soát hoàn tất" : "Clarified by Implementation Staff"}</span>
                      ) : (
                        <span style={{ color: "var(--security-muted)" }}>{vi ? "Chưa nghiệm thu đối soát kỹ thuật" : "Technical check not completed"}</span>
                      )}
                    </td>
                    <td>
                      <span className={isClarified ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}>
                        {isClarified ? (vi ? "ĐÃ NGHIỆM THU" : "VERIFIED") : (vi ? "CHƯA HOÀN TẤT" : "PENDING")}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Khối Kết luận Đánh giá Mức độ Sẵn sàng */}
            <div
              style={{
                margin: "16px 20px 20px",
                padding: "16px 20px",
                borderRadius: "6px",
                border: readiness.ready ? "1px solid var(--low-border)" : "1px solid var(--high-border)",
                background: readiness.ready ? "var(--low-bg)" : "var(--high-bg)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <strong style={{ fontSize: "14px", color: readiness.ready ? "var(--low-text)" : "var(--high-text)" }}>
                  {readiness.ready
                    ? vi
                      ? "Hồ sơ đã đạt toàn bộ tiêu chuẩn sẵn sàng vận hành!"
                      : "Enterprise profile satisfies all deployment quality gates!"
                    : vi
                    ? "Hồ sơ đang trong quá trình hoàn thiện hoặc chờ phê duyệt"
                    : "Enterprise profile requires further clarification or approval"}
                </strong>
                {readiness.ready && (
                  <button
                    type="button"
                    className={styles.onboardingBtnPrimary}
                    onClick={() => onOpenRules(selectedEnterprise.id)}
                  >
                    <ArrowRight size={15} aria-hidden="true" />
                    {vi ? "Chuyển sang thiết lập quy tắc" : "Proceed to rule setup"}
                  </button>
                )}
              </div>

              {!readiness.ready && readiness.missingItems.length > 0 && (
                <div style={{ fontSize: "12px", color: "var(--security-text)" }}>
                  <p style={{ margin: "2px 0 6px", fontWeight: 600 }}>
                    {vi ? "Các tiêu chí kiểm định còn thiếu cần hoàn thành:" : "Pending gates to satisfy:"}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.6 }}>
                    {readiness.missingItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: THẨM TRA BỘ ĐẶC TẢ & TIÊU CHÍ */}
      {activeTab === "spec" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Bản chụp đóng băng đã xác nhận hoặc dự thảo đã gửi */}
          {(activeConfirmedSnapshot || activeSentSnapshot) && (
            <div className={styles.onboardingPlatformBanner} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <strong style={{ fontSize: "14px", color: "var(--security-text)" }}>
                    {activeConfirmedSnapshot
                      ? vi
                        ? `Bản chụp đặc tả đã xác nhận: Phiên bản ${activeConfirmedSnapshot.version}`
                        : `Confirmed Snapshot: Version ${activeConfirmedSnapshot.version}`
                      : vi
                      ? `Bản dự thảo đã gửi gần nhất: Phiên bản ${activeSentSnapshot?.version}`
                      : `Latest Sent Draft: Version ${activeSentSnapshot?.version}`}
                  </strong>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--security-text-secondary)" }}>
                    {activeConfirmedSnapshot
                      ? vi
                        ? `Xác nhận ngày ${confirmedAtDate ?? "-"} bởi ${confirmedByName ?? "-"}`
                        : `Confirmed on ${confirmedAtDate ?? "-"} by ${confirmedByName ?? "-"}`
                      : vi
                      ? `Gửi ngày ${activeSentSnapshot?.sentAt ?? "-"}`
                      : `Sent on ${activeSentSnapshot?.sentAt ?? "-"}`}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.onboardingBtnSecondary}
                  onClick={() => {
                    const snap = activeConfirmedSnapshot ?? activeSentSnapshot;
                    if (snap) onOpenSentSnapshotModal(snap);
                  }}
                >
                  <Eye size={14} aria-hidden="true" />
                  {vi ? "Xem chi tiết bản chụp đóng băng" : "View frozen snapshot"}
                </button>
              </div>
            </div>
          )}

          {/* Bảng 1: Thẩm tra Điều kiện phát hiện gian lận */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "1. Danh mục Điều kiện phát hiện gian lận (Conditions Audit)" : "1. Detection Conditions Audit"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi
                    ? "Các quy tắc nghiệp vụ bất thường được thỏa thuận giữa khách hàng và nhân sự triển khai."
                    : "Business anomaly criteria agreed between enterprise and implementation staff."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Tên điều kiện phát hiện" : "Condition Name"}</th>
                    <th>{vi ? "Tiêu chí kỹ thuật / Ngưỡng phát hiện" : "Detection Criteria & Thresholds"}</th>
                    <th>{vi ? "Phạm vi giao dịch áp dụng" : "Applicable Scope"}</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.length > 0 ? (
                    conditions.map((cond) => (
                      <tr key={cond.id}>
                        <td>
                          <strong style={{ color: "var(--security-text)" }}>{cond.name}</strong>
                          <div style={{ fontSize: "12px", color: "var(--security-muted)" }}>ID: {cond.id}</div>
                        </td>
                        <td>
                          <div style={{ lineHeight: 1.5, fontSize: "12px", color: "var(--security-text-secondary)" }}>
                            {cond.criteria}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>
                            {cond.scope ?? (vi ? "Toàn bộ giao dịch" : "All transactions")}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className={styles.emptyState}>
                        {vi ? "Chưa có điều kiện phát hiện nào được ghi nhận trong hồ sơ này." : "No conditions registered yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bảng 2: Thẩm tra Danh mục Schema dữ liệu */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "2. Từ điển Cấu trúc dữ liệu (Data Schema Dictionary)" : "2. Data Schema Dictionary"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi
                    ? "Các trường dữ liệu giao dịch cần thiết để nạp vào hệ thống và kích hoạt rule engine."
                    : "Data fields required for ingestion and rule evaluation."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Tên trường" : "Field Name"}</th>
                    <th>{vi ? "Kiểu dữ liệu" : "Data Type"}</th>
                    <th>{vi ? "Bắt buộc / Tùy chọn" : "Requirement"}</th>
                    <th>{vi ? "Mô tả ý nghĩa nghiệp vụ" : "Description"}</th>
                  </tr>
                </thead>
                <tbody>
                  {schemaFields.length > 0 ? (
                    schemaFields.map((fld, idx) => (
                      <tr key={`${fld.name}-${idx}`}>
                        <td>
                          <code style={{ background: "var(--security-control)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px" }}>
                            {fld.name}
                          </code>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>{fld.type}</span>
                        </td>
                        <td>
                          <span
                            className={fld.required ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}
                            style={{ fontSize: "12px" }}
                          >
                            {fld.required ? (vi ? "Bắt buộc" : "Required") : (vi ? "Tùy chọn" : "Optional")}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>
                            {fld.description || "-"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>
                        {vi ? "Chưa có danh mục schema dữ liệu nào được khởi tạo." : "No schema fields defined."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Khối 3: Giao dịch mẫu (Sample Payload Inspection) */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "3. Dữ liệu Giao dịch Mẫu (Sample Transaction Payload)" : "3. Sample Transaction Payload"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi
                    ? "Dữ liệu JSON mẫu được dùng để kiểm thử tính tương thích trước khi kích hoạt quy tắc thực tế."
                    : "Sample JSON payload used for compatibility verification."}
                </span>
              </div>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <pre className={styles.onboardingAuditCodeBlock}>
                {spec.sampleJson || "[]"}
              </pre>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: HỒ SƠ TÀI LIỆU & NHẬT KÝ TRAO ĐỔI */}
      {activeTab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Mục 1: Bảng tài liệu tiếp nhận */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "1. Danh sách Tài liệu tiếp nhận (Intake Documents)" : "1. Intake Documents"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi ? "Hồ sơ nghiệp vụ, hợp đồng và đặc tả do khách hàng cung cấp." : "Business profiles and contracts supplied by client."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Tên tệp tài liệu" : "Document Name"}</th>
                    <th>{vi ? "Dung lượng" : "Size"}</th>
                    <th>{vi ? "Ngày tải lên" : "Uploaded At"}</th>
                    <th>{vi ? "Thao tác" : "Action"}</th>
                  </tr>
                </thead>
                <tbody>
                  {intakeDocs.length > 0 ? (
                    intakeDocs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <FileText size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                            <strong style={{ color: "var(--security-text)", fontSize: "13px" }}>{doc.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>
                            {doc.sizeBytes ? `${Math.round(doc.sizeBytes / 1024)} KB` : "-"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>{doc.receivedAt}</span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button
                              type="button"
                              className={styles.onboardingBtnSecondary}
                              onClick={() => onPreviewDoc(doc)}
                            >
                              <Eye size={13} aria-hidden="true" />
                              {vi ? "Xem nội dung" : "Preview"}
                            </button>
                            <button
                              type="button"
                              className={styles.onboardingBtnSecondary}
                              onClick={() => onDownloadDoc(doc)}
                            >
                              <Download size={13} aria-hidden="true" />
                              {vi ? "Tải tệp" : "Download"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>
                        {vi ? "Chưa có tài liệu nào được đính kèm." : "No documents uploaded."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mục 2: Lịch sử Yêu cầu Bổ sung */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "2. Nhật ký Yêu cầu Bổ sung Hồ sơ (Supplement Requests)" : "2. Supplement Requests"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi ? "Các lần Implementation Staff yêu cầu khách hàng làm rõ hoặc bổ sung tài liệu." : "Staff requests for supplementary documentation."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Thời gian" : "Timestamp"}</th>
                    <th>{vi ? "Các hạng mục cần bổ sung" : "Requested Items"}</th>
                    <th>{vi ? "Ghi chú & Hướng dẫn" : "Notes"}</th>
                    <th>{vi ? "Trạng thái" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplementRequests.length > 0 ? (
                    supplementRequests.map((req) => (
                      <tr key={req.id}>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>{req.requestedAt}</span>
                        </td>
                        <td>
                          <div style={{ fontSize: "12px", color: "var(--security-text)" }}>
                            {req.items.join(", ")}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>
                            {req.note || "-"}
                          </div>
                        </td>
                        <td>
                          <span
                            className={req.receivedAt ? styles.onboardingGateStatusPass : styles.onboardingGateStatusPending}
                            style={{ fontSize: "12px" }}
                          >
                            {req.receivedAt ? (vi ? "Đã nhận" : "Received") : (vi ? "Chờ bổ sung" : "Pending")}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>
                        {vi ? "Không có yêu cầu bổ sung nào phát sinh." : "No supplement requests recorded."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mục 3: Lịch sử Phản hồi từ Doanh nghiệp */}
          <section className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.panelHeader} style={{ padding: "16px 20px" }}>
              <div>
                <h2 style={{ fontSize: "15px" }}>
                  {vi ? "3. Lịch sử Phản hồi từ Doanh nghiệp (Feedback History)" : "3. Client Feedback History"}
                </h2>
                <span className={styles.ruleCaption}>
                  {vi ? "Ý kiến đóng góp và yêu cầu điều chỉnh từ phía khách hàng sau khi nhận dự thảo." : "Client feedback on draft specifications."}
                </span>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{vi ? "Thời gian" : "Timestamp"}</th>
                    <th>{vi ? "Người liên hệ" : "Contact Person"}</th>
                    <th>{vi ? "Kênh trao đổi" : "Channel"}</th>
                    <th>{vi ? "Nội dung phản hồi điều chỉnh" : "Feedback Content"}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbackList.length > 0 ? (
                    feedbackList.map((fb, idx) => (
                      <tr key={`${fb.receivedAt}-${idx}`}>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>{fb.receivedAt}</span>
                        </td>
                        <td>
                          <strong style={{ fontSize: "12px", color: "var(--security-text)" }}>
                            {fb.contactPerson || "-"}
                          </strong>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--security-text-secondary)" }}>
                            {fb.channel || "-"}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: "12px", color: "var(--security-text-secondary)", lineHeight: 1.5 }}>
                            {fb.content}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>
                        {vi ? "Chưa có phản hồi chỉnh sửa nào từ phía khách hàng." : "No feedback recorded."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
