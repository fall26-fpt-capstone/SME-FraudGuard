"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type {
  NormalizedWorkspaceListQuery,
  WorkspaceDirectoryItem,
  WorkspaceListQuery,
  WorkspaceMetadataUpdatePayload,
  WorkspacePageResponse,
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
  classifyWorkspaceConflict,
  fetchWorkspaceDetail,
  fetchWorkspacePage,
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

type DetailModalState =
  | { readonly open: false }
  | {
      readonly open: true;
      readonly workspaceId: string;
      readonly fallbackTitle: string;
      readonly status: DetailModalStatus;
      readonly detail: WorkspaceDirectoryItem | null;
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
      readonly kind: "conflict_stale" | "conflict_generic";
      readonly message: string;
    }
  | { readonly kind: "conflict_duplicate"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "info"; readonly message: string };

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
  saveMetadata = updateWorkspaceMetadata,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: PlatformWorkspaceListViewProps) {
  const { language, t } = useLanguage();
  const copy = t.platformWorkspaces;
  const detailCopy = copy.detail;
  const editCopy = detailCopy.edit;

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

  const [isEditing, setIsEditing] = useState(false);
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
  const [isSaving, setIsSaving] = useState(false);
  const [isInspectingCurrent, setIsInspectingCurrent] = useState(false);

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const detailRequestSeqRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const isSavingRef = useRef(false);
  const openWorkspaceIdRef = useRef<string | null>(null);
  const rowTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastTriggerIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRedirectedRef = useRef(false);

  openWorkspaceIdRef.current = detailState.open ? detailState.workspaceId : null;

  const latestHandlersRef = useRef({
    loadPage,
    loadDetail,
    saveMetadata,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
    editCopy,
  });
  latestHandlersRef.current = {
    loadPage,
    loadDetail,
    saveMetadata,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
    editCopy,
  };

  const resetEditState = useCallback(() => {
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    isSavingRef.current = false;
    setIsSaving(false);
    setIsInspectingCurrent(false);
    setIsEditing(false);
    setEditFieldErrors({});
    setEditBanner(null);
    setViewNotice("");
  }, []);

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
      saveAbortRef.current?.abort();
      detailRequestSeqRef.current += 1;
      isSavingRef.current = false;
      openWorkspaceIdRef.current = null;
      setIsSaving(false);
      setIsInspectingCurrent(false);
      setIsEditing(false);
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
    [],
  );

  const handleCloseDetail = useCallback(() => {
    const returnFocusId = lastTriggerIdRef.current;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    detailRequestSeqRef.current += 1;
    openWorkspaceIdRef.current = null;
    resetEditState();
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
  }, [resetEditState]);

  const detailDialogRef = useDialogFocus(detailState.open, handleCloseDetail);

  const executeDetailLoad = useCallback(
    async (workspaceId: string, fallbackTitle: string) => {
      detailAbortRef.current?.abort();
      resetEditState();
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
        setDetailState({
          open: true,
          workspaceId,
          fallbackTitle: detail.enterpriseName,
          status: "ready",
          detail,
        });
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
    [resetEditState, triggerAuthRedirect],
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
    if (!detailState.open || detailState.status !== "ready" || !detailState.detail) {
      return;
    }
    setViewNotice("");
    setEditFieldErrors({});
    setEditBanner(null);
    setEditBaseVersion(detailState.detail.version);
    setEditDraft(draftFromItem(detailState.detail));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isSaving) {
      return;
    }
    setIsEditing(false);
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
      setDetailState({
        open: true,
        workspaceId: targetWorkspaceId,
        fallbackTitle: fresh.enterpriseName,
        status: "ready",
        detail: fresh,
      });
      setEditBaseVersion(fresh.version);
      setEditDraft(draftFromItem(fresh));
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
          resetEditState();
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
      setDetailState({
        open: true,
        workspaceId: targetWorkspaceId,
        fallbackTitle: fresh.enterpriseName,
        status: "ready",
        detail: fresh,
      });

      if (fresh.version === editBaseVersion) {
        setEditBanner({
          kind: "info",
          message: latestHandlersRef.current.editCopy.reconnectedUnchangedNotice,
        });
        return;
      }

      const matchesSubmittedDraft =
        fresh.enterpriseName === editDraft.enterpriseName.trim() &&
        fresh.contactName === editDraft.contactName.trim() &&
        fresh.contactEmail === editDraft.contactEmail.trim() &&
        (fresh.contactPhone ?? null) === normalizedDraftPhone;

      setReloadNonce((n) => n + 1);

      if (matchesSubmittedDraft) {
        setIsEditing(false);
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
          resetEditState();
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

      // Refresh current directory query regardless so renamed records re-sort/re-filter accurately.
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
      setIsEditing(false);
      setEditFieldErrors({});
      setEditBanner(null);
      setViewNotice(latestHandlersRef.current.editCopy.savedNotice);
      setDetailState({
        open: true,
        workspaceId: targetWorkspaceId,
        fallbackTitle: updated.enterpriseName,
        status: "ready",
        detail: updated,
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

      isSavingRef.current = false;
      setIsSaving(false);

      const errs = latestHandlersRef.current.editCopy.errors;
      if (isWorkspaceError(err)) {
        if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED") {
          triggerAuthRedirect(err.code);
          return;
        }
        if (err.code === "NOT_FOUND") {
          resetEditState();
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
      activeAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      saveAbortRef.current?.abort();
    };
  }, [clearPendingDebounce]);

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
      editBanner.kind === "conflict_generic";
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

  const renderDetailModal = () => {
    if (!detailState.open) {
      return null;
    }
    const modalTitle =
      detailState.detail?.enterpriseName ?? detailState.fallbackTitle;
    const isDetailLoading = detailState.status === "loading";
    const canShowEditBtn =
      detailState.status === "ready" &&
      detailState.detail !== null &&
      !isEditing;

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
          aria-busy={isDetailLoading || isSaving}
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
                <p className={styles.onboardingCardSub}>{detailCopy.subtitle}</p>
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

          {isEditing && detailState.status === "ready" && detailState.detail ? (
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
                {canShowEditBtn && (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleStartEdit}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    <span>{editCopy.editBtn}</span>
                  </button>
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
