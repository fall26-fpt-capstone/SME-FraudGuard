"use client";
import { ArrowLeft, Plus } from "lucide-react";
import { enterprisePlan } from "@/utils/enterprise";
import {
  useOnboardingWorkflow,
  type OnboardingViewProps,
} from "@/hooks/useOnboardingWorkflow";
import { useLanguage } from "@/context/LanguageContext";
import { OnboardingEnterpriseListScreen } from "./OnboardingEnterpriseListScreen";
import { OnboardingIntakeScreen } from "./OnboardingIntakeScreen";
import { OnboardingClarifyScreen } from "./OnboardingClarifyScreen";
import { OnboardingConfirmationScreen } from "./OnboardingConfirmationScreen";
import { OnboardingModals } from "./OnboardingModals";
import styles from "./SecurityDashboard.module.css";

export function OnboardingView(props: OnboardingViewProps) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const wf = useOnboardingWorkflow(props, vi);

  if (!wf.selectedEnterprise || !wf.spec) {
    return (
      <OnboardingEnterpriseListScreen
        vi={vi}
        enterprises={props.enterprises}
        filteredEnterprises={wf.filteredEnterprises}
        users={props.users}
        currentUser={props.currentUser}
        staffMembers={wf.staffMembers}
        stageLabels={wf.stageLabels}
        totalCount={wf.totalCount}
        activeClarifyingCount={wf.activeClarifyingCount}
        readyCount={wf.readyCount}
        searchQuery={wf.searchQuery}
        onSearchQueryChange={wf.setSearchQuery}
        stageFilter={wf.stageFilter}
        onStageFilterChange={wf.setStageFilter}
        companyName={wf.companyName}
        onCompanyNameChange={wf.setCompanyName}
        staffId={wf.staffId}
        onStaffIdChange={wf.setStaffId}
        adminName={wf.adminName}
        onAdminNameChange={wf.setAdminName}
        adminEmail={wf.adminEmail}
        onAdminEmailChange={wf.setAdminEmail}
        createError={wf.createError}
        createMessage={wf.createMessage}
        onCreateSubmit={wf.handleCreateEnterpriseSubmit}
        onProvisionWorkspace={props.onProvisionWorkspace}
        onProvisionClick={wf.handleProvisionWorkspace}
        onEnterProfile={wf.handleEnterProfile}
      />
    );
  }

  const { selectedEnterprise, spec, currentStage, canEdit, readiness } = wf;

  return (
    <div className={styles.onboardingContainer}>
      <div>
        <button
          type="button"
          className={styles.onboardingBtnSecondary}
          onClick={() => wf.setSelectedEnterpriseId("")}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {vi ? "Quay lại danh sách doanh nghiệp được phân công" : "Back to assigned enterprises"}
        </button>
      </div>

      <header className={styles.onboardingProfileHeader}>
        <div className={styles.onboardingTitleRow}>
          <div className={styles.onboardingTitleMain}>
            <div className={styles.onboardingTitleHeading}>
              <h1>{selectedEnterprise.name}</h1>
              <span className={styles.onboardingStageBadge} data-stage={currentStage}>
                {wf.stageLabels[currentStage]}
              </span>
            </div>
            <div className={styles.onboardingMetaRow}>
              <span className={styles.onboardingMetaItem}>
                <strong>{vi ? "Mã hồ sơ:" : "Code:"}</strong>{" "}
                {selectedEnterprise.code ?? selectedEnterprise.id}
              </span>
              <span className={styles.onboardingMetaItem}>
                <strong>{vi ? "Nhân sự triển khai:" : "Implementation Staff:"}</strong>{" "}
                {wf.assignedStaffName}
              </span>
              <span className={styles.onboardingMetaItem}>
                <strong>{vi ? "Đại diện doanh nghiệp:" : "Representative:"}</strong>{" "}
                {spec.representativeName ?? (vi ? "Chưa cập nhật" : "Not set")}
              </span>
              <span className={styles.onboardingMetaItem}>
                <strong>{vi ? "Gói dịch vụ:" : "Plan:"}</strong>{" "}
                {enterprisePlan(selectedEnterprise) ?? "Subscription"}
              </span>
            </div>
          </div>

          <div className={styles.onboardingActionButtons}>
            <span className={styles.setAccessLabel}>
              {canEdit
                ? vi
                  ? "Chế độ thao tác: Nhân sự phụ trách"
                  : "Mode: Assigned Implementation Staff"
                : vi
                ? "Chế độ xem: Chỉ đọc"
                : "Mode: Read-only"}
            </span>
          </div>
        </div>

        <div className={styles.onboardingStepperWrap}>
          <ol
            className={styles.onboardingStepper}
            aria-label={vi ? "Các chặng làm rõ đặc tả trên giao diện" : "UI workflow stages"}
          >
            <li>
              <button
                type="button"
                className={`${styles.onboardingStepItem} ${
                  wf.activeUiStep === 1 ? styles.onboardingStepItemActive : ""
                } ${
                  currentStage !== "intake" && currentStage !== "supplement_pending"
                    ? styles.onboardingStepItemDone
                    : ""
                }`}
                style={{ width: "100%" }}
                onClick={() => wf.setActiveUiStep(1)}
              >
                <span className={styles.onboardingStepNumber}>1</span>
                <span>{vi ? "Tiếp nhận & Rà soát hồ sơ" : "1. Intake & Profile Review"}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`${styles.onboardingStepItem} ${
                  wf.activeUiStep === 2 ? styles.onboardingStepItemActive : ""
                } ${
                  currentStage === "waiting_confirmation" ||
                  currentStage === "waiting_reconfirmation" ||
                  currentStage === "confirmed"
                    ? styles.onboardingStepItemDone
                    : ""
                }`}
                style={{ width: "100%" }}
                onClick={() => wf.setActiveUiStep(2)}
              >
                <span className={styles.onboardingStepNumber}>2</span>
                <span>{vi ? "Làm rõ đặc tả & Lưu nháp" : "2. Clarify & Save Draft"}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`${styles.onboardingStepItem} ${
                  wf.activeUiStep === 3 ? styles.onboardingStepItemActive : ""
                } ${readiness.ready ? styles.onboardingStepItemDone : ""}`}
                style={{ width: "100%" }}
                onClick={() => wf.setActiveUiStep(3)}
              >
                <span className={styles.onboardingStepNumber}>3</span>
                <span>{vi ? "Phản hồi & Xác nhận đặc tả" : "3. Feedback & Confirmation"}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`${styles.onboardingStepItem} ${
                  wf.activeSet?.activeVersion ? styles.onboardingStepItemDone : ""
                }`}
                style={{ width: "100%" }}
                disabled={!readiness.ready}
                onClick={() => {
                  if (readiness.ready) props.onOpenRules(selectedEnterprise.id);
                }}
              >
                <span className={styles.onboardingStepNumber}>4</span>
                <span>{vi ? "Thiết lập quy tắc & Kiểm thử" : "4. Rule Setup & Testing"}</span>
              </button>
            </li>
          </ol>
          <p className={styles.onboardingStepNote}>
            {vi
              ? "Lưu ý: 4 chặng trên là cách tổ chức giao diện (UI) giúp nhân sự triển khai theo dõi tiến độ hồ sơ; không ghi rằng Proposal quy định cứng bước đánh số 4."
              : "Note: These 4 tabs organize the UI workflow for Implementation Staff; the Proposal does not mandate a fixed numbered Step 4."}
          </p>
        </div>
      </header>

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
                  ? `Không gắn dự án của doanh nghiệp khác hoặc tự đoán mã dự án. Thao tác thiết lập tương ứng: Quản trị Nền tảng (Platform Admin — Lê Hoàng Phúc) chọn "Khởi tạo workspace triển khai" ngay tại hồ sơ này để cấp mã phạm vi chính thức (workspace-${selectedEnterprise.id}) mà vẫn giữ nguyên toàn bộ đặc tả, bản nháp, xác nhận và tài liệu đã lưu.`
                  : `Do not attach another enterprise's project or guess project codes. Corresponding setup action: Platform Admin clicks "Provision deployment workspace" on this profile to assign the official scope (workspace-${selectedEnterprise.id}) while preserving all saved specifications, drafts, confirmations, and documents.`}
              </p>
            </div>
            {props.currentUser.role === "Platform Admin" && props.onProvisionWorkspace && (
              <div className={styles.onboardingActionButtons}>
                <button
                  type="button"
                  className={styles.onboardingBtnPrimary}
                  onClick={() => wf.handleProvisionWorkspace(selectedEnterprise)}
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

      {wf.statusFeedback && (
        <div className={styles.onboardingSuccessCallout} role="status">
          {wf.statusFeedback}
        </div>
      )}

      {wf.actionError && (
        <div className={styles.workflowError} role="alert">
          {wf.actionError}
        </div>
      )}

      {wf.activeUiStep === 1 && (
        <OnboardingIntakeScreen
          vi={vi}
          selectedEnterprise={selectedEnterprise}
          spec={spec}
          currentStage={currentStage}
          canEdit={canEdit}
          intakeDocs={wf.intakeDocs}
          supplementRequests={wf.supplementRequests}
          latestPendingSupplement={wf.latestPendingSupplement}
          onUploadIntakeDocument={wf.handleUploadIntakeDocument}
          onPreviewDoc={wf.setPreviewDoc}
          onDownloadDoc={wf.handleDownloadDocument}
          onOpenReceiveSupplementModal={() => {
            wf.setReceiveError("");
            wf.setReceiveModalOpen(true);
          }}
          onOpenSupplementModal={() => wf.openSupplementModal(selectedEnterprise)}
          onStartClarification={wf.handleStartClarification}
        />
      )}

      {wf.activeUiStep === 2 && (
        <OnboardingClarifyScreen
          vi={vi}
          selectedEnterprise={selectedEnterprise}
          spec={spec}
          currentStage={currentStage}
          canEdit={canEdit}
          intakeDocs={wf.intakeDocs}
          latestFeedback={wf.latestFeedback}
          isRevisingOrHasSent={wf.isRevisingOrHasSent}
          activeSentSnapshot={wf.activeSentSnapshot}
          workingRequirements={wf.workingRequirements}
          onWorkingRequirementsChange={wf.setWorkingRequirements}
          workingConditions={wf.workingConditions}
          workingSchema={wf.workingSchema}
          workingSampleJson={wf.workingSampleJson}
          onWorkingSampleJsonChange={wf.setWorkingSampleJson}
          workingRevisionSummary={wf.workingRevisionSummary}
          onWorkingRevisionSummaryChange={wf.setWorkingRevisionSummary}
          onLoadSampleTransactionFile={wf.handleLoadSampleTransactionFile}
          onPreviewDoc={wf.setPreviewDoc}
          onOpenSentSnapshotModal={wf.setSnapshotModalData}
          condFormOpen={wf.condFormOpen}
          onCloseCondForm={() => {
            wf.setCondFormOpen(false);
            wf.setEditingCondId(null);
            wf.setCondFormError("");
          }}
          editingCondId={wf.editingCondId}
          condName={wf.condName}
          onCondNameChange={wf.setCondName}
          condCriteria={wf.condCriteria}
          onCondCriteriaChange={wf.setCondCriteria}
          condScope={wf.condScope}
          onCondScopeChange={wf.setCondScope}
          condFormError={wf.condFormError}
          onOpenAddConditionForm={wf.openAddConditionForm}
          onOpenEditConditionForm={wf.openEditConditionForm}
          onSaveConditionItem={wf.handleSaveConditionItem}
          onDeleteConditionItem={wf.handleDeleteConditionItem}
          fieldFormOpen={wf.fieldFormOpen}
          onCloseFieldForm={() => {
            wf.setFieldFormOpen(false);
            wf.setEditingFieldIndex(null);
            wf.setFieldFormError("");
          }}
          editingFieldIndex={wf.editingFieldIndex}
          fieldName={wf.fieldName}
          onFieldNameChange={wf.setFieldName}
          fieldType={wf.fieldType}
          onFieldTypeChange={wf.setFieldType}
          fieldRequired={wf.fieldRequired}
          onFieldRequiredChange={wf.setFieldRequired}
          fieldDesc={wf.fieldDesc}
          onFieldDescChange={wf.setFieldDesc}
          fieldFormError={wf.fieldFormError}
          onOpenAddFieldForm={wf.openAddFieldForm}
          onOpenEditFieldForm={wf.openEditFieldForm}
          onSaveFieldItem={wf.handleSaveFieldItem}
          onDeleteFieldItem={wf.handleDeleteFieldItem}
          onCancelChanges={wf.handleCancelChanges}
          onSaveDraft={wf.handleSaveDraft}
          onRecordSentDraft={wf.handleRecordSentDraft}
        />
      )}

      {wf.activeUiStep === 3 && (
        <OnboardingConfirmationScreen
          vi={vi}
          selectedEnterprise={selectedEnterprise}
          spec={spec}
          currentStage={currentStage}
          canEdit={canEdit}
          currentUser={props.currentUser}
          assignedStaffName={wf.assignedStaffName}
          readiness={readiness}
          feedbackList={wf.feedbackList}
          activeSentSnapshot={wf.activeSentSnapshot}
          activeConfirmedSnapshot={wf.activeConfirmedSnapshot}
          onOpenSentSnapshotModal={wf.setSnapshotModalData}
          feedbackTime={wf.feedbackTime}
          onFeedbackTimeChange={wf.setFeedbackTime}
          feedbackChannel={wf.feedbackChannel}
          onFeedbackChannelChange={wf.setFeedbackChannel}
          feedbackContact={wf.feedbackContact}
          onFeedbackContactChange={wf.setFeedbackContact}
          feedbackContent={wf.feedbackContent}
          onFeedbackContentChange={wf.setFeedbackContent}
          feedbackError={wf.feedbackError}
          onRecordFeedbackAndRevise={wf.handleRecordFeedbackAndRevise}
          onOpenConfirmationModal={wf.openConfirmationModal}
          onToggleDataAndEvaluationClarified={wf.handleToggleDataAndEvaluationClarified}
          onProvisionWorkspace={props.onProvisionWorkspace}
          onProvisionClick={wf.handleProvisionWorkspace}
          onSwitchToDraftStep={() => wf.setActiveUiStep(2)}
          onOpenRules={props.onOpenRules}
        />
      )}

      <OnboardingModals
        vi={vi}
        selectedEnterprise={selectedEnterprise}
        spec={spec}
        activeSentSnapshot={wf.activeSentSnapshot}
        previewDoc={wf.previewDoc}
        onClosePreviewDoc={() => wf.setPreviewDoc(null)}
        onDownloadDoc={wf.handleDownloadDocument}
        snapshotModalData={wf.snapshotModalData}
        onCloseSnapshotModal={() => wf.setSnapshotModalData(null)}
        supplementModalOpen={wf.supplementModalOpen}
        onCloseSupplementModal={() => wf.setSupplementModalOpen(false)}
        selectedSupplementItems={wf.selectedSupplementItems}
        onSelectedSupplementItemsChange={wf.setSelectedSupplementItems}
        customSupplementItem={wf.customSupplementItem}
        onCustomSupplementItemChange={wf.setCustomSupplementItem}
        supplementNote={wf.supplementNote}
        onSupplementNoteChange={wf.setSupplementNote}
        guidanceFileName={wf.guidanceFileName}
        onClearGuidanceAttachment={wf.clearGuidanceAttachment}
        onSelectGuidanceFile={wf.handleSelectGuidanceFile}
        supplementFormError={wf.supplementFormError}
        onRecordSupplementRequest={wf.handleRecordSupplementRequest}
        receiveModalOpen={wf.receiveModalOpen}
        onCloseReceiveModal={() => wf.setReceiveModalOpen(false)}
        receivedNote={wf.receivedNote}
        onReceivedNoteChange={wf.setReceivedNote}
        receivedDocName={wf.receivedDocName}
        onClearReceivedSupplementAttachment={wf.clearReceivedSupplementAttachment}
        onSelectReceivedSupplementFile={wf.handleSelectReceivedSupplementFile}
        receiveError={wf.receiveError}
        onRecordSupplementReceived={wf.handleRecordSupplementReceived}
        confirmModalOpen={wf.confirmModalOpen}
        onCloseConfirmModal={() => wf.setConfirmModalOpen(false)}
        confirmBy={wf.confirmBy}
        onConfirmByChange={wf.setConfirmBy}
        confirmTime={wf.confirmTime}
        onConfirmTimeChange={wf.setConfirmTime}
        confirmChannel={wf.confirmChannel}
        onConfirmChannelChange={wf.setConfirmChannel}
        confirmNote={wf.confirmNote}
        onConfirmNoteChange={wf.setConfirmNote}
        confirmError={wf.confirmError}
        onRecordEnterpriseConfirmation={wf.handleRecordEnterpriseConfirmation}
      />
    </div>
  );
}
