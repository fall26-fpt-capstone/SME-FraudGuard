# Guide to building the FraudGuard Dashboard UI with React + Next.js

> HISTORICAL REFERENCE — Follow [UI_RULES.md](UI_RULES.md) and `../../AGENTS.md` for current work. The examples below contain old paths, scores/thresholds and permission matrices; do not copy them unchanged into the current system.

> Current font, dimension and component standards: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Current implementation direction

- Detection outcomes: Normal/Abnormal/Undetermined, without risk scores. Matching at least one applicable rule → Abnormal; the enterprise decides the response.
- One rule set per enterprise; Deployment Staff handle drafts, testing, review, release, activation and handover. Platform Admin only administers; SMEs see the handed-over version.
- Use `transactionsForEnterprise` to supply scoped data for dashboards, alerts, cases and reports; exports and filters derive from the same source. This is frontend demo scoping only, not a replacement for backend authorization.
- Desktop uses Sidebar; mobile has a menu in ProductHeader using the shared `getSectionsForRole`. Do not let navigation disappear below 900px.
- Modals/drawers use `useDialogFocus`, aria-modal and an accessible title. Forms have labels/aria-labels.
- Use `--action-bg`/`--action-text` tokens for CTAs, semantic tokens for states, 40px desktop/44px mobile controls, and 5px panel radius.
- Route `/fraud-monitoring` has loading.tsx and error.tsx. Per-panel API errors should follow the same pattern when the backend is ready.
- “Switch demo account” shows individual accounts, roles and scopes; do not call an account list a role list.

## Baseline 1.0 — reference structure example

This document adapts the sample dashboard style into a UI for **FraudGuard-as-a-Service**: a multi-tenant SaaS platform detecting abnormal transactions for SMEs. It follows the proposal: ingest transactions through API or CSV/Excel, score with the Dynamic Rule Engine or AI, normalize risk scores to 0–100 through the Risk Score Gateway, create alerts/cases and support investigators.

> FraudGuard only alerts and supports decision-making. The UI must not present risk scores as a legal conclusion that a transaction is definitely fraudulent, or provide actions that automatically block accounts or cancel transactions.

### Dashboard scope according to the proposal

| Area | FraudGuard content |
|---|---|
| Overview | Analyzed transactions, risk distribution, open alerts, cases in progress |
| Transactions | Transaction ID, transaction type, project, risk score, risk level, scoring source |
| Alerts | Alerts exceeding thresholds, triggered rules or AI explanations |
| Cases | Assignment, notes and states Open, Reviewing, Confirmed Fraud, False Alarm, Resolved |
| Rules | Rule templates, AND/OR conditions, risk points, thresholds and enable/disable |
| Reports | Reports by project, time, transaction type, risk level and case status |
| Platform health | Backend, AI Service and queue status, and rule fallback counts |

The main roles are `Platform Admin`, `SME Admin`, `Risk/Operation Staff` and `Viewer/Auditor`. Every screen must check the role and tenant/project scope.

## 1. Target outcome

The dashboard contains these main regions:

```text
┌──────┬────────────────────────────────────────────────────────────┐
│ Icon │ Product header + navigation + settings                    │
│ rail ├──────────────┬─────────────────────────────────────────────┤
│      │ Secondary    │ Breadcrumb + page title                    │
│      │ navigation   │ Filters + date range                       │
│      │              │ KPI cards                                  │
│      │              │ Main charts                               │
│      │              │ Transactions / alerts table               │
└──────┴──────────────┴─────────────────────────────────────────────┘
```

Visual principles:

- Near-black overall background; cards about one level brighter.
- Thin, low-contrast borders; avoid large shadows.
- Blue for navigation and actions.
- Purple for product identity and Medium severity.
- Red, orange and green only for states.
- Small border radius, around `4–6px`, to retain the feel of a technical tool.
- Small fonts with a clear hierarchy; main content no smaller than `12px`.

## 2. Proposed directory structure

This example uses Next.js App Router and CSS Modules.

```text
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── fraud-monitoring/
│       └── page.tsx
├── components/
│   └── fraudguard-dashboard/
│       ├── FraudGuardDashboard.tsx
│       ├── SecurityDashboard.module.css
│       ├── AppRail.tsx
│       ├── ProductHeader.tsx
│       ├── SecondaryNav.tsx
│       ├── DashboardToolbar.tsx
│       ├── StatCard.tsx
│       ├── Panel.tsx
│       ├── RiskLevelBadge.tsx
│       ├── TransactionRiskTable.tsx
│       └── types.ts
└── data/
    └── fraudguard-transactions.ts
```

