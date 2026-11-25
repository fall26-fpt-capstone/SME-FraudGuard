"use client";

import { Sun, Moon, Globe, Menu, X } from "lucide-react";
import { useState } from "react";
import { type Enterprise } from "@/types/enterprise";
import { getSectionsForRole } from "@/routes/navigation";
import { AlertNavigationGroup, type AlertNavigationProps } from "./AlertNavigationGroup";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { SecondaryView, TransactionRisk, UserProfile } from "@/types/fraudguard";
import { NotificationCenter } from "@/components/fraudguard-dashboard/NotificationCenter";
import type { InvestigationCase } from "@/types/investigation-case";
import type { LegacyCaseArchiveLike } from "@/utils/permissions";
import { UserProfileMenu } from "@/components/fraudguard-dashboard/UserProfileMenu";
import { useLanguage } from "@/context/LanguageContext";
import styles from "@/components/fraudguard-dashboard/SecurityDashboard.module.css";

interface ProductHeaderProps extends AlertNavigationProps {
  notificationTransactions?: TransactionRisk[];
  onOpenNotification?: (tx: TransactionRisk) => void;
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveLike[];
  onOpenInvestigationCase?: (caseId: string) => void;
  enterprises?: Enterprise[];
  activeViewTitle?: string;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  currentUser?: UserProfile;
  workspaceKey?: string | null;
  expiresAt?: string;
  onNavigate?: (view: SecondaryView) => void;
  onOpenChangePassword?: () => void;
  onRefreshSession?: () => void;
  isRefreshingSession?: boolean;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export function ProductHeader({
  notificationTransactions = [],
  onOpenNotification,
  investigationCases,
  legacyCaseArchive,
  onOpenInvestigationCase,
  enterprises = [],
  activeViewTitle = "FraudGuard",
  theme = "light",
  onToggleTheme,
  currentUser,
  workspaceKey,
  expiresAt,
  onNavigate,
  onOpenChangePassword,
  onRefreshSession,
  isRefreshingSession = false,
  onLogout,
  isLoggingOut = false,
  alertPlan,
  activeAlertSource,
  onAlertSourceChange,
}: ProductHeaderProps) {
  const { language, toggleLanguage, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDialogFocus(menuOpen, () => setMenuOpen(false));
  const hasAlertSubnavigation =
    alertPlan === "Subscription" || alertPlan === "Free";

  return (
    <>
      <header className={styles.productHeader}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={`${styles.button} ${styles.mobileMenuButton}`}
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={language === "vi" ? "Mở menu điều hướng" : "Open navigation"}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className={styles.headerBreadcrumb}>
            <span className={styles.breadcrumbMuted}>{t.brandName}</span>
            <span className={styles.breadcrumbDivider}>/</span>
            <span className={styles.breadcrumbCurrent}>{activeViewTitle}</span>
          </div>
        </div>

        <div className={styles.headerRight}>
          {currentUser &&
            onOpenNotification &&
            ["SME Admin", "Operator", "Investigator"].includes(currentUser.role) && (
              <NotificationCenter
                theme={theme}
                key={currentUser.id}
                userId={currentUser.id}
                transactions={notificationTransactions}
                onOpen={onOpenNotification}
                investigationCases={investigationCases}
                legacyCaseArchive={legacyCaseArchive}
                currentUser={currentUser}
                enterprises={enterprises}
                onOpenInvestigationCase={onOpenInvestigationCase}
              />
            )}

          <button
            className={styles.languageToggleBtn}
            onClick={toggleLanguage}
            title={t.switchLanguage}
            aria-label={t.switchLanguage}
            type="button"
          >
            <Globe size={15} style={{ color: "var(--security-blue)" }} aria-hidden="true" />
            <span>{t.langLabel}</span>
          </button>

          {onToggleTheme && (
            <button
              className={styles.themeToggleBtn}
              onClick={onToggleTheme}
              title={
                theme === "dark"
                  ? language === "vi"
                    ? "Chuyển sang Giao diện Sáng"
                    : "Switch to Light Theme"
                  : language === "vi"
                    ? "Chuyển sang Giao diện Tối"
                    : "Switch to Dark Theme"
              }
              aria-label={theme === "dark" ? t.themeLight : t.themeDark}
              type="button"
            >
              {theme === "dark" ? (
                <Sun size={15} color="#eda765" aria-hidden="true" />
              ) : (
                <Moon size={15} color="#7c3aed" aria-hidden="true" />
              )}
              <span>{theme === "dark" ? t.themeLight : t.themeDark}</span>
            </button>
          )}

          <UserProfileMenu
            currentUser={currentUser}
            workspaceKey={workspaceKey}
            expiresAt={expiresAt}
            onNavigate={onNavigate}
            onOpenChangePassword={onOpenChangePassword}
            onRefreshSession={onRefreshSession}
            isRefreshingSession={isRefreshingSession}
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
          />
        </div>
      </header>

      {menuOpen && (
        <div
          className={styles.mobileNavigationOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
        >
          <div
            id="mobile-navigation"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label={language === "vi" ? "Điều hướng" : "Navigation"}
            tabIndex={-1}
            className={styles.mobileNavigation}
          >
            <div className={styles.panelHeader}>
              <strong>{t.brandName}</strong>
              <button
                type="button"
                className={styles.button}
                onClick={() => setMenuOpen(false)}
                aria-label={language === "vi" ? "Đóng menu" : "Close menu"}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <nav>
              {getSectionsForRole(currentUser?.role, t).map((section) => (
                <section key={section.title}>
                  <p className={styles.sectionLabel}>{section.title}</p>
                  {section.items.map((item) =>
                    currentUser?.role === "Operator" &&
                    item.id === "recent-alerts" &&
                    hasAlertSubnavigation ? (
                      <AlertNavigationGroup
                        key={item.id}
                        alertPlan={alertPlan}
                        activeAlertSource={activeAlertSource}
                        onAlertSourceChange={(source) => {
                          onAlertSourceChange?.(source);
                          setMenuOpen(false);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        key={item.id}
                        className={styles.secondaryNavButton}
                        aria-current={activeViewTitle === item.label ? "page" : undefined}
                        onClick={() => {
                          onNavigate?.(item.id);
                          setMenuOpen(false);
                        }}
                      >
                        <item.icon size={18} aria-hidden="true" />
                        {item.label}
                      </button>
                    ),
                  )}
                </section>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
