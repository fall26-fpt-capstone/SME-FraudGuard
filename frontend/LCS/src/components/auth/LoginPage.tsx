"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Globe,
  AlertCircle,
  Info,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import type { AuthPortal, LoginNoticeReason } from "@/types/auth";
import {
  buildLoginRequestPayload,
  readPreferredTheme,
  resolveLoginPathForPortal,
  writePreferredTheme,
  type LoginValidationErrorCode,
} from "@/utils/auth";
import {
  AuthServiceError,
  fetchCurrentSession,
  loginWithCredentials,
  logoutCurrentSession,
} from "@/services/auth";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { ToastProvider } from "@/context/ToastProvider";
import styles from "./Login.module.css";

export type { LoginNoticeReason } from "@/types/auth";

export interface LoginPageProps {
  readonly portal?: AuthPortal;
  readonly initialReason?: LoginNoticeReason;
  readonly skipInitialSessionCheck?: boolean;
}

export function LoginPageContent({
  portal = "ENTERPRISE",
  initialReason,
  skipInitialSessionCheck = false,
}: LoginPageProps) {
  const router = useRouter();
  const { language, toggleLanguage, t } = useLanguage();

  // Portal is strictly fixed by the owning route (/login vs /platform/login).
  const fixedPortal: AuthPortal = portal === "PLATFORM" ? "PLATFORM" : "ENTERPRISE";
  const isEnterprise = fixedPortal === "ENTERPRISE";

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loginName, setLoginName] = useState("");
  const [workspaceKey, setWorkspaceKey] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isCheckingSession, setIsCheckingSession] = useState(!skipInitialSessionCheck);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    loginName?: string;
    workspaceKey?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState("");
  const submittedRef = useRef(false);

  useEffect(() => {
    setTheme(readPreferredTheme());
  }, []);

  useEffect(() => {
    if (skipInitialSessionCheck) {
      setIsCheckingSession(false);
      return;
    }

    const controller = new AbortController();

    if (initialReason === "session_expired") {
      void logoutCurrentSession({ signal: controller.signal }).finally(() => {
        if (!controller.signal.aborted) {
          setIsCheckingSession(false);
        }
      });
      return () => controller.abort();
    }

    fetchCurrentSession({ signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted && !submittedRef.current) {
          router.replace("/fraud-monitoring");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsCheckingSession(false);
        }
      });

    return () => controller.abort();
  }, [initialReason, router, skipInitialSessionCheck]);

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      writePreferredTheme(next);
      return next;
    });
  };

  const mapFieldValidationMessage = (code: LoginValidationErrorCode): string => {
    const errors = t.auth.login.errors;
    switch (code) {
      case "LOGIN_REQUIRED":
        return errors.loginRequired;
      case "LOGIN_TOO_LONG":
        return errors.loginTooLong;
      case "WORKSPACE_REQUIRED":
        return errors.workspaceRequired;
      case "WORKSPACE_TOO_LONG":
        return errors.workspaceTooLong;
      case "PASSWORD_REQUIRED":
        return errors.passwordRequired;
      case "PASSWORD_TOO_LONG":
        return errors.passwordTooLong;
      default:
        return errors.validationError;
    }
  };

  const mapServiceErrorMessage = (error: unknown): string => {
    const errors = t.auth.login.errors;
    if (error instanceof AuthServiceError) {
      switch (error.code) {
        case "INVALID_CREDENTIALS":
          return isEnterprise
            ? errors.invalidEnterpriseCredentials
            : errors.invalidPlatformCredentials;
        case "BACKEND_UNAVAILABLE":
          return errors.backendUnavailable;
        case "CSRF_REJECTED":
          return errors.csrfRejected;
        case "VALIDATION_ERROR":
          return errors.validationError;
        default:
          return errors.unexpectedError;
      }
    }
    return errors.unexpectedError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError("");

    const validation = buildLoginRequestPayload({
      loginName,
      password,
      portal: fixedPortal,
      workspaceKey: isEnterprise ? workspaceKey : null,
    });

    if (!validation.ok) {
      const msg = mapFieldValidationMessage(validation.code);
      if (
        validation.field === "loginName" ||
        validation.field === "workspaceKey" ||
        validation.field === "password"
      ) {
        setFieldErrors({ [validation.field]: msg });
      } else {
        setFormError(msg);
      }
      return;
    }

    submittedRef.current = true;
    setIsSubmitting(true);

    try {
      await loginWithCredentials(validation.payload);
      setPassword("");
      router.replace("/fraud-monitoring");
    } catch (err) {
      submittedRef.current = false;
      setFormError(mapServiceErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  const noticeConfig = (() => {
    if (!initialReason || formError) return null;
    const notices = t.auth.login.notices;
    switch (initialReason) {
      case "auth_required":
        return { tone: "info" as const, text: notices.authRequired };
      case "session_expired":
        return { tone: "warning" as const, text: notices.sessionExpired };
      case "signed_out":
        return { tone: "info" as const, text: notices.signedOut };
      case "logout_expired":
        return { tone: "info" as const, text: notices.logoutExpiredToken };
      case "logout_unconfirmed":
        return { tone: "warning" as const, text: notices.logoutUnconfirmed };
      default:
        return null;
    }
  })();

  const loginCopy = t.auth.login;
  const headingText = isEnterprise
    ? loginCopy.enterpriseHeading
    : loginCopy.platformHeading;
  const loginPlaceholder = isEnterprise
    ? loginCopy.enterpriseLoginPlaceholder
    : loginCopy.platformLoginPlaceholder;
  const heroSubtitleText = isEnterprise
    ? loginCopy.enterpriseHeroSubtitle
    : loginCopy.platformHeroSubtitle;

  return (
    <div className={styles.wrapper} data-theme={theme}>
      <div className={styles.leftPanel}>
        <header className={styles.topBar}>
          <a href={resolveLoginPathForPortal(fixedPortal)} className={styles.brandLogo}>
            <div className={styles.logoIconWrapper} aria-hidden="true">
              <Shield size={19} />
            </div>
            <span className={styles.brandTitle}>{t.brandName}</span>
          </a>

          <div className={styles.topBarActions}>
            <button
              type="button"
              className={styles.mobileLangBtn}
              onClick={toggleLanguage}
              title={t.switchLanguage}
              aria-label={t.switchLanguage}
            >
              <Globe size={15} aria-hidden="true" />
              <span>{t.langLabel}</span>
            </button>

            <button
              type="button"
              className={styles.themeToggleBtn}
              onClick={handleToggleTheme}
              title={
                theme === "dark"
                  ? language === "vi"
                    ? "Chuyển sang giao diện sáng"
                    : "Switch to light theme"
                  : language === "vi"
                    ? "Chuyển sang giao diện tối"
                    : "Switch to dark theme"
              }
              aria-label={theme === "dark" ? t.themeLight : t.themeDark}
            >
              {theme === "dark" ? (
                <Sun size={15} color="#eda765" aria-hidden="true" />
              ) : (
                <Moon size={15} color="#7c3aed" aria-hidden="true" />
              )}
              <span>{theme === "dark" ? t.themeLight : t.themeDark}</span>
            </button>
          </div>
        </header>

        <main className={styles.mainContent}>
          <h1 className={styles.heading}>{headingText}</h1>

          {noticeConfig && (
            <div
              className={
                noticeConfig.tone === "warning"
                  ? styles.warningBanner
                  : styles.noticeBanner
              }
              role="status"
            >
              <Info size={16} className={styles.bannerIcon} aria-hidden="true" />
              <span>{noticeConfig.text}</span>
            </div>
          )}

          {formError && (
            <div className={styles.errorAlert} role="alert">
              <AlertCircle size={16} className={styles.bannerIcon} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {isCheckingSession && (
            <div className={styles.noticeBanner} role="status" aria-live="polite">
              <span>{loginCopy.checkingSession}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="login-identifier">
                {loginCopy.loginNameLabel}
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="login-identifier"
                  name="loginName"
                  type="text"
                  className={styles.input}
                  placeholder={loginPlaceholder}
                  value={loginName}
                  onChange={(e) => {
                    setLoginName(e.target.value);
                    if (fieldErrors.loginName) {
                      setFieldErrors((prev) => ({ ...prev, loginName: undefined }));
                    }
                  }}
                  autoComplete="username"
                  maxLength={128}
                  aria-invalid={Boolean(fieldErrors.loginName)}
                  aria-describedby={
                    fieldErrors.loginName ? "login-identifier-error" : undefined
                  }
                  required
                />
              </div>
              {fieldErrors.loginName && (
                <p id="login-identifier-error" className={styles.fieldError} role="alert">
                  {fieldErrors.loginName}
                </p>
              )}
            </div>

            {isEnterprise && (
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="login-workspace">
                  {loginCopy.workspaceLabel}
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="login-workspace"
                    name="workspaceKey"
                    type="text"
                    className={styles.input}
                    placeholder={loginCopy.workspacePlaceholder}
                    value={workspaceKey}
                    onChange={(e) => {
                      setWorkspaceKey(e.target.value);
                      if (fieldErrors.workspaceKey) {
                        setFieldErrors((prev) => ({ ...prev, workspaceKey: undefined }));
                      }
                    }}
                    autoComplete="organization"
                    maxLength={64}
                    aria-invalid={Boolean(fieldErrors.workspaceKey)}
                    aria-describedby={
                      fieldErrors.workspaceKey
                        ? "login-workspace-error"
                        : "login-workspace-hint"
                    }
                    required
                  />
                </div>
                <p id="login-workspace-hint" className={styles.fieldHint}>
                  {loginCopy.workspaceHint}
                </p>
                {fieldErrors.workspaceKey && (
                  <p id="login-workspace-error" className={styles.fieldError} role="alert">
                    {fieldErrors.workspaceKey}
                  </p>
                )}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="login-password">
                {loginCopy.passwordLabel}
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className={`${styles.input} ${styles.inputWithIcon}`}
                  placeholder={loginCopy.passwordPlaceholder}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  autoComplete="current-password"
                  maxLength={72}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? "login-password-error" : undefined
                  }
                  required
                />
                <button
                  type="button"
                  className={styles.togglePasswordBtn}
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={
                    showPassword
                      ? loginCopy.hidePasswordAria
                      : loginCopy.showPasswordAria
                  }
                  aria-label={
                    showPassword
                      ? loginCopy.hidePasswordAria
                      : loginCopy.showPasswordAria
                  }
                >
                  {showPassword ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="login-password-error" className={styles.fieldError} role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              className={styles.signInBtn}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className={styles.spinner} aria-hidden="true" />
                  <span>{loginCopy.submittingBtn}</span>
                </>
              ) : (
                <span>{loginCopy.submitBtn}</span>
              )}
            </button>
          </form>
        </main>

        <footer className={styles.leftFooter}>{loginCopy.footerNote}</footer>
      </div>

      <aside className={styles.rightPanel} aria-labelledby="login-hero-title">
        <div className={styles.rightTopBar}>
          <button
            type="button"
            className={styles.rightLangBtn}
            onClick={toggleLanguage}
            aria-label={t.switchLanguage}
          >
            <Globe size={15} /> {language === "vi" ? "Tiếng Việt" : "English"}{" "}
            <ChevronDown size={14} />
          </button>
        </div>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>FraudGuard Connect 2026</div>
          <h2 id="login-hero-title" className={styles.heroTitle}>
            Where Enterprise &amp; SME Fraud Defense Connects.
          </h2>
          <p className={styles.heroSubtitle}>{heroSubtitleText}</p>
          <a className={styles.heroCtaBtn} href="#login-identifier">
            <ExternalLink size={14} /> {loginCopy.submitBtn}
          </a>
        </div>
      </aside>
    </div>
  );
}

export function LoginPage(props: LoginPageProps) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <LoginPageContent {...props} />
      </ToastProvider>
    </LanguageProvider>
  );
}
