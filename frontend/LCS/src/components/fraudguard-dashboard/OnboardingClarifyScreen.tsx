"use client";
import {
  Building2,
  ClipboardList,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  ClarifiedConditionItem,
  ClarifiedFieldItem,
  DeploymentSpecification,
  Enterprise,
  EnterpriseFeedbackRecord,
  IntakeDocumentItem,
  OnboardingStage,
  SpecificationSnapshot,
} from "@/types/enterprise";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  selectedEnterprise: Enterprise;
  spec: DeploymentSpecification;
  currentStage: OnboardingStage;
  canEdit: boolean;
  intakeDocs: IntakeDocumentItem[];
  latestFeedback?: EnterpriseFeedbackRecord;
  isRevisingOrHasSent: boolean;
  activeSentSnapshot?: SpecificationSnapshot;
  workingRequirements: string;
  onWorkingRequirementsChange: (value: string) => void;
  workingConditions: ClarifiedConditionItem[];
  workingSchema: ClarifiedFieldItem[];
  workingSampleJson: string;
  onWorkingSampleJsonChange: (value: string) => void;
  workingRevisionSummary: string;
  onWorkingRevisionSummaryChange: (value: string) => void;
  onLoadSampleTransactionFile: (
    file: Pick<File, "name" | "size" | "text" | "arrayBuffer">
  ) => Promise<void>;
  onPreviewDoc: (doc: IntakeDocumentItem) => void;
  onOpenSentSnapshotModal: (snapshot: SpecificationSnapshot) => void;
  condFormOpen: boolean;
  onCloseCondForm: () => void;
  editingCondId: string | null;
  condName: string;
  onCondNameChange: (value: string) => void;
  condCriteria: string;
  onCondCriteriaChange: (value: string) => void;
  condScope: string;
  onCondScopeChange: (value: string) => void;
  condFormError: string;
  onOpenAddConditionForm: () => void;
  onOpenEditConditionForm: (item: ClarifiedConditionItem) => void;
  onSaveConditionItem: () => void;
  onDeleteConditionItem: (id: string) => void;
  fieldFormOpen: boolean;
  onCloseFieldForm: () => void;
  editingFieldIndex: number | null;
  fieldName: string;
  onFieldNameChange: (value: string) => void;
  fieldType: ClarifiedFieldItem["type"];
  onFieldTypeChange: (value: ClarifiedFieldItem["type"]) => void;
  fieldRequired: boolean;
  onFieldRequiredChange: (value: boolean) => void;
  fieldDesc: string;
  onFieldDescChange: (value: string) => void;
  fieldFormError: string;
  onOpenAddFieldForm: () => void;
  onOpenEditFieldForm: (item: ClarifiedFieldItem, index: number) => void;
  onSaveFieldItem: () => void;
  onDeleteFieldItem: (index: number) => void;
  onCancelChanges: () => void;
  onSaveDraft: () => void;
  onRecordSentDraft: () => void;
}

