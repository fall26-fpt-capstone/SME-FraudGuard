"use client";
import { AlertTriangle, CheckCircle2, Download, Paperclip, Plus, Upload, X } from "lucide-react";
import type {
  DeploymentSpecification,
  Enterprise,
  IntakeDocumentItem,
  SpecificationSnapshot,
} from "@/types/enterprise";
import {
  downloadTextBlob,
  formatSnapshotText,
  isDocumentPreviewSupported,
  type OnboardingFileLike,
} from "@/utils/enterprise";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import styles from "./SecurityDashboard.module.css";

interface Props {
  vi: boolean;
  selectedEnterprise: Enterprise;
  spec: DeploymentSpecification;
  activeSentSnapshot?: SpecificationSnapshot;
  previewDoc: IntakeDocumentItem | null;
  onClosePreviewDoc: () => void;
  onDownloadDoc: (doc: {
    name: string;
    content?: string;
    dataUrl?: string;
    mimeType?: string;
  }) => void;
  snapshotModalData: SpecificationSnapshot | null;
  onCloseSnapshotModal: () => void;
  supplementModalOpen: boolean;
  onCloseSupplementModal: () => void;
  selectedSupplementItems: string[];
  onSelectedSupplementItemsChange: (updater: (prev: string[]) => string[]) => void;
  customSupplementItem: string;
  onCustomSupplementItemChange: (value: string) => void;
  supplementNote: string;
  onSupplementNoteChange: (value: string) => void;
  guidanceFileName: string;
  onClearGuidanceAttachment: () => void;
  onSelectGuidanceFile: (file: OnboardingFileLike) => Promise<void>;
  supplementFormError: string;
  onRecordSupplementRequest: () => void;
  receiveModalOpen: boolean;
  onCloseReceiveModal: () => void;
  receivedNote: string;
  onReceivedNoteChange: (value: string) => void;
  receivedDocName: string;
  onClearReceivedSupplementAttachment: () => void;
  onSelectReceivedSupplementFile: (file: OnboardingFileLike) => Promise<void>;
  receiveError: string;
  onRecordSupplementReceived: () => void;
  confirmModalOpen: boolean;
  onCloseConfirmModal: () => void;
  confirmBy: string;
  onConfirmByChange: (value: string) => void;
  confirmTime: string;
  onConfirmTimeChange: (value: string) => void;
  confirmChannel: string;
  onConfirmChannelChange: (value: string) => void;
  confirmNote: string;
  onConfirmNoteChange: (value: string) => void;
  confirmError: string;
  onRecordEnterpriseConfirmation: () => void;
}

