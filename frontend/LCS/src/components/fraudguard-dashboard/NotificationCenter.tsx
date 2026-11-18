"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import type { Enterprise } from "@/types/enterprise";
import type { TransactionRisk, UserProfile } from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type { LegacyCaseArchiveLike } from "@/utils/permissions";
import {
  buildCaseNotifications,
  notificationFeed,
  notificationId,
  notificationLabel,
  notificationTime,
  type NotificationItem,
} from "@/utils/notification-feed";
import { useLanguage } from "@/context/LanguageContext";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import styles from "./SecurityDashboard.module.css";

interface NotificationCenterProps {
  theme?: "dark" | "light";
  userId: string;
  transactions: TransactionRisk[];
  onOpen: (tx: TransactionRisk) => void;
  investigationCases?: readonly InvestigationCase[];
  legacyCaseArchive?: readonly LegacyCaseArchiveLike[];
  currentUser?: UserProfile;
  enterprises?: Enterprise[];
  onOpenInvestigationCase?: (caseId: string) => void;
}

export function NotificationCenter({
  userId,
  transactions,
  onOpen,
  theme = "dark",
  investigationCases,
  legacyCaseArchive,
  currentUser,
  enterprises,
  onOpenInvestigationCase,
}: NotificationCenterProps) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(20);
  const ref = useDialogFocus(open, () => setOpen(false));
  const storageKey = "fraudguard.notifications.read." + userId;

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setRead(Array.isArray(data) ? data.filter((id) => typeof id === "string") : []);
      setError(false);
    } catch {
      setRead([]);
      setError(true);
    }
    setLoaded(true);
  }, [storageKey]);

  const entries: NotificationItem[] = useMemo(() => {
    if (currentUser && enterprises) {
      return buildCaseNotifications({
        transactions,
        investigationCases: investigationCases ?? [],
        legacyArchive: legacyCaseArchive ?? [],
        currentUser,
        enterprises,
        vi,
      });
    }
    return notificationFeed(transactions).map((tx) => ({
      id: notificationId(tx),
      kind: "alert" as const,
      label: notificationLabel(tx, vi),
      time: notificationTime(tx),
      reference: tx.transactionReference,
      transaction: tx,
    }));
  }, [transactions, investigationCases, legacyCaseArchive, currentUser, enterprises, vi]);

  const unread = entries.filter((item) => !read.includes(item.id)).length;

  function mark(ids: string[]) {
    const next = [...new Set([...read, ...ids])];
    setRead(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setError(false);
    } catch {
      setError(true);
    }
  }

  function handleOpenItem(item: NotificationItem) {
    mark([item.id]);
    setOpen(false);
    if (item.kind === "case" && item.caseId && onOpenInvestigationCase) {
      onOpenInvestigationCase(item.caseId);
      return;
    }
    if (item.transaction) {
      onOpen(item.transaction);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        disabled={!loaded}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={vi ? "Thông báo: " + unread + " chưa đọc" : "Notifications: " + unread + " unread"}
        onClick={() => {
          setLimit(20);
          setOpen(true);
        }}
      >
        <Bell size={17} /> {loaded && unread > 0 ? unread : ""}
      </button>
      {open &&
        createPortal(
          <div
            data-theme={theme}
            style={{ color: "var(--security-text)" }}
            className={styles.builderOverlay}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <section
              className={styles.builderModal}
              ref={ref}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              aria-label={vi ? "Thông báo" : "Notifications"}
            >
              <div className={styles.builderHeader}>
                <h2 className={styles.builderTitle}>{vi ? "Thông báo" : "Notifications"}</h2>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setOpen(false)}
                  aria-label={vi ? "Đóng" : "Close"}
                >
                  <X size={18} />
                </button>
              </div>
              <div className={styles.builderBody}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!unread}
                  onClick={() => mark(entries.map((item) => item.id))}
                >
                  {vi ? "Đánh dấu tất cả đã đọc" : "Mark all as read"}
                </button>
                {!entries.length && (
                  <p>{vi ? "Bạn chưa có thông báo." : "You have no notifications."}</p>
                )}
                {entries.slice(0, limit).map((item) => {
                  const canOpenItem =
                    Boolean(item.kind === "case" && item.caseId && onOpenInvestigationCase) ||
                    Boolean(item.transaction);
                  const summaryText =
                    item.kind === "case" && item.investigationCase
                      ? vi
                        ? `${item.investigationCase.alertIds.length} cảnh báo liên kết`
                        : `${item.investigationCase.alertIds.length} linked alerts`
                      : item.transaction?.explanation;

                  return (
                    <article className={styles.panel} key={item.id}>
                      <strong>{item.label}</strong>
                      <p>
                        {item.reference} ·{" "}
                        {read.includes(item.id)
                          ? vi
                            ? "Đã đọc"
                            : "Read"
                          : vi
                            ? "Chưa đọc"
                            : "Unread"}
                      </p>
                      {item.time && (
                        <time dateTime={item.time}>
                          {new Date(item.time).toLocaleString(vi ? "vi-VN" : "en-US")}
                        </time>
                      )}
                      {summaryText && <p>{summaryText}</p>}
                      {canOpenItem && (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => handleOpenItem(item)}
                        >
                          {vi ? "Xem chi tiết" : "View details"}
                        </button>
                      )}
                    </article>
                  );
                })}
                {entries.length > limit && (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setLimit((value) => value + 20)}
                  >
                    {vi ? "Xem thêm thông báo" : "Show more notifications"}
                  </button>
                )}
                {error && (
                  <p role="alert">
                    {vi
                      ? "Không thể đọc hoặc lưu trạng thái thông báo trên trình duyệt."
                      : "Unable to read or save notification status in this browser."}
                  </p>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
