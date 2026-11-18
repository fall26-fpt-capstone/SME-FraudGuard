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
    Error: globalThis.Error,
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

function createScriptedStorage(initial = {}, options = {}) {
  const store = new Map(Object.entries(initial));
  const failReadKeys = new Set(options.failReadKeys || []);
  const failWriteKeys = new Set(options.failWriteKeys || []);
  const failRemoveKeys = new Set(options.failRemoveKeys || []);
  const ops = [];
  let failWritesAfterCount =
    typeof options.failWritesAfterCount === 'number' ? options.failWritesAfterCount : null;
  let writeCount = 0;

  return {
    store,
    ops,
    setFailReadKeys(keys) {
      failReadKeys.clear();
      for (const k of keys) failReadKeys.add(k);
    },
    setFailWriteKeys(keys) {
      failWriteKeys.clear();
      for (const k of keys) failWriteKeys.add(k);
    },
    setFailRemoveKeys(keys) {
      failRemoveKeys.clear();
      for (const k of keys) failRemoveKeys.add(k);
    },
    setFailWritesAfterCount(count) {
      failWritesAfterCount = count;
    },
    getItem(key) {
      ops.push({ type: 'getItem', key });
      if (failReadKeys.has(key)) {
        const err = new Error(`StorageReadError when reading ${key}`);
        err.name = 'StorageReadError';
        throw err;
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      ops.push({ type: 'setItem', key, value: String(value) });
      writeCount += 1;
      if (
        failWriteKeys.has(key) ||
        (failWritesAfterCount !== null && writeCount > failWritesAfterCount)
      ) {
        const err = new Error(`QuotaExceededError when writing ${key}`);
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key) {
      ops.push({ type: 'removeItem', key });
      if (failRemoveKeys.has(key)) {
        const err = new Error(`StorageRemoveError when removing ${key}`);
        err.name = 'StorageRemoveError';
        throw err;
      }
      store.delete(key);
    },
  };
}

const wf04Demo = load('src/data/wf04-demo.ts');
const migration = load('src/utils/case-migration.ts');
const storageMod = load('src/utils/workspace-storage.ts');
const hookMod = load('src/hooks/useInvestigationCases.ts');
const enterpriseMod = load('src/utils/enterprise.ts');
const defaultTxMod = load('src/data/fraudguard-transactions.ts');
const defaultEntMod = load('src/data/fraudguard-enterprises.ts');
const defaultProjectsMod = load('src/data/fraudguard-projects.ts');
const defaultUsersMod = load('src/data/fraudguard-roles.ts');
const defaultRulesMod = load('src/data/fraudguard-rules.ts');

const uiImports = createUiImports('vi');
const { AlertsView } = load('src/components/fraudguard-dashboard/AlertsView.tsx', uiImports);

const NOW_ISO = '2026-11-15T10:00:00.000Z';

function buildValidV4Payload() {
  const bundle = wf04Demo.getWf04DemoBundle();
  const seedMigration = migration.migrateWorkspaceLegacyCases({
    transactions: defaultTxMod.fraudGuardTransactions,
    enterprises: defaultEntMod.demoEnterprises,
    projects: defaultProjectsMod.initialProjects,
    users: defaultUsersMod.DEMO_USERS,
    sourceSchema: 'seed',
    migratedAt: NOW_ISO,
  });
  return {
    schemaVersion: storageMod.WORKSPACE_SCHEMA_VERSION,
    rules: bundle.rules,
    ruleSets: bundle.ruleSets,
    enterprises: bundle.enterprises,
    legacyUnassigned: [],
    projects: bundle.projects,
    transactions: bundle.transactions,
    auditLogs: [],
    investigationCases: bundle.initialCases,
    legacyCaseArchive: seedMigration.legacyArchive,
    migrationMeta: seedMigration.migrationMeta,
  };
}

function restoreWithPayload(rawPayloadObj, rawUsersObj) {
  const rawV4 = JSON.stringify(rawPayloadObj);
  const initialStore = {
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: rawV4,
  };
  if (rawUsersObj !== undefined) {
    initialStore[storageMod.USERS_STORAGE_KEY_V1] = JSON.stringify(rawUsersObj);
  }
  const storage = createScriptedStorage(initialStore);
  const res = storageMod.restoreWorkspaceSnapshot({
    storage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  return { res, storage, rawV4 };
}

test('Section 2.1: Case with alerts: [null] or alert link missing transactionId/wrong type is blocked at restore boundary without crashing downstream callers', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const expInv = bundle.users.find((u) => u.id === 'usr-wf04-exp-inv');
  const validPayload = buildValidV4Payload();
  const baseCase = validPayload.investigationCases[0];

  // (a) alerts: [null] assigned to expInv
  const caseWithNullAlert = {
    ...baseCase,
    status: 'Investigating',
    assignmentMode: 'assigned',
    assignee: {
      actorId: expInv.id,
      role: 'Investigator',
      enterpriseId: expInv.enterpriseId,
      name: expInv.name,
    },
    alerts: [null],
  };

  const { res: resNullAlert, storage: storageNullAlert, rawV4: rawNullAlert } = restoreWithPayload({
    ...validPayload,
    investigationCases: [caseWithNullAlert],
  });

  // Must NOT crash when filtering transactions for Investigator on the restored payload
  assert.doesNotThrow(() => {
    enterpriseMod.transactionsForEnterprise(
      resNullAlert.payload.transactions,
      expInv,
      resNullAlert.payload.enterprises,
      resNullAlert.payload.investigationCases,
      resNullAlert.payload.legacyCaseArchive
    );
  });

  assert.equal(resNullAlert.status, 'blocked_corrupt');
  assert.equal(resNullAlert.canPersist, false);
  assert.equal(resNullAlert.errorCode, 'INVALID_WORKSPACE_SHAPE');
  assert.equal(storageNullAlert.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), rawNullAlert);

  // (b) Alert link missing transactionId or wrong field type
  const caseWithMissingTxId = {
    ...baseCase,
    alerts: [
      {
        ...baseCase.alerts[0],
        transactionId: '',
      },
    ],
  };
  const { res: resMissingTxId } = restoreWithPayload({
    ...validPayload,
    investigationCases: [caseWithMissingTxId],
  });
  assert.equal(resMissingTxId.status, 'blocked_corrupt');
  assert.equal(resMissingTxId.canPersist, false);
});

test('Section 2.2 & 2.3: Case with null/invalid reports or history, duplicate/mismatched alertIds, invalid status, or broken Pending Review/Closed report references is rejected at restore', () => {
  const validPayload = buildValidV4Payload();
  const baseCase = validPayload.investigationCases[0];

  const badCases = [
    // reports: [null]
    {
      ...baseCase,
      reports: [null],
    },
    // history: [null]
    {
      ...baseCase,
      history: [null],
    },
    // history event with invalid timestamp or missing actor
    {
      ...baseCase,
      history: [
        {
          ...baseCase.history[0],
          at: 'not-a-valid-iso',
          actor: null,
        },
      ],
    },
    // duplicate alertIds
    {
      ...baseCase,
      alertIds: ['ALT-WF04-EXP-PRE-01', 'ALT-WF04-EXP-PRE-01'],
    },
    // alertIds mismatch with alerts links
    {
      ...baseCase,
      alertIds: ['ALT-OTHER-999'],
    },
    // invalid case status
    {
      ...baseCase,
      status: 'InvalidStatus',
    },
    // Pending Review pointing to non-existent reportId / reportVersion
    {
      ...baseCase,
      status: 'Pending Review',
      pendingReviewReportId: 'RPT-DOES-NOT-EXIST',
      pendingReviewReportVersion: 99,
      reports: [],
    },
    // Closed without valid conclusion or matching report in reports
    {
      ...baseCase,
      status: 'Closed',
      conclusion: {
        reportId: 'RPT-GHOST',
        reportVersion: 1,
        confirmedBy: baseCase.createdBy,
        confirmedAt: NOW_ISO,
        summary: 'Ghost conclusion',
        alertResults: [],
      },
      reports: [],
    },
  ];

  for (const corruptedCase of badCases) {
    const { res, storage, rawV4 } = restoreWithPayload({
      ...validPayload,
      investigationCases: [corruptedCase],
    });
    assert.equal(res.status, 'blocked_corrupt');
    assert.equal(res.canPersist, false);
    assert.equal(res.errorCode, 'INVALID_WORKSPACE_SHAPE');
    assert.equal(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), rawV4);
  }
});

test('Section 2.4, 2.5 & 2.6: Restore validates legacyCaseArchive and preDemoSnapshot while accepting valid v4 workspace, legacy archive without provenance, and valid preDemoSnapshot', () => {
  const validPayload = buildValidV4Payload();
  const baseArchive = validPayload.legacyCaseArchive[0];

  // 2.4 (a) Archive missing alertIds/transactionIds arrays
  const { res: resArchMissingIds } = restoreWithPayload({
    ...validPayload,
    legacyCaseArchive: [
      {
        archiveId: 'arch-bad-1',
        reasonCode: 'MISSING_CREATION_PROVENANCE',
        blocksAlertCreation: true,
        transactions: baseArchive.transactions,
      },
    ],
  });
  assert.equal(resArchMissingIds.status, 'blocked_corrupt');
  assert.equal(resArchMissingIds.canPersist, false);

  // 2.4 (b) Archive with transactions: [null]
  const { res: resArchNullTx } = restoreWithPayload({
    ...validPayload,
    legacyCaseArchive: [
      {
        ...baseArchive,
        transactions: [null],
      },
    ],
  });
  assert.equal(resArchNullTx.status, 'blocked_corrupt');
  assert.equal(resArchNullTx.canPersist, false);

  // 2.5 (a) preDemoSnapshot: {}
  const { res: resEmptySnap } = restoreWithPayload({
    ...validPayload,
    wf04DemoActive: true,
    preDemoSnapshot: {},
  });
  assert.equal(resEmptySnap.status, 'blocked_corrupt');
  assert.equal(resEmptySnap.canPersist, false);

  // 2.5 (b) wf04DemoActive: true without preDemoSnapshot
  const { res: resMissingSnap } = restoreWithPayload({
    ...validPayload,
    wf04DemoActive: true,
  });
  assert.equal(resMissingSnap.status, 'blocked_corrupt');
  assert.equal(resMissingSnap.canPersist, false);

  // 2.5 (c) restorePreDemoWorkspace on corrupted preDemoSnapshot must not throw or return broken state
  assert.doesNotThrow(() => {
    const out = wf04Demo.restorePreDemoWorkspace({
      currentPayload: {
        ...validPayload,
        wf04DemoActive: true,
        preDemoSnapshot: {},
      },
    });
    assert.equal(out.restored, false);
  });

  // 2.6 Valid v4 payload (including 13 legacy archive entries without provenance) and valid preDemoSnapshot restore cleanly
  const appliedDemo = wf04Demo.applyWf04DemoWorkspace({
    currentPayload: validPayload,
    currentUsers: defaultUsersMod.DEMO_USERS,
    savedAt: NOW_ISO,
  });
  const { res: resValidDemo } = restoreWithPayload(appliedDemo.payload, appliedDemo.users);
  assert.equal(resValidDemo.status, 'ready');
  assert.equal(resValidDemo.canPersist, true);
  assert.equal(resValidDemo.payload.legacyCaseArchive.length, 13);
  assert.equal(resValidDemo.payload.wf04DemoActive, true);
  assert.ok(resValidDemo.payload.preDemoSnapshot);
});

test('Section 3.1–3.5: executeAssignInvestigatorAction and executeSelfAssignCaseAction never rewrite or clamp timestamps (+1ms or Date.now() fallback)', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');

  const baseSnapshot = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Create case at 2026-11-15T10:00:00.000Z
  const created = hookMod.executeCreateCaseAction({
    snapshot: baseSnapshot,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-TIME-01',
    now: () => '2026-11-15T10:00:00.000Z',
  });
  assert.equal(created.ok, true);
  assert.equal(created.investigationCase.createdAt, '2026-11-15T10:00:00.000Z');

  const snapshotWithCase = {
    ...baseSnapshot,
    cases: created.nextCases,
  };

  // 3.1 Backward clock (09:00 on a case created at 10:00) via `now` without `at` MUST fail with TIMESTAMP_OUT_OF_ORDER (not become 10:00:00.001Z)
  const backwardAssign = hookMod.executeAssignInvestigatorAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    assigneeId: inv1.id,
    now: () => '2026-11-15T09:00:00.000Z',
  });
  assert.equal(backwardAssign.ok, false);
  assert.equal(backwardAssign.code, 'TIMESTAMP_OUT_OF_ORDER');

  const backwardSelfAssign = hookMod.executeSelfAssignCaseAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    now: () => '2026-11-15T09:00:00.000Z',
  });
  assert.equal(backwardSelfAssign.ok, false);
  assert.equal(backwardSelfAssign.code, 'TIMESTAMP_OUT_OF_ORDER');

  // 3.2 Malformed clock via `now` without `at` MUST fail with INVALID_TIMESTAMP (never fallback to Date.now())
  const malformedAssign = hookMod.executeAssignInvestigatorAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    assigneeId: inv1.id,
    now: () => 'not-an-iso-timestamp',
  });
  assert.equal(malformedAssign.ok, false);
  assert.equal(malformedAssign.code, 'INVALID_TIMESTAMP');

  const malformedSelfAssign = hookMod.executeSelfAssignCaseAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    now: () => 'not-an-iso-timestamp',
  });
  assert.equal(malformedSelfAssign.ok, false);
  assert.equal(malformedSelfAssign.code, 'INVALID_TIMESTAMP');

  // 3.3 Equal timestamp via `now` (2026-11-15T10:00:00.000Z) is accepted at exact instant (no +1ms added!)
  const equalAssign = hookMod.executeAssignInvestigatorAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    assigneeId: inv1.id,
    now: () => '2026-11-15T10:00:00.000Z',
  });
  assert.equal(equalAssign.ok, true);
  assert.equal(equalAssign.event.at, '2026-11-15T10:00:00.000Z');
  assert.equal(equalAssign.investigationCase.assignedAt, '2026-11-15T10:00:00.000Z');
  assert.equal(equalAssign.auditEntry.timestamp, '2026-11-15T10:00:00.000Z');

  // 3.4 Offset-equivalent timestamp via `now` (2026-11-15T17:00:00.000+07:00 === 2026-11-15T10:00:00.000Z) is accepted at exact instant (no +1ms!)
  const offsetSelfAssign = hookMod.executeSelfAssignCaseAction({
    snapshot: snapshotWithCase,
    actor: operator,
    caseId: 'CASE-WF04-TIME-01',
    now: () => '2026-11-15T17:00:00.000+07:00',
  });
  assert.equal(offsetSelfAssign.ok, true);
  assert.equal(offsetSelfAssign.event.at, '2026-11-15T10:00:00.000Z');
  assert.equal(offsetSelfAssign.investigationCase.assignedAt, '2026-11-15T10:00:00.000Z');

  // 3.5 Pre-expiry Open case (CASE-WF04-EXP-01, created 2026-08-15T10:00:00.000Z) rejects pre-creation clock (2026-08-15T09:59:59.000Z) and accepts post-expiry clock (2026-11-15T10:00:00.000Z)
  const expOperator = bundle.users.find((u) => u.id === 'usr-wf04-exp-op');
  const expSnapshot = {
    ...baseSnapshot,
    cases: bundle.initialCases,
  };
  const expBackward = hookMod.executeSelfAssignCaseAction({
    snapshot: expSnapshot,
    actor: expOperator,
    caseId: 'CASE-WF04-EXP-01',
    now: () => '2026-08-15T09:59:59.000Z',
  });
  assert.equal(expBackward.ok, false);
  assert.equal(expBackward.code, 'TIMESTAMP_OUT_OF_ORDER');

  const expValidAfterExpiry = hookMod.executeSelfAssignCaseAction({
    snapshot: expSnapshot,
    actor: expOperator,
    caseId: 'CASE-WF04-EXP-01',
    now: () => '2026-11-15T10:00:00.000Z',
  });
  assert.equal(expValidAfterExpiry.ok, true);
  assert.equal(expValidAfterExpiry.event.at, '2026-11-15T10:00:00.000Z');
});