Conventions:

- `page.tsx` is a Server Component for initial data fetching.
- `FraudGuardDashboard.tsx` is a Client Component because it contains filters, tabs, drawers and interactive state.
- Design tokens and resets belong in `globals.css`.
- Dashboard-specific CSS belongs in `SecurityDashboard.module.css`.

## 3. Project-wide design tokens

Add to `src/app/globals.css`:

```css
:root {
  color-scheme: dark;

  /* Background hierarchy */
  --security-bg: #17181c;
  --security-header: #1f2025;
  --security-panel: #202126;
  --security-panel-hover: #292c35;
  --security-control: #292a32;
  --security-control-hover: #353640;
  --security-rail: #252130;

  /* Borders */
  --security-border: #35363e;
  --security-border-strong: #454752;

  /* Typography */
  --security-text: #e5e5ec;
  --security-text-secondary: #b5b8c4;
  --security-muted: #9799a7;
  --security-subtle: #777b8b;

  /* Accent colors */
  --security-blue: #71b9f4;
  --security-blue-bg: #34546c;
  --security-purple: #ad8af3;
  --security-purple-bg: #594076;
  --security-green: #78c9ac;
  --security-orange: #eda765;
  --security-red: #ed6775;

  /* Severity */
  --critical-text: #f68992;
  --critical-bg: #512d35;
  --critical-border: #7b3d46;
  --high-text: #efb485;
  --high-bg: #443328;
  --high-border: #715139;
  --medium-text: #c5a7f9;
  --medium-bg: #372e49;
  --medium-border: #5c4778;

  /* Layout */
  --app-rail-width: 56px;
  --secondary-nav-width: 200px;
  --product-header-height: 60px;
  --panel-radius: 5px;
  --content-max-width: 1900px;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--security-bg);
  color: var(--security-text);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  font-size: 14px;
}

button,
input,
select {
  color: inherit;
  font: inherit;
}

button,
select {
  cursor: pointer;
}

a {
  color: var(--security-blue);
  text-decoration: none;
}

:where(button, a, input, select):focus-visible {
  outline: 2px solid var(--security-blue);
  outline-offset: 3px;
}
```

If the project does not have a font yet, configure one with `next/font` in `layout.tsx`:

```tsx
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

## 4. TypeScript data types

Create `src/components/fraudguard-dashboard/types.ts`:

```ts
export type RiskLevel = "Critical" | "High" | "Medium" | "Low";
export type ScoringSource = "AI" | "RULE" | "RULE_FALLBACK";
export type CaseStatus =
  | "Open"
  | "Reviewing"
  | "Confirmed Fraud"
  | "False Alarm"
  | "Resolved";

export interface TransactionRisk {
  id: string;
  transactionReference: string;
  projectId: string;
  projectName: string;
  transactionType: string;
  entityReference: string;
  amount?: number;
  currency?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence?: number;
  scoringSource: ScoringSource;
  triggeredRules: string[];
  explanation?: string;
  alertId?: string;
  caseId?: string;
  caseStatus?: CaseStatus;
  processedAt: string;
}

export interface FraudGuardFilters {
  query: string;
  projectId: "all" | string;
  transactionType: "all" | string;
  riskLevel: "all" | RiskLevel;
  scoringSource: "all" | ScoringSource;
  caseStatus: "all" | CaseStatus;
  range: 7 | 30 | 90;
}
```

## 5. Component tree

```tsx
<FraudGuardDashboard>
  <AppRail />
  <div className={styles.workspace}>
    <ProductHeader />
    <div className={styles.bodyLayout}>
      <SecondaryNav />
      <main className={styles.main}>
        <DashboardHeading />
        <DashboardToolbar />
        <section className={styles.metricsGrid}>
          <StatCard />
        </section>
        <section className={styles.chartGrid}>
          <Panel>{/* risk distribution / trend */}</Panel>
          <Panel>{/* grouped by project / transaction type */}</Panel>
        </section>
        <TransactionRiskTable />
      </main>
    </div>
  </div>
</FraudGuardDashboard>
```

Each component should own only one UI region. Transaction data and filter state are kept in `FraudGuardDashboard` and passed down as props. Manage API keys only on the project settings screen; do not put API keys in the dashboard or Client Components.

## 6. Ready-to-use CSS layout

Create `src/components/fraudguard-dashboard/SecurityDashboard.module.css`:

```css
.root {
  min-height: 100vh;
  background: var(--security-bg);
  color: var(--security-text);
}

