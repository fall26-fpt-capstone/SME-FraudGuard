"use client";

import { PlatformHealthOverview } from "../fraudguard-dashboard/PlatformHealthOverview";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LogOut,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  X,
} from "lucide-react";
import type { AuthClientSession, AuthPortal } from "@/types/auth";
import type { SecondaryView } from "@/types/fraudguard";
import {
  buildLoginRedirectPath,
  isPlatformBackendRole,
  readPreferredTheme,
  resolvePortalForRole,
  sessionToShellUserProfile,
  validatePasswordChangeInput,
  writePreferredTheme,
  type PasswordValidationErrorCode,
} from "@/utils/auth";
import {
  AuthServiceError,
  changeCurrentPassword,
  fetchCurrentSession,
  logoutCurrentSession,
  submitInitialPassword,
} from "@/services/auth";
import { getSectionsForRole } from "@/routes/navigation";
import { getRoleHomeView } from "@/routes/role-home";
import { canAccessView } from "@/utils/permissions";
import { Sidebar } from "@/layouts/Sidebar";
import { ProductHeader } from "@/layouts/ProductHeader";
import { Panel } from "@/components/fraudguard-dashboard/Panel";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { ToastProvider, useToast } from "@/context/ToastProvider";
import styles from "@/components/fraudguard-dashboard/SecurityDashboard.module.css";

export type AuthenticatedWorkspaceInitialState =
  | { readonly status: "authenticated"; readonly session: AuthClientSession }
  | { readonly status: "backend_unavailable" }
  | { readonly status: "loading" };

export interface AuthenticatedWorkspaceProps {
  readonly initialState: AuthenticatedWorkspaceInitialState;
  readonly showDemoLink?: boolean;
}

interface PasswordFormFieldsProps {
  readonly idPrefix: string;
  readonly isInitial: boolean;
  readonly isSubmitting: boolean;
  readonly onSubmit: (values: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }) => Promise<boolean>;
  readonly onCancel?: () => void;
}