test('Section 3.6: AlertsView sorts newest alerts first by full millisecond timestamp (.005Z before .001Z) even when display time is identical', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const baseTx = bundle.transactions.find((t) => t.id === 'tx-wf04-campus-01');

  const tx001 = {
    ...baseTx,
    id: 'tx-ms-001',
    alertId: 'ALT-MS-001',
    processedAt: '2026-11-15T10:00:00.001Z',
  };
  const tx005 = {
    ...baseTx,
    id: 'tx-ms-005',
    alertId: 'ALT-MS-005',
    processedAt: '2026-11-15T10:00:00.005Z',
  };

  // Pass .001Z first in input array to verify sort places .005Z before .001Z
  const html = renderToStaticMarkup(
    React.createElement(AlertsView, {
      transactions: [
        { ...baseTx, id: 'tx-new-rule', alertId: 'ALT-NEW-RULE', scoringSource: 'Rule', processedAt: '2026-11-16T10:00:00.005Z' },
        { ...baseTx, id: 'tx-new-linked', alertId: 'ALT-NEW-LINKED', caseId: 'CASE-EXISTING', processedAt: '2026-11-16T10:00:00.001Z' },
        tx001,
        tx005,
      ],
      enterprises: bundle.enterprises,
      currentUser: operator,
      canManageCases: true,
      investigationCases: [],
      legacyCaseArchive: [],
    })
  );

  const idx005 = html.indexOf('ALT-MS-005');
  const idx001 = html.indexOf('ALT-MS-001');
  assert.ok(idx005 >= 0 && idx001 >= 0);
  assert.ok(idx005 < idx001, 'Expected .005Z alert to be sorted before .001Z alert');
  const idxRule = html.indexOf('ALT-NEW-RULE');
  const idxLinked = html.indexOf('ALT-NEW-LINKED');
  assert.ok(idxRule >= 0 && idxLinked >= 0);
  assert.ok(idx001 < idxRule && idx001 < idxLinked, 'Pending AI alerts must precede newer monitoring and linked alerts');
  assert.ok(idxRule < idxLinked, 'Non-pending alerts must also retain full timestamp order');
});