/* Left icon rail */
.rail {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 20;
  display: flex;
  width: var(--app-rail-width);
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border-right: 1px solid #433752;
  background: var(--security-rail);
  padding: 12px 8px 18px;
}

.railLogo {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  margin-bottom: 4px;
  color: var(--security-purple);
  font-weight: 700;
}

.railButton {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #b9b2ca;
}

.railButton:hover,
.railButtonActive {
  background: var(--security-purple-bg);
  color: #fff;
}

.railBottom {
  margin-top: auto;
}

.avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: #69479a;
  color: #fff;
  font-size: 11px;
}

/* Main workspace */
.workspace {
  margin-left: var(--app-rail-width);
}

.productHeader {
  position: sticky;
  top: 0;
  z-index: 15;
  display: flex;
  height: var(--product-header-height);
  align-items: center;
  gap: 32px;
  border-bottom: 1px solid var(--security-border);
  background: color-mix(in srgb, var(--security-header) 94%, transparent);
  padding: 0 22px;
  backdrop-filter: blur(12px);
}

.productName {
  flex: 0 0 auto;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
}

.topNav {
  display: flex;
  align-self: stretch;
  gap: 26px;
}

.topNavButton {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--security-muted);
  padding: 0 3px;
}

.topNavButton:hover {
  color: var(--security-text);
}

.topNavButtonActive {
  color: #fff;
}

.topNavButtonActive::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--security-blue);
  content: "";
}

.settingsButton {
  margin-left: auto;
}

.bodyLayout {
  display: flex;
  align-items: stretch;
}

/* Secondary navigation */
.secondaryNav {
  position: sticky;
  top: var(--product-header-height);
  display: flex;
  width: var(--secondary-nav-width);
  height: calc(100vh - var(--product-header-height));
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  border-right: 1px solid var(--security-border);
  background: var(--security-panel);
  padding: 28px 12px 18px;
}

.sectionLabel {
  margin: 0 10px 16px;
  color: var(--security-subtle);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.secondaryNavButton {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #b9bbc6;
  padding: 10px;
  text-align: left;
}

.secondaryNavButton:hover {
  background: #30313b;
}

.secondaryNavButtonActive {
  background: var(--security-blue-bg);
  box-shadow: inset 2px 0 var(--security-blue);
  color: #b9e1ff;
}

.systemStatus {
  margin: 36px 10px 0;
  color: #a8abb5;
  font-size: 12px;
  line-height: 1.8;
}

.statusDot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--security-green);
}

/* Content */
.main {
  width: 100%;
  min-width: 0;
  max-width: var(--content-max-width);
  padding: 24px 28px 0;
}

.breadcrumb {
  margin-bottom: 18px;
  color: #818695;
  font-size: 12px;
}

.pageHeading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.pageHeading h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.pageHeading p {
  margin: 0;
  color: var(--security-muted);
  font-size: 13px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0 20px;
}

.toolbarGroup {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.control,
.button {
  min-height: 34px;
  border: 1px solid var(--security-border-strong);
  border-radius: 4px;
  background: var(--security-control);
  color: #d7d9e3;
  padding: 7px 10px;
  font-size: 12px;
}

.button:hover,
.control:hover {
  background: var(--security-control-hover);
}

.searchInput {
  width: min(280px, 100%);
  min-height: 34px;
  border: 1px solid var(--security-border-strong);
  border-radius: 4px;
  background: #191b21;
  color: var(--security-text);
  padding: 7px 10px;
}

/* KPI cards */
.metricsGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}

.statCard,
.panel {
  min-width: 0;
  border: 1px solid var(--security-border);
  border-radius: var(--panel-radius);
  background: var(--security-panel);
}

.statCard {
  position: relative;
  min-height: 115px;
  overflow: hidden;
  padding: 15px 17px;
}

.statLabel {
  margin-bottom: 10px;
  color: var(--security-text-secondary);
  font-size: 12px;
}

.statValue {
  font-size: 31px;
  font-weight: 600;
  line-height: 1.1;
}

.statDescription {
  display: block;
  margin-top: 9px;
  color: #838896;
  font-size: 11px;
}

.statCritical .statValue {
  color: var(--security-red);
}

.statWarning .statValue {
  color: var(--security-orange);
}

/* Panels and charts */
.chartGrid,
.secondaryGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);
  gap: 14px;
}

