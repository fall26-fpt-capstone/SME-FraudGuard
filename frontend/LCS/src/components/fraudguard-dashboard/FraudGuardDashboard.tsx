"use client";
import { isSandboxTransaction } from '@/utils/transaction-origin';
import { enterprisePlan, countOpenUnlinkedAlerts, countActiveInvestigationCases, hasLegacyCaseFieldPatch } from "@/utils/enterprise";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  FraudGuardFilters,
  PaginationState,
  RuleTemplate,
  SecondaryView,
  SortState,
  TableTab,
  TransactionRisk,
  ProjectItem,
  AuditLogEntry,
  UserProfile,
} from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import { previewTransactionImport } from "@/utils/transaction-import";
import { auditForUser, canDeploy, evaluateSetupReadiness, generateEnterpriseCode, visibleEnterprises, transactionsForEnterprise, validateOnboardingSave } from "@/utils/enterprise";
import { evaluateInvestigationCaseReadAccess } from "@/utils/investigation-case";
import { CASE_MIGRATION_VERSION, type LegacyCaseArchiveEntry, type WorkspaceMigrationMeta } from "@/utils/case-migration";
import {
  WORKSPACE_SCHEMA_VERSION,
  mergeAndPersistWorkspaceSlice,
  persistWorkspaceAndUsers,
  recoverWorkspaceStorage,
  restoreWorkspaceSnapshot,
  type PersistCoordinatedResult,
  type PreDemoWorkspaceSnapshot,
  type WorkspacePayloadV4,
  type WorkspaceRecoveryJournal,
  type WorkspaceRestoreResult,
  type WorkspaceRestoreStatus,
  type WorkspaceStorageErrorCode,
} from "@/utils/workspace-storage";
import {
  useInvestigationCases,
  type ConfirmInvestigationReportCommandArgs,
  type InvestigationActionOutcome,
  type RequestInvestigationRevisionCommandArgs,
  type SubmitConfirmedReportFeedbackCommandArgs,
  type SubmitFeedbackOutcome,
  type SubmitInvestigationReportCommandArgs,
} from "@/hooks/useInvestigationCases";
import {
  WF04_DEMO_ENTERPRISES,
  applyAndPersistWf04Demo,
  resolveWf04DevToolsEnabled,
  restoreAndPersistPreDemoWorkspace,
  syncWf04DevToolsWindowBinding,
  type FraudGuardWf04DevTools,
} from "@/data/wf04-demo";
import { demoEnterprises } from "@/data/fraudguard-enterprises";
import { type Enterprise } from "@/types/enterprise";
import { MembersView } from "./MembersView";
import { Sidebar } from "@/layouts/Sidebar";
import { ProductHeader } from "@/layouts/ProductHeader";
import { DashboardToolbar } from "./DashboardToolbar";
import { StatCard } from "./StatCard";
import { Panel } from "./Panel";
import { TransactionRiskTable } from "./TransactionRiskTable";
import { TransactionRiskTrend } from "./TransactionRiskTrend";
import { RiskDistributionChart } from "./RiskDistributionChart";
import { AlertCaseDrawer } from "./AlertCaseDrawer";
import { AlertsView } from "./AlertsView";
import { CasesView } from "./CasesView";
import { RuleSetsView } from './RuleSetsView';
import { activeSetRules, canChangeEnterpriseSets, type LegacyRuleSet, type ManagedRuleSet } from '@/utils/rule-set-lifecycle';
import { RulesView } from "./RulesView";
import { ProjectsView } from "./ProjectsView";
import { ReportsView } from "./ReportsView";
import { AuditTrailView } from "./AuditTrailView";
import { PlatformHealthView } from "./PlatformHealthView";
import { initialProjects } from "../../data/fraudguard-projects";
import { initialAuditLogs } from "../../data/fraudguard-audit-logs";
import { DEMO_USERS, DEFAULT_DEMO_USER } from "@/data/fraudguard-roles";
import { canSaveMember, canProvisionEnterpriseAdmin, getRolePermissions, canAccessView } from "@/utils/permissions";
import { getRoleHomeView } from "@/routes/role-home";
import { ToastProvider } from "@/context/ToastProvider";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { OnboardingView } from "./OnboardingView";
import { RuleTestingView } from "./RuleTestingView";
import styles from "./SecurityDashboard.module.css";

declare global {
  interface Window {
    __fgWf04DevTools?: FraudGuardWf04DevTools;
  }
}

function isBrowserWf04DevToolsActive(): boolean {
  return (
    typeof window !== "undefined" &&
    resolveWf04DevToolsEnabled({
      search: window.location.search,
      getStorage: () => window.localStorage,
    })
  );
}

interface FraudGuardDashboardProps {
  initialTransactions: TransactionRisk[];
  initialRules: RuleTemplate[];
  initialProjects?: ProjectItem[];
  initialAuditLogs?: AuditLogEntry[];
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

const INITIAL_MIGRATION_META: WorkspaceMigrationMeta = {
  migrationVersion: CASE_MIGRATION_VERSION,
  migratedAt: "",
  sourceSchema: "seed",
  migratedCaseCount: 0,
  archivedLegacyCount: 0,
  preservedExistingCaseCount: 0,
  notes: [],
};

function serializeCoordinatedSnapshot(
  payload: WorkspacePayloadV4,
  snapshotUsers: readonly UserProfile[],
): string {
  return JSON.stringify({
    payload,
    users: snapshotUsers,
  });
}

function FraudGuardDashboardContent({
  initialTransactions,
  initialRules,
  initialProjects: defaultProjects = initialProjects,
  initialAuditLogs: defaultAuditLogs = initialAuditLogs,
}: FraudGuardDashboardProps) {
  const { t, language } = useLanguage();
  // Data state (managed under strict v4 schema & restoreStatus gate)
  const [users, setUsers] = useState<UserProfile[]>(DEMO_USERS);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [showTestData, setShowTestData] = useState(false);
  const [auditLogs, setAuditLogs] = useState(defaultAuditLogs);
  const [rules, setRules] = useState(initialRules);
  const [enterprises, setEnterprises] = useState<Enterprise[]>(demoEnterprises);
  const [legacyUnassigned, setLegacyUnassigned] = useState<LegacyRuleSet[]>([]);
  const [deploymentEnterpriseId, setDeploymentEnterpriseId] = useState('');
  const [ruleSets, setRuleSets] = useState<ManagedRuleSet[]>([]);
  const [projects, setProjects] = useState(defaultProjects);
  const [legacyCaseArchive, setLegacyCaseArchive] = useState<LegacyCaseArchiveEntry[]>([]);
  const [migrationMeta, setMigrationMeta] = useState<WorkspaceMigrationMeta>(INITIAL_MIGRATION_META);
  const [wf04DemoActive, setWf04DemoActive] = useState(false);
  const [preDemoSnapshot, setPreDemoSnapshot] = useState<PreDemoWorkspaceSnapshot | undefined>(undefined);
  const [restoreStatus, setRestoreStatus] = useState<WorkspaceRestoreStatus>("pending");
  const [restoreErrorCode, setRestoreErrorCode] = useState<WorkspaceStorageErrorCode | null>(null);
  const [storageErrorCode, setStorageErrorCode] = useState<WorkspaceStorageErrorCode | null>(null);
  const [storageFailureKind, setStorageFailureKind] = useState<"generic" | "demoLoad" | "demoRestore" | null>(null);
  const [storageErrorRolledBack, setStorageErrorRolledBack] = useState(false);
  const [recoveryJournal, setRecoveryJournal] = useState<WorkspaceRecoveryJournal | undefined>(undefined);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [hasUnsavedSessionChanges, setHasUnsavedSessionChanges] = useState(false);
  const [devSampleToolsEnabled, setDevSampleToolsEnabled] = useState(false);
  const devSampleToolsActiveRef = useRef(false);
  const [hasRestoredMount, setHasRestoredMount] = useState(false);
  const didMountRestoreRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const lastHookPayloadRef = useRef<WorkspacePayloadV4 | null>(null);
  const reportFeedbacksRef = useRef<readonly InvestigationReportFeedback[]>([]);

  // RBAC state
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_DEMO_USER);
  const permissions = useMemo(
    () => getRolePermissions(currentUser.role),
    [currentUser.role],
  );

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [alertSelectionResetKey, setAlertSelectionResetKey] = useState(0);

  const buildWorkspacePayload = useCallback(
    (args: {
      nextCases: readonly InvestigationCase[];
      nextFeedbacks?: readonly InvestigationReportFeedback[];
      auditEntry?: AuditLogEntry;
    }): WorkspacePayloadV4 => {
      const resolvedFeedbacks = args.nextFeedbacks ?? reportFeedbacksRef.current;
      const built: WorkspacePayloadV4 = {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        rules,
        ruleSets,
        enterprises,
        legacyUnassigned,
        projects,
        transactions,
        auditLogs: args.auditEntry ? [args.auditEntry, ...auditLogs] : auditLogs,
        investigationCases: args.nextCases,
        reportFeedbacks: resolvedFeedbacks,
        legacyCaseArchive,
        migrationMeta,
        wf04DemoActive,
        ...(preDemoSnapshot ? { preDemoSnapshot } : {}),
      };
      lastHookPayloadRef.current = built;
      return built;
    },
    [
      rules,
      ruleSets,
      enterprises,
      legacyUnassigned,
      projects,
      transactions,
      auditLogs,
      legacyCaseArchive,
      migrationMeta,
      wf04DemoActive,
      preDemoSnapshot,
    ],
  );

  const caseHook = useInvestigationCases({
    enterprises,
    projects,
    alerts: transactions,
    legacyArchive: legacyCaseArchive,
    users,
    currentActor: currentUser,
    restoreStatus,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload,
    onFeedbacksChange: (nextFeedbacks) => {
      reportFeedbacksRef.current = nextFeedbacks;
    },
    onAuditEntry: (entry) => setAuditLogs((logs) => [entry, ...logs]),
  });