function PasswordChangeForm({
  idPrefix,
  isInitial,
  isSubmitting,
  onSubmit,
  onCancel,
}: PasswordFormFieldsProps) {
  const { t } = useLanguage();
  const pwCopy = t.auth.password;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmation?: string;
  }>({});
  const [formError, setFormError] = useState("");

  const mapValidationMessage = (code: PasswordValidationErrorCode): string => {
    const errors = pwCopy.errors;
    switch (code) {
      case "CURRENT_PASSWORD_REQUIRED":
        return errors.currentRequired;
      case "CURRENT_PASSWORD_TOO_LONG":
        return errors.currentTooLong;
      case "NEW_PASSWORD_REQUIRED":
        return errors.newRequired;
      case "NEW_PASSWORD_TOO_SHORT":
        return errors.newTooShort;
      case "NEW_PASSWORD_TOO_LONG":
        return errors.newTooLong;
      case "NEW_PASSWORD_UNCHANGED":
        return errors.newUnchanged;
      case "CONFIRMATION_REQUIRED":
        return errors.confirmRequired;
      case "CONFIRMATION_MISMATCH":
        return errors.confirmMismatch;
      default:
        return errors.validationError;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError("");

    const validation = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmation,
    });
    if (!validation.ok) {
      setFieldErrors({
        [validation.field]: mapValidationMessage(validation.code),
      });
      return;
    }

    try {
      const succeeded = await onSubmit(validation.payload);
      if (succeeded) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
      }
    } catch (err) {
      const errors = pwCopy.errors;
      if (err instanceof AuthServiceError) {
        if (err.code === "INVALID_CURRENT_PASSWORD") {
          setFieldErrors({ currentPassword: errors.invalidCurrentPassword });
          return;
        }
        if (err.code === "FORBIDDEN_FLOW") {
          setFormError(errors.forbiddenFlow);
          return;
        }
        if (err.code === "CONFLICT") {
          setFormError(errors.conflict);
          return;
        }
        if (err.code === "BACKEND_UNAVAILABLE") {
          setFormError(errors.backendUnavailable);
          return;
        }
      }
      setFormError(pwCopy.errors.validationError);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.authPasswordForm} noValidate>
      {formError && (
        <div className={styles.modalErrorBanner} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <div className={styles.authRulesBox}>
        <p className={styles.authRulesTitle}>{pwCopy.rulesTitle}</p>
        <ul className={styles.authRulesList}>
          <li>{pwCopy.ruleLength}</li>
          <li>{pwCopy.ruleDifferent}</li>
          <li>{pwCopy.ruleMatch}</li>
        </ul>
      </div>

      <div>
        <label className={styles.formLabel} htmlFor={`${idPrefix}-current`}>
          {pwCopy.currentLabel}
        </label>
        <div className={styles.authPasswordFieldWrap}>
          <input
            id={`${idPrefix}-current`}
            type={showCurrent ? "text" : "password"}
            className={`${styles.formInput} ${styles.authPasswordInput}`}
            placeholder={pwCopy.currentPlaceholder}
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              if (fieldErrors.currentPassword) {
                setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
              }
            }}
            autoComplete="current-password"
            maxLength={72}
            aria-invalid={Boolean(fieldErrors.currentPassword)}
            aria-describedby={
              fieldErrors.currentPassword ? `${idPrefix}-current-error` : undefined
            }
            required
          />
          <button
            type="button"
            className={styles.authPasswordToggleBtn}
            onClick={() => setShowCurrent((prev) => !prev)}
            aria-label={
              showCurrent
                ? t.auth.login.hidePasswordAria
                : t.auth.login.showPasswordAria
            }
          >
            {showCurrent ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {fieldErrors.currentPassword && (
          <p id={`${idPrefix}-current-error`} className={styles.authFieldError} role="alert">
            {fieldErrors.currentPassword}
          </p>
        )}
      </div>

      <div>
        <label className={styles.formLabel} htmlFor={`${idPrefix}-new`}>
          {pwCopy.newLabel}
        </label>
        <div className={styles.authPasswordFieldWrap}>
          <input
            id={`${idPrefix}-new`}
            type={showNew ? "text" : "password"}
            className={`${styles.formInput} ${styles.authPasswordInput}`}
            placeholder={pwCopy.newPlaceholder}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (fieldErrors.newPassword) {
                setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
              }
            }}
            autoComplete="new-password"
            maxLength={72}
            aria-invalid={Boolean(fieldErrors.newPassword)}
            aria-describedby={
              fieldErrors.newPassword ? `${idPrefix}-new-error` : undefined
            }
            required
          />
          <button
            type="button"
            className={styles.authPasswordToggleBtn}
            onClick={() => setShowNew((prev) => !prev)}
            aria-label={
              showNew
                ? t.auth.login.hidePasswordAria
                : t.auth.login.showPasswordAria
            }
          >
            {showNew ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {fieldErrors.newPassword && (
          <p id={`${idPrefix}-new-error`} className={styles.authFieldError} role="alert">
            {fieldErrors.newPassword}
          </p>
        )}
      </div>

      <div>
        <label className={styles.formLabel} htmlFor={`${idPrefix}-confirm`}>
          {pwCopy.confirmLabel}
        </label>
        <div className={styles.authPasswordFieldWrap}>
          <input
            id={`${idPrefix}-confirm`}
            type={showConfirm ? "text" : "password"}
            className={`${styles.formInput} ${styles.authPasswordInput}`}
            placeholder={pwCopy.confirmPlaceholder}
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
              if (fieldErrors.confirmation) {
                setFieldErrors((prev) => ({ ...prev, confirmation: undefined }));
              }
            }}
            autoComplete="new-password"
            maxLength={72}
            aria-invalid={Boolean(fieldErrors.confirmation)}
            aria-describedby={
              fieldErrors.confirmation ? `${idPrefix}-confirm-error` : undefined
            }
            required
          />
          <button
            type="button"
            className={styles.authPasswordToggleBtn}
            onClick={() => setShowConfirm((prev) => !prev)}
            aria-label={
              showConfirm
                ? t.auth.login.hidePasswordAria
                : t.auth.login.showPasswordAria
            }
          >
            {showConfirm ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {fieldErrors.confirmation && (
          <p id={`${idPrefix}-confirm-error`} className={styles.authFieldError} role="alert">
            {fieldErrors.confirmation}
          </p>
        )}
      </div>

      <div className={styles.authActionRow}>
        {onCancel && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {pwCopy.cancelBtn}
          </button>
        )}
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting
            ? pwCopy.submittingBtn
            : isInitial
              ? pwCopy.submitInitialBtn
              : pwCopy.submitChangeBtn}
        </button>
      </div>
    </form>
  );
}

