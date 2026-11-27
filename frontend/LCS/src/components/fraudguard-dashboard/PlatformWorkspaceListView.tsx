"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  Clock,
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
  WorkspacePageResponse,
} from "@/types/workspace";
import {
  DEFAULT_WORKSPACE_PAGE_SIZE,
  MAX_WORKSPACE_SEARCH_LENGTH,
  WorkspaceServiceError,
  fetchWorkspaceDetail,
  fetchWorkspacePage,
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

export function PlatformWorkspaceListView({
  onSessionExpired,
  onUnauthenticated,
  loadPage = fetchWorkspacePage,
  loadDetail = fetchWorkspaceDetail,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: PlatformWorkspaceListViewProps) {
  const { language, t } = useLanguage();
  const copy = t.platformWorkspaces;
  const detailCopy = copy.detail;

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

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const detailRequestSeqRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const rowTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastTriggerIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRedirectedRef = useRef(false);
  const latestHandlersRef = useRef({
    loadPage,
    loadDetail,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
  });
  latestHandlersRef.current = {
    loadPage,
    loadDetail,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
  };

  const clearPendingDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const triggerAuthRedirect = useCallback((code: "SESSION_EXPIRED" | "UNAUTHENTICATED") => {
    if (authRedirectedRef.current) {
      return;
    }
    authRedirectedRef.current = true;
    detailAbortRef.current?.abort();
    detailRequestSeqRef.current += 1;
    setDetailState({ open: false });
    if (code === "UNAUTHENTICATED" && latestHandlersRef.current.onUnauthenticated) {
      latestHandlersRef.current.onUnauthenticated();
      return;
    }
    latestHandlersRef.current.onSessionExpired?.();
  }, []);

  const handleCloseDetail = useCallback(() => {
    const returnFocusId = lastTriggerIdRef.current;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    detailRequestSeqRef.current += 1;
    setDetailState({ open: false });

    if (returnFocusId) {
      const targetBtn = rowTriggerRefs.current.get(returnFocusId);
      if (targetBtn && typeof targetBtn.focus === "function") {
        queueMicrotask(() => {
          const currentBtn = rowTriggerRefs.current.get(returnFocusId);
          if (currentBtn && typeof currentBtn.focus === "function") {
            currentBtn.focus();
          }
        });
      }
    }
  }, []);

  const detailDialogRef = useDialogFocus(detailState.open, handleCloseDetail);

  const executeDetailLoad = useCallback(
    async (workspaceId: string, fallbackTitle: string) => {
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const requestId = detailRequestSeqRef.current + 1;
      detailRequestSeqRef.current = requestId;

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

  const renderDetailModal = () => {
    if (!detailState.open) {
      return null;
    }
    const modalTitle =
      detailState.detail?.enterpriseName ?? detailState.fallbackTitle;
    const isDetailLoading = detailState.status === "loading";

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
          aria-busy={isDetailLoading}
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
                    <dd>{renderDetailValue(detailState.detail.contactName)}</dd>

                    <dt>{detailCopy.fields.contactEmail}</dt>
                    <dd>{renderDetailValue(detailState.detail.contactEmail)}</dd>

                    <dt>{detailCopy.fields.contactPhone}</dt>
                    <dd>{renderDetailValue(detailState.detail.contactPhone)}</dd>
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
          </div>
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