  const { replaceCases, retryPersist } = caseHook;

  const currentWorkspacePayload = useMemo(
    () =>
      buildWorkspacePayload({
        nextCases: caseHook.cases,
        nextFeedbacks: caseHook.feedbacks,
      }),
    [buildWorkspacePayload, caseHook.cases, caseHook.feedbacks],
  );

  const handleCoordinatedFailure = useCallback(
    (
      failure: Extract<PersistCoordinatedResult, { ok: false }>,
      kind: "generic" | "demoLoad" | "demoRestore",
      markSessionUnsaved: boolean,
    ) => {
      const isCleanup =
        failure.errorCode === "STORAGE_CLEANUP_FAILED" ||
        (Boolean(failure.committed) && Boolean(failure.cleanupPending));

      if (failure.preservePreDemoSnapshot && !isCleanup) {
        setPreDemoSnapshot(failure.preservePreDemoSnapshot);
        setWf04DemoActive(true);
      }
      if (
        isCleanup ||
        failure.recoveryRequired ||
        failure.rollbackFailed ||
        failure.errorCode === "STORAGE_ROLLBACK_FAILED" ||
        failure.errorCode === "STORAGE_RECOVERY_REQUIRED"
      ) {
        setRestoreStatus("recovery_required");
        setRecoveryJournal(failure.recoveryJournal);
        setStorageErrorRolledBack(false);
        setCleanupPending(isCleanup);
      } else {
        setCleanupPending(false);
        setStorageErrorRolledBack(failure.rolledBack);
      }
      setStorageErrorCode(failure.errorCode);
      setStorageFailureKind(kind);
      if (markSessionUnsaved && !isCleanup) {
        setHasUnsavedSessionChanges(true);
      }
    },
    [],
  );

  const applyRestoredResult = useCallback(
    (result: WorkspaceRestoreResult) => {
      const isCleanup =
        result.status === "recovery_required" &&
        (Boolean(result.cleanupPending) || result.errorCode === "STORAGE_CLEANUP_FAILED");

      setUsers([...result.users]);
      setRules([...result.payload.rules]);
      setRuleSets([...result.payload.ruleSets]);
      setEnterprises([...result.payload.enterprises]);
      setLegacyUnassigned([...result.payload.legacyUnassigned]);
      setProjects([...result.payload.projects]);
      setTransactions([...result.payload.transactions]);
      setAuditLogs([...result.payload.auditLogs]);
      setLegacyCaseArchive([...result.payload.legacyCaseArchive]);
      setMigrationMeta(result.payload.migrationMeta);
      setWf04DemoActive(Boolean(result.payload.wf04DemoActive));
      setPreDemoSnapshot(result.payload.preDemoSnapshot);
      const restoredFeedbacks = [...(result.payload.reportFeedbacks ?? [])];
      reportFeedbacksRef.current = restoredFeedbacks;
      setRestoreStatus(result.status);
      setRestoreErrorCode(result.errorCode ?? null);
      setRecoveryJournal(result.recoveryJournal);
      setCleanupPending(isCleanup);
      setStorageFailureKind(null);
      setStorageErrorRolledBack(false);
      if (result.status === "ready" && result.canPersist) {
        lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(
          result.payload,
          result.users,
        );
        setStorageErrorCode(null);
        setHasUnsavedSessionChanges(false);
      } else {
        lastPersistedSnapshotRef.current = null;
        setStorageErrorCode(
          isCleanup
            ? "STORAGE_CLEANUP_FAILED"
            : result.status === "ready" && result.errorCode
              ? result.errorCode
              : result.status === "recovery_required"
                ? (result.errorCode ?? "STORAGE_RECOVERY_REQUIRED")
                : null,
        );
        setHasUnsavedSessionChanges(result.status === "ready" && !result.canPersist);
      }
      replaceCases(result.payload.investigationCases, {
        nextFeedbacks: restoredFeedbacks,
        persisted: result.canPersist,
        persistedAt: result.canPersist ? new Date().toISOString() : null,
        committed: isCleanup,
        cleanupPending: isCleanup,
        storageError: result.errorCode
          ? {
              code: result.errorCode,
              error: result.error ?? "",
              committed: isCleanup,
              cleanupPending: isCleanup,
              recoveryRequired: result.status === "recovery_required",
              recoveryJournal: result.recoveryJournal,
              ...(result.payload.preDemoSnapshot && !isCleanup
                ? { preservePreDemoSnapshot: result.payload.preDemoSnapshot }
                : {}),
            }
          : null,
      });
      setCurrentUser((prev) => {
        const matched = result.users.find((u) => u.id === prev.id);
        return matched ?? result.users.find((u) => u.id === DEFAULT_DEMO_USER.id) ?? result.users[0] ?? prev;
      });
      setHasRestoredMount(true);
    },
    [replaceCases],
  );

  useEffect(() => {
    if (didMountRestoreRef.current) return;
    didMountRestoreRef.current = true;
    const result = restoreWorkspaceSnapshot({
      defaultRules: initialRules,
      defaultEnterprises: demoEnterprises,
      defaultProjects,
      defaultTransactions: initialTransactions,
      defaultAuditLogs,
      defaultUsers: DEMO_USERS,
      extraFallbackEnterprises: WF04_DEMO_ENTERPRISES,
      migratedAt: new Date().toISOString(),
    });
    applyRestoredResult(result);
  }, [initialRules, defaultProjects, initialTransactions, defaultAuditLogs, applyRestoredResult]);

  // Coordinated autosave: never overwrites rollback/recovery/cleanup states or runs when paused after failure.
  useEffect(() => {
    if (!hasRestoredMount || restoreStatus !== "ready" || cleanupPending) return;
    if (
      storageErrorCode !== null ||
      hasUnsavedSessionChanges ||
      caseHook.hasUnsavedChanges ||
      caseHook.storageError !== null ||
      recoveryJournal !== undefined
    ) {
      return;
    }

    const nextSnapshotKey = serializeCoordinatedSnapshot(currentWorkspacePayload, users);
    if (lastPersistedSnapshotRef.current === nextSnapshotKey) {
      return;
    }

    const result = persistWorkspaceAndUsers({
      payload: currentWorkspacePayload,
      users,
      restoreStatus,
      operation: "autosave",
    });
    if (result.ok) {
      lastPersistedSnapshotRef.current = nextSnapshotKey;
      setStorageErrorCode(null);
      setStorageFailureKind(null);
      setStorageErrorRolledBack(false);
      setCleanupPending(false);
      setHasUnsavedSessionChanges(false);
    } else {
      handleCoordinatedFailure(
        result,
        "generic",
        !(result.committed && result.cleanupPending),
      );
    }
  }, [
    currentWorkspacePayload,
    users,
    hasRestoredMount,
    restoreStatus,
    cleanupPending,
    storageErrorCode,
    hasUnsavedSessionChanges,
    caseHook.hasUnsavedChanges,
    caseHook.storageError,
    recoveryJournal,
    handleCoordinatedFailure,
  ]);

