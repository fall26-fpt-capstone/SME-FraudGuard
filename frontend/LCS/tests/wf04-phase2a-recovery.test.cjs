const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
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

function createScriptedStorage(initial = {}, options = {}) {
  const store = new Map(Object.entries(initial));
  const failReadKeys = new Set(options.failReadKeys || []);
  const failWriteKeys = new Set(options.failWriteKeys || []);
  const failRemoveKeys = new Set(options.failRemoveKeys || []);
  const ops = [];

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
      if (failWriteKeys.has(key)) {
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
const defaultTxMod = load('src/data/fraudguard-transactions.ts');
const defaultEntMod = load('src/data/fraudguard-enterprises.ts');
const defaultProjectsMod = load('src/data/fraudguard-projects.ts');
const defaultUsersMod = load('src/data/fraudguard-roles.ts');
const defaultRulesMod = load('src/data/fraudguard-rules.ts');
const { translations } = load('src/config/translations.ts');

const NOW_ISO = '2026-11-16T04:00:00.000Z';

function buildBaseV4Payload() {
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

function setupCommittedButCleanupFailedScenario() {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');

  // Old workspace & users stored before recovery
  const oldPayload = buildBaseV4Payload();
  const oldUsers = bundle.users;
  const oldRawV4 = JSON.stringify(oldPayload);
  const oldRawUsers = JSON.stringify(oldUsers.filter((u) => Boolean(u.enterpriseId)));

  // Distinct NEW committed workspace (added Open case + new audit + updated user name)
  const createNewCase = hookMod.executeCreateCaseAction({
    snapshot: {
      cases: oldPayload.investigationCases,
      enterprises: bundle.enterprises,
      projects: bundle.projects,
      alerts: bundle.transactions,
      legacyArchive: [],
      users: bundle.users,
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-WF04-COMMITTED-NEW',
    note: 'New committed case during recovery',
    at: NOW_ISO,
    now: () => NOW_ISO,
  });
  assert.equal(createNewCase.ok, true);

  const newPayload = {
    ...oldPayload,
    investigationCases: createNewCase.nextCases,
    auditLogs: [createNewCase.auditEntry],
  };
  const newUsers = oldUsers.map((u) =>
    u.id === operator.id ? { ...u, name: 'Lê Minh Quân (Committed New)' } : u
  );

  // Existing pending recovery journal holding raw of OLD workspace & OLD users
  const pendingJournal = {
    version: 1,
    recordedAt: '2026-11-16T03:55:00.000Z',
    operation: 'onboardingSave',
    hadPriorWorkspaceV4: true,
    priorWorkspaceV4Raw: oldRawV4,
    hadPriorUsersV1: true,
    priorUsersV1Raw: oldRawUsers,
  };

  // Both primary keys succeed, only removeItem(WORKSPACE_RECOVERY_JOURNAL_KEY_V4) fails
  const storage = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
    },
    { failRemoveKeys: [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4] }
  );

  const recoverRes = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: 'recovery_required',
    storage,
  });

  const reloaded = storageMod.restoreWorkspaceSnapshot({
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

  return { recoverRes, reloaded, storage, newPayload, newUsers, oldPayload };
}

test('Section 2 & 4.1–4.2 (a): When v4 + users succeed but removeItem(recovery journal) fails, recoverWorkspaceStorage must NOT report ok:true / recoveryRequired:false', () => {
  const { recoverRes, storage } = setupCommittedButCleanupFailedScenario();

  // Journal is still in storage because removeItem failed
  assert.ok(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4));

  // Unmodified code falsely returns ok: true, recoveryRequired: false
  assert.equal(recoverRes.ok, false);
  assert.equal(recoverRes.committed, true);
  assert.equal(recoverRes.cleanupPending, true);
  assert.equal(recoverRes.recoveryRequired, true);
  assert.equal(recoverRes.rolledBack, false);
  assert.equal(recoverRes.rollbackFailed, false);
  assert.equal(recoverRes.errorCode, 'STORAGE_CLEANUP_FAILED');
});

test('Section 2 & 4.1–4.2 (b): Reloading after committed primary writes + journal removeItem failure must load NEW committed workspace & users (never OLD priorWorkspaceV4Raw)', () => {
  const { reloaded } = setupCommittedButCleanupFailedScenario();

  // Unmodified code loads OLD priorWorkspaceV4Raw (missing CASE-WF04-COMMITTED-NEW and renamed operator)
  assert.ok(
    reloaded.payload.investigationCases.some((c) => c.caseId === 'CASE-WF04-COMMITTED-NEW'),
    'Expected reload to preserve newly committed CASE-WF04-COMMITTED-NEW instead of reverting to priorWorkspaceV4Raw'
  );
  assert.equal(
    reloaded.payload.auditLogs.length,
    1,
    'Expected reload to preserve committed audit log'
  );
  const reloadedOp = reloaded.users.find((u) => u.id === 'usr-wf04-op');
  assert.equal(reloadedOp.name, 'Lê Minh Quân (Committed New)');

  assert.equal(reloaded.status, 'recovery_required');
  assert.equal(reloaded.canPersist, false);
  assert.equal(reloaded.cleanupPending, true);
  assert.equal(reloaded.errorCode, 'STORAGE_CLEANUP_FAILED');
});

test('Section 4.3: Retrying cleanup after removeItem fault clears deletes journal without losing committed data and unlocks ready reload (blocking autosave beforehand)', () => {
  const { storage, newPayload, newUsers, reloaded } = setupCommittedButCleanupFailedScenario();

  // Before cleanup retry, autosave (allowRecoveryOverwrite: false) MUST be blocked with STORAGE_CLEANUP_FAILED
  const autosaveBlocked = storageMod.persistWorkspaceAndUsers({
    payload: reloaded.payload,
    users: reloaded.users,
    restoreStatus: 'ready',
    storage,
    operation: 'autosave',
    allowRecoveryOverwrite: false,
  });
  assert.equal(autosaveBlocked.ok, false);
  assert.equal(autosaveBlocked.committed, true);
  assert.equal(autosaveBlocked.cleanupPending, true);
  assert.equal(autosaveBlocked.errorCode, 'STORAGE_CLEANUP_FAILED');

  // Clear removeItem fault and measure ops during matching-digest retry cleanup
  storage.setFailRemoveKeys([]);
  const opCountBefore = storage.ops.length;
  const retryExact = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: reloaded.status,
    storage,
  });
  assert.equal(retryExact.ok, true);
  assert.equal(retryExact.committed, true);
  assert.equal(retryExact.cleanupPending, false);
  assert.equal(retryExact.recoveryRequired, false);
  assert.equal(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);

  // Matching digests during cleanup finish ONLY via removeItem(journal) without rewriting v4/users
  const retryOps = storage.ops.slice(opCountBefore);
  const setItemOpsDuringRetry = retryOps.filter((op) => op.type === 'setItem');
  assert.equal(setItemOpsDuringRetry.length, 0);

  // Reloading after cleanup returns ready & preserves committed data
  const afterReload = storageMod.restoreWorkspaceSnapshot({
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
  assert.equal(afterReload.status, 'ready');
  assert.equal(afterReload.canPersist, true);
  assert.ok(afterReload.payload.investigationCases.some((c) => c.caseId === 'CASE-WF04-COMMITTED-NEW'));
  assert.equal(afterReload.payload.auditLogs.length, 1);
  assert.equal(
    afterReload.users.find((u) => u.id === 'usr-wf04-op').name,
    'Lê Minh Quân (Committed New)'
  );
});

test('Section 4.4: Repeated cleanup retries via useInvestigationCases.retryPersist never duplicate cases, reports, audits, or mutate timestamps', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const basePayload = buildBaseV4Payload();

  // Synchronous hook harness
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

  // Start with a valid committed case in v4, then simulate a later interrupted rollback leaving a pending journal
  const initialCreate = hookMod.executeCreateCaseAction({
    snapshot: {
      cases: [],
      enterprises: bundle.enterprises,
      projects: bundle.projects,
      alerts: bundle.transactions,
      legacyArchive: [],
      users: bundle.users,
    },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-HOOK-REC-01',
    at: '2026-11-16T02:00:00.000Z',
    now: () => '2026-11-16T02:00:00.000Z',
  });
  assert.equal(initialCreate.ok, true);

  // Assign investigator in-memory (will be persisted during retry) with fixed business timestamp
  const assignedAction = hookMod.executeAssignInvestigatorAction({
    snapshot: {
      cases: initialCreate.nextCases,
      enterprises: bundle.enterprises,
      projects: bundle.projects,
      alerts: bundle.transactions,
      legacyArchive: [],
      users: bundle.users,
    },
    actor: operator,
    caseId: 'CASE-HOOK-REC-01',
    assigneeId: inv1.id,
    at: '2026-11-16T02:05:00.000Z',
    now: () => '2026-11-16T02:05:00.000Z',
  });
  assert.equal(assignedAction.ok, true);

  const oldRawV4 = JSON.stringify({
    ...basePayload,
    investigationCases: initialCreate.nextCases,
    auditLogs: [initialCreate.auditEntry],
  });
  const oldRawUsers = JSON.stringify(bundle.users.filter((u) => Boolean(u.enterpriseId)));
  const pendingJournal = {
    version: 1,
    recordedAt: '2026-11-16T02:04:00.000Z',
    operation: 'case_command',
    commitState: 'pending',
    hadPriorWorkspaceV4: true,
    priorWorkspaceV4Raw: oldRawV4,
    hadPriorUsersV1: true,
    priorUsersV1Raw: oldRawUsers,
  };

  const storage = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
    },
    { failRemoveKeys: [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4] }
  );

  const recordedAudits = [initialCreate.auditEntry, assignedAction.auditEntry];
  let restoreStatus = 'recovery_required';
  const currentClock = '2026-11-16T02:10:00.000Z';

  function renderHook() {
    cursor = 0;
    return useInvestigationCases({
      enterprises: bundle.enterprises,
      projects: bundle.projects,
      alerts: bundle.transactions,
      legacyArchive: [],
      users: bundle.users,
      currentActor: operator,
      initialCases: assignedAction.nextCases,
      restoreStatus,
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
    });
  }

  // First retryPersist: v4 & users commit, removeItem fails -> committed: true, cleanupPending: true
  let hook = renderHook();
  const retry1 = hook.retryPersist({ allowRecoveryOverwrite: true, operation: 'retryCleanup' });
  assert.equal(retry1.ok, false);
  assert.equal(retry1.committed, true);
  assert.equal(retry1.cleanupPending, true);
  assert.equal(retry1.recoveryRequired, true);
  assert.equal(retry1.storageError.code, 'STORAGE_CLEANUP_FAILED');

  hook = renderHook();
  assert.equal(hook.committed, true);
  assert.equal(hook.cleanupPending, true);
  assert.equal(hook.hasUnsavedChanges, true);
  assert.equal(hook.lastPersistedCases.length, 1);
  assert.equal(hook.lastPersistedCases[0].status, 'Investigating');

  // Second retry while removeItem STILL fails -> remains committed: true, cleanupPending: true, zero audit/case duplication
  const retry2 = hook.retryPersist({ allowRecoveryOverwrite: true, operation: 'retryCleanup' });
  assert.equal(retry2.ok, false);
  assert.equal(retry2.committed, true);
  assert.equal(retry2.cleanupPending, true);
  assert.equal(recordedAudits.length, 2);

  // Clear removeItem fault and run third retryPersist -> cleans journal cleanly with 0 setItem writes
  storage.setFailRemoveKeys([]);
  const opsBeforeRetry3 = storage.ops.length;
  hook = renderHook();
  const retry3 = hook.retryPersist({ allowRecoveryOverwrite: true, operation: 'retryCleanup' });
  assert.equal(retry3.ok, true);
  assert.equal(retry3.committed, true);
  assert.equal(retry3.cleanupPending, false);
  assert.equal(retry3.recoveryRequired, false);
  assert.equal(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);
  assert.equal(
    storage.ops.slice(opsBeforeRetry3).filter((op) => op.type === 'setItem').length,
    0
  );

  // Fourth repeat retry after cleanup completes is idempotent
  restoreStatus = 'ready';
  hook = renderHook();
  const retry4 = hook.retryPersist({ allowRecoveryOverwrite: true, operation: 'retryPersist' });
  assert.equal(retry4.ok, true);
  assert.equal(retry4.cleanupPending, false);

  hook = renderHook();
  assert.equal(hook.hasUnsavedChanges, false);
  assert.equal(hook.cleanupPending, false);
  assert.equal(hook.cases.length, 1);
  assert.equal(hook.cases[0].caseId, 'CASE-HOOK-REC-01');
  assert.equal(hook.cases[0].createdAt, '2026-11-16T02:00:00.000Z');
  assert.equal(hook.cases[0].assignedAt, '2026-11-16T02:05:00.000Z');
  assert.equal(hook.cases[0].updatedAt, '2026-11-16T02:05:00.000Z');
  assert.equal(recordedAudits.length, 2);

  const storedAfterRetries = JSON.parse(storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  assert.equal(storedAfterRetries.investigationCases.length, 1);
  assert.equal(storedAfterRetries.auditLogs.length, 2);
});

