"use client";
import { ArrowRight, Building2, CheckCircle2, ClipboardList, Plus, Search } from "lucide-react";
import type { UserProfile } from "@/types/fraudguard";
import type { Enterprise, OnboardingStage } from "@/types/enterprise";
import { enterprisePlan, resolveOnboardingStage } from "@/utils/enterprise";
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

      {currentUser.role === "Platform Admin" && (
        <section className={`${styles.panel} ${styles.workflowPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>
                <Building2 size={18} aria-hidden="true" />
                {vi ? "Khởi tạo doanh nghiệp & phân công triển khai" : "Create enterprise & assign deployment staff"}
              </h2>
              <span className={styles.ruleCaption}>
                {vi
                  ? "Mỗi doanh nghiệp tương ứng 1 workspace triển khai chính và 1 tài khoản Quản trị Doanh nghiệp (SME Admin) ban đầu."
                  : "Each enterprise has one primary workspace and an initial SME Admin account."}
              </span>
            </div>
          </div>
          <form className={styles.onboardingCreateForm} onSubmit={onCreateSubmit}>
            <label className={styles.drawerLabel}>
              {vi ? "Tên doanh nghiệp" : "Enterprise name"}
              <input
                required
                className={styles.control}
                value={companyName}
                onChange={(e) => onCompanyNameChange(e.target.value)}
                placeholder={vi ? "Ví dụ: Công ty TNHH Thương mại..." : "e.g., Retail Co., Ltd."}
              />
            </label>
            <label className={styles.drawerLabel}>
              {vi ? "Nhân sự triển khai phụ trách" : "Assigned Implementation Staff"}
              <select
                className={styles.control}
                value={staffId}
                onChange={(e) => onStaffIdChange(e.target.value)}
              >
                {staffMembers.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.drawerLabel}>
              {vi ? "Họ tên SME Admin đầu tiên" : "Initial SME Admin name"}
              <input
                required
                className={styles.control}
                value={adminName}
                onChange={(e) => onAdminNameChange(e.target.value)}
              />
            </label>
            <label className={styles.drawerLabel}>
              {vi ? "Email SME Admin" : "SME Admin email"}
              <input
                required
                type="email"
                className={styles.control}
                value={adminEmail}
                onChange={(e) => onAdminEmailChange(e.target.value)}
              />
            </label>
            <button className={styles.onboardingBtnPrimary} type="submit">
              {vi ? "Tạo hồ sơ doanh nghiệp" : "Create enterprise"}
            </button>
            {createError && (
              <p className={styles.workflowError} role="alert">
                {createError}
              </p>
            )}
            {createMessage && (
              <p className={styles.workflowFeedback} role="status">
                {createMessage}
              </p>
            )}
          </form>
        </section>
      )}

      <section className={`${styles.panel} ${styles.tablePanel}`}>
        <div className={styles.onboardingFilterBar}>
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

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{vi ? "Doanh nghiệp & Mã hồ sơ" : "Enterprise & Code"}</th>
                <th>{vi ? "Mô hình & Gói" : "Business Model & Plan"}</th>
                <th>{vi ? "Người đại diện / SME Admin" : "Representative / SME Admin"}</th>
                <th>{vi ? "Nhân sự phụ trách" : "Assigned Staff"}</th>
                <th>{vi ? "Giai đoạn hiện tại" : "Current Stage"}</th>
                <th>{vi ? "Thao tác" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnterprises.map((enterprise) => {
                const stage = resolveOnboardingStage(enterprise);
                const plan = enterprisePlan(enterprise);
                const staffName =
                  users.find((u) => u.id === enterprise.deploymentStaffId)?.name ??
                  enterprise.deploymentStaffId;
                const smeAdmin =
                  enterprise.specification?.representativeName ??
                  enterprise.specification?.smeAdminName ??
                  users.find((u) => u.enterpriseId === enterprise.id && u.role === "SME Admin")?.name ??
                  (vi ? "Chưa cập nhật" : "Unassigned");
                const activeVersion =
                  enterprise.specification?.confirmedSnapshot?.version ||
                  enterprise.specification?.sentSnapshot?.version ||
                  enterprise.specification?.savedDraft?.version ||
                  "v1.0";

                return (
                  <tr key={enterprise.id}>
                    <td>
                      <div className={styles.findingName}>{enterprise.name}</div>
                      <span className={styles.findingMeta}>
                        {vi ? "Mã hồ sơ:" : "Code:"} {enterprise.code ?? enterprise.id} ·{" "}
                        {vi ? "Phiên bản:" : "Version:"} {activeVersion}
                      </span>
                    </td>
                    <td>
                      <div>
                        {enterprise.specification?.businessModel ??
                          (vi ? "Thương mại & dịch vụ SME" : "SME Commerce")}
                      </div>
                      <span className={styles.findingMeta}>
                        {vi ? "Gói:" : "Plan:"} {plan ?? (vi ? "Chưa chọn" : "Unset")} ·{" "}
                        {enterprise.projectIds.length} workspace
                      </span>
                    </td>
                    <td>
                      <div>{smeAdmin}</div>
                      <span className={styles.findingMeta}>
                        {enterprise.specification?.representativeRole ?? "SME Admin"}
                      </span>
                    </td>
                    <td>{staffName}</td>
                    <td>
                      <span className={styles.onboardingStageBadge} data-stage={stage}>
                        {stageLabels[stage]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {enterprise.projectIds.length === 0 &&
                          currentUser.role === "Platform Admin" &&
                          onProvisionWorkspace && (
                            <button
                              type="button"
                              className={styles.onboardingBtnPrimary}
                              onClick={() => onProvisionClick(enterprise)}
                            >
                              <Plus size={14} aria-hidden="true" />
                              {vi ? "Khởi tạo workspace" : "Provision workspace"}
                            </button>
                          )}
                        <button
                          type="button"
                          className={styles.onboardingBtnSecondary}
                          onClick={() => onEnterProfile(enterprise)}
                        >
                          {vi ? "Vào hồ sơ" : "Open profile"}
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEnterprises.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>
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
    </div>
  );
}