.secondaryGrid {
  margin: 14px 0 20px;
}

.panel {
  padding: 17px;
}

.panelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panelHeader h2,
.panelHeader h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.muted {
  color: var(--security-muted);
  font-size: 11px;
  line-height: 1.6;
}

.chartArea {
  width: 100%;
  height: 230px;
  margin-top: 12px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  color: #a4a8b5;
  font-size: 10px;
}

.legendDot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 1px;
}

/* Status and severity */
.badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid;
  border-radius: 3px;
  padding: 3px 6px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.critical {
  border-color: var(--critical-border);
  background: var(--critical-bg);
  color: var(--critical-text);
}

.high {
  border-color: var(--high-border);
  background: var(--high-bg);
  color: var(--high-text);
}

.medium {
  border-color: var(--medium-border);
  background: var(--medium-bg);
  color: var(--medium-text);
}

.low {
  border-color: #3f665a;
  background: #263c36;
  color: #8cd5bc;
}

/* Table */
.tablePanel {
  overflow: hidden;
  padding: 17px 0 0;
}

.tablePanelHeader {
  padding: 0 17px;
}

.tableControls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--security-border);
  padding: 14px 17px 8px;
}

.tabs {
  display: flex;
  gap: 20px;
}

.tab {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #9fa4b4;
  padding: 10px 0;
  font-size: 12px;
}

.tabActive {
  border-bottom-color: var(--security-blue);
  color: var(--security-blue);
}

.tableScroll {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  white-space: nowrap;
}

.table th {
  border-bottom: 1px solid #3a3c46;
  background: #25272e;
  color: #a4aab9;
  padding: 10px 17px;
  font-size: 10px;
  font-weight: 500;
}

.table td {
  border-bottom: 1px solid #30323b;
  color: #aeb4c2;
  padding: 13px 17px;
  font-size: 11px;
}

.table tbody tr:hover {
  background: var(--security-panel-hover);
}

.findingName {
  color: #c5cae0;
  font-size: 12px;
  font-weight: 500;
}

.findingMeta {
  display: block;
  margin-top: 4px;
  color: #818899;
  font-size: 10px;
}

.emptyState {
  color: var(--security-muted);
  padding: 36px 20px !important;
  text-align: center;
}

/* Responsive */
@media (max-width: 1150px) {
  :root {
    --secondary-nav-width: 175px;
  }

  .main {
    padding-inline: 18px;
  }

  .productHeader {
    gap: 18px;
  }

  .topNav {
    gap: 18px;
  }
}

@media (max-width: 900px) {
  .secondaryNav {
    display: none;
  }

  .chartGrid,
  .secondaryGrid {
    grid-template-columns: minmax(0, 1.3fr) minmax(260px, 1fr);
  }
}

@media (max-width: 680px) {
  :root {
    --app-rail-width: 44px;
  }

  .productHeader {
    height: auto;
    min-height: var(--product-header-height);
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px;
  }

  .topNav {
    order: 3;
    width: 100%;
    height: 36px;
    justify-content: space-between;
    gap: 4px;
  }

  .topNavButton {
    font-size: 12px;
  }

  .main {
    padding: 20px 14px 0;
  }

  .toolbar,
  .tableControls {
    align-items: stretch;
    flex-direction: column;
  }

  .metricsGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .chartGrid,
  .secondaryGrid {
    grid-template-columns: 1fr;
  }

  .pageHeading h1 {
    font-size: 23px;
  }

  .chartArea {
    height: 210px;
  }
}

@media (max-width: 420px) {
  .metricsGrid {
    grid-template-columns: 1fr;
  }
}
```

## 7. Foundation components

### `Panel.tsx`

```tsx
import type { ReactNode } from "react";
import styles from "./SecurityDashboard.module.css";