  const accessibleEnterprises = visibleEnterprises(currentUser, enterprises);
  const deploymentEnterprise = accessibleEnterprises.find(e => e.id === deploymentEnterpriseId) ?? accessibleEnterprises[0];
  const assignedProjectIds = accessibleEnterprises.flatMap(e => e.projectIds);
  const scopedTransactions = useMemo(
    () => transactionsForEnterprise(transactions, currentUser, enterprises, caseHook.cases, legacyCaseArchive),
    [transactions, enterprises, currentUser, caseHook.cases, legacyCaseArchive],
  );
  const enterpriseTransactions = useMemo(() => scopedTransactions.filter(tx => !isSandboxTransaction(tx)), [scopedTransactions]);
  const dashboardTransactions = useMemo(() => scopedTransactions.filter(tx => isSandboxTransaction(tx) === showTestData), [scopedTransactions, showTestData]);
  const scopedRules = rules.filter(r => !r.enterpriseId || r.enterpriseId === deploymentEnterprise?.id).filter(r => r.appliesTo.projects.includes('*') || r.appliesTo.projects.some(id => deploymentEnterprise?.projectIds.includes(id)));
  const handleSwitchUser = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    setShowTestData(false);
    setDeploymentEnterpriseId('');
    setFilters(initialFilters);
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setSelectedCaseId(null);
    setAlertSelectionResetKey(prev => prev + 1);
    setActiveNavItem(getRoleHomeView(user.role));
  }, []);

  const handleLoadWf04Demo = useCallback(() => {
    if (!devSampleToolsActiveRef.current || !isBrowserWf04DevToolsActive()) {
      return;
    }
    const res = applyAndPersistWf04Demo({
      includeReviewSamples: true,
      currentPayload: currentWorkspacePayload,
      currentUsers: users,
      savedAt: new Date().toISOString(),
      restoreStatus,
    });
    const isCleanup =
      !res.ok && Boolean(res.committed) && Boolean(res.cleanupPending);
    if (!res.ok && !isCleanup) {
      handleCoordinatedFailure(res, "demoLoad", false);
      return;
    }

    if (res.ok) {
      lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(res.payload, res.users);
      setStorageErrorCode(null);
      setStorageFailureKind(null);
      setStorageErrorRolledBack(false);
      setCleanupPending(false);
      setHasUnsavedSessionChanges(false);
      setRestoreStatus("ready");
      setRecoveryJournal(undefined);
    } else {
      lastPersistedSnapshotRef.current = null;
      handleCoordinatedFailure(res, "demoLoad", false);
    }

    setUsers([...res.users]);
    setRules([...res.payload.rules]);
    setRuleSets([...res.payload.ruleSets]);
    setEnterprises([...res.payload.enterprises]);
    setLegacyUnassigned([...res.payload.legacyUnassigned]);
    setProjects([...res.payload.projects]);
    setTransactions([...res.payload.transactions]);
    setAuditLogs([...res.payload.auditLogs]);
    setLegacyCaseArchive([...res.payload.legacyCaseArchive]);
    setMigrationMeta(res.payload.migrationMeta);
    setWf04DemoActive(Boolean(res.payload.wf04DemoActive));
    setPreDemoSnapshot(res.payload.preDemoSnapshot);
    const demoFeedbacks = [...(res.payload.reportFeedbacks ?? [])];
    reportFeedbacksRef.current = demoFeedbacks;
    replaceCases(res.payload.investigationCases, {
      nextFeedbacks: demoFeedbacks,
      persisted: res.ok,
      persistedAt: res.ok ? new Date().toISOString() : null,
      committed: isCleanup,
      cleanupPending: isCleanup,
      ...(isCleanup && !res.ok
        ? {
            storageError: {
              code: res.errorCode,
              error: res.error,
              committed: true,
              cleanupPending: true,
              recoveryRequired: true,
              recoveryJournal: res.recoveryJournal,
            },
          }
        : {}),
    });
    setSelectedCaseId(null);
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setAlertSelectionResetKey(prev => prev + 1);
  }, [currentWorkspacePayload, users, restoreStatus, handleCoordinatedFailure, replaceCases]);

  const handleRestorePreDemo = useCallback(() => {
    if (!devSampleToolsActiveRef.current || !isBrowserWf04DevToolsActive()) {
      return;
    }
    const res = restoreAndPersistPreDemoWorkspace({
      currentPayload: currentWorkspacePayload,
      currentUsers: users,
      restoreStatus,
    });
    const isCleanup =
      !res.ok && Boolean(res.committed) && Boolean(res.cleanupPending);
    if (!res.ok && !isCleanup) {
      handleCoordinatedFailure(res, "demoRestore", false);
      return;
    }

    if (res.ok) {
      lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(res.payload, res.users);
      setStorageErrorCode(null);
      setStorageFailureKind(null);
      setStorageErrorRolledBack(false);
      setCleanupPending(false);
      setHasUnsavedSessionChanges(false);
      setRestoreStatus("ready");
      setRecoveryJournal(undefined);
    } else {
      lastPersistedSnapshotRef.current = null;
      handleCoordinatedFailure(res, "demoRestore", false);
    }

    setUsers([...res.users]);
    setRules([...res.payload.rules]);
    setRuleSets([...res.payload.ruleSets]);
    setEnterprises([...res.payload.enterprises]);
    setLegacyUnassigned([...res.payload.legacyUnassigned]);
    setProjects([...res.payload.projects]);
    setTransactions([...res.payload.transactions]);
    setAuditLogs([...res.payload.auditLogs]);
    setLegacyCaseArchive([...res.payload.legacyCaseArchive]);
    setMigrationMeta(res.payload.migrationMeta);
    setWf04DemoActive(Boolean(res.payload.wf04DemoActive));
    setPreDemoSnapshot(res.payload.preDemoSnapshot);
    const demoFeedbacks = [...(res.payload.reportFeedbacks ?? [])];
    reportFeedbacksRef.current = demoFeedbacks;
    replaceCases(res.payload.investigationCases, {
      nextFeedbacks: demoFeedbacks,
      persisted: res.ok,
      persistedAt: res.ok ? new Date().toISOString() : null,
      committed: isCleanup,
      cleanupPending: isCleanup,
      ...(isCleanup && !res.ok
        ? {
            storageError: {
              code: res.errorCode,
              error: res.error,
              committed: true,
              cleanupPending: true,
              recoveryRequired: true,
              recoveryJournal: res.recoveryJournal,
            },
          }
        : {}),
    });
    setSelectedCaseId(null);
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setAlertSelectionResetKey(prev => prev + 1);

    const nextActor =
      res.users.find(u => u.id === currentUser.id) ??
      res.users.find(u => u.id === DEFAULT_DEMO_USER.id) ??
      res.users[0] ??
      DEFAULT_DEMO_USER;
    if (nextActor.id !== currentUser.id) {
      handleSwitchUser(nextActor);
    }
  }, [currentWorkspacePayload, users, restoreStatus, handleCoordinatedFailure, replaceCases, currentUser.id, handleSwitchUser]);

  useEffect(() => {
    const enabled = isBrowserWf04DevToolsActive();
    devSampleToolsActiveRef.current = enabled;
    setDevSampleToolsEnabled(enabled);
    return () => {
      devSampleToolsActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    devSampleToolsActiveRef.current = devSampleToolsEnabled;
    return syncWf04DevToolsWindowBinding({
      targetWindow: typeof window !== "undefined" ? window : null,
      enabled: devSampleToolsEnabled,
      onLoadSampleData: handleLoadWf04Demo,
      onRestorePreDemo: handleRestorePreDemo,
      isDemoActive: () => wf04DemoActive,
    });
  }, [devSampleToolsEnabled, handleLoadWf04Demo, handleRestorePreDemo, wf04DemoActive]);

  const handleRetryStorage = useCallback(() => {
    if (
      restoreStatus === "blocked_corrupt" ||
      restoreStatus === "blocked_unsupported_version" ||
      restoreErrorCode === "BACKUP_WRITE_FAILED"
    ) {
      const retried = restoreWorkspaceSnapshot({
        defaultRules: initialRules,
        defaultEnterprises: demoEnterprises,
        defaultProjects,
        defaultTransactions: initialTransactions,
        defaultAuditLogs,
        defaultUsers: DEMO_USERS,
        extraFallbackEnterprises: WF04_DEMO_ENTERPRISES,
        migratedAt: new Date().toISOString(),
      });
      applyRestoredResult(retried);
      return;
    }

    const isRecovery =
      cleanupPending || restoreStatus === "recovery_required" || recoveryJournal !== undefined;
    if (caseHook.hasUnsavedChanges || caseHook.storageError !== null) {
      const hookRes = retryPersist({
        allowRecoveryOverwrite: isRecovery,
        operation: cleanupPending
          ? "retryCleanup"
          : isRecovery
            ? "recoverWorkspaceStorage"
            : "retryPersist",
      });
      if (hookRes.ok) {
        lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(currentWorkspacePayload, users);
        setRestoreStatus("ready");
        setRestoreErrorCode(null);
        setRecoveryJournal(undefined);
        setStorageErrorCode(null);
        setStorageFailureKind(null);
        setStorageErrorRolledBack(false);
        setCleanupPending(false);
        setHasUnsavedSessionChanges(false);
      } else if (hookRes.storageError) {
        const isStillCleanup =
          hookRes.storageError.code === "STORAGE_CLEANUP_FAILED" ||
          (Boolean(hookRes.committed) && Boolean(hookRes.cleanupPending));
        if (hookRes.storageError.preservePreDemoSnapshot && !isStillCleanup) {
          setPreDemoSnapshot(hookRes.storageError.preservePreDemoSnapshot);
          setWf04DemoActive(true);
        }
        if (isStillCleanup || hookRes.recoveryRequired || hookRes.rollbackFailed) {
          setRestoreStatus("recovery_required");
          setRecoveryJournal(hookRes.storageError.recoveryJournal);
          setStorageErrorRolledBack(false);
          setCleanupPending(isStillCleanup);
        } else {
          setCleanupPending(false);
          setStorageErrorRolledBack(Boolean(hookRes.rolledBack));
        }
        setStorageErrorCode(hookRes.storageError.code as WorkspaceStorageErrorCode);
        setHasUnsavedSessionChanges(!isStillCleanup);
      }
      return;
    }

    const coordRes = isRecovery
      ? recoverWorkspaceStorage({
          payload: currentWorkspacePayload,
          users,
          restoreStatus,
        })
      : persistWorkspaceAndUsers({
          payload: currentWorkspacePayload,
          users,
          restoreStatus,
          operation: "retryPersist",
        });

    if (coordRes.ok) {
      lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(coordRes.payload, users);
      setRestoreStatus("ready");
      setRestoreErrorCode(null);
      setRecoveryJournal(undefined);
      setStorageErrorCode(null);
      setStorageFailureKind(null);
      setStorageErrorRolledBack(false);
      setCleanupPending(false);
      setHasUnsavedSessionChanges(false);
    } else {
      handleCoordinatedFailure(
        coordRes,
        storageFailureKind ?? "generic",
        hasUnsavedSessionChanges,
      );
    }
  }, [
    restoreStatus,
    restoreErrorCode,
    cleanupPending,
    recoveryJournal,
    initialRules,
    defaultProjects,
    initialTransactions,
    defaultAuditLogs,
    applyRestoredResult,
    caseHook.hasUnsavedChanges,
    caseHook.storageError,
    retryPersist,
    currentWorkspacePayload,
    users,
    handleCoordinatedFailure,
    storageFailureKind,
    hasUnsavedSessionChanges,
  ]);

  const syncHookStorageResult = useCallback(
    (
      persisted: boolean,
      storageError: {
        readonly code: string;
        readonly committed?: boolean;
        readonly cleanupPending?: boolean;
        readonly rolledBack?: boolean;
        readonly rollbackFailed?: boolean;
        readonly recoveryRequired?: boolean;
        readonly recoveryJournal?: WorkspaceRecoveryJournal;
        readonly preservePreDemoSnapshot?: PreDemoWorkspaceSnapshot;
      } | null,
    ) => {
      if (persisted && lastHookPayloadRef.current) {
        lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(
          lastHookPayloadRef.current,
          users,
        );
      } else if (!persisted && storageError) {
        const isCleanup =
          storageError.code === "STORAGE_CLEANUP_FAILED" ||
          (Boolean(storageError.committed) && Boolean(storageError.cleanupPending));
        setHasUnsavedSessionChanges(!isCleanup);
        setCleanupPending(isCleanup);
        setStorageErrorCode(storageError.code as WorkspaceStorageErrorCode);
        setStorageFailureKind("generic");
        setStorageErrorRolledBack(Boolean(storageError.rolledBack));
        if (storageError.preservePreDemoSnapshot && !isCleanup) {
          setPreDemoSnapshot(storageError.preservePreDemoSnapshot);
          setWf04DemoActive(true);
        }
        if (isCleanup || storageError.recoveryRequired || storageError.rollbackFailed) {
          setRestoreStatus("recovery_required");
          setRecoveryJournal(storageError.recoveryJournal);
        }
      }
    },
    [users],
  );

  const mapCaseActionOutcome = useCallback(
    (outcome: InvestigationActionOutcome): InvestigationActionOutcome => {
      if (!outcome.ok) {
        const phase2bErrors = t.wf04Phase2b.errors;
        const localizedErrorMap: Partial<Record<typeof outcome.code, string>> = {
          TIMESTAMP_OUT_OF_ORDER: t.wf04Phase2a.caseQueue.timestampOutOfOrderError,
          INVALID_TIMESTAMP: t.wf04Phase2a.caseQueue.invalidTimestampError,
          STALE_REPORT_VERSION: phase2bErrors.staleReportVersion,
          REPORT_VERSION_MISMATCH: phase2bErrors.reportVersionMismatch,
          REPORT_NOT_FOUND: phase2bErrors.reportVersionMismatch,
          NO_PENDING_REPORT: phase2bErrors.noPendingReport,
          FORBIDDEN_ASSIGNEE: phase2bErrors.forbiddenAssignee,
          FORBIDDEN_TENANT: phase2bErrors.forbiddenEnterprise,
          FORBIDDEN_ROLE: phase2bErrors.forbiddenRole,
          INVALID_STATE: phase2bErrors.invalidStatus,
          CASE_ALREADY_CLOSED: phase2bErrors.caseAlreadyClosed,
          MISSING_ALERT_RESULT: phase2bErrors.missingAlertResult,
          MISSING_ALERT_EVIDENCE: phase2bErrors.missingAlertEvidence,
          MISSING_REPORT_SUMMARY: phase2bErrors.missingReportSummary,
          MISSING_REVISION_REASON: phase2bErrors.missingRevisionReason,
          MISSING_CONCLUSION_SUMMARY: phase2bErrors.missingConclusionSummary,
        };
        const mappedError = localizedErrorMap[outcome.code];
        return mappedError ? { ...outcome, error: mappedError } : outcome;
      }

      syncHookStorageResult(outcome.persisted, outcome.storageError);
      return outcome;
    },
    [
      t.wf04Phase2a.caseQueue.timestampOutOfOrderError,
      t.wf04Phase2a.caseQueue.invalidTimestampError,
      t.wf04Phase2b.errors,
      syncHookStorageResult,
    ],
  );

  const mapFeedbackActionOutcome = useCallback(
    (outcome: SubmitFeedbackOutcome): SubmitFeedbackOutcome => {
      if (!outcome.ok) {
        const feedbackErrors = t.wf04Phase2c.errors;
        const localizedFeedbackMap: Partial<Record<typeof outcome.code, string>> = {
          INVALID_FEEDBACK_INPUT: feedbackErrors.invalidInput,
          FORBIDDEN_ROLE: feedbackErrors.forbiddenRole,
          FORBIDDEN_TENANT: feedbackErrors.forbiddenTenant,
          CASE_NOT_FOUND: feedbackErrors.caseNotFound,
          CASE_NOT_CLOSED: feedbackErrors.caseNotClosed,
          MISSING_CONFIRMED_REPORT: feedbackErrors.missingConfirmedReport,
          MISSING_REPORT_ID: feedbackErrors.missingReportId,
          INVALID_REPORT_ID: feedbackErrors.invalidReportId,
          MISSING_REPORT_VERSION: feedbackErrors.missingReportVersion,
          INVALID_REPORT_VERSION: feedbackErrors.invalidReportVersion,
          REPORT_VERSION_MISMATCH: feedbackErrors.reportVersionMismatch,
          STALE_REPORT_VERSION: feedbackErrors.staleReportVersion,
          INVALID_TIMESTAMP: feedbackErrors.invalidTimestamp,
          TIMESTAMP_OUT_OF_ORDER: feedbackErrors.timestampOutOfOrder,
          DUPLICATE_REPORT_FEEDBACK: feedbackErrors.duplicateFeedback,
          FORBIDDEN_READ: feedbackErrors.forbiddenRead,
          FEEDBACK_NOT_FOUND: feedbackErrors.feedbackNotFound,
        };
        const mappedError = localizedFeedbackMap[outcome.code];
        return mappedError ? { ...outcome, error: mappedError } : outcome;
      }

      syncHookStorageResult(outcome.persisted, outcome.storageError);
      return outcome;
    },
    [t.wf04Phase2c.errors, syncHookStorageResult],
  );

  const handleCreateInvestigationCase = useCallback(
    (selectedAlertIds: string[], note?: string): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.createCase({ alertIds: selectedAlertIds, note })),
    [caseHook, mapCaseActionOutcome],
  );

  const handleAssignInvestigator = useCallback(
    (caseId: string, assigneeId: string): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.assignInvestigator({ caseId, assigneeId })),
    [caseHook, mapCaseActionOutcome],
  );

  const handleSelfAssignCase = useCallback(
    (caseId: string): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.selfAssign({ caseId })),
    [caseHook, mapCaseActionOutcome],
  );

  const handleSubmitInvestigationReport = useCallback(
    (args: SubmitInvestigationReportCommandArgs): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.submitReport(args)),
    [caseHook, mapCaseActionOutcome],
  );

  const handleRequestInvestigationRevision = useCallback(
    (args: RequestInvestigationRevisionCommandArgs): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.requestRevision(args)),
    [caseHook, mapCaseActionOutcome],
  );

  const handleConfirmInvestigationCaseReport = useCallback(
    (args: ConfirmInvestigationReportCommandArgs): InvestigationActionOutcome =>
      mapCaseActionOutcome(caseHook.confirmAndCloseReport(args)),
    [caseHook, mapCaseActionOutcome],
  );

  const handleSubmitReportFeedback = useCallback(
    (args: SubmitConfirmedReportFeedbackCommandArgs): SubmitFeedbackOutcome =>
      mapFeedbackActionOutcome(caseHook.submitReportFeedback(args)),
    [caseHook, mapFeedbackActionOutcome],
  );

  const handleOpenInvestigationCase = useCallback(
    (caseId: string) => {
      const targetCase = caseHook.cases.find(c => c.caseId === caseId);
      if (!targetCase) return;
      const access = evaluateInvestigationCaseReadAccess(targetCase, currentUser);
      if (!access.canViewInternalCase && !access.canViewConfirmedReport) return;

      const targetView: SecondaryView =
        currentUser.role === "Investigator" ? "my-cases" : "active-cases";
      if (!canAccessView(currentUser.role, targetView)) return;

      setDrawerOpen(false);
      setSelectedCaseId(caseId);
      setActiveNavItem(targetView);
    },
    [caseHook.cases, currentUser],
  );

  const recordAudit = (action: AuditLogEntry['action'], target: string, details: string, enterpriseId = enterprises.find(e => e.id === target || e.name === target || e.projectIds.includes(target))?.id) => {
    setAuditLogs(logs => [{ enterpriseId, id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: { name: currentUser.name, email: currentUser.email, role: currentUser.role }, action, target, details, ipAddress: 'Demo' }, ...logs]);
  };
  const changeRules: React.Dispatch<React.SetStateAction<RuleTemplate[]>> = action => {
    if (!deploymentEnterprise || !canDeploy(currentUser, deploymentEnterprise)) return;
    const next = typeof action === 'function' ? action(scopedRules) : action;
    let merged = [...rules];
    for (const rule of next) {
      const old = scopedRules.find(r => r.id === rule.id);
      if (JSON.stringify(old) === JSON.stringify(rule)) continue;
      const scoped = structuredClone(rule);
      scoped.enterpriseId = deploymentEnterprise.id;
      const bind = (item: RuleTemplate | NonNullable<RuleTemplate['draft']>) => { item.appliesTo.projects = item.appliesTo.projects.includes('*') ? [...deploymentEnterprise.projectIds] : item.appliesTo.projects.filter(p => deploymentEnterprise.projectIds.includes(p)); };
      bind(scoped); if (scoped.draft) bind(scoped.draft);
      if (!scoped.appliesTo.projects.length || scoped.draft && !scoped.draft.appliesTo.projects.length) return;
      // Shared templates are copied into enterprise scope, never overwritten for other staff.
      if (old && !old.enterpriseId) scoped.id = crypto.randomUUID();
      merged = [...merged.filter(r => r.id !== scoped.id), scoped];
      recordAudit(old ? 'RULE_UPDATED' : 'RULE_CREATED', deploymentEnterprise.name, scoped.name);
    }
    for (const old of scopedRules) if (old.enterpriseId === deploymentEnterprise.id && !next.some(r => r.id === old.id)) { merged = merged.filter(r => r.id !== old.id); recordAudit('RULE_DELETED', deploymentEnterprise.name, old.name); }
    setRules(merged);
  };
  const changeProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>> = action => {
    if (!permissions.canManageProjects) return;
    const scopedProjects = projects.filter(p => assignedProjectIds.includes(p.id));
    const requested = typeof action === 'function' ? action(scopedProjects) : action;
    if (requested.some(p => projects.some(old => old.id === p.id) && !assignedProjectIds.includes(p.id))) return;
    const created = requested.filter(p => !projects.some(old => old.id === p.id));
    if (created.length && (created.length > 1 || deploymentEnterprise?.projectIds.length)) return;
    if (created.length) { if (!deploymentEnterprise || !(canDeploy(currentUser, deploymentEnterprise) || currentUser.role === 'SME Admin' && deploymentEnterprise.id === currentUser.enterpriseId)) return; setEnterprises(prev => prev.map(e => e.id === deploymentEnterprise.id ? { ...e, projectIds: [...e.projectIds, ...created.map(p => p.id)] } : e)); }
    const next = [...projects.filter(p => !assignedProjectIds.includes(p.id)), ...requested];
    for (const project of next) if (JSON.stringify(projects.find(p => p.id === project.id)) !== JSON.stringify(project)) recordAudit('PROJECT_UPDATED', project.id, project.name);
    setProjects(next);
  };

  // Filter state
  const [filters, setFilters] = useState(initialFilters);
  const deferredQuery = useDeferredValue(filters.query.trim().toLowerCase());

  // Navigation state
  const [activeNavItem, setActiveNavItem] = useState<SecondaryView>(() => getRoleHomeView(currentUser.role));

  // Collapsible Sidebar state (persisted to localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fg_sidebar_collapsed");
      if (saved !== null) {
        setIsSidebarCollapsed(saved === "true");
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("fg_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleSidebar]);

  // Global Theme state (dark / light)
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  // Table state
  const [activeTab, setActiveTab] = useState<TableTab>("all");
  const [sort, setSort] = useState<SortState>({
    field: "processedAt",
    direction: "desc",
  });
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 10,
  });


  // Drawer state
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionRisk | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Date range filtering + search + filters
  const visibleTransactions = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - filters.range * 24 * 60 * 60 * 1000,
    );

    return dashboardTransactions.filter((transaction) => {
      const processedDate = new Date(transaction.processedAt);
      if (!Number.isFinite(processedDate.getTime()) || processedDate < cutoff || processedDate > now) return false;

      const searchTarget = [
        transaction.transactionReference,
        transaction.entityReference,
        transaction.projectName,
        transaction.transactionType,
      ]
        .join(" ")
        .toLowerCase();

      const matchesRisk =
        filters.riskLevel === "all" ||
        (filters.riskLevel === "Abnormal"
          ? transaction.riskLevel === "Abnormal"
          : filters.riskLevel === "Undetermined"
            ? transaction.riskLevel === "Undetermined"
          : filters.riskLevel === "Normal"
            ? transaction.riskLevel === "Normal"
            : transaction.riskLevel === filters.riskLevel);

      return (
        (!deferredQuery || searchTarget.includes(deferredQuery)) &&
        (filters.projectId === "all" ||
          transaction.projectId === filters.projectId) &&
        (filters.transactionType === "all" ||
          transaction.transactionType === filters.transactionType) &&
        matchesRisk &&
        (filters.scoringSource === "all" ||
          transaction.scoringSource === filters.scoringSource) &&
        (filters.caseStatus === "all" ||
          transaction.caseStatus === filters.caseStatus)
      );
    });
  }, [deferredQuery, filters, dashboardTransactions]);

  // KPIs from filtered data
  const metrics = useMemo(() => {
    const anomalies = visibleTransactions.filter(
      (transaction) => transaction.riskLevel === "Abnormal",
    );
    const visibleCases =
      currentUser.role === "Operator"
        ? caseHook.cases.filter(
            (c) => Boolean(currentUser.enterpriseId) && c.enterpriseId === currentUser.enterpriseId,
          )
        : currentUser.role === "Investigator"
          ? caseHook.cases.filter(
              (c) =>
                Boolean(currentUser.enterpriseId) &&
                c.enterpriseId === currentUser.enterpriseId &&
                c.assignee?.actorId === currentUser.id,
            )
          : [];

    return {
      analyzed: visibleTransactions.length,
      highRisk: anomalies.length,
      normals: visibleTransactions.filter((transaction) => transaction.riskLevel === "Normal").length,
      openAlerts: countOpenUnlinkedAlerts(
        visibleTransactions,
        caseHook.cases,
        legacyCaseArchive,
      ),
      activeCases: countActiveInvestigationCases(visibleCases),
    };
  }, [visibleTransactions, caseHook.cases, legacyCaseArchive, currentUser]);

  // Dynamic project/type options
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    projects.filter(p => assignedProjectIds.includes(p.id)).forEach(p => map.set(p.id, p.name));
    enterpriseTransactions.forEach((t) => map.set(t.projectId, t.projectName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [enterpriseTransactions, projects, enterprises, currentUser]);

  const transactionTypes = useMemo(() => {
    return [...new Set(enterpriseTransactions.map((t) => t.transactionType))];
  }, [enterpriseTransactions]);

  // Drawer handlers
  const handleReview = useCallback((transaction: TransactionRisk) => {
    if (!scopedTransactions.some(item => item.id === transaction.id)) return;
    setSelectedTransaction(transaction);
    setDrawerOpen(true);
  }, [scopedTransactions]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleUpdateTransaction = useCallback(
    (updated: TransactionRisk) => {
      if (
        currentUser.role === 'Viewer' ||
        currentUser.role === 'Platform Admin' ||
        currentUser.role === 'Implementation Staff'
      ) {
        return;
      }
      const previous = transactions.find(tx => tx.id === updated.id);
      if (!previous) return;
      if (
        !enterprises.some(
          e => e.id === currentUser.enterpriseId && e.projectIds.includes(previous.projectId),
        )
      ) {
        return;
      }
      // Step F lock: legacy case-field patches are strictly rejected from UI mutations.
      if (hasLegacyCaseFieldPatch(previous, updated)) {
        return;
      }
      setTransactions((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      setSelectedTransaction(updated);
    },
    [currentUser, transactions, enterprises],
  );

  // Reset pagination when filters change
  const handleFiltersChange: typeof setFilters = useCallback(
    (action) => {
      setFilters(action);
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [],
  );

  const handleNavItemChange = useCallback((id: string) => {
    setActiveNavItem(id as SecondaryView);
  }, []);

  const importPreview = (text: string, filename: string, projectId: string) => {
    if (!['SME Admin','Operator'].includes(currentUser.role)) throw Error('Vai trò này không được nhập dữ liệu.');
    const owner = enterprises.find(e => e.id === currentUser.enterpriseId && e.projectIds.includes(projectId));
    const set = ruleSets.find(s => s.enterpriseId === owner?.id);
    if (!owner || !set?.activeVersion || set.handover?.version !== set.activeVersion) throw Error('Cần tập quy tắc đang hoạt động và đã bàn giao trước khi nhập dữ liệu.');
    const plan = enterprisePlan(owner);
    if (!plan) throw Error('Doanh nghiệp chưa được thiết lập gói dịch vụ.');
    const rules = set.versions.find(v => v.version === set.activeVersion)?.rules ?? [];
    const preview = previewTransactionImport(text, filename, projectId, projects.find(p=>p.id===projectId)?.name ?? owner.name, rules, transactions, set.versions.find(v=>v.version===set.activeVersion)?.schema ?? [], plan);
    return preview.map(row=>row.transaction ? {...row, transaction:{...row.transaction, ruleEvaluation:{...row.transaction.ruleEvaluation!, ruleSet:{id:set.id,name:set.name,version:set.activeVersion!}}}} : row);
  };

  /* ── Render active view ── */
  const renderView = () => {
    if (!canAccessView(currentUser.role, activeNavItem)) return <p role="status">{language === "vi" ? "Vai trò này không có quyền truy cập trang này." : "This role cannot access this page."}</p>;
    if (['rule-testing', 'rule-templates'].includes(activeNavItem) && currentUser.role !== 'Implementation Staff') return <p>{language === 'vi' ? 'Chỉ nhân viên triển khai được sử dụng chức năng này.' : 'Deployment staff only.'}</p>;
    if (activeNavItem === 'platform-health' && currentUser.role !== 'Platform Admin') return <p>Platform Admin only.</p>;
    if (['risk-overview', 'recent-alerts', 'active-cases', 'my-cases', 'reports'].includes(activeNavItem) && ['Implementation Staff', 'Platform Admin'].includes(currentUser.role)) return <p>{language === 'vi' ? 'Vai trò này không truy cập nghiệp vụ điều tra của doanh nghiệp.' : 'Enterprise operations are not available to this role.'}</p>;
    switch (activeNavItem) {
      case "members":
        return <MembersView users={users} currentUser={currentUser} onSave={user => {
          if (!canSaveMember(currentUser, user, users, enterpriseTransactions, caseHook.cases, legacyCaseArchive)) return false;
          const old = users.find(u => u.id === user.id);
          if (old && old.name !== user.name) setTransactions(prev => prev.map(tx => {
            if (!enterprises.some(e => e.id === user.enterpriseId && e.projectIds.includes(tx.projectId))) return tx;
            if (tx.assignedInvestigatorId ? tx.assignedInvestigatorId !== old.id : tx.assignedInvestigator !== old.name) return tx;
            return { ...tx, assignedInvestigatorId: old.id, assignedInvestigator: user.name };
          }));
          setUsers(prev => [...prev.filter(u => u.id !== user.id), user]);
          recordAudit('PROJECT_UPDATED', currentUser.enterpriseId!, 'Cập nhật thành viên: ' + user.email + ' / ' + user.role);
          return true;
        }} />;
      case "onboarding":
        if (!['Platform Admin','Implementation Staff'].includes(currentUser.role)) return <p>{language === 'vi' ? 'Chỉ nhân sự FraudGuard được thiết lập doanh nghiệp.' : 'Internal staff only.'}</p>;
        return <OnboardingView enterprises={accessibleEnterprises} users={users} currentUser={currentUser} sets={ruleSets} onCreate={(name,staffId,adminName,adminEmail)=>{
          if(!canProvisionEnterpriseAdmin(currentUser,adminName,adminEmail,users)||!name.trim()||enterprises.some(e=>e.name.toLowerCase()===name.trim().toLowerCase())||!users.some(u=>u.id===staffId&&u.role==='Implementation Staff'))return false;
          const id=crypto.randomUUID(),projectId='workspace-'+id;
          const code = generateEnterpriseCode(name.trim(), id);
          const nextUsers: UserProfile[] = [...users,{id:crypto.randomUUID(),enterpriseId:id,name:adminName.trim(),email:adminEmail.trim().toLowerCase(),role:'SME Admin',title:'Quản trị doanh nghiệp',avatarLetter:adminName.trim().charAt(0).toUpperCase(),avatarBg:'#7c3aed',description:'Tài khoản quản trị demo của '+name.trim()}];
          const nextEnterprises: Enterprise[] = [...enterprises,{id,code,name:name.trim(),deploymentStaffId:staffId,projectIds:[projectId],specification:{stage:'intake',representativeName:adminName.trim(),representativeRole:'Quản trị Doanh nghiệp (SME Admin)',representativeEmail:adminEmail.trim().toLowerCase(),smeAdminName:adminName.trim(),smeAdminEmail:adminEmail.trim().toLowerCase(),intakeDocuments:[],supplementRequests:[],conditionsList:[],schema:[],feedbackHistory:[],dataAndEvaluationClarified:false,requirements:'',fields:'',conditions:'',sampleJson:'[]',updatedAt:new Date().toISOString()}}];
          const nextProjects: ProjectItem[] = [...projects,{id:projectId,name:name.trim(),code:id,description:'Phạm vi triển khai chính',environment:'Staging',apiKey:'',quota:{used:0,total:0,resetDate:''},status:'Inactive',createdAt:new Date().toISOString()}];
          const writeRes = mergeAndPersistWorkspaceSlice({
            currentPayload: currentWorkspacePayload,
            patch: { enterprises: nextEnterprises, projects: nextProjects },
            users: nextUsers,
            restoreStatus,
          });
          const isCreateCleanup =
            !writeRes.ok && Boolean(writeRes.committed) && Boolean(writeRes.cleanupPending);
          if (!writeRes.ok && !isCreateCleanup) {
            handleCoordinatedFailure(writeRes, "generic", hasUnsavedSessionChanges);
            return false;
          }
          if (writeRes.ok) {
            lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(writeRes.payload, nextUsers);
            setStorageErrorCode(null);
            setStorageFailureKind(null);
            setStorageErrorRolledBack(false);
            setCleanupPending(false);
            setHasUnsavedSessionChanges(false);
          } else {
            lastPersistedSnapshotRef.current = null;
            handleCoordinatedFailure(writeRes, "generic", false);
          }
          setUsers(nextUsers);
          setEnterprises(nextEnterprises);
          setProjects(nextProjects);
          recordAudit('PROJECT_UPDATED',id,'Tạo workspace và phân công triển khai: '+staffId,id);return true;
        }} onProvisionWorkspace={id=>{
          const target=enterprises.find(e=>e.id===id);
          if(currentUser.role!=='Platform Admin'||!target||target.projectIds.length>0)return false;
          const existingProject=projects.find(p=>p.id==='workspace-'+id||p.code===id);
          const projectId=existingProject?existingProject.id:'workspace-'+id;
          const nextProjects: ProjectItem[] = existingProject
            ? projects
            : [...projects,{id:projectId,name:target.name,code:id,description:'Phạm vi triển khai chính',environment:'Staging',apiKey:'',quota:{used:0,total:0,resetDate:''},status:'Inactive',createdAt:new Date().toISOString()}];
          const nextEnterprises: Enterprise[] = enterprises.map(e=>{
            if(e.id!==id)return e;
            const updated:Enterprise={...e,projectIds:[projectId]};
            if(updated.specification){
              const readiness=evaluateSetupReadiness(updated.specification,language==='vi',updated);
              updated.specification={
                ...updated.specification,
                confirmedAt:readiness.ready?updated.specification.confirmedAt||updated.specification.enterpriseConfirmation?.confirmedAt||new Date().toISOString():undefined,
                confirmedBy:readiness.ready?updated.specification.enterpriseConfirmation?.confirmedBy||updated.specification.confirmedBy||currentUser.name:undefined,
              };
            }
            return updated;
          });
          const writeRes = mergeAndPersistWorkspaceSlice({
            currentPayload: currentWorkspacePayload,
            patch: { enterprises: nextEnterprises, projects: nextProjects },
            restoreStatus,
          });
          const isProvisionCleanup =
            !writeRes.ok && Boolean(writeRes.committed) && Boolean(writeRes.cleanupPending);
          if (!writeRes.ok && !isProvisionCleanup) {
            handleCoordinatedFailure(writeRes, "generic", hasUnsavedSessionChanges);
            return false;
          }
          if (writeRes.ok) {
            lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(writeRes.payload, users);
            setStorageErrorCode(null);
            setStorageFailureKind(null);
            setStorageErrorRolledBack(false);
            setCleanupPending(false);
            setHasUnsavedSessionChanges(false);
          } else {
            lastPersistedSnapshotRef.current = null;
            handleCoordinatedFailure(writeRes, "generic", false);
          }
          if(!existingProject) setProjects(nextProjects);
          setEnterprises(nextEnterprises);
          recordAudit('PROJECT_UPDATED',id,'Khởi tạo phạm vi workspace: '+projectId,id);return true;
        }} onSave={(id,specification,auditDetail)=>{
          const owner=enterprises.find(e=>e.id===id);
          const check=validateOnboardingSave(owner,currentUser,specification,language==='vi');
          if(!check.ok||!check.specification)return false;
          const spec=check.specification;
          const nextEnterprises=enterprises.map(e=>e.id===id?{...e,specification:spec}:e);
          const nextRuleSets=ruleSets.map(set=>set.enterpriseId===id&&set.draft?{...set,draft:{...set.draft,test:undefined}}:set);
          const writeRes = mergeAndPersistWorkspaceSlice({
            currentPayload: currentWorkspacePayload,
            patch: { enterprises: nextEnterprises, ruleSets: nextRuleSets },
            restoreStatus,
          });
          const isSaveCleanup =
            !writeRes.ok && Boolean(writeRes.committed) && Boolean(writeRes.cleanupPending);
          if (!writeRes.ok && !isSaveCleanup) {
            handleCoordinatedFailure(writeRes, "generic", hasUnsavedSessionChanges);
            return false;
          }
          if (writeRes.ok) {
            lastPersistedSnapshotRef.current = serializeCoordinatedSnapshot(writeRes.payload, users);
            setStorageErrorCode(null);
            setStorageFailureKind(null);
            setStorageErrorRolledBack(false);
            setCleanupPending(false);
            setHasUnsavedSessionChanges(false);
          } else {
            lastPersistedSnapshotRef.current = null;
            handleCoordinatedFailure(writeRes, "generic", false);
          }
          setEnterprises(nextEnterprises);
          setRuleSets(nextRuleSets);
          recordAudit('PROJECT_UPDATED',id,auditDetail||(spec.confirmedAt?'Xác nhận đặc tả':'Cập nhật hồ sơ đặc tả'));return true;
        }} onOpenRules={id=>{setDeploymentEnterpriseId(id);setActiveNavItem('rule-sets');}} />;
      case "rule-sets":
        return <RuleSetsView initialEnterpriseId={deploymentEnterpriseId} key={currentUser.id + deploymentEnterpriseId} sets={ruleSets} rules={rules} projects={projects} enterprises={enterprises} currentUser={currentUser} reviewer={currentUser.name} onOpenLibrary={id => { setDeploymentEnterpriseId(id); setActiveNavItem('rule-templates'); }} onAssign={(enterpriseId, staffId) => { if (currentUser.role !== 'Platform Admin' || !DEMO_USERS.some(u => u.id === staffId && u.role === 'Implementation Staff')) return; setEnterprises(prev => prev.map(e => e.id === enterpriseId ? { ...e, deploymentStaffId: staffId } : e)); recordAudit('PROJECT_UPDATED', enterpriseId, 'Phân công triển khai: ' + staffId); }} onChange={(next, event) => { if (!canChangeEnterpriseSets(ruleSets, next, currentUser, enterprises)) return; setRuleSets(next); for (const changed of next.filter(set => JSON.stringify(ruleSets.find(old => old.id === set.id)) !== JSON.stringify(set))) recordAudit('RULE_UPDATED', changed.id, event, changed.enterpriseId); }} />;

      case "rule-testing":
        return (
          <RuleTestingView
            schemasByEnterprise={Object.fromEntries(ruleSets.filter(s => s.activeVersion).map(s => [s.enterpriseId, s.versions.find(v => v.version === s.activeVersion)?.schema ?? []]))}
            enterprises={accessibleEnterprises}
            activeRules={activeSetRules(ruleSets.filter(s => accessibleEnterprises.some(e => e.id === s.enterpriseId)))}
            setContext={Object.fromEntries(ruleSets.filter(s => s.activeVersion && accessibleEnterprises.some(e => e.id === s.enterpriseId)).flatMap(s => s.projectIds.map(projectId => [projectId, { id: s.id, name: s.name, version: s.activeVersion! }])))}
            projects={projects}
            rules={scopedRules}
            onAddDemoTransactions={items => {
              if (!permissions.canAccessRuleTesting || items.some(item => !assignedProjectIds.includes(item.projectId))) return;
              setTransactions(previous => [...items.filter(item => !previous.some(old => old.id === item.id)).map(item => ({ ...item, dataOrigin: 'sandbox' as const, projectName: projects.find(project => project.id === item.projectId)?.name ?? item.projectName })), ...previous]);
              recordAudit('ALERT_REVIEWED', 'Sandbox demo', 'Added rule-set evaluation results: ' + items.length);
            }}
            onOpenDraft={id => { setDeploymentEnterpriseId(id); setActiveNavItem("rule-sets"); }}
          />
        );
      case "recent-alerts":
        return (
          <AlertsView
            transactions={enterpriseTransactions}
            onReview={handleReview}
            canManageCases={permissions.canManageCases}
            selectedAlertId={drawerOpen ? selectedTransaction?.id : undefined}
            investigationCases={caseHook.cases}
            legacyCaseArchive={legacyCaseArchive}
            enterprises={enterprises}
            currentUser={currentUser}
            onCreateInvestigationCase={handleCreateInvestigationCase}
            onOpenInvestigationCase={handleOpenInvestigationCase}
            selectionResetKey={alertSelectionResetKey}
          />
        );
      case "active-cases":
      case "my-cases":
        return (
          <CasesView
            investigationCases={caseHook.cases}
            legacyCaseArchive={legacyCaseArchive}
            transactions={enterpriseTransactions}
            enterprises={enterprises}
            users={users}
            investigatorUsers={users.filter(
              u => u.enterpriseId === currentUser.enterpriseId && u.role === "Investigator",
            )}
            permissions={permissions}
            currentUser={currentUser}
            currentRole={currentUser.role}
            currentUserName={currentUser.name}
            currentUserId={currentUser.id}
            selectedCaseId={selectedCaseId}
            onSelectCaseId={setSelectedCaseId}
            onAssignInvestigator={handleAssignInvestigator}
            onSelfAssignCase={handleSelfAssignCase}
            onSubmitReport={handleSubmitInvestigationReport}
            onRequestRevision={handleRequestInvestigationRevision}
            onConfirmAndCloseReport={handleConfirmInvestigationCaseReport}
            reportFeedbacks={caseHook.feedbacks}
            onSubmitReportFeedback={handleSubmitReportFeedback}
            onReviewTransaction={handleReview}
          />
        );
      case "rule-templates":
        return (<><div className={styles.scopeBar}><label className={styles.filterField}><span className={styles.filterLabel}>{language === 'vi' ? 'Doanh nghiệp triển khai' : 'Enterprise'}</span><select className={styles.control} value={deploymentEnterprise?.id ?? ''} onChange={e => setDeploymentEnterpriseId(e.target.value)}>{accessibleEnterprises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div><p className={styles.muted}>{language === 'vi' ? 'Sửa mẫu dùng chung sẽ tạo bản sao riêng cho doanh nghiệp đang chọn. Các tập đã lưu không tự thay đổi; cập nhật bản sao và kiểm thử lại trong trang Tập rule.' : 'Editing shared templates creates an enterprise copy. Saved rule sets require an explicit refresh and retest.'}</p>
          <RulesView key={deploymentEnterprise?.id}
            transactions={[]}
            onRulesChange={changeRules}
            initialRules={scopedRules}
            permissions={permissions}
            onNavigateToTesting={() => setActiveNavItem("rule-sets")}
          /></>
        );
      case "projects":
        return (<><div className={styles.scopeBar}><label className={styles.filterField}><span className={styles.filterLabel}>{language === 'vi' ? 'Doanh nghiệp' : 'Enterprise'}</span><select className={styles.control} value={deploymentEnterprise?.id ?? ''} onChange={e => setDeploymentEnterpriseId(e.target.value)}>{accessibleEnterprises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
          <ProjectsView enterprise={deploymentEnterprise} transactions={transactions} dataSchema={(() => { const set = ruleSets.find(item=>item.enterpriseId===deploymentEnterprise?.id); return set?.activeVersion ? set.versions.find(version=>version.version===set.activeVersion)?.schema : deploymentEnterprise?.specification?.schema; })()}
            initialProjects={projects.filter(p => deploymentEnterprise?.projectIds.includes(p.id))}
            onProjectsChange={action => { const selectedProjects = projects.filter(p => deploymentEnterprise?.projectIds.includes(p.id)); const next = typeof action === 'function' ? action(selectedProjects) : action; changeProjects([...projects.filter(p => assignedProjectIds.includes(p.id) && !deploymentEnterprise?.projectIds.includes(p.id)), ...next]); }}
            permissions={permissions}

          /></>
        );
      case "reports":
        return (
          <ReportsView
            transactions={enterpriseTransactions}
            investigationCases={caseHook.cases}
            legacyCaseArchive={legacyCaseArchive}
            enterprises={enterprises}
            users={users}
            currentUser={currentUser}
            permissions={permissions}
            onReview={handleReview}
            onOpenInvestigationCase={handleOpenInvestigationCase}
            reportFeedbacks={caseHook.feedbacks}
            onSubmitReportFeedback={handleSubmitReportFeedback}
          />
        );
      case "audit-trail":
        return (
          <AuditTrailView
            initialLogs={auditForUser(
              auditLogs,
              currentUser,
              enterprises,
              transactions,
              caseHook.cases,
              legacyCaseArchive,
            )}
          />
        );
      case "platform-health":
        return (
          <PlatformHealthView
            enterprises={enterprises}
            transactions={transactions}
            reportFeedbacks={caseHook.feedbacks}
            currentUser={currentUser}
            users={users}
            wf04Managed={true}
            onPlanChange={(id,plan)=>{if(currentUser.role!=='Platform Admin'||!['Free','Subscription'].includes(plan))return;setEnterprises(prev=>prev.map(e=>e.id===id?{...e,plan}:e));recordAudit('PROJECT_UPDATED',id,'Đổi gói demo: '+plan);}}
          />
        );
      case "risk-overview":
      default:
        return (
          <>
            <div className={styles.pageHeading}>
              <div>
                <h1>{t.riskOverview.title}</h1>
                <p>{t.riskOverview.subtitle}</p>
              </div>
            </div>

            <div className={styles.scopeBar}><label className={styles.filterField}><span className={styles.filterLabel}>{language === 'vi' ? 'Dữ liệu hiển thị' : 'Displayed data'}</span><select className={styles.control} value={showTestData ? 'test' : 'operation'} onChange={event => { setShowTestData(event.target.value === 'test'); setFilters(initialFilters); setActiveTab('all'); setPagination(prev => ({...prev,page:1})); }}><option value="operation">{language === 'vi' ? 'Giao dịch doanh nghiệp' : 'Enterprise transactions'}</option><option value="test">{language === 'vi' ? 'Dữ liệu kiểm thử' : 'Test data'}</option></select></label></div>
            {showTestData && <p role="status">{language === 'vi' ? 'Đang xem kết quả Sandbox. Dữ liệu này không tính vào báo cáo vận hành, lượt sử dụng hoặc thông báo.' : 'Viewing Sandbox results. These are excluded from operational reports, usage and notifications.'}</p>}
            <DashboardToolbar key={currentUser.id} importActions={["SME Admin","Operator"].includes(currentUser.role) ? { preview: importPreview, save: (text,filename,projectId) => {
              const rows=importPreview(text,filename,projectId); if(rows.some(r=>r.error)) throw Error("File có dòng lỗi hoặc giao dịch trùng. Kiểm tra lại trước khi lưu.");
              const items=rows.flatMap(r=>r.transaction?[r.transaction]:[]);setTransactions(prev=>[...items,...prev]);
              setShowTestData(false);setFilters({...initialFilters,projectId});setActiveTab("all");setPagination(prev=>({...prev,page:1}));
              recordAudit("ALERT_REVIEWED",currentUser.enterpriseId!,"Nhập file demo: "+items.length+" giao dịch bằng quy tắc");return items.length;
            }} : undefined}
              filters={filters}
              projects={projectOptions}
              transactionTypes={transactionTypes}
              onChange={handleFiltersChange}
              visibleTransactions={visibleTransactions}
              investigationCases={caseHook.cases}
              legacyCaseArchive={legacyCaseArchive}
              currentUser={currentUser}
            />

            {currentUser.role === "Operator" || currentUser.role === "Investigator" ? (
              <section className={styles.metricsGrid}>
                <StatCard
                  label={t.riskOverview.kpis.pendingAlerts}
                  value={metrics.openAlerts}
                  description={t.riskOverview.kpis.pendingAlertsDesc}
                  tone={metrics.openAlerts > 0 ? "critical" : undefined}
                />
                <StatCard
                  label={t.riskOverview.kpis.activeCases}
                  value={metrics.activeCases}
                  description={t.riskOverview.kpis.activeCasesDesc}
                  tone="warning"
                />
                <StatCard
                  label={t.riskOverview.kpis.anomaly}
                  value={metrics.highRisk}
                  description={t.riskOverview.kpis.anomalyDescExceeded}
                  tone="critical"
                />
                <StatCard
                  label={t.riskOverview.kpis.normal}
                  value={metrics.normals}
                  description={t.riskOverview.kpis.normalDescSafe}
                />
              </section>
            ) : currentUser.role === "Viewer" ? (
              <section className={styles.metricsGrid}>
                <StatCard
                  label={t.riskOverview.kpis.totalAnalyzed}
                  value={metrics.analyzed}
                  description={t.riskOverview.kpis.inLastDays.replace("{range}", String(filters.range))}
                />
                <StatCard
                  label={t.riskOverview.kpis.anomalyRatio}
                  value={
                    metrics.analyzed > 0
                      ? `${Math.round((metrics.highRisk / metrics.analyzed) * 100)}%`
                      : "0%"
                  }
                  description={`${metrics.highRisk} ${t.riskOverview.kpis.anomalyRatioDesc}`}
                  tone="critical"
                />
                <StatCard
                  label={t.riskOverview.kpis.falseAlarmRate}
                  value={
                    visibleTransactions.filter((t) => t.caseStatus).length > 0
                      ? `${Math.round(
                          (visibleTransactions.filter((t) => t.caseStatus === "False Alarm")
                            .length /
                            visibleTransactions.filter((t) => t.caseStatus).length) *
                            100,
                        )}%`
                      : "0%"
                  }
                  description={t.riskOverview.kpis.falseAlarmRateDesc}
                />
                <StatCard
                  label={t.riskOverview.kpis.resolvedAudits}
                  value={
                    visibleTransactions.filter(
                      (t) =>
                        t.caseStatus === "Resolved" ||
                        t.caseStatus === "Confirmed Fraud",
                    ).length
                  }
                  description={t.riskOverview.kpis.resolvedAuditsDesc}
                  tone="warning"
                />
              </section>
            ) : (
              <section className={styles.metricsGrid}>
                <StatCard
                  label={t.riskOverview.kpis.totalAnalyzed}
                  value={metrics.analyzed}
                  description={t.riskOverview.kpis.inLastDays.replace("{range}", String(filters.range))}
                />
                <StatCard
                  label={t.riskOverview.kpis.anomaly}
                  value={metrics.highRisk}
                  description={t.riskOverview.kpis.anomalyDescExceeded}
                  tone="critical"
                />
                <StatCard
                  label={t.riskOverview.kpis.normal}
                  value={metrics.normals}
                  description={t.riskOverview.kpis.normalDescSafe}
                />
                <StatCard
                  label={t.riskOverview.kpis.activeCases}
                  value={metrics.activeCases}
                  description={t.riskOverview.kpis.activeCasesDesc}
                  tone="warning"
                />
              </section>
            )}

            <section className={styles.chartGrid}>
              <Panel
                title={t.riskOverview.charts.trendTitle}
                description={t.riskOverview.charts.trendDesc}
              >
                <TransactionRiskTrend
                  transactions={visibleTransactions}

                />
              </Panel>
              <Panel
                title={t.riskOverview.charts.distTitle}
                description={t.riskOverview.charts.distDesc}
              >
                <RiskDistributionChart
                  transactions={visibleTransactions}

                />
              </Panel>
            </section>

            <TransactionRiskTable
              transactions={visibleTransactions}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              sort={sort}
              onSortChange={setSort}
              pagination={pagination}
              onPaginationChange={setPagination}
              onReview={handleReview}
              investigationCases={caseHook.cases}
              legacyCaseArchive={legacyCaseArchive}
              currentUser={currentUser}
            />
          </>
        );
    }
  };

  const currentViewTitle = useMemo(() => {
    if (currentUser.role === "Investigator") {
      if (activeNavItem === "reports") return t.nav.items.investigationHistory;
      if (activeNavItem === "active-cases" || activeNavItem === "my-cases")
        return t.nav.items.myCases;
    }
    const navTitleMap: Record<SecondaryView, string> = {
      members: language === "vi" ? "Thành viên doanh nghiệp" : "Enterprise members",
      "risk-overview": t.nav.items.riskOverview,
      "recent-alerts": t.nav.items.recentAlerts,
      "active-cases": t.nav.items.activeCases,
      "my-cases": t.nav.items.myCases,
      "rule-templates": t.nav.items.ruleTemplates,
      "rule-testing": t.nav.items.ruleTesting,
      "rule-sets": currentUser.role === 'SME Admin' ? (language === 'vi' ? 'Quy tắc phát hiện' : 'Detection rules') : t.nav.items.ruleSets,
      onboarding: t.nav.items.onboarding,
      projects: t.nav.items.projects,
      reports: t.nav.items.reports,
      "audit-trail": t.nav.items.auditTrail,
      "platform-health": t.nav.items.platformHealth,
    };
    return navTitleMap[activeNavItem] || t.nav.items.riskOverview;
  }, [currentUser.role, activeNavItem, t, language]);

  const storageBanner = useMemo(() => {
    const st = t.wf04Phase2a.storage;
    if (restoreStatus === "blocked_corrupt") {
      return {
        isError: true,
        title: st.corruptBlocked,
        detail: st.storageReadOnlyNotice,
        badge: undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (restoreStatus === "blocked_unsupported_version") {
      return {
        isError: true,
        title: st.unsupportedVersionBlocked,
        detail: st.storageReadOnlyNotice,
        badge: undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (
      cleanupPending ||
      storageErrorCode === "STORAGE_CLEANUP_FAILED" ||
      caseHook.storageError?.code === "STORAGE_CLEANUP_FAILED"
    ) {
      return {
        isError: true,
        title: st.cleanupRequired,
        detail: undefined,
        badge: st.cleanupPendingBadge,
        actionLabel: st.retryCleanupBtn,
      };
    }
    if (
      restoreStatus === "recovery_required" ||
      storageErrorCode === "STORAGE_ROLLBACK_FAILED" ||
      storageErrorCode === "STORAGE_RECOVERY_REQUIRED" ||
      caseHook.storageError?.recoveryRequired
    ) {
      return {
        isError: true,
        title: st.recoveryRequired,
        detail: st.storageReadOnlyNotice,
        badge: st.recoveryBadge,
        actionLabel: st.recoveryActionBtn,
      };
    }
    if (restoreErrorCode === "BACKUP_WRITE_FAILED") {
      return {
        isError: true,
        title: st.backupFailed,
        detail: st.storageReadOnlyNotice,
        badge: undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (
      storageErrorCode === "STORAGE_READ_FAILED" ||
      caseHook.storageError?.code === "STORAGE_READ_FAILED"
    ) {
      return {
        isError: true,
        title: st.readFailed,
        detail: undefined,
        badge:
          hasUnsavedSessionChanges || caseHook.hasUnsavedChanges
            ? st.unsavedChangesBadge
            : undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (storageFailureKind === "demoLoad" && storageErrorCode !== null) {
      return {
        isError: true,
        title: st.demoLoadFailed,
        detail: storageErrorRolledBack ? st.rollbackNotice : undefined,
        badge: undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (storageFailureKind === "demoRestore" && storageErrorCode !== null) {
      return {
        isError: true,
        title: st.demoRestoreFailed,
        detail: storageErrorRolledBack ? st.rollbackNotice : undefined,
        badge: undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    if (
      hasUnsavedSessionChanges ||
      storageErrorCode !== null ||
      caseHook.hasUnsavedChanges ||
      caseHook.storageError !== null
    ) {
      return {
        isError: true,
        title: st.saveFailedUnsaved,
        detail:
          storageErrorRolledBack || caseHook.storageError?.rolledBack
            ? st.rollbackNotice
            : undefined,
        badge:
          hasUnsavedSessionChanges || caseHook.hasUnsavedChanges
            ? st.unsavedChangesBadge
            : undefined,
        actionLabel: st.retrySaveBtn,
      };
    }
    return null;
  }, [
    t.wf04Phase2a.storage,
    restoreStatus,
    cleanupPending,
    restoreErrorCode,
    storageErrorCode,
    storageFailureKind,
    storageErrorRolledBack,
    hasUnsavedSessionChanges,
    caseHook.hasUnsavedChanges,
    caseHook.storageError,
  ]);

  return (
    <ToastProvider>
      <div className={styles.root} data-theme={theme}>
        <Sidebar
          activeItem={activeNavItem}
          onItemChange={handleNavItemChange}
          currentUser={currentUser}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />
        <div className={styles.workspace}>
          <ProductHeader
            users={users}
            notificationTransactions={enterpriseTransactions}
            onOpenNotification={handleReview}
            investigationCases={caseHook.cases}
            legacyCaseArchive={legacyCaseArchive}
            onOpenInvestigationCase={handleOpenInvestigationCase}
            enterprises={enterprises}
            activeViewTitle={currentViewTitle}
            theme={theme}
            onToggleTheme={toggleTheme}
            currentUser={currentUser}
            onSwitchUser={handleSwitchUser}
            onNavigate={setActiveNavItem}
          />
          <main className={styles.main}>
            {storageBanner && (
              <div
                className={storageBanner.isError ? styles.modalErrorBanner : styles.storageInlineBanner}
                role="alert"
              >
                <div className={styles.toolbarGroup}>
                  <strong>{storageBanner.title}</strong>
                  {storageBanner.badge && (
                    <span className={styles.categoryBadge}>{storageBanner.badge}</span>
                  )}
                  {storageBanner.detail && <span>{storageBanner.detail}</span>}
                </div>
                <button type="button" className={styles.button} onClick={handleRetryStorage}>
                  {storageBanner.actionLabel}
                </button>
              </div>
            )}
            {devSampleToolsEnabled && (
              <div
                className={styles.storageInlineBanner}
                data-testid="wf04-dev-sample-tools"
                role="region"
                aria-label={t.wf04Phase2a.demo.contextLabel}
              >
                <div className={styles.toolbarGroup}>
                  <strong>{t.wf04Phase2a.demo.contextLabel}</strong>
                  <span className={styles.categoryBadge}>
                    {wf04DemoActive
                      ? t.wf04Phase2a.demo.activeBadge
                      : t.wf04Phase2a.demo.inactiveBadge}
                  </span>
                </div>
                <div className={styles.toolbarGroup}>
                  {!wf04DemoActive && (
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={handleLoadWf04Demo}
                    >
                      {t.wf04Phase2a.demo.loadDemoBtn}
                    </button>
                  )}
                  {wf04DemoActive && (
                    <>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={handleLoadWf04Demo}
                      >
                        {t.wf04Phase2a.demo.addReviewSamplesBtn}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={handleRestorePreDemo}
                      >
                        {t.wf04Phase2a.demo.restorePreviousBtn}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {legacyUnassigned.length > 0 && currentUser.role === 'Platform Admin' && <details className={styles.panel}><summary>{language === 'vi' ? 'Tập rule cũ chưa xác định doanh nghiệp' : 'Unassigned legacy sets'} ({legacyUnassigned.length})</summary><pre className={styles.sandboxJson}>{JSON.stringify(legacyUnassigned, null, 2)}</pre></details>}{renderView()}
          </main>
        </div>

        <AlertCaseDrawer
          investigators={users
            .filter(u => u.enterpriseId === currentUser.enterpriseId && u.role === "Investigator")
            .map(u => u.name)}
          transaction={selectedTransaction}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          onUpdateTransaction={handleUpdateTransaction}
          permissions={permissions}
          currentRole={currentUser.role}
          currentUserName={currentUser.name}
          currentUserId={currentUser.id}
          investigationCases={caseHook.cases}
          legacyCaseArchive={legacyCaseArchive}
          users={users}
          currentUser={currentUser}
          onOpenInvestigationCase={handleOpenInvestigationCase}
          wf04Managed={true}
        />
      </div>
    </ToastProvider>
  );
}

export function FraudGuardDashboard(props: FraudGuardDashboardProps) {
  return (
    <LanguageProvider>
      <FraudGuardDashboardContent {...props} />
    </LanguageProvider>
  );
}
