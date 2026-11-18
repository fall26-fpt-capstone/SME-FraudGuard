import styles from '@/components/fraudguard-dashboard/SecurityDashboard.module.css';

export default function Loading() {
  return (
    <div className={styles.loadingShell} aria-busy="true">
      <aside className={styles.loadingSidebar} aria-hidden="true">
        <div className={styles.loadingSidebarHeader}>
          <div className={`${styles.loadingSkeleton} ${styles.loadingSidebarLogoBox}`} />
          <div className={styles.loadingSidebarStack}>
            <div className={styles.loadingSkeleton} style={{ width: '72%', height: 14 }} />
            <div className={styles.loadingSkeleton} style={{ width: '48%', height: 11 }} />
          </div>
        </div>

        <div className={styles.loadingSidebarNav}>
          <div className={`${styles.loadingSkeleton} ${styles.loadingSidebarSection}`} />
          {[1, 2, 3].map((item) => (
            <div
              key={`nav-a-${item}`}
              className={`${styles.loadingSkeleton} ${styles.loadingSidebarNavItem}`}
            />
          ))}
          <div className={`${styles.loadingSkeleton} ${styles.loadingSidebarSection}`} />
          {[4, 5].map((item) => (
            <div
              key={`nav-b-${item}`}
              className={`${styles.loadingSkeleton} ${styles.loadingSidebarNavItem}`}
            />
          ))}
        </div>

        <div className={styles.loadingSidebarFooter}>
          <div className={`${styles.loadingSkeleton} ${styles.loadingSidebarAvatar}`} />
          <div className={styles.loadingSidebarStack}>
            <div className={styles.loadingSkeleton} style={{ width: '68%', height: 12 }} />
            <div className={styles.loadingSkeleton} style={{ width: '44%', height: 10 }} />
          </div>
        </div>
      </aside>

      <div className={styles.loadingWorkspace}>
        <header className={styles.loadingHeader} aria-hidden="true">
          <div className={styles.loadingHeaderLeft}>
            <span className={`${styles.loadingSkeleton} ${styles.loadingMobileMenuStub}`} />
            <div className={`${styles.loadingSkeleton} ${styles.loadingBreadcrumbBar}`} />
          </div>
          <div className={styles.loadingHeaderRight}>
            <div className={`${styles.loadingSkeleton} ${styles.loadingHeaderPill}`} />
            <div className={`${styles.loadingSkeleton} ${styles.loadingHeaderPill}`} />
          </div>
        </header>

        <main className={styles.loadingMain} aria-label="Đang tải bảng điều khiển FraudGuard">
          <h1 className={styles.loadingTitle}>FraudGuard</h1>
          <p role="status" className={styles.loadingStatusText}>
            Đang tải dữ liệu bảng điều khiển... / Loading dashboard data...
          </p>

          <div className={styles.loadingGrid} aria-hidden="true">
            {[1, 2, 3, 4].map((id) => (
              <div
                key={id}
                className={`${styles.loadingSkeleton} ${styles.loadingBlock}`}
              />
            ))}
          </div>

          <div
            aria-hidden="true"
            className={`${styles.loadingSkeleton} ${styles.loadingTable}`}
          />
        </main>
      </div>
    </div>
  );
}
