"use client";

import { useMemo } from "react";
import { Shield, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "@/components/fraudguard-dashboard/SecurityDashboard.module.css";
import type { UserProfile } from "@/types/fraudguard";
import { useLanguage } from "@/context/LanguageContext";
import { getSectionsForRole } from "@/routes/navigation";

interface SidebarProps {
  activeItem: string;
  onItemChange: (id: string) => void;
  currentUser?: UserProfile;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  activeItem,
  onItemChange,
  currentUser,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { t, language } = useLanguage();
  const navSections = useMemo(
    () => getSectionsForRole(currentUser?.role, t),
    [currentUser?.role, t],
  );

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}
      aria-label="Main navigation"
    >
      {/* Brand Logo & Collapse Header */}
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo} title="FraudGuard Platform">
          <div className={styles.logoIcon}>
            <Shield size={20} />
          </div>
          <div className={styles.logoText}>
            <span className={styles.logoTitle}>{t.brandName}</span>
            <div className={styles.logoMeta}>
            <span className={styles.logoSub}>
              {currentUser?.role === "Platform Admin"
                ? t.roles.platformAdmin
                : currentUser?.role === "Implementation Staff"
                ? (language === "vi" ? "Triển khai" : "Deployment")
                : currentUser?.role === "Viewer"
                ? t.roles.viewer
                : currentUser?.role === "Operator"
                ? t.roles.operation
                : currentUser?.role === "Investigator"
                ? t.roles.investigator
                : t.roles.smeAdmin}
            </span>
          <span className={styles.planBadge}>
            {currentUser?.role === "Platform Admin"
              ? t.roles.superBadge
              : currentUser?.role === "Implementation Staff"
                ? "DEPLOY"
                : currentUser?.role === "Viewer"
              ? t.roles.auditBadge
              : currentUser?.role === "Operator"
              ? t.roles.opsBadge
              : currentUser?.role === "Investigator"
              ? t.roles.fieldBadge
              : t.roles.smeBadge}
          </span>
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
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        )}
      </div>

      {/* Nav Menu */}
      <nav className={styles.sidebarNav}>
        {navSections.map((section) => (
          <div key={section.title} className={styles.navSection}>
            <div className={styles.sectionLabel}>{section.title}</div>
            {section.items.map((item) => {
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
                  type="button"
                >
                  <span className={styles.navItemIcon}>
                    <Icon size={16} />
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

      {/* Bottom Health & User Profile */}
      <div className={styles.sidebarBottom}>
        <div
          className={styles.systemStatus}
          title="FraudGuard"
        >
          <div className={styles.statusItem}>

            <span>{language === 'vi' ? 'Không gian làm việc FraudGuard' : 'FraudGuard workspace'}</span>
          </div>

        </div>

        <a
          href="/login"
          className={styles.sidebarUserCard}
          title={
            language === "vi"
              ? `Tài khoản: ${currentUser ? currentUser.name : "SME Admin"} (${currentUser ? currentUser.role : "Security Lead"}) - Bấm để Đăng xuất`
              : `Account: ${currentUser ? currentUser.name : "SME Admin"} (${currentUser ? currentUser.role : "Security Lead"}) - Click to Log out`
          }
        >
          <div
            className={styles.avatar}
            style={currentUser ? { backgroundColor: currentUser.avatarBg } : undefined}
          >
            {currentUser ? currentUser.avatarLetter : "A"}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{currentUser ? currentUser.name : "SME Admin"}</span>
            <span className={styles.userRole}>{currentUser ? currentUser.role : "Security Lead"}</span>
          </div>
          <LogOut size={14} className={styles.logoutIcon} />
        </a>
      </div>
    </aside>
  );
}