test('Section 4.1–4.5: Workspace + users persistence rolls back newly created v4 key when prior v4 was absent, aborts on prior-read error, and reports recovery state if rollback fails', () => {
  const validPayload = buildValidV4Payload();
  const bundle = wf04Demo.getWf04DemoBundle();

  // 4.1 Initially NO v4 key in storage: workspace write succeeds, users write fails -> rollback MUST remove v4 key so v4 does not remain in storage
  const storageNoPriorV4 = createScriptedStorage(
    {},
    { failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1] }
  );
  const resNoPriorV4 = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: validPayload,
    patch: { enterprises: bundle.enterprises },
    restoreStatus: 'ready',
    users: bundle.users,
    storage: storageNoPriorV4,
  });
  assert.equal(resNoPriorV4.ok, false);
  assert.equal(
    storageNoPriorV4.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4),
    null,
    'Expected newly written v4 key to be removed on rollback when prior v4 did not exist'
  );
  assert.equal(storageNoPriorV4.getItem(storageMod.USERS_STORAGE_KEY_V1), null);

  // 4.2 Initially both v4 and users keys exist: users write fails -> both keys remain at exact prior raw values
  const priorRawV4 = JSON.stringify(validPayload);
  const priorRawUsers = JSON.stringify(defaultUsersMod.DEMO_USERS.filter((u) => u.enterpriseId));
  const storageBothExist = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: priorRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: priorRawUsers,
    },
    { failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1] }
  );
  const resBothExist = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: validPayload,
    patch: { auditLogs: [{ id: 'aud-1', timestamp: NOW_ISO, actor: { name: 'A', email: 'a@b.c', role: 'Operator' }, action: 'CASE_CREATED', target: 'C1', details: 'D', ipAddress: '1.1.1.1' }] },
    restoreStatus: 'ready',
    users: bundle.users,
    storage: storageBothExist,
  });
  assert.equal(resBothExist.ok, false);
  assert.equal(storageBothExist.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), priorRawV4);
  assert.equal(storageBothExist.getItem(storageMod.USERS_STORAGE_KEY_V1), priorRawUsers);

  // 4.3 Workspace write fails -> users key is untouched
  const storageWsFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: priorRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: priorRawUsers,
    },
    { failWriteKeys: [storageMod.WORKSPACE_STORAGE_KEY_V4] }
  );
  const resWsFail = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: validPayload,
    patch: {},
    restoreStatus: 'ready',
    users: bundle.users,
    storage: storageWsFail,
  });
  assert.equal(resWsFail.ok, false);
  assert.equal(storageWsFail.getItem(storageMod.USERS_STORAGE_KEY_V1), priorRawUsers);

  // 4.4 Reading prior data throws -> must abort BEFORE any setItem/removeItem write (never treat read error as empty key!)
  const storageReadFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: priorRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: priorRawUsers,
    },
    { failReadKeys: [storageMod.WORKSPACE_STORAGE_KEY_V4] }
  );
  const resReadFail = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: validPayload,
    patch: {},
    restoreStatus: 'ready',
    users: bundle.users,
    storage: storageReadFail,
  });
  assert.equal(resReadFail.ok, false);
  const writeOps = storageReadFail.ops.filter(
    (op) => op.type === 'setItem' || op.type === 'removeItem'
  );
  assert.equal(
    writeOps.length,
    0,
    'Expected 0 storage writes when reading prior storage state fails'
  );

  // 4.5 Rollback failure (workspace write #1 succeeds, users write #2 fails, rollback write/remove #3 also fails) -> must report inconsistent/recovery-required state
  const storageRollbackFail = createScriptedStorage(
    {},
    {
      failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1],
      failRemoveKeys: [storageMod.WORKSPACE_STORAGE_KEY_V4],
    }
  );
  const resRollbackFail = storageMod.mergeAndPersistWorkspaceSlice({
    currentPayload: validPayload,
    patch: {},
    restoreStatus: 'ready',
    users: bundle.users,
    storage: storageRollbackFail,
  });
  assert.equal(resRollbackFail.ok, false);
  assert.equal(
    resRollbackFail.rollbackFailed === true ||
      resRollbackFail.errorCode === 'STORAGE_ROLLBACK_FAILED',
    true,
    'Expected explicit rollback-failure / recovery indicator when rollback itself fails'
  );
});

