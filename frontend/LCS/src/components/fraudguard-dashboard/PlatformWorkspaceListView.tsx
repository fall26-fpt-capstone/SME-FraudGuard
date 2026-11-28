"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { TranslationKey } from "@/config/translations";
import { useLanguage } from "@/context/LanguageContext";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type {
  NormalizedWorkspaceEligibleStaffQuery,
  NormalizedWorkspaceHistoryQuery,
  NormalizedWorkspaceListQuery,
  NormalizedWorkspaceStaffAssignmentsQuery,
  WorkspaceAssignStaffPayload,
  WorkspaceDirectoryItem,
  WorkspaceEligibleStaffItem,
  WorkspaceEligibleStaffPageResponse,
  WorkspaceEligibleStaffQuery,
  WorkspaceHistoryItem,
  WorkspaceHistoryPageResponse,
  WorkspaceHistoryQuery,
  WorkspaceListQuery,
  WorkspaceMetadataUpdatePayload,
  WorkspacePageResponse,
  WorkspaceStaffAssignmentPageResponse,
  WorkspaceStaffAssignmentResult,
  WorkspaceStaffAssignmentsQuery,
} from "@/types/workspace";
import {
  DEFAULT_WORKSPACE_PAGE_SIZE,
  MAX_CONTACT_EMAIL_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_CONTACT_PHONE_LENGTH,
  MAX_ENTERPRISE_NAME_LENGTH,
  MAX_WORKSPACE_SEARCH_LENGTH,
  type WorkspaceMetadataField,
  type WorkspaceMetadataValidationCode,
  WorkspaceServiceError,
  assignWorkspaceStaff,
  classifyWorkspaceConflict,
  fetchWorkspaceDetail,
  fetchWorkspaceEligibleStaff,
  fetchWorkspaceHistory,
  fetchWorkspacePage,
  fetchWorkspaceStaffAssignments,
  updateWorkspaceMetadata,
  validateWorkspaceMetadataInput,
} from "@/services/workspaces";
import styles from "./SecurityDashboard.module.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_SEARCH_DEBOUNCE_MS = 250;

