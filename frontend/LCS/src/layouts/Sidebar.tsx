"use client";

import { useMemo } from "react";
import { Shield, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "@/components/fraudguard-dashboard/SecurityDashboard.module.css";
import type { UserProfile } from "@/types/fraudguard";
import { useLanguage } from "@/context/LanguageContext";
import { getSectionsForRole } from "@/routes/navigation";
import { resolveLoginPathForPortal, resolvePortalForRole } from "@/utils/auth";
import { AlertNavigationGroup, type AlertNavigationProps } from "./AlertNavigationGroup";

interface SidebarProps extends AlertNavigationProps {
  activeItem: string;
  onItemChange: (id: string) => void;
  currentUser?: UserProfile;
  workspaceId?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export function Sidebar({
  activeItem,
  onItemChange,
  currentUser,
  workspaceId,
  isCollapsed = false,
  onToggleCollapse,
  onLogout,
  isLoggingOut = false,
  alertPlan,
  activeAlertSource,
  onAlertSourceChange,
}: SidebarProps) {
  const { t, language } = useLanguage();
  const navSections = useMemo(
    () => getSectionsForRole(currentUser?.role, t),
    [currentUser?.role, t],
  );
  const hasAlertSubnavigation =
    alertPlan === "Subscription" || alertPlan === "Free";

  const roleLabel =
    currentUser?.role === "Platform Admin"
      ? t.roles.platformAdmin
      : currentUser?.role === "Implementation Staff"
        ? language === "vi"
          ? "Triển khai"
          : "Deployment"
        : currentUser?.role === "Operator"
          ? t.roles.operation
          : currentUser?.role === "Investigator"
            ? t.roles.investigator
            : t.roles.smeAdmin;

  const roleBadge =
    currentUser?.role === "Platform Admin"
      ? t.roles.superBadge
      : currentUser?.role === "Implementation Staff"
        ? "DEPLOY"
        : currentUser?.role === "Operator"
          ? t.roles.opsBadge
          : currentUser?.role === "Investigator"
            ? t.roles.fieldBadge
            : t.roles.smeBadge;

  const accountDisplayName = currentUser?.name || "";
  const resolvedWorkspace = workspaceId ?? currentUser?.enterpriseId ?? null;
  const scopeLabel = resolvedWorkspace
    ? t.userMenu.workspaceScope.replace("{workspace}", resolvedWorkspace)
    : language === "vi"
      ? "Không gian làm việc FraudGuard"
      : "FraudGuard workspace";

  const logoutTitle = currentUser
    ? language === "vi"
      ? `Tài khoản: ${accountDisplayName} (${roleLabel}), bấm để đăng xuất`
      : `Account: ${accountDisplayName} (${roleLabel}), click to sign out`
    : t.userMenu.logout;

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}
      aria-label="Main navigation"
    >
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo} title="FraudGuard Platform">
          <div className={styles.logoIcon}>
            <Shield size={20} aria-hidden="true" />
          </div>
          <div className={styles.logoText}>
            <span className={styles.logoTitle}>{t.brandName}</span>
            <div className={styles.logoMeta}>
              <span className={styles.logoSub}>{roleLabel}</span>
              <span className={styles.planBadge}>{roleBadge}</span>
            </div>
          </div>
        </div>

        {onToggleCollapse && (
          <button
            className={styles.sidebarCollapseBtn}
            onClick={onToggleCollapse}
            title={
              isCollapsed
                ? language === "vi"
                  ? "Mở rộng sidebar (Ctrl+B)"
                  : "Expand sidebar (Ctrl+B)"
                : language === "vi"
                  ? "Thu gọn sidebar (Ctrl+B)"
                  : "Collapse sidebar (Ctrl+B)"
            }
            aria-label={
              isCollapsed
                ? language === "vi"
                  ? "Mở rộng thanh bên"
                  : "Expand sidebar"
                : language === "vi"
                  ? "Thu gọn thanh bên"
                  : "Collapse sidebar"
            }
            type="button"
          >
            {isCollapsed ? (
              <ChevronRight size={15} aria-hidden="true" />
            ) : (
              <ChevronLeft size={15} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <nav className={styles.sidebarNav}>
        {navSections.map((section) => (
          <div key={section.title} className={styles.navSection}>
            <div className={styles.sectionLabel}>{section.title}</div>
            {section.items.map((item) => {
              if (
                currentUser?.role === "Operator" &&
                item.id === "recent-alerts" &&
                hasAlertSubnavigation
              ) {
                return (
                  <AlertNavigationGroup
                    key={item.id}
                    alertPlan={alertPlan}
                    activeAlertSource={activeAlertSource}
                    onAlertSourceChange={onAlertSourceChange}
                    collapsed={isCollapsed}
                    onExpand={onToggleCollapse}
                  />
                );
              }
              const Icon = item.icon;
              const isActive = activeItem === item.id;
              return (
                <button
                  key={item.id}
                  className={`${styles.secondaryNavButton} ${
                    isActive ? styles.secondaryNavButtonActive : ""
                  }`}
                  onClick={() => onItemChange(item.id)}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  type="button"
                >
                  <span className={styles.navItemIcon}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className={styles.navItemText}>{item.label}</span>
                  {item.badge && (
                    <span className={styles.navItemBadge}>{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.sidebarBottom}>
        <div className={styles.systemStatus} title={scopeLabel}>
          <div className={styles.statusItem}>
            <span>{scopeLabel}</span>
          </div>
        </div>

        {onLogout ? (
          <button
            type="button"
            className={styles.sidebarUserCard}
            onClick={onLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            title={logoutTitle}
          >
            <div
              className={styles.avatar}
              style={currentUser ? { backgroundColor: currentUser.avatarBg } : undefined}
              aria-hidden="true"
            >
              {currentUser?.avatarLetter || "U"}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{accountDisplayName}</span>
              <span className={styles.userRole}>
                {isLoggingOut ? t.userMenu.loggingOut : roleLabel}
              </span>
            </div>
            <LogOut size={14} className={styles.logoutIcon} aria-hidden="true" />
          </button>
        ) : (
          <a
            href={resolveLoginPathForPortal(resolvePortalForRole(currentUser?.role))}
            className={styles.sidebarUserCard}
            title={logoutTitle}
          >
            <div
              className={styles.avatar}
              style={currentUser ? { backgroundColor: currentUser.avatarBg } : undefined}
              aria-hidden="true"
            >
              {currentUser?.avatarLetter || "U"}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{accountDisplayName}</span>
              <span className={styles.userRole}>{roleLabel}</span>
            </div>
            <LogOut size={14} className={styles.logoutIcon} aria-hidden="true" />
          </a>
        )}
      </div>
    </aside>
  );
}
