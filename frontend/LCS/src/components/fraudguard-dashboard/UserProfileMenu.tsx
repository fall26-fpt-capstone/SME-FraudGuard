"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Clock,
  KeyRound,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import type { SecondaryView, UserProfile } from "@/types/fraudguard";
import { PermissionMatrixModal } from "./PermissionMatrixModal";
import { useLanguage } from "@/context/LanguageContext";
import { resolveLoginPathForPortal, resolvePortalForRole } from "@/utils/auth";
import styles from "./SecurityDashboard.module.css";

interface UserProfileMenuProps {
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

export function UserProfileMenu({
  currentUser,
  workspaceKey,
  expiresAt,
  onOpenChangePassword,
  onRefreshSession,
  isRefreshingSession = false,
  onLogout,
  isLoggingOut = false,
}: UserProfileMenuProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleLogoutClick = () => {
    setMenuOpen(false);
    if (onLogout) {
      onLogout();
      return;
    }
    router.push(resolveLoginPathForPortal(resolvePortalForRole(currentUser?.role)));
  };

  const roleBadgeClass = () => {
    switch (currentUser?.role) {
      case "Platform Admin":
        return styles.roleBadgePlatformAdmin;
      case "Implementation Staff":
        return styles.roleBadgeOperation;
      case "SME Admin":
        return styles.roleBadgeSMEAdmin;
      case "Operator":
        return styles.roleBadgeOperation;
      case "Investigator":
        return styles.roleBadgeInvestigator;
      default:
        return "";
    }
  };

  const resolvedWorkspace = workspaceKey ?? currentUser?.enterpriseId ?? null;
  const scopeText =
    currentUser?.role === "Platform Admin" ||
    currentUser?.role === "Implementation Staff"
      ? t.userMenu.platformScope
      : resolvedWorkspace
        ? t.userMenu.workspaceScope.replace("{workspace}", resolvedWorkspace)
        : "";

  const formattedExpiry = (() => {
    if (!expiresAt) return "";
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  })();

  return (
    <>
      <div className={styles.userMenuContainer} ref={containerRef}>
        <button
          className={styles.userMenuTrigger}
          onClick={() => setMenuOpen((prev) => !prev)}
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label={t.userMenu.title}
          title={t.userMenu.title}
        >
          <div
            className={styles.userMenuAvatar}
            style={{ backgroundColor: currentUser?.avatarBg || "#1d4ed8" }}
            aria-hidden="true"
          >
            {currentUser?.avatarLetter || "U"}
            <span
              className={styles.avatarOnlineDot}
              title={t.userMenu.online}
            />
          </div>

          <ChevronDown
            size={13}
            className={`${styles.userMenuChevron} ${menuOpen ? styles.userMenuChevronRotated : ""}`}
            aria-hidden="true"
          />
        </button>

        {menuOpen && (
          <div className={styles.userDropdownMenu} role="menu">
            <div className={styles.userDropdownHeader}>
              <div
                className={styles.userDropdownAvatarLarge}
                style={{ backgroundColor: currentUser?.avatarBg || "#1d4ed8" }}
                aria-hidden="true"
              >
                {currentUser?.avatarLetter || "U"}
              </div>

              <div className={styles.userDropdownMeta}>
                <div className={styles.userDropdownName}>
                  {currentUser?.name || ""}
                </div>
                {scopeText && (
                  <div className={styles.userDropdownEmail}>{scopeText}</div>
                )}
                <div className={styles.userDropdownRoleRow}>
                  {currentUser?.role && (
                    <span className={`${styles.roleBadge} ${roleBadgeClass()}`}>
                      {currentUser.role}
                    </span>
                  )}
                  <span className={styles.userStatusPill}>
                    <span className={styles.statusDotGreen} /> {t.userMenu.online}
                  </span>
                </div>
              </div>
            </div>

            {formattedExpiry && (
              <div className={styles.userDropdownSection}>
                <div className={styles.userPreferenceItem}>
                  <div className={styles.userPrefIcon}>
                    <Clock size={15} color="var(--security-blue)" aria-hidden="true" />
                  </div>
                  <div className={styles.userPrefContent}>
                    <div className={styles.userPrefLabel}>
                      {t.userMenu.sessionExpiresAt.replace("{time}", formattedExpiry)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.userDropdownSection}>
              <div className={styles.userDropdownSectionTitle}>
                {t.userMenu.shortcuts}
              </div>

              {onOpenChangePassword && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.userDropdownLinkBtn}
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenChangePassword();
                  }}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  <span>{t.userMenu.changePassword}</span>
                </button>
              )}

              {onRefreshSession && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.userDropdownLinkBtn}
                  disabled={isRefreshingSession}
                  onClick={() => {
                    setMenuOpen(false);
                    onRefreshSession();
                  }}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>
                    {isRefreshingSession
                      ? t.userMenu.verifyingSession
                      : t.userMenu.verifySession}
                  </span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                className={styles.userDropdownLinkBtn}
                onClick={() => {
                  setMenuOpen(false);
                  setMatrixOpen(true);
                }}
              >
                <ShieldCheck size={14} aria-hidden="true" />
                <span>{t.userMenu.rbac}</span>
              </button>
            </div>

            <div className={styles.userDropdownFooter}>
              <button
                type="button"
                role="menuitem"
                className={styles.userLogoutBtn}
                disabled={isLoggingOut}
                onClick={handleLogoutClick}
              >
                <LogOut size={15} aria-hidden="true" />
                <span>
                  {isLoggingOut ? t.userMenu.loggingOut : t.userMenu.logout}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <PermissionMatrixModal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
      />
    </>
  );
}