test('Section 4.5: True pending journal and primary/users/rollback failures continue on recovery path without being treated as committed', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const oldPayload = buildBaseV4Payload();
  const newPayload = {
    ...oldPayload,
    rules: [
      ...oldPayload.rules,
      { ...oldPayload.rules[0], id: 'rule-uncommitted-attempt' },
    ],
  };
  const oldRawV4 = JSON.stringify(oldPayload);
  const oldRawUsers = JSON.stringify(bundle.users.filter((u) => Boolean(u.enterpriseId)));
  const pendingJournal = {
    version: 1,
    recordedAt: '2026-11-16T03:00:00.000Z',
    operation: 'onboardingSave',
    commitState: 'pending',
    hadPriorWorkspaceV4: true,
    priorWorkspaceV4Raw: oldRawV4,
    hadPriorUsersV1: true,
    priorUsersV1Raw: oldRawUsers,
  };

  // (a) Reloading a real pending journal loads priorWorkspaceV4Raw (not partial unjournaled v4 in storage)
  const partialRawV4 = JSON.stringify({
    ...oldPayload,
    rules: [...oldPayload.rules, { ...oldPayload.rules[0], id: 'rule-partial-stale' }],
  });
  const storageReloadPending = createScriptedStorage({
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: partialRawV4,
    [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
    [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
  });
  const reloadPending = storageMod.restoreWorkspaceSnapshot({
    storage: storageReloadPending,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(reloadPending.status, 'recovery_required');
  assert.equal(reloadPending.canPersist, false);
  assert.equal(reloadPending.cleanupPending, false);
  assert.equal(reloadPending.errorCode, 'STORAGE_RECOVERY_REQUIRED');
  assert.equal(
    reloadPending.payload.rules.some((r) => r.id === 'rule-partial-stale'),
    false,
    'Expected true pending journal reload to restore priorWorkspaceV4Raw instead of stale partial v4'
  );

  // (b) Workspace write failure during recovery -> committed: false, users & journal intact
  const storageWsFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
    },
    { failWriteKeys: [storageMod.WORKSPACE_STORAGE_KEY_V4] }
  );
  const wsFailRes = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: bundle.users,
    restoreStatus: 'recovery_required',
    storage: storageWsFail,
  });
  assert.equal(wsFailRes.ok, false);
  assert.equal(wsFailRes.committed, false);
  assert.equal(wsFailRes.errorCode, 'STORAGE_WRITE_FAILED');
  assert.equal(storageWsFail.getItem(storageMod.USERS_STORAGE_KEY_V1), oldRawUsers);

  // (c) Users write failure after v4 succeeds during recovery -> rolls back v4 to priorRawV4, committed: false
  const storageUsersFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: partialRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
    },
    { failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1] }
  );
  const usersFailRes = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: bundle.users,
    restoreStatus: 'recovery_required',
    storage: storageUsersFail,
  });
  assert.equal(usersFailRes.ok, false);
  assert.equal(usersFailRes.committed, false);
  assert.equal(usersFailRes.rolledBack, true);
  assert.equal(usersFailRes.recoveryRequired, true);
  assert.equal(storageUsersFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), oldRawV4);

  // (d) Users write fails AND rollback write fails -> STORAGE_ROLLBACK_FAILED, committed: false, pending journal kept
  const storageBothFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(pendingJournal),
    },
    { failWriteKeys: [storageMod.USERS_STORAGE_KEY_V1] }
  );
  // First v4 write succeeds, second v4 write (rollback) fails when both keys are marked failing
  const originalSetItem = storageBothFail.setItem;
  let v4WriteCalls = 0;
  storageBothFail.setItem = (k, v) => {
    if (k === storageMod.WORKSPACE_STORAGE_KEY_V4) {
      v4WriteCalls += 1;
      if (v4WriteCalls >= 2) {
        const err = new Error('Rollback write denied');
        err.name = 'QuotaExceededError';
        throw err;
      }
    }
    return originalSetItem(k, v);
  };
  const doubleFailRes = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: bundle.users,
    restoreStatus: 'recovery_required',
    storage: storageBothFail,
  });
  assert.equal(doubleFailRes.ok, false);
  assert.equal(doubleFailRes.committed, false);
  assert.equal(doubleFailRes.rolledBack, false);
  assert.equal(doubleFailRes.rollbackFailed, true);
  assert.equal(doubleFailRes.recoveryRequired, true);
  assert.equal(doubleFailRes.errorCode, 'STORAGE_ROLLBACK_FAILED');
  assert.equal(
    JSON.parse(storageBothFail.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4)).commitState,
    'pending'
  );
});

