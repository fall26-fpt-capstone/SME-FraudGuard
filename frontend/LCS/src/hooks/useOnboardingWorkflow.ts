import { useEffect, useState } from "react";
import type { UserProfile } from "@/types/fraudguard";
import type {
  ClarifiedConditionItem,
  ClarifiedFieldItem,
  DeploymentSpecification,
  Enterprise,
  EnterpriseFeedbackRecord,
  IntakeDocumentItem,
  OnboardingStage,
  SpecificationSnapshot,
  SupplementRequestRecord,
} from "@/types/enterprise";
import type { ManagedRuleSet } from "@/utils/rule-set-lifecycle";
import {
  canDeploy,
  evaluateSetupReadiness,
  nextSpecificationVersion,
  OnboardingFileLike,
  readOnboardingAttachment,
  resolveOnboardingStage,
  serializeConditionsSummary,
  serializeFieldsSummary,
  triggerDocumentDownload,
  validateOnboardingSave,
} from "@/utils/enterprise";
import { validateDataSchema } from "@/utils/ingestion-validation";
import { readTransactionFile } from "@/utils/transaction-file";

export interface OnboardingViewProps {
  enterprises: Enterprise[];
  users: UserProfile[];
  currentUser: UserProfile;
  sets: ManagedRuleSet[];
  onCreate: (name: string, staffId: string, adminName: string, adminEmail: string) => boolean;
  onProvisionWorkspace?: (enterpriseId: string) => boolean;
  onSave: (enterpriseId: string, specification: DeploymentSpecification, auditDetail?: string) => boolean;
  onOpenRules: (enterpriseId: string) => void;
}

export const STAGE_LABELS_VI: Record<OnboardingStage, string> = {
  intake: "Tiếp nhận hồ sơ",
  supplement_pending: "Chờ bổ sung",
  clarifying: "Đang làm rõ đặc tả",
  waiting_confirmation: "Chờ xác nhận",
  revising: "Chỉnh sửa theo phản hồi",
  waiting_reconfirmation: "Chờ xác nhận lại",
  confirmed: "Đã xác nhận đặc tả",
};

export const STAGE_LABELS_EN: Record<OnboardingStage, string> = {
  intake: "Intake review",
  supplement_pending: "Awaiting supplement",
  clarifying: "Clarifying specification",
  waiting_confirmation: "Awaiting confirmation",
  revising: "Revising from feedback",
  waiting_reconfirmation: "Awaiting re-confirmation",
  confirmed: "Specification confirmed",
};

export function uiStepFromStage(stage: OnboardingStage): 1 | 2 | 3 {
  if (stage === "intake" || stage === "supplement_pending") return 1;
  if (stage === "clarifying" || stage === "revising") return 2;
  return 3;
}

export function ensureEnterpriseSpecification(enterprise: Enterprise): DeploymentSpecification {
  return (
    enterprise.specification ?? {
      stage: "intake",
      intakeDocuments: [],
      supplementRequests: [],
      conditionsList: [],
      schema: [],
      feedbackHistory: [],
      dataAndEvaluationClarified: false,
      requirements: "",
      fields: "",
      conditions: "",
      sampleJson: "[]",
      updatedAt: new Date().toISOString(),
    }
  );
}

