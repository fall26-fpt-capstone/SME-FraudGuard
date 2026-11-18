"use client";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import type { UserProfile } from "@/types/fraudguard";
import type { Enterprise, OnboardingStage } from "@/types/enterprise";
import {
  enterprisePlan,
  formatEnterpriseCode,
  resolveOnboardingStage,
  truncateText,
} from "@/utils/enterprise";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  enterprises: Enterprise[];
  filteredEnterprises: Enterprise[];
  users: UserProfile[];
  currentUser: UserProfile;
  staffMembers: UserProfile[];
  stageLabels: Record<OnboardingStage, string>;
  totalCount: number;
  activeClarifyingCount: number;
  readyCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  stageFilter: string;
  onStageFilterChange: (value: string) => void;
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  staffId: string;
  onStaffIdChange: (value: string) => void;
  adminName: string;
  onAdminNameChange: (value: string) => void;
  adminEmail: string;
  onAdminEmailChange: (value: string) => void;
  createError: string;
  createMessage: string;
  onCreateSubmit: (event: { preventDefault: () => void }) => void;
  onProvisionWorkspace?: (enterpriseId: string) => boolean;
  onProvisionClick: (enterprise: Enterprise) => void;
  onEnterProfile: (enterprise: Enterprise) => void;
}

export function OnboardingEnterpriseListScreen({
  vi,
  enterprises,
  filteredEnterprises,
  users,
  currentUser,
  staffMembers,
  stageLabels,
  totalCount,
  activeClarifyingCount,
  readyCount,
  searchQuery,
  onSearchQueryChange,
  stageFilter,
  onStageFilterChange,
  companyName,
  onCompanyNameChange,
  staffId,
  onStaffIdChange,
  adminName,
  onAdminNameChange,
  adminEmail,
  onAdminEmailChange,
  createError,
  createMessage,
  onCreateSubmit,
  onProvisionWorkspace,
  onProvisionClick,
  onEnterProfile,
}: Props) {
  const [viewingEnterprise, setViewingEnterprise] = useState<Enterprise | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Close modals on Escape key
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (createModalOpen) setCreateModalOpen(false);
        if (viewingEnterprise) setViewingEnterprise(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createModalOpen, viewingEnterprise]);

  // Auto-close create modal shortly after success message appears
  useEffect(() => {
    if (createMessage && createModalOpen) {
      const timer = setTimeout(() => {
        setCreateModalOpen(false);
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [createMessage, createModalOpen]);

  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.pageHeading}>
        <div>
          <h1>{vi ? "Danh sách doanh nghiệp được phân công" : "Assigned Enterprises"}</h1>
          <p>
            {vi
              ? "Tiếp nhận hồ sơ, làm rõ đặc tả điều kiện phát hiện & trường dữ liệu, và ghi nhận xác nhận từ doanh nghiệp trước khi thiết lập quy tắc."
              : "Review intake profiles, clarify detection conditions and data fields, and record enterprise confirmation before rule setup."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span className={styles.setAccessLabel}>
            {currentUser.role === "Platform Admin"
              ? vi
                ? "Quản trị Nền tảng"
                : "Platform Admin"
              : vi
              ? `Nhân sự triển khai: ${currentUser.name}`
              : `Implementation Staff: ${currentUser.name}`}
          </span>
        </div>
      </div>

      <section
        className={styles.onboardingKpiGrid}
        aria-label={vi ? "Tổng quan hồ sơ phân công" : "Assigned profile summary"}
      >
        <div className={styles.onboardingKpiCard}>
          <div className={styles.onboardingKpiLabel}>
            <span>{vi ? "Doanh nghiệp được phân công" : "Assigned enterprises"}</span>
            <Building2 size={16} aria-hidden="true" />
          </div>
          <div className={styles.onboardingKpiValue}>{totalCount}</div>
          <span className={styles.onboardingKpiSub}>
            {vi ? "Hồ sơ thuộc phạm vi phụ trách hiện tại" : "Profiles in current assignment scope"}
          </span>
        </div>

        <div className={styles.onboardingKpiCard}>
          <div className={styles.onboardingKpiLabel}>
            <span>{vi ? "Đang tiếp nhận & làm rõ đặc tả" : "In intake & clarification"}</span>
            <ClipboardList size={16} aria-hidden="true" />
          </div>
          <div className={styles.onboardingKpiValue}>{activeClarifyingCount}</div>
          <span className={styles.onboardingKpiSub}>
            {vi ? "Cần rà soát hồ sơ, làm rõ hoặc chờ xác nhận" : "Pending review, clarification, or confirmation"}
          </span>
        </div>

        <div className={styles.onboardingKpiCard}>
          <div className={styles.onboardingKpiLabel}>
            <span>{vi ? "Sẵn sàng thiết lập quy tắc" : "Ready for rule setup"}</span>
            <CheckCircle2 size={16} aria-hidden="true" />
          </div>
          <div className={styles.onboardingKpiValue}>{readyCount}</div>
          <span className={styles.onboardingKpiSub}>
            {vi ? "Đã xác nhận đặc tả và làm rõ đủ dữ liệu" : "Confirmed and clarified for rule configuration"}
          </span>
        </div>
      </section>

      {/* DANH SÁCH DOANH NGHIỆP */}
      <section className={`${styles.panel} ${styles.tablePanel}`}>
        <div className={styles.onboardingFilterBar}>
          <div style={{ display: "flex", gap: "12px", flex: "1 1 300px", flexWrap: "wrap", alignItems: "center" }}>
            <div className={styles.onboardingSearchBox}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className={styles.onboardingSearchInput}
                aria-label={
                  vi
                    ? "Tìm kiếm theo tên doanh nghiệp, mã hồ sơ hoặc người đại diện"
                    : "Search enterprise name, code, or representative"
                }
                placeholder={
                  vi
                    ? "Tìm theo tên doanh nghiệp, mã hồ sơ hoặc đại diện..."
                    : "Search enterprise name, code, or representative..."
                }
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
              />
            </div>

            <select
              className={styles.control}
              aria-label={vi ? "Lọc trạng thái triển khai" : "Filter onboarding stage"}
              value={stageFilter}
              onChange={(e) => onStageFilterChange(e.target.value)}
            >
              <option value="all">{vi ? "Tất cả giai đoạn" : "All stages"}</option>
              <option value="intake">{stageLabels.intake}</option>
              <option value="supplement_pending">{stageLabels.supplement_pending}</option>
              <option value="clarifying">{stageLabels.clarifying}</option>
              <option value="waiting_confirmation">{stageLabels.waiting_confirmation}</option>
              <option value="revising">{stageLabels.revising}</option>
              <option value="waiting_reconfirmation">{stageLabels.waiting_reconfirmation}</option>
              <option value="confirmed">{stageLabels.confirmed}</option>
            </select>
          </div>

          {currentUser.role === "Platform Admin" && (
            <button
              type="button"
              className={styles.onboardingBtnPrimary}
              onClick={() => setCreateModalOpen(true)}
              style={{ whiteSpace: "nowrap" }}
            >
              <Plus size={15} aria-hidden="true" />
              {vi ? "Tạo hồ sơ doanh nghiệp" : "Create enterprise"}
            </button>
          )}
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{vi ? "Doanh nghiệp & Mã hồ sơ" : "Enterprise & Code"}</th>
                <th>{vi ? "Mô hình & Gói" : "Business Model & Plan"}</th>
                <th>{vi ? "Giai đoạn hiện tại" : "Current Stage"}</th>
                <th>{vi ? "Thao tác" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnterprises.map((enterprise) => {
                const stage = resolveOnboardingStage(enterprise);
                const plan = enterprisePlan(enterprise);
                const activeVersion =
                  enterprise.specification?.confirmedSnapshot?.version ||
                  enterprise.specification?.sentSnapshot?.version ||
                  enterprise.specification?.savedDraft?.version ||
                  "v1.0";
                const businessModel =
                  enterprise.specification?.businessModel ??
                  (vi ? "Thương mại & dịch vụ SME" : "SME Commerce");
                const formattedCode = formatEnterpriseCode(enterprise);

                return (
                  <tr key={enterprise.id}>
                    <td>
                      <div className={styles.findingName} title={enterprise.name}>
                        {truncateText(enterprise.name, 16)}
                      </div>
                      <span className={styles.findingMeta}>
                        {vi ? "Mã hồ sơ:" : "Code:"} {formattedCode} ·{" "}
                        {vi ? "Phiên bản:" : "Version:"} {activeVersion}
                      </span>
                    </td>
                    <td>
                      <div title={businessModel}>
                        {truncateText(businessModel, 16)}
                      </div>
                      <span className={styles.findingMeta}>
                        {vi ? "Gói:" : "Plan:"} {plan ?? (vi ? "Chưa chọn" : "Unset")} ·{" "}
                        {enterprise.projectIds.length} workspace
                      </span>
                    </td>
                    <td>
                      <span className={styles.onboardingStageBadge} data-stage={stage}>
                        {stageLabels[stage]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          type="button"
                          className={styles.onboardingBtnSecondary}
                          onClick={() => onEnterProfile(enterprise)}
                        >
                          {vi ? "Vào hồ sơ" : "Open profile"}
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.onboardingBtnSecondary}
                          onClick={() => setViewingEnterprise(enterprise)}
                          title={vi ? "Xem toàn bộ thông tin doanh nghiệp" : "View enterprise details"}
                        >
                          <Eye size={14} aria-hidden="true" />
                          {vi ? "Xem chi tiết" : "Details"}
                        </button>
                        {enterprise.projectIds.length === 0 &&
                          currentUser.role === "Platform Admin" &&
                          onProvisionWorkspace && (
                            <button
                              type="button"
                              className={styles.onboardingBtnPrimary}
                              onClick={() => onProvisionClick(enterprise)}
                            >
                              <Plus size={14} aria-hidden="true" />
                              {vi ? "Khởi tạo workspace" : "Provision"}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEnterprises.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    {vi
                      ? "Không có doanh nghiệp nào khớp với từ khóa hoặc bộ lọc giai đoạn hiện tại."
                      : "No assigned enterprises match the current search or stage filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.ruleFootnote}>
          {vi
            ? `Hiển thị ${filteredEnterprises.length} trên tổng số ${enterprises.length} doanh nghiệp trong phạm vi phụ trách.`
            : `Showing ${filteredEnterprises.length} of ${enterprises.length} assigned enterprises.`}
        </div>
      </section>

      {/* MODAL 1: TẠO HỒ SƠ DOANH NGHIỆP MỚI (PLATFORM ADMIN) */}
      {createModalOpen && currentUser.role === "Platform Admin" && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={() => setCreateModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-enterprise-modal-title"
        >
          <div
            className={styles.onboardingModalDialog}
            style={{ maxWidth: "580px", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.onboardingModalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  className={styles.onboardingStepNumber}
                  style={{
                    background: "var(--security-blue-bg)",
                    borderColor: "var(--security-blue)",
                    color: "var(--security-blue)",
                  }}
                >
                  <Building2 size={16} aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="create-enterprise-modal-title"
                    style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--security-text)" }}
                  >
                    {vi ? "Khởi tạo hồ sơ doanh nghiệp" : "Create Enterprise Profile"}
                  </h2>
                  <p className={styles.onboardingCardSub} style={{ margin: "3px 0 0" }}>
                    {vi
                      ? "Khởi tạo 1 workspace triển khai chính và tài khoản Quản trị Doanh nghiệp (SME Admin) ban đầu."
                      : "Provision 1 primary workspace and an initial SME Admin account."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                style={{ padding: "6px 10px", minHeight: "32px" }}
                aria-label={vi ? "Đóng hộp thoại tạo doanh nghiệp" : "Close create enterprise modal"}
                onClick={() => setCreateModalOpen(false)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={onCreateSubmit}>
              <div className={styles.onboardingModalBody} style={{ gap: "16px" }}>
                {/* Phần 1: Thông tin Doanh nghiệp & Phân công */}
                <div className={styles.onboardingFormSection}>
                  <h3 className={styles.onboardingFormSectionTitle}>
                    <Building2 size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                    {vi ? "Thông tin Doanh nghiệp & Phân công" : "Enterprise & Assignment"}
                  </h3>

                  <div className={styles.onboardingFormField}>
                    <label htmlFor="create-company-name" className={styles.onboardingFormLabel}>
                      {vi ? "Tên doanh nghiệp" : "Enterprise name"}
                      <span style={{ color: "var(--critical-text)" }}>*</span>
                    </label>
                    <input
                      id="create-company-name"
                      required
                      className={styles.onboardingFormInput}
                      value={companyName}
                      onChange={(e) => onCompanyNameChange(e.target.value)}
                      placeholder={vi ? "Ví dụ: Công ty TNHH Thương mại An Phúc" : "e.g., An Phuc Retail Co., Ltd."}
                    />
                  </div>

                  <div className={styles.onboardingFormField}>
                    <label htmlFor="create-staff-id" className={styles.onboardingFormLabel}>
                      {vi ? "Nhân sự triển khai phụ trách" : "Assigned Implementation Staff"}
                      <span style={{ color: "var(--critical-text)" }}>*</span>
                    </label>
                    <select
                      id="create-staff-id"
                      className={styles.onboardingFormInput}
                      value={staffId}
                      onChange={(e) => onStaffIdChange(e.target.value)}
                    >
                      {staffMembers.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} ({staff.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Phần 2: Tài khoản Quản trị Doanh nghiệp (SME Admin) */}
                <div className={styles.onboardingFormSection}>
                  <h3 className={styles.onboardingFormSectionTitle}>
                    <User size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                    {vi ? "Tài khoản Quản trị Doanh nghiệp (SME Admin)" : "Initial SME Admin Account"}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    <div className={styles.onboardingFormField}>
                      <label htmlFor="create-admin-name" className={styles.onboardingFormLabel}>
                        {vi ? "Họ tên SME Admin đầu tiên" : "Initial SME Admin name"}
                        <span style={{ color: "var(--critical-text)" }}>*</span>
                      </label>
                      <input
                        id="create-admin-name"
                        required
                        className={styles.onboardingFormInput}
                        value={adminName}
                        onChange={(e) => onAdminNameChange(e.target.value)}
                        placeholder={vi ? "Ví dụ: Trần Văn An" : "e.g., John Doe"}
                      />
                    </div>

                    <div className={styles.onboardingFormField}>
                      <label htmlFor="create-admin-email" className={styles.onboardingFormLabel}>
                        {vi ? "Email SME Admin" : "SME Admin email"}
                        <span style={{ color: "var(--critical-text)" }}>*</span>
                      </label>
                      <input
                        id="create-admin-email"
                        required
                        type="email"
                        className={styles.onboardingFormInput}
                        value={adminEmail}
                        onChange={(e) => onAdminEmailChange(e.target.value)}
                        placeholder="an.tran@doanhnghiep.vn"
                      />
                    </div>
                  </div>

                  <p className={styles.onboardingFormHint}>
                    {vi
                      ? "Tài khoản quản trị ban đầu sẽ được dùng để đăng nhập và phê duyệt bộ quy tắc phát hiện gian lận của doanh nghiệp."
                      : "Initial admin account used to log in and approve detection rules."}
                  </p>
                </div>

                {createError && (
                  <p className={styles.workflowError} role="alert" style={{ margin: "2px 0 0" }}>
                    {createError}
                  </p>
                )}
                {createMessage && (
                  <p className={styles.workflowFeedback} role="status" style={{ margin: "2px 0 0" }}>
                    {createMessage}
                  </p>
                )}
              </div>

              <div className={styles.onboardingModalFooter}>
                <button
                  type="button"
                  className={styles.onboardingBtnSecondary}
                  onClick={() => setCreateModalOpen(false)}
                >
                  {vi ? "Hủy" : "Cancel"}
                </button>
                <button type="submit" className={styles.onboardingBtnPrimary}>
                  <Plus size={15} aria-hidden="true" />
                  {vi ? "Khởi tạo doanh nghiệp" : "Create enterprise"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: XEM CHI TIẾT TOÀN BỘ THÔNG TIN DOANH NGHIỆP */}
      {viewingEnterprise && (() => {
        const ent = viewingEnterprise;
        const stage = resolveOnboardingStage(ent);
        const plan = enterprisePlan(ent);
        const staffUser = users.find((u) => u.id === ent.deploymentStaffId);
        const staffName = staffUser?.name ?? ent.deploymentStaffId ?? (vi ? "Chưa phân công" : "Unassigned");
        const staffEmail = staffUser?.email ?? "";
        const adminUser = users.find((u) => u.enterpriseId === ent.id && u.role === "SME Admin");
        const smeAdminName =
          ent.specification?.representativeName ??
          ent.specification?.smeAdminName ??
          adminUser?.name ??
          (vi ? "Chưa cập nhật" : "Not set");
        const smeAdminEmail =
          ent.specification?.representativeEmail ??
          ent.specification?.smeAdminEmail ??
          adminUser?.email ??
          (vi ? "Chưa cập nhật" : "Not set");
        const smeAdminRole =
          ent.specification?.representativeRole ??
          (vi ? "Quản trị Doanh nghiệp (SME Admin)" : "SME Admin");
        const activeVersion =
          ent.specification?.confirmedSnapshot?.version ||
          ent.specification?.sentSnapshot?.version ||
          ent.specification?.savedDraft?.version ||
          "v1.0";
        const businessModel =
          ent.specification?.businessModel ??
          (vi ? "Thương mại & dịch vụ SME" : "SME Commerce");
        const formattedCode = formatEnterpriseCode(ent);

        return (
          <div
            className={styles.onboardingModalBackdrop}
            onClick={() => setViewingEnterprise(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enterprise-detail-modal-title"
          >
            <div
              className={styles.onboardingModalDialog}
              style={{ maxWidth: "660px", width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.onboardingModalHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    className={styles.onboardingStepNumber}
                    style={{
                      background: "var(--security-blue-bg)",
                      borderColor: "var(--security-blue)",
                      color: "var(--security-blue)",
                    }}
                  >
                    <Building2 size={14} aria-hidden="true" />
                  </div>
                  <div>
                    <h2
                      id="enterprise-detail-modal-title"
                      style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--security-text)" }}
                    >
                      {ent.name}
                    </h2>
                    <span style={{ fontSize: "12px", color: "var(--security-muted)" }}>
                      {vi ? "Mã hồ sơ:" : "Code:"} <strong>{formattedCode}</strong> · {vi ? "Phiên bản:" : "Version:"}{" "}
                      <strong>{activeVersion}</strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.onboardingBtnSecondary}
                  style={{ padding: "6px 10px", minHeight: "32px" }}
                  aria-label={vi ? "Đóng hộp thoại xem chi tiết" : "Close details modal"}
                  onClick={() => setViewingEnterprise(null)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>

              <div
                className={styles.onboardingModalBody}
                style={{ display: "flex", flexDirection: "column", gap: "16px" }}
              >
                {/* Thanh trạng thái giai đoạn */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: "4px",
                    background: "var(--security-control)",
                    border: "1px solid var(--security-border)",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--security-text-secondary)" }}>
                    {vi ? "Giai đoạn triển khai hiện tại:" : "Current Stage:"}
                  </span>
                  <span className={styles.onboardingStageBadge} data-stage={stage}>
                    {stageLabels[stage]}
                  </span>
                </div>

                {/* Grid 4 ô chi tiết thông tin */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {/* Ô 1: Người đại diện / SME Admin */}
                  <div className={styles.onboardingCard} style={{ padding: "14px" }}>
                    <div className={styles.onboardingCardHeader} style={{ paddingBottom: "8px" }}>
                      <h3 style={{ fontSize: "13px" }}>
                        <User size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                        {vi ? "Người đại diện / SME Admin" : "SME Admin & Representative"}
                      </h3>
                    </div>
                    <div className={styles.onboardingCardBody} style={{ gap: "6px", fontSize: "12px" }}>
                      <div>
                        <strong style={{ color: "var(--security-text)" }}>{smeAdminName}</strong>
                      </div>
                      <div style={{ color: "var(--security-text-secondary)" }}>
                        {smeAdminRole}
                      </div>
                      <div style={{ color: "var(--security-muted)", wordBreak: "break-all" }}>
                        {smeAdminEmail}
                      </div>
                    </div>
                  </div>

                  {/* Ô 2: Nhân sự triển khai phụ trách */}
                  <div className={styles.onboardingCard} style={{ padding: "14px" }}>
                    <div className={styles.onboardingCardHeader} style={{ paddingBottom: "8px" }}>
                      <h3 style={{ fontSize: "13px" }}>
                        <ShieldCheck size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                        {vi ? "Nhân sự triển khai phụ trách" : "Assigned Implementation Staff"}
                      </h3>
                    </div>
                    <div className={styles.onboardingCardBody} style={{ gap: "6px", fontSize: "12px" }}>
                      <div>
                        <strong style={{ color: "var(--security-text)" }}>{staffName}</strong>
                      </div>
                      <div style={{ color: "var(--security-text-secondary)" }}>
                        {vi ? "Nhân sự triển khai (Implementation Staff)" : "Implementation Staff"}
                      </div>
                      {staffEmail && (
                        <div style={{ color: "var(--security-muted)", wordBreak: "break-all" }}>
                          {staffEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ô 3: Mô hình kinh doanh & Gói dịch vụ */}
                  <div className={styles.onboardingCard} style={{ padding: "14px" }}>
                    <div className={styles.onboardingCardHeader} style={{ paddingBottom: "8px" }}>
                      <h3 style={{ fontSize: "13px" }}>
                        <Briefcase size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                        {vi ? "Mô hình kinh doanh & Dịch vụ" : "Business Model & Service"}
                      </h3>
                    </div>
                    <div className={styles.onboardingCardBody} style={{ gap: "6px", fontSize: "12px" }}>
                      <div>
                        <span style={{ color: "var(--security-text-secondary)" }}>{vi ? "Mô hình:" : "Model:"}</span>{" "}
                        <strong style={{ color: "var(--security-text)" }}>{businessModel}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--security-text-secondary)" }}>{vi ? "Gói cước:" : "Plan:"}</span>{" "}
                        <strong style={{ color: "var(--security-text)" }}>
                          {plan ?? (vi ? "Chưa chọn gói" : "Unset")}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Ô 4: Không gian triển khai (Workspace) */}
                  <div className={styles.onboardingCard} style={{ padding: "14px" }}>
                    <div className={styles.onboardingCardHeader} style={{ paddingBottom: "8px" }}>
                      <h3 style={{ fontSize: "13px" }}>
                        <Layers size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
                        {vi ? "Phạm vi triển khai (Workspace)" : "Workspace Scope"}
                      </h3>
                    </div>
                    <div className={styles.onboardingCardBody} style={{ gap: "6px", fontSize: "12px" }}>
                      <div>
                        <span style={{ color: "var(--security-text-secondary)" }}>{vi ? "Số lượng workspace:" : "Workspaces:"}</span>{" "}
                        <strong>{ent.projectIds.length}</strong>
                      </div>
                      <div
                        style={{
                          color: "var(--security-muted)",
                          wordBreak: "break-all",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          marginTop: "2px",
                        }}
                      >
                        {ent.projectIds.length > 0
                          ? ent.projectIds.join(", ")
                          : vi
                          ? "Chưa khởi tạo workspace"
                          : "No workspace"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.onboardingModalFooter}>
                <button
                  type="button"
                  className={styles.onboardingBtnSecondary}
                  onClick={() => setViewingEnterprise(null)}
                >
                  {vi ? "Đóng" : "Close"}
                </button>
                <button
                  type="button"
                  className={styles.onboardingBtnPrimary}
                  onClick={() => {
                    setViewingEnterprise(null);
                    onEnterProfile(ent);
                  }}
                >
                  {vi ? "Vào hồ sơ đặc tả" : "Open full profile"}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