export function OnboardingClarifyScreen({
  vi,
  selectedEnterprise,
  spec,
  currentStage,
  canEdit,
  intakeDocs,
  latestFeedback,
  isRevisingOrHasSent,
  activeSentSnapshot,
  workingRequirements,
  onWorkingRequirementsChange,
  workingConditions,
  workingSchema,
  workingSampleJson,
  onWorkingSampleJsonChange,
  workingRevisionSummary,
  onWorkingRevisionSummaryChange,
  onLoadSampleTransactionFile,
  onPreviewDoc,
  onOpenSentSnapshotModal,
  condFormOpen,
  onCloseCondForm,
  editingCondId,
  condName,
  onCondNameChange,
  condCriteria,
  onCondCriteriaChange,
  condScope,
  onCondScopeChange,
  condFormError,
  onOpenAddConditionForm,
  onOpenEditConditionForm,
  onSaveConditionItem,
  onDeleteConditionItem,
  fieldFormOpen,
  onCloseFieldForm,
  editingFieldIndex,
  fieldName,
  onFieldNameChange,
  fieldType,
  onFieldTypeChange,
  fieldRequired,
  onFieldRequiredChange,
  fieldDesc,
  onFieldDescChange,
  fieldFormError,
  onOpenAddFieldForm,
  onOpenEditFieldForm,
  onSaveFieldItem,
  onDeleteFieldItem,
  onCancelChanges,
  onSaveDraft,
  onRecordSentDraft,
}: Props) {
  return (
    <>
      {currentStage === "revising" && latestFeedback && (
        <section className={styles.onboardingFeedbackCallout} role="status">
          <div className={styles.onboardingTitleRow}>
            <div>
              <strong>
                {vi
                  ? `Phản hồi từ doanh nghiệp cho phiên bản ${latestFeedback.versionTarget} (${latestFeedback.channel} · ${latestFeedback.receivedAt})`
                  : `Enterprise feedback for ${latestFeedback.versionTarget} (${latestFeedback.channel} · ${latestFeedback.receivedAt})`}
              </strong>
              <p style={{ margin: "6px 0 0" }}>
                <strong>{latestFeedback.contactPerson}:</strong> {latestFeedback.content}
              </p>
            </div>
            {spec.sentSnapshot && (
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={() => onOpenSentSnapshotModal(spec.sentSnapshot!)}
              >
                <Eye size={14} aria-hidden="true" />
                {vi
                  ? `Xem bản đã gửi (${spec.sentSnapshot.version})`
                  : `View sent version (${spec.sentSnapshot.version})`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* BỐ CỤC 4 Ô CHUẨN ĐÃ DUYỆT: grid-template-columns: repeat(2, minmax(0, 1fr)) */}
      <div className={styles.onboardingClarifyGrid}>
        {/* Ô 1 (Hàng 1 - Cột trái): Mục tiêu & Phạm vi phát hiện của doanh nghiệp */}
        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <Building2 size={16} aria-hidden="true" />
                {vi
                  ? "1. Mục tiêu & Phạm vi phát hiện của doanh nghiệp"
                  : "1. Enterprise Detection Objectives & Scope"}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? `Làm rõ bài toán giám sát của ${selectedEnterprise.name} (Phiên bản nháp hiện tại: ${
                      spec.savedDraft?.version || "v1.0"
                    }).`
                  : `Clarify detection objectives for ${selectedEnterprise.name} (Draft: ${
                      spec.savedDraft?.version || "v1.0"
                    }).`}
              </p>
            </div>
          </div>
          <div className={styles.onboardingCardBody}>
            <label className={styles.onboardingFieldLabel}>
              <span>
                {vi
                  ? "Tóm tắt mục tiêu nghiệp vụ & phạm vi giao dịch áp dụng *"
                  : "Business objective & transaction scope summary *"}
              </span>
              <textarea
                className={styles.onboardingFieldTextarea}
                disabled={!canEdit}
                value={workingRequirements}
                onChange={(e) => onWorkingRequirementsChange(e.target.value)}
                placeholder={
                  vi
                    ? "Nhập mục tiêu phát hiện bất thường và phạm vi kênh giao dịch của doanh nghiệp..."
                    : "Enter abnormal detection objectives and transaction channel scope..."
                }
              />
            </label>

            {isRevisingOrHasSent && (
              <label className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Tóm tắt nội dung cập nhật so với phiên bản đã gửi trước đó"
                    : "Revision summary compared to previous sent version"}
                </span>
                <input
                  type="text"
                  className={styles.onboardingFieldInput}
                  disabled={!canEdit}
                  value={workingRevisionSummary}
                  onChange={(e) => onWorkingRevisionSummaryChange(e.target.value)}
                  placeholder={
                    vi
                      ? "Ví dụ: Điều chỉnh ngưỡng theo phản hồi của doanh nghiệp và bổ sung trường dữ liệu..."
                      : "e.g., Adjusted threshold per enterprise feedback and added field..."
                  }
                />
              </label>
            )}

            <div className={styles.onboardingScopeCallout}>
              <strong>{vi ? "Cô lập phiên bản:" : "Snapshot isolation:"}</strong>{" "}
              {vi
                ? "Mọi chỉnh sửa tại đây chỉ lưu vào bản nháp của doanh nghiệp hiện tại; không làm thay đổi nội dung bản đã gửi hoặc bản đã xác nhận trước đó."
                : "Edits here only update the current enterprise's draft; previously sent or confirmed snapshots remain unchanged."}
            </div>
          </div>
        </section>

        {/* Ô 2 (Hàng 1 - Cột phải): Tài liệu đối chiếu & Dữ liệu mẫu kiểm thử */}
        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <FileText size={16} aria-hidden="true" />
                {vi
                  ? "2. Tài liệu đối chiếu & Dữ liệu mẫu (Sample Data)"
                  : "2. Reference Docs & Sample Data"}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? "Đối chiếu tài liệu tiếp nhận và chuẩn bị dữ liệu mẫu (JSON/CSV/Excel) theo đặc tả của doanh nghiệp."
                  : "Cross-check intake documents and prepare sample transactions matching the enterprise specification."}
              </p>
            </div>
            {canEdit && (
              <label className={styles.onboardingBtnSecondary} style={{ cursor: "pointer" }}>
                <Upload size={14} aria-hidden="true" />
                <span>{vi ? "Nạp tệp mẫu" : "Load sample file"}</span>
                <input
                  type="file"
                  accept=".json,.csv,.xlsx"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await onLoadSampleTransactionFile(file);
                  }}
                />
              </label>
            )}
          </div>
          <div className={styles.onboardingCardBody}>
            {intakeDocs.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {intakeDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={() => onPreviewDoc(doc)}
                  >
                    <Eye size={13} aria-hidden="true" />
                    {doc.name}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.onboardingFieldLabel}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {vi
                    ? "Dữ liệu giao dịch mẫu (JSON phục vụ kiểm thử bộ quy tắc)"
                    : "Sample transactions (JSON for rule testing)"}{" "}
                  <code style={{ fontSize: "11px" }}>
                    (projectId:{" "}
                    {selectedEnterprise.projectIds.join(", ") ||
                      (vi ? "chưa gắn workspace" : "no workspace")}
                    )
                  </code>
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={() => {
                      const fieldsObj: Record<string, string | number | boolean> = {};
                      for (const f of workingSchema) {
                        fieldsObj[f.name] =
                          f.type === "number"
                            ? 1000000
                            : f.type === "boolean"
                            ? true
                            : "sample_value";
                      }
                      const sampleTemplate = [
                        {
                          id: `${
                            (selectedEnterprise.code ?? selectedEnterprise.id)
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, "") || "tx"
                          }-sample-1`,
                          ref: "TX-SAMPLE-001",
                          projectId:
                            selectedEnterprise.projectIds[0] ||
                            `workspace-${selectedEnterprise.id}`,
                          transactionType: "payment",
                          fields: fieldsObj,
                          expected: "Abnormal",
                        },
                      ];
                      onWorkingSampleJsonChange(JSON.stringify(sampleTemplate, null, 2));
                    }}
                  >
                    <Plus size={13} aria-hidden="true" />
                    {vi
                      ? "Điền khung JSON mẫu theo trường hiện tại"
                      : "Generate sample JSON from schema"}
                  </button>
                )}
              </div>
              <textarea
                aria-label={
                  vi
                    ? "Dữ liệu giao dịch mẫu (JSON phục vụ kiểm thử bộ quy tắc)"
                    : "Sample transactions (JSON for rule testing)"
                }
                className={styles.onboardingFieldTextarea}
                style={{ fontFamily: "monospace", fontSize: "12px" }}
                disabled={!canEdit}
                value={workingSampleJson}
                onChange={(e) => onWorkingSampleJsonChange(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Ô 3 (Hàng 2 - Cột trái, thẳng mép với Ô 1): Điều kiện phát hiện bất thường */}
        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <ClipboardList size={16} aria-hidden="true" />
                {vi
                  ? `3. Điều kiện phát hiện bất thường (${workingConditions.length})`
                  : `3. Abnormal Detection Conditions (${workingConditions.length})`}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? "Làm rõ từng điều kiện phát hiện, ngưỡng/tiêu chí đánh giá và phạm vi giao dịch áp dụng."
                  : "Clarify each detection condition, evaluation criteria/threshold, and applicable scope."}
              </p>
            </div>
            {canEdit && workingConditions.length > 0 && !condFormOpen && (
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onOpenAddConditionForm}
              >
                <Plus size={14} aria-hidden="true" />
                {vi ? "Thêm điều kiện" : "Add condition"}
              </button>
            )}
          </div>

          <div className={styles.onboardingCardBody}>
            {workingConditions.length === 0 && !condFormOpen && (
              <div className={styles.onboardingEmptyBox}>
                <p>
                  {vi
                    ? "Chưa có điều kiện phát hiện bất thường nào cho doanh nghiệp này. Hãy thêm điều kiện dựa trên yêu cầu nghiệp vụ của doanh nghiệp."
                    : "No abnormal detection conditions defined yet. Add a condition based on the enterprise requirements."}
                </p>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.onboardingBtnPrimary}
                    onClick={onOpenAddConditionForm}
                  >
                    <Plus size={15} aria-hidden="true" />
                    {vi ? "Thêm điều kiện phát hiện" : "Add detection condition"}
                  </button>
                )}
              </div>
            )}

            {condFormOpen && (
              <div className={styles.onboardingInlineForm}>
                <strong style={{ fontSize: "13px" }}>
                  {editingCondId
                    ? vi
                      ? "Chỉnh sửa điều kiện phát hiện"
                      : "Edit detection condition"
                    : vi
                    ? "Thêm điều kiện phát hiện mới"
                    : "New detection condition"}
                </strong>
                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Tên điều kiện phát hiện *" : "Condition name *"}</span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={condName}
                    onChange={(e) => onCondNameChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Ví dụ: Giao dịch vượt hạn mức thanh toán đơn lẻ"
                        : "e.g., Single transaction exceeds payment limit"
                    }
                  />
                </label>
                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Tiêu chí / Ngưỡng đánh giá *" : "Evaluation criteria / threshold *"}</span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={condCriteria}
                    onChange={(e) => onCondCriteriaChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Ví dụ: amount > 15000000 và channel == 'COD'"
                        : "e.g., amount > 15000000 and channel == 'COD'"
                    }
                  />
                </label>
                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Phạm vi giao dịch áp dụng *" : "Applicable transaction scope *"}</span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={condScope}
                    onChange={(e) => onCondScopeChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Ví dụ: Giao dịch thanh toán (payment) trên kênh trực tuyến"
                        : "e.g., Online payment transactions"
                    }
                  />
                </label>
                {condFormError && (
                  <p className={styles.workflowError} role="alert" style={{ margin: 0 }}>
                    {condFormError}
                  </p>
                )}
                <div className={styles.onboardingActionButtons}>
                  <button
                    type="button"
                    className={styles.onboardingBtnPrimary}
                    onClick={onSaveConditionItem}
                  >
                    {vi ? "Lưu điều kiện" : "Save condition"}
                  </button>
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={onCloseCondForm}
                  >
                    {vi ? "Hủy" : "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {workingConditions.map((cond, index) => (
              <div key={cond.id} className={styles.onboardingItemRow}>
                <div className={styles.onboardingItemContent}>
                  <div className={styles.onboardingItemTitle}>
                    <span>
                      {index + 1}. {cond.name}
                    </span>
                  </div>
                  <div className={styles.onboardingItemDetail}>
                    <strong>{vi ? "Tiêu chí đánh giá:" : "Criteria:"}</strong> {cond.criteria}
                  </div>
                  <div className={styles.onboardingItemDetail}>
                    <strong>{vi ? "Phạm vi áp dụng:" : "Scope:"}</strong> {cond.scope}
                  </div>
                </div>
                {canEdit && (
                  <div className={styles.onboardingDocActions}>
                    <button
                      type="button"
                      className={styles.onboardingBtnSecondary}
                      aria-label={`${vi ? "Sửa điều kiện" : "Edit condition"} ${cond.name}`}
                      onClick={() => onOpenEditConditionForm(cond)}
                    >
                      <Edit3 size={13} aria-hidden="true" />
                      {vi ? "Sửa" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className={styles.onboardingBtnDanger}
                      aria-label={`${vi ? "Xóa điều kiện" : "Delete condition"} ${cond.name}`}
                      onClick={() => onDeleteConditionItem(cond.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {vi ? "Xóa" : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Ô 4 (Hàng 2 - Cột phải, thẳng mép với Ô 2): Danh mục trường dữ liệu đầu vào */}
        <section className={styles.onboardingCard}>
          <div className={styles.onboardingCardHeader}>
            <div>
              <h2>
                <FileCheck2 size={16} aria-hidden="true" />
                {vi
                  ? `4. Danh mục trường dữ liệu đầu vào (${workingSchema.length})`
                  : `4. Input Data Field Catalog (${workingSchema.length})`}
              </h2>
              <p className={styles.onboardingCardSub}>
                {vi
                  ? "Xác định tên trường kỹ thuật, kiểu dữ liệu (string/number/boolean), tính bắt buộc và ý nghĩa nghiệp vụ."
                  : "Define technical field names, data types (string/number/boolean), required flags, and business descriptions."}
              </p>
            </div>
            {canEdit && workingSchema.length > 0 && !fieldFormOpen && (
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onOpenAddFieldForm}
              >
                <Plus size={14} aria-hidden="true" />
                {vi ? "Thêm trường" : "Add field"}
              </button>
            )}
          </div>

          <div className={styles.onboardingCardBody}>
            {workingSchema.length === 0 && !fieldFormOpen && (
              <div className={styles.onboardingEmptyBox}>
                <p>
                  {vi
                    ? "Chưa có trường dữ liệu đầu vào nào được khai báo cho doanh nghiệp này."
                    : "No input data fields defined for this enterprise yet."}
                </p>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.onboardingBtnPrimary}
                    onClick={onOpenAddFieldForm}
                  >
                    <Plus size={15} aria-hidden="true" />
                    {vi ? "Thêm trường dữ liệu" : "Add data field"}
                  </button>
                )}
              </div>
            )}

            {fieldFormOpen && (
              <div className={styles.onboardingInlineForm}>
                <strong style={{ fontSize: "13px" }}>
                  {editingFieldIndex !== null
                    ? vi
                      ? "Chỉnh sửa trường dữ liệu"
                      : "Edit data field"
                    : vi
                    ? "Thêm trường dữ liệu mới"
                    : "New data field"}
                </strong>
                <div className={styles.onboardingFormRow}>
                  <label className={styles.onboardingFieldLabel}>
                    <span>{vi ? "Tên trường kỹ thuật (Field name) *" : "Field name *"}</span>
                    <input
                      type="text"
                      className={styles.onboardingFieldInput}
                      value={fieldName}
                      onChange={(e) => onFieldNameChange(e.target.value)}
                      placeholder={vi ? "Ví dụ: amount, user_hash..." : "e.g., amount, user_hash..."}
                    />
                  </label>
                  <label className={styles.onboardingFieldLabel}>
                    <span>{vi ? "Kiểu dữ liệu *" : "Data type *"}</span>
                    <select
                      className={styles.onboardingFieldSelect}
                      value={fieldType}
                      onChange={(e) =>
                        onFieldTypeChange(e.target.value as ClarifiedFieldItem["type"])
                      }
                    >
                      <option value="string">string (Chuỗi ký tự)</option>
                      <option value="number">number (Số)</option>
                      <option value="boolean">boolean (Đúng / Sai)</option>
                    </select>
                  </label>
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "var(--security-text)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={fieldRequired}
                    onChange={(e) => onFieldRequiredChange(e.target.checked)}
                  />
                  <span>
                    {vi
                      ? "Trường bắt buộc có trong dữ liệu giao dịch"
                      : "Required in transaction payload"}
                  </span>
                </label>
                <label className={styles.onboardingFieldLabel}>
                  <span>
                    {vi
                      ? "Mô tả ý nghĩa theo nghiệp vụ doanh nghiệp"
                      : "Business description"}
                  </span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={fieldDesc}
                    onChange={(e) => onFieldDescChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Mô tả ý nghĩa trường theo kênh giao dịch thực tế của doanh nghiệp..."
                        : "Describe the field meaning in the enterprise's transaction context..."
                    }
                  />
                </label>
                {fieldFormError && (
                  <p className={styles.workflowError} role="alert" style={{ margin: 0 }}>
                    {fieldFormError}
                  </p>
                )}
                <div className={styles.onboardingActionButtons}>
                  <button
                    type="button"
                    className={styles.onboardingBtnPrimary}
                    onClick={onSaveFieldItem}
                  >
                    {vi ? "Lưu trường dữ liệu" : "Save field"}
                  </button>
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={onCloseFieldForm}
                  >
                    {vi ? "Hủy" : "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {workingSchema.map((field, index) => (
              <div key={`${field.name}-${index}`} className={styles.onboardingItemRow}>
                <div className={styles.onboardingItemContent}>
                  <div className={styles.onboardingItemTitle}>
                    <code>{field.name}</code>
                    <span className={styles.ruleTag}>{field.type}</span>
                    <span
                      className={styles.onboardingStageBadge}
                      data-stage={field.required ? "intake" : "clarifying"}
                    >
                      {field.required
                        ? vi
                          ? "Bắt buộc"
                          : "Required"
                        : vi
                        ? "Tùy chọn"
                        : "Optional"}
                    </span>
                  </div>
                  {field.description && (
                    <div className={styles.onboardingItemDetail}>{field.description}</div>
                  )}
                </div>
                {canEdit && (
                  <div className={styles.onboardingDocActions}>
                    <button
                      type="button"
                      className={styles.onboardingBtnSecondary}
                      aria-label={`${vi ? "Sửa trường" : "Edit field"} ${field.name}`}
                      onClick={() => onOpenEditFieldForm(field, index)}
                    >
                      <Edit3 size={13} aria-hidden="true" />
                      {vi ? "Sửa" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className={styles.onboardingBtnDanger}
                      aria-label={`${vi ? "Xóa trường" : "Delete field"} ${field.name}`}
                      onClick={() => onDeleteFieldItem(index)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {vi ? "Xóa" : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className={styles.onboardingActionBar}>
        <p className={styles.onboardingOversightNote}>
          {vi
            ? "Lưu bản nháp để giữ lại thay đổi đang biên tập. Hủy thay đổi sẽ khôi phục đúng bản nháp đã lưu gần nhất của doanh nghiệp."
            : "Save draft to persist your edits. Cancel changes restores the last saved draft for this enterprise."}
        </p>
        {canEdit && (
          <div className={styles.onboardingActionButtons}>
            <button
              type="button"
              className={styles.onboardingBtnSecondary}
              onClick={onCancelChanges}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {vi ? "Hủy thay đổi" : "Cancel changes"}
            </button>
            <button
              type="button"
              className={styles.onboardingBtnSecondary}
              onClick={onSaveDraft}
            >
              <Save size={14} aria-hidden="true" />
              {vi ? "Lưu bản nháp" : "Save draft"}
            </button>
            <button
              type="button"
              className={styles.onboardingBtnPrimary}
              onClick={onRecordSentDraft}
            >
              <Send size={14} aria-hidden="true" />
              {isRevisingOrHasSent
                ? vi
                  ? "Ghi nhận đã gửi bản cập nhật"
                  : "Record updated specification sent"
                : vi
                ? "Ghi nhận đã gửi dự thảo"
                : "Record draft specification sent"}
            </button>
          </div>
        )}
      </footer>
    </>
  );
}