export function AuthenticatedWorkspaceContent({
  initialState,
  showDemoLink = false,
}: AuthenticatedWorkspaceProps) {
  const router = useRouter();
  const { language, toggleLanguage, t } = useLanguage();
  const { toast } = useToast();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewState, setViewState] = useState<AuthenticatedWorkspaceInitialState>(
    initialState,
  );
  const [activeNavItem, setActiveNavItem] = useState<SecondaryView>(() =>
    initialState.status === "authenticated"
      ? getRoleHomeView(initialState.session.displayRole)
      : "platform-health",
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isMutatingPassword, setIsMutatingPassword] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const sessionEpochRef = useRef(0);
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const knownPortalRef = useRef<AuthPortal | null>(
    initialState.status === "authenticated"
      ? resolvePortalForRole(initialState.session.account.role)
      : null,
  );

  const passwordDialogRef = useDialogFocus(passwordModalOpen, () => {
    if (!isMutatingPassword) {
      setPasswordModalOpen(false);
    }
  });

  useEffect(() => {
    setTheme(readPreferredTheme());
  }, []);

  const beginRequestInCurrentEpoch = useCallback(() => {
    inFlightControllerRef.current?.abort();
    const controller = new AbortController();
    inFlightControllerRef.current = controller;
    return {
      epoch: sessionEpochRef.current,
      signal: controller.signal,
    };
  }, []);

  const invalidateSessionAndRedirect = useCallback(
    (reason: "auth_required" | "session_expired") => {
      const targetPortal = knownPortalRef.current;
      sessionEpochRef.current += 1;
      inFlightControllerRef.current?.abort();
      inFlightControllerRef.current = null;
      setPasswordModalOpen(false);
      setViewState({ status: "loading" });
      void logoutCurrentSession().finally(() => {
        router.replace(buildLoginRedirectPath(targetPortal, reason));
      });
    },
    [router],
  );

  const verifySession = useCallback(
    async (showSuccessToast: boolean) => {
      const { epoch, signal } = beginRequestInCurrentEpoch();
      setIsRefreshingSession(true);
      try {
        const nextSession = await fetchCurrentSession({ signal });
        if (sessionEpochRef.current !== epoch || signal.aborted) {
          return;
        }
        knownPortalRef.current = resolvePortalForRole(nextSession.account.role);
        setViewState((prev) => {
          const prevAccountId =
            prev.status === "authenticated" ? prev.session.account.accountId : null;
          const prevRole =
            prev.status === "authenticated" ? prev.session.displayRole : null;
          if (
            prevAccountId !== nextSession.account.accountId ||
            prevRole !== nextSession.displayRole
          ) {
            setActiveNavItem(getRoleHomeView(nextSession.displayRole));
          }
          return { status: "authenticated", session: nextSession };
        });
        if (nextSession.account.mustChangePassword) {
          setPasswordModalOpen(false);
        }
        if (showSuccessToast) {
          toast("info", t.auth.workspace.sessionVerifiedToast);
        }
      } catch (err) {
        if (sessionEpochRef.current !== epoch || signal.aborted) {
          return;
        }
        if (err instanceof AuthServiceError) {
          if (err.code === "UNAUTHENTICATED") {
            invalidateSessionAndRedirect("auth_required");
            return;
          }
          if (err.code === "SESSION_EXPIRED") {
            invalidateSessionAndRedirect("session_expired");
            return;
          }
        }
        setPasswordModalOpen(false);
        setViewState({ status: "backend_unavailable" });
      } finally {
        if (sessionEpochRef.current === epoch && !signal.aborted) {
          setIsRefreshingSession(false);
        }
      }
    },
    [beginRequestInCurrentEpoch, invalidateSessionAndRedirect, t.auth.workspace.sessionVerifiedToast, toast],
  );

  useEffect(() => {
    if (initialState.status === "loading") {
      void verifySession(false);
    }
    return () => {
      inFlightControllerRef.current?.abort();
    };
  }, [initialState.status, verifySession]);

  // Enforce backend token expiry without creating automatic token refresh.
  const currentExpiresAt =
    viewState.status === "authenticated" ? viewState.session.expiresAt : undefined;
  useEffect(() => {
    if (!currentExpiresAt) return;
    const expiryMs = Date.parse(currentExpiresAt);
    if (!Number.isFinite(expiryMs)) return;
    const remainingMs = expiryMs - Date.now();
    if (remainingMs <= 0) {
      invalidateSessionAndRedirect("session_expired");
      return;
    }
    const timer = setTimeout(() => {
      invalidateSessionAndRedirect("session_expired");
    }, remainingMs + 250);
    return () => clearTimeout(timer);
  }, [currentExpiresAt, invalidateSessionAndRedirect]);

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      writePreferredTheme(next);
      return next;
    });
  };

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    const targetPortal = knownPortalRef.current;
    sessionEpochRef.current += 1;
    inFlightControllerRef.current?.abort();
    inFlightControllerRef.current = null;
    setIsLoggingOut(true);
    setPasswordModalOpen(false);

    const outcome = await logoutCurrentSession();
    setViewState({ status: "loading" });

    if (outcome.serverRevoked) {
      router.replace(buildLoginRedirectPath(targetPortal, "signed_out"));
      return;
    }
    if (outcome.reason === "TOKEN_EXPIRED_OR_INVALID") {
      router.replace(buildLoginRedirectPath(targetPortal, "logout_expired"));
      return;
    }
    router.replace(buildLoginRedirectPath(targetPortal, "logout_unconfirmed"));
  }, [isLoggingOut, router]);

  const handleInitialPasswordSubmit = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }): Promise<boolean> => {
    const { epoch, signal } = beginRequestInCurrentEpoch();
    setIsMutatingPassword(true);
    try {
      const updated = await submitInitialPassword(values, { signal });
      if (sessionEpochRef.current !== epoch || signal.aborted) {
        return false;
      }
      knownPortalRef.current = resolvePortalForRole(updated.account.role);
      setViewState({ status: "authenticated", session: updated });
      setActiveNavItem(getRoleHomeView(updated.displayRole));
      toast("success", t.auth.password.initialSuccessToast);
      return true;
    } catch (err) {
      if (sessionEpochRef.current !== epoch || signal.aborted) {
        return false;
      }
      if (
        err instanceof AuthServiceError &&
        (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED")
      ) {
        invalidateSessionAndRedirect("session_expired");
        return false;
      }
      if (err instanceof AuthServiceError && err.code === "FORBIDDEN_FLOW") {
        void verifySession(false);
      }
      throw err;
    } finally {
      if (sessionEpochRef.current === epoch && !signal.aborted) {
        setIsMutatingPassword(false);
      }
    }
  };

  const handleCurrentPasswordSubmit = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }): Promise<boolean> => {
    const { epoch, signal } = beginRequestInCurrentEpoch();
    setIsMutatingPassword(true);
    try {
      const updated = await changeCurrentPassword(values, { signal });
      if (sessionEpochRef.current !== epoch || signal.aborted) {
        return false;
      }
      knownPortalRef.current = resolvePortalForRole(updated.account.role);
      setViewState({ status: "authenticated", session: updated });
      setPasswordModalOpen(false);
      toast("success", t.auth.password.changeSuccessToast);
      return true;
    } catch (err) {
      if (sessionEpochRef.current !== epoch || signal.aborted) {
        return false;
      }
      if (
        err instanceof AuthServiceError &&
        (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHENTICATED")
      ) {
        invalidateSessionAndRedirect("session_expired");
        return false;
      }
      if (err instanceof AuthServiceError && err.code === "FORBIDDEN_FLOW") {
        void verifySession(false);
      }
      throw err;
    } finally {
      if (sessionEpochRef.current === epoch && !signal.aborted) {
        setIsMutatingPassword(false);
      }
    }
  };

  const session =
    viewState.status === "authenticated" ? viewState.session : null;

  const shellUser = useMemo(
    () => (session ? sessionToShellUserProfile(session) : undefined),
    [session],
  );

  const navSections = useMemo(
    () => (session ? getSectionsForRole(session.displayRole, t) : []),
    [session, t],
  );

  const activeSectionLabel = useMemo(() => {
    for (const section of navSections) {
      const match = section.items.find((item) => item.id === activeNavItem);
      if (match) return match.label;
    }
    return t.brandName;
  }, [activeNavItem, navSections, t.brandName]);

  const formattedExpiry = useMemo(() => {
    if (!session?.expiresAt) {
      return t.auth.workspace.expiresUnknown;
    }
    const parsed = new Date(session.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return t.auth.workspace.expiresUnknown;
    }
    return parsed.toLocaleString(language === "vi" ? "vi-VN" : "en-US");
  }, [language, session?.expiresAt, t.auth.workspace.expiresUnknown]);

  const renderStandaloneTopBar = () => (
    <header className={styles.productHeader}>
      <div className={styles.headerLeft}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>
            <Shield size={18} aria-hidden="true" />
          </div>
          <span className={styles.logoTitle}>{t.brandName}</span>
        </div>
      </div>
      <div className={styles.headerRight}>
        <button
          type="button"
          className={styles.languageToggleBtn}
          onClick={toggleLanguage}
          title={t.switchLanguage}
          aria-label={t.switchLanguage}
        >
          <Globe size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
          <span>{t.langLabel}</span>
        </button>

        <button
          type="button"
          className={styles.themeToggleBtn}
          onClick={handleToggleTheme}
          aria-label={theme === "dark" ? t.themeLight : t.themeDark}
        >
          {theme === "dark" ? (
            <Sun size={15} color="#eda765" aria-hidden="true" />
          ) : (
            <Moon size={15} color="#7c3aed" aria-hidden="true" />
          )}
          <span>{theme === "dark" ? t.themeLight : t.themeDark}</span>
        </button>

        <button
          type="button"
          className={styles.btnSecondary}
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-busy={isLoggingOut}
        >
          <LogOut size={15} aria-hidden="true" />
          <span>{isLoggingOut ? t.userMenu.loggingOut : t.userMenu.logout}</span>
        </button>
      </div>
    </header>
  );

  if (viewState.status === "loading") {
    return (
      <div className={styles.root} data-theme={theme}>
        <div className={styles.authStandaloneShell}>
          {renderStandaloneTopBar()}
          <main className={styles.authStandaloneMain}>
            <div className={styles.pageHeading}>
              <div>
                <h1>{t.brandName}</h1>
                <p role="status" aria-live="polite">
                  {t.auth.workspace.loadingSession}
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (viewState.status === "backend_unavailable" || !session || !shellUser) {
    return (
      <div className={styles.root} data-theme={theme}>
        <div className={styles.authStandaloneShell}>
          {renderStandaloneTopBar()}
          <main className={styles.authStandaloneMain}>
            <div className={styles.pageHeading}>
              <div>
                <h1>{t.auth.workspace.unavailableTitle}</h1>
              </div>
            </div>
            <Panel title={t.auth.workspace.unavailableTitle}>
              <p className={styles.authStatusCopy}>
                {t.auth.workspace.unavailableDesc}
              </p>
              <div className={styles.authActionRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => void verifySession(true)}
                  disabled={isRefreshingSession || isLoggingOut}
                  aria-busy={isRefreshingSession}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>
                    {isRefreshingSession
                      ? t.auth.workspace.retryingBtn
                      : t.auth.workspace.retryBtn}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>{t.auth.workspace.clearLocalBtn}</span>
                </button>
              </div>
            </Panel>
          </main>
        </div>
      </div>
    );
  }

  if (session.account.mustChangePassword) {
    const isPlatform = isPlatformBackendRole(session.account.role);
    return (
      <div className={styles.root} data-theme={theme}>
        <div className={styles.authStandaloneShell}>
          {renderStandaloneTopBar()}
          <main className={styles.authStandaloneMain}>
            <div className={styles.pageHeading}>
              <div>
                <h1>{t.auth.password.initialTitle}</h1>
                <p>{t.auth.password.initialSubtitle}</p>
              </div>
            </div>

            <Panel title={t.auth.workspace.sessionPanelTitle}>
              <div className={styles.authSessionGrid}>
                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.loginNameLabel}
                  </span>
                  <span className={styles.authSessionValue}>
                    {session.account.loginName}
                  </span>
                </div>
                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.roleLabel}
                  </span>
                  <span className={styles.authSessionValue}>
                    {session.displayRole} ({session.account.role})
                  </span>
                </div>
                {!isPlatform && session.account.workspaceKey && (
                  <div className={styles.authSessionItem}>
                    <span className={styles.authSessionLabel}>
                      {t.auth.workspace.workspaceKeyLabel}
                    </span>
                    <span
                      className={`${styles.authSessionValue} ${styles.authSessionMono}`}
                    >
                      {session.account.workspaceKey}
                    </span>
                  </div>
                )}
              </div>
            </Panel>

            <Panel title={t.auth.password.initialTitle}>
              <PasswordChangeForm
                idPrefix="initial-pw"
                isInitial
                isSubmitting={isMutatingPassword}
                onSubmit={handleInitialPasswordSubmit}
              />
            </Panel>
          </main>
        </div>
      </div>
    );
  }

  const isPlatform = isPlatformBackendRole(session.account.role);
  const unavailableTitle = (
    isPlatform
      ? t.auth.workspace.platformSectionUnavailableTitle
      : t.auth.workspace.enterpriseSectionUnavailableTitle
  ).replace("{section}", activeSectionLabel);

  const unavailableDesc = isPlatform
    ? t.auth.workspace.platformSectionUnavailableDesc
    : t.auth.workspace.enterpriseSectionUnavailableDesc.replace(
        "{workspace}",
        session.account.workspaceKey ?? "",
      );

  const handleNavigate = (nextView: string) => {
    const candidate = nextView as SecondaryView;
    if (canAccessView(session.displayRole, candidate)) {
      setActiveNavItem(candidate);
    }
  };

  return (
    <div className={styles.root} data-theme={theme}>
      <Sidebar
        activeItem={activeNavItem}
        onItemChange={handleNavigate}
        currentUser={shellUser}
        workspaceKey={session.account.workspaceKey}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />

      <div className={styles.workspace}>
        <ProductHeader
          activeViewTitle={activeSectionLabel}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          currentUser={shellUser}
          workspaceKey={session.account.workspaceKey}
          expiresAt={session.expiresAt}
          onNavigate={handleNavigate}
          onOpenChangePassword={() => setPasswordModalOpen(true)}
          onRefreshSession={() => void verifySession(true)}
          isRefreshingSession={isRefreshingSession}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
        />

        <main className={styles.main}>
          {showDemoLink && <a className={styles.button} href="/demo">{language === "vi" ? "Thử dashboard theo vai trò" : "Preview role dashboards"}</a>}
          {session.account.role === "PLATFORM_ADMIN" && activeNavItem === "platform-health" ? (
            <PlatformHealthOverview />
          ) : (
          <div className={styles.authWorkspaceStack}>
            <div className={styles.pageHeading}>
              <div>
                <h1>{activeSectionLabel}</h1>
                <p>{t.auth.workspace.sessionPanelDesc}</p>
              </div>
            </div>

            <Panel
              title={t.auth.workspace.sessionPanelTitle}
              description={t.auth.workspace.expiresUnknown}
            >
              <div className={styles.authSessionGrid}>
                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.loginNameLabel}
                  </span>
                  <span className={styles.authSessionValue}>
                    {session.account.loginName}
                  </span>
                </div>

                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.roleLabel}
                  </span>
                  <span className={styles.authSessionValue}>
                    {session.displayRole} ({session.account.role})
                  </span>
                </div>

                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.scopeLabel}
                  </span>
                  <span className={styles.authSessionValue}>
                    {isPlatform
                      ? t.auth.workspace.scopePlatform
                      : t.auth.workspace.scopeEnterprise}
                  </span>
                </div>

                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.workspaceKeyLabel}
                  </span>
                  <span
                    className={`${styles.authSessionValue} ${
                      session.account.workspaceKey ? styles.authSessionMono : ""
                    }`}
                  >
                    {session.account.workspaceKey ?? t.auth.workspace.notApplicable}
                  </span>
                </div>

                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.accountIdLabel}
                  </span>
                  <span
                    className={`${styles.authSessionValue} ${styles.authSessionMono}`}
                  >
                    {session.account.accountId}
                  </span>
                </div>

                <div className={styles.authSessionItem}>
                  <span className={styles.authSessionLabel}>
                    {t.auth.workspace.expiresAtLabel}
                  </span>
                  <span className={styles.authSessionValue}>{formattedExpiry}</span>
                </div>
              </div>

              <div className={styles.authActionRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setPasswordModalOpen(true)}
                >
                  <KeyRound size={15} aria-hidden="true" />
                  <span>{t.userMenu.changePassword}</span>
                </button>

                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => void verifySession(true)}
                  disabled={isRefreshingSession}
                  aria-busy={isRefreshingSession}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>
                    {isRefreshingSession
                      ? t.userMenu.verifyingSession
                      : t.userMenu.verifySession}
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  aria-busy={isLoggingOut}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>
                    {isLoggingOut ? t.userMenu.loggingOut : t.userMenu.logout}
                  </span>
                </button>
              </div>
            </Panel>

            <Panel
              title={unavailableTitle}
              action={
                <span className={styles.categoryBadge}>
                  {t.auth.workspace.modulePendingBadge}
                </span>
              }
            >
              <p className={styles.authStatusCopy}>{unavailableDesc}</p>
            </Panel>
          </div>
          )}
        </main>
      </div>

      {passwordModalOpen && (
        <div
          className={styles.builderOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isMutatingPassword) {
              setPasswordModalOpen(false);
            }
          }}
        >
          <div
            ref={passwordDialogRef}
            className={styles.builderModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-change-password-title"
            tabIndex={-1}
          >
            <div className={styles.builderHeader}>
              <div>
                <h2 id="auth-change-password-title" className={styles.builderTitle}>
                  {t.auth.password.changeTitle}
                </h2>
                <span className={styles.muted}>
                  {t.auth.password.changeSubtitle}
                </span>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setPasswordModalOpen(false)}
                disabled={isMutatingPassword}
                aria-label={t.actions.close}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.builderBody}>
              <PasswordChangeForm
                idPrefix="change-pw"
                isInitial={false}
                isSubmitting={isMutatingPassword}
                onSubmit={handleCurrentPasswordSubmit}
                onCancel={() => setPasswordModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuthenticatedWorkspace(props: AuthenticatedWorkspaceProps) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthenticatedWorkspaceContent {...props} />
      </ToastProvider>
    </LanguageProvider>
  );
}