export interface PlatformWorkspaceListViewProps {
  readonly onSessionExpired?: () => void;
  readonly onUnauthenticated?: () => void;
  readonly loadPage?: (
    query: WorkspaceListQuery,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspacePageResponse>;
  readonly loadDetail?: (
    workspaceId: string,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceDirectoryItem>;
  readonly loadHistory?: (
    workspaceId: string,
    query: WorkspaceHistoryQuery,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceHistoryPageResponse>;
  readonly loadStaffAssignments?: (
    workspaceId: string,
    query: WorkspaceStaffAssignmentsQuery,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceStaffAssignmentPageResponse>;
  readonly loadEligibleStaff?: (
    workspaceId: string,
    query: WorkspaceEligibleStaffQuery,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceEligibleStaffPageResponse>;
  readonly assignStaff?: (
    workspaceId: string,
    payload: WorkspaceAssignStaffPayload,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceStaffAssignmentResult>;
  readonly saveMetadata?: (
    workspaceId: string,
    payload: WorkspaceMetadataUpdatePayload,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<WorkspaceDirectoryItem>;
  readonly searchDebounceMs?: number;
}

type ViewLoadStatus = "loading" | "ready" | "forbidden" | "error";

type DetailModalStatus =
  | "loading"
  | "ready"
  | "forbidden"
  | "not_found"
  | "error";

type ModalPanelMode = "view" | "edit" | "history" | "staff";

type DetailModalState =
  | { readonly open: false }
  | {
      readonly open: true;
      readonly workspaceId: string;
      readonly fallbackTitle: string;
      readonly status: DetailModalStatus;
      readonly detail: WorkspaceDirectoryItem | null;
    };

interface HistoryPanelState {
  readonly status: DetailModalStatus;
  readonly pageData: WorkspaceHistoryPageResponse | null;
}

interface StaffAssignmentsPanelState {
  readonly status: DetailModalStatus;
  readonly pageData: WorkspaceStaffAssignmentPageResponse | null;
}

interface EligibleStaffPanelState {
  readonly status: DetailModalStatus;
  readonly pageData: WorkspaceEligibleStaffPageResponse | null;
}

type StaffBannerState =
  | { readonly kind: "info"; readonly message: string }
  | { readonly kind: "conflict_stale"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "ineligible"; readonly message: string }
  | {
      readonly kind: "validation" | "forbidden" | "not_found" | "csrf";
      readonly message: string;
    };

interface EditFormDraft {
  readonly enterpriseName: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
}

type EditBannerState =
  | { readonly kind: "validation" | "forbidden" | "csrf"; readonly message: string }
  | {
      readonly kind: "conflict_stale" | "conflict_generic" | "reload_failed";
      readonly message: string;
    }
  | { readonly kind: "conflict_duplicate"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "info"; readonly message: string };

export interface FormattedSpecBlock {
  readonly label: string;
  readonly before?: string | null;
  readonly after: string | null;
}

export interface DescribedWorkspaceHistoryEvent {
  readonly title: string;
  readonly summaryLines: readonly string[];
  readonly staffAssignmentDetail?: {
    readonly label: string;
    readonly staffId: string;
    readonly staffLoginName?: string;
  };
  readonly specBlocks?: readonly FormattedSpecBlock[];
  readonly hasLongChangeText: boolean;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function describeWorkspaceHistoryEvent(
  event: WorkspaceHistoryItem,
  detailCopy: TranslationKey["platformWorkspaces"]["detail"],
  knownStaffLoginsById?: ReadonlyMap<string, string>,
): DescribedWorkspaceHistoryEvent {
  const historyCopy = detailCopy.history;
  const details = event.details;

  if (event.action === "METADATA_UPDATED") {
    const beforeObj = asPlainObject(details?.before);
    const afterObj = asPlainObject(details?.after);
    const fieldSpecs: readonly {
      readonly key:
        | "enterpriseName"
        | "contactName"
        | "contactEmail"
        | "contactPhone";
      readonly label: string;
    }[] = [
      { key: "enterpriseName", label: detailCopy.edit.enterpriseNameLabel },
      { key: "contactName", label: detailCopy.fields.contactName },
      { key: "contactEmail", label: detailCopy.fields.contactEmail },
      { key: "contactPhone", label: detailCopy.fields.contactPhone },
    ];

    const lines: string[] = [];
    if (beforeObj && afterObj) {
      for (const spec of fieldSpecs) {
        const beforeVal = normalizeOptionalText(beforeObj[spec.key]);
        const afterVal = normalizeOptionalText(afterObj[spec.key]);
        if (beforeVal === afterVal) {
          continue;
        }
        if (!beforeVal && afterVal) {
          lines.push(
            historyCopy.summaries.fieldAdded
              .replace("{field}", spec.label)
              .replace("{after}", afterVal),
          );
        } else if (beforeVal && !afterVal) {
          lines.push(
            historyCopy.summaries.fieldRemoved
              .replace("{field}", spec.label)
              .replace("{before}", beforeVal),
          );
        } else {
          lines.push(
            historyCopy.summaries.fieldChanged
              .replace("{field}", spec.label)
              .replace("{before}", beforeVal)
              .replace("{after}", afterVal),
          );
        }
      }
    }

    const summaryLines =
      lines.length > 0 ? lines : [historyCopy.summaries.metadataUpdatedFallback];
    const hasLongChangeText = summaryLines.some((l) => l.length > 110);

    return {
      title: historyCopy.actions.metadataUpdated,
      summaryLines,
      hasLongChangeText,
    };
  }

  if (event.action === "STAFF_ASSIGNED" || event.action === "STAFF_REMOVED") {
    const isAssigned = event.action === "STAFF_ASSIGNED";
    const staffId = normalizeOptionalText(details?.staffId);
    const knownLogin =
      staffId && knownStaffLoginsById
        ? knownStaffLoginsById.get(staffId)
        : undefined;
    return {
      title: isAssigned
        ? historyCopy.actions.staffAssigned
        : historyCopy.actions.staffRemoved,
      summaryLines: [
        isAssigned
          ? historyCopy.summaries.staffAssignedSummary
          : historyCopy.summaries.staffRemovedSummary,
      ],
      ...(staffId
        ? {
            staffAssignmentDetail: {
              label: isAssigned
                ? historyCopy.assignedStaffIdLabel
                : historyCopy.removedStaffIdLabel,
              staffId,
              ...(knownLogin ? { staffLoginName: knownLogin } : {}),
            },
          }
        : {}),
      hasLongChangeText: false,
    };
  }

  const specFieldDefs: readonly {
    readonly key:
      | "businessSpecification"
      | "fieldDescriptions"
      | "knownAnomalyConditions";
    readonly label: string;
  }[] = [
    {
      key: "businessSpecification",
      label: historyCopy.specFields.businessSpecification,
    },
    {
      key: "fieldDescriptions",
      label: historyCopy.specFields.fieldDescriptions,
    },
    {
      key: "knownAnomalyConditions",
      label: historyCopy.specFields.knownAnomalyConditions,
    },
  ];

  if (event.action === "SPECIFICATION_CREATED") {
    const specBlocks: FormattedSpecBlock[] = [];
    if (details) {
      for (const fieldDef of specFieldDefs) {
        const val = normalizeOptionalText(details[fieldDef.key]);
        if (val || fieldDef.key === "businessSpecification") {
          specBlocks.push({
            label: fieldDef.label,
            after: val || null,
          });
        }
      }
    }
    return {
      title: historyCopy.actions.specificationCreated,
      summaryLines: [historyCopy.summaries.specCreatedSummary],
      ...(specBlocks.length > 0 ? { specBlocks } : {}),
      hasLongChangeText: specBlocks.length > 0,
    };
  }

  if (event.action === "SPECIFICATION_UPDATED") {
    const beforeObj = asPlainObject(details?.before);
    const afterObj = asPlainObject(details?.after);
    const changedLabels: string[] = [];
    const specBlocks: FormattedSpecBlock[] = [];

    if (beforeObj && afterObj) {
      for (const fieldDef of specFieldDefs) {
        const beforeVal = normalizeOptionalText(beforeObj[fieldDef.key]);
        const afterVal = normalizeOptionalText(afterObj[fieldDef.key]);
        if (beforeVal !== afterVal) {
          changedLabels.push(fieldDef.label);
          specBlocks.push({
            label: fieldDef.label,
            before: beforeVal || null,
            after: afterVal || null,
          });
        }
      }
    } else if (afterObj) {
      for (const fieldDef of specFieldDefs) {
        const afterVal = normalizeOptionalText(afterObj[fieldDef.key]);
        if (afterVal) {
          specBlocks.push({
            label: fieldDef.label,
            after: afterVal,
          });
        }
      }
    }

    const summaryLine =
      changedLabels.length > 0
        ? historyCopy.summaries.specUpdatedSummary.replace(
            "{fields}",
            changedLabels.join(", "),
          )
        : historyCopy.summaries.specUpdatedFallback;

    return {
      title: historyCopy.actions.specificationUpdated,
      summaryLines: [summaryLine],
      ...(specBlocks.length > 0 ? { specBlocks } : {}),
      hasLongChangeText: specBlocks.length > 0,
    };
  }

  return {
    title: historyCopy.actions.unknownEvent.replace("{action}", event.action),
    summaryLines: [historyCopy.summaries.unknownSummary],
    hasLongChangeText: false,
  };
}

export function buildPaginationTokens(
  currentZeroBasedPage: number,
  totalPages: number,
): readonly (number | "ellipsis-start" | "ellipsis-end")[] {
  if (totalPages <= 1) {
    return totalPages === 1 ? [0] : [];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx);
  }

  const tokens: (number | "ellipsis-start" | "ellipsis-end")[] = [0];
  const windowStart = Math.max(1, currentZeroBasedPage - 1);
  const windowEnd = Math.min(totalPages - 2, currentZeroBasedPage + 1);

  if (windowStart > 1) {
    tokens.push("ellipsis-start");
  }
  for (let p = windowStart; p <= windowEnd; p += 1) {
    tokens.push(p);
  }
  if (windowEnd < totalPages - 2) {
    tokens.push("ellipsis-end");
  }
  tokens.push(totalPages - 1);
  return tokens;
}

export function formatWorkspaceTimestamp(
  isoValue: string,
  language: "vi" | "en",
  fallback: string,
): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toLocaleString(language === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function isWorkspaceError(err: unknown): err is WorkspaceServiceError {
  return (
    err instanceof WorkspaceServiceError ||
    Boolean(
      err &&
        typeof err === "object" &&
        (err as { name?: unknown }).name === "WorkspaceServiceError" &&
        typeof (err as { code?: unknown }).code === "string",
    )
  );
}

function draftFromItem(item: WorkspaceDirectoryItem): EditFormDraft {
  return {
    enterpriseName: item.enterpriseName,
    contactName: item.contactName,
    contactEmail: item.contactEmail,
    contactPhone: item.contactPhone ?? "",
  };
}

export function PlatformWorkspaceListView({
  onSessionExpired,
  onUnauthenticated,
  loadPage = fetchWorkspacePage,
  loadDetail = fetchWorkspaceDetail,
  loadHistory = fetchWorkspaceHistory,
  loadStaffAssignments = fetchWorkspaceStaffAssignments,
  loadEligibleStaff = fetchWorkspaceEligibleStaff,
  assignStaff = assignWorkspaceStaff,
  saveMetadata = updateWorkspaceMetadata,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: PlatformWorkspaceListViewProps) {
  const { language, t } = useLanguage();
  const copy = t.platformWorkspaces;
  const detailCopy = copy.detail;
  const editCopy = detailCopy.edit;
  const historyCopy = detailCopy.history;
  const staffCopy = detailCopy.staff;

  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const [query, setQuery] = useState<NormalizedWorkspaceListQuery>({
    search: "",
    page: 0,
    size: DEFAULT_WORKSPACE_PAGE_SIZE,
  });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [status, setStatus] = useState<ViewLoadStatus>("loading");
  const [pageData, setPageData] = useState<WorkspacePageResponse | null>(null);
  const [loadedQuery, setLoadedQuery] =
    useState<NormalizedWorkspaceListQuery | null>(null);
  const [detailState, setDetailState] = useState<DetailModalState>({
    open: false,
  });

  const [modalMode, setModalMode] = useState<ModalPanelMode>("view");
  const [editBaseVersion, setEditBaseVersion] = useState<number>(0);
  const [editDraft, setEditDraft] = useState<EditFormDraft>({
    enterpriseName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [editFieldErrors, setEditFieldErrors] = useState<
    Partial<Record<WorkspaceMetadataField, string>>
  >({});
  const [editBanner, setEditBanner] = useState<EditBannerState | null>(null);
  const [viewNotice, setViewNotice] = useState<string>("");
  const [knownWorkspaceVersion, setKnownWorkspaceVersion] = useState<
    number | null
  >(null);
  const [isRefreshingDetail, setIsRefreshingDetail] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [detailRefreshError, setDetailRefreshError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isInspectingCurrent, setIsInspectingCurrent] = useState(false);

  const [historyQuery, setHistoryQuery] =
    useState<NormalizedWorkspaceHistoryQuery>({
      page: 0,
      size: DEFAULT_WORKSPACE_PAGE_SIZE,
    });
  const [historyState, setHistoryState] = useState<HistoryPanelState>({
    status: "loading",
    pageData: null,
  });
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const [assignmentsQuery, setAssignmentsQuery] =
    useState<NormalizedWorkspaceStaffAssignmentsQuery>({
      page: 0,
      size: DEFAULT_WORKSPACE_PAGE_SIZE,
    });
  const [assignmentsState, setAssignmentsState] =
    useState<StaffAssignmentsPanelState>({
      status: "loading",
      pageData: null,
    });

  const [eligibleSearchInput, setEligibleSearchInput] = useState("");
  const [eligibleSearchError, setEligibleSearchError] = useState("");
  const [eligibleQuery, setEligibleQuery] =
    useState<NormalizedWorkspaceEligibleStaffQuery>({
      search: "",
      page: 0,
      size: DEFAULT_WORKSPACE_PAGE_SIZE,
    });
  const [eligibleLoadedQuery, setEligibleLoadedQuery] =
    useState<NormalizedWorkspaceEligibleStaffQuery | null>(null);
  const [eligibleState, setEligibleState] = useState<EligibleStaffPanelState>({
    status: "loading",
    pageData: null,
  });

  const [knownStaffLoginsById, setKnownStaffLoginsById] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [confirmedAssignedStaffIds, setConfirmedAssignedStaffIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isReloadingStaffStatus, setIsReloadingStaffStatus] = useState(false);
  const [staffBanner, setStaffBanner] = useState<StaffBannerState | null>(null);

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const detailRequestSeqRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailSyncSeqRef = useRef(0);
  const detailSyncAbortRef = useRef<AbortController | null>(null);
  const loadedDetailRef = useRef<WorkspaceDirectoryItem | null>(null);
  const knownWorkspaceVersionRef = useRef<number | null>(null);
  const isRefreshingDetailRef = useRef(false);
  const pendingEditOnRefreshRef = useRef(false);
  const lastRefreshIntentEditRef = useRef(false);
  const modalModeRef = useRef<ModalPanelMode>("view");
  const saveAbortRef = useRef<AbortController | null>(null);
  const historyRequestSeqRef = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);
  const assignmentsRequestSeqRef = useRef(0);
  const assignmentsAbortRef = useRef<AbortController | null>(null);
  const eligibleRequestSeqRef = useRef(0);
  const eligibleAbortRef = useRef<AbortController | null>(null);
  const eligibleDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const assignRequestSeqRef = useRef(0);
  const assignAbortRef = useRef<AbortController | null>(null);
  const confirmedAssignmentsVersionRef = useRef<number | null>(null);
  const isAssigningRef = useRef(false);
  const isSavingRef = useRef(false);
  const openWorkspaceIdRef = useRef<string | null>(null);
  const rowTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastTriggerIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRedirectedRef = useRef(false);

  openWorkspaceIdRef.current = detailState.open ? detailState.workspaceId : null;
  modalModeRef.current = modalMode;

  const latestHandlersRef = useRef({
    loadPage,
    loadDetail,
    loadHistory,
    loadStaffAssignments,
    loadEligibleStaff,
    assignStaff,
    saveMetadata,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
    editCopy,
    staffCopy,
  });
  latestHandlersRef.current = {
    loadPage,
    loadDetail,
    loadHistory,
    loadStaffAssignments,
    loadEligibleStaff,
    assignStaff,
    saveMetadata,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
    editCopy,
    staffCopy,
  };

  const clearPendingEligibleDebounce = useCallback(() => {
    if (eligibleDebounceTimerRef.current !== null) {
      clearTimeout(eligibleDebounceTimerRef.current);
      eligibleDebounceTimerRef.current = null;
    }
  }, []);

  const resetModalSubStates = useCallback(() => {
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    detailSyncAbortRef.current?.abort();
    detailSyncAbortRef.current = null;
    detailSyncSeqRef.current += 1;
    loadedDetailRef.current = null;
    knownWorkspaceVersionRef.current = null;
    isRefreshingDetailRef.current = false;
    pendingEditOnRefreshRef.current = false;
    lastRefreshIntentEditRef.current = false;
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    historyRequestSeqRef.current += 1;
    assignmentsAbortRef.current?.abort();
    assignmentsAbortRef.current = null;
    assignmentsRequestSeqRef.current += 1;
    eligibleAbortRef.current?.abort();
    eligibleAbortRef.current = null;
    eligibleRequestSeqRef.current += 1;
    assignAbortRef.current?.abort();
    assignAbortRef.current = null;
    assignRequestSeqRef.current += 1;
    clearPendingEligibleDebounce();
    confirmedAssignmentsVersionRef.current = null;
    isAssigningRef.current = false;
    isSavingRef.current = false;
    modalModeRef.current = "view";
    setIsSaving(false);
    setIsInspectingCurrent(false);
    setIsRefreshingDetail(false);
    setIsPreparingEdit(false);
    setKnownWorkspaceVersion(null);
    setDetailRefreshError("");
    setIsAssigning(false);
    setIsReloadingStaffStatus(false);
    setModalMode("view");
    setEditFieldErrors({});
    setEditBanner(null);
    setViewNotice("");
    setHistoryQuery({ page: 0, size: DEFAULT_WORKSPACE_PAGE_SIZE });
    setHistoryState({ status: "loading", pageData: null });
    setExpandedHistoryIds(new Set());
    setAssignmentsQuery({ page: 0, size: DEFAULT_WORKSPACE_PAGE_SIZE });
    setAssignmentsState({ status: "loading", pageData: null });
    setEligibleSearchInput("");
    setEligibleSearchError("");
    setEligibleQuery({
      search: "",
      page: 0,
      size: DEFAULT_WORKSPACE_PAGE_SIZE,
    });
    setEligibleLoadedQuery(null);
    setEligibleState({ status: "loading", pageData: null });
    setKnownStaffLoginsById(new Map());
    setConfirmedAssignedStaffIds(new Set());
    setSelectedStaffId("");
    setStaffBanner(null);
  }, [clearPendingEligibleDebounce]);

  const clearPendingDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const triggerAuthRedirect = useCallback(
    (code: "SESSION_EXPIRED" | "UNAUTHENTICATED") => {
      if (authRedirectedRef.current) {
        return;
      }
      authRedirectedRef.current = true;
      detailAbortRef.current?.abort();
      detailSyncAbortRef.current?.abort();
      saveAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      assignmentsAbortRef.current?.abort();
      eligibleAbortRef.current?.abort();
      assignAbortRef.current?.abort();
      clearPendingEligibleDebounce();
      detailRequestSeqRef.current += 1;
      detailSyncSeqRef.current += 1;
      historyRequestSeqRef.current += 1;
      assignmentsRequestSeqRef.current += 1;
      eligibleRequestSeqRef.current += 1;
      assignRequestSeqRef.current += 1;
      loadedDetailRef.current = null;
      knownWorkspaceVersionRef.current = null;
      isRefreshingDetailRef.current = false;
      pendingEditOnRefreshRef.current = false;
      lastRefreshIntentEditRef.current = false;
      isAssigningRef.current = false;
      isSavingRef.current = false;
      openWorkspaceIdRef.current = null;
      modalModeRef.current = "view";
      setIsSaving(false);
      setIsInspectingCurrent(false);
      setIsRefreshingDetail(false);
      setIsPreparingEdit(false);
      setIsAssigning(false);
      setIsReloadingStaffStatus(false);
      setModalMode("view");
      setDetailState({ open: false });
      if (
        code === "UNAUTHENTICATED" &&
        latestHandlersRef.current.onUnauthenticated
      ) {
        latestHandlersRef.current.onUnauthenticated();
        return;
      }
      latestHandlersRef.current.onSessionExpired?.();
    },
    [clearPendingEligibleDebounce],
  );

  const handleCloseDetail = useCallback(() => {
    const returnFocusId = lastTriggerIdRef.current;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    detailRequestSeqRef.current += 1;
    openWorkspaceIdRef.current = null;
    resetModalSubStates();
    setDetailState({ open: false });

    if (returnFocusId) {
      queueMicrotask(() => {
        const currentBtn = rowTriggerRefs.current.get(returnFocusId);
        if (currentBtn && typeof currentBtn.focus === "function") {
          currentBtn.focus();
        } else if (
          searchInputRef.current &&
          typeof searchInputRef.current.focus === "function"
        ) {
          searchInputRef.current.focus();
        }
      });
    }
  }, [resetModalSubStates]);

  const detailDialogRef = useDialogFocus(detailState.open, handleCloseDetail);

  const commitCompleteWorkspaceDetail = useCallback(
    (
      workspaceId: string,
      incoming: WorkspaceDirectoryItem,
    ): WorkspaceDirectoryItem | null => {
      if (openWorkspaceIdRef.current !== workspaceId) {
        return null;
      }
      const existing = loadedDetailRef.current;
      if (existing && incoming.version < existing.version) {
        return existing;
      }
      loadedDetailRef.current = incoming;
      const nextKnown = Math.max(
        knownWorkspaceVersionRef.current ?? 0,
        incoming.version,
      );
      knownWorkspaceVersionRef.current = nextKnown;
      setKnownWorkspaceVersion(nextKnown);
      if (incoming.version >= nextKnown) {
        setDetailRefreshError("");
      }
      setDetailState({
        open: true,
        workspaceId,
        fallbackTitle: incoming.enterpriseName,
        status: "ready",
        detail: incoming,
      });
      return incoming;
    },
    [],
  );

  const executeDetailLoad = useCallback(
    async (workspaceId: string, fallbackTitle: string) => {
      detailAbortRef.current?.abort();
      resetModalSubStates();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const requestId = detailRequestSeqRef.current + 1;
      detailRequestSeqRef.current = requestId;
      openWorkspaceIdRef.current = workspaceId;

      setDetailState({
        open: true,
        workspaceId,
        fallbackTitle,
        status: "loading",
        detail: null,
      });

      try {
        const detail = await latestHandlersRef.current.loadDetail(workspaceId, {
          signal: controller.signal,
        });
        if (
          detailRequestSeqRef.current !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }
        commitCompleteWorkspaceDetail(workspaceId, detail);
      } catch (err) {
        if (
          isAbortError(err) ||
          detailRequestSeqRef.current !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }
        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "FORBIDDEN") {
            setDetailState({
              open: true,
              workspaceId,
              fallbackTitle,
              status: "forbidden",
              detail: null,
            });
            return;
          }
          if (err.code === "NOT_FOUND") {
            setDetailState({
              open: true,
              workspaceId,
              fallbackTitle,
              status: "not_found",
              detail: null,
            });
            return;
          }
        }
        setDetailState({
          open: true,
          workspaceId,
          fallbackTitle,
          status: "error",
          detail: null,
        });
      }
    },
      [
        commitCompleteWorkspaceDetail,
        resetModalSubStates,
        triggerAuthRedirect,
      ],
  );

  const executeHistoryLoad = useCallback(
    async (
      workspaceId: string,
      targetHistoryQuery: NormalizedWorkspaceHistoryQuery,
    ) => {
      historyAbortRef.current?.abort();
      const controller = new AbortController();
      historyAbortRef.current = controller;
      const reqId = historyRequestSeqRef.current + 1;
      historyRequestSeqRef.current = reqId;

      setExpandedHistoryIds(new Set());
      setHistoryState((prev) => ({
        status: "loading",
        pageData: prev.pageData,
      }));

      try {
        const result = await latestHandlersRef.current.loadHistory(
          workspaceId,
          targetHistoryQuery,
          { signal: controller.signal },
        );
        if (
          historyRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (
          result.items.length === 0 &&
          result.totalElements > 0 &&
          result.totalPages > 0 &&
          targetHistoryQuery.page >= result.totalPages
        ) {
          const clampedQuery = {
            page: Math.max(0, result.totalPages - 1),
            size: targetHistoryQuery.size,
          };
          setHistoryQuery(clampedQuery);
          void executeHistoryLoad(workspaceId, clampedQuery);
          return;
        }
        setHistoryState({
          status: "ready",
          pageData: result,
        });
      } catch (err) {
        if (
          isAbortError(err) ||
          historyRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "FORBIDDEN") {
            setHistoryState({ status: "forbidden", pageData: null });
            return;
          }
          if (err.code === "NOT_FOUND") {
            setHistoryState({ status: "not_found", pageData: null });
            return;
          }
        }
        setHistoryState({ status: "error", pageData: null });
      }
    },
    [triggerAuthRedirect],
  );

  const handleOpenDetail = useCallback(
    (item: WorkspaceDirectoryItem) => {
      lastTriggerIdRef.current = item.id;
      void executeDetailLoad(item.id, item.enterpriseName);
    },
    [executeDetailLoad],
  );

  const handleRetryDetail = useCallback(() => {
    if (!detailState.open) {
      return;
    }
    void executeDetailLoad(detailState.workspaceId, detailState.fallbackTitle);
  }, [detailState, executeDetailLoad]);

  const handleOpenHistory = () => {
    if (!detailState.open || detailState.status !== "ready" || !detailState.detail) {
      return;
    }
    pendingEditOnRefreshRef.current = false;
    setIsPreparingEdit(false);
    const nextHistoryQuery: NormalizedWorkspaceHistoryQuery = {
      page: 0,
      size: historyQuery.size,
    };
    modalModeRef.current = "history";
    setModalMode("history");
    setHistoryQuery(nextHistoryQuery);
    setHistoryState({ status: "loading", pageData: null });
    void executeHistoryLoad(detailState.workspaceId, nextHistoryQuery);
  };

  const handleBackToDetailInfo = () => {
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    historyRequestSeqRef.current += 1;
    assignmentsAbortRef.current?.abort();
    assignmentsAbortRef.current = null;
    assignmentsRequestSeqRef.current += 1;
    eligibleAbortRef.current?.abort();
    eligibleAbortRef.current = null;
    eligibleRequestSeqRef.current += 1;
    clearPendingEligibleDebounce();
    modalModeRef.current = "view";
    setModalMode("view");
  };

  const refreshWorkspaceDetail = useCallback(
    async (
      workspaceId: string,
      options?: { readonly openEditWhenReady?: boolean },
    ) => {
      if (openWorkspaceIdRef.current !== workspaceId) {
        return;
      }
      if (options?.openEditWhenReady) {
        pendingEditOnRefreshRef.current = true;
        lastRefreshIntentEditRef.current = true;
        setIsPreparingEdit(true);
      }
      setDetailRefreshError("");

      if (isRefreshingDetailRef.current) {
        return;
      }

      detailSyncAbortRef.current?.abort();
      const controller = new AbortController();
      detailSyncAbortRef.current = controller;
      const syncId = detailSyncSeqRef.current + 1;
      detailSyncSeqRef.current = syncId;
      isRefreshingDetailRef.current = true;
      setIsRefreshingDetail(true);
      const priorVersion = loadedDetailRef.current?.version ?? -1;

      try {
        const freshDetail = await latestHandlersRef.current.loadDetail(
          workspaceId,
          { signal: controller.signal },
        );
        if (
          detailSyncSeqRef.current !== syncId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }

        const committed = commitCompleteWorkspaceDetail(
          workspaceId,
          freshDetail,
        );
        const targetKnown = knownWorkspaceVersionRef.current ?? 0;
        const wantOpenEdit = pendingEditOnRefreshRef.current;

        isRefreshingDetailRef.current = false;
        setIsRefreshingDetail(false);

        if (!committed || committed.version < targetKnown) {
          if (committed && committed.version > priorVersion) {
            void refreshWorkspaceDetail(workspaceId, {
              openEditWhenReady: wantOpenEdit,
            });
            return;
          }
          pendingEditOnRefreshRef.current = false;
          setIsPreparingEdit(false);
          setDetailRefreshError(
            latestHandlersRef.current.editCopy.errors.refreshBeforeEditFailed,
          );
          return;
        }

        pendingEditOnRefreshRef.current = false;
        setIsPreparingEdit(false);
        lastRefreshIntentEditRef.current = false;

        if (wantOpenEdit && modalModeRef.current === "view") {
          setViewNotice("");
          setEditFieldErrors({});
          setEditBanner(null);
          setEditBaseVersion(committed.version);
          setEditDraft(draftFromItem(committed));
          modalModeRef.current = "edit";
          setModalMode("edit");
        }
      } catch (err) {
        if (
          isAbortError(err) ||
          detailSyncSeqRef.current !== syncId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        isRefreshingDetailRef.current = false;
        pendingEditOnRefreshRef.current = false;
        setIsRefreshingDetail(false);
        setIsPreparingEdit(false);

        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "NOT_FOUND" && modalModeRef.current !== "edit") {
            const fallback =
              loadedDetailRef.current?.enterpriseName ?? "";
            resetModalSubStates();
            setDetailState({
              open: true,
              workspaceId,
              fallbackTitle: fallback,
              status: "not_found",
              detail: null,
            });
            setReloadNonce((n) => n + 1);
            return;
          }
        }

        if (modalModeRef.current !== "edit") {
          setDetailRefreshError(
            latestHandlersRef.current.editCopy.errors.refreshBeforeEditFailed,
          );
        }
      }
    },
    [commitCompleteWorkspaceDetail, resetModalSubStates, triggerAuthRedirect],
  );

  const observeWorkspaceVersion = useCallback(
    (workspaceId: string, observedVersion: number) => {
      if (openWorkspaceIdRef.current !== workspaceId) {
        return;
      }
      const nextKnown = Math.max(
        knownWorkspaceVersionRef.current ?? 0,
        observedVersion,
      );
      knownWorkspaceVersionRef.current = nextKnown;
      setKnownWorkspaceVersion(nextKnown);
      if (
        loadedDetailRef.current &&
        loadedDetailRef.current.version < nextKnown &&
        modalModeRef.current !== "edit"
      ) {
        void refreshWorkspaceDetail(workspaceId);
      }
    },
    [refreshWorkspaceDetail],
  );

  const applyConfirmedAssignmentsPage = useCallback(
    (
      workspaceId: string,
      pageResult: WorkspaceStaffAssignmentPageResponse,
      extraAssignedStaffId?: string,
    ) => {
      const sameVersion =
        confirmedAssignmentsVersionRef.current === pageResult.workspaceVersion;
      confirmedAssignmentsVersionRef.current = pageResult.workspaceVersion;
      setConfirmedAssignedStaffIds((prev) => {
        const next = sameVersion ? new Set(prev) : new Set<string>();
        for (const row of pageResult.items) {
          next.add(row.staffId);
        }
        if (extraAssignedStaffId) {
          next.add(extraAssignedStaffId);
        }
        return next;
      });
      observeWorkspaceVersion(workspaceId, pageResult.workspaceVersion);
    },
    [observeWorkspaceVersion],
  );

  const executeAssignmentsLoad = useCallback(
    async (
      workspaceId: string,
      targetQuery: NormalizedWorkspaceStaffAssignmentsQuery,
      extraAssignedStaffId?: string,
    ) => {
      assignmentsAbortRef.current?.abort();
      const controller = new AbortController();
      assignmentsAbortRef.current = controller;
      const reqId = assignmentsRequestSeqRef.current + 1;
      assignmentsRequestSeqRef.current = reqId;

      setAssignmentsState((prev) => ({
        status: "loading",
        pageData: prev.pageData,
      }));

      try {
        const result = await latestHandlersRef.current.loadStaffAssignments(
          workspaceId,
          targetQuery,
          { signal: controller.signal },
        );
        if (
          assignmentsRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (
          result.items.length === 0 &&
          result.totalElements > 0 &&
          result.totalPages > 0 &&
          targetQuery.page >= result.totalPages
        ) {
          const clamped = {
            page: Math.max(0, result.totalPages - 1),
            size: targetQuery.size,
          };
          setAssignmentsQuery(clamped);
          void executeAssignmentsLoad(
            workspaceId,
            clamped,
            extraAssignedStaffId,
          );
          return;
        }
        applyConfirmedAssignmentsPage(
          workspaceId,
          result,
          extraAssignedStaffId,
        );
        setAssignmentsState({
          status: "ready",
          pageData: result,
        });
      } catch (err) {
        if (
          isAbortError(err) ||
          assignmentsRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "FORBIDDEN") {
            setAssignmentsState({ status: "forbidden", pageData: null });
            return;
          }
          if (err.code === "NOT_FOUND") {
            setAssignmentsState({ status: "not_found", pageData: null });
            return;
          }
        }
        setAssignmentsState({ status: "error", pageData: null });
      }
    },
    [applyConfirmedAssignmentsPage, triggerAuthRedirect],
  );

  const executeEligibleStaffLoad = useCallback(
    async (
      workspaceId: string,
      targetQuery: NormalizedWorkspaceEligibleStaffQuery,
    ) => {
      eligibleAbortRef.current?.abort();
      const controller = new AbortController();
      eligibleAbortRef.current = controller;
      const reqId = eligibleRequestSeqRef.current + 1;
      eligibleRequestSeqRef.current = reqId;

      setEligibleState((prev) => ({
        status: "loading",
        pageData: prev.pageData,
      }));

      try {
        const result = await latestHandlersRef.current.loadEligibleStaff(
          workspaceId,
          targetQuery,
          { signal: controller.signal },
        );
        if (
          eligibleRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (result.items.length > 0) {
          setKnownStaffLoginsById((prev) => {
            const next = new Map(prev);
            for (const staffItem of result.items) {
              next.set(staffItem.id, staffItem.loginName);
            }
            return next;
          });
        }
        if (
          result.items.length === 0 &&
          result.totalElements > 0 &&
          result.totalPages > 0 &&
          targetQuery.page >= result.totalPages
        ) {
          const clamped = {
            search: targetQuery.search,
            page: Math.max(0, result.totalPages - 1),
            size: targetQuery.size,
          };
          setEligibleQuery(clamped);
          void executeEligibleStaffLoad(workspaceId, clamped);
          return;
        }
        setEligibleLoadedQuery(targetQuery);
        setEligibleState({
          status: "ready",
          pageData: result,
        });
      } catch (err) {
        if (
          isAbortError(err) ||
          eligibleRequestSeqRef.current !== reqId ||
          controller.signal.aborted ||
          openWorkspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "FORBIDDEN") {
            setEligibleState({ status: "forbidden", pageData: null });
            return;
          }
          if (err.code === "NOT_FOUND") {
            setEligibleState({ status: "not_found", pageData: null });
            return;
          }
          if (err.code === "VALIDATION_ERROR" && err.detail === "SEARCH_TOO_LONG") {
            setEligibleSearchError(
              latestHandlersRef.current.staffCopy.assign.errors.searchTooLong,
            );
            setEligibleState((prev) => ({
              status: "ready",
              pageData: prev.pageData,
            }));
            return;
          }
        }
        setEligibleState({ status: "error", pageData: null });
      }
    },
    [triggerAuthRedirect],
  );

  const handleOpenStaff = () => {
    if (!detailState.open || detailState.status !== "ready" || !detailState.detail) {
      return;
    }
    pendingEditOnRefreshRef.current = false;
    setIsPreparingEdit(false);
    historyAbortRef.current?.abort();
    historyRequestSeqRef.current += 1;
    clearPendingEligibleDebounce();

    const nextAssignmentsQuery: NormalizedWorkspaceStaffAssignmentsQuery = {
      page: 0,
      size: assignmentsQuery.size,
    };
    const nextEligibleQuery: NormalizedWorkspaceEligibleStaffQuery = {
      search: "",
      page: 0,
      size: eligibleQuery.size,
    };

    modalModeRef.current = "staff";
    setModalMode("staff");
    setStaffBanner(null);
    setSelectedStaffId("");
    setEligibleSearchInput("");
    setEligibleSearchError("");
    setAssignmentsQuery(nextAssignmentsQuery);
    setEligibleQuery(nextEligibleQuery);
    setEligibleLoadedQuery(null);
    setAssignmentsState({ status: "loading", pageData: null });
    setEligibleState({ status: "loading", pageData: null });
    void executeAssignmentsLoad(detailState.workspaceId, nextAssignmentsQuery);
    void executeEligibleStaffLoad(detailState.workspaceId, nextEligibleQuery);
  };

  const handleAssignmentsPageChange = (nextZeroBasedPage: number) => {
    if (
      !detailState.open ||
      nextZeroBasedPage < 0 ||
      nextZeroBasedPage === assignmentsQuery.page
    ) {
      return;
    }
    const nextQuery = {
      page: nextZeroBasedPage,
      size: assignmentsQuery.size,
    };
    setAssignmentsQuery(nextQuery);
    void executeAssignmentsLoad(detailState.workspaceId, nextQuery);
  };

  const handleAssignmentsPageSizeChange = (nextSize: number) => {
    if (!detailState.open) {
      return;
    }
    const nextQuery = {
      page: 0,
      size: nextSize,
    };
    setAssignmentsQuery(nextQuery);
    void executeAssignmentsLoad(detailState.workspaceId, nextQuery);
  };

  const handleRetryOrRefreshAssignments = () => {
    if (!detailState.open) {
      return;
    }
    void executeAssignmentsLoad(detailState.workspaceId, assignmentsQuery);
  };

  const commitEligibleSearch = useCallback(
    (workspaceId: string, rawValue: string, currentSize: number) => {
      clearPendingEligibleDebounce();
      if (rawValue.length > MAX_WORKSPACE_SEARCH_LENGTH) {
        setEligibleSearchError(
          latestHandlersRef.current.staffCopy.assign.errors.searchTooLong,
        );
        return;
      }
      setEligibleSearchError("");
      const trimmed = rawValue.trim();
      const nextQuery: NormalizedWorkspaceEligibleStaffQuery = {
        search: trimmed,
        page: 0,
        size: currentSize,
      };
      setEligibleQuery(nextQuery);
      void executeEligibleStaffLoad(workspaceId, nextQuery);
    },
    [clearPendingEligibleDebounce, executeEligibleStaffLoad],
  );

  const handleEligibleSearchInputChange = (nextValue: string) => {
    setEligibleSearchInput(nextValue);
    if (!detailState.open) {
      return;
    }
    const targetWorkspaceId = detailState.workspaceId;
    if (nextValue.length > MAX_WORKSPACE_SEARCH_LENGTH) {
      clearPendingEligibleDebounce();
      setEligibleSearchError(staffCopy.assign.errors.searchTooLong);
      return;
    }
    if (eligibleSearchError) {
      setEligibleSearchError("");
    }
    clearPendingEligibleDebounce();
    if (searchDebounceMs <= 0) {
      commitEligibleSearch(targetWorkspaceId, nextValue, eligibleQuery.size);
      return;
    }
    eligibleDebounceTimerRef.current = setTimeout(() => {
      eligibleDebounceTimerRef.current = null;
      if (openWorkspaceIdRef.current === targetWorkspaceId) {
        commitEligibleSearch(targetWorkspaceId, nextValue, eligibleQuery.size);
      }
    }, searchDebounceMs);
  };

  const handleEligibleSearchFormSubmit = (event: {
    preventDefault: () => void;
  }) => {
    event.preventDefault();
    if (!detailState.open) {
      return;
    }
    commitEligibleSearch(
      detailState.workspaceId,
      eligibleSearchInput,
      eligibleQuery.size,
    );
  };

  const handleClearEligibleSearch = () => {
    if (!detailState.open) {
      return;
    }
    clearPendingEligibleDebounce();
    setEligibleSearchInput("");
    setEligibleSearchError("");
    const nextQuery: NormalizedWorkspaceEligibleStaffQuery = {
      search: "",
      page: 0,
      size: eligibleQuery.size,
    };
    setEligibleQuery(nextQuery);
    void executeEligibleStaffLoad(detailState.workspaceId, nextQuery);
  };

  const handleEligiblePageChange = (nextZeroBasedPage: number) => {
    if (
      !detailState.open ||
      nextZeroBasedPage < 0 ||
      nextZeroBasedPage === eligibleQuery.page
    ) {
      return;
    }
    clearPendingEligibleDebounce();
    setEligibleSearchInput(eligibleQuery.search);
    setEligibleSearchError("");
    const nextQuery: NormalizedWorkspaceEligibleStaffQuery = {
      search: eligibleQuery.search,
      page: nextZeroBasedPage,
      size: eligibleQuery.size,
    };
    setEligibleQuery(nextQuery);
    void executeEligibleStaffLoad(detailState.workspaceId, nextQuery);
  };

  const handleEligiblePageSizeChange = (nextSize: number) => {
    if (!detailState.open) {
      return;
    }
    clearPendingEligibleDebounce();
    const trimmed = eligibleSearchInput.trim();
    setEligibleSearchError("");
    const nextQuery: NormalizedWorkspaceEligibleStaffQuery = {
      search:
        trimmed.length <= MAX_WORKSPACE_SEARCH_LENGTH
          ? trimmed
          : eligibleQuery.search,
      page: 0,
      size: nextSize,
    };
    setEligibleQuery(nextQuery);
    void executeEligibleStaffLoad(detailState.workspaceId, nextQuery);
  };

  const handleRetryOrRefreshEligible = () => {
    if (!detailState.open) {
      return;
    }
    clearPendingEligibleDebounce();
    const trimmed = eligibleSearchInput.trim();
    if (
      eligibleSearchInput.length <= MAX_WORKSPACE_SEARCH_LENGTH &&
      trimmed !== eligibleQuery.search
    ) {
      const nextQuery: NormalizedWorkspaceEligibleStaffQuery = {
        search: trimmed,
        page: 0,
        size: eligibleQuery.size,
      };
      setEligibleQuery(nextQuery);
      void executeEligibleStaffLoad(detailState.workspaceId, nextQuery);
      return;
    }
    void executeEligibleStaffLoad(detailState.workspaceId, eligibleQuery);
  };

  const handleSelectEligibleStaff = (candidate: WorkspaceEligibleStaffItem) => {
    setSelectedStaffId(candidate.id);
    setKnownStaffLoginsById((prev) => {
      if (prev.get(candidate.id) === candidate.loginName) {
        return prev;
      }
      const next = new Map(prev);
      next.set(candidate.id, candidate.loginName);
      return next;
    });
    if (staffBanner?.kind === "validation") {
      setStaffBanner(null);
    }
  };

  const handleReloadAssignmentsAfterConflict = async () => {
    if (!detailState.open || isAssigning || isReloadingStaffStatus) {
      return;
    }
    const targetWorkspaceId = detailState.workspaceId;
    const reqId = assignmentsRequestSeqRef.current + 1;
    assignmentsRequestSeqRef.current = reqId;
    assignmentsAbortRef.current?.abort();
    const controller = new AbortController();
    assignmentsAbortRef.current = controller;
    setIsReloadingStaffStatus(true);

    const nextQuery = { page: 0, size: assignmentsQuery.size };
    setAssignmentsQuery(nextQuery);

    try {
      const freshAssignments =
        await latestHandlersRef.current.loadStaffAssignments(
          targetWorkspaceId,
          nextQuery,
          { signal: controller.signal },
        );
      if (
        assignmentsRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      applyConfirmedAssignmentsPage(targetWorkspaceId, freshAssignments);
      setAssignmentsState({
        status: "ready",
        pageData: freshAssignments,
      });
      setStaffBanner({
        kind: "info",
        message:
          latestHandlersRef.current.staffCopy.assign.notices
            .reloadedVersionNotice,
      });
      void refreshWorkspaceDetail(targetWorkspaceId);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      if (
        isAbortError(err) ||
        assignmentsRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          setAssignmentsState({ status: "not_found", pageData: null });
          setStaffBanner({
            kind: "not_found",
            message:
              latestHandlersRef.current.staffCopy.assign.errors.notFoundAssign,
          });
          return;
        }
        if (err.code === "FORBIDDEN") {
          setAssignmentsState({ status: "forbidden", pageData: null });
          setStaffBanner({
            kind: "forbidden",
            message:
              latestHandlersRef.current.staffCopy.assign.errors.forbiddenAssign,
          });
          return;
        }
      }
      setStaffBanner({
        kind: "network",
        message:
          latestHandlersRef.current.staffCopy.assign.errors.assignUnavailable,
      });
    } finally {
      if (
        assignmentsRequestSeqRef.current === reqId &&
        openWorkspaceIdRef.current === targetWorkspaceId
      ) {
        setIsReloadingStaffStatus(false);
      }
    }
  };

  const handleReloadStatusAfterAssignDisconnect = async () => {
    if (!detailState.open || isAssigning || isReloadingStaffStatus) {
      return;
    }
    const targetWorkspaceId = detailState.workspaceId;
    const reqId = assignmentsRequestSeqRef.current + 1;
    assignmentsRequestSeqRef.current = reqId;
    assignmentsAbortRef.current?.abort();
    const controller = new AbortController();
    assignmentsAbortRef.current = controller;
    setIsReloadingStaffStatus(true);

    const nextQuery = { page: 0, size: assignmentsQuery.size };
    setAssignmentsQuery(nextQuery);

    try {
      const freshAssignments =
        await latestHandlersRef.current.loadStaffAssignments(
          targetWorkspaceId,
          nextQuery,
          { signal: controller.signal },
        );
      if (
        assignmentsRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      applyConfirmedAssignmentsPage(targetWorkspaceId, freshAssignments);
      setAssignmentsState({
        status: "ready",
        pageData: freshAssignments,
      });
      void refreshWorkspaceDetail(targetWorkspaceId);
      setReloadNonce((n) => n + 1);

      const isSelectedNowOnFirstPage =
        Boolean(selectedStaffId) &&
        freshAssignments.items.some((i) => i.staffId === selectedStaffId);
      setStaffBanner({
        kind: "info",
        message: isSelectedNowOnFirstPage
          ? latestHandlersRef.current.staffCopy.assign.notices
              .reconnectedAssignedNotice
          : latestHandlersRef.current.staffCopy.assign.notices
              .reconnectedNotConfirmedNotice,
      });
    } catch (err) {
      if (
        isAbortError(err) ||
        assignmentsRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          setAssignmentsState({ status: "not_found", pageData: null });
          setStaffBanner({
            kind: "not_found",
            message:
              latestHandlersRef.current.staffCopy.assign.errors.notFoundAssign,
          });
          return;
        }
      }
      setStaffBanner({
        kind: "network",
        message:
          latestHandlersRef.current.staffCopy.assign.errors.assignUnavailable,
      });
    } finally {
      if (
        assignmentsRequestSeqRef.current === reqId &&
        openWorkspaceIdRef.current === targetWorkspaceId
      ) {
        setIsReloadingStaffStatus(false);
      }
    }
  };

  const handleAssignStaffSubmit = async () => {
    if (
      isAssigningRef.current ||
      isReloadingStaffStatus ||
      !detailState.open ||
      assignmentsState.status !== "ready" ||
      assignmentsState.pageData === null
    ) {
      return;
    }

    if (!selectedStaffId) {
      setStaffBanner({
        kind: "validation",
        message: staffCopy.assign.errors.staffSelectionRequired,
      });
      return;
    }

    const targetWorkspaceId = detailState.workspaceId;
    const targetStaffId = selectedStaffId;
    const submittedVersion = assignmentsState.pageData.workspaceVersion;

    const reqId = assignRequestSeqRef.current + 1;
    assignRequestSeqRef.current = reqId;
    assignAbortRef.current?.abort();
    const controller = new AbortController();
    assignAbortRef.current = controller;
    isAssigningRef.current = true;
    setIsAssigning(true);
    setStaffBanner(null);

    try {
      const result = await latestHandlersRef.current.assignStaff(
        targetWorkspaceId,
        {
          staffId: targetStaffId,
          version: submittedVersion,
        },
        { signal: controller.signal },
      );

      if (
        assignRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }

      isAssigningRef.current = false;
      setIsAssigning(false);

      const wasAlreadyActiveNoop =
        result.workspaceVersion === submittedVersion;

      confirmedAssignmentsVersionRef.current = result.workspaceVersion;
      if (result.assigned) {
        setConfirmedAssignedStaffIds((prev) => {
          const next = new Set(prev);
          next.add(result.staffId);
          return next;
        });
      }

      observeWorkspaceVersion(targetWorkspaceId, result.workspaceVersion);

      setHistoryState({ status: "loading", pageData: null });
      setHistoryQuery((prev) => ({ page: 0, size: prev.size }));

      setStaffBanner({
        kind: "info",
        message: wasAlreadyActiveNoop
          ? latestHandlersRef.current.staffCopy.assign.notices
              .alreadyAssignedNoop
          : latestHandlersRef.current.staffCopy.assign.notices.assignedSuccess,
      });

      const refreshedAssignmentsQuery = {
        page: 0,
        size: assignmentsQuery.size,
      };
      setAssignmentsQuery(refreshedAssignmentsQuery);
      void executeAssignmentsLoad(
        targetWorkspaceId,
        refreshedAssignmentsQuery,
        result.assigned ? result.staffId : undefined,
      );

      if (!wasAlreadyActiveNoop) {
        setReloadNonce((n) => n + 1);
      }
    } catch (err) {
      if (
        isAbortError(err) ||
        assignRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }

      isAssigningRef.current = false;
      setIsAssigning(false);

      const errs = latestHandlersRef.current.staffCopy.assign.errors;
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "CONFLICT") {
          setStaffBanner({
            kind: "conflict_stale",
            message: errs.staleVersionConflict,
          });
          return;
        }
        if (err.code === "FORBIDDEN") {
          setStaffBanner({
            kind: "forbidden",
            message: errs.forbiddenAssign,
          });
          return;
        }
        if (err.code === "CSRF_REJECTED") {
          setStaffBanner({
            kind: "csrf",
            message: errs.csrfRejected,
          });
          return;
        }
        if (err.code === "NOT_FOUND") {
          setStaffBanner({
            kind: "not_found",
            message: errs.notFoundAssign,
          });
          return;
        }
        if (err.code === "VALIDATION_ERROR") {
          setStaffBanner({
            kind: "ineligible",
            message: errs.ineligibleOrInvalid,
          });
          return;
        }
      }

      setStaffBanner({
        kind: "network",
        message: errs.assignUnavailable,
      });
    }
  };

  const handleHistoryPageChange = (nextZeroBasedPage: number) => {
    if (
      !detailState.open ||
      nextZeroBasedPage < 0 ||
      nextZeroBasedPage === historyQuery.page
    ) {
      return;
    }
    const nextQuery = {
      page: nextZeroBasedPage,
      size: historyQuery.size,
    };
    setHistoryQuery(nextQuery);
    void executeHistoryLoad(detailState.workspaceId, nextQuery);
  };

  const handleHistoryPageSizeChange = (nextSize: number) => {
    if (!detailState.open) {
      return;
    }
    const nextQuery = {
      page: 0,
      size: nextSize,
    };
    setHistoryQuery(nextQuery);
    void executeHistoryLoad(detailState.workspaceId, nextQuery);
  };

  const handleRetryOrRefreshHistory = () => {
    if (!detailState.open) {
      return;
    }
    void executeHistoryLoad(detailState.workspaceId, historyQuery);
  };

  const toggleHistoryItemExpanded = (eventId: string) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const mapMetadataFieldMessage = useCallback(
    (code: WorkspaceMetadataValidationCode): string => {
      const errs = latestHandlersRef.current.editCopy.errors;
      switch (code) {
        case "ENTERPRISE_NAME_REQUIRED":
          return errs.enterpriseNameRequired;
        case "ENTERPRISE_NAME_TOO_LONG":
          return errs.enterpriseNameTooLong;
        case "CONTACT_NAME_REQUIRED":
          return errs.contactNameRequired;
        case "CONTACT_NAME_TOO_LONG":
          return errs.contactNameTooLong;
        case "CONTACT_EMAIL_REQUIRED":
          return errs.contactEmailRequired;
        case "CONTACT_EMAIL_TOO_LONG":
          return errs.contactEmailTooLong;
        case "CONTACT_EMAIL_INVALID":
          return errs.contactEmailInvalid;
        case "CONTACT_PHONE_TOO_LONG":
          return errs.contactPhoneTooLong;
        default:
          return errs.validationFailed;
      }
    },
    [],
  );

  const handleStartEdit = () => {
    if (
      !detailState.open ||
      detailState.status !== "ready" ||
      !detailState.detail ||
      isPreparingEdit
    ) {
      return;
    }
    historyAbortRef.current?.abort();
    historyRequestSeqRef.current += 1;
    setViewNotice("");
    setDetailRefreshError("");

    const currentDetail = loadedDetailRef.current ?? detailState.detail;
    const latestKnown = knownWorkspaceVersionRef.current;
    if (latestKnown !== null && latestKnown > currentDetail.version) {
      lastRefreshIntentEditRef.current = true;
      void refreshWorkspaceDetail(detailState.workspaceId, {
        openEditWhenReady: true,
      });
      return;
    }

    detailSyncAbortRef.current?.abort();
    detailSyncAbortRef.current = null;
    detailSyncSeqRef.current += 1;
    isRefreshingDetailRef.current = false;
    setIsRefreshingDetail(false);
    lastRefreshIntentEditRef.current = false;
    setEditFieldErrors({});
    setEditBanner(null);
    setEditBaseVersion(currentDetail.version);
    setEditDraft(draftFromItem(currentDetail));
    modalModeRef.current = "edit";
    setModalMode("edit");
  };

  const handleCancelEdit = () => {
    if (isSaving) {
      return;
    }
    modalModeRef.current = "view";
    setModalMode("view");
    setEditFieldErrors({});
    setEditBanner(null);
  };

  const handleDraftFieldChange = (
    field: keyof EditFormDraft,
    value: string,
  ) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
    if (editFieldErrors[field]) {
      setEditFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleReloadCurrentIntoEdit = async () => {
    if (!detailState.open || isSaving || isInspectingCurrent) {
      return;
    }
    const targetWorkspaceId = detailState.workspaceId;
    const reqId = detailRequestSeqRef.current + 1;
    detailRequestSeqRef.current = reqId;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setIsInspectingCurrent(true);

    try {
      const fresh = await latestHandlersRef.current.loadDetail(
        targetWorkspaceId,
        { signal: controller.signal },
      );
      if (
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      const authoritative =
        commitCompleteWorkspaceDetail(targetWorkspaceId, fresh) ?? fresh;
      setEditBaseVersion(authoritative.version);
      setEditDraft(draftFromItem(authoritative));
      setEditFieldErrors({});
      setEditBanner({
        kind: "info",
        message: latestHandlersRef.current.editCopy.reloadedCurrentNotice,
      });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      if (
        isAbortError(err) ||
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          resetModalSubStates();
          setDetailState({
            open: true,
            workspaceId: targetWorkspaceId,
            fallbackTitle: detailState.fallbackTitle,
            status: "not_found",
            detail: null,
          });
          setReloadNonce((n) => n + 1);
          return;
        }
        if (err.code === "FORBIDDEN") {
          setEditBanner({
            kind: "forbidden",
            message: latestHandlersRef.current.editCopy.errors.forbiddenUpdate,
          });
          return;
        }
      }
      setEditBanner({
        kind: "reload_failed",
        message: latestHandlersRef.current.editCopy.errors.reloadCurrentFailed,
      });
    } finally {
      if (
        detailRequestSeqRef.current === reqId &&
        openWorkspaceIdRef.current === targetWorkspaceId
      ) {
        setIsInspectingCurrent(false);
      }
    }
  };

  const handleCheckStatusAfterDisconnect = async () => {
    if (!detailState.open || isSaving || isInspectingCurrent) {
      return;
    }
    const targetWorkspaceId = detailState.workspaceId;
    const reqId = detailRequestSeqRef.current + 1;
    detailRequestSeqRef.current = reqId;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setIsInspectingCurrent(true);

    const normalizedDraftPhone =
      editDraft.contactPhone.trim().length > 0
        ? editDraft.contactPhone.trim()
        : null;

    try {
      const fresh = await latestHandlersRef.current.loadDetail(
        targetWorkspaceId,
        { signal: controller.signal },
      );
      if (
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      const authoritative =
        commitCompleteWorkspaceDetail(targetWorkspaceId, fresh) ?? fresh;

      if (authoritative.version === editBaseVersion) {
        setEditBanner({
          kind: "info",
          message: latestHandlersRef.current.editCopy.reconnectedUnchangedNotice,
        });
        return;
      }

      const matchesSubmittedDraft =
        authoritative.enterpriseName === editDraft.enterpriseName.trim() &&
        authoritative.contactName === editDraft.contactName.trim() &&
        authoritative.contactEmail === editDraft.contactEmail.trim() &&
        (authoritative.contactPhone ?? null) === normalizedDraftPhone;

      setReloadNonce((n) => n + 1);

      if (matchesSubmittedDraft) {
        modalModeRef.current = "view";
        setModalMode("view");
        setEditFieldErrors({});
        setEditBanner(null);
        setViewNotice(latestHandlersRef.current.editCopy.savedNotice);
        return;
      }

      setEditBanner({
        kind: "conflict_stale",
        message: latestHandlersRef.current.editCopy.errors.staleVersionConflict,
      });
    } catch (err) {
      if (
        isAbortError(err) ||
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          resetModalSubStates();
          setDetailState({
            open: true,
            workspaceId: targetWorkspaceId,
            fallbackTitle: detailState.fallbackTitle,
            status: "not_found",
            detail: null,
          });
          setReloadNonce((n) => n + 1);
          return;
        }
      }
      setEditBanner({
        kind: "network",
        message: latestHandlersRef.current.editCopy.errors.saveUnavailable,
      });
    } finally {
      if (
        detailRequestSeqRef.current === reqId &&
        openWorkspaceIdRef.current === targetWorkspaceId
      ) {
        setIsInspectingCurrent(false);
      }
    }
  };

  const handleEditFormSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (
      isSavingRef.current ||
      isInspectingCurrent ||
      !detailState.open ||
      detailState.status !== "ready" ||
      !detailState.detail
    ) {
      return;
    }

    setEditFieldErrors({});
    setEditBanner(null);

    const validation = validateWorkspaceMetadataInput({
      version: editBaseVersion,
      enterpriseName: editDraft.enterpriseName,
      contactName: editDraft.contactName,
      contactEmail: editDraft.contactEmail,
      contactPhone: editDraft.contactPhone,
    });

    if (!validation.ok) {
      const mappedFields: Partial<Record<WorkspaceMetadataField, string>> = {};
      for (const key of Object.keys(
        validation.fieldErrors,
      ) as WorkspaceMetadataField[]) {
        const code = validation.fieldErrors[key];
        if (code) {
          mappedFields[key] = mapMetadataFieldMessage(code);
        }
      }
      setEditFieldErrors(mappedFields);
      return;
    }

    const targetWorkspaceId = detailState.workspaceId;
    const reqId = detailRequestSeqRef.current + 1;
    detailRequestSeqRef.current = reqId;
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const updated = await latestHandlersRef.current.saveMetadata(
        targetWorkspaceId,
        validation.payload,
        { signal: controller.signal },
      );

      setReloadNonce((n) => n + 1);

      if (
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }

      isSavingRef.current = false;
      setIsSaving(false);
      modalModeRef.current = "view";
      setModalMode("view");
      setEditFieldErrors({});
      setEditBanner(null);
      setHistoryState({ status: "loading", pageData: null });
      setHistoryQuery((prev) => ({ page: 0, size: prev.size }));
      setViewNotice(latestHandlersRef.current.editCopy.savedNotice);
      commitCompleteWorkspaceDetail(targetWorkspaceId, updated);
    } catch (err) {
      if (
        isAbortError(err) ||
        detailRequestSeqRef.current !== reqId ||
        controller.signal.aborted ||
        openWorkspaceIdRef.current !== targetWorkspaceId
      ) {
        return;
      }

      isSavingRef.current = false;
      setIsSaving(false);

      const errs = latestHandlersRef.current.editCopy.errors;
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          resetModalSubStates();
          setDetailState({
            open: true,
            workspaceId: targetWorkspaceId,
            fallbackTitle: detailState.fallbackTitle,
            status: "not_found",
            detail: null,
          });
          setReloadNonce((n) => n + 1);
          return;
        }
        if (err.code === "FORBIDDEN") {
          setEditBanner({
            kind: "forbidden",
            message: errs.forbiddenUpdate,
          });
          return;
        }
        if (err.code === "CSRF_REJECTED") {
          setEditBanner({
            kind: "csrf",
            message: errs.csrfRejected,
          });
          return;
        }
        if (err.code === "VALIDATION_ERROR") {
          setEditBanner({
            kind: "validation",
            message: errs.validationFailed,
          });
          return;
        }
        if (err.code === "CONFLICT") {
          const reason = classifyWorkspaceConflict(err.detail);
          if (reason === "STALE_VERSION") {
            setEditBanner({
              kind: "conflict_stale",
              message: errs.staleVersionConflict,
            });
            return;
          }
          if (reason === "DUPLICATE_NAME") {
            setEditFieldErrors({ enterpriseName: errs.duplicateNameConflict });
            setEditBanner({
              kind: "conflict_duplicate",
              message: errs.duplicateNameConflict,
            });
            return;
          }
          setEditBanner({
            kind: "conflict_generic",
            message: errs.genericConflict,
          });
          return;
        }
      }

      setEditBanner({
        kind: "network",
        message: errs.saveUnavailable,
      });
    }
  };

  const executeLoad = useCallback(
    async (targetQuery: NormalizedWorkspaceListQuery) => {
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;

      setStatus("loading");

      try {
        const result = await latestHandlersRef.current.loadPage(targetQuery, {
          signal: controller.signal,
        });
        if (requestSeqRef.current !== requestId || controller.signal.aborted) {
          return;
        }
        if (
          result.items.length === 0 &&
          result.totalElements > 0 &&
          result.totalPages > 0 &&
          targetQuery.page >= result.totalPages
        ) {
          setQuery((prev) => ({
            ...prev,
            page: Math.max(0, result.totalPages - 1),
          }));
          return;
        }
        setPageData(result);
        setLoadedQuery(targetQuery);
        setStatus("ready");
      } catch (err) {
        if (
          isAbortError(err) ||
          requestSeqRef.current !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }
        if (isWorkspaceError(err)) {
          if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
            triggerAuthRedirect(err.code);
            return;
          }
          if (err.code === "FORBIDDEN") {
            setPageData(null);
            setStatus("forbidden");
            return;
          }
          if (err.code === "VALIDATION_ERROR" && err.detail === "SEARCH_TOO_LONG") {
            setSearchError(latestHandlersRef.current.searchTooLongError);
            setStatus("ready");
            return;
          }
        }
        setStatus("error");
      }
    },
    [triggerAuthRedirect],
  );

  useEffect(() => {
    void executeLoad(query);
  }, [executeLoad, query, reloadNonce]);

  useEffect(() => {
    return () => {
      clearPendingDebounce();
      clearPendingEligibleDebounce();
      activeAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      detailSyncAbortRef.current?.abort();
      saveAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      assignmentsAbortRef.current?.abort();
      eligibleAbortRef.current?.abort();
      assignAbortRef.current?.abort();
    };
  }, [clearPendingDebounce, clearPendingEligibleDebounce]);

  const commitSearch = useCallback(
    (rawValue: string) => {
      clearPendingDebounce();
      if (rawValue.length > MAX_WORKSPACE_SEARCH_LENGTH) {
        setSearchError(copy.states.searchTooLongError);
        return;
      }
      setSearchError("");
      const trimmed = rawValue.trim();
      setQuery((prev) => {
        if (prev.search === trimmed && prev.page === 0) {
          return prev;
        }
        return {
          search: trimmed,
          page: 0,
          size: prev.size,
        };
      });
    },
    [clearPendingDebounce, copy.states.searchTooLongError],
  );

  const handleSearchInputChange = (nextValue: string) => {
    setSearchInput(nextValue);
    if (nextValue.length > MAX_WORKSPACE_SEARCH_LENGTH) {
      clearPendingDebounce();
      setSearchError(copy.states.searchTooLongError);
      return;
    }
    if (searchError) {
      setSearchError("");
    }
    clearPendingDebounce();
    if (searchDebounceMs <= 0) {
      commitSearch(nextValue);
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      commitSearch(nextValue);
    }, searchDebounceMs);
  };