test('Section 4.5 & 4.7: Rollback failure writes recovery journal, blocks automatic overwrites, surfaces recovery_required on reload, and recovers cleanly via recoverWorkspaceStorage', () => {
  const validPayload = buildValidV4Payload();
  const bundle = wf04Demo.getWf04DemoBundle();

  // Start with no prior v4, workspace write succeeds, users write fails, and removeItem fails during rollback
  const storage = createScriptedStorage(
    {},
    {
      failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1],
      failRemoveKeys: [storageMod.WORKSPACE_STORAGE_KEY_V4],
    }
  );

  const failedWrite = storageMod.persistWorkspaceAndUsers({
    payload: validPayload,
    users: bundle.users,
    restoreStatus: 'ready',
    storage,
    operation: 'onboardingSave',
  });
  assert.equal(failedWrite.ok, false);
  assert.equal(failedWrite.errorCode, 'STORAGE_ROLLBACK_FAILED');
  assert.equal(failedWrite.rolledBack, false);
  assert.equal(failedWrite.rollbackFailed, true);
  assert.equal(failedWrite.recoveryRequired, true);
  assert.ok(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4));

  // Even if storage write failures are cleared, normal automatic/autosave writes (allowRecoveryOverwrite: false)
  // are blocked while recovery journal exists so autosave cannot legitimize a partial write
  storage.setFailWriteKeys([]);
  storage.setFailRemoveKeys([]);

  const autoWriteBlocked = storageMod.persistWorkspaceAndUsers({
    payload: validPayload,
    users: bundle.users,
    restoreStatus: 'ready',
    storage,
    operation: 'autosave',
    allowRecoveryOverwrite: false,
  });
  assert.equal(autoWriteBlocked.ok, false);
  assert.equal(autoWriteBlocked.errorCode, 'STORAGE_RECOVERY_REQUIRED');
  assert.equal(autoWriteBlocked.recoveryRequired, true);

  // Reloading via restoreWorkspaceSnapshot detects the journal and returns status: 'recovery_required', canPersist: false
  const restoredDuringRecovery = storageMod.restoreWorkspaceSnapshot({
    storage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(restoredDuringRecovery.status, 'recovery_required');
  assert.equal(restoredDuringRecovery.canPersist, false);
  assert.equal(restoredDuringRecovery.errorCode, 'STORAGE_RECOVERY_REQUIRED');
  assert.ok(restoredDuringRecovery.recoveryJournal);

  // Explicit recovery via recoverWorkspaceStorage commits both workspace and users and removes the recovery journal
  const recovered = storageMod.recoverWorkspaceStorage({
    payload: validPayload,
    users: bundle.users,
    restoreStatus: restoredDuringRecovery.status,
    storage,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recoveryRequired, false);
  assert.equal(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);
  assert.ok(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  assert.ok(storage.getItem(storageMod.USERS_STORAGE_KEY_V1));

  // Subsequent reload returns status: 'ready', canPersist: true
  const restoredAfterRecovery = storageMod.restoreWorkspaceSnapshot({
    storage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(restoredAfterRecovery.status, 'ready');
  assert.equal(restoredAfterRecovery.canPersist, true);
});

test('Section 4.6: Coordinated applyAndPersistWf04Demo and restoreAndPersistPreDemoWorkspace preserve preDemoSnapshot across partial users failure and rollback failure', () => {
  const preDemoPayload = buildValidV4Payload();
  const preDemoUsers = defaultUsersMod.DEMO_USERS;
  const priorRawV4 = JSON.stringify(preDemoPayload);
  const priorRawUsers = JSON.stringify(preDemoUsers.filter((u) => u.enterpriseId));

  // 1) applyAndPersistWf04Demo when users write fails -> rolls back v4 and returns applied: false
  const storageApplyFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: priorRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: priorRawUsers,
    },
    { failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1] }
  );
  const applyFailRes = wf04Demo.applyAndPersistWf04Demo({
    currentPayload: preDemoPayload,
    currentUsers: preDemoUsers,
    savedAt: NOW_ISO,
    restoreStatus: 'ready',
    storage: storageApplyFail,
  });
  assert.equal(applyFailRes.ok, false);
  assert.equal(applyFailRes.applied, false);
  assert.equal(applyFailRes.rolledBack, true);
  assert.equal(applyFailRes.payload.wf04DemoActive, undefined);
  assert.equal(storageApplyFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), priorRawV4);
  assert.equal(storageApplyFail.getItem(storageMod.USERS_STORAGE_KEY_V1), priorRawUsers);

  // 2) applyAndPersistWf04Demo succeeds when storage is healthy
  storageApplyFail.setFailWriteKeys([]);
  const applyOkRes = wf04Demo.applyAndPersistWf04Demo({
    currentPayload: preDemoPayload,
    currentUsers: preDemoUsers,
    savedAt: NOW_ISO,
    restoreStatus: 'ready',
    storage: storageApplyFail,
  });
  assert.equal(applyOkRes.ok, true);
  assert.equal(applyOkRes.applied, true);
  assert.equal(applyOkRes.payload.wf04DemoActive, true);
  assert.ok(applyOkRes.payload.preDemoSnapshot);

  const demoRawV4 = storageApplyFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4);
  const demoRawUsers = storageApplyFail.getItem(storageMod.USERS_STORAGE_KEY_V1);

  // 3) restoreAndPersistPreDemoWorkspace when users write fails -> rolls back v4 and keeps preDemoSnapshot intact
  storageApplyFail.setFailWriteKeys([storageMod.USERS_STORAGE_KEY_V1]);
  const restoreFailRollbackOk = wf04Demo.restoreAndPersistPreDemoWorkspace({
    currentPayload: applyOkRes.payload,
    currentUsers: applyOkRes.users,
    restoreStatus: 'ready',
    storage: storageApplyFail,
  });
  assert.equal(restoreFailRollbackOk.ok, false);
  assert.equal(restoreFailRollbackOk.restored, false);
  assert.equal(restoreFailRollbackOk.rolledBack, true);
  assert.equal(restoreFailRollbackOk.payload.wf04DemoActive, true);
  assert.ok(restoreFailRollbackOk.payload.preDemoSnapshot);
  assert.equal(storageApplyFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), demoRawV4);
  assert.equal(storageApplyFail.getItem(storageMod.USERS_STORAGE_KEY_V1), demoRawUsers);

  // 4) restoreAndPersistPreDemoWorkspace when users write fails AND rollback write also fails ->
  // two-phase guard keeps preDemoSnapshot in storage and reload enters recovery_required without losing preDemoSnapshot
  const storageRestoreRollbackFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: demoRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: demoRawUsers,
    },
    {
      // Write #1 (staged v4 with preDemoSnapshot preserved) succeeds; Write #2 (users) and Write #3 (rollback v4) fail
      failWritesAfterCount: 1,
    }
  );
  const restoreRollbackFailRes = wf04Demo.restoreAndPersistPreDemoWorkspace({
    currentPayload: applyOkRes.payload,
    currentUsers: applyOkRes.users,
    restoreStatus: 'ready',
    storage: storageRestoreRollbackFail,
  });
  assert.equal(restoreRollbackFailRes.ok, false);
  assert.equal(restoreRollbackFailRes.restored, false);
  assert.equal(restoreRollbackFailRes.rollbackFailed, true);
  assert.equal(restoreRollbackFailRes.recoveryRequired, true);
  assert.equal(restoreRollbackFailRes.payload.wf04DemoActive, true);
  assert.ok(restoreRollbackFailRes.payload.preDemoSnapshot);

  // Verify raw v4 in storage STILL has preDemoSnapshot (never lost!)
  const stagedV4InStorage = JSON.parse(
    storageRestoreRollbackFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4)
  );
  assert.ok(stagedV4InStorage.preDemoSnapshot);

  // Reloading from this interrupted state returns recovery_required with wf04DemoActive: true & preDemoSnapshot intact
  const reloadInterruptedRestore = storageMod.restoreWorkspaceSnapshot({
    storage: storageRestoreRollbackFail,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(reloadInterruptedRestore.status, 'recovery_required');
  assert.equal(reloadInterruptedRestore.canPersist, false);
  assert.equal(reloadInterruptedRestore.payload.wf04DemoActive, true);
  assert.ok(reloadInterruptedRestore.payload.preDemoSnapshot);

  // Clearing quota failure and retrying restoreAndPersistPreDemoWorkspace with allowRecoveryOverwrite: true completes cleanly
  storageRestoreRollbackFail.setFailWritesAfterCount(null);
  const retryRestoreRes = wf04Demo.restoreAndPersistPreDemoWorkspace({
    currentPayload: reloadInterruptedRestore.payload,
    currentUsers: reloadInterruptedRestore.users,
    restoreStatus: reloadInterruptedRestore.status,
    storage: storageRestoreRollbackFail,
    allowRecoveryOverwrite: true,
  });
  assert.equal(retryRestoreRes.ok, true);
  assert.equal(retryRestoreRes.restored, true);
  assert.equal(retryRestoreRes.payload.wf04DemoActive, false);
  assert.equal(retryRestoreRes.payload.preDemoSnapshot, undefined);
  assert.equal(retryRestoreRes.users.length, preDemoUsers.length);
});

