const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const baseCache = new Map();

function resolveModulePath(fromDir, spec) {
  const base = spec.startsWith('@/')
    ? path.join(ROOT, 'src', spec.slice(2))
    : path.resolve(fromDir, spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module "${spec}" from "${fromDir}"`);
}

function load(relative, imports = {}) {
  const filename = path.isAbsolute(relative) ? relative : path.join(ROOT, relative);
  const hasOverrides = Object.keys(imports).length > 0;
  if (!hasOverrides && baseCache.has(filename)) {
    return baseCache.get(filename);
  }

  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const exports = {};
  const module = { exports };
  if (!hasOverrides) {
    baseCache.set(filename, exports);
  }

  const sandbox = {
    module,
    exports,
    React,
    structuredClone,
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    URL: globalThis.URL,
    Blob: globalThis.Blob,
    setTimeout,
    clearTimeout,
    console,
    require(spec) {
      if (spec in imports) return imports[spec];
      if (spec.endsWith('.css')) {
        return new Proxy({}, { get: (_, prop) => String(prop) });
      }
      if (spec === 'lucide-react' || spec === 'recharts') {
        return new Proxy({}, { get: () => () => null });
      }
      if (spec.startsWith('@/') || spec.startsWith('.')) {
        const target = resolveModulePath(path.dirname(filename), spec);
        return load(target, imports);
      }
      return require(spec);
    },
  };

  vm.runInNewContext(transpiled, sandbox, { filename });
  if (!hasOverrides) {
    baseCache.set(filename, module.exports);
  }
  return module.exports;
}

const { translations } = load('src/config/translations.ts');

function createUiImports(lang = 'vi') {
  return {
    '@/context/LanguageContext': {
      useLanguage: () => ({
        language: lang,
        t: translations[lang],
        setLanguage() {},
      }),
    },
    '@/context/ToastProvider': {
      useToast: () => ({
        toast() {},
        showToast() {},
      }),
    },
    '@/hooks/useDialogFocus': {
      useDialogFocus: () => ({ current: null }),
    },
  };
}

function createMemoryStorage(initial = {}, options = {}) {
  const store = new Map(Object.entries(initial));
  const failKeys = new Set(options.failKeys || []);
  let failAllWrites = Boolean(options.failAllWrites);
  return {
    store,
    setFailAllWrites(flag) {
      failAllWrites = Boolean(flag);
    },
    setFailKeys(keys) {
      failKeys.clear();
      for (const k of keys) failKeys.add(k);
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (failAllWrites || failKeys.has(key)) {
        const err = new Error(`QuotaExceededError when writing ${key}`);
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

const wf04Demo = load('src/data/wf04-demo.ts');
const domain = load('src/utils/investigation-case.ts');
const migration = load('src/utils/case-migration.ts');
const storageMod = load('src/utils/workspace-storage.ts');
const hookMod = load('src/hooks/useInvestigationCases.ts');
const permissionsMod = load('src/utils/permissions.ts');
const enterpriseMod = load('src/utils/enterprise.ts');
const notificationMod = load('src/utils/notification-feed.ts');
const platformSummaryMod = load('src/utils/platform-summary.ts');
const exportCsvMod = load('src/utils/export-csv.ts');
const defaultTxMod = load('src/data/fraudguard-transactions.ts');
const defaultEntMod = load('src/data/fraudguard-enterprises.ts');
const defaultProjectsMod = load('src/data/fraudguard-projects.ts');
const defaultUsersMod = load('src/data/fraudguard-roles.ts');
const defaultRulesMod = load('src/data/fraudguard-rules.ts');

const uiImports = createUiImports('vi');
const { AlertsView } = load('src/components/fraudguard-dashboard/AlertsView.tsx', uiImports);
const { CasesView } = load('src/components/fraudguard-dashboard/CasesView.tsx', uiImports);
const { AlertCaseDrawer } = load('src/components/fraudguard-dashboard/AlertCaseDrawer.tsx', uiImports);
const { ReportsView } = load('src/components/fraudguard-dashboard/ReportsView.tsx', uiImports);
const { AuditTrailView } = load('src/components/fraudguard-dashboard/AuditTrailView.tsx', uiImports);
const { PlatformHealthView } = load('src/components/fraudguard-dashboard/PlatformHealthView.tsx', uiImports);

const NOW_ISO = '2026-11-15T10:00:00.000Z';

test('Scenario 1: Operator selects 2 eligible AI Abnormal alerts -> creates 1 Open case with both links, persists across reload, and blocks rapid double-submit', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  assert.ok(operator);

  const initialUnlinkedCount = enterpriseMod.countOpenUnlinkedAlerts(
    bundle.transactions,
    bundle.initialCases,
    []
  );
  const initialActiveCaseCount = enterpriseMod.countActiveInvestigationCases(bundle.initialCases);

  const snapshot1 = {
    cases: bundle.initialCases,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  const createRes = hookMod.executeCreateCaseAction({
    snapshot: snapshot1,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-CAMPUS-101',
    note: 'Gom 2 cảnh báo bất thường AI cùng khuôn viên',
    at: NOW_ISO,
    now: NOW_ISO,
  });

  assert.equal(createRes.ok, true);
  assert.equal(createRes.investigationCase.caseId, 'CASE-WF04-CAMPUS-101');
  assert.equal(createRes.investigationCase.status, 'Open');
  assert.equal(createRes.investigationCase.enterpriseId, 'ent-wf04-campus');
  assert.equal(createRes.investigationCase.alerts.length, 2);
  assert.deepEqual(
    createRes.investigationCase.alerts.map((a) => a.alertId),
    ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02']
  );
  assert.equal(createRes.auditEntry.action, 'CASE_CREATED');
  assert.equal(createRes.auditEntry.enterpriseId, 'ent-wf04-campus');
  assert.equal(createRes.auditEntry.target, 'CASE-WF04-CAMPUS-101');

  // Verify reducer commit + persistence state transitions
  let reducerState = hookMod.createInitialInvestigationCasesState(bundle.initialCases, NOW_ISO);
  reducerState = hookMod.investigationCasesReducer(reducerState, {
    type: 'COMMAND_COMMITTED',
    nextCases: createRes.nextCases,
  });
  assert.equal(reducerState.hasUnsavedChanges, true);
  assert.equal(reducerState.inMemoryCases.length, bundle.initialCases.length + 1);

  // Unlinked alert count drops by 2 while active case count rises by 1 (not 2)
  const afterUnlinkedCount = enterpriseMod.countOpenUnlinkedAlerts(
    bundle.transactions,
    createRes.nextCases,
    []
  );
  const afterActiveCaseCount = enterpriseMod.countActiveInvestigationCases(createRes.nextCases);
  assert.equal(afterUnlinkedCount, initialUnlinkedCount - 2);
  assert.equal(afterActiveCaseCount, initialActiveCaseCount + 1);

  // Rapid double-submit with same or overlapping alerts against updated state is rejected atomically
  const duplicateSubmit = hookMod.executeCreateCaseAction({
    snapshot: {
      ...snapshot1,
      cases: reducerState.inMemoryCases,
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-CAMPUS-102',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(duplicateSubmit.ok, false);
  assert.equal(duplicateSubmit.code, 'ALERT_ALREADY_LINKED');

  const overlappingSubmit = hookMod.executeCreateCaseAction({
    snapshot: {
      ...snapshot1,
      cases: reducerState.inMemoryCases,
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-02', 'ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-WF04-CAMPUS-103',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(overlappingSubmit.ok, false);
  assert.equal(overlappingSubmit.code, 'ALERT_ALREADY_LINKED');

  // Persist to v4 storage and reload
  const memStorage = createMemoryStorage();
  const payloadToPersist = {
    schemaVersion: storageMod.WORKSPACE_SCHEMA_VERSION,
    rules: bundle.rules,
    ruleSets: bundle.ruleSets,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    transactions: bundle.transactions,
    auditLogs: [createRes.auditEntry],
    investigationCases: createRes.nextCases,
    legacyCaseArchive: [],
    migrationMeta: {
      migrationVersion: migration.CASE_MIGRATION_VERSION,
      migratedAt: NOW_ISO,
      sourceSchema: 'v4',
      migratedCaseCount: 0,
      archivedLegacyCount: 0,
    },
    savedAt: NOW_ISO,
  };

  const persistOut = storageMod.persistWorkspaceSnapshot(payloadToPersist, 'ready', memStorage);
  assert.equal(persistOut.ok, true);
  reducerState = hookMod.investigationCasesReducer(reducerState, {
    type: 'PERSIST_SUCCEEDED',
    persistedCases: createRes.nextCases,
    persistedAt: NOW_ISO,
  });
  assert.equal(reducerState.hasUnsavedChanges, false);
  assert.equal(reducerState.storageError, null);

  const restored = storageMod.restoreWorkspaceSnapshot({
    storage: memStorage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: bundle.users,
    migratedAt: NOW_ISO,
  });

  assert.equal(restored.status, 'ready');
  assert.equal(restored.canPersist, true);
  const reloadedCase = restored.payload.investigationCases.find(
    (c) => c.caseId === 'CASE-WF04-CAMPUS-101'
  );
  assert.ok(reloadedCase);
  assert.equal(reloadedCase.status, 'Open');
  assert.deepEqual(
    reloadedCase.alerts.map((a) => a.alertId),
    ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02']
  );
  assert.equal(restored.payload.auditLogs.length, 1);
  assert.equal(restored.payload.auditLogs[0].action, 'CASE_CREATED');

  // AlertsView SSR shows both alerts linked to CASE-WF04-CAMPUS-101
  const alertsHtml = renderToStaticMarkup(
    React.createElement(AlertsView, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      currentUser: operator,
      canManageCases: true,
      investigationCases: restored.payload.investigationCases,
      legacyCaseArchive: [],
      onCreateInvestigationCase: () => ({ ok: false, code: 'ALERT_ALREADY_LINKED', error: 'dup' }),
    })
  );
  assert.match(alertsHtml, /CASE-WF04-CAMPUS-101/);
});

test('Scenario 2: 1-alert valid creation; mixed-tenant, RULE, Normal, Open/Closed linked, and legacy unresolved alerts are blocked in handler and disabled in AlertsView', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const investigator = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');

  const baseSnapshot = {
    cases: bundle.initialCases,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // 1) Valid 1-alert creation
  const oneAlertRes = hookMod.executeCreateCaseAction({
    snapshot: baseSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-ONE-01',
    at: '2026-11-15T09:00:00.000Z',
    now: '2026-11-15T09:00:00.000Z',
  });
  assert.equal(oneAlertRes.ok, true);
  assert.equal(oneAlertRes.investigationCase.alerts.length, 1);
  assert.equal(oneAlertRes.investigationCase.alerts[0].alertId, 'ALT-WF04-CAMPUS-01');

  // Create a second case on ALT-WF04-CAMPUS-02 and transition it all the way to Closed
  const secondCaseRes = hookMod.executeCreateCaseAction({
    snapshot: { ...baseSnapshot, cases: oneAlertRes.nextCases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-CLOSED-02',
    at: '2026-11-15T09:05:00.000Z',
    now: '2026-11-15T09:05:00.000Z',
  });
  assert.equal(secondCaseRes.ok, true);

  const assignedRes = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases: secondCaseRes.nextCases },
    actor: operator,
    caseId: 'CASE-WF04-CLOSED-02',
    assigneeId: investigator.id,
    at: '2026-11-15T09:10:00.000Z',
    now: '2026-11-15T09:10:00.000Z',
  });
  assert.equal(assignedRes.ok, true);

  const reportRes = domain.submitInvestigationReport({
    investigationCase: assignedRes.investigationCase,
    actor: investigator,
    summary: 'Kiểm tra thiết bị đo đếm tại phòng thí nghiệm xác nhận rò điện',
    alertResults: [
      {
        alertId: 'ALT-WF04-CAMPUS-02',
        resultText: 'True positive: phát hiện rò điện trên nhánh phụ',
        evidence: 'Biên bản kiểm tra công tơ số 02',
      },
    ],
    at: '2026-11-15T09:20:00.000Z',
  });
  assert.equal(reportRes.ok, true);

  const confirmRes = domain.confirmInvestigationCaseReport({
    investigationCase: reportRes.investigationCase,
    actor: operator,
    reportId: reportRes.investigationCase.pendingReviewReportId,
    reportVersion: reportRes.investigationCase.pendingReviewReportVersion,
    at: '2026-11-15T09:30:00.000Z',
  });
  assert.equal(confirmRes.ok, true);
  assert.equal(confirmRes.investigationCase.status, 'Closed');

  const casesWithOpenAndClosed = assignedRes.nextCases.map((c) =>
    c.caseId === 'CASE-WF04-CLOSED-02' ? confirmRes.investigationCase : c
  );

  // Legacy archive entry on ALT-WF04-CAMPUS-04
  const legacyArchive = [
    {
      archiveId: 'LEGACY-ARCH-CAMPUS-04',
      legacyCaseId: 'CS-LEGACY-04',
      enterpriseId: 'ent-wf04-campus',
      projectIds: ['proj-wf04-campus-main'],
      alertIds: ['ALT-WF04-CAMPUS-04'],
      transactionIds: ['tx-wf04-campus-04'],
      legacyCaseStatus: 'Investigating',
      reasonCode: 'MISSING_CREATION_PROVENANCE',
      reasonDetail: 'Legacy record lacks verified operator creation metadata',
      requiresManualReconciliation: true,
      blocksAlertCreation: true,
      archivedAt: NOW_ISO,
      rawSnapshots: [],
    },
  ];

  const activeSnapshot = {
    ...baseSnapshot,
    cases: casesWithOpenAndClosed,
    legacyArchive,
  };

  // 2) Mixed-tenant alerts rejected
  const mixedTenantRes = hookMod.executeCreateCaseAction({
    snapshot: activeSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-03', 'ALT-WF04-BRANCH-01'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(mixedTenantRes.ok, false);
  assert.equal(mixedTenantRes.code, 'CROSS_TENANT_ALERT');

  // 3) RULE alert rejected
  const ruleAlertRes = hookMod.executeCreateCaseAction({
    snapshot: activeSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-RULE-05'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(ruleAlertRes.ok, false);
  assert.equal(ruleAlertRes.code, 'INELIGIBLE_ALERT_SOURCE');

  // 4) Normal transaction rejected
  const normalTxWithAlertId = {
    ...bundle.transactions.find((tx) => tx.id === 'tx-wf04-campus-normal'),
    alertId: 'ALT-WF04-CAMPUS-NORMAL-06',
  };
  const normalAlertRes = hookMod.executeCreateCaseAction({
    snapshot: {
      ...activeSnapshot,
      alerts: [...bundle.transactions, normalTxWithAlertId],
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-NORMAL-06'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(normalAlertRes.ok, false);
  assert.equal(normalAlertRes.code, 'INELIGIBLE_ALERT_RISK_LEVEL');

  // 5) Alert already in Open case rejected
  const openLinkedRes = hookMod.executeCreateCaseAction({
    snapshot: activeSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(openLinkedRes.ok, false);
  assert.equal(openLinkedRes.code, 'ALERT_ALREADY_LINKED');

  // 6) Alert already in Closed case rejected
  const closedLinkedRes = hookMod.executeCreateCaseAction({
    snapshot: activeSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-02'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(closedLinkedRes.ok, false);
  assert.equal(closedLinkedRes.code, 'ALERT_ALREADY_LINKED');

  // 7) Alert in legacyCaseArchive rejected
  const legacyLinkedRes = hookMod.executeCreateCaseAction({
    snapshot: activeSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-04'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(legacyLinkedRes.ok, false);
  assert.equal(legacyLinkedRes.code, 'ALERT_LEGACY_LINKED');

  // Verify helper isAlertBlockedByCasesOrLegacy
  const tx01 = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-01');
  const tx02 = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-02');
  const tx03 = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-03');
  const tx04 = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-04');
  assert.equal(migration.isAlertBlockedByCasesOrLegacy(tx01, casesWithOpenAndClosed, legacyArchive), true);
  assert.equal(migration.isAlertBlockedByCasesOrLegacy(tx02, casesWithOpenAndClosed, legacyArchive), true);
  assert.equal(migration.isAlertBlockedByCasesOrLegacy(tx03, casesWithOpenAndClosed, legacyArchive), false);
  assert.equal(migration.isAlertBlockedByCasesOrLegacy(tx04, casesWithOpenAndClosed, legacyArchive), true);

  // Verify AlertsView renders disabled checkboxes with reasons for linked, RULE, and legacy alerts, and enabled checkbox for ALT-WF04-CAMPUS-03
  const html = renderToStaticMarkup(
    React.createElement(AlertsView, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      currentUser: operator,
      canManageCases: true,
      investigationCases: casesWithOpenAndClosed,
      legacyCaseArchive: legacyArchive,
      onCreateInvestigationCase: () => ({ ok: false, code: 'ALERT_ALREADY_LINKED', error: 'noop' }),
    })
  );
  assert.match(html, /CASE-WF04-ONE-01/);
  assert.match(html, /CASE-WF04-CLOSED-02/);
  assert.match(html, /CS-LEGACY-04/);
  assert.match(html, /ALT-WF04-CAMPUS-03/);
  // Disabled checkboxes exist for blocked rows and at least one enabled checkbox exists for ALT-WF04-CAMPUS-03
  assert.match(html, /type="checkbox"[^>]*disabled=""/);
  assert.match(html, /type="checkbox"(?![^>]*disabled)/);
});

test('Scenario 3: Live role/tenant switch clears selection permissions and revokes unauthorized Case Detail Drawer view immediately', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const inv2 = bundle.users.find((u) => u.id === 'usr-wf04-inv-2');
  const smeAdmin = bundle.users.find((u) => u.id === 'usr-wf04-sme');
  const branchOperator = bundle.users.find((u) => u.id === 'usr-wf04-branch-op');
  const platformAdmin = defaultUsersMod.DEMO_USERS.find(
    (u) => u.role === 'Platform Admin'
  );

  const baseSnapshot = {
    cases: bundle.initialCases,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Operator creates an Open case and assigns inv1 -> Investigating (unconfirmed)
  const created = hookMod.executeCreateCaseAction({
    snapshot: baseSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-SWITCH-01',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(created.ok, true);

  const assigned = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases: created.nextCases },
    actor: operator,
    caseId: 'CASE-WF04-SWITCH-01',
    assigneeId: inv1.id,
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(assigned.ok, true);
  const currentCases = assigned.nextCases;

  // Non-Operator roles are blocked from creating cases in handler and have disabled checkboxes in AlertsView
  for (const unauthorizedActor of [smeAdmin, inv1, platformAdmin]) {
    const attempt = hookMod.executeCreateCaseAction({
      snapshot: { ...baseSnapshot, cases: currentCases },
      actor: unauthorizedActor,
      alertIds: ['ALT-WF04-CAMPUS-03'],
      at: NOW_ISO,
      now: NOW_ISO,
    });
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, 'FORBIDDEN_ROLE');

    const roleAlertsHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        transactions: bundle.transactions,
        enterprises: bundle.enterprises,
        currentUser: unauthorizedActor,
        canManageCases: false,
        investigationCases: currentCases,
        legacyCaseArchive: [],
        onCreateInvestigationCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      })
    );
    // Every checkbox in AlertsView is disabled for non-Operator
    assert.doesNotMatch(roleAlertsHtml, /type="checkbox"(?![^>]*disabled)/);
  }

  // Foreign tenant Operator cannot create case on Campus alert
  const crossTenantCreate = hookMod.executeCreateCaseAction({
    snapshot: { ...baseSnapshot, cases: currentCases },
    actor: branchOperator,
    alertIds: ['ALT-WF04-CAMPUS-03'],
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(crossTenantCreate.ok, false);
  assert.equal(crossTenantCreate.code, 'CROSS_TENANT_ALERT');

  // CasesView with selectedCaseId="CASE-WF04-SWITCH-01":
  // 1) Same-tenant Operator and assigned Investigator (inv1) see the detail dialog
  for (const authorizedViewer of [operator, inv1]) {
    const viewHtml = renderToStaticMarkup(
      React.createElement(CasesView, {
        investigationCases: currentCases,
        legacyCaseArchive: [],
        transactions: bundle.transactions,
        enterprises: bundle.enterprises,
        users: bundle.users,
        currentUser: authorizedViewer,
        selectedCaseId: 'CASE-WF04-SWITCH-01',
        onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
        onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      })
    );
    assert.match(viewHtml, /role="dialog"/);
    assert.match(viewHtml, /CASE-WF04-SWITCH-01/);
  }

  // 2) Switching to SME Admin (unconfirmed case), unassigned Investigator (inv2), foreign Operator, or Platform Admin immediately hides the dialog & internal case
  for (const revokedViewer of [smeAdmin, inv2, branchOperator, platformAdmin]) {
    const viewHtml = renderToStaticMarkup(
      React.createElement(CasesView, {
        investigationCases: currentCases,
        legacyCaseArchive: [],
        transactions: bundle.transactions,
        enterprises: bundle.enterprises,
        users: bundle.users,
        currentUser: revokedViewer,
        selectedCaseId: 'CASE-WF04-SWITCH-01',
        onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
        onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      })
    );
    assert.doesNotMatch(viewHtml, /role="dialog"/);
    assert.doesNotMatch(viewHtml, /CASE-WF04-SWITCH-01/);
  }
});

test('Scenario 4: Assign Investigator by ID and Operator self-assign transition Open -> Investigating immediately, persist across reload, survive user display-name rename, and block unassigned/foreign Investigators', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const inv2 = bundle.users.find((u) => u.id === 'usr-wf04-inv-2');
  const foreignInv = bundle.users.find((u) => u.id === 'usr-wf04-exp-inv');

  let cases = bundle.initialCases;
  const baseSnapshot = {
    cases,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Create Case A and Case B on ent-wf04-campus
  const caseARes = hookMod.executeCreateCaseAction({
    snapshot: baseSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-ASSIGN-A',
    at: '2026-11-15T09:00:00.000Z',
    now: '2026-11-15T09:00:00.000Z',
  });
  assert.equal(caseARes.ok, true);
  cases = caseARes.nextCases;

  const caseBRes = hookMod.executeCreateCaseAction({
    snapshot: { ...baseSnapshot, cases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-SELF-B',
    at: '2026-11-15T09:01:00.000Z',
    now: '2026-11-15T09:01:00.000Z',
  });
  assert.equal(caseBRes.ok, true);
  cases = caseBRes.nextCases;

  // Cross-tenant Investigator assignment is rejected
  const crossAssignRes = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases },
    actor: operator,
    caseId: 'CASE-WF04-ASSIGN-A',
    assigneeId: foreignInv.id,
    at: '2026-11-15T09:05:00.000Z',
    now: '2026-11-15T09:05:00.000Z',
  });
  assert.equal(crossAssignRes.ok, false);
  assert.equal(crossAssignRes.code, 'ASSIGNEE_TENANT_MISMATCH');

  // Assign same-tenant Investigator inv1 by ID -> Open -> Investigating immediately
  const assignARes = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases },
    actor: operator,
    caseId: 'CASE-WF04-ASSIGN-A',
    assigneeId: inv1.id,
    note: 'Phân công điều tra viên Châu',
    at: '2026-11-15T09:10:00.000Z',
    now: '2026-11-15T09:10:00.000Z',
  });
  assert.equal(assignARes.ok, true);
  assert.equal(assignARes.investigationCase.status, 'Investigating');
  assert.equal(assignARes.investigationCase.assignmentMode, 'assigned');
  assert.equal(assignARes.investigationCase.assignee.actorId, inv1.id);
  assert.equal(assignARes.auditEntry.action, 'INVESTIGATOR_ASSIGNED');
  cases = assignARes.nextCases;

  // Operator self-assigns Case B -> Open -> Investigating immediately
  const selfAssignBRes = hookMod.executeSelfAssignCaseAction({
    snapshot: { ...baseSnapshot, cases },
    actor: operator,
    caseId: 'CASE-WF04-SELF-B',
    note: 'Vận hành viên tự điều tra trực tiếp',
    at: '2026-11-15T09:12:00.000Z',
    now: '2026-11-15T09:12:00.000Z',
  });
  assert.equal(selfAssignBRes.ok, true);
  assert.equal(selfAssignBRes.investigationCase.status, 'Investigating');
  assert.equal(selfAssignBRes.investigationCase.assignmentMode, 'self_investigated');
  assert.equal(selfAssignBRes.investigationCase.assignee.actorId, operator.id);
  assert.equal(selfAssignBRes.auditEntry.action, 'OPERATOR_SELF_ASSIGNED');
  cases = selfAssignBRes.nextCases;

  // Persist workspace + users with renamed display names (same user IDs)
  const renamedUsers = bundle.users.map((u) => {
    if (u.id === inv1.id) return { ...u, name: 'Phạm Bảo Châu (Đã Đổi Tên)' };
    if (u.id === operator.id) return { ...u, name: 'Lê Minh Quân (Đã Đổi Tên)' };
    return u;
  });

  const memStorage = createMemoryStorage();
  const payload = {
    schemaVersion: storageMod.WORKSPACE_SCHEMA_VERSION,
    rules: bundle.rules,
    ruleSets: bundle.ruleSets,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    transactions: bundle.transactions,
    auditLogs: [
      caseARes.auditEntry,
      caseBRes.auditEntry,
      assignARes.auditEntry,
      selfAssignBRes.auditEntry,
    ],
    investigationCases: cases,
    legacyCaseArchive: [],
    migrationMeta: {
      migrationVersion: migration.CASE_MIGRATION_VERSION,
      migratedAt: NOW_ISO,
      sourceSchema: 'v4',
      migratedCaseCount: 0,
      archivedLegacyCount: 0,
    },
    savedAt: NOW_ISO,
  };
  assert.equal(storageMod.persistWorkspaceSnapshot(payload, 'ready', memStorage).ok, true);
  assert.equal(storageMod.persistEnterpriseUsers(renamedUsers, 'ready', memStorage).ok, true);

  const restored = storageMod.restoreWorkspaceSnapshot({
    storage: memStorage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: bundle.users,
    migratedAt: NOW_ISO,
  });
  assert.equal(restored.status, 'ready');

  const renamedInv1 = restored.users.find((u) => u.id === inv1.id);
  const renamedOperator = restored.users.find((u) => u.id === operator.id);
  assert.equal(renamedInv1.name, 'Phạm Bảo Châu (Đã Đổi Tên)');

  // Renamed Investigator 1 still retains full read/view access to CASE-WF04-ASSIGN-A (by ID), but NOT CASE-WF04-SELF-B
  const inv1CasesHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: restored.payload.investigationCases,
      legacyCaseArchive: [],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: restored.users,
      currentUser: renamedInv1,
      selectedCaseId: 'CASE-WF04-ASSIGN-A',
      onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
    })
  );
  assert.match(inv1CasesHtml, /CASE-WF04-ASSIGN-A/);
  assert.match(inv1CasesHtml, /Phạm Bảo Châu \(Đã Đổi Tên\)/);
  assert.doesNotMatch(inv1CasesHtml, /CASE-WF04-SELF-B/);

  // Unassigned Investigator 2 cannot see either CASE-WF04-ASSIGN-A or CASE-WF04-SELF-B
  const inv2CasesHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: restored.payload.investigationCases,
      legacyCaseArchive: [],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: restored.users,
      currentUser: inv2,
      selectedCaseId: 'CASE-WF04-ASSIGN-A',
      onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
    })
  );
  assert.doesNotMatch(inv2CasesHtml, /CASE-WF04-ASSIGN-A/);
  assert.doesNotMatch(inv2CasesHtml, /CASE-WF04-SELF-B/);

  // transactionsForEnterprise scopes Investigator by assignedInvestigatorId / WF-04 case assignee actorId
  const inv1ScopedTxs = enterpriseMod.transactionsForEnterprise(
    bundle.transactions,
    renamedInv1,
    bundle.enterprises,
    restored.payload.investigationCases,
    []
  );
  assert.deepEqual(
    inv1ScopedTxs.map((t) => t.alertId),
    ['ALT-WF04-CAMPUS-01']
  );

  // CSV export for renamedOperator resolves the renamed display names via users list
  const csvRows = exportCsvMod.buildInvestigationCasesCSVRows(
    restored.payload.investigationCases,
    restored.users,
    renamedOperator
  );
  const csvText = csvRows.map((r) => r.join(',')).join('\n');
  assert.match(csvText, /Phạm Bảo Châu \(Đã Đổi Tên\)/);
  assert.match(csvText, /Lê Minh Quân \(Đã Đổi Tên\)/);
});

test('Scenario 5: Expired WF-01 Subscription blocks creating a new case with explicit reason while pre-expiry Open case continues assignment and self-investigation', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const expOperator = bundle.users.find((u) => u.id === 'usr-wf04-exp-op');
  const expInv = bundle.users.find((u) => u.id === 'usr-wf04-exp-inv');

  const snapshot = {
    cases: bundle.initialCases,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // 1) Creating a NEW case on ALT-WF04-EXP-NEW-02 after subscription expiry fails with SUBSCRIPTION_EXPIRED
  const createAfterExpiry = hookMod.executeCreateCaseAction({
    snapshot,
    actor: expOperator,
    alertIds: ['ALT-WF04-EXP-NEW-02'],
    caseId: 'CASE-WF04-EXP-BLOCKED',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(createAfterExpiry.ok, false);
  assert.equal(createAfterExpiry.code, 'SUBSCRIPTION_EXPIRED');

  // 2) AlertsView disables selection for new alerts on expired enterprise and renders explicit reason while keeping View Case on pre-expiry CASE-WF04-EXP-01
  const expAlertsHtml = renderToStaticMarkup(
    React.createElement(AlertsView, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      currentUser: expOperator,
      canManageCases: true,
      investigationCases: bundle.initialCases,
      legacyCaseArchive: [],
      onCreateInvestigationCase: () => ({ ok: false, code: 'SUBSCRIPTION_EXPIRED', error: 'exp' }),
      onLoadWf04Demo() {},
    })
  );
  assert.match(expAlertsHtml, /CASE-WF04-EXP-01/);
  assert.match(expAlertsHtml, /Subscription/);
  assert.match(expAlertsHtml, /hết hạn/);
  assert.doesNotMatch(expAlertsHtml, /type="checkbox"(?![^>]*disabled)/);

  // 3) Pre-expiry Open case (CASE-WF04-EXP-01) can still be assigned to Investigator AFTER expiry
  const assignPreExpiry = hookMod.executeAssignInvestigatorAction({
    snapshot,
    actor: expOperator,
    caseId: 'CASE-WF04-EXP-01',
    assigneeId: expInv.id,
    note: 'Hồ sơ mở trước hạn vẫn tiếp tục điều tra',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(assignPreExpiry.ok, true);
  assert.equal(assignPreExpiry.investigationCase.status, 'Investigating');
  assert.equal(assignPreExpiry.investigationCase.assignee.actorId, expInv.id);

  // 4) Pre-expiry Open case (CASE-WF04-EXP-01) can also be self-assigned by Operator AFTER expiry
  const selfAssignPreExpiry = hookMod.executeSelfAssignCaseAction({
    snapshot,
    actor: expOperator,
    caseId: 'CASE-WF04-EXP-01',
    note: 'Vận hành viên tự điều tra hồ sơ mở trước khi hết hạn',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(selfAssignPreExpiry.ok, true);
  assert.equal(selfAssignPreExpiry.investigationCase.status, 'Investigating');
  assert.equal(selfAssignPreExpiry.investigationCase.assignmentMode, 'self_investigated');

  // 5) Assigned Investigator on expired enterprise can view CASE-WF04-EXP-01 in CasesView
  const expCasesHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: assignPreExpiry.nextCases,
      legacyCaseArchive: [],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: expInv,
      selectedCaseId: 'CASE-WF04-EXP-01',
      onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
    })
  );
  assert.match(expCasesHtml, /CASE-WF04-EXP-01/);
  assert.match(expCasesHtml, /role="dialog"/);
});

test('Scenario 6: Controlled legacy migration handles default seeds, eligible single/multi-tx cases across all statuses, conflicting multi-tx, cross-tenant conflicts, missing provenance, idempotency, and archive visibility', () => {
  // 1) Default repo seed transactions (13 legacy case rows without WF-01 lifecycle/provenance) -> 0 migrated, 13 archived
  const seedMigration = migration.migrateWorkspaceLegacyCases({
    transactions: defaultTxMod.fraudGuardTransactions,
    enterprises: defaultEntMod.demoEnterprises,
    projects: defaultProjectsMod.initialProjects,
    users: defaultUsersMod.DEMO_USERS,
    sourceSchema: 'seed',
    migratedAt: NOW_ISO,
  });
  assert.equal(seedMigration.migrationMeta.migratedCaseCount, 0);
  assert.equal(seedMigration.migrationMeta.archivedLegacyCount, 13);
  assert.equal(seedMigration.cases.length, 0);
  assert.equal(seedMigration.legacyArchive.length, 13);
  assert.ok(seedMigration.legacyArchive.every((entry) => entry.blocksAlertCreation === true));
  assert.ok(seedMigration.legacyArchive.every((entry) => entry.requiresManualReconciliation === true));

  // 2) Eligible single & multi-tx legacy records + conflict/quarantine cases on WF-04 demo enterprises
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const inv2 = bundle.users.find((u) => u.id === 'usr-wf04-inv-2');
  const smeAdmin = bundle.users.find((u) => u.id === 'usr-wf04-sme');
  const branchOperator = bundle.users.find((u) => u.id === 'usr-wf04-branch-op');
  const platformAdmin = defaultUsersMod.DEMO_USERS.find(
    (u) => u.role === 'Platform Admin'
  );

  const baseTx = bundle.transactions.find((t) => t.id === 'tx-wf04-campus-01');
  const creatorMeta = {
    actorId: operator.id,
    role: 'Operator',
    enterpriseId: 'ent-wf04-campus',
    name: operator.name,
  };

  // (a) Eligible Open singleton
  const txOpen = {
    ...baseTx,
    id: 'tx-mig-open-1',
    alertId: 'ALT-MIG-OPEN-1',
    caseId: 'CS-MIG-OPEN',
    caseStatus: 'Open',
    createdAt: '2026-11-05T08:00:00.000Z',
    createdBy: creatorMeta,
    investigationNotes: 'Ghi chú khởi tạo ban đầu',
  };

  // (b) Eligible Assigned -> Investigating consistent 2-tx group
  const sharedAssignedFields = {
    caseId: 'CS-MIG-ASSIGNED-MULTI',
    caseStatus: 'Assigned',
    createdAt: '2026-11-06T08:00:00.000Z',
    createdBy: creatorMeta,
    assignedInvestigatorId: inv1.id,
    assignedInvestigator: inv1.name,
    assignedAt: '2026-11-06T08:30:00.000Z',
    investigationNotes: 'Ghi chú điều tra nhóm 2 cảnh báo',
  };
  const txAssigned1 = {
    ...baseTx,
    id: 'tx-mig-ass-1',
    alertId: 'ALT-MIG-ASS-1',
    ...sharedAssignedFields,
  };
  const txAssigned2 = {
    ...baseTx,
    id: 'tx-mig-ass-2',
    alertId: 'ALT-MIG-ASS-2',
    ...sharedAssignedFields,
  };

  // (c) Eligible Reported -> Pending Review singleton (preserves investigationReport)
  const txReported = {
    ...baseTx,
    id: 'tx-mig-rep-1',
    alertId: 'ALT-MIG-REP-1',
    caseId: 'CS-MIG-REPORTED',
    caseStatus: 'Reported',
    createdAt: '2026-11-07T08:00:00.000Z',
    createdBy: creatorMeta,
    assignedInvestigatorId: inv1.id,
    assignedInvestigator: inv1.name,
    assignedAt: '2026-11-07T08:15:00.000Z',
    investigationReport: {
      finding: 'Suspected',
      notes: 'Phát hiện tải bất thường tại tủ phân phối phụ',
      evidenceNotes: 'Ảnh chụp nhiệt độ cáp và log công tơ',
      submittedAt: '2026-11-07T10:00:00.000Z',
      submittedBy: inv1.id,
    },
  };

  // (d) Eligible Confirmed Fraud -> Closed singleton (preserves report + caseDecision)
  const txClosed = {
    ...baseTx,
    id: 'tx-mig-closed-1',
    alertId: 'ALT-MIG-CLOSED-1',
    caseId: 'CS-MIG-CLOSED',
    caseStatus: 'Confirmed Fraud',
    createdAt: '2026-11-08T08:00:00.000Z',
    createdBy: creatorMeta,
    assignedInvestigatorId: inv1.id,
    assignedInvestigator: inv1.name,
    assignedAt: '2026-11-08T08:15:00.000Z',
    investigationReport: {
      finding: 'Fraud',
      notes: 'Đấu nối tắt qua biến dòng CT pha B',
      evidenceNotes: 'Biên bản niêm phong công tơ số 08',
      submittedAt: '2026-11-08T10:00:00.000Z',
      submittedBy: inv1.id,
    },
    caseDecision: {
      status: 'Confirmed Fraud',
      directive: 'Truy thu sản lượng điện và lập biên bản vi phạm',
      decidedAt: '2026-11-08T11:00:00.000Z',
      decidedById: operator.id,
      decidedBy: operator.name,
    },
  };

  // (e) Conflicting multi-tx group (same caseId, different caseStatus/report -> must NOT pick first tx!)
  const txConflict1 = {
    ...baseTx,
    id: 'tx-mig-conf-1',
    alertId: 'ALT-MIG-CONF-1',
    caseId: 'CS-MIG-CONFLICT-MULTI',
    caseStatus: 'Investigating',
    createdAt: '2026-11-09T08:00:00.000Z',
    createdBy: creatorMeta,
    assignedInvestigatorId: inv1.id,
    assignedInvestigator: inv1.name,
    assignedAt: '2026-11-09T08:15:00.000Z',
  };
  const txConflict2 = {
    ...baseTx,
    id: 'tx-mig-conf-2',
    alertId: 'ALT-MIG-CONF-2',
    caseId: 'CS-MIG-CONFLICT-MULTI',
    caseStatus: 'Open',
    createdAt: '2026-11-09T08:00:00.000Z',
    createdBy: creatorMeta,
  };

  // (f) Cross-tenant conflict (same caseId across ent-wf04-campus and ent-wf04-branch)
  const branchBaseTx = bundle.transactions.find((t) => t.id === 'tx-wf04-branch-01');
  const txCross1 = {
    ...baseTx,
    id: 'tx-mig-cross-1',
    alertId: 'ALT-MIG-CROSS-1',
    caseId: 'CS-MIG-CROSS-TENANT',
    caseStatus: 'Open',
    createdAt: '2026-11-10T08:00:00.000Z',
    createdBy: creatorMeta,
  };
  const txCross2 = {
    ...branchBaseTx,
    id: 'tx-mig-cross-2',
    alertId: 'ALT-MIG-CROSS-2',
    caseId: 'CS-MIG-CROSS-TENANT',
    caseStatus: 'Open',
    createdAt: '2026-11-10T08:00:00.000Z',
    createdBy: {
      actorId: branchOperator.id,
      role: 'Operator',
      enterpriseId: 'ent-wf04-branch',
      name: branchOperator.name,
    },
  };

  // (g) Missing creation provenance (only processedAt, no createdAt/createdBy -> must NOT fabricate from processedAt)
  const txMissingProvenance = {
    ...baseTx,
    id: 'tx-mig-noprov-1',
    alertId: 'ALT-MIG-NOPROV-1',
    caseId: 'CS-MIG-NO-PROVENANCE',
    caseStatus: 'Confirmed Fraud',
    assignedInvestigatorId: inv1.id,
    assignedInvestigator: inv1.name,
  };

  const customTxs = [
    txOpen,
    txAssigned1,
    txAssigned2,
    txReported,
    txClosed,
    txConflict1,
    txConflict2,
    txCross1,
    txCross2,
    txMissingProvenance,
  ];

  const migOut = migration.migrateWorkspaceLegacyCases({
    transactions: customTxs,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    users: bundle.users,
    sourceSchema: 'v3',
    migratedAt: NOW_ISO,
  });

  // 4 eligible cases migrated; 3 invalid groups archived
  assert.equal(migOut.migrationMeta.migratedCaseCount, 4);
  assert.equal(migOut.migrationMeta.archivedLegacyCount, 3);
  assert.equal(migOut.cases.length, 4);
  assert.equal(migOut.legacyArchive.length, 3);

  const migOpenCase = migOut.cases.find((c) => c.caseId === 'CS-MIG-OPEN');
  assert.equal(migOpenCase.status, 'Open');
  assert.equal(migOpenCase.alerts.length, 1);

  const migAssignedCase = migOut.cases.find((c) => c.caseId === 'CS-MIG-ASSIGNED-MULTI');
  assert.equal(migAssignedCase.status, 'Investigating');
  assert.equal(migAssignedCase.alerts.length, 2);
  assert.equal(migAssignedCase.assignee.actorId, inv1.id);

  const migReportedCase = migOut.cases.find((c) => c.caseId === 'CS-MIG-REPORTED');
  assert.equal(migReportedCase.status, 'Pending Review');
  assert.equal(
    migReportedCase.reports[0].summary,
    'Phát hiện tải bất thường tại tủ phân phối phụ'
  );
  assert.match(
    migReportedCase.reports[0].alertResults[0].resultText,
    /\[Legacy Suspected\]/
  );
  assert.equal(
    migReportedCase.reports[0].alertResults[0].evidence,
    'Ảnh chụp nhiệt độ cáp và log công tơ'
  );

  const migClosedCase = migOut.cases.find((c) => c.caseId === 'CS-MIG-CLOSED');
  assert.equal(migClosedCase.status, 'Closed');
  assert.match(migClosedCase.conclusion.summary, /\[Legacy Confirmed Fraud\]/);
  assert.match(migClosedCase.conclusion.summary, /Truy thu sản lượng điện/);

  // Verify archive reason codes
  const archConflict = migOut.legacyArchive.find(
    (a) => a.legacyCaseId === 'CS-MIG-CONFLICT-MULTI'
  );
  assert.ok(archConflict);
  assert.equal(archConflict.reasonCode, 'CONFLICTING_MULTI_TX_RECORDS');
  assert.deepEqual([...archConflict.alertIds], ['ALT-MIG-CONF-1', 'ALT-MIG-CONF-2']);

  const archCross = migOut.legacyArchive.find(
    (a) => a.legacyCaseId === 'CS-MIG-CROSS-TENANT'
  );
  assert.ok(archCross);
  assert.equal(archCross.reasonCode, 'CROSS_TENANT_CONFLICT');
  assert.equal(archCross.enterpriseId, undefined);

  const archNoProv = migOut.legacyArchive.find(
    (a) => a.legacyCaseId === 'CS-MIG-NO-PROVENANCE'
  );
  assert.ok(archNoProv);
  assert.equal(archNoProv.reasonCode, 'MISSING_CREATION_PROVENANCE');

  // 3) Archive visibility rules:
  // - Cross-tenant conflict (enterpriseId: undefined) is hidden from ALL users including Platform Admin & Operators
  assert.equal(migration.canActorViewLegacyArchiveEntry(archCross, operator), false);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archCross, branchOperator), false);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archCross, platformAdmin), false);

  // - Concluded archive entry on ent-wf04-campus (archNoProv has legacyCaseStatus === 'Confirmed Fraud' & canResolveAssigneeId === inv1.id):
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, operator), true);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, smeAdmin), true);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, inv1), true);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, inv2), false);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, branchOperator), false);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archNoProv, platformAdmin), false);

  // - Unconcluded archive entry (archConflict has legacyCaseStatus === 'Investigating'): hidden from SME Admin
  assert.equal(migration.canActorViewLegacyArchiveEntry(archConflict, operator), true);
  assert.equal(migration.canActorViewLegacyArchiveEntry(archConflict, smeAdmin), false);

  // 4) Idempotency: re-running migration with existingCases & existingArchive produces 0 duplicates
  const rerunOut = migration.migrateWorkspaceLegacyCases({
    transactions: customTxs,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    users: bundle.users,
    existingCases: migOut.cases,
    existingArchive: migOut.legacyArchive,
    sourceSchema: 'v4',
    migratedAt: NOW_ISO,
  });
  assert.equal(rerunOut.migrationMeta.migratedCaseCount, 0);
  assert.equal(rerunOut.migrationMeta.archivedLegacyCount, 0);
  assert.equal(rerunOut.cases.length, migOut.cases.length);
  assert.equal(rerunOut.legacyArchive.length, migOut.legacyArchive.length);
});

test('Scenario 7: Workspace storage v4 backup, corrupt JSON lock, unsupported schemaVersion lock, quota failure + retry, onboarding slice writer, and demo bundle round-trip', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const baseDefaults = {
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    migratedAt: NOW_ISO,
  };

  // 1) Corrupt JSON in v4 storage locks persistence and preserves raw storage
  const corruptRaw = '{corrupt-json:true';
  const corruptStorage = createMemoryStorage({
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: corruptRaw,
  });
  const corruptRestore = storageMod.restoreWorkspaceSnapshot({
    ...baseDefaults,
    storage: corruptStorage,
  });
  assert.equal(corruptRestore.status, 'blocked_corrupt');
  assert.equal(corruptRestore.canPersist, false);
  assert.equal(corruptRestore.errorCode, 'CORRUPT_WORKSPACE_JSON');

  const blockedPersist = storageMod.persistWorkspaceSnapshot(
    corruptRestore.payload,
    corruptRestore.status,
    corruptStorage
  );
  assert.equal(blockedPersist.ok, false);
  assert.equal(blockedPersist.errorCode, 'RESTORE_NOT_READY');
  assert.equal(corruptStorage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), corruptRaw);

  // 2) Unsupported higher schemaVersion (schemaVersion: 99) locks persistence and preserves raw storage
  const futureRaw = JSON.stringify({ schemaVersion: 99, rules: [] });
  const futureStorage = createMemoryStorage({
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: futureRaw,
  });
  const futureRestore = storageMod.restoreWorkspaceSnapshot({
    ...baseDefaults,
    storage: futureStorage,
  });
  assert.equal(futureRestore.status, 'blocked_unsupported_version');
  assert.equal(futureRestore.canPersist, false);
  assert.equal(futureRestore.errorCode, 'UNSUPPORTED_SCHEMA_VERSION');
  assert.equal(futureStorage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), futureRaw);

  // 3) Legacy v3 upgrade backup failure stops v4 write
  const v3Raw = JSON.stringify({
    rules: bundle.rules,
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    transactions: bundle.transactions,
    auditLogs: [],
    savedAt: NOW_ISO,
  });
  const backupFailStorage = createMemoryStorage(
    { [storageMod.WORKSPACE_STORAGE_KEY_V3]: v3Raw },
    { failKeys: [storageMod.WORKSPACE_BACKUP_KEY_V3] }
  );
  const backupFailRestore = storageMod.restoreWorkspaceSnapshot({
    ...baseDefaults,
    storage: backupFailStorage,
  });
  assert.equal(backupFailRestore.status, 'pending');
  assert.equal(backupFailRestore.canPersist, false);
  assert.equal(backupFailRestore.errorCode, 'BACKUP_WRITE_FAILED');
  assert.equal(backupFailStorage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), null);

  // When backup succeeds, v3 raw is backed up to WORKSPACE_BACKUP_KEY_V3 and migrated to v4
  backupFailStorage.setFailKeys([]);
  const v3UpgradeRestore = storageMod.restoreWorkspaceSnapshot({
    ...baseDefaults,
    storage: backupFailStorage,
  });
  assert.equal(v3UpgradeRestore.status, 'ready');
  assert.equal(v3UpgradeRestore.canPersist, true);
  assert.equal(
    backupFailStorage.getItem(storageMod.WORKSPACE_BACKUP_KEY_V3),
    v3Raw
  );
  assert.ok(backupFailStorage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));

  // 4) QuotaExceededError on v4 write -> reducer keeps inMemoryCases + storageError + hasUnsavedChanges, then retry succeeds
  let state = hookMod.createInitialInvestigationCasesState([], NOW_ISO);
  state = hookMod.investigationCasesReducer(state, {
    type: 'COMMAND_COMMITTED',
    nextCases: bundle.initialCases,
  });
  backupFailStorage.setFailKeys([storageMod.WORKSPACE_STORAGE_KEY_V4]);
  const quotaWrite = storageMod.persistWorkspaceSnapshot(
    { ...v3UpgradeRestore.payload, investigationCases: bundle.initialCases },
    'ready',
    backupFailStorage
  );
  assert.equal(quotaWrite.ok, false);
  assert.equal(quotaWrite.errorCode, 'STORAGE_WRITE_FAILED');

  state = hookMod.investigationCasesReducer(state, {
    type: 'PERSIST_FAILED',
    storageError: {
      code: quotaWrite.errorCode,
      error: quotaWrite.error,
    },
  });
  assert.equal(state.hasUnsavedChanges, true);
  assert.equal(state.inMemoryCases.length, 1);
  assert.equal(state.storageError.code, 'STORAGE_WRITE_FAILED');
  assert.match(state.storageError.error, /localStorage|QuotaExceededError/);

  // Clear quota failure and retry
  backupFailStorage.setFailKeys([]);
  const retryWrite = storageMod.persistWorkspaceSnapshot(
    { ...v3UpgradeRestore.payload, investigationCases: bundle.initialCases },
    'ready',
    backupFailStorage
  );
  assert.equal(retryWrite.ok, true);
  state = hookMod.investigationCasesReducer(state, {
    type: 'PERSIST_SUCCEEDED',
    persistedCases: state.inMemoryCases,
    persistedAt: NOW_ISO,
  });
  assert.equal(state.hasUnsavedChanges, false);
  assert.equal(state.storageError, null);

  // 5) Onboarding slice merge (mergeAndPersistWorkspaceSlice) preserves investigationCases, legacyCaseArchive, and migrationMeta
  const currentV4 = JSON.parse(
    backupFailStorage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4)
  );
  const sliceMerge = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: currentV4,
    patch: {
      enterprises: [...currentV4.enterprises],
    },
    restoreStatus: 'ready',
    storage: backupFailStorage,
  });
  assert.equal(sliceMerge.ok, true);
  assert.equal(sliceMerge.payload.schemaVersion, 4);
  assert.equal(sliceMerge.payload.investigationCases.length, 1);
  assert.equal(sliceMerge.payload.investigationCases[0].caseId, 'CASE-WF04-EXP-01');

  // 6) Explicit WF-04 Demo Bundle apply & restore round-trip without overwriting pre-demo data
  const preDemoPayload = sliceMerge.payload;
  const preDemoUsers = defaultUsersMod.DEMO_USERS;

  const applied = wf04Demo.applyWf04DemoWorkspace({
    currentPayload: preDemoPayload,
    currentUsers: preDemoUsers,
    savedAt: NOW_ISO,
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.payload.wf04DemoActive, true);
  assert.ok(applied.payload.preDemoSnapshot);

  // Simulate user creating a case while in Demo mode, persisting, and reloading -> user-edited cases are NOT overwritten on reload
  const operator = applied.users.find((u) => u.id === 'usr-wf04-op');
  const demoCaseRes = hookMod.executeCreateCaseAction({
    snapshot: {
      cases: applied.payload.investigationCases,
      enterprises: applied.payload.enterprises,
      projects: applied.payload.projects,
      alerts: applied.payload.transactions,
      legacyArchive: applied.payload.legacyCaseArchive,
      users: applied.users,
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-USER-EDITED',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(demoCaseRes.ok, true);

  const editedDemoPayload = {
    ...applied.payload,
    investigationCases: demoCaseRes.nextCases,
  };
  assert.equal(
    storageMod.persistWorkspaceSnapshot(editedDemoPayload, 'ready', backupFailStorage).ok,
    true
  );

  const reloadedDemo = storageMod.restoreWorkspaceSnapshot({
    ...baseDefaults,
    storage: backupFailStorage,
  });
  assert.equal(reloadedDemo.status, 'ready');
  assert.ok(
    reloadedDemo.payload.investigationCases.some(
      (c) => c.caseId === 'CASE-WF04-USER-EDITED'
    )
  );

  // Restore pre-demo workspace
  const restoredPreDemo = wf04Demo.restorePreDemoWorkspace({
    currentPayload: reloadedDemo.payload,
  });
  assert.equal(restoredPreDemo.restored, true);
  assert.equal(restoredPreDemo.payload.wf04DemoActive, false);
  assert.equal(restoredPreDemo.payload.preDemoSnapshot, undefined);
  assert.deepEqual(
    restoredPreDemo.payload.investigationCases.map((c) => c.caseId),
    ['CASE-WF04-EXP-01']
  );
  assert.equal(restoredPreDemo.users.length, preDemoUsers.length);
});

test('Scenario 8: Case Queue renders 1 row per case (never per alert), KPI counts unique active cases, status tabs cover all 4 WF-04 statuses, and AlertCaseDrawer locks out legacy mutations', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');

  const snapshot = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Create a 2-alert Open case and a 1-alert Open case (total 3 linked alerts across 2 cases)
  const case1Res = hookMod.executeCreateCaseAction({
    snapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-QUEUE-2ALERTS',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(case1Res.ok, true);

  const case2Res = hookMod.executeCreateCaseAction({
    snapshot: { ...snapshot, cases: case1Res.nextCases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-WF04-QUEUE-1ALERT',
    at: NOW_ISO,
    now: NOW_ISO,
  });
  assert.equal(case2Res.ok, true);

  const twoCases = case2Res.nextCases;
  // KPI counts 2 unique active cases, NOT 3 alerts
  assert.equal(enterpriseMod.countActiveInvestigationCases(twoCases), 2);

  // CasesView renders 4 WF-04 status tabs and 1 row per case
  const queueHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: twoCases,
      legacyCaseArchive: [],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: operator,
      selectedCaseId: null,
      onAssignInvestigator: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
      onSelfAssignCase: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'noop' }),
    })
  );
  // Both cases appear in table rows, and the 2-alert case shows its 2 alerts count on a single row
  const tbodyMatch = queueHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch);
  const rowMatches = tbodyMatch[1].match(/<tr/g) || [];
  assert.equal(rowMatches.length, 2);
  assert.match(queueHtml, /CASE-WF04-QUEUE-2ALERTS/);
  assert.match(queueHtml, /CASE-WF04-QUEUE-1ALERT/);
  // All 4 status filter tabs are rendered
  assert.match(queueHtml, />Mở</);
  assert.match(queueHtml, /Đang điều tra/);
  assert.match(queueHtml, /Chờ duyệt/);
  assert.match(queueHtml, /Đã đóng/);

  // AlertCaseDrawer in WF-04 mode does not render legacy mutation buttons/forms and does not mutate tx
  let txMutated = false;
  const linkedTx = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-01');
  const drawerLinkedHtml = renderToStaticMarkup(
    React.createElement(AlertCaseDrawer, {
      transaction: linkedTx,
      open: true,
      onClose() {},
      users: bundle.users,
      currentUser: operator,
      investigationCases: twoCases,
      legacyCaseArchive: [],
      wf04Managed: true,
      onOpenInvestigationCase() {},
      onUpdateTransaction() {
        txMutated = true;
      },
    })
  );
  assert.equal(txMutated, false);
  assert.match(drawerLinkedHtml, /CASE-WF04-QUEUE-2ALERTS/);
  assert.equal(
    drawerLinkedHtml.includes(translations.vi.wf04Phase2a.alertQueue.linkedCaseDrawerNotice),
    true
  );
  assert.doesNotMatch(drawerLinkedHtml, /Phase 2A/);
  assert.equal(
    drawerLinkedHtml.includes(translations.vi.wf04Phase2a.legacy.legacyReadOnlyNotice),
    false
  );
  assert.equal(
    drawerLinkedHtml.includes(translations.vi.wf04Phase2a.legacy.legacyCannotEditNotice),
    false
  );
  // No legacy status mutation select or textarea
  assert.doesNotMatch(drawerLinkedHtml, /<select/);
  assert.doesNotMatch(drawerLinkedHtml, /<textarea/);

  // AlertCaseDrawer on a legacy archived alert shows read-only legacy notice without Phase 2A wording
  const legacyTx = {
    ...bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-04'),
    caseId: 'CS-LEGACY-DRAWER-04',
    caseStatus: 'Investigating',
  };
  const legacyArchive = [
    {
      archiveId: 'ARCH-DRAWER-04',
      legacyCaseId: 'CS-LEGACY-DRAWER-04',
      enterpriseId: 'ent-wf04-campus',
      projectIds: ['proj-wf04-campus-main'],
      alertIds: ['ALT-WF04-CAMPUS-04'],
      transactionIds: ['tx-wf04-campus-04'],
      legacyCaseStatus: 'Investigating',
      reasonCode: 'MISSING_CREATION_PROVENANCE',
      reasonDetail: 'Thiếu dữ liệu người tạo',
      requiresManualReconciliation: true,
      blocksAlertCreation: true,
      archivedAt: NOW_ISO,
      rawSnapshots: [],
    },
  ];
  const drawerLegacyHtml = renderToStaticMarkup(
    React.createElement(AlertCaseDrawer, {
      transaction: legacyTx,
      open: true,
      onClose() {},
      users: bundle.users,
      currentUser: operator,
      investigationCases: twoCases,
      legacyCaseArchive: legacyArchive,
      wf04Managed: true,
      onUpdateTransaction() {
        txMutated = true;
      },
    })
  );
  assert.equal(txMutated, false);
  assert.match(drawerLegacyHtml, /CS-LEGACY-DRAWER-04/);
  assert.equal(
    drawerLegacyHtml.includes(translations.vi.wf04Phase2a.legacy.legacyCannotEditNotice),
    true
  );
  assert.doesNotMatch(drawerLegacyHtml, /Phase 2A/);
  assert.doesNotMatch(drawerLegacyHtml, /<select/);

  // Main operational AlertsView and CasesView for Operator never render demo banners/buttons or legacy archive section
  const alertsOperatorHtml = renderToStaticMarkup(
    React.createElement(AlertsView, {
      transactions: bundle.transactions,
      onReview() {},
      canManageCases: true,
      investigationCases: twoCases,
      legacyCaseArchive: legacyArchive,
      enterprises: bundle.enterprises,
      currentUser: operator,
      wf04DemoActive: true,
      onLoadWf04Demo() {},
      onRestorePreDemo() {},
    })
  );
  const casesWithDemoPropsHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: twoCases,
      legacyCaseArchive: legacyArchive,
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: operator,
      selectedCaseId: null,
      wf04DemoActive: true,
      onLoadWf04Demo() {},
      onRestorePreDemo() {},
    })
  );
  for (const html of [queueHtml, casesWithDemoPropsHtml, alertsOperatorHtml]) {
    assert.equal(html.includes(translations.vi.wf04Phase2a.demo.contextLabel), false);
    assert.equal(html.includes(translations.vi.wf04Phase2a.demo.loadDemoBtn), false);
    assert.equal(html.includes(translations.vi.wf04Phase2a.demo.addReviewSamplesBtn), false);
    assert.equal(html.includes(translations.vi.wf04Phase2a.demo.restorePreviousBtn), false);
    assert.equal(html.includes(translations.vi.wf04Phase2a.legacy.legacyArchiveTitle), false);
  }

  // Guard helper hasLegacyCaseFieldPatch detects legacy case field writes
  const baseCheckTx = bundle.transactions[0];
  assert.equal(
    enterpriseMod.hasLegacyCaseFieldPatch(baseCheckTx, {
      ...baseCheckTx,
      caseStatus: 'Investigating',
    }),
    true
  );
  assert.equal(
    enterpriseMod.hasLegacyCaseFieldPatch(baseCheckTx, {
      ...baseCheckTx,
      assignedInvestigatorId: 'usr-1',
    }),
    true
  );
  assert.equal(
    enterpriseMod.hasLegacyCaseFieldPatch(baseCheckTx, {
      ...baseCheckTx,
      confidence: 0.99,
    }),
    false
  );
});

test('Scenario 9: Downstream integrations enforce WF-04 role/tenant/confirmed-only boundaries across canSaveMember, auditForUser, notifications, CSV exports, ReportsView, and PlatformHealthView', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const inv2 = bundle.users.find((u) => u.id === 'usr-wf04-inv-2');
  const smeAdmin = bundle.users.find((u) => u.id === 'usr-wf04-sme');
  const branchOperator = bundle.users.find((u) => u.id === 'usr-wf04-branch-op');
  const platformAdmin = defaultUsersMod.DEMO_USERS.find(
    (u) => u.role === 'Platform Admin'
  );
  const impStaff = defaultUsersMod.DEMO_USERS.find(
    (u) => u.role === 'Implementation Staff'
  );

  const baseSnapshot = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Create Case 1 (2 alerts, Investigating assigned to inv1) and Case 2 (1 alert, Closed confirmed)
  const c1Open = hookMod.executeCreateCaseAction({
    snapshot: baseSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-WF04-DOWNSTREAM-ACTIVE',
    at: '2026-11-15T08:00:00.000Z',
    now: '2026-11-15T08:00:00.000Z',
  });
  const c1Assigned = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases: c1Open.nextCases },
    actor: operator,
    caseId: 'CASE-WF04-DOWNSTREAM-ACTIVE',
    assigneeId: inv1.id,
    at: '2026-11-15T08:10:00.000Z',
    now: '2026-11-15T08:10:00.000Z',
  });

  const c2Open = hookMod.executeCreateCaseAction({
    snapshot: { ...baseSnapshot, cases: c1Assigned.nextCases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-WF04-DOWNSTREAM-CLOSED',
    at: '2026-11-15T08:20:00.000Z',
    now: '2026-11-15T08:20:00.000Z',
  });
  const c2Assigned = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...baseSnapshot, cases: c2Open.nextCases },
    actor: operator,
    caseId: 'CASE-WF04-DOWNSTREAM-CLOSED',
    assigneeId: inv2.id,
    at: '2026-11-15T08:25:00.000Z',
    now: '2026-11-15T08:25:00.000Z',
  });
  const c2Reported = domain.submitInvestigationReport({
    investigationCase: c2Assigned.investigationCase,
    actor: inv2,
    summary: 'Báo cáo xác minh cảnh báo số 03 là dương tính giả do bảo trì định kỳ',
    alertResults: [
      {
        alertId: 'ALT-WF04-CAMPUS-03',
        resultText: 'False positive: sụt áp do thao tác đóng cắt định kỳ',
        evidence: 'Lịch cắt điện bảo trì trạm biến áp Campus',
      },
    ],
    at: '2026-11-15T08:40:00.000Z',
  });
  const c2Confirmed = domain.confirmInvestigationCaseReport({
    investigationCase: c2Reported.investigationCase,
    actor: operator,
    reportId: c2Reported.investigationCase.pendingReviewReportId,
    reportVersion: c2Reported.investigationCase.pendingReviewReportVersion,
    at: '2026-11-15T08:50:00.000Z',
  });
  assert.equal(c2Confirmed.ok, true);

  const allCases = c2Assigned.nextCases.map((c) =>
    c.caseId === 'CASE-WF04-DOWNSTREAM-CLOSED' ? c2Confirmed.investigationCase : c
  );

  // 1) canSaveMember:
  // - Blocks role change on inv1 (assigned to active Investigating case, even if display name changes)
  const inv1RoleChange = permissionsMod.canSaveMember(
    smeAdmin,
    { ...inv1, name: 'Phạm Bảo Châu (Đổi Tên)', role: 'Operator' },
    bundle.users,
    bundle.transactions,
    allCases,
    []
  );
  assert.equal(inv1RoleChange, false);

  // - Allows role change on inv2 (only assigned to a Closed case)
  const inv2RoleChange = permissionsMod.canSaveMember(
    smeAdmin,
    { ...inv2, role: 'Operator' },
    bundle.users,
    bundle.transactions,
    allCases,
    []
  );
  assert.equal(inv2RoleChange, true);

  // 2) auditForUser & AuditTrailView:
  const closedCaseAudit = {
    id: 'AUD-CLOSED-1',
    timestamp: '2026-11-15T08:50:00.000Z',
    actor: {
      name: operator.name,
      email: operator.email,
      role: operator.role,
    },
    enterpriseId: 'ent-wf04-campus',
    action: 'CASE_STATUS_UPDATED',
    target: 'CASE-WF04-DOWNSTREAM-CLOSED',
    details: 'Confirmed and closed CASE-WF04-DOWNSTREAM-CLOSED',
    ipAddress: '10.12.0.8',
  };
  const auditLogs = [
    c1Open.auditEntry,
    c1Assigned.auditEntry,
    c2Open.auditEntry,
    closedCaseAudit,
  ];

  // Operator sees all 4 case audit logs for ent-wf04-campus
  const opAudit = enterpriseMod.auditForUser(
    auditLogs,
    operator,
    bundle.enterprises,
    bundle.transactions,
    allCases,
    []
  );
  assert.equal(opAudit.length, 4);

  // SME Admin sees ONLY audit logs for the Closed case (CASE-WF04-DOWNSTREAM-CLOSED), NOT the Investigating case
  const smeAudit = enterpriseMod.auditForUser(
    auditLogs,
    smeAdmin,
    bundle.enterprises,
    bundle.transactions,
    allCases,
    []
  );
  assert.equal(smeAudit.length, 2);
  assert.ok(smeAudit.every((l) => l.target === 'CASE-WF04-DOWNSTREAM-CLOSED'));

  // Platform Admin, Implementation Staff, Investigator, and foreign Operator see 0 internal case audit logs
  for (const deniedAuditUser of [platformAdmin, impStaff, inv1, branchOperator]) {
    const filtered = enterpriseMod.auditForUser(
      auditLogs,
      deniedAuditUser,
      bundle.enterprises,
      bundle.transactions,
      allCases,
      []
    );
    assert.equal(filtered.length, 0);
  }

  const smeAuditHtml = renderToStaticMarkup(
    React.createElement(AuditTrailView, {
      initialLogs: smeAudit,
    })
  );
  assert.match(smeAuditHtml, /CASE-WF04-DOWNSTREAM-CLOSED/);
  assert.doesNotMatch(smeAuditHtml, /CASE-WF04-DOWNSTREAM-ACTIVE/);

  // 3) buildCaseNotifications:
  // - Operator gets 1 case notification per case (2 case notifications total, even though Case 1 has 2 alerts)
  const opNotifs = notificationMod.buildCaseNotifications({
    transactions: bundle.transactions,
    investigationCases: allCases,
    legacyArchive: [],
    currentUser: operator,
    enterprises: bundle.enterprises,
    vi: true,
  });
  const opCaseNotifs = opNotifs.filter((n) => n.kind === 'case');
  assert.equal(opCaseNotifs.length, 2);

  // - Investigator 1 gets only their assigned case (CASE-WF04-DOWNSTREAM-ACTIVE)
  const inv1Notifs = notificationMod.buildCaseNotifications({
    transactions: bundle.transactions,
    investigationCases: allCases,
    legacyArchive: [],
    currentUser: inv1,
    enterprises: bundle.enterprises,
    vi: true,
  });
  assert.equal(inv1Notifs.length, 1);
  assert.equal(inv1Notifs[0].caseId, 'CASE-WF04-DOWNSTREAM-ACTIVE');
  assert.equal(inv1Notifs[0].investigationCase.alerts.length, 2);

  // - SME Admin gets only the Closed confirmed case (CASE-WF04-DOWNSTREAM-CLOSED) among case notifications
  const smeNotifs = notificationMod.buildCaseNotifications({
    transactions: bundle.transactions,
    investigationCases: allCases,
    legacyArchive: [],
    currentUser: smeAdmin,
    enterprises: bundle.enterprises,
    vi: true,
  });
  const smeCaseNotifs = smeNotifs.filter((n) => n.kind === 'case');
  assert.equal(smeCaseNotifs.length, 1);
  assert.equal(smeCaseNotifs[0].caseId, 'CASE-WF04-DOWNSTREAM-CLOSED');

  // - Platform Admin & Implementation Staff get 0 case notifications
  assert.equal(
    notificationMod.buildCaseNotifications({
      transactions: bundle.transactions,
      investigationCases: allCases,
      legacyArchive: [],
      currentUser: platformAdmin,
      enterprises: bundle.enterprises,
      vi: true,
    }).length,
    0
  );

  // 4) CSV export & transaction case summary:
  // - Operator CSV has header + 2 rows (1 per case)
  const opCsvRows = exportCsvMod.buildInvestigationCasesCSVRows(
    allCases,
    bundle.users,
    operator
  );
  assert.equal(opCsvRows.length, 3);

  // - SME Admin CSV has header + 1 row (Closed case only)
  const smeCsvRows = exportCsvMod.buildInvestigationCasesCSVRows(
    allCases,
    bundle.users,
    smeAdmin
  );
  assert.equal(smeCsvRows.length, 2);
  assert.equal(smeCsvRows[1][0], 'CASE-WF04-DOWNSTREAM-CLOSED');

  // - Platform Admin CSV returns 0 rows and resolveTransactionCaseSummary masks case fields
  const paCsvRows = exportCsvMod.buildInvestigationCasesCSVRows(
    allCases,
    bundle.users,
    platformAdmin
  );
  assert.equal(paCsvRows.length, 0);
  const tx01 = bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-01');
  const paTxSummary = exportCsvMod.resolveTransactionCaseSummary(
    tx01,
    allCases,
    [],
    platformAdmin
  );
  assert.equal(paTxSummary.caseId, '');

  // 5) ReportsView:
  // - SME Admin sees confirmed Closed case report (CASE-WF04-DOWNSTREAM-CLOSED), NOT Investigating case
  const smeReportsHtml = renderToStaticMarkup(
    React.createElement(ReportsView, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: smeAdmin,
      investigationCases: allCases,
      legacyCaseArchive: [],
    })
  );
  assert.match(smeReportsHtml, /CASE-WF04-DOWNSTREAM-CLOSED/);
  assert.doesNotMatch(smeReportsHtml, /CASE-WF04-DOWNSTREAM-ACTIVE/);

  // - Platform Admin is denied internal report access in ReportsView
  const paReportsHtml = renderToStaticMarkup(
    React.createElement(ReportsView, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: platformAdmin,
      investigationCases: allCases,
      legacyCaseArchive: [],
    })
  );
  assert.doesNotMatch(paReportsHtml, /CASE-WF04-DOWNSTREAM-CLOSED/);
  assert.doesNotMatch(paReportsHtml, /CASE-WF04-DOWNSTREAM-ACTIVE/);

  // 6) PlatformHealthView & platformSummary in WF-04 mode do NOT emit feedback from case closure or legacy caseDecision
  const summaryWf04 = platformSummaryMod.platformSummary(
    defaultTxMod.fraudGuardTransactions,
    { wf04Managed: true }
  );
  assert.deepEqual([...summaryWf04.feedback], []);

  const healthHtml = renderToStaticMarkup(
    React.createElement(PlatformHealthView, {
      transactions: defaultTxMod.fraudGuardTransactions,
      enterprises: defaultEntMod.demoEnterprises,
      rules: defaultRulesMod.fraudGuardRules,
      wf04Managed: true,
    })
  );
  assert.match(healthHtml, /0 phản hồi đã gửi/);
});