export function useOnboardingWorkflow(props: OnboardingViewProps, vi: boolean) {
  const {
    enterprises,
    users,
    currentUser,
    sets,
    onCreate,
    onProvisionWorkspace,
    onSave,
  } = props;

  const staffMembers = users.filter((u) => u.role === "Implementation Staff");

  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>(() => {
    if (typeof sessionStorage === "undefined") return "";
    try {
      const saved = JSON.parse(sessionStorage.getItem("fraudguard-onboarding-session-v1") || "null");
      if (saved?.userId === currentUser.id && typeof saved.selectedEnterpriseId === "string") {
        return saved.selectedEnterpriseId;
      }
    } catch {
      // Ignore restricted sessionStorage contexts
    }
    return "";
  });
  const [activeUiStep, setActiveUiStep] = useState<1 | 2 | 3>(() => {
    if (typeof sessionStorage === "undefined") return 1;
    try {
      const saved = JSON.parse(sessionStorage.getItem("fraudguard-onboarding-session-v1") || "null");
      if (
        saved?.userId === currentUser.id &&
        (saved.activeUiStep === 1 || saved.activeUiStep === 2 || saved.activeUiStep === 3)
      ) {
        return saved.activeUiStep;
      }
    } catch {
      // Ignore restricted sessionStorage contexts
    }
    return 1;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const [companyName, setCompanyName] = useState("");
  const [staffId, setStaffId] = useState(staffMembers[0]?.id ?? "");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");

  // Part B states: Document preview modal, Request Additional modal, Receive Additional modal
  const [previewDoc, setPreviewDoc] = useState<IntakeDocumentItem | null>(null);
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [selectedSupplementItems, setSelectedSupplementItems] = useState<string[]>([]);
  const [customSupplementItem, setCustomSupplementItem] = useState("");
  const [supplementNote, setSupplementNote] = useState("");
  const [guidanceFileName, setGuidanceFileName] = useState("");
  const [guidanceFileContent, setGuidanceFileContent] = useState("");
  const [guidanceFileDataUrl, setGuidanceFileDataUrl] = useState("");
  const [guidanceFileMimeType, setGuidanceFileMimeType] = useState("");
  const [guidanceFileSizeBytes, setGuidanceFileSizeBytes] = useState(0);
  const [supplementFormError, setSupplementFormError] = useState("");

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receivedNote, setReceivedNote] = useState("");
  const [receivedDocName, setReceivedDocName] = useState("");
  const [receivedDocContent, setReceivedDocContent] = useState("");
  const [receivedDocDataUrl, setReceivedDocDataUrl] = useState("");
  const [receivedDocMimeType, setReceivedDocMimeType] = useState("");
  const [receivedDocSizeBytes, setReceivedDocSizeBytes] = useState(0);
  const [receivedDocPreviewSupported, setReceivedDocPreviewSupported] = useState(true);
  const [receiveError, setReceiveError] = useState("");

  const [statusFeedback, setStatusFeedback] = useState("");
  const [actionError, setActionError] = useState("");

  // Part C states: Working draft state (isolated from savedDraft, sentSnapshot, and confirmedSnapshot)
  const [workingRequirements, setWorkingRequirements] = useState("");
  const [workingConditions, setWorkingConditions] = useState<ClarifiedConditionItem[]>([]);
  const [workingSchema, setWorkingSchema] = useState<ClarifiedFieldItem[]>([]);
  const [workingSampleJson, setWorkingSampleJson] = useState("[]");
  const [workingRevisionSummary, setWorkingRevisionSummary] = useState("");

  // Condition inline form state (Add / Edit)
  const [condFormOpen, setCondFormOpen] = useState(false);
  const [editingCondId, setEditingCondId] = useState<string | null>(null);
  const [condName, setCondName] = useState("");
  const [condCriteria, setCondCriteria] = useState("");
  const [condScope, setCondScope] = useState("");
  const [condFormError, setCondFormError] = useState("");

  // Field inline form state (Add / Edit)
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<ClarifiedFieldItem["type"]>("string");
  const [fieldRequired, setFieldRequired] = useState(true);
  const [fieldDesc, setFieldDesc] = useState("");
  const [fieldFormError, setFieldFormError] = useState("");

  // Part D states: Feedback recording, Sent snapshot preview modal, Confirmation modal (Modal 5B)
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackTime, setFeedbackTime] = useState("");
  const [feedbackChannel, setFeedbackChannel] = useState("Email");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmBy, setConfirmBy] = useState("");
  const [confirmTime, setConfirmTime] = useState("");
  const [confirmChannel, setConfirmChannel] = useState("Email xác nhận");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const [snapshotModalData, setSnapshotModalData] = useState<SpecificationSnapshot | null>(null);

  const selectedEnterprise = enterprises.find((e) => e.id === selectedEnterpriseId);
  const stageLabels = vi ? STAGE_LABELS_VI : STAGE_LABELS_EN;

  function loadSavedDraftIntoWorkingState(enterprise: Enterprise) {
    const s = ensureEnterpriseSpecification(enterprise);
    const base = s.savedDraft;
    setWorkingRequirements(base?.requirements ?? s.requirements ?? "");
    setWorkingConditions(structuredClone(base?.conditionsList ?? s.conditionsList ?? []));
    setWorkingSchema(structuredClone(base?.schema ?? s.schema ?? []));
    setWorkingSampleJson(base?.sampleJson ?? s.sampleJson ?? "[]");
    setWorkingRevisionSummary(base?.revisionSummary ?? "");
    setCondFormOpen(false);
    setEditingCondId(null);
    setCondFormError("");
    setFieldFormOpen(false);
    setEditingFieldIndex(null);
    setFieldFormError("");
  }

  useEffect(() => {
    if (!selectedEnterprise) return;
    loadSavedDraftIntoWorkingState(selectedEnterprise);
    const s = ensureEnterpriseSpecification(selectedEnterprise);
    setFeedbackContact(s.representativeName ?? "");
    setFeedbackTime(new Date().toLocaleString(vi ? "vi-VN" : "en-US"));
    setFeedbackContent("");
    setFeedbackError("");
    setPreviewDoc(null);
    setSupplementModalOpen(false);
    setReceiveModalOpen(false);
    setConfirmModalOpen(false);
    setSnapshotModalData(null);
  }, [selectedEnterpriseId]);

  const filteredEnterprises = enterprises.filter((enterprise) => {
    const stage = resolveOnboardingStage(enterprise);
    if (stageFilter !== "all" && stage !== stageFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const code = (enterprise.code ?? enterprise.id).toLowerCase();
    const rep = (enterprise.specification?.representativeName ?? "").toLowerCase();
    return (
      enterprise.name.toLowerCase().includes(q) ||
      code.includes(q) ||
      rep.includes(q)
    );
  });

  const totalCount = enterprises.length;
  const readyCount = enterprises.filter((e) => evaluateSetupReadiness(e.specification, vi, e).ready).length;
  const activeClarifyingCount = totalCount - readyCount;

  function resolveSaveError(candidate: DeploymentSpecification, fallbackVi: string, fallbackEn: string) {
    const check = validateOnboardingSave(selectedEnterprise, currentUser, candidate, vi);
    if (!check.ok && check.error) {
      return check.error;
    }
    return vi
      ? `Không thể lưu vào bộ nhớ trình duyệt (localStorage bị đầy hoặc vượt giới hạn dung lượng lưu trữ). ${fallbackVi}`
      : `Could not persist to browser storage (localStorage quota exceeded or unavailable). ${fallbackEn}`;
  }

  function handleEnterProfile(enterprise: Enterprise) {
    const stage = resolveOnboardingStage(enterprise);
    setSelectedEnterpriseId(enterprise.id);
    setActiveUiStep(uiStepFromStage(stage));
    setStatusFeedback("");
    setActionError("");
    loadSavedDraftIntoWorkingState(enterprise);
  }

  function handleProvisionWorkspace(enterprise: Enterprise) {
    if (!onProvisionWorkspace) return;
    setActionError("");
    setStatusFeedback("");
    setCreateError("");
    setCreateMessage("");
    if (onProvisionWorkspace(enterprise.id)) {
      const msg = vi
        ? `Đã khởi tạo phạm vi workspace triển khai (workspace-${enterprise.id}) cho ${enterprise.name}. Toàn bộ đặc tả, bản nháp, xác nhận và tài liệu đã lưu được giữ nguyên.`
        : `Provisioned deployment workspace (workspace-${enterprise.id}) for ${enterprise.name}. All saved specifications, drafts, confirmations, and documents are preserved.`;
      setStatusFeedback(msg);
      setCreateMessage(msg);
    } else {
      const err = vi
        ? "Không thể khởi tạo phạm vi workspace (kiểm tra quyền Platform Admin hoặc bộ nhớ trình duyệt)."
        : "Could not provision workspace (check Platform Admin role or browser storage).";
      setActionError(err);
      setCreateError(err);
    }
  }

  function handleCreateEnterpriseSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setCreateMessage("");
    setCreateError("");
    if (!onCreate(companyName, staffId, adminName, adminEmail)) {
      setCreateError(
        vi
          ? "Kiểm tra lại tên doanh nghiệp, nhân sự triển khai, email quản trị viên chưa trùng lặp hoặc bộ nhớ trình duyệt."
          : "Check enterprise name, deployment staff, unique admin email, or browser storage."
      );
      return;
    }
    setCompanyName("");
    setAdminName("");
    setAdminEmail("");
    setCreateMessage(
      vi
        ? "Đã tạo hồ sơ doanh nghiệp, khởi tạo SME Admin và phân công nhân sự triển khai."
        : "Enterprise profile created and assigned."
    );
  }

  // ── Document Upload & Download Handlers ──
  async function handleUploadIntakeDocument(file: OnboardingFileLike) {
    if (!selectedEnterprise) return;
    setActionError("");
    setStatusFeedback("");
    try {
      const parsed = await readOnboardingAttachment(file, vi);
      const spec = ensureEnterpriseSpecification(selectedEnterprise);
      const intakeDocs = spec.intakeDocuments ?? [];
      const newDoc: IntakeDocumentItem = {
        id: `doc-${Date.now()}`,
        name: parsed.name,
        format: parsed.format,
        receivedAt: new Date().toLocaleString(vi ? "vi-VN" : "en-US"),
        summary: vi
          ? `Tệp do Implementation Staff tải lên (${parsed.sizeBytes} bytes)`
          : `Uploaded by Implementation Staff (${parsed.sizeBytes} bytes)`,
        content: parsed.content,
        dataUrl: parsed.dataUrl,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        previewSupported: parsed.previewSupported,
      };
      const nextSpec: DeploymentSpecification = {
        ...spec,
        intakeDocuments: [...intakeDocs, newDoc],
        updatedAt: new Date().toISOString(),
      };
      if (onSave(selectedEnterprise.id, nextSpec, `Thêm tài liệu tiếp nhận: ${parsed.name}`)) {
        setStatusFeedback(
          vi
            ? `Đã lưu tệp hồ sơ '${parsed.name}' (${parsed.format}, ${parsed.sizeBytes} bytes) vào hồ sơ ${selectedEnterprise.name}.`
            : `Saved intake file '${parsed.name}' (${parsed.format}, ${parsed.sizeBytes} bytes) to ${selectedEnterprise.name}.`
        );
      } else {
        setActionError(
          resolveSaveError(
            nextSpec,
            "Không thể lưu tệp hồ sơ.",
            "Could not save intake document."
          )
        );
      }
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  function handleDownloadDocument(doc: {
    name: string;
    content?: string;
    dataUrl?: string;
    mimeType?: string;
  }) {
    setActionError("");
    if (!triggerDocumentDownload(doc)) {
      setActionError(
        vi
          ? `Không tìm thấy dữ liệu tệp gốc của '${doc.name}' để tải về.`
          : `Original file data for '${doc.name}' is unavailable for download.`
      );
    }
  }

  // ── Part B Handlers ──
  function openSupplementModal(enterprise: Enterprise) {
    const spec = ensureEnterpriseSpecification(enterprise);
    setSelectedSupplementItems(spec.suggestedSupplementItems ? [...spec.suggestedSupplementItems] : []);
    setCustomSupplementItem("");
    setSupplementNote("");
    setGuidanceFileName("");
    setGuidanceFileContent("");
    setGuidanceFileDataUrl("");
    setGuidanceFileMimeType("");
    setGuidanceFileSizeBytes(0);
    setSupplementFormError("");
    setSupplementModalOpen(true);
  }

  function clearGuidanceAttachment() {
    setGuidanceFileName("");
    setGuidanceFileContent("");
    setGuidanceFileDataUrl("");
    setGuidanceFileMimeType("");
    setGuidanceFileSizeBytes(0);
  }

  async function handleSelectGuidanceFile(file: OnboardingFileLike) {
    setSupplementFormError("");
    try {
      const parsed = await readOnboardingAttachment(file, vi);
      setGuidanceFileName(parsed.name);
      setGuidanceFileContent(parsed.content);
      setGuidanceFileDataUrl(parsed.dataUrl);
      setGuidanceFileMimeType(parsed.mimeType);
      setGuidanceFileSizeBytes(parsed.sizeBytes);
    } catch (err) {
      clearGuidanceAttachment();
      setSupplementFormError((err as Error).message);
    }
  }

  function handleRecordSupplementRequest() {
    if (!selectedEnterprise) return;
    setSupplementFormError("");
    const items = [
      ...selectedSupplementItems,
      ...(customSupplementItem.trim() ? [customSupplementItem.trim()] : []),
    ];
    if (items.length === 0 && !supplementNote.trim()) {
      setSupplementFormError(
        vi
          ? "Vui lòng chọn hoặc nhập ít nhất một nội dung cần doanh nghiệp bổ sung."
          : "Please select or enter at least one item to request from the enterprise."
      );
      return;
    }
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const newRecord: SupplementRequestRecord = {
      id: `supp-${Date.now()}`,
      requestedAt: new Date().toLocaleString(vi ? "vi-VN" : "en-US"),
      requestedBy: currentUser.name,
      items,
      note: supplementNote.trim(),
      guidanceFileName: guidanceFileName || undefined,
      guidanceFileContent: guidanceFileContent || undefined,
      guidanceFileDataUrl: guidanceFileDataUrl || undefined,
      guidanceFileMimeType: guidanceFileMimeType || undefined,
      guidanceFileSizeBytes: guidanceFileSizeBytes || undefined,
    };
    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: "supplement_pending",
      supplementRequests: [newRecord, ...(spec.supplementRequests ?? [])],
      updatedAt: new Date().toISOString(),
    };
    if (onSave(selectedEnterprise.id, nextSpec, `Ghi nhận yêu cầu bổ sung hồ sơ (${selectedEnterprise.name})`)) {
      setSupplementModalOpen(false);
      setActiveUiStep(1);
      setStatusFeedback(
        vi
          ? "Đã ghi nhận yêu cầu bổ sung vào hồ sơ. Trạng thái hồ sơ đã chuyển sang 'Chờ bổ sung'."
          : "Supplement request recorded. Profile status updated to 'Awaiting supplement'."
      );
    } else {
      setSupplementFormError(
        resolveSaveError(
          nextSpec,
          "Không thể lưu yêu cầu bổ sung. Vui lòng kiểm tra quyền phụ trách doanh nghiệp.",
          "Could not save supplement request. Please verify enterprise assignment permissions."
        )
      );
    }
  }

  function clearReceivedSupplementAttachment() {
    setReceivedDocName("");
    setReceivedDocContent("");
    setReceivedDocDataUrl("");
    setReceivedDocMimeType("");
    setReceivedDocSizeBytes(0);
    setReceivedDocPreviewSupported(true);
  }

  async function handleSelectReceivedSupplementFile(file: OnboardingFileLike) {
    setReceiveError("");
    try {
      const parsed = await readOnboardingAttachment(file, vi);
      setReceivedDocName(parsed.name);
      setReceivedDocContent(parsed.content);
      setReceivedDocDataUrl(parsed.dataUrl);
      setReceivedDocMimeType(parsed.mimeType);
      setReceivedDocSizeBytes(parsed.sizeBytes);
      setReceivedDocPreviewSupported(parsed.previewSupported);
    } catch (err) {
      clearReceivedSupplementAttachment();
      setReceiveError((err as Error).message);
    }
  }

  function handleRecordSupplementReceived() {
    if (!selectedEnterprise) return;
    setReceiveError("");
    if (!receivedNote.trim() && !receivedDocName.trim()) {
      setReceiveError(
        vi
          ? "Vui lòng nhập tóm tắt thông tin bổ sung đã nhận hoặc đính kèm tệp tài liệu."
          : "Please enter a summary of the received information or attach the received document."
      );
      return;
    }
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const existingRequests = spec.supplementRequests ?? [];
    const updatedRequests = existingRequests.map((req, index) =>
      index === 0 && !req.receivedAt
        ? {
            ...req,
            receivedAt: new Date().toLocaleString(vi ? "vi-VN" : "en-US"),
            receivedBy: currentUser.name,
            receivedNote: receivedNote.trim(),
            receivedDocumentName: receivedDocName || undefined,
          }
        : req
    );
    const nextDocs: IntakeDocumentItem[] = receivedDocName
      ? [
          ...(spec.intakeDocuments ?? []),
          {
            id: `doc-${Date.now()}`,
            name: receivedDocName,
            format: receivedDocName.split(".").pop()?.toUpperCase() || "FILE",
            receivedAt: new Date().toLocaleString(vi ? "vi-VN" : "en-US"),
            summary: receivedNote.trim() || (vi ? "Tài liệu bổ sung từ doanh nghiệp" : "Supplement document"),
            content: receivedDocPreviewSupported ? receivedDocContent : "",
            dataUrl: receivedDocDataUrl || undefined,
            mimeType: receivedDocMimeType || undefined,
            sizeBytes: receivedDocSizeBytes || undefined,
            previewSupported: receivedDocPreviewSupported,
          },
        ]
      : spec.intakeDocuments ?? [];

    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: "intake",
      intakeDocuments: nextDocs,
      supplementRequests: updatedRequests,
      updatedAt: new Date().toISOString(),
    };

    if (onSave(selectedEnterprise.id, nextSpec, `Ghi nhận đã nhận thông tin bổ sung (${selectedEnterprise.name})`)) {
      setReceiveModalOpen(false);
      setReceivedNote("");
      clearReceivedSupplementAttachment();
      setReceiveError("");
      setStatusFeedback(
        vi
          ? "Đã ghi nhận tài liệu/thông tin bổ sung từ doanh nghiệp. Có thể tiếp tục rà soát và chuyển sang làm rõ đặc tả."
          : "Received supplement information recorded. You may proceed to specification clarification."
      );
    } else {
      setReceiveError(
        resolveSaveError(
          nextSpec,
          "Không thể lưu thông tin bổ sung đã nhận. Vui lòng kiểm tra quyền phụ trách doanh nghiệp.",
          "Could not save received supplement information. Please verify enterprise assignment permissions."
        )
      );
    }
  }

  function handleStartClarification() {
    if (!selectedEnterprise) return;
    setActionError("");
    setStatusFeedback("");
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const nextStage: OnboardingStage =
      spec.stage === "intake" || spec.stage === "supplement_pending" || !spec.stage
        ? "clarifying"
        : spec.stage;
    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: nextStage,
      updatedAt: new Date().toISOString(),
    };
    if (canDeploy(currentUser, selectedEnterprise)) {
      if (!onSave(selectedEnterprise.id, nextSpec, `Bắt đầu làm rõ đặc tả (${selectedEnterprise.name})`)) {
        setActionError(
          resolveSaveError(
            nextSpec,
            "Không thể chuyển trạng thái làm rõ đặc tả.",
            "Could not transition to clarification stage."
          )
        );
        return;
      }
    }
    setActiveUiStep(2);
  }

  // ── Part C Handlers: CRUD Conditions, CRUD Fields, Sample File, Save Draft, Cancel Changes, Send Snapshot ──
  async function handleLoadSampleTransactionFile(
    file: Pick<File, "name" | "size" | "text" | "arrayBuffer">
  ) {
    setActionError("");
    setStatusFeedback("");
    try {
      const parsed = await readTransactionFile(file);
      setWorkingSampleJson(parsed.text);
      setStatusFeedback(
        vi
          ? `Đã nạp nội dung tệp mẫu '${file.name}' vào bản nháp đang soạn (nhấn 'Lưu bản nháp' để lưu vào hồ sơ).`
          : `Loaded sample file '${file.name}' into working draft (click 'Save draft' to persist).`
      );
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  function openAddConditionForm() {
    setEditingCondId(null);
    setCondName("");
    setCondCriteria("");
    setCondScope(
      selectedEnterprise?.projectIds.length
        ? `Giao dịch thuộc dự án ${selectedEnterprise.projectIds.join(", ")}`
        : ""
    );
    setCondFormError("");
    setCondFormOpen(true);
  }

  function openEditConditionForm(item: ClarifiedConditionItem) {
    setEditingCondId(item.id);
    setCondName(item.name);
    setCondCriteria(item.criteria);
    setCondScope(item.scope);
    setCondFormError("");
    setCondFormOpen(true);
  }

  function handleSaveConditionItem() {
    if (!condName.trim() || !condCriteria.trim() || !condScope.trim()) {
      setCondFormError(
        vi
          ? "Vui lòng nhập đầy đủ Tên điều kiện, Tiêu chí đánh giá và Phạm vi giao dịch áp dụng."
          : "Please enter the condition name, evaluation criteria, and applicable transaction scope."
      );
      return;
    }
    if (editingCondId) {
      setWorkingConditions((prev) =>
        prev.map((c) =>
          c.id === editingCondId
            ? { ...c, name: condName.trim(), criteria: condCriteria.trim(), scope: condScope.trim() }
            : c
        )
      );
    } else {
      const nextItem: ClarifiedConditionItem = {
        id: `cond-${Date.now()}`,
        name: condName.trim(),
        criteria: condCriteria.trim(),
        scope: condScope.trim(),
      };
      setWorkingConditions((prev) => [...prev, nextItem]);
    }
    setCondFormOpen(false);
    setEditingCondId(null);
    setCondFormError("");
  }

  function handleDeleteConditionItem(id: string) {
    setWorkingConditions((prev) => prev.filter((c) => c.id !== id));
    if (editingCondId === id) {
      setCondFormOpen(false);
      setEditingCondId(null);
    }
  }

  function openAddFieldForm() {
    setEditingFieldIndex(null);
    setFieldName("");
    setFieldType("string");
    setFieldRequired(true);
    setFieldDesc("");
    setFieldFormError("");
    setFieldFormOpen(true);
  }

  function openEditFieldForm(item: ClarifiedFieldItem, index: number) {
    setEditingFieldIndex(index);
    setFieldName(item.name);
    setFieldType(item.type);
    setFieldRequired(item.required);
    setFieldDesc(item.description ?? "");
    setFieldFormError("");
    setFieldFormOpen(true);
  }

  function handleSaveFieldItem() {
    const trimmedName = fieldName.trim();
    if (!/^[a-zA-Z_][\w.]*$/.test(trimmedName)) {
      setFieldFormError(
        vi
          ? "Tên trường phải bắt đầu bằng chữ cái hoặc dấu gạch dưới, chỉ gồm chữ, số, dấu gạch dưới hoặc dấu chấm."
          : "Field name must start with a letter or underscore and contain only letters, digits, underscores, or dots."
      );
      return;
    }
    const candidateList =
      editingFieldIndex !== null
        ? workingSchema.map((f, i) =>
            i === editingFieldIndex
              ? { name: trimmedName, type: fieldType, required: fieldRequired, description: fieldDesc.trim() }
              : f
          )
        : [
            ...workingSchema,
            { name: trimmedName, type: fieldType, required: fieldRequired, description: fieldDesc.trim() },
          ];
    try {
      validateDataSchema(candidateList);
    } catch (err) {
      setFieldFormError((err as Error).message);
      return;
    }
    setWorkingSchema(candidateList);
    setFieldFormOpen(false);
    setEditingFieldIndex(null);
    setFieldFormError("");
  }

  function handleDeleteFieldItem(index: number) {
    setWorkingSchema((prev) => prev.filter((_, i) => i !== index));
    if (editingFieldIndex === index) {
      setFieldFormOpen(false);
      setEditingFieldIndex(null);
    }
  }

  function handleSaveDraft() {
    if (!selectedEnterprise) return;
    setActionError("");
    setStatusFeedback("");
    try {
      if (workingSchema.length > 0) validateDataSchema(workingSchema);
    } catch (err) {
      setActionError((err as Error).message);
      return;
    }
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const draftVersion =
      spec.savedDraft?.version ||
      (spec.sentSnapshot ? nextSpecificationVersion(spec.sentSnapshot.version) : "v1.0");
    const nowIso = new Date().toISOString();
    const draftSnapshot: SpecificationSnapshot = {
      version: draftVersion,
      requirements: workingRequirements.trim(),
      conditionsList: structuredClone(workingConditions),
      schema: structuredClone(workingSchema),
      sampleJson: workingSampleJson,
      updatedAt: nowIso,
      revisionSummary: workingRevisionSummary.trim() || undefined,
    };

    const nextStage: OnboardingStage =
      spec.stage === "revising"
        ? "revising"
        : spec.stage === "intake" || spec.stage === "supplement_pending" || !spec.stage
        ? "clarifying"
        : spec.stage;

    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: nextStage,
      savedDraft: draftSnapshot,
      conditionsList: structuredClone(workingConditions),
      schema: structuredClone(workingSchema),
      requirements: workingRequirements.trim(),
      conditions: serializeConditionsSummary(workingConditions),
      fields: serializeFieldsSummary(workingSchema),
      sampleJson: workingSampleJson,
      updatedAt: nowIso,
    };

    if (nextStage === "confirmed") {
      const readinessCheck = evaluateSetupReadiness(nextSpec, vi, selectedEnterprise);
      nextSpec.confirmedAt = readinessCheck.ready
        ? spec.enterpriseConfirmation?.confirmedAt || nowIso
        : undefined;
      nextSpec.confirmedBy = readinessCheck.ready
        ? spec.enterpriseConfirmation?.confirmedBy || currentUser.name
        : undefined;
    }

    if (onSave(selectedEnterprise.id, nextSpec, `Lưu bản nháp đặc tả ${draftVersion} (${selectedEnterprise.name})`)) {
      setStatusFeedback(
        vi
          ? `Đã lưu bản nháp (${draftVersion}) cho ${selectedEnterprise.name}. Nội dung bản đã gửi và bản đã xác nhận (nếu có) được giữ nguyên độc lập.`
          : `Saved draft (${draftVersion}) for ${selectedEnterprise.name}. Previously sent and confirmed snapshots remain unchanged.`
      );
    } else {
      setActionError(
        resolveSaveError(
          nextSpec,
          "Không thể lưu bản nháp. Vui lòng kiểm tra danh mục trường dữ liệu hoặc quyền phụ trách doanh nghiệp.",
          "Could not save draft. Please verify schema fields or enterprise assignment permissions."
        )
      );
    }
  }

  function handleCancelChanges() {
    if (!selectedEnterprise) return;
    loadSavedDraftIntoWorkingState(selectedEnterprise);
    setActionError("");
    setStatusFeedback(
      vi
        ? "Đã hủy các thay đổi chưa lưu và khôi phục về bản nháp đã lưu gần nhất."
        : "Discarded unsaved edits and restored the last saved draft."
    );
  }

  function handleRecordSentDraft() {
    if (!selectedEnterprise) return;
    setActionError("");
    setStatusFeedback("");
    if (!workingRequirements.trim()) {
      setActionError(
        vi
          ? "Vui lòng nhập Mục tiêu & phạm vi phát hiện của doanh nghiệp trước khi ghi nhận gửi."
          : "Please enter the enterprise detection objectives and scope before recording."
      );
      return;
    }
    if (workingConditions.length === 0) {
      setActionError(
        vi
          ? "Cần làm rõ ít nhất 1 điều kiện phát hiện bất thường trước khi ghi nhận đã gửi cho doanh nghiệp."
          : "Please add at least one detection condition before recording."
      );
      return;
    }
    if (workingSchema.length === 0) {
      setActionError(
        vi
          ? "Cần làm rõ ít nhất 1 trường dữ liệu trong danh mục schema trước khi ghi nhận đã gửi."
          : "Please add at least one field in the schema catalog before recording."
      );
      return;
    }
    try {
      validateDataSchema(workingSchema);
    } catch (err) {
      setActionError((err as Error).message);
      return;
    }

    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const isUpdateAfterFeedback =
      spec.stage === "revising" ||
      (spec.feedbackHistory?.length ?? 0) > 0 ||
      Boolean(spec.sentSnapshot);
    const nextVersion = spec.sentSnapshot
      ? nextSpecificationVersion(spec.sentSnapshot.version)
      : spec.savedDraft?.version || "v1.0";
    const nowIso = new Date().toISOString();
    const frozenSentSnapshot: SpecificationSnapshot = {
      version: nextVersion,
      requirements: workingRequirements.trim(),
      conditionsList: structuredClone(workingConditions),
      schema: structuredClone(workingSchema),
      sampleJson: workingSampleJson,
      updatedAt: nowIso,
      sentAt: new Date().toLocaleString(vi ? "vi-VN" : "en-US"),
      sentBy: currentUser.name,
      revisionSummary: workingRevisionSummary.trim() || undefined,
    };

    const nextStage: OnboardingStage = isUpdateAfterFeedback
      ? "waiting_reconfirmation"
      : "waiting_confirmation";

    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: nextStage,
      savedDraft: structuredClone(frozenSentSnapshot),
      sentSnapshot: structuredClone(frozenSentSnapshot),
      sentHistory: [structuredClone(frozenSentSnapshot), ...(spec.sentHistory ?? [])],
      conditionsList: structuredClone(workingConditions),
      schema: structuredClone(workingSchema),
      requirements: workingRequirements.trim(),
      conditions: serializeConditionsSummary(workingConditions),
      fields: serializeFieldsSummary(workingSchema),
      sampleJson: workingSampleJson,
      updatedAt: nowIso,
    };

    const label = isUpdateAfterFeedback
      ? `Ghi nhận đã gửi bản cập nhật ${nextVersion} (${selectedEnterprise.name})`
      : `Ghi nhận đã gửi dự thảo ${nextVersion} (${selectedEnterprise.name})`;

    if (onSave(selectedEnterprise.id, nextSpec, label)) {
      setActiveUiStep(3);
      setStatusFeedback(
        isUpdateAfterFeedback
          ? vi
            ? `Đã ghi nhận gửi bản cập nhật đặc tả ${nextVersion}. Hồ sơ chuyển sang trạng thái 'Chờ xác nhận lại'.`
            : `Recorded updated specification ${nextVersion}. Profile is now 'Awaiting re-confirmation'.`
          : vi
          ? `Đã ghi nhận gửi dự thảo đặc tả ${nextVersion}. Hồ sơ chuyển sang trạng thái 'Chờ xác nhận'.`
          : `Recorded draft specification ${nextVersion}. Profile is now 'Awaiting confirmation'.`
      );
    } else {
      setActionError(
        resolveSaveError(
          nextSpec,
          "Không thể ghi nhận gửi đặc tả. Vui lòng kiểm tra quyền phụ trách doanh nghiệp.",
          "Could not record sent specification. Please verify enterprise assignment permissions."
        )
      );
    }
  }

  // ── Part D Handlers: Record Enterprise Feedback (Branch 1) & Record Confirmation (Branch 2) ──
  function handleRecordFeedbackAndRevise() {
    if (!selectedEnterprise) return;
    setFeedbackError("");
    if (!feedbackContent.trim() || !feedbackTime.trim() || !feedbackChannel.trim()) {
      setFeedbackError(
        vi
          ? "Vui lòng nhập đầy đủ Nội dung phản hồi, Thời điểm nhận và Kênh trao đổi."
          : "Please enter the feedback content, timestamp, and communication channel."
      );
      return;
    }
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const targetVer = spec.sentSnapshot?.version || spec.savedDraft?.version || "v1.0";
    const newFeedback: EnterpriseFeedbackRecord = {
      id: `fb-${Date.now()}`,
      versionTarget: targetVer,
      receivedAt: feedbackTime.trim(),
      channel: feedbackChannel,
      contactPerson: feedbackContact.trim() || spec.representativeName || (vi ? "Đại diện doanh nghiệp" : "Representative"),
      content: feedbackContent.trim(),
    };

    const nextDraftVersion = nextSpecificationVersion(targetVer);
    const baseSource = spec.sentSnapshot ?? spec.savedDraft;
    const nextDraft: SpecificationSnapshot = {
      version: nextDraftVersion,
      requirements: baseSource?.requirements ?? spec.requirements,
      conditionsList: structuredClone(baseSource?.conditionsList ?? spec.conditionsList ?? []),
      schema: structuredClone(baseSource?.schema ?? spec.schema ?? []),
      sampleJson: baseSource?.sampleJson ?? spec.sampleJson,
      updatedAt: new Date().toISOString(),
      revisionSummary: "",
    };

    const nextSpec: DeploymentSpecification = {
      ...spec,
      stage: "revising",
      savedDraft: nextDraft,
      feedbackHistory: [newFeedback, ...(spec.feedbackHistory ?? [])],
      updatedAt: new Date().toISOString(),
    };

    if (
      onSave(
        selectedEnterprise.id,
        nextSpec,
        `Ghi nhận phản hồi từ doanh nghiệp cho bản ${targetVer} qua ${feedbackChannel}`
      )
    ) {
      setWorkingRequirements(nextDraft.requirements);
      setWorkingConditions(structuredClone(nextDraft.conditionsList));
      setWorkingSchema(structuredClone(nextDraft.schema));
      setWorkingSampleJson(nextDraft.sampleJson);
      setWorkingRevisionSummary("");
      setFeedbackContent("");
      setActiveUiStep(2);
      setStatusFeedback(
        vi
          ? `Đã ghi nhận phản hồi của doanh nghiệp (kênh: ${feedbackChannel}). Đang mở bản nháp ${nextDraftVersion} để chỉnh sửa; bản đã gửi ${targetVer} vẫn được giữ nguyên.`
          : `Recorded enterprise feedback (${feedbackChannel}). Opened draft ${nextDraftVersion} for revision; sent snapshot ${targetVer} remains immutable.`
      );
    } else {
      setFeedbackError(
        resolveSaveError(
          nextSpec,
          "Không thể lưu phản hồi doanh nghiệp. Vui lòng kiểm tra quyền phụ trách doanh nghiệp.",
          "Could not save enterprise feedback. Please verify enterprise assignment permissions."
        )
      );
    }
  }

  function openConfirmationModal() {
    if (!selectedEnterprise) return;
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    setConfirmBy(
      spec.representativeName
        ? `${spec.representativeName}${spec.representativeRole ? ` (${spec.representativeRole})` : ""}`
        : ""
    );
    setConfirmTime(new Date().toLocaleString(vi ? "vi-VN" : "en-US"));
    setConfirmChannel("Email xác nhận");
    setConfirmNote("");
    setConfirmError("");
    setConfirmModalOpen(true);
  }

  function handleRecordEnterpriseConfirmation() {
    if (!selectedEnterprise) return;
    setConfirmError("");
    if (!confirmBy.trim() || !confirmTime.trim() || !confirmNote.trim() || !confirmChannel.trim()) {
      setConfirmError(
        vi
          ? "Vui lòng nhập đầy đủ Người đại diện xác nhận, Thời điểm xác nhận, Kênh xác nhận và Ghi chú nội dung xác nhận."
          : "Please enter the confirming representative, timestamp, channel, and confirmation note."
      );
      return;
    }
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const sourceSnapshot =
      spec.sentSnapshot ??
      spec.savedDraft ?? {
        version: "v1.0",
        requirements: workingRequirements.trim() || spec.requirements,
        conditionsList: structuredClone(workingConditions.length ? workingConditions : spec.conditionsList ?? []),
        schema: structuredClone(workingSchema.length ? workingSchema : spec.schema ?? []),
        sampleJson: workingSampleJson || spec.sampleJson || "[]",
        updatedAt: new Date().toISOString(),
      };

    const immutableConfirmed = structuredClone(sourceSnapshot);
    const confirmationRecord = {
      confirmedAt: confirmTime.trim(),
      confirmedBy: confirmBy.trim(),
      channel: confirmChannel.trim(),
      note: confirmNote.trim(),
      version: immutableConfirmed.version,
    };

    const latestSampleJson =
      spec.sampleJson && spec.sampleJson.trim() && spec.sampleJson.trim() !== "[]"
        ? spec.sampleJson
        : immutableConfirmed.sampleJson;

    const candidateSpec: DeploymentSpecification = {
      ...spec,
      stage: "confirmed",
      confirmedSnapshot: immutableConfirmed,
      enterpriseConfirmation: confirmationRecord,
      conditionsList: structuredClone(immutableConfirmed.conditionsList),
      schema: structuredClone(immutableConfirmed.schema),
      requirements: immutableConfirmed.requirements,
      conditions: serializeConditionsSummary(immutableConfirmed.conditionsList),
      fields: serializeFieldsSummary(immutableConfirmed.schema),
      sampleJson: latestSampleJson,
      updatedAt: new Date().toISOString(),
    };

    const readinessCheck = evaluateSetupReadiness(candidateSpec, vi, selectedEnterprise);
    candidateSpec.confirmedAt = readinessCheck.ready ? new Date().toISOString() : undefined;
    candidateSpec.confirmedBy = readinessCheck.ready ? confirmationRecord.confirmedBy : undefined;

    if (
      onSave(
        selectedEnterprise.id,
        candidateSpec,
        `Ghi nhận doanh nghiệp xác nhận đặc tả ${immutableConfirmed.version} (${confirmChannel})`
      )
    ) {
      setConfirmModalOpen(false);
      setActiveUiStep(3);
      setStatusFeedback(
        readinessCheck.ready
          ? vi
            ? `Đã ghi nhận doanh nghiệp xác nhận đặc tả phiên bản ${immutableConfirmed.version}. Hồ sơ đã đủ điều kiện chuyển sang thiết lập quy tắc.`
            : `Recorded enterprise confirmation for specification ${immutableConfirmed.version}. Profile is ready for rule setup.`
          : vi
          ? `Đã lưu xác nhận yêu cầu nghiệp vụ phiên bản ${immutableConfirmed.version}. Cần hoàn tất các mục làm rõ dữ liệu/mẫu kiểm thử bên dưới trước khi chuyển sang thiết lập quy tắc.`
          : `Saved enterprise business confirmation (${immutableConfirmed.version}). Complete the remaining technical/sample items below before proceeding to rule setup.`
      );
    } else {
      setConfirmError(
        resolveSaveError(
          candidateSpec,
          "Không thể lưu ghi nhận xác nhận đặc tả. Vui lòng kiểm tra quyền phụ trách doanh nghiệp và dữ liệu đầu vào.",
          "Could not save specification confirmation. Please verify enterprise assignment permissions and input data."
        )
      );
    }
  }

  function handleToggleDataAndEvaluationClarified(checked: boolean) {
    if (!selectedEnterprise) return;
    setActionError("");
    const spec = ensureEnterpriseSpecification(selectedEnterprise);
    const candidateSpec: DeploymentSpecification = {
      ...spec,
      dataAndEvaluationClarified: checked,
      dataClarifiedAt: checked ? new Date().toLocaleString(vi ? "vi-VN" : "en-US") : undefined,
      dataClarifiedBy: checked ? currentUser.name : undefined,
      updatedAt: new Date().toISOString(),
    };
    const readinessCheck = evaluateSetupReadiness(candidateSpec, vi, selectedEnterprise);
    candidateSpec.confirmedAt = readinessCheck.ready
      ? spec.enterpriseConfirmation?.confirmedAt || new Date().toISOString()
      : undefined;
    candidateSpec.confirmedBy = readinessCheck.ready
      ? spec.enterpriseConfirmation?.confirmedBy || currentUser.name
      : undefined;

    if (
      onSave(
        selectedEnterprise.id,
        candidateSpec,
        checked
          ? `Xác nhận đã làm rõ dữ liệu & cách đánh giá (${selectedEnterprise.name})`
          : `Bỏ xác nhận làm rõ dữ liệu & cách đánh giá (${selectedEnterprise.name})`
      )
    ) {
      setStatusFeedback(
        checked
          ? readinessCheck.ready
            ? vi
              ? "Đã ghi nhận hoàn tất làm rõ dữ liệu và cách đánh giá kỹ thuật. Đã mở khóa chuyển sang thiết lập quy tắc."
              : "Marked data fields and evaluation criteria as clarified. Rule setup is now unlocked."
            : vi
            ? "Đã ghi nhận đánh dấu của Implementation Staff, nhưng hồ sơ vẫn còn mục dữ liệu/mẫu kiểm thử cần hoàn tất trước khi chuyển sang thiết lập quy tắc."
            : "Saved staff confirmation, but remaining data/sample items must be resolved before rule setup."
          : vi
          ? "Đã cập nhật trạng thái cần rà soát lại dữ liệu và cách đánh giá."
          : "Marked data fields and evaluation criteria as needing further clarification."
      );
    } else {
      setActionError(
        resolveSaveError(
          candidateSpec,
          "Không thể cập nhật trạng thái làm rõ kỹ thuật. Vui lòng kiểm tra quyền phụ trách doanh nghiệp.",
          "Could not update technical readiness status. Please verify enterprise assignment permissions."
        )
      );
    }
  }

  const spec = selectedEnterprise ? ensureEnterpriseSpecification(selectedEnterprise) : undefined;
  const currentStage = selectedEnterprise ? resolveOnboardingStage(selectedEnterprise) : "intake";
  const canEdit = selectedEnterprise ? canDeploy(currentUser, selectedEnterprise) : false;
  const readiness = selectedEnterprise
    ? evaluateSetupReadiness(spec, vi, selectedEnterprise)
    : { ready: false, enterpriseConfirmed: false, dataAndEvaluationClarified: false, missingItems: [] };
  const assignedStaffName = selectedEnterprise
    ? users.find((u) => u.id === selectedEnterprise.deploymentStaffId)?.name ??
      selectedEnterprise.deploymentStaffId
    : "";
  const activeSet = selectedEnterprise
    ? sets.find((s) => s.enterpriseId === selectedEnterprise.id)
    : undefined;
  const intakeDocs = spec?.intakeDocuments ?? [];
  const supplementRequests = spec?.supplementRequests ?? [];
  const latestPendingSupplement = supplementRequests.find((req) => !req.receivedAt);
  const feedbackList = spec?.feedbackHistory ?? [];
  const latestFeedback = feedbackList[0];
  const isRevisingOrHasSent =
    currentStage === "revising" ||
    feedbackList.length > 0 ||
    Boolean(spec?.sentSnapshot);
  const activeSentSnapshot = spec?.sentSnapshot ?? spec?.savedDraft;
  const activeConfirmedSnapshot = spec?.confirmedSnapshot ?? spec?.sentSnapshot ?? spec?.savedDraft;

  return {
    vi,
    staffMembers,
    stageLabels,
    selectedEnterprise,
    selectedEnterpriseId,
    setSelectedEnterpriseId,
    activeUiStep,
    setActiveUiStep,
    searchQuery,
    setSearchQuery,
    stageFilter,
    setStageFilter,
    filteredEnterprises,
    totalCount,
    readyCount,
    activeClarifyingCount,
    companyName,
    setCompanyName,
    staffId,
    setStaffId,
    adminName,
    setAdminName,
    adminEmail,
    setAdminEmail,
    createMessage,
    createError,
    handleCreateEnterpriseSubmit,
    handleEnterProfile,
    handleProvisionWorkspace,
    spec,
    currentStage,
    canEdit,
    readiness,
    assignedStaffName,
    activeSet,
    intakeDocs,
    supplementRequests,
    latestPendingSupplement,
    feedbackList,
    latestFeedback,
    isRevisingOrHasSent,
    activeSentSnapshot,
    activeConfirmedSnapshot,
    statusFeedback,
    actionError,
    handleUploadIntakeDocument,
    handleDownloadDocument,
    previewDoc,
    setPreviewDoc,
    supplementModalOpen,
    setSupplementModalOpen,
    openSupplementModal,
    selectedSupplementItems,
    setSelectedSupplementItems,
    customSupplementItem,
    setCustomSupplementItem,
    supplementNote,
    setSupplementNote,
    guidanceFileName,
    clearGuidanceAttachment,
    handleSelectGuidanceFile,
    supplementFormError,
    handleRecordSupplementRequest,
    receiveModalOpen,
    setReceiveModalOpen,
    receivedNote,
    setReceivedNote,
    receivedDocName,
    clearReceivedSupplementAttachment,
    handleSelectReceivedSupplementFile,
    receiveError,
    setReceiveError,
    handleRecordSupplementReceived,
    handleStartClarification,
    workingRequirements,
    setWorkingRequirements,
    workingConditions,
    workingSchema,
    workingSampleJson,
    setWorkingSampleJson,
    workingRevisionSummary,
    setWorkingRevisionSummary,
    handleLoadSampleTransactionFile,
    condFormOpen,
    setCondFormOpen,
    editingCondId,
    setEditingCondId,
    condName,
    setCondName,
    condCriteria,
    setCondCriteria,
    condScope,
    setCondScope,
    condFormError,
    setCondFormError,
    openAddConditionForm,
    openEditConditionForm,
    handleSaveConditionItem,
    handleDeleteConditionItem,
    fieldFormOpen,
    setFieldFormOpen,
    editingFieldIndex,
    setEditingFieldIndex,
    fieldName,
    setFieldName,
    fieldType,
    setFieldType,
    fieldRequired,
    setFieldRequired,
    fieldDesc,
    setFieldDesc,
    fieldFormError,
    setFieldFormError,
    openAddFieldForm,
    openEditFieldForm,
    handleSaveFieldItem,
    handleDeleteFieldItem,
    handleSaveDraft,
    handleCancelChanges,
    handleRecordSentDraft,
    feedbackContent,
    setFeedbackContent,
    feedbackTime,
    setFeedbackTime,
    feedbackChannel,
    setFeedbackChannel,
    feedbackContact,
    setFeedbackContact,
    feedbackError,
    handleRecordFeedbackAndRevise,
    confirmModalOpen,
    setConfirmModalOpen,
    openConfirmationModal,
    confirmBy,
    setConfirmBy,
    confirmTime,
    setConfirmTime,
    confirmChannel,
    setConfirmChannel,
    confirmNote,
    setConfirmNote,
    confirmError,
    handleRecordEnterpriseConfirmation,
    handleToggleDataAndEvaluationClarified,
    snapshotModalData,
    setSnapshotModalData,
  };
}