interface PanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({
  title,
  description,
  action,
  className = "",
  children,
}: PanelProps) {
  return (
    <article className={`${styles.panel} ${className}`}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          {description ? <p className={styles.muted}>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </article>
  );
}
```

### `StatCard.tsx`

```tsx
import styles from "./SecurityDashboard.module.css";

interface StatCardProps {
  label: string;
  value: number | string;
  description: string;
  tone?: "default" | "critical" | "warning";
}

export function StatCard({
  label,
  value,
  description,
  tone = "default",
}: StatCardProps) {
  const toneClass =
    tone === "critical"
      ? styles.statCritical
      : tone === "warning"
        ? styles.statWarning
        : "";

  return (
    <article className={`${styles.statCard} ${toneClass}`}>
      <div className={styles.statLabel}>{label}</div>
      <strong className={styles.statValue}>{value}</strong>
      <span className={styles.statDescription}>{description}</span>
    </article>
  );
}
```

### `RiskLevelBadge.tsx`

```tsx
import type { RiskLevel } from "./types";
import styles from "./SecurityDashboard.module.css";

const riskLevelClass: Record<RiskLevel, string> = {
  Critical: styles.critical,
  High: styles.high,
  Medium: styles.medium,
  Low: styles.low,
};

export function RiskLevelBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  return (
    <span className={`${styles.badge} ${riskLevelClass[riskLevel]}`}>
      {riskLevel}
    </span>
  );
}
```

Do not construct CSS classes dynamically, such as `styles[riskLevel]`, if API data has not been normalized. Explicit mapping lets TypeScript check all four levels `Low`, `Medium`, `High`, `Critical` returned by the Risk Score Gateway.

## 8. Dashboard container and filter state

Create `FraudGuardDashboard.tsx`:

```tsx
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { FraudGuardFilters, TransactionRisk } from "./types";
import { StatCard } from "./StatCard";
import { TransactionRiskTable } from "./TransactionRiskTable";
import styles from "./SecurityDashboard.module.css";

interface FraudGuardDashboardProps {
  initialTransactions: TransactionRisk[];
}

const initialFilters: FraudGuardFilters = {
  query: "",
  projectId: "all",
  transactionType: "all",
  riskLevel: "all",
  scoringSource: "all",
  caseStatus: "all",
  range: 30,
};

