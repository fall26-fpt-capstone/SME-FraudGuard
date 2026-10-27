"use client";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import type { TransactionRisk } from './types';
import { notificationFeed, notificationId, notificationLabel, notificationTime } from '@/lib/notification-feed';
import { useLanguage } from './i18n/LanguageContext';
import { useDialogFocus } from './useDialogFocus';
import styles from './SecurityDashboard.module.css';

export function NotificationCenter({ userId, transactions, onOpen, theme = 'dark' }: {
 theme?: 'dark' | 'light'; userId: string; transactions: TransactionRisk[]; onOpen: (tx: TransactionRisk) => void;
}) {
 const { language } = useLanguage();
 const vi = language === 'vi';
 const [open, setOpen] = useState(false);
 const [read, setRead] = useState<string[]>([]);
 const [loaded, setLoaded] = useState(false);
 const [error, setError] = useState(false);
 const [limit, setLimit] = useState(20);
 const ref = useDialogFocus(open, () => setOpen(false));
 const storageKey = 'fraudguard.notifications.read.' + userId;
 useEffect(() => {
  try {
   const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
   setRead(Array.isArray(data) ? data.filter(id => typeof id === 'string') : []);
   setError(false);
  } catch { setRead([]); setError(true); }
  setLoaded(true);
 }, [storageKey]);
 const entries = notificationFeed(transactions);
 const unread = entries.filter(tx => !read.includes(notificationId(tx))).length;
 function mark(ids: string[]) {
  const next = [...new Set([...read, ...ids])];
  setRead(next);
  try { localStorage.setItem(storageKey, JSON.stringify(next)); setError(false); }
  catch { setError(true); }
 }
 return <>
  <button className={styles.button} disabled={!loaded} aria-haspopup="dialog" aria-expanded={open}
   aria-label={vi ? 'Thông báo: ' + unread + ' chưa đọc' : 'Notifications: ' + unread + ' unread'}
   onClick={() => { setLimit(20); setOpen(true); }}><Bell size={17} /> {loaded && unread > 0 ? unread : ''}</button>
  {open && createPortal(<div data-theme={theme} style={{ color: 'var(--security-text)' }} className={styles.builderOverlay} onClick={e => { if(e.target === e.currentTarget) setOpen(false); }}>
   <section className={styles.builderModal} ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-label={vi ? 'Thông báo' : 'Notifications'}>
    <div className={styles.builderHeader}><h2 className={styles.builderTitle}>{vi ? 'Thông báo' : 'Notifications'}</h2><button className={styles.button} onClick={() => setOpen(false)} aria-label={vi ? 'Đóng' : 'Close'}><X size={18} /></button></div>
    <div className={styles.builderBody}>
     <button className={styles.button} disabled={!unread} onClick={() => mark(entries.map(notificationId))}>{vi ? 'Đánh dấu tất cả đã đọc' : 'Mark all as read'}</button>
     {!entries.length && <p>{vi ? 'Bạn chưa có thông báo.' : 'You have no notifications.'}</p>}
     {entries.slice(0, limit).map(tx => {
      const time = notificationTime(tx);
      return <article className={styles.panel} key={notificationId(tx)}>
       <strong>{notificationLabel(tx, vi)}</strong><p>{tx.transactionReference} · {read.includes(notificationId(tx)) ? (vi ? 'Đã đọc' : 'Read') : (vi ? 'Chưa đọc' : 'Unread')}</p>
       {time && <time dateTime={time}>{new Date(time).toLocaleString(vi ? 'vi-VN' : 'en-US')}</time>}
       <p>{tx.explanation}</p>
       <button className={styles.button} onClick={() => { mark([notificationId(tx)]); setOpen(false); onOpen(tx); }}>{vi ? 'Xem chi tiết' : 'View details'}</button>
      </article>;
     })}
     {entries.length > limit && <button className={styles.button} onClick={() => setLimit(value => value + 20)}>{vi ? 'Xem thêm thông báo' : 'Show more notifications'}</button>}
     {error && <p role="alert">{vi ? 'Không thể đọc hoặc lưu trạng thái thông báo trên trình duyệt.' : 'Unable to read or save notification status in this browser.'}</p>}
    </div>
   </section>
  </div>, document.body)}
 </>;
}