export function OnboardingModals({
  vi,
  selectedEnterprise,
  spec,
  activeSentSnapshot,
  previewDoc,
  onClosePreviewDoc,
  onDownloadDoc,
  snapshotModalData,
  onCloseSnapshotModal,
  supplementModalOpen,
  onCloseSupplementModal,
  selectedSupplementItems,
  onSelectedSupplementItemsChange,
  customSupplementItem,
  onCustomSupplementItemChange,
  supplementNote,
  onSupplementNoteChange,
  guidanceFileName,
  onClearGuidanceAttachment,
  onSelectGuidanceFile,
  supplementFormError,
  onRecordSupplementRequest,
  receiveModalOpen,
  onCloseReceiveModal,
  receivedNote,
  onReceivedNoteChange,
  receivedDocName,
  onClearReceivedSupplementAttachment,
  onSelectReceivedSupplementFile,
  receiveError,
  onRecordSupplementReceived,
  confirmModalOpen,
  onCloseConfirmModal,
  confirmBy,
  onConfirmByChange,
  confirmTime,
  onConfirmTimeChange,
  confirmChannel,
  onConfirmChannelChange,
  confirmNote,
  onConfirmNoteChange,
  confirmError,
  onRecordEnterpriseConfirmation,
}: Props) {
  const previewDialogRef = useDialogFocus(Boolean(previewDoc), onClosePreviewDoc);
  const snapshotDialogRef = useDialogFocus(Boolean(snapshotModalData), onCloseSnapshotModal);
  const supplementDialogRef = useDialogFocus(supplementModalOpen, onCloseSupplementModal);
  const receiveDialogRef = useDialogFocus(receiveModalOpen, onCloseReceiveModal);
  const confirmDialogRef = useDialogFocus(confirmModalOpen, onCloseConfirmModal);

  const canPreviewDoc = previewDoc ? isDocumentPreviewSupported(previewDoc) : false;

  return (
    <>
      {/* ── MODAL XEM NỘI DUNG TÀI LIỆU TIẾP NHẬN THỰC TẾ ── */}
      {previewDoc && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClosePreviewDoc();
          }}
        >
          <div
            ref={previewDialogRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-doc-title"
            tabIndex={-1}
          >
            <div className={styles.onboardingModalHeader}>
              <div>
                <h2 id="preview-doc-title">{previewDoc.name}</h2>
                <p className={styles.onboardingCardSub}>
                  {previewDoc.summary} · {previewDoc.receivedAt}
                </p>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                aria-label={vi ? "Đóng hộp thoại xem tài liệu" : "Close document preview"}
                onClick={onClosePreviewDoc}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.onboardingModalBody}>
              {canPreviewDoc ? (
                <pre
                  style={{
                    margin: 0,
                    padding: "14px",
                    borderRadius: "4px",
                    border: "1px solid var(--security-border)",
                    background: "var(--security-bg)",
                    color: "var(--security-text)",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    maxHeight: "360px",
                    overflowY: "auto",
                  }}
                >
                  {previewDoc.content}
                </pre>
              ) : (
                <div className={styles.onboardingWarningCallout} role="status">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>
                      {vi
                        ? `Định dạng .${previewDoc.format} hiện chưa hỗ trợ xem trước trực tiếp trên trình duyệt`
                        : `Format .${previewDoc.format} does not support inline browser preview`}
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
                    {vi
                      ? `Hệ thống không tạo nội dung xem trước giả đối với tệp nhị phân (${previewDoc.name}). Dữ liệu tệp gốc đã được bảo toàn nguyên vẹn — vui lòng bấm "Tải tệp này" bên dưới để tải về máy và mở bằng ứng dụng tương ứng.`
                      : `No simulated preview is generated for binary file '${previewDoc.name}'. Original file bytes are preserved — please click "Download file" below to inspect it locally.`}
                  </p>
                </div>
              )}
            </div>
            <div className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={() => onDownloadDoc(previewDoc)}
              >
                <Download size={14} aria-hidden="true" />
                {vi ? "Tải tệp này" : "Download file"}
              </button>
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onClosePreviewDoc}
              >
                {vi ? "Đóng" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL XEM BẢN ĐẶC TẢ ĐÃ GỬI (SNAPSHOT BẤT BIẾN) ── */}
      {snapshotModalData && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseSnapshotModal();
          }}
        >
          <div
            ref={snapshotDialogRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="snapshot-modal-title"
            tabIndex={-1}
          >
            <div className={styles.onboardingModalHeader}>
              <div>
                <h2 id="snapshot-modal-title">
                  {vi
                    ? `Nội dung bản đặc tả ${snapshotModalData.version} — ${selectedEnterprise.name}`
                    : `Specification Snapshot ${snapshotModalData.version} — ${selectedEnterprise.name}`}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {vi
                    ? "Bản chụp bất biến tại thời điểm gửi cho doanh nghiệp (không bị thay đổi khi sửa bản nháp mới)."
                    : "Immutable snapshot captured when sent to the enterprise."}
                </p>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                aria-label={vi ? "Đóng hộp thoại" : "Close modal"}
                onClick={onCloseSnapshotModal}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.onboardingModalBody}>
              <pre
                style={{
                  margin: 0,
                  padding: "14px",
                  borderRadius: "4px",
                  border: "1px solid var(--security-border)",
                  background: "var(--security-bg)",
                  color: "var(--security-text)",
                  fontSize: "12px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  maxHeight: "360px",
                  overflowY: "auto",
                }}
              >
                {formatSnapshotText(selectedEnterprise.name, snapshotModalData, vi)}
              </pre>
            </div>
            <div className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={() =>
                  downloadTextBlob(
                    `Dac_ta_${selectedEnterprise.code ?? selectedEnterprise.id}_${snapshotModalData.version}.txt`,
                    formatSnapshotText(selectedEnterprise.name, snapshotModalData, vi)
                  )
                }
              >
                <Download size={14} aria-hidden="true" />
                {vi ? "Tải bản đặc tả này" : "Download snapshot"}
              </button>
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onCloseSnapshotModal}
              >
                {vi ? "Đóng" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2B: GHI NHẬN YÊU CẦU BỔ SUNG THÔNG TIN ── */}
      {supplementModalOpen && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseSupplementModal();
          }}
        >
          <div
            ref={supplementDialogRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplement-modal-title"
            tabIndex={-1}
          >
            <div className={styles.onboardingModalHeader}>
              <div>
                <h2 id="supplement-modal-title">
                  {vi
                    ? `Ghi nhận yêu cầu bổ sung — ${selectedEnterprise.name}`
                    : `Record Supplement Request — ${selectedEnterprise.name}`}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {vi
                    ? "Lưu nội dung cần trao đổi bổ sung với doanh nghiệp và cập nhật trạng thái hồ sơ sang 'Chờ bổ sung' (không tự động gửi email từ hệ thống)."
                    : "Record items requiring clarification with the enterprise and set status to 'Awaiting supplement'."}
                </p>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                aria-label={vi ? "Đóng hộp thoại" : "Close modal"}
                onClick={onCloseSupplementModal}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.onboardingModalBody}>
              {(spec.suggestedSupplementItems?.length ?? 0) > 0 && (
                <div className={styles.onboardingFieldLabel}>
                  <span>
                    {vi
                      ? `Gợi ý theo hồ sơ ${selectedEnterprise.name} (chọn nếu áp dụng):`
                      : `Suggested items from ${selectedEnterprise.name} profile:`}
                  </span>
                  <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
                    {spec.suggestedSupplementItems!.map((item) => {
                      const checked = selectedSupplementItems.includes(item);
                      return (
                        <label
                          key={item}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            fontWeight: 400,
                            color: "var(--security-text)",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              onSelectedSupplementItemsChange((prev) =>
                                e.target.checked
                                  ? [...prev, item]
                                  : prev.filter((x) => x !== item)
                              );
                            }}
                          />
                          <span>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Thêm mục cần doanh nghiệp bổ sung (do Staff nhập)"
                    : "Add custom item to request"}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={customSupplementItem}
                    onChange={(e) => onCustomSupplementItemChange(e.target.value)}
                    placeholder={
                      vi
                        ? "Nhập nội dung tài liệu hoặc thông tin nghiệp vụ cần làm rõ..."
                        : "Enter document or business detail needed..."
                    }
                  />
                  <button
                    type="button"
                    className={styles.onboardingBtnSecondary}
                    onClick={() => {
                      const trimmed = customSupplementItem.trim();
                      if (!trimmed) return;
                      if (!selectedSupplementItems.includes(trimmed)) {
                        onSelectedSupplementItemsChange((prev) => [...prev, trimmed]);
                      }
                      onCustomSupplementItemChange("");
                    }}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {vi ? "Thêm" : "Add"}
                  </button>
                </div>
              </label>

              {selectedSupplementItems.length > 0 && (
                <div className={styles.onboardingFieldLabel}>
                  <span>
                    {vi ? "Danh mục sẽ ghi nhận yêu cầu bổ sung:" : "Items to record:"}
                  </span>
                  <ul
                    style={{
                      margin: "4px 0 0",
                      paddingLeft: "20px",
                      color: "var(--security-text)",
                    }}
                  >
                    {selectedSupplementItems.map((item) => (
                      <li key={item} style={{ marginBottom: "4px" }}>
                        {item}{" "}
                        <button
                          type="button"
                          onClick={() =>
                            onSelectedSupplementItemsChange((prev) =>
                              prev.filter((x) => x !== item)
                            )
                          }
                          style={{
                            border: 0,
                            background: "transparent",
                            color: "var(--security-red)",
                            fontSize: "12px",
                            cursor: "pointer",
                          }}
                        >
                          ({vi ? "Bỏ" : "Remove"})
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Chi tiết nội dung trao đổi / hướng dẫn bổ sung"
                    : "Detailed note / guidance"}
                </span>
                <textarea
                  className={styles.onboardingFieldTextarea}
                  value={supplementNote}
                  onChange={(e) => onSupplementNoteChange(e.target.value)}
                  placeholder={
                    vi
                      ? "Ghi rõ nội dung cần doanh nghiệp cung cấp thêm theo đặc thù bài toán của doanh nghiệp..."
                      : "Specify what information or sample file the enterprise should provide..."
                  }
                />
              </label>

              <div className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Tệp mẫu tham khảo theo đặc tả của doanh nghiệp (tùy chọn — không áp đặt một schema cố định cho mọi doanh nghiệp)"
                    : "Optional sample file tailored to this enterprise (no mandatory fixed schema)"}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
                  <label className={styles.onboardingBtnSecondary} style={{ cursor: "pointer" }}>
                    <Paperclip size={14} aria-hidden="true" />
                    <span>{vi ? "Chọn tệp mẫu đính kèm" : "Choose sample file"}</span>
                    <input
                      type="file"
                      accept=".docx,.xlsx,.pdf,.csv,.json,.txt,.md"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        await onSelectGuidanceFile(file);
                      }}
                    />
                  </label>
                  {guidanceFileName ? (
                    <span className={styles.onboardingStageBadge} data-stage="confirmed">
                      {vi ? `Đã đính kèm: ${guidanceFileName}` : `Attached: ${guidanceFileName}`}
                      <button
                        type="button"
                        onClick={onClearGuidanceAttachment}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                        aria-label={vi ? "Gỡ tệp đính kèm" : "Remove attached file"}
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span className={styles.findingMeta}>
                      {vi
                        ? "Chưa đính kèm tệp mẫu (tùy chọn)"
                        : "No sample file attached (optional)"}
                    </span>
                  )}
                </div>
              </div>

              {supplementFormError && (
                <p className={styles.workflowError} role="alert">
                  {supplementFormError}
                </p>
              )}
            </div>

            <div className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onCloseSupplementModal}
              >
                {vi ? "Hủy bỏ" : "Cancel"}
              </button>
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onRecordSupplementRequest}
              >
                {vi ? "Ghi nhận yêu cầu bổ sung" : "Record supplement request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL GHI NHẬN ĐÃ NHẬN TÀI LIỆU / THÔNG TIN BỔ SUNG ── */}
      {receiveModalOpen && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseReceiveModal();
          }}
        >
          <div
            ref={receiveDialogRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="receive-modal-title"
            tabIndex={-1}
          >
            <div className={styles.onboardingModalHeader}>
              <div>
                <h2 id="receive-modal-title">
                  {vi
                    ? `Ghi nhận đã nhận thông tin bổ sung — ${selectedEnterprise.name}`
                    : `Record Received Supplement Info — ${selectedEnterprise.name}`}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {vi
                    ? "Cập nhật nội dung hoặc tệp bổ sung doanh nghiệp đã gửi để tiếp tục rà soát hồ sơ."
                    : "Record the additional details or document received from the enterprise to continue review."}
                </p>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                aria-label={vi ? "Đóng hộp thoại" : "Close modal"}
                onClick={onCloseReceiveModal}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.onboardingModalBody}>
              <label className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Tóm tắt nội dung bổ sung đã nhận *"
                    : "Summary of received information *"}
                </span>
                <textarea
                  className={styles.onboardingFieldTextarea}
                  value={receivedNote}
                  onChange={(e) => onReceivedNoteChange(e.target.value)}
                  placeholder={
                    vi
                      ? "Ví dụ: Doanh nghiệp đã xác nhận ngưỡng giao dịch cần cảnh báo và gửi bổ sung tệp mô tả trường dữ liệu..."
                      : "e.g., Enterprise provided threshold confirmation and updated field descriptions..."
                  }
                />
              </label>

              <div className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Đính kèm tệp tài liệu bổ sung nhận được (.docx, .xlsx, .pdf, .txt, .csv, .json, .md — tùy chọn)"
                    : "Attach received document (.docx, .xlsx, .pdf, .txt, .csv, .json, .md — optional)"}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
                  <label className={styles.onboardingBtnSecondary} style={{ cursor: "pointer" }}>
                    <Upload size={14} aria-hidden="true" />
                    <span>{vi ? "Chọn tệp bổ sung" : "Select received file"}</span>
                    <input
                      type="file"
                      accept=".docx,.xlsx,.pdf,.txt,.csv,.json,.md"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        await onSelectReceivedSupplementFile(file);
                      }}
                    />
                  </label>
                  {receivedDocName ? (
                    <span className={styles.onboardingStageBadge} data-stage="confirmed">
                      {vi ? `Đã đính kèm: ${receivedDocName}` : `Attached: ${receivedDocName}`}
                      <button
                        type="button"
                        onClick={onClearReceivedSupplementAttachment}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                        aria-label={vi ? "Gỡ tệp bổ sung" : "Remove received file"}
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span className={styles.findingMeta}>
                      {vi ? "Chưa chọn tệp đính kèm" : "No file selected"}
                    </span>
                  )}
                </div>
              </div>

              {receiveError && (
                <p className={styles.workflowError} role="alert">
                  {receiveError}
                </p>
              )}
            </div>

            <div className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onCloseReceiveModal}
              >
                {vi ? "Hủy" : "Cancel"}
              </button>
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onRecordSupplementReceived}
              >
                {vi ? "Ghi nhận đã nhận thông tin bổ sung" : "Confirm received supplement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5B: GHI NHẬN DOANH NGHIỆP ĐÃ XÁC NHẬN ĐẶC TẢ ── */}
      {confirmModalOpen && (
        <div
          className={styles.onboardingModalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseConfirmModal();
          }}
        >
          <div
            ref={confirmDialogRef}
            className={styles.onboardingModalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            tabIndex={-1}
          >
            <div className={styles.onboardingModalHeader}>
              <div>
                <h2 id="confirm-modal-title">
                  {vi
                    ? `Ghi nhận doanh nghiệp đã xác nhận đặc tả — ${selectedEnterprise.name}`
                    : `Record Enterprise Specification Confirmation — ${selectedEnterprise.name}`}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {vi
                    ? `Đóng băng nội dung phiên bản ${activeSentSnapshot?.version ?? "v1.0"} theo xác nhận của đại diện doanh nghiệp.`
                    : `Freeze version ${activeSentSnapshot?.version ?? "v1.0"} as confirmed by the enterprise representative.`}
                </p>
              </div>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                aria-label={vi ? "Đóng hộp thoại" : "Close modal"}
                onClick={onCloseConfirmModal}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.onboardingModalBody}>
              <label className={styles.onboardingFieldLabel}>
                <span>
                  {vi
                    ? "Người đại diện doanh nghiệp xác nhận *"
                    : "Confirming enterprise representative *"}
                </span>
                <input
                  type="text"
                  className={styles.onboardingFieldInput}
                  value={confirmBy}
                  onChange={(e) => onConfirmByChange(e.target.value)}
                />
              </label>

              <div className={styles.onboardingFormRow}>
                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Thời điểm xác nhận *" : "Confirmation timestamp *"}</span>
                  <input
                    type="text"
                    className={styles.onboardingFieldInput}
                    value={confirmTime}
                    onChange={(e) => onConfirmTimeChange(e.target.value)}
                  />
                </label>
                <label className={styles.onboardingFieldLabel}>
                  <span>{vi ? "Kênh / Hình thức xác nhận *" : "Confirmation channel *"}</span>
                  <select
                    className={styles.onboardingFieldSelect}
                    value={confirmChannel}
                    onChange={(e) => onConfirmChannelChange(e.target.value)}
                  >
                    <option value="Email xác nhận">Email xác nhận</option>
                    <option value="Biên bản thống nhất đặc tả">Biên bản thống nhất đặc tả</option>
                    <option value="Họp nghiệm thu đặc tả">Họp nghiệm thu đặc tả</option>
                  </select>
                </label>
              </div>

              <label className={styles.onboardingFieldLabel}>
                <span>{vi ? "Ghi chú nội dung xác nhận *" : "Confirmation note *"}</span>
                <textarea
                  className={styles.onboardingFieldTextarea}
                  value={confirmNote}
                  onChange={(e) => onConfirmNoteChange(e.target.value)}
                  placeholder={
                    vi
                      ? "Ghi rõ phạm vi điều kiện phát hiện và danh mục trường dữ liệu mà doanh nghiệp đã đồng ý..."
                      : "Note the detection conditions and schema catalog confirmed by the enterprise..."
                  }
                />
              </label>

              {confirmError && (
                <p className={styles.workflowError} role="alert">
                  {confirmError}
                </p>
              )}
            </div>

            <div className={styles.onboardingModalFooter}>
              <button
                type="button"
                className={styles.onboardingBtnSecondary}
                onClick={onCloseConfirmModal}
              >
                {vi ? "Hủy bỏ" : "Cancel"}
              </button>
              <button
                type="button"
                className={styles.onboardingBtnPrimary}
                onClick={onRecordEnterpriseConfirmation}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {vi ? "Hoàn tất ghi nhận xác nhận" : "Complete confirmation record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