export function FraudGuardDashboard({
  initialTransactions,
}: FraudGuardDashboardProps) {
  const [filters, setFilters] = useState(initialFilters);
  const deferredQuery = useDeferredValue(filters.query.trim().toLowerCase());

  const visibleTransactions = useMemo(() => {
    return initialTransactions.filter((transaction) => {
      const searchTarget = [
        transaction.transactionReference,
        transaction.entityReference,
        transaction.projectName,
        transaction.transactionType,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!deferredQuery || searchTarget.includes(deferredQuery)) &&
        (filters.projectId === "all" ||
          transaction.projectId === filters.projectId) &&
        (filters.transactionType === "all" ||
          transaction.transactionType === filters.transactionType) &&
        (filters.riskLevel === "all" ||
          transaction.riskLevel === filters.riskLevel) &&
        (filters.scoringSource === "all" ||
          transaction.scoringSource === filters.scoringSource) &&
        (filters.caseStatus === "all" ||
          transaction.caseStatus === filters.caseStatus)
      );
    });
  }, [deferredQuery, filters, initialTransactions]);

  const metrics = useMemo(() => {
    const highRisk = initialTransactions.filter(
      (transaction) =>
        transaction.riskLevel === "High" ||
        transaction.riskLevel === "Critical",
    );

    return {
      analyzed: initialTransactions.length,
      highRisk: highRisk.length,
      openAlerts: initialTransactions.filter(
        (transaction) => transaction.alertId && !transaction.caseId,
      ).length,
      activeCases: initialTransactions.filter(
        (transaction) =>
          transaction.caseStatus === "Open" ||
          transaction.caseStatus === "Reviewing",
      ).length,
    };
  }, [initialTransactions]);

  return (
    <div className={styles.root}>
      {/* <AppRail /> */}
      <div className={styles.workspace}>
        {/* <ProductHeader /> */}
        <div className={styles.bodyLayout}>
          {/* <SecondaryNav /> */}
          <main className={styles.main}>
            <div className={styles.breadcrumb}>
              FraudGuard / Monitoring / Risk overview
            </div>

            <div className={styles.pageHeading}>
              <div>
                <h1>Transaction risk overview</h1>
                <p>
                  Monitor risk scores, alerts and cases requiring human review.
                </p>
              </div>
            </div>

            {/* <DashboardToolbar filters={filters} onChange={setFilters} /> */}

            <section className={styles.metricsGrid}>
              <StatCard
                label="Transactions analyzed"
                value={metrics.analyzed}
                description="Within the selected time range"
              />
              <StatCard
                label="High-risk transactions"
                value={metrics.highRisk}
                description="High or Critical"
                tone="critical"
              />
              <StatCard
                label="Open alerts"
                value={metrics.openAlerts}
                description="Not yet converted into cases"
              />
              <StatCard
                label="Active cases"
                value={metrics.activeCases}
                description="Open or Reviewing"
                tone="warning"
              />
            </section>

            {/* Chart panels go here */}

            <TransactionRiskTable
              transactions={visibleTransactions}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
```

`useDeferredValue` keeps keyword entry responsive with large tables. For real transaction data, filtering, sorting and pagination should run in the API. Tenant and project must be verified server-side; do not rely on client-side filtering for tenant isolation.

## 9. React-controlled toolbar

```tsx
import type { Dispatch, SetStateAction } from "react";
import type { FraudGuardFilters } from "./types";
import styles from "./SecurityDashboard.module.css";

interface ToolbarProps {
  filters: FraudGuardFilters;
  projects: Array<{ id: string; name: string }>;
  transactionTypes: string[];
  onChange: Dispatch<SetStateAction<FraudGuardFilters>>;
}

export function DashboardToolbar({
  filters,
  projects,
  transactionTypes,
  onChange,
}: ToolbarProps) {
  const patch = (next: Partial<FraudGuardFilters>) =>
    onChange((current) => ({ ...current, ...next }));

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <select
          className={styles.control}
          aria-label="Project"
          value={filters.projectId}
          onChange={(event) =>
            patch({ projectId: event.target.value })
          }
        >
          <option value="all">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          className={styles.control}
          aria-label="Transaction type"
          value={filters.transactionType}
          onChange={(event) =>
            patch({ transactionType: event.target.value })
          }
        >
          <option value="all">All transaction types</option>
          {transactionTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>

        <select
          className={styles.control}
          aria-label="Scoring source"
          value={filters.scoringSource}
          onChange={(event) =>
            patch({
              scoringSource:
                event.target.value as FraudGuardFilters["scoringSource"],
            })
          }
        >
          <option value="all">All scoring sources</option>
          <option value="AI">AI</option>
          <option value="RULE">Rule Engine</option>
          <option value="RULE_FALLBACK">Rule fallback</option>
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <select
          className={styles.control}
          aria-label="Time range"
          value={filters.range}
          onChange={(event) =>
            patch({ range: Number(event.target.value) as 7 | 30 | 90 })
          }
        >
          <option value={7}>Past 7 days</option>
          <option value={30}>Past 30 days</option>
          <option value={90}>Past 90 days</option>
        </select>

        <button className={styles.button} type="button">
          Export report
        </button>
      </div>
    </div>
  );
}
```

## 10. Transaction and risk table

```tsx
"use client";

import type { Dispatch, SetStateAction } from "react";
import type { FraudGuardFilters, TransactionRisk } from "./types";
import { RiskLevelBadge } from "./RiskLevelBadge";
import styles from "./SecurityDashboard.module.css";

interface TransactionRiskTableProps {
  transactions: TransactionRisk[];
  filters: FraudGuardFilters;
  onFiltersChange: Dispatch<SetStateAction<FraudGuardFilters>>;
}

export function TransactionRiskTable({
  transactions,
  filters,
  onFiltersChange,
}: TransactionRiskTableProps) {
  const patch = (next: Partial<FraudGuardFilters>) =>
    onFiltersChange((current) => ({ ...current, ...next }));

  return (
    <section className={`${styles.panel} ${styles.tablePanel}`}>
      <div className={`${styles.panelHeader} ${styles.tablePanelHeader}`}>
        <div>
          <h2>Scored transactions</h2>
          <p className={styles.muted}>
            Results normalized to a 0–100 scale by the Risk Score Gateway
          </p>
        </div>
        <span className={styles.muted}>{transactions.length} transactions</span>
      </div>

      <div className={styles.tableControls}>
        <div className={styles.tabs} aria-label="Transaction view">
          <button className={`${styles.tab} ${styles.tabActive}`} type="button">
            All transactions
          </button>
          <button className={styles.tab} type="button">
            Alerts only
          </button>
          <button className={styles.tab} type="button">
            Cases
          </button>
        </div>

        <div className={styles.toolbarGroup}>
          <input
            className={styles.searchInput}
            type="search"
            aria-label="Search transactions"
            placeholder="Search transaction, entity, or project…"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
          />

          <select
            className={styles.control}
            aria-label="Risk level"
            value={filters.riskLevel}
            onChange={(event) =>
              patch({
                riskLevel:
                  event.target.value as FraudGuardFilters["riskLevel"],
              })
            }
          >
            <option value="all">All risk levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Risk</th>
              <th>Transaction</th>
              <th>Project / Type</th>
              <th>Score</th>
              <th>Scoring source</th>
              <th>Processed at</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td className={styles.emptyState} colSpan={7}>
                  No results match the current filters.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <RiskLevelBadge riskLevel={transaction.riskLevel} />
                  </td>
                  <td>
                    <span className={styles.findingName}>
                      {transaction.transactionReference}
                    </span>
                    <span className={styles.findingMeta}>
                      Entity: {transaction.entityReference}
                    </span>
                  </td>
                  <td>
                    {transaction.projectName}
                    <span className={styles.findingMeta}>
                      {transaction.transactionType}
                    </span>
                  </td>
                  <td>{transaction.riskScore}/100</td>
                  <td>{transaction.scoringSource}</td>
                  <td>{transaction.processedAt}</td>
                  <td>
                    <button className={styles.button} type="button">
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

Do not attach `onClick` to an entire `<tr>` when the row contains buttons or links. The `Review` button opens a drawer with transaction data, risk score, scoring source, triggered rules or AI explanation. The UI only allows creating/assigning cases and updating human conclusions; it does not provide actions to automatically cancel transactions or block accounts.

## 11. Connect to the Next.js route

`src/app/fraud-monitoring/page.tsx`:

```tsx
import { FraudGuardDashboard } from "@/components/fraudguard-dashboard/FraudGuardDashboard";
import { fraudGuardTransactions } from "@/data/fraudguard-transactions";

export default function FraudMonitoringPage() {
  return (
    <FraudGuardDashboard initialTransactions={fraudGuardTransactions} />
  );
}
```

When connecting a real API:

```tsx
import { FraudGuardDashboard } from "@/components/fraudguard-dashboard/FraudGuardDashboard";
import type { TransactionRisk } from "@/components/fraudguard-dashboard/types";

async function getTransactions(): Promise<TransactionRisk[]> {
  const response = await fetch(`${process.env.API_URL}/transactions/scored`, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error("Unable to load scored transaction data");
  }

  return response.json();
}

export default async function FraudMonitoringPage() {
  const transactions = await getTransactions();
  return <FraudGuardDashboard initialTransactions={transactions} />;
}
```

Do not put secret tokens or ingestion API keys in Client Components. The server must check session, role, tenant and project before returning transaction data. Project API keys appear only in key-management workflows with masking, regeneration and revocation.

## 12. Charts

There are three implementation options:

1. **Plain SVG**: suitable for simple funnels, small sparklines and few dependencies.
2. **Recharts**: suitable for capstone dashboards; easy line charts, area charts, tooltips and responsive containers.
3. **ECharts**: suitable for larger datasets and more complex charts.

If using Recharts, chart components must be Client Components:

```tsx
"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function TransactionRiskTrend({
  data,
}: {
  data: Array<{
    date: string;
    critical: number;
    high: number;
    medium: number;
  }>;
}) {
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke="#383a44" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#81889a" fontSize={10} />
          <YAxis stroke="#81889a" fontSize={10} />
          <Tooltip
            contentStyle={{
              background: "#25272e",
              border: "1px solid #454752",
              borderRadius: 4,
            }}
          />
          <Legend />
          <Line dataKey="critical" stroke="#ed6775" dot={false} />
          <Line dataKey="high" stroke="#eda765" dot={false} />
          <Line dataKey="medium" stroke="#ad8af3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

The main FraudGuard charts should include: transactions over time, risk-level distribution, `AI/RULE/RULE_FALLBACK` scoring-source proportions, alerts/cases by status and top triggered rules. Do not scatter direct color values across components. If the chart library cannot read CSS variables, create a `chart-colors.ts` file to centralize colors.

## 13. Responsive rules

| Breakpoint | Change |
|---|---|
| `> 1150px` | Full rail, subnav, 4 KPIs and 2-column charts |
| `901–1150px` | Narrower subnav and content spacing |
| `681–900px` | Hide subnav; retain rail and narrow 2-column charts |
| `421–680px` | Header wraps to 2 rows, charts to 1 column, KPIs to 2 columns |
| `≤ 420px` | KPIs become 1 column if content is long |

For tables, keep `overflow-x: auto`; do not force all columns to shrink, which harms readability. On mobile, a card list may replace the table if mobile usage is important.

## 14. Required states

A complete dashboard needs:

- `loading.tsx`: skeletons for KPIs, charts and tables.
- `error.tsx`: error message and retry button.
- Empty state when filters return no results.
- Disabled/loading states during export or status changes.
- Toast after successful actions.
- Drawer for transaction/alert/case details.

Skeleton example:

```css
.skeleton {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    #25262c 25%,
    #303139 50%,
    #25262c 75%
  );
  background-size: 200% 100%;
  animation: dashboardShimmer 1.3s linear infinite;
}

@keyframes dashboardShimmer {
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
```

## 15. Accessibility checklist

- Use `<button>` for actions and `<a>`/`Link` for navigation.
- Each `<select>` and `<input>` needs a label or `aria-label`.
- Tabs need `role="tablist"`, `role="tab"` and `aria-selected`.
- Icon-only buttons must have `aria-label` or an accessible tooltip.
- Do not communicate risk levels through color alone; always include `Critical`, `High`, etc.
- Modals need focus trapping, a close button and `Escape` support. Prefer Radix Dialog or an existing dialog component in the UI system.
- Charts need text descriptions or equivalent data tables for screen readers.
- Keep focus rings visible; do not use `outline: none`.

## 16. Backend integration conventions

Proposed API response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 182,
    "generatedAt": "2026-09-17T10:00:00Z"
  },
  "summary": {
    "transactionsAnalyzed": 12480,
    "highRiskTransactions": 186,
    "openAlerts": 42,
    "activeCases": 17,
    "ruleFallbackCount": 23
  }
}
```

When filtering server-side, synchronize filters with the URL:

```text
/fraud-monitoring?project=checkout&riskLevel=critical&source=ai&page=1
```

Benefits:

- Reload preserves filters.
- The current view URL can be shared.
- Browser back/forward works correctly.
- The server can cache each filter combination.

In Next.js, use `useSearchParams()` to read the query and `router.replace()` to update the URL. Debounce search by around `250–400ms` before changing the URL.

## 17. Screens to implement for FraudGuard

| Route | Purpose | Primary actors |
|---|---|---|
| `/fraud-monitoring` | Transaction overview, risk distribution, scoring source | SME Admin, Risk Staff, Viewer |
| `/transactions` | List and details of validated/scored transactions | SME Admin, Risk Staff, Viewer |
| `/alerts` | Alerts exceeding thresholds and evidence | Risk Staff |
| `/cases` | Investigation, assignment, notes and conclusions | Risk Staff, SME Admin |
| `/rules` | Rule, AND/OR conditions, risk point, threshold, publish history | SME Admin, Platform/Technical Staff |
| `/projects` | Projects, specifications, confirmed custom fields, quotas, API keys | SME Admin |
| `/reports` | CSV/PDF export within permission scope | SME Admin, Risk Staff, Viewer |
| `/platform` | SME accounts, plan, system health, queue, AI health, audit | Platform Admin |

Free Plan uses the Rule Engine as the primary scoring source. Subscription Plan uses AI as the primary path and clearly displays `RULE_FALLBACK` when AI times out or is unavailable. The UI must retain the same 0–100 scale and risk levels for both processing paths.

## 18. Quick implementation order

1. Add tokens to `globals.css`.
2. Create `types.ts` and mock data matching the API shape.
3. Build `AppRail`, `ProductHeader`, `SecondaryNav` and the responsive layout.
4. Create `Panel`, `StatCard`, `RiskLevelBadge`.
5. Add the toolbar and filter state.
6. Add the table, empty state and detail drawer.
7. Add charts after layout and data flow are stable.
8. Replace mock data with the API.
9. Check keyboard, mobile, loading, error and empty states.

## 19. Definition of Done

- The UI follows the dashboard dark theme and hierarchy.
- No page-wide horizontal scrolling on desktop/mobile.
- Only tables scroll horizontally when needed.
- Filters, search, tabs and sorting work through React state.
- URLs retain filters when data is filtered by the backend.
- Components do not contain scattered colors outside the token system.
- Loading, error and empty states exist.
- Focus rings, labels and keyboard navigation exist.
- No secrets in Client Components.
- Mock data can be replaced by Transaction Ingestion, Risk Score Gateway and Case APIs without changing the UI structure.
- Every screen checks role and tenant/project; hiding buttons is not authorization.
- Alert details always show the scoring source and triggered rules or AI explanation.
- No actions automatically cancel transactions or block customer accounts.

## 20. Related Next.js documentation

- CSS and CSS Modules: <https://nextjs.org/docs/app/getting-started/css>
- Server and Client Components: <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- Data fetching: <https://nextjs.org/docs/app/getting-started/fetching-data>
- Route handlers: <https://nextjs.org/docs/app/building-your-application/routing/route-handlers>
