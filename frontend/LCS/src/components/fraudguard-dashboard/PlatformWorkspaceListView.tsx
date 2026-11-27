"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
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
  readonly searchDebounceMs?: number;
}

type ViewLoadStatus = "loading" | "ready" | "forbidden" | "error";

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
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: PlatformWorkspaceListViewProps) {
  const { language, t } = useLanguage();
  const copy = t.platformWorkspaces;

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

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRedirectedRef = useRef(false);
  const latestHandlersRef = useRef({
    loadPage,
    onSessionExpired,
    onUnauthenticated,
    searchTooLongError: copy.states.searchTooLongError,
  });
  latestHandlersRef.current = {
    loadPage,
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
          if (err.code === "SESSION_EXPIRED") {
            if (!authRedirectedRef.current) {
              authRedirectedRef.current = true;
              latestHandlersRef.current.onSessionExpired?.();
            }
            return;
          }
          if (err.code === "UNAUTHENTICATED") {
            if (!authRedirectedRef.current) {
              authRedirectedRef.current = true;
              if (latestHandlersRef.current.onUnauthenticated) {
                latestHandlersRef.current.onUnauthenticated();
              } else {
                latestHandlersRef.current.onSessionExpired?.();
              }
            }
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
    [],
  );

  useEffect(() => {
    void executeLoad(query);
  }, [executeLoad, query, reloadNonce]);

  useEffect(() => {
    return () => {
      clearPendingDebounce();
      activeAbortRef.current?.abort();
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
                          <div className={styles.findingName}>
                            {item.enterpriseName}
                          </div>
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
    </div>
  );
}