test('Section 3 & 4 Hook Integration: useInvestigationCases coordinates workspace + users writes, rejects backward/malformed clocks, rolls back v4 on users failure, and recovers via retryPersist without duplicating cases or audits', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const basePayload = buildValidV4Payload();

  // Minimal synchronous React hook harness for exercising useInvestigationCases
  const slots = [];
  let cursor = 0;
  const mockReact = {
    useReducer(reducer, initArg, initFn) {
      const idx = cursor++;
      if (!(idx in slots)) {
        slots[idx] = initFn ? initFn(initArg) : initArg;
      }
      const dispatch = (action) => {
        slots[idx] = reducer(slots[idx], action);
      };
      return [slots[idx], dispatch];
    },
    useRef(initialValue) {
      const idx = cursor++;
      if (!(idx in slots)) {
        slots[idx] = { current: initialValue };
      }
      return slots[idx];
    },
    useEffect(fn) {
      cursor++;
      fn();
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
  };

  const { useInvestigationCases } = load('src/hooks/useInvestigationCases.ts', {
    react: mockReact,
  });

  const storage = createScriptedStorage();
  const recordedAudits = [];
  let currentClock = '2026-11-15T10:00:00.000Z';

  function renderHook(extraOptions = {}) {
    cursor = 0;
    return useInvestigationCases({
      enterprises: bundle.enterprises,
      projects: bundle.projects,
      alerts: bundle.transactions,
      legacyArchive: [],
      users: bundle.users,
      currentActor: operator,
      initialCases: [],
      restoreStatus: 'ready',
      storage,
      now: () => currentClock,
      persistUsersWithWorkspace: true,
      buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
        ...basePayload,
        investigationCases: nextCases,
        auditLogs: auditEntry ? [...recordedAudits, auditEntry] : [...recordedAudits],
      }),
      onAuditEntry: (entry) => {
        recordedAudits.push(entry);
      },
      ...extraOptions,
    });
  }

  // 1) Create case at 10:00:00.000Z -> persists both v4 and users
  let hook = renderHook();
  const createOut = hook.createCase({
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-HOOK-01',
  });
  assert.equal(createOut.ok, true);
  assert.equal(createOut.persisted, true);
  assert.equal(recordedAudits.length, 1);
  assert.ok(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  assert.ok(storage.getItem(storageMod.USERS_STORAGE_KEY_V1));

  hook = renderHook();
  assert.equal(hook.cases.length, 1);
  assert.equal(hook.hasUnsavedChanges, false);

  // 2) Backward clock (09:00:00.000Z) & malformed clock on assign/selfAssign -> rejected with 0 audits and 0 storage writes
  const opsBeforeBackward = storage.ops.length;
  currentClock = '2026-11-15T09:00:00.000Z';
  hook = renderHook();
  const backAssignOut = hook.assignInvestigator({
    caseId: 'CASE-HOOK-01',
    assigneeId: inv1.id,
  });
  assert.equal(backAssignOut.ok, false);
  assert.equal(backAssignOut.code, 'TIMESTAMP_OUT_OF_ORDER');

  currentClock = 'invalid-clock-string';
  hook = renderHook();
  const badSelfOut = hook.selfAssign({
    caseId: 'CASE-HOOK-01',
  });
  assert.equal(badSelfOut.ok, false);
  assert.equal(badSelfOut.code, 'INVALID_TIMESTAMP');
  assert.equal(recordedAudits.length, 1);
  assert.equal(storage.ops.length, opsBeforeBackward);

  // 3) Valid clock (10:05:00.000Z), but USERS_STORAGE_KEY_V1 fails with QuotaExceededError ->
  // v4 is rolled back to Open state while in-memory case transitions to Investigating with hasUnsavedChanges: true
  currentClock = '2026-11-15T10:05:00.000Z';
  storage.setFailWriteKeys([storageMod.USERS_STORAGE_KEY_V1]);
  hook = renderHook();
  const assignQuotaFail = hook.assignInvestigator({
    caseId: 'CASE-HOOK-01',
    assigneeId: inv1.id,
  });
  assert.equal(assignQuotaFail.ok, true);
  assert.equal(assignQuotaFail.persisted, false);
  assert.equal(assignQuotaFail.rolledBack, true);
  assert.equal(recordedAudits.length, 2);

  hook = renderHook();
  assert.equal(hook.cases.length, 1);
  assert.equal(hook.cases[0].status, 'Investigating');
  assert.equal(hook.hasUnsavedChanges, true);
  assert.equal(hook.storageError.code, 'STORAGE_WRITE_FAILED');

  // Verify rolled-back v4 in storage still has status === 'Open'
  const rolledBackV4 = JSON.parse(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  assert.equal(rolledBackV4.investigationCases[0].status, 'Open');

  // 4) Clear quota failure and call retryPersist() -> persists both keys, clears error, and does NOT duplicate cases or audits
  storage.setFailWriteKeys([]);
  const retryOut = hook.retryPersist();
  assert.equal(retryOut.ok, true);

  hook = renderHook();
  assert.equal(hook.hasUnsavedChanges, false);
  assert.equal(hook.storageError, null);
  assert.equal(hook.cases.length, 1);
  assert.equal(recordedAudits.length, 2);

  const committedV4 = JSON.parse(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  assert.equal(committedV4.investigationCases.length, 1);
  assert.equal(committedV4.investigationCases[0].status, 'Investigating');
});