  const handleSearchFormSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const trimmed = searchInput.trim();
    clearPendingDebounce();
    if (searchInput.length > MAX_WORKSPACE_SEARCH_LENGTH) {
      setSearchError(copy.states.searchTooLongError);
      return;
    }
    setSearchError("");
    if (query.search === trimmed && query.page === 0) {
      setReloadNonce((n) => n + 1);
      return;
    }
    setQuery((prev) => ({
      search: trimmed,
      page: 0,
      size: prev.size,
    }));
  };

  const handleClearSearch = () => {
    clearPendingDebounce();
    setSearchInput("");
    setSearchError("");
    if (query.search === "" && query.page === 0) {
      if (status === "error") {
        setReloadNonce((n) => n + 1);
      }
      return;
    }
    setQuery((prev) => ({
      search: "",
      page: 0,
      size: prev.size,
    }));
  };

  const handlePageSizeChange = (nextSize: number) => {
    clearPendingDebounce();
    const trimmed = searchInput.trim();
    setSearchError("");
    setQuery({
      search:
        trimmed.length <= MAX_WORKSPACE_SEARCH_LENGTH ? trimmed : query.search,
      page: 0,
      size: nextSize,
    });
  };

  const handlePageChange = (nextZeroBasedPage: number) => {
    if (nextZeroBasedPage < 0 || nextZeroBasedPage === query.page) {
      return;
    }
    clearPendingDebounce();
    setSearchInput(query.search);
    setSearchError("");
    setQuery((prev) => ({
      ...prev,
      page: nextZeroBasedPage,
    }));
  };

  const handleRetryOrRefresh = () => {
    clearPendingDebounce();
    const trimmed = searchInput.trim();
    if (searchInput.length <= MAX_WORKSPACE_SEARCH_LENGTH && trimmed !== query.search) {
      setQuery((prev) => ({
        search: trimmed,
        page: 0,
        size: prev.size,
      }));
      return;
    }
    setReloadNonce((n) => n + 1);
  };

  const isLoading = status === "loading";
  const effectiveSearch = loadedQuery ? loadedQuery.search : query.search;
  const items: readonly WorkspaceDirectoryItem[] =
    status === "ready" && pageData ? pageData.items : [];
  const totalElements = pageData?.totalElements ?? 0;
  const totalPages = pageData?.totalPages ?? 0;
  const currentZeroBasedPage = pageData?.page ?? query.page;
  const currentPageSize = pageData?.size ?? query.size;

  const paginationTokens = useMemo(
    () => buildPaginationTokens(currentZeroBasedPage, totalPages),
    [currentZeroBasedPage, totalPages],
  );

  const rangeText = useMemo(() => {
    if (!pageData || pageData.totalElements === 0 || pageData.items.length === 0) {
      return "";
    }
    const from = pageData.page * pageData.size + 1;
    const to = Math.min(
      pageData.page * pageData.size + pageData.items.length,
      pageData.totalElements,
    );
    const showing = copy.pagination.showingRange
      .replace("{from}", String(from))
      .replace("{to}", String(to))
      .replace("{total}", String(pageData.totalElements));
    const pagePart = copy.pagination.pageStatus
      .replace("{page}", String(pageData.page + 1))
      .replace("{totalPages}", String(Math.max(1, pageData.totalPages)));
    return `${showing} · ${pagePart}`;
  }, [copy.pagination.pageStatus, copy.pagination.showingRange, pageData]);

  const historyPageData = historyState.pageData;
  const historyTotalElements = historyPageData?.totalElements ?? 0;
  const historyTotalPages = historyPageData?.totalPages ?? 0;
  const currentHistoryPage = historyPageData?.page ?? historyQuery.page;
  const currentHistorySize = historyPageData?.size ?? historyQuery.size;
  const isHistoryLoading = historyState.status === "loading";

  const historyPaginationTokens = useMemo(
    () => buildPaginationTokens(currentHistoryPage, historyTotalPages),
    [currentHistoryPage, historyTotalPages],
  );

  const historyRangeText = useMemo(() => {
    if (
      !historyPageData ||
      historyPageData.totalElements === 0 ||
      historyPageData.items.length === 0
    ) {
      return "";
    }
    const from = historyPageData.page * historyPageData.size + 1;
    const to = Math.min(
      historyPageData.page * historyPageData.size + historyPageData.items.length,
      historyPageData.totalElements,
    );
    const showing = historyCopy.showingRange
      .replace("{from}", String(from))
      .replace("{to}", String(to))
      .replace("{total}", String(historyPageData.totalElements));
    const pagePart = copy.pagination.pageStatus
      .replace("{page}", String(historyPageData.page + 1))
      .replace("{totalPages}", String(Math.max(1, historyPageData.totalPages)));
    return `${showing} · ${pagePart}`;
  }, [copy.pagination.pageStatus, historyCopy.showingRange, historyPageData]);

  const assignmentsPageData = assignmentsState.pageData;
  const assignmentsTotalElements = assignmentsPageData?.totalElements ?? 0;
  const assignmentsTotalPages = assignmentsPageData?.totalPages ?? 0;
  const currentAssignmentsPage =
    assignmentsPageData?.page ?? assignmentsQuery.page;
  const currentAssignmentsSize =
    assignmentsPageData?.size ?? assignmentsQuery.size;
  const isAssignmentsLoading = assignmentsState.status === "loading";

  const assignmentsPaginationTokens = useMemo(
    () => buildPaginationTokens(currentAssignmentsPage, assignmentsTotalPages),
    [currentAssignmentsPage, assignmentsTotalPages],
  );

  const assignmentsRangeText = useMemo(() => {
    if (
      !assignmentsPageData ||
      assignmentsPageData.totalElements === 0 ||
      assignmentsPageData.items.length === 0
    ) {
      return "";
    }
    const from = assignmentsPageData.page * assignmentsPageData.size + 1;
    const to = Math.min(
      assignmentsPageData.page * assignmentsPageData.size +
        assignmentsPageData.items.length,
      assignmentsPageData.totalElements,
    );
    const showing = staffCopy.assigned.showingRange
      .replace("{from}", String(from))
      .replace("{to}", String(to))
      .replace("{total}", String(assignmentsPageData.totalElements));
    const pagePart = copy.pagination.pageStatus
      .replace("{page}", String(assignmentsPageData.page + 1))
      .replace(
        "{totalPages}",
        String(Math.max(1, assignmentsPageData.totalPages)),
      );
    return `${showing} · ${pagePart}`;
  }, [
    assignmentsPageData,
    copy.pagination.pageStatus,
    staffCopy.assigned.showingRange,
  ]);

  const eligiblePageData = eligibleState.pageData;
  const eligibleTotalElements = eligiblePageData?.totalElements ?? 0;
  const eligibleTotalPages = eligiblePageData?.totalPages ?? 0;
  const currentEligiblePage = eligiblePageData?.page ?? eligibleQuery.page;
  const currentEligibleSize = eligiblePageData?.size ?? eligibleQuery.size;
  const isEligibleLoading = eligibleState.status === "loading";
  const effectiveEligibleSearch = eligibleLoadedQuery
    ? eligibleLoadedQuery.search
    : eligibleQuery.search;

  const eligiblePaginationTokens = useMemo(
    () => buildPaginationTokens(currentEligiblePage, eligibleTotalPages),
    [currentEligiblePage, eligibleTotalPages],
  );

  const eligibleRangeText = useMemo(() => {
    if (
      !eligiblePageData ||
      eligiblePageData.totalElements === 0 ||
      eligiblePageData.items.length === 0
    ) {
      return "";
    }
    const from = eligiblePageData.page * eligiblePageData.size + 1;
    const to = Math.min(
      eligiblePageData.page * eligiblePageData.size +
        eligiblePageData.items.length,
      eligiblePageData.totalElements,
    );
    const showing = staffCopy.assign.showingRange
      .replace("{from}", String(from))
      .replace("{to}", String(to))
      .replace("{total}", String(eligiblePageData.totalElements));
    const pagePart = copy.pagination.pageStatus
      .replace("{page}", String(eligiblePageData.page + 1))
      .replace(
        "{totalPages}",
        String(Math.max(1, eligiblePageData.totalPages)),
      );
    return `${showing} · ${pagePart}`;
  }, [
    copy.pagination.pageStatus,
    eligiblePageData,
    staffCopy.assign.showingRange,
  ]);

  const renderContactCell = (item: WorkspaceDirectoryItem) => {
    const hasName = item.contactName.trim().length > 0;
    const hasEmail = item.contactEmail.trim().length > 0;
    const hasPhone = Boolean(item.contactPhone && item.contactPhone.trim().length > 0);

    if (!hasName && !hasEmail && !hasPhone) {
      return <span className={styles.muted}>{copy.emptyValue}</span>;
    }

    return (
      <div className={styles.workspaceContactStack}>
        {hasName && (
          <span className={styles.workspaceContactName}>{item.contactName}</span>
        )}
        {hasEmail && (
          <span className={styles.workspaceContactDetail}>{item.contactEmail}</span>
        )}
        {hasPhone && (
          <span className={styles.workspaceContactDetail}>{item.contactPhone}</span>
        )}
      </div>
    );
  };

  const renderDetailValue = (rawValue: string | null | undefined) => {
    const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!trimmed) {
      return <span className={styles.muted}>{copy.emptyValue}</span>;
    }
    return trimmed;
  };

  const renderEditBanner = () => {
    if (!editBanner) {
      return null;
    }
    const isInfo = editBanner.kind === "info";
    const showReloadCurrent =
      editBanner.kind === "conflict_stale" ||
      editBanner.kind === "conflict_generic" ||
      editBanner.kind === "reload_failed";
    const showCheckStatus = editBanner.kind === "network";

    return (
      <div
        className={
          isInfo ? styles.workspaceNoticeBanner : styles.workspaceEditErrorBanner
        }
        role={isInfo ? "status" : "alert"}
      >
        <div className={styles.workspaceBannerRow}>
          {isInfo ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{editBanner.message}</span>
        </div>

        {(showReloadCurrent || showCheckStatus) && (
          <div className={styles.workspaceBannerActions}>
            {showReloadCurrent && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => void handleReloadCurrentIntoEdit()}
                disabled={isSaving || isInspectingCurrent}
                aria-busy={isInspectingCurrent}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>
                  {isInspectingCurrent
                    ? editCopy.reloadingCurrentBtn
                    : editCopy.reloadCurrentBtn}
                </span>
              </button>
            )}

            {showCheckStatus && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => void handleCheckStatusAfterDisconnect()}
                disabled={isSaving || isInspectingCurrent}
                aria-busy={isInspectingCurrent}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>
                  {isInspectingCurrent
                    ? editCopy.checkingStatusBtn
                    : editCopy.checkStatusBtn}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderHistoryMode = () => {
    const historyItems =
      historyState.status === "ready" && historyPageData
        ? historyPageData.items
        : [];

    return (
      <>
        <div
          className={`${styles.onboardingModalBody} ${styles.workspaceDetailBody}`}
        >
          <div className={styles.workspaceHistoryToolbar}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleBackToDetailInfo}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{historyCopy.backToInfoBtn}</span>
            </button>

            <div className={styles.workspaceHistoryMetaGroup}>
              {historyState.status === "ready" && historyPageData && (
                <span className={styles.tabCount}>
                  {historyCopy.totalBadge.replace(
                    "{count}",
                    String(historyTotalElements),
                  )}
                </span>
              )}
              <select
                className={styles.control}
                aria-label={historyCopy.pageSizeAria}
                value={currentHistorySize}
                onChange={(e) =>
                  handleHistoryPageSizeChange(Number(e.target.value))
                }
                disabled={isHistoryLoading}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt} {historyCopy.perPageSuffix}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.button}
                onClick={handleRetryOrRefreshHistory}
                disabled={isHistoryLoading}
                aria-busy={isHistoryLoading}
                aria-label={historyCopy.refreshBtn}
                title={historyCopy.refreshBtn}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {isHistoryLoading && (
            <div
              className={styles.workspaceStateBox}
              role="status"
              aria-live="polite"
            >
              <strong className={styles.workspaceStateTitle}>
                {historyCopy.states.loadingTitle}
              </strong>
              <span className={styles.workspaceStateDesc}>
                {historyCopy.states.loadingDesc}
              </span>
            </div>
          )}

          {historyState.status === "forbidden" && (
            <div className={styles.workspaceStateBox} role="alert">
              <ShieldAlert
                size={22}
                color="var(--high-text)"
                aria-hidden="true"
              />
              <h3 className={styles.workspaceStateTitle}>
                {historyCopy.states.forbiddenTitle}
              </h3>
              <p className={styles.workspaceStateDesc}>
                {historyCopy.states.forbiddenDesc}
              </p>
            </div>
          )}

          {historyState.status === "not_found" && (
            <div className={styles.workspaceStateBox} role="alert">
              <AlertCircle
                size={22}
                color="var(--security-orange)"
                aria-hidden="true"
              />
              <h3 className={styles.workspaceStateTitle}>
                {historyCopy.states.notFoundTitle}
              </h3>
              <p className={styles.workspaceStateDesc}>
                {historyCopy.states.notFoundDesc}
              </p>
            </div>
          )}

          {historyState.status === "error" && (
            <div className={styles.workspaceStateBox} role="alert">
              <AlertCircle
                size={22}
                color="var(--critical-text)"
                aria-hidden="true"
              />
              <h3 className={styles.workspaceStateTitle}>
                {historyCopy.states.errorTitle}
              </h3>
              <p className={styles.workspaceStateDesc}>
                {historyCopy.states.errorDesc}
              </p>
              <div className={styles.workspaceStateActions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleRetryOrRefreshHistory}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>{historyCopy.states.retryBtn}</span>
                </button>
              </div>
            </div>
          )}

          {historyState.status === "ready" && historyItems.length === 0 && (
            <div className={styles.workspaceStateBox}>
              <strong className={styles.workspaceStateTitle}>
                {historyCopy.states.emptyTitle}
              </strong>
              <span className={styles.workspaceStateDesc}>
                {historyCopy.states.emptyDesc}
              </span>
            </div>
          )}

          {historyState.status === "ready" && historyItems.length > 0 && (
            <ul className={styles.workspaceHistoryList}>
              {historyItems.map((eventItem) => {
                const described = describeWorkspaceHistoryEvent(
                  eventItem,
                  detailCopy,
                  knownStaffLoginsById,
                );
                const isExpanded = expandedHistoryIds.has(eventItem.id);

                return (
                  <li key={eventItem.id} className={styles.workspaceHistoryItem}>
                    <div className={styles.workspaceHistoryRowHeader}>
                      <div className={styles.workspaceHistoryHeadingGroup}>
                        <strong className={styles.workspaceHistoryActionTitle}>
                          {described.title}
                        </strong>
                        <span className={styles.workspaceHistoryTime}>
                          {formatWorkspaceTimestamp(
                            eventItem.occurredAt,
                            language,
                            copy.emptyValue,
                          )}
                        </span>
                      </div>

                      <button
                        type="button"
                        className={styles.workspaceHistoryToggleBtn}
                        aria-expanded={isExpanded}
                        onClick={() => toggleHistoryItemExpanded(eventItem.id)}
                      >
                        <span>
                          {isExpanded
                            ? historyCopy.collapseBtn
                            : historyCopy.expandBtn}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={14} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={14} aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    <ul className={styles.workspaceHistorySummaryList}>
                      {described.summaryLines.map((line, idx) => (
                        <li
                          key={idx}
                          className={
                            !isExpanded && described.hasLongChangeText
                              ? styles.workspaceHistorySummaryClamp
                              : styles.workspaceHistorySummaryLine
                          }
                        >
                          {line}
                        </li>
                      ))}
                    </ul>

                    {isExpanded && (
                      <div className={styles.workspaceHistoryDetailBox}>
                        {described.staffAssignmentDetail && (
                          <div className={styles.workspaceHistoryMetaRow}>
                            <span className={styles.workspaceHistoryMetaLabel}>
                              {described.staffAssignmentDetail.label}:
                            </span>
                            {described.staffAssignmentDetail.staffLoginName && (
                              <strong className={styles.workspaceStaffPrimaryLogin}>
                                {described.staffAssignmentDetail.staffLoginName}
                              </strong>
                            )}
                            <code className={styles.workspaceKeyCode}>
                              {described.staffAssignmentDetail.staffId}
                            </code>
                          </div>
                        )}

                        {described.specBlocks &&
                          described.specBlocks.map((block, bIdx) => (
                            <div
                              key={bIdx}
                              className={styles.workspaceHistorySpecSection}
                            >
                              <strong className={styles.workspaceHistorySpecLabel}>
                                {block.label}
                              </strong>
                              {block.before !== undefined ? (
                                <div className={styles.workspaceHistorySpecDiffGrid}>
                                  <div className={styles.workspaceHistorySpecPane}>
                                    <span className={styles.workspaceHistoryMetaLabel}>
                                      {historyCopy.specFields.beforeLabel}
                                    </span>
                                    <p className={styles.workspaceHistorySpecText}>
                                      {block.before ||
                                        historyCopy.specFields.emptyText}
                                    </p>
                                  </div>
                                  <div className={styles.workspaceHistorySpecPane}>
                                    <span className={styles.workspaceHistoryMetaLabel}>
                                      {historyCopy.specFields.afterLabel}
                                    </span>
                                    <p className={styles.workspaceHistorySpecText}>
                                      {block.after ||
                                        historyCopy.specFields.emptyText}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <p className={styles.workspaceHistorySpecText}>
                                  {block.after || historyCopy.specFields.emptyText}
                                </p>
                              )}
                            </div>
                          ))}

                        <div className={styles.workspaceHistoryMetaRow}>
                          <span className={styles.workspaceHistoryMetaLabel}>
                            {historyCopy.actorIdLabel}:
                          </span>
                          <code className={styles.workspaceKeyCode}>
                            {eventItem.actorId}
                          </code>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {historyState.status === "ready" && historyTotalElements > 0 && (
            <div
              className={`${styles.pagination} ${styles.workspaceHistoryPagination}`}
            >
              <span className={styles.paginationInfo}>{historyRangeText}</span>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => handleHistoryPageChange(currentHistoryPage - 1)}
                  disabled={isHistoryLoading || currentHistoryPage <= 0}
                >
                  {copy.pagination.previous}
                </button>

                {historyPaginationTokens.map((token) =>
                  typeof token === "number" ? (
                    <button
                      key={token}
                      type="button"
                      className={`${styles.paginationBtn} ${
                        token === currentHistoryPage
                          ? styles.paginationBtnActive
                          : ""
                      }`}
                      aria-label={copy.pagination.goToPageAria.replace(
                        "{page}",
                        String(token + 1),
                      )}
                      aria-current={
                        token === currentHistoryPage ? "page" : undefined
                      }
                      onClick={() => handleHistoryPageChange(token)}
                      disabled={isHistoryLoading}
                    >
                      {token + 1}
                    </button>
                  ) : (
                    <span
                      key={token}
                      className={styles.workspacePaginationEllipsis}
                      aria-hidden="true"
                    >
                      ...
                    </span>
                  ),
                )}

                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => handleHistoryPageChange(currentHistoryPage + 1)}
                  disabled={
                    isHistoryLoading ||
                    historyTotalPages === 0 ||
                    currentHistoryPage + 1 >= historyTotalPages
                  }
                >
                  {copy.pagination.next}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.onboardingModalFooter}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCloseDetail}
          >
            {detailCopy.closeBtn}
          </button>
        </div>
      </>
    );
  };

  const renderStaffBanner = () => {
    if (!staffBanner) {
      return null;
    }
    const isInfo = staffBanner.kind === "info";
    const showConflictReload = staffBanner.kind === "conflict_stale";
    const showDisconnectReload = staffBanner.kind === "network";
    const showIneligibleRefresh = staffBanner.kind === "ineligible";

    return (
      <div
        className={
          isInfo ? styles.workspaceNoticeBanner : styles.workspaceEditErrorBanner
        }
        role={isInfo ? "status" : "alert"}
      >
        <div className={styles.workspaceBannerRow}>
          {isInfo ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{staffBanner.message}</span>
        </div>

        {(showConflictReload || showDisconnectReload || showIneligibleRefresh) && (
          <div className={styles.workspaceBannerActions}>
            {showConflictReload && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => void handleReloadAssignmentsAfterConflict()}
                disabled={isAssigning || isReloadingStaffStatus}
                aria-busy={isReloadingStaffStatus}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>
                  {isReloadingStaffStatus
                    ? staffCopy.assign.reloadingAssignmentsBtn
                    : staffCopy.assign.reloadAssignmentsBtn}
                </span>
              </button>
            )}

            {showDisconnectReload && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => void handleReloadStatusAfterAssignDisconnect()}
                disabled={isAssigning || isReloadingStaffStatus}
                aria-busy={isReloadingStaffStatus}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>
                  {isReloadingStaffStatus
                    ? staffCopy.assign.reloadingCurrentStatusBtn
                    : staffCopy.assign.reloadCurrentStatusBtn}
                </span>
              </button>
            )}

            {showIneligibleRefresh && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  handleRetryOrRefreshEligible();
                  handleRetryOrRefreshAssignments();
                }}
                disabled={isAssigning || isReloadingStaffStatus}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{staffCopy.assign.refreshEligibleBtn}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStaffMode = () => {
    const assignedItems =
      assignmentsState.status === "ready" && assignmentsPageData
        ? assignmentsPageData.items
        : [];
    const eligibleItems =
      eligibleState.status === "ready" && eligiblePageData
        ? eligiblePageData.items
        : [];
    const hasLoadedAssignmentVersion =
      assignmentsState.status === "ready" && assignmentsPageData !== null;
    const canAssignNow =
      hasLoadedAssignmentVersion &&
      Boolean(selectedStaffId) &&
      !isAssigning &&
      !isReloadingStaffStatus;

    return (
      <>
        <div
          className={`${styles.onboardingModalBody} ${styles.workspaceDetailBody}`}
        >
          <div className={styles.workspaceHistoryToolbar}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleBackToDetailInfo}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{staffCopy.backToInfoBtn}</span>
            </button>

            <div className={styles.workspaceHistoryMetaGroup}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleOpenHistory}
              >
                <History size={14} aria-hidden="true" />
                <span>{historyCopy.openBtn}</span>
              </button>
            </div>
          </div>

          {renderStaffBanner()}

          <section className={styles.onboardingFormSection}>
            <div className={styles.workspaceStaffSectionHeader}>
              <h3 className={styles.onboardingFormSectionTitle}>
                <Users
                  size={15}
                  style={{ color: "var(--security-blue)" }}
                  aria-hidden="true"
                />
                <span>{staffCopy.assigned.sectionTitle}</span>
              </h3>

              <div className={styles.workspaceStaffSectionControls}>
                {assignmentsState.status === "ready" && assignmentsPageData && (
                  <span className={styles.tabCount}>
                    {staffCopy.assigned.totalBadge.replace(
                      "{count}",
                      String(assignmentsTotalElements),
                    )}
                  </span>
                )}
                <select
                  className={styles.control}
                  aria-label={staffCopy.assigned.pageSizeAria}
                  value={currentAssignmentsSize}
                  onChange={(e) =>
                    handleAssignmentsPageSizeChange(Number(e.target.value))
                  }
                  disabled={isAssignmentsLoading}
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt} {staffCopy.assigned.perPageSuffix}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.button}
                  onClick={handleRetryOrRefreshAssignments}
                  disabled={isAssignmentsLoading}
                  aria-busy={isAssignmentsLoading}
                  aria-label={staffCopy.assigned.refreshBtn}
                  title={staffCopy.assigned.refreshBtn}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {isAssignmentsLoading && (
              <div
                className={styles.workspaceStateBox}
                role="status"
                aria-live="polite"
              >
                <strong className={styles.workspaceStateTitle}>
                  {staffCopy.assigned.states.loadingTitle}
                </strong>
                <span className={styles.workspaceStateDesc}>
                  {staffCopy.assigned.states.loadingDesc}
                </span>
              </div>
            )}

            {assignmentsState.status === "forbidden" && (
              <div className={styles.workspaceStateBox} role="alert">
                <ShieldAlert
                  size={22}
                  color="var(--high-text)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assigned.states.forbiddenTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assigned.states.forbiddenDesc}
                </p>
              </div>
            )}

            {assignmentsState.status === "not_found" && (
              <div className={styles.workspaceStateBox} role="alert">
                <AlertCircle
                  size={22}
                  color="var(--security-orange)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assigned.states.notFoundTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assigned.states.notFoundDesc}
                </p>
              </div>
            )}

            {assignmentsState.status === "error" && (
              <div className={styles.workspaceStateBox} role="alert">
                <AlertCircle
                  size={22}
                  color="var(--critical-text)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assigned.states.errorTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assigned.states.errorDesc}
                </p>
                <div className={styles.workspaceStateActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleRetryOrRefreshAssignments}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>{staffCopy.assigned.states.retryBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {assignmentsState.status === "ready" && assignedItems.length === 0 && (
              <div className={styles.workspaceStateBox}>
                <strong className={styles.workspaceStateTitle}>
                  {staffCopy.assigned.states.emptyTitle}
                </strong>
                <span className={styles.workspaceStateDesc}>
                  {staffCopy.assigned.states.emptyDesc}
                </span>
              </div>
            )}

            {assignmentsState.status === "ready" && assignedItems.length > 0 && (
              <ul className={styles.workspaceStaffList}>
                {assignedItems.map((assignment) => {
                  const exactKnownLogin = knownStaffLoginsById.get(
                    assignment.staffId,
                  );
                  return (
                    <li
                      key={assignment.staffId}
                      className={styles.workspaceStaffAssignedRow}
                    >
                      <div className={styles.workspaceStaffIdentityBlock}>
                        {exactKnownLogin && (
                          <strong className={styles.workspaceStaffPrimaryLogin}>
                            {exactKnownLogin}
                          </strong>
                        )}
                        <span className={styles.workspaceStaffIdLine}>
                          <span>{staffCopy.assigned.staffIdLabel}:</span>
                          <code className={styles.workspaceKeyCode}>
                            {assignment.staffId}
                          </code>
                        </span>
                      </div>
                      <div className={styles.workspaceStaffTimeBlock}>
                        <span>{staffCopy.assigned.assignedAtLabel}</span>
                        <span>
                          {formatWorkspaceTimestamp(
                            assignment.assignedAt,
                            language,
                            copy.emptyValue,
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {assignmentsState.status === "ready" &&
              assignmentsTotalElements > 0 && (
                <div
                  className={`${styles.pagination} ${styles.workspaceHistoryPagination}`}
                >
                  <span className={styles.paginationInfo}>
                    {assignmentsRangeText}
                  </span>
                  <div className={styles.paginationControls}>
                    <button
                      type="button"
                      className={styles.paginationBtn}
                      onClick={() =>
                        handleAssignmentsPageChange(currentAssignmentsPage - 1)
                      }
                      disabled={
                        isAssignmentsLoading || currentAssignmentsPage <= 0
                      }
                    >
                      {copy.pagination.previous}
                    </button>

                    {assignmentsPaginationTokens.map((token) =>
                      typeof token === "number" ? (
                        <button
                          key={token}
                          type="button"
                          className={`${styles.paginationBtn} ${
                            token === currentAssignmentsPage
                              ? styles.paginationBtnActive
                              : ""
                          }`}
                          aria-label={copy.pagination.goToPageAria.replace(
                            "{page}",
                            String(token + 1),
                          )}
                          aria-current={
                            token === currentAssignmentsPage ? "page" : undefined
                          }
                          onClick={() => handleAssignmentsPageChange(token)}
                          disabled={isAssignmentsLoading}
                        >
                          {token + 1}
                        </button>
                      ) : (
                        <span
                          key={token}
                          className={styles.workspacePaginationEllipsis}
                          aria-hidden="true"
                        >
                          ...
                        </span>
                      ),
                    )}

                    <button
                      type="button"
                      className={styles.paginationBtn}
                      onClick={() =>
                        handleAssignmentsPageChange(currentAssignmentsPage + 1)
                      }
                      disabled={
                        isAssignmentsLoading ||
                        assignmentsTotalPages === 0 ||
                        currentAssignmentsPage + 1 >= assignmentsTotalPages
                      }
                    >
                      {copy.pagination.next}
                    </button>
                  </div>
                </div>
              )}
          </section>

          <section className={styles.onboardingFormSection}>
            <div className={styles.workspaceStaffSectionHeader}>
              <h3 className={styles.onboardingFormSectionTitle}>
                <UserPlus
                  size={15}
                  style={{ color: "var(--security-blue)" }}
                  aria-hidden="true"
                />
                <span>{staffCopy.assign.sectionTitle}</span>
              </h3>

              <div className={styles.workspaceStaffSectionControls}>
                {eligibleState.status === "ready" && eligiblePageData && (
                  <span className={styles.tabCount}>
                    {staffCopy.assign.totalBadge.replace(
                      "{count}",
                      String(eligibleTotalElements),
                    )}
                  </span>
                )}
                <select
                  className={styles.control}
                  aria-label={staffCopy.assign.pageSizeAria}
                  value={currentEligibleSize}
                  onChange={(e) =>
                    handleEligiblePageSizeChange(Number(e.target.value))
                  }
                  disabled={isEligibleLoading}
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt} {staffCopy.assign.perPageSuffix}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.button}
                  onClick={handleRetryOrRefreshEligible}
                  disabled={isEligibleLoading}
                  aria-busy={isEligibleLoading}
                  aria-label={staffCopy.assign.refreshEligibleBtn}
                  title={staffCopy.assign.refreshEligibleBtn}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            <p className={styles.workspaceStaffSectionHint}>
              {staffCopy.assign.sectionHint}
            </p>

            <form
              className={styles.workspaceStaffSearchRow}
              onSubmit={handleEligibleSearchFormSubmit}
              role="search"
            >
              <div className={styles.onboardingSearchBox}>
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  name="eligibleStaffSearch"
                  className={`${styles.onboardingSearchInput} ${styles.searchInput}`}
                  aria-label={staffCopy.assign.searchLabel}
                  placeholder={staffCopy.assign.searchPlaceholder}
                  value={eligibleSearchInput}
                  maxLength={MAX_WORKSPACE_SEARCH_LENGTH}
                  onChange={(e) => handleEligibleSearchInputChange(e.target.value)}
                  aria-invalid={Boolean(eligibleSearchError)}
                />
              </div>

              {(eligibleSearchInput.length > 0 ||
                eligibleQuery.search.length > 0) && (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleClearEligibleSearch}
                >
                  <X size={14} aria-hidden="true" />
                  <span>{staffCopy.assign.clearSearchBtn}</span>
                </button>
              )}
            </form>

            {eligibleSearchError && (
              <div className={styles.workspaceInlineError} role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{eligibleSearchError}</span>
              </div>
            )}

            {isEligibleLoading && (
              <div
                className={styles.workspaceStateBox}
                role="status"
                aria-live="polite"
              >
                <strong className={styles.workspaceStateTitle}>
                  {staffCopy.assign.states.loadingTitle}
                </strong>
                <span className={styles.workspaceStateDesc}>
                  {staffCopy.assign.states.loadingDesc}
                </span>
              </div>
            )}

            {eligibleState.status === "forbidden" && (
              <div className={styles.workspaceStateBox} role="alert">
                <ShieldAlert
                  size={22}
                  color="var(--high-text)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assign.states.forbiddenTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assign.states.forbiddenDesc}
                </p>
              </div>
            )}

            {eligibleState.status === "not_found" && (
              <div className={styles.workspaceStateBox} role="alert">
                <AlertCircle
                  size={22}
                  color="var(--security-orange)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assign.states.notFoundTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assign.states.notFoundDesc}
                </p>
              </div>
            )}

            {eligibleState.status === "error" && (
              <div className={styles.workspaceStateBox} role="alert">
                <AlertCircle
                  size={22}
                  color="var(--critical-text)"
                  aria-hidden="true"
                />
                <h4 className={styles.workspaceStateTitle}>
                  {staffCopy.assign.states.errorTitle}
                </h4>
                <p className={styles.workspaceStateDesc}>
                  {staffCopy.assign.states.errorDesc}
                </p>
                <div className={styles.workspaceStateActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleRetryOrRefreshEligible}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>{staffCopy.assign.states.retryBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {eligibleState.status === "ready" &&
              eligibleItems.length === 0 &&
              effectiveEligibleSearch === "" && (
                <div className={styles.workspaceStateBox}>
                  <strong className={styles.workspaceStateTitle}>
                    {staffCopy.assign.states.emptyTitle}
                  </strong>
                  <span className={styles.workspaceStateDesc}>
                    {staffCopy.assign.states.emptyDesc}
                  </span>
                </div>
              )}

            {eligibleState.status === "ready" &&
              eligibleItems.length === 0 &&
              effectiveEligibleSearch !== "" && (
                <div className={styles.workspaceStateBox}>
                  <strong className={styles.workspaceStateTitle}>
                    {staffCopy.assign.states.noMatchesTitle}
                  </strong>
                  <span className={styles.workspaceStateDesc}>
                    {staffCopy.assign.states.noMatchesDesc.replace(
                      "{query}",
                      effectiveEligibleSearch,
                    )}
                  </span>
                  <div className={styles.workspaceStateActions}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={handleClearEligibleSearch}
                    >
                      <X size={14} aria-hidden="true" />
                      <span>{staffCopy.assign.clearSearchBtn}</span>
                    </button>
                  </div>
                </div>
              )}

            {eligibleState.status === "ready" && eligibleItems.length > 0 && (
              <fieldset className={styles.workspaceStaffCandidateGroup}>
                <legend className={styles.workspaceStaffSrOnly}>
                  {staffCopy.assign.candidateGroupLabel}
                </legend>
                {eligibleItems.map((candidate) => {
                  const isSelected = selectedStaffId === candidate.id;
                  const isKnownAssigned = confirmedAssignedStaffIds.has(
                    candidate.id,
                  );

                  return (
                    <label
                      key={candidate.id}
                      className={`${styles.workspaceStaffCandidateOption} ${
                        isSelected ? styles.workspaceStaffCandidateSelected : ""
                      }`}
                    >
                      <div className={styles.workspaceStaffCandidateLeft}>
                        <input
                          type="radio"
                          name="eligibleStaffCandidate"
                          className={styles.workspaceStaffRadioInput}
                          value={candidate.id}
                          checked={isSelected}
                          disabled={isAssigning || isReloadingStaffStatus}
                          aria-label={staffCopy.assign.selectStaffAria
                            .replace("{loginName}", candidate.loginName)
                            .replace("{staffId}", candidate.id)}
                          onChange={() => handleSelectEligibleStaff(candidate)}
                        />
                        <div className={styles.workspaceStaffIdentityBlock}>
                          <strong className={styles.workspaceStaffPrimaryLogin}>
                            {candidate.loginName}
                          </strong>
                          <span className={styles.workspaceStaffIdLine}>
                            <span>{staffCopy.assigned.staffIdLabel}:</span>
                            <code className={styles.workspaceKeyCode}>
                              {candidate.id}
                            </code>
                          </span>
                        </div>
                      </div>

                      {(isKnownAssigned || isSelected) && (
                        <div className={styles.workspaceStaffBadgeRow}>
                          {isKnownAssigned && (
                            <span className={styles.workspaceStaffStatusBadge}>
                              {staffCopy.assign.alreadyAssignedBadge}
                            </span>
                          )}
                          {isSelected && (
                            <span className={styles.workspaceStaffSelectedBadge}>
                              {staffCopy.assign.selectedBadge}
                            </span>
                          )}
                        </div>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            )}

            {eligibleState.status === "ready" && eligibleTotalElements > 0 && (
              <div
                className={`${styles.pagination} ${styles.workspaceHistoryPagination}`}
              >
                <span className={styles.paginationInfo}>{eligibleRangeText}</span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() =>
                      handleEligiblePageChange(currentEligiblePage - 1)
                    }
                    disabled={isEligibleLoading || currentEligiblePage <= 0}
                  >
                    {copy.pagination.previous}
                  </button>

                  {eligiblePaginationTokens.map((token) =>
                    typeof token === "number" ? (
                      <button
                        key={token}
                        type="button"
                        className={`${styles.paginationBtn} ${
                          token === currentEligiblePage
                            ? styles.paginationBtnActive
                            : ""
                        }`}
                        aria-label={copy.pagination.goToPageAria.replace(
                          "{page}",
                          String(token + 1),
                        )}
                        aria-current={
                          token === currentEligiblePage ? "page" : undefined
                        }
                        onClick={() => handleEligiblePageChange(token)}
                        disabled={isEligibleLoading}
                      >
                        {token + 1}
                      </button>
                    ) : (
                      <span
                        key={token}
                        className={styles.workspacePaginationEllipsis}
                        aria-hidden="true"
                      >
                        ...
                      </span>
                    ),
                  )}

                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() =>
                      handleEligiblePageChange(currentEligiblePage + 1)
                    }
                    disabled={
                      isEligibleLoading ||
                      eligibleTotalPages === 0 ||
                      currentEligiblePage + 1 >= eligibleTotalPages
                    }
                  >
                    {copy.pagination.next}
                  </button>
                </div>
              </div>
            )}

            {eligibleState.status !== "forbidden" &&
              eligibleState.status !== "not_found" && (
                <div className={styles.workspaceStaffAssignBar}>
                  <span className={styles.workspaceStaffSectionHint}>
                    {!hasLoadedAssignmentVersion
                      ? staffCopy.assign.waitingVersionHint
                      : !selectedStaffId
                        ? staffCopy.assign.selectPromptHint
                        : ""}
                  </span>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => void handleAssignStaffSubmit()}
                    disabled={!canAssignNow}
                    aria-busy={isAssigning}
                  >
                    <UserPlus size={14} aria-hidden="true" />
                    <span>
                      {isAssigning
                        ? staffCopy.assign.assigningBtn
                        : staffCopy.assign.assignBtn}
                    </span>
                  </button>
                </div>
              )}
          </section>
        </div>

        <div className={styles.onboardingModalFooter}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCloseDetail}
          >
            {detailCopy.closeBtn}
          </button>
        </div>
      </>
    );
  };

  const renderDetailModal = () => {
    if (!detailState.open) {
      return null;
    }
    const modalTitle =
      detailState.detail?.enterpriseName ?? detailState.fallbackTitle;
    const isDetailLoading = detailState.status === "loading";
    const isEditing = modalMode === "edit";
    const isHistory = modalMode === "history";
    const isStaff = modalMode === "staff";
    const isDetailOutdated =
      detailState.detail !== null &&
      knownWorkspaceVersion !== null &&
      knownWorkspaceVersion > detailState.detail.version;
    const canShowReadyActions =
      detailState.status === "ready" &&
      detailState.detail !== null &&
      modalMode === "view";

    return (
      <div
        className={`${styles.onboardingModalBackdrop} ${styles.workspaceDetailBackdrop}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleCloseDetail();
          }
        }}
      >
        <div
          ref={detailDialogRef}
          className={`${styles.onboardingModalDialog} ${styles.workspaceDetailDialog}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="platform-workspace-detail-title"
          aria-busy={
            isDetailLoading ||
            isRefreshingDetail ||
            isPreparingEdit ||
            isSaving ||
            (isHistory && isHistoryLoading) ||
            (isStaff &&
              (isAssignmentsLoading ||
                isEligibleLoading ||
                isAssigning ||
                isReloadingStaffStatus))
          }
          tabIndex={-1}
        >
          <div className={styles.onboardingModalHeader}>
            <div className={styles.workspaceDetailHeaderMain}>
              <div
                className={`${styles.onboardingStepNumber} ${styles.workspaceDetailIconBadge}`}
              >
                <Building2 size={15} aria-hidden="true" />
              </div>
              <div className={styles.workspaceDetailTitleWrap}>
                <h2
                  id="platform-workspace-detail-title"
                  className={styles.workspaceDetailTitle}
                >
                  {modalTitle}
                </h2>
                <p className={styles.onboardingCardSub}>
                  {isHistory
                    ? historyCopy.subtitle
                    : isStaff
                      ? staffCopy.subtitle
                      : detailCopy.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={styles.drawerCloseBtn}
              aria-label={detailCopy.closeAria}
              onClick={handleCloseDetail}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {isHistory ? (
            renderHistoryMode()
          ) : isStaff ? (
            renderStaffMode()
          ) : isEditing &&
            detailState.status === "ready" &&
            detailState.detail ? (
            <form
              className={styles.workspaceDetailEditForm}
              onSubmit={handleEditFormSubmit}
              noValidate
            >
              <div
                className={`${styles.onboardingModalBody} ${styles.workspaceDetailBody}`}
              >
                {renderEditBanner()}

                <section className={styles.onboardingFormSection}>
                  <h3 className={styles.onboardingFormSectionTitle}>
                    <Building2
                      size={15}
                      style={{ color: "var(--security-blue)" }}
                      aria-hidden="true"
                    />
                    <span>{detailCopy.groups.enterprise}</span>
                  </h3>
                  <dl
                    className={`${styles.onboardingInfoList} ${styles.workspaceDetailInfoList}`}
                  >
                    <dt>{detailCopy.fields.workspaceKey}</dt>
                    <dd>
                      <code className={styles.workspaceKeyCode}>
                        {detailState.detail.workspaceKey}
                      </code>
                    </dd>
                  </dl>

                  <div className={styles.onboardingFormField}>
                    <label
                      htmlFor="workspace-edit-enterprise-name"
                      className={styles.onboardingFormLabel}
                    >
                      <span>{editCopy.enterpriseNameLabel}</span>
                      <span style={{ color: "var(--critical-text)" }}>*</span>
                    </label>
                    <input
                      id="workspace-edit-enterprise-name"
                      name="enterpriseName"
                      type="text"
                      className={styles.onboardingFormInput}
                      value={editDraft.enterpriseName}
                      maxLength={MAX_ENTERPRISE_NAME_LENGTH}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleDraftFieldChange("enterpriseName", e.target.value)
                      }
                      aria-invalid={Boolean(editFieldErrors.enterpriseName)}
                      aria-describedby={
                        editFieldErrors.enterpriseName
                          ? "workspace-edit-enterprise-name-error"
                          : undefined
                      }
                      required
                    />
                    {editFieldErrors.enterpriseName && (
                      <p
                        id="workspace-edit-enterprise-name-error"
                        className={styles.authFieldError}
                        role="alert"
                      >
                        {editFieldErrors.enterpriseName}
                      </p>
                    )}
                  </div>
                </section>

                <section className={styles.onboardingFormSection}>
                  <h3 className={styles.onboardingFormSectionTitle}>
                    <User
                      size={15}
                      style={{ color: "var(--security-blue)" }}
                      aria-hidden="true"
                    />
                    <span>{detailCopy.groups.contact}</span>
                  </h3>

                  <div className={styles.onboardingFormField}>
                    <label
                      htmlFor="workspace-edit-contact-name"
                      className={styles.onboardingFormLabel}
                    >
                      <span>{detailCopy.fields.contactName}</span>
                      <span style={{ color: "var(--critical-text)" }}>*</span>
                    </label>
                    <input
                      id="workspace-edit-contact-name"
                      name="contactName"
                      type="text"
                      className={styles.onboardingFormInput}
                      value={editDraft.contactName}
                      maxLength={MAX_CONTACT_NAME_LENGTH}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleDraftFieldChange("contactName", e.target.value)
                      }
                      aria-invalid={Boolean(editFieldErrors.contactName)}
                      aria-describedby={
                        editFieldErrors.contactName
                          ? "workspace-edit-contact-name-error"
                          : undefined
                      }
                      required
                    />
                    {editFieldErrors.contactName && (
                      <p
                        id="workspace-edit-contact-name-error"
                        className={styles.authFieldError}
                        role="alert"
                      >
                        {editFieldErrors.contactName}
                      </p>
                    )}
                  </div>

                  <div className={styles.onboardingFormField}>
                    <label
                      htmlFor="workspace-edit-contact-email"
                      className={styles.onboardingFormLabel}
                    >
                      <span>{detailCopy.fields.contactEmail}</span>
                      <span style={{ color: "var(--critical-text)" }}>*</span>
                    </label>
                    <input
                      id="workspace-edit-contact-email"
                      name="contactEmail"
                      type="email"
                      className={styles.onboardingFormInput}
                      value={editDraft.contactEmail}
                      maxLength={MAX_CONTACT_EMAIL_LENGTH}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleDraftFieldChange("contactEmail", e.target.value)
                      }
                      aria-invalid={Boolean(editFieldErrors.contactEmail)}
                      aria-describedby={
                        editFieldErrors.contactEmail
                          ? "workspace-edit-contact-email-error"
                          : undefined
                      }
                      required
                    />
                    {editFieldErrors.contactEmail && (
                      <p
                        id="workspace-edit-contact-email-error"
                        className={styles.authFieldError}
                        role="alert"
                      >
                        {editFieldErrors.contactEmail}
                      </p>
                    )}
                  </div>

                  <div className={styles.onboardingFormField}>
                    <label
                      htmlFor="workspace-edit-contact-phone"
                      className={styles.onboardingFormLabel}
                    >
                      <span>{detailCopy.fields.contactPhone}</span>
                      <span className={styles.muted}>
                        {editCopy.optionalHint}
                      </span>
                    </label>
                    <input
                      id="workspace-edit-contact-phone"
                      name="contactPhone"
                      type="tel"
                      className={styles.onboardingFormInput}
                      value={editDraft.contactPhone}
                      maxLength={MAX_CONTACT_PHONE_LENGTH}
                      disabled={isSaving}
                      onChange={(e) =>
                        handleDraftFieldChange("contactPhone", e.target.value)
                      }
                      aria-invalid={Boolean(editFieldErrors.contactPhone)}
                      aria-describedby={
                        editFieldErrors.contactPhone
                          ? "workspace-edit-contact-phone-error"
                          : "workspace-edit-contact-phone-hint"
                      }
                    />
                    {editFieldErrors.contactPhone ? (
                      <p
                        id="workspace-edit-contact-phone-error"
                        className={styles.authFieldError}
                        role="alert"
                      >
                        {editFieldErrors.contactPhone}
                      </p>
                    ) : (
                      <p
                        id="workspace-edit-contact-phone-hint"
                        className={styles.onboardingFormHint}
                      >
                        {editCopy.phoneClearHint}
                      </p>
                    )}
                  </div>
                </section>

                <section className={styles.onboardingFormSection}>
                  <h3 className={styles.onboardingFormSectionTitle}>
                    <Clock
                      size={15}
                      style={{ color: "var(--security-blue)" }}
                      aria-hidden="true"
                    />
                    <span>{detailCopy.groups.timestamps}</span>
                  </h3>
                  <dl
                    className={`${styles.onboardingInfoList} ${styles.workspaceDetailInfoList}`}
                  >
                    <dt>{detailCopy.fields.createdAt}</dt>
                    <dd className={styles.workspaceTimestampValue}>
                      {formatWorkspaceTimestamp(
                        detailState.detail.createdAt,
                        language,
                        copy.emptyValue,
                      )}
                    </dd>

                    <dt>{detailCopy.fields.updatedAt}</dt>
                    <dd className={styles.workspaceTimestampValue}>
                      {formatWorkspaceTimestamp(
                        detailState.detail.updatedAt,
                        language,
                        copy.emptyValue,
                      )}
                    </dd>
                  </dl>
                </section>
              </div>

              <div className={styles.onboardingModalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  {editCopy.cancelBtn}
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={isSaving || isInspectingCurrent}
                  aria-busy={isSaving}
                >
                  {isSaving ? editCopy.savingBtn : editCopy.saveBtn}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div
                className={`${styles.onboardingModalBody} ${styles.workspaceDetailBody}`}
              >
                {isDetailLoading && (
                  <div
                    className={styles.workspaceStateBox}
                    role="status"
                    aria-live="polite"
                  >
                    <strong className={styles.workspaceStateTitle}>
                      {detailCopy.states.loadingTitle}
                    </strong>
                    <span className={styles.workspaceStateDesc}>
                      {detailCopy.states.loadingDesc}
                    </span>
                  </div>
                )}

                {detailState.status === "forbidden" && (
                  <div className={styles.workspaceStateBox} role="alert">
                    <ShieldAlert
                      size={22}
                      color="var(--high-text)"
                      aria-hidden="true"
                    />
                    <h3 className={styles.workspaceStateTitle}>
                      {detailCopy.states.forbiddenTitle}
                    </h3>
                    <p className={styles.workspaceStateDesc}>
                      {detailCopy.states.forbiddenDesc}
                    </p>
                  </div>
                )}

                {detailState.status === "not_found" && (
                  <div className={styles.workspaceStateBox} role="alert">
                    <AlertCircle
                      size={22}
                      color="var(--security-orange)"
                      aria-hidden="true"
                    />
                    <h3 className={styles.workspaceStateTitle}>
                      {detailCopy.states.notFoundTitle}
                    </h3>
                    <p className={styles.workspaceStateDesc}>
                      {detailCopy.states.notFoundDesc}
                    </p>
                  </div>
                )}

                {detailState.status === "error" && (
                  <div className={styles.workspaceStateBox} role="alert">
                    <AlertCircle
                      size={22}
                      color="var(--critical-text)"
                      aria-hidden="true"
                    />
                    <h3 className={styles.workspaceStateTitle}>
                      {detailCopy.states.errorTitle}
                    </h3>
                    <p className={styles.workspaceStateDesc}>
                      {detailCopy.states.errorDesc}
                    </p>
                    <div className={styles.workspaceStateActions}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleRetryDetail}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        <span>{detailCopy.retryBtn}</span>
                      </button>
                    </div>
                  </div>
                )}

                {detailState.status === "ready" && detailState.detail && (
                  <>
                    {detailRefreshError && (
                      <div
                        className={styles.workspaceEditErrorBanner}
                        role="alert"
                      >
                        <div className={styles.workspaceBannerRow}>
                          <AlertCircle size={16} aria-hidden="true" />
                          <span>{detailRefreshError}</span>
                        </div>
                        <div className={styles.workspaceBannerActions}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() =>
                              void refreshWorkspaceDetail(
                                detailState.workspaceId,
                                {
                                  openEditWhenReady:
                                    lastRefreshIntentEditRef.current,
                                },
                              )
                            }
                            disabled={isRefreshingDetail}
                            aria-busy={isRefreshingDetail}
                          >
                            <RefreshCw size={14} aria-hidden="true" />
                            <span>
                              {isRefreshingDetail
                                ? editCopy.reloadingCurrentBtn
                                : detailCopy.retryBtn}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {!detailRefreshError &&
                      isRefreshingDetail &&
                      isDetailOutdated && (
                        <div
                          className={styles.workspaceNoticeBanner}
                          role="status"
                        >
                          <div className={styles.workspaceBannerRow}>
                            <RefreshCw size={16} aria-hidden="true" />
                            <span>{editCopy.refreshingBeforeEditNotice}</span>
                          </div>
                        </div>
                      )}

                    {viewNotice && (
                      <div
                        className={styles.workspaceNoticeBanner}
                        role="status"
                      >
                        <div className={styles.workspaceBannerRow}>
                          <CheckCircle2 size={16} aria-hidden="true" />
                          <span>{viewNotice}</span>
                        </div>
                      </div>
                    )}

                    <section className={styles.onboardingFormSection}>
                      <h3 className={styles.onboardingFormSectionTitle}>
                        <Building2
                          size={15}
                          style={{ color: "var(--security-blue)" }}
                          aria-hidden="true"
                        />
                        <span>{detailCopy.groups.enterprise}</span>
                      </h3>
                      <dl
                        className={`${styles.onboardingInfoList} ${styles.workspaceDetailInfoList}`}
                      >
                        <dt>{detailCopy.fields.workspaceKey}</dt>
                        <dd>
                          <code className={styles.workspaceKeyCode}>
                            {detailState.detail.workspaceKey}
                          </code>
                        </dd>
                      </dl>
                    </section>

                    <section className={styles.onboardingFormSection}>
                      <h3 className={styles.onboardingFormSectionTitle}>
                        <User
                          size={15}
                          style={{ color: "var(--security-blue)" }}
                          aria-hidden="true"
                        />
                        <span>{detailCopy.groups.contact}</span>
                      </h3>
                      <dl
                        className={`${styles.onboardingInfoList} ${styles.workspaceDetailInfoList}`}
                      >
                        <dt>{detailCopy.fields.contactName}</dt>
                        <dd>
                          {renderDetailValue(detailState.detail.contactName)}
                        </dd>

                        <dt>{detailCopy.fields.contactEmail}</dt>
                        <dd>
                          {renderDetailValue(detailState.detail.contactEmail)}
                        </dd>

                        <dt>{detailCopy.fields.contactPhone}</dt>
                        <dd>
                          {renderDetailValue(detailState.detail.contactPhone)}
                        </dd>
                      </dl>
                    </section>

                    <section className={styles.onboardingFormSection}>
                      <h3 className={styles.onboardingFormSectionTitle}>
                        <Clock
                          size={15}
                          style={{ color: "var(--security-blue)" }}
                          aria-hidden="true"
                        />
                        <span>{detailCopy.groups.timestamps}</span>
                      </h3>
                      <dl
                        className={`${styles.onboardingInfoList} ${styles.workspaceDetailInfoList}`}
                      >
                        <dt>{detailCopy.fields.createdAt}</dt>
                        <dd className={styles.workspaceTimestampValue}>
                          {formatWorkspaceTimestamp(
                            detailState.detail.createdAt,
                            language,
                            copy.emptyValue,
                          )}
                        </dd>

                        <dt>{detailCopy.fields.updatedAt}</dt>
                        <dd className={styles.workspaceTimestampValue}>
                          {formatWorkspaceTimestamp(
                            detailState.detail.updatedAt,
                            language,
                            copy.emptyValue,
                          )}
                        </dd>
                      </dl>
                    </section>
                  </>
                )}
              </div>

              <div className={styles.onboardingModalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleCloseDetail}
                >
                  {detailCopy.closeBtn}
                </button>
                {canShowReadyActions && (
                  <>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={handleOpenStaff}
                    >
                      <Users size={14} aria-hidden="true" />
                      <span>{staffCopy.openBtn}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={handleOpenHistory}
                    >
                      <History size={14} aria-hidden="true" />
                      <span>{historyCopy.openBtn}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleStartEdit}
                      disabled={isPreparingEdit}
                      aria-busy={isPreparingEdit}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>
                        {isPreparingEdit
                          ? editCopy.reloadingCurrentBtn
                          : editCopy.editBtn}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (status === "forbidden") {
    return (
      <div className={styles.authWorkspaceStack}>
        <div className={styles.pageHeading}>
          <div>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>

        <section className={styles.panel} role="alert">
          <div className={styles.workspaceStateBox}>
            <ShieldAlert
              size={22}
              color="var(--high-text)"
              aria-hidden="true"
            />
            <h2 className={styles.workspaceStateTitle}>
              {copy.states.forbiddenTitle}
            </h2>
            <p className={styles.workspaceStateDesc}>
              {copy.states.forbiddenDesc}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.pageHeading}>
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className={styles.workspaceDirectoryHeaderActions}>
          <button
            type="button"
            className={styles.button}
            onClick={handleRetryOrRefresh}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>{isLoading ? copy.refreshingBtn : copy.refreshBtn}</span>
          </button>
        </div>
      </div>

      <section
        className={`${styles.panel} ${styles.tablePanel}`}
        aria-busy={isLoading}
      >
        <div className={styles.workspaceDirectoryControls}>
          <form
            className={styles.workspaceSearchForm}
            onSubmit={handleSearchFormSubmit}
            role="search"
          >
            <div className={styles.onboardingSearchBox}>
              <Search size={16} aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                name="workspaceSearch"
                className={`${styles.onboardingSearchInput} ${styles.searchInput}`}
                aria-label={copy.searchLabel}
                placeholder={copy.searchPlaceholder}
                value={searchInput}
                maxLength={MAX_WORKSPACE_SEARCH_LENGTH}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                aria-invalid={Boolean(searchError)}
              />
            </div>

            {(searchInput.length > 0 || query.search.length > 0) && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleClearSearch}
              >
                <X size={14} aria-hidden="true" />
                <span>{copy.clearSearchBtn}</span>
              </button>
            )}
          </form>

          <div className={styles.workspaceDirectoryMetaGroup}>
            {status === "ready" && pageData && (
              <span className={styles.tabCount}>
                {copy.totalBadge.replace("{count}", String(totalElements))}
              </span>
            )}
            <select
              className={styles.control}
              aria-label={copy.pageSizeAria}
              value={currentPageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              disabled={isLoading}
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} {copy.perPageSuffix}
                </option>
              ))}
            </select>
          </div>
        </div>

        {searchError && (
          <div className={styles.workspaceInlineError} role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{searchError}</span>
          </div>
        )}

        {status === "error" ? (
          <div className={styles.workspaceStateBox} role="alert">
            <AlertCircle
              size={22}
              color="var(--critical-text)"
              aria-hidden="true"
            />
            <h2 className={styles.workspaceStateTitle}>
              {copy.states.errorTitle}
            </h2>
            <p className={styles.workspaceStateDesc}>{copy.states.errorDesc}</p>
            <div className={styles.workspaceStateActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleRetryOrRefresh}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{copy.states.retryBtn}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{copy.columns.enterprise}</th>
                    <th scope="col">{copy.columns.workspaceKey}</th>
                    <th scope="col">{copy.columns.contact}</th>
                    <th scope="col">{copy.columns.updatedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={4} className={styles.workspaceStateCell}>
                        <div
                          className={styles.workspaceStateBox}
                          role="status"
                          aria-live="polite"
                        >
                          <strong className={styles.workspaceStateTitle}>
                            {copy.states.loadingTitle}
                          </strong>
                          <span className={styles.workspaceStateDesc}>
                            {copy.states.loadingDesc}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    items.map((item) => (
                      <tr key={item.id}>
                        <td className={styles.workspaceWrapCell}>
                          <button
                            ref={(el) => {
                              if (el) {
                                rowTriggerRefs.current.set(item.id, el);
                              } else {
                                rowTriggerRefs.current.delete(item.id);
                              }
                            }}
                            type="button"
                            className={styles.workspaceNameTrigger}
                            aria-label={detailCopy.openAria.replace(
                              "{name}",
                              item.enterpriseName,
                            )}
                            aria-haspopup="dialog"
                            onClick={() => handleOpenDetail(item)}
                          >
                            {item.enterpriseName}
                          </button>
                        </td>
                        <td className={styles.workspaceKeyCell}>
                          <code className={styles.workspaceKeyCode}>
                            {item.workspaceKey}
                          </code>
                        </td>
                        <td className={styles.workspaceWrapCell}>
                          {renderContactCell(item)}
                        </td>
                        <td className={styles.workspaceUpdatedCell}>
                          {formatWorkspaceTimestamp(
                            item.updatedAt,
                            language,
                            copy.emptyValue,
                          )}
                        </td>
                      </tr>
                    ))}

                  {!isLoading && items.length === 0 && effectiveSearch === "" && (
                    <tr>
                      <td colSpan={4} className={styles.workspaceStateCell}>
                        <div className={styles.workspaceStateBox}>
                          <strong className={styles.workspaceStateTitle}>
                            {copy.states.emptyTitle}
                          </strong>
                          <span className={styles.workspaceStateDesc}>
                            {copy.states.emptyDesc}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading && items.length === 0 && effectiveSearch !== "" && (
                    <tr>
                      <td colSpan={4} className={styles.workspaceStateCell}>
                        <div className={styles.workspaceStateBox}>
                          <strong className={styles.workspaceStateTitle}>
                            {copy.states.noMatchesTitle}
                          </strong>
                          <span className={styles.workspaceStateDesc}>
                            {copy.states.noMatchesDesc.replace(
                              "{query}",
                              effectiveSearch,
                            )}
                          </span>
                          <div className={styles.workspaceStateActions}>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={handleClearSearch}
                            >
                              <X size={14} aria-hidden="true" />
                              <span>{copy.clearSearchBtn}</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {status === "ready" && totalElements > 0 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>{rangeText}</span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() => handlePageChange(currentZeroBasedPage - 1)}
                    disabled={isLoading || currentZeroBasedPage <= 0}
                  >
                    {copy.pagination.previous}
                  </button>

                  {paginationTokens.map((token) =>
                    typeof token === "number" ? (
                      <button
                        key={token}
                        type="button"
                        className={`${styles.paginationBtn} ${
                          token === currentZeroBasedPage
                            ? styles.paginationBtnActive
                            : ""
                        }`}
                        aria-label={copy.pagination.goToPageAria.replace(
                          "{page}",
                          String(token + 1),
                        )}
                        aria-current={
                          token === currentZeroBasedPage ? "page" : undefined
                        }
                        onClick={() => handlePageChange(token)}
                        disabled={isLoading}
                      >
                        {token + 1}
                      </button>
                    ) : (
                      <span
                        key={token}
                        className={styles.workspacePaginationEllipsis}
                        aria-hidden="true"
                      >
                        ...
                      </span>
                    ),
                  )}

                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() => handlePageChange(currentZeroBasedPage + 1)}
                    disabled={
                      isLoading ||
                      totalPages === 0 ||
                      currentZeroBasedPage + 1 >= totalPages
                    }
                  >
                    {copy.pagination.next}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {renderDetailModal()}
    </div>
  );
}