test('Section 4.6: Commit-marker write failure rolls back both primary keys, repeated cleanup errors preserve recovery state, and legacy/corrupt journals are handled safely', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const oldPayload = buildBaseV4Payload();
  const oldRawV4 = JSON.stringify(oldPayload);
  const oldRawUsers = JSON.stringify(bundle.users.filter((u) => Boolean(u.enterpriseId)));

  const newPayload = {
    ...oldPayload,
    rules: [...oldPayload.rules, { ...oldPayload.rules[0], id: 'rule-marker-test' }],
  };
  const newUsers = bundle.users.map((u) =>
    u.id === operator.id ? { ...u, name: 'Lê Minh Quân (Marker Test)' } : u
  );

  // (a) Legacy journal (without commitState field) succeeds rollback-compatible load and tests commit-marker write failure
  const legacyPendingJournal = {
    version: 1,
    recordedAt: '2026-11-16T03:10:00.000Z',
    operation: 'legacyRecovery',
    hadPriorWorkspaceV4: true,
    priorWorkspaceV4Raw: oldRawV4,
    hadPriorUsersV1: true,
    priorUsersV1Raw: oldRawUsers,
  };

  // Both v4 and users writes succeed, then writing committed_cleanup_pending marker to journal throws!
  const storageMarkerFail = createScriptedStorage(
    {
      [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
      [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
      [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify(legacyPendingJournal),
    },
    { failWriteKeys: [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4] }
  );

  const markerFailRes = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: 'recovery_required',
    storage: storageMarkerFail,
  });
  assert.equal(markerFailRes.ok, false);
  assert.equal(markerFailRes.committed, false);
  assert.equal(markerFailRes.rolledBack, true);
  assert.equal(markerFailRes.recoveryRequired, true);
  assert.equal(markerFailRes.errorCode, 'STORAGE_WRITE_FAILED');
  // Both primary keys are rolled back to exact prior bytes!
  assert.equal(storageMarkerFail.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4), oldRawV4);
  assert.equal(storageMarkerFail.getItem(storageMod.USERS_STORAGE_KEY_V1), oldRawUsers);

  const reloadAfterMarkerRollback = storageMod.restoreWorkspaceSnapshot({
    storage: storageMarkerFail,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(reloadAfterMarkerRollback.status, 'recovery_required');
  assert.equal(reloadAfterMarkerRollback.cleanupPending, false);
  assert.equal(
    reloadAfterMarkerRollback.payload.rules.some((r) => r.id === 'rule-marker-test'),
    false
  );

  // (b) Repeated cleanup failures followed by eventual recovery
  storageMarkerFail.setFailWriteKeys([]);
  storageMarkerFail.setFailRemoveKeys([storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]);

  const cleanupAttempt1 = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: 'recovery_required',
    storage: storageMarkerFail,
  });
  assert.equal(cleanupAttempt1.ok, false);
  assert.equal(cleanupAttempt1.committed, true);
  assert.equal(cleanupAttempt1.cleanupPending, true);
  assert.equal(cleanupAttempt1.errorCode, 'STORAGE_CLEANUP_FAILED');

  const cleanupAttempt2 = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: 'recovery_required',
    storage: storageMarkerFail,
  });
  assert.equal(cleanupAttempt2.ok, false);
  assert.equal(cleanupAttempt2.committed, true);
  assert.equal(cleanupAttempt2.cleanupPending, true);
  assert.equal(cleanupAttempt2.errorCode, 'STORAGE_CLEANUP_FAILED');

  storageMarkerFail.setFailRemoveKeys([]);
  const cleanupAttempt3 = storageMod.recoverWorkspaceStorage({
    payload: newPayload,
    users: newUsers,
    restoreStatus: 'recovery_required',
    storage: storageMarkerFail,
  });
  assert.equal(cleanupAttempt3.ok, true);
  assert.equal(storageMarkerFail.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);

  // (c) Unknown commitState and digest mismatch immediately lock as blocked_corrupt
  const unknownStateStorage = createScriptedStorage({
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
    [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
    [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify({
      ...legacyPendingJournal,
      commitState: 'unknown_future_state',
    }),
  });
  const unknownRestore = storageMod.restoreWorkspaceSnapshot({
    storage: unknownStateStorage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(unknownRestore.status, 'blocked_corrupt');
  assert.equal(unknownRestore.canPersist, false);
  assert.equal(unknownRestore.errorCode, 'INVALID_WORKSPACE_SHAPE');

  const mismatchDigestStorage = createScriptedStorage({
    [storageMod.WORKSPACE_STORAGE_KEY_V4]: oldRawV4,
    [storageMod.USERS_STORAGE_KEY_V1]: oldRawUsers,
    [storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]: JSON.stringify({
      ...legacyPendingJournal,
      commitState: 'committed_cleanup_pending',
      committedV4Digest: 'sha256:' + '0'.repeat(64),
      committedHasUsers: true,
      committedUsersDigest: 'sha256:' + '1'.repeat(64),
    }),
  });
  const mismatchRestore = storageMod.restoreWorkspaceSnapshot({
    storage: mismatchDigestStorage,
    defaultRules: defaultRulesMod.fraudGuardRules,
    defaultEnterprises: defaultEntMod.demoEnterprises,
    defaultProjects: defaultProjectsMod.initialProjects,
    defaultTransactions: defaultTxMod.fraudGuardTransactions,
    defaultAuditLogs: [],
    defaultUsers: defaultUsersMod.DEMO_USERS,
    extraFallbackEnterprises: wf04Demo.WF04_DEMO_ENTERPRISES,
    migratedAt: NOW_ISO,
  });
  assert.equal(mismatchRestore.status, 'blocked_corrupt');
  assert.equal(mismatchRestore.canPersist, false);
  assert.equal(mismatchRestore.errorCode, 'INVALID_WORKSPACE_SHAPE');
});

test('Section 4.7: Demo restore preserves preDemoSnapshot while uncommitted, finalizes on commit even if journal cleanup fails, and never pulls user back into demo mode on reload', () => {
  const preDemoPayload = buildBaseV4Payload();
  const preDemoUsers = defaultUsersMod.DEMO_USERS;

  const storage = createScriptedStorage();
  const applyRes = wf04Demo.applyAndPersistWf04Demo({
    currentPayload: preDemoPayload,
    currentUsers: preDemoUsers,
    savedAt: NOW_ISO,
    restoreStatus: 'ready',
    storage,
  });
  assert.equal(applyRes.ok, true);
  assert.equal(applyRes.applied, true);
  assert.equal(applyRes.payload.wf04DemoActive, true);
  assert.ok(applyRes.payload.preDemoSnapshot);

  const demoRawV4 = storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4);
  const demoRawUsers = storage.getItem(storageMod.USERS_STORAGE_KEY_V1);

  // 1) Uncommitted failure on users during restoreAndPersistPreDemoWorkspace keeps preDemoSnapshot & wf04DemoActive: true
  storage.setFailWriteKeys([storageMod.USERS_STORAGE_KEY_V1]);
  const uncommittedRestoreFail = wf04Demo.restoreAndPersistPreDemoWorkspace({
    currentPayload: applyRes.payload,
    currentUsers: applyRes.users,
    restoreStatus: 'ready',
    storage,
  });
  assert.equal(uncommittedRestoreFail.ok, false);
  assert.equal(uncommittedRestoreFail.restored, false);
  assert.equal(uncommittedRestoreFail.payload.wf04DemoActive, true);
  assert.ok(uncommittedRestoreFail.payload.preDemoSnapshot);

  // 2) Active pending journal with pendingPreDemoSnapshot: now restoreAndPersistPreDemoWorkspace writes v4 + users cleanly,
  //    but removeItem(journal) fails -> cleanupPending: true with committed restored state (wf04DemoActive: false, preDemoSnapshot: undefined)
  storage.setFailWriteKeys([]);
  storage.setItem(
    storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4,
    JSON.stringify({
      version: 1,
      recordedAt: NOW_ISO,
      operation: 'restorePreDemoWorkspace',
      commitState: 'pending',
      hadPriorWorkspaceV4: true,
      priorWorkspaceV4Raw: demoRawV4,
      hadPriorUsersV1: true,
      priorUsersV1Raw: demoRawUsers,
      pendingPreDemoSnapshot: applyRes.payload.preDemoSnapshot,
    })
  );
  storage.setFailRemoveKeys([storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]);

  const committedCleanupFail = wf04Demo.restoreAndPersistPreDemoWorkspace({
    currentPayload: applyRes.payload,
    currentUsers: applyRes.users,
    restoreStatus: 'recovery_required',
    storage,
    allowRecoveryOverwrite: true,
  });

  assert.equal(committedCleanupFail.ok, false);
  assert.equal(committedCleanupFail.committed, true);
  assert.equal(committedCleanupFail.cleanupPending, true);
  assert.equal(committedCleanupFail.recoveryRequired, true);
  assert.equal(committedCleanupFail.errorCode, 'STORAGE_CLEANUP_FAILED');
  assert.equal(committedCleanupFail.restored, true);
  assert.equal(committedCleanupFail.preservePreDemoSnapshot, undefined);
  assert.equal(committedCleanupFail.payload.wf04DemoActive, false);
  assert.equal(committedCleanupFail.payload.preDemoSnapshot, undefined);
  assert.equal(committedCleanupFail.users.length, preDemoUsers.length);

  // Reloading must NOT pull user back into wf04DemoActive: true or re-attach pendingPreDemoSnapshot
  const reloadedCleanupFail = storageMod.restoreWorkspaceSnapshot({
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
  assert.equal(reloadedCleanupFail.status, 'recovery_required');
  assert.equal(reloadedCleanupFail.canPersist, false);
  assert.equal(reloadedCleanupFail.cleanupPending, true);
  assert.equal(reloadedCleanupFail.errorCode, 'STORAGE_CLEANUP_FAILED');
  assert.equal(reloadedCleanupFail.payload.wf04DemoActive, false);
  assert.equal(reloadedCleanupFail.payload.preDemoSnapshot, undefined);
  assert.equal(reloadedCleanupFail.users.length, preDemoUsers.length);

  // Clear removeItem fault and retry cleanup -> clears journal and subsequent reload is ready & restored
  storage.setFailRemoveKeys([]);
  const finalCleanup = storageMod.recoverWorkspaceStorage({
    payload: committedCleanupFail.payload,
    users: committedCleanupFail.users,
    restoreStatus: reloadedCleanupFail.status,
    storage,
  });
  assert.equal(finalCleanup.ok, true);
  assert.equal(finalCleanup.cleanupPending, false);
  assert.equal(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);

  const finalReload = storageMod.restoreWorkspaceSnapshot({
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
  assert.equal(finalReload.status, 'ready');
  assert.equal(finalReload.canPersist, true);
  assert.equal(finalReload.payload.wf04DemoActive, false);
  assert.equal(finalReload.payload.preDemoSnapshot, undefined);

  // Verify cleanup UI translation keys are present in both VI and EN with zero em dashes
  for (const lang of ['vi', 'en']) {
    const storageCopy = translations[lang].wf04Phase2a.storage;
    assert.ok(storageCopy.cleanupRequired && !storageCopy.cleanupRequired.includes('\u2014'));
    assert.ok(storageCopy.cleanupPendingBadge && !storageCopy.cleanupPendingBadge.includes('\u2014'));
    assert.ok(storageCopy.retryCleanupBtn && !storageCopy.retryCleanupBtn.includes('\u2014'));
  }
});
