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
        return new Proxy(
          {},
          {
            get: (_, prop) => {
              if (prop === '__esModule' || prop === 'then' || typeof prop === 'symbol') {
                return undefined;
              }
              return String(prop);
            },
          }
        );
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

/**
 * Lightweight synchronous React hook harness supporting nested function components
 * so real CasesView + CaseReportWorkflowPanel handlers, effects, drafts, and role switches
 * can be exercised without browser DOM dependencies.
 */
function createStatefulCasesUiHarness(initialProps, lang = 'vi') {
  const instances = new Map();
  let activeInstance = null;
  let hookCursor = 0;
  let pendingEffects = [];
  let dirty = false;
  const toasts = [];

  const FRAGMENT = Symbol('Fragment');
  function createEl(type, props, key) {
    return { type, props: props || {}, key };
  }

  const jsxRuntime = {
    Fragment: FRAGMENT,
    jsx: createEl,
    jsxs: createEl,
  };

  function getInstance(instKey) {
    let inst = instances.get(instKey);
    if (!inst) {
      inst = { slots: [], effectDeps: [] };
      instances.set(instKey, inst);
    }
    return inst;
  }

  function depsChanged(prev, next) {
    if (!prev || !next || prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i += 1) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  const mockReact = {
    Fragment: FRAGMENT,
    useState(initial) {
      const inst = activeInstance;
      const idx = hookCursor++;
      if (!(idx in inst.slots)) {
        inst.slots[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (updater) => {
        const next = typeof updater === 'function' ? updater(inst.slots[idx]) : updater;
        if (!Object.is(next, inst.slots[idx])) {
          inst.slots[idx] = next;
          dirty = true;
        }
      };
      return [inst.slots[idx], setState];
    },
    useReducer(reducer, initArg, initFn) {
      const inst = activeInstance;
      const idx = hookCursor++;
      if (!(idx in inst.slots)) {
        inst.slots[idx] = initFn ? initFn(initArg) : initArg;
      }
      const dispatch = (action) => {
        const next = reducer(inst.slots[idx], action);
        if (!Object.is(next, inst.slots[idx])) {
          inst.slots[idx] = next;
          dirty = true;
        }
      };
      return [inst.slots[idx], dispatch];
    },
    useRef(initial) {
      const inst = activeInstance;
      const idx = hookCursor++;
      if (!(idx in inst.slots)) {
        inst.slots[idx] = { current: initial };
      }
      return inst.slots[idx];
    },
    useMemo(factory, deps) {
      const inst = activeInstance;
      const idx = hookCursor++;
      const entry = inst.slots[idx];
      if (!entry || depsChanged(entry.deps, deps)) {
        const value = factory();
        inst.slots[idx] = { value, deps };
        return value;
      }
      return entry.value;
    },
    useCallback(fn, deps) {
      return mockReact.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const inst = activeInstance;
      const idx = hookCursor++;
      const prev = inst.effectDeps[idx];
      if (deps === undefined || depsChanged(prev, deps)) {
        inst.effectDeps[idx] = deps;
        pendingEffects.push(fn);
      }
    },
  };

  const statefulImports = {
    react: mockReact,
    'react/jsx-runtime': jsxRuntime,
    '@/context/LanguageContext': {
      useLanguage: () => ({
        language: lang,
        t: translations[lang],
        setLanguage() {},
      }),
    },
    '@/context/ToastProvider': {
      useToast: () => ({
        toast: (...args) => toasts.push(args),
      }),
    },
    '@/hooks/useDialogFocus': {
      useDialogFocus: () => ({ current: null }),
    },
  };

  const { CasesView } = load('src/components/fraudguard-dashboard/CasesView.tsx', statefulImports);

  let currentProps = { ...initialProps };
  let renderedTree = null;

  function expandNode(node, instPath, visitedKeys) {
    if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => expandNode(child, `${instPath}[${idx}]`, visitedKeys));
    }
    if (typeof node.type === 'function') {
      const compName = node.type.name || 'Anon';
      const compKey = `${instPath}/${compName}${node.key !== undefined ? `#${String(node.key)}` : ''}`;
      visitedKeys.add(compKey);
      const prevInst = activeInstance;
      const prevCursor = hookCursor;
      activeInstance = getInstance(compKey);
      hookCursor = 0;
      const out = node.type(node.props);
      activeInstance = prevInst;
      hookCursor = prevCursor;
      return expandNode(out, compKey, visitedKeys);
    }
    if (node.props && 'children' in node.props) {
      return {
        ...node,
        props: {
          ...node.props,
          children: expandNode(node.props.children, instPath, visitedKeys),
        },
      };
    }
    return node;
  }

  function render() {
    for (let pass = 0; pass < 12; pass += 1) {
      dirty = false;
      pendingEffects = [];
      const visitedKeys = new Set();
      renderedTree = expandNode(createEl(CasesView, currentProps), 'root', visitedKeys);
      for (const existingKey of Array.from(instances.keys())) {
        if (!visitedKeys.has(existingKey)) {
          instances.delete(existingKey);
        }
      }
      for (const eff of pendingEffects) {
        eff();
      }
      if (!dirty) return renderedTree;
    }
    throw new Error('Stateful UI harness did not settle within 12 passes');
  }

  function findAll(predicate) {
    const hits = [];
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (predicate(n)) hits.push(n);
      if (n.props && 'children' in n.props) walk(n.props.children);
    }
    walk(renderedTree);
    return hits;
  }

  function getText(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getText).join(' ');
    if (node.props && 'children' in node.props) return getText(node.props.children);
    return '';
  }

  function findButtonByText(textFragment) {
    return findAll(
      (n) => n.type === 'button' && getText(n).includes(textFragment)
    )[0];
  }

  function findById(id) {
    return findAll((n) => n.props && n.props.id === id)[0];
  }

  function clickButton(textFragment) {
    const btn = findButtonByText(textFragment);
    assert.ok(btn, `Expected button containing "${textFragment}"`);
    assert.ok(!btn.props.disabled, `Button "${textFragment}" must not be disabled`);
    btn.props.onClick();
    return render();
  }

  function clickByAriaLabel(labelText) {
    const btn = findAll((n) => n.type === 'button' && n.props['aria-label'] === labelText)[0];
    assert.ok(btn, `Expected button with aria-label "${labelText}"`);
    btn.props.onClick();
    return render();
  }

  function changeById(id, value) {
    const el = findById(id);
    assert.ok(el, `Expected element #${id}`);
    el.props.onChange({ target: { value } });
    return render();
  }

  function updateProps(patch) {
    currentProps = { ...currentProps, ...patch };
    return render();
  }

  render();
  return {
    render,
    updateProps,
    findAll,
    findById,
    findButtonByText,
    clickButton,
    clickByAriaLabel,
    changeById,
    getFullText: () => getText(renderedTree),
    toasts,
  };
}

function createInvestigationHookHarness(options = {}) {
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

  return function renderHook(overrideOptions = {}) {
    cursor = 0;
    return useInvestigationCases({
      ...options,
      ...overrideOptions,
    });
  };
}

const wf04Demo = load('src/data/wf04-demo.ts');
const migration = load('src/utils/case-migration.ts');
const storageMod = load('src/utils/workspace-storage.ts');
const hookMod = load('src/hooks/useInvestigationCases.ts');
const enterpriseMod = load('src/utils/enterprise.ts');
const permissionsMod = load('src/utils/permissions.ts');
const notificationMod = load('src/utils/notification-feed.ts');
const platformSummaryMod = load('src/utils/platform-summary.ts');
const exportCsvMod = load('src/utils/export-csv.ts');
const caseDomain = load('src/utils/investigation-case.ts');
const defaultTxMod = load('src/data/fraudguard-transactions.ts');
const defaultEntMod = load('src/data/fraudguard-enterprises.ts');
const defaultProjectsMod = load('src/data/fraudguard-projects.ts');
const defaultUsersMod = load('src/data/fraudguard-roles.ts');
const defaultRulesMod = load('src/data/fraudguard-rules.ts');

const uiImportsVi = createUiImports('vi');
const uiImportsEn = createUiImports('en');
const { CasesView: CasesViewVi } = load('src/components/fraudguard-dashboard/CasesView.tsx', uiImportsVi);
const { CaseReportWorkflowPanel: PanelVi, buildReportDraftScopeKey, buildReportDraftBaseline, isReportDraftDirty } = load(
  'src/components/fraudguard-dashboard/CaseReportWorkflowPanel.tsx',
  uiImportsVi
);
const { ReportsView: ReportsViewVi } = load('src/components/fraudguard-dashboard/ReportsView.tsx', uiImportsVi);
const { AlertCaseDrawer: AlertCaseDrawerVi } = load('src/components/fraudguard-dashboard/AlertCaseDrawer.tsx', uiImportsVi);
const { AuditTrailView: AuditTrailViewVi } = load('src/components/fraudguard-dashboard/AuditTrailView.tsx', uiImportsVi);
const { AuditTrailView: AuditTrailViewEn } = load('src/components/fraudguard-dashboard/AuditTrailView.tsx', uiImportsEn);
const LoadingModule = load('src/app/fraud-monitoring/loading.tsx');

const NOW_ISO = '2026-11-16T10:00:00.000Z';

function buildBaseV4Payload(bundle) {
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
    wf04DemoActive: false,
  };
}

test('Section 8.1: Assigned Investigator authors distinct per-alert findings on multi-alert case, submits v1 via coordinator + UI panel -> Pending Review, and preserves v1 + single audit across reload', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T08:00:00.000Z';

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  // Create 3-alert Open case and assign to inv1 as Operator
  let hook = renderHook({ currentActor: operator });
  const created = hook.createCase({
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02', 'ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-2B-MULTI-01',
  });
  assert.equal(created.ok, true);

  clock = '2026-11-16T08:10:00.000Z';
  hook = renderHook({ currentActor: operator });
  const assigned = hook.assignInvestigator({
    caseId: 'CASE-2B-MULTI-01',
    assigneeId: inv1.id,
  });
  assert.equal(assigned.ok, true);

  // Render real CasesView + CaseReportWorkflowPanel as assigned Investigator, enter distinct results & submit
  clock = '2026-11-16T08:30:00.000Z';
  hook = renderHook({ currentActor: inv1 });
  const ui = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: inv1,
    selectedCaseId: 'CASE-2B-MULTI-01',
    onSubmitReport: (args) => {
      const out = hook.submitReport(args);
      if (out.ok) {
        hook = renderHook({ currentActor: inv1 });
        ui.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
  });

  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-01', 'Bất thường thực: tủ HVAC tầng 1 chạy 68 kWh ngoài giờ');
  ui.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-01', 'Nhật ký công tơ M-A1 lúc 23:15');
  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-02', 'Dương tính giả: chạy bơm bù áp bảo trì có phê duyệt');
  ui.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-02', 'Phiếu bảo trì #B-2026-11 ngày 13/11');
  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-03', 'Cần theo dõi thêm: lệch pha nhẹ tủ phòng lab');
  ui.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-03', 'Biên bản đo kẹp dòng pha B/C');
  ui.changeById('wf04-report-summary', 'Tổng hợp điều tra 3 cảnh báo Campus: 1 bất thường HVAC thực, 1 bảo trì hợp lệ, 1 lệch pha theo dõi.');

  ui.clickButton(translations.vi.wf04Phase2b.reportForm.submitReportBtn);

  hook = renderHook({ currentActor: inv1 });
  assert.equal(hook.cases.length, 1);
  const c = hook.cases[0];
  assert.equal(c.status, 'Pending Review');
  assert.equal(c.reports.length, 1);
  assert.equal(c.reports[0].version, 1);
  assert.equal(c.pendingReviewReportId, c.reports[0].reportId);
  assert.equal(c.pendingReviewReportVersion, 1);
  assert.equal(c.reports[0].submittedAt, '2026-11-16T08:30:00.000Z');
  assert.equal(c.reports[0].alertResults.length, 3);
  assert.equal(
    c.reports[0].alertResults.find((r) => r.alertId === 'ALT-WF04-CAMPUS-01').resultText,
    'Bất thường thực: tủ HVAC tầng 1 chạy 68 kWh ngoài giờ'
  );
  assert.equal(
    c.reports[0].alertResults.find((r) => r.alertId === 'ALT-WF04-CAMPUS-02').resultText,
    'Dương tính giả: chạy bơm bù áp bảo trì có phê duyệt'
  );
  assert.equal(audits.filter((a) => a.action === 'REPORT_SUBMITTED').length, 1);
  assert.equal(c.history.filter((e) => e.type === 'REPORT_SUBMITTED').length, 1);

  // Reload from storage and verify v1 & single audit survive reload intact
  const restored = storageMod.restoreWorkspaceSnapshot({
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
  assert.equal(restored.status, 'ready');
  const reloadedCase = restored.payload.investigationCases.find((item) => item.caseId === 'CASE-2B-MULTI-01');
  assert.ok(reloadedCase);
  assert.equal(reloadedCase.status, 'Pending Review');
  assert.equal(reloadedCase.reports.length, 1);
  assert.equal(reloadedCase.reports[0].version, 1);
  assert.equal(reloadedCase.reports[0].alertResults.length, 3);
  assert.equal(
    restored.payload.auditLogs.filter((a) => a.action === 'REPORT_SUBMITTED').length,
    1
  );
});

test('Section 8.2: Missing summary/result/evidence or missing/extra/duplicate alert items are rejected without mutating state/storage or wiping UI draft', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => NOW_ISO,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  let hook = renderHook({ currentActor: operator });
  assert.equal(
    hook.createCase({ alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'], caseId: 'CASE-2B-VAL-01' }).ok,
    true
  );
  hook = renderHook({ currentActor: operator });
  assert.equal(hook.assignInvestigator({ caseId: 'CASE-2B-VAL-01', assigneeId: inv1.id }).ok, true);

  hook = renderHook({ currentActor: inv1 });
  const beforeOps = storage.ops.length;
  const beforeAudits = audits.length;

  // Coordinator/domain checks for all malformed payload shapes
  const badSubmissions = [
    {
      expectedCode: 'MISSING_REPORT_SUMMARY',
      summary: '   ',
      alertResults: [
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'OK', evidence: 'Ev1' },
        { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'OK', evidence: 'Ev2' },
      ],
    },
    {
      expectedCode: 'MISSING_ALERT_RESULT',
      summary: 'Valid summary',
      alertResults: [
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: '  ', evidence: 'Ev1' },
        { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'OK', evidence: 'Ev2' },
      ],
    },
    {
      expectedCode: 'MISSING_ALERT_EVIDENCE',
      summary: 'Valid summary',
      alertResults: [
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'OK', evidence: 'Ev1' },
        { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'OK', evidence: '  ' },
      ],
    },
    {
      expectedCode: 'MISSING_REPORT_ALERT',
      summary: 'Valid summary',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'OK', evidence: 'Ev1' }],
    },
    {
      expectedCode: 'EXTRA_REPORT_ALERT',
      summary: 'Valid summary',
      alertResults: [
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'OK', evidence: 'Ev1' },
        { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'OK', evidence: 'Ev2' },
        { alertId: 'ALT-WF04-CAMPUS-03', resultText: 'Extra', evidence: 'Ev3' },
      ],
    },
    {
      expectedCode: 'DUPLICATE_REPORT_ALERT',
      summary: 'Valid summary',
      alertResults: [
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'OK', evidence: 'Ev1' },
        { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Dup', evidence: 'Ev1b' },
      ],
    },
  ];

  for (const item of badSubmissions) {
    const out = hook.submitReport({
      caseId: 'CASE-2B-VAL-01',
      summary: item.summary,
      alertResults: item.alertResults,
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, item.expectedCode);
  }
  assert.equal(storage.ops.length, beforeOps);
  assert.equal(audits.length, beforeAudits);
  assert.equal(hook.cases[0].status, 'Investigating');
  assert.equal(hook.cases[0].reports.length, 0);

  // Stateful UI validation: partial input shows field-level errors and preserves entered text
  let submitCalls = 0;
  const ui = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: inv1,
    selectedCaseId: 'CASE-2B-VAL-01',
    onSubmitReport: () => {
      submitCalls += 1;
      return { ok: false, code: 'MISSING_REPORT_SUMMARY', error: 'err' };
    },
  });

  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-01', 'Đã nhập dở phần kết quả 01');
  // Leave evidence for 01, alert 02 fields, and summary blank -> click Submit
  ui.clickButton(translations.vi.wf04Phase2b.reportForm.submitReportBtn);

  assert.equal(submitCalls, 0, 'Client field validation must prevent invalid submit without wiping inputs');
  const fullText = ui.getFullText();
  assert.match(fullText, new RegExp(translations.vi.wf04Phase2b.reportForm.evidenceRequiredError));
  assert.match(fullText, new RegExp(translations.vi.wf04Phase2b.reportForm.resultRequiredError));
  assert.match(fullText, new RegExp(translations.vi.wf04Phase2b.reportForm.summaryRequiredError));
  // Entered draft text stays preserved inside the textarea
  assert.equal(ui.findById('wf04-alert-result-ALT-WF04-CAMPUS-01').props.value, 'Đã nhập dở phần kết quả 01');
});

test('Section 8.3: Revision request with mandatory reason returns Pending Review -> Investigating, preserves immutable v1 + reason callout, and resubmit creates v2', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T09:00:00.000Z';

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  let hook = renderHook({ currentActor: operator });
  hook.createCase({ alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'], caseId: 'CASE-2B-REV-01' });
  clock = '2026-11-16T09:05:00.000Z';
  hook = renderHook({ currentActor: operator });
  hook.assignInvestigator({ caseId: 'CASE-2B-REV-01', assigneeId: inv1.id });
  clock = '2026-11-16T09:10:00.000Z';
  hook = renderHook({ currentActor: inv1 });
  const sub1 = hook.submitReport({
    caseId: 'CASE-2B-REV-01',
    summary: 'Bản nháp báo cáo v1',
    alertResults: [
      { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Nghi vấn ban đầu', evidence: 'Log v1' },
      { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'Chưa rõ bảo trì', evidence: 'Phiếu tạm' },
    ],
  });
  assert.equal(sub1.ok, true);
  const v1Report = Object.freeze(structuredClone(sub1.investigationCase.reports[0]));

  // Operator opens Pending Review in UI -> tries blank revision reason -> blocked with inline error
  clock = '2026-11-16T09:20:00.000Z';
  hook = renderHook({ currentActor: operator });
  const opUi = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: operator,
    selectedCaseId: 'CASE-2B-REV-01',
    onRequestRevision: (args) => {
      const out = hook.requestRevision(args);
      if (out.ok) {
        hook = renderHook({ currentActor: operator });
        opUi.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
  });

  // Also check blank reason via coordinator directly
  const blankRevRes = hook.requestRevision({
    caseId: 'CASE-2B-REV-01',
    reason: '   ',
    expectedReportId: v1Report.reportId,
    expectedReportVersion: 1,
  });
  assert.equal(blankRevRes.ok, false);
  assert.equal(blankRevRes.code, 'MISSING_REVISION_REASON');

  opUi.clickButton(translations.vi.wf04Phase2b.revisionForm.openRevisionBtn);
  opUi.changeById('wf04-revision-reason', '   ');
  opUi.clickButton(translations.vi.wf04Phase2b.revisionForm.submitRevisionBtn);
  assert.match(opUi.getFullText(), new RegExp(translations.vi.wf04Phase2b.revisionForm.reasonRequiredError));

  // Valid non-whitespace revision reason transitions Pending Review -> Investigating
  opUi.changeById('wf04-revision-reason', 'Cần bổ sung số liệu công tơ 15 phút và ảnh đối chiếu bảo trì.');
  opUi.clickButton(translations.vi.wf04Phase2b.revisionForm.submitRevisionBtn);

  hook = renderHook({ currentActor: inv1 });
  const afterRevCase = hook.cases[0];
  assert.equal(afterRevCase.status, 'Investigating');
  assert.equal(afterRevCase.reports.length, 1);
  assert.deepEqual(afterRevCase.reports[0], v1Report, 'v1 report must remain immutable');
  assert.equal(afterRevCase.history.filter((e) => e.type === 'REVISION_REQUESTED').length, 1);
  assert.equal(
    afterRevCase.history.find((e) => e.type === 'REVISION_REQUESTED').reason,
    'Cần bổ sung số liệu công tơ 15 phút và ảnh đối chiếu bảo trì.'
  );
  assert.equal(audits.filter((a) => a.action === 'REVISION_REQUESTED').length, 1);

  // Investigator opens revision form: callout displays reason + pre-fills baseline from v1 without mutating v1 -> submits v2
  const baseline = buildReportDraftBaseline(afterRevCase);
  assert.equal(baseline.summary, 'Bản nháp báo cáo v1');

  clock = '2026-11-16T09:35:00.000Z';
  const invUi = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: inv1,
    selectedCaseId: 'CASE-2B-REV-01',
    onSubmitReport: (args) => {
      const out = hook.submitReport(args);
      if (out.ok) {
        hook = renderHook({ currentActor: inv1 });
        invUi.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
  });
  assert.match(
    invUi.getFullText(),
    /Cần bổ sung số liệu công tơ 15 phút và ảnh đối chiếu bảo trì\./
  );
  invUi.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-02', 'Phiếu #B-2026-11 + biên bản bàn giao đã ký');
  invUi.changeById('wf04-report-summary', 'Báo cáo v2 đầy đủ chứng từ 15 phút và xác nhận bảo trì');
  invUi.clickButton(translations.vi.wf04Phase2b.reportForm.resubmitReportBtn);

  hook = renderHook({ currentActor: inv1 });
  const afterV2Case = hook.cases[0];
  assert.equal(afterV2Case.status, 'Pending Review');
  assert.equal(afterV2Case.reports.length, 2);
  assert.deepEqual(afterV2Case.reports[0], v1Report, 'v1 report must remain untouched after v2');
  assert.equal(afterV2Case.reports[1].version, 2);
  assert.equal(afterV2Case.pendingReviewReportId, afterV2Case.reports[1].reportId);
  assert.equal(afterV2Case.pendingReviewReportVersion, 2);
});

test('Section 8.4: Confirm & Close accepts only active v2 reportId/reportVersion, preserves distinct per-alert results, and rejects stale/missing v1 callbacks in both revision and confirm', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T08:00:00.000Z';

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  let hook = renderHook({ currentActor: operator });
  hook.createCase({ alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'], caseId: 'CASE-2B-CONF-01' });
  clock = '2026-11-16T08:05:00.000Z';
  hook = renderHook({ currentActor: operator });
  hook.assignInvestigator({ caseId: 'CASE-2B-CONF-01', assigneeId: inv1.id });
  clock = '2026-11-16T08:10:00.000Z';
  hook = renderHook({ currentActor: inv1 });
  const r1 = hook.submitReport({
    caseId: 'CASE-2B-CONF-01',
    summary: 'v1 summary',
    alertResults: [
      { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'v1 res 1', evidence: 'v1 ev 1' },
      { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'v1 res 2', evidence: 'v1 ev 2' },
    ],
  });
  clock = '2026-11-16T08:15:00.000Z';
  hook = renderHook({ currentActor: operator });
  hook.requestRevision({
    caseId: 'CASE-2B-CONF-01',
    reason: 'Cập nhật v2',
    expectedReportId: r1.investigationCase.reports[0].reportId,
    expectedReportVersion: 1,
  });
  clock = '2026-11-16T08:20:00.000Z';
  hook = renderHook({ currentActor: inv1 });
  const r2 = hook.submitReport({
    caseId: 'CASE-2B-CONF-01',
    summary: 'v2 summary đầy đủ',
    alertResults: [
      { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Gian lận xác nhận HVAC', evidence: 'v2 ev 1' },
      { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'Cảnh báo giả do bảo trì', evidence: 'v2 ev 2' },
    ],
  });
  const v1Rep = r2.investigationCase.reports[0];
  const v2Rep = r2.investigationCase.reports[1];

  // Stale v1 revision callback and missing version/id checks
  hook = renderHook({ currentActor: operator });
  const beforeOps = storage.ops.length;
  const staleRevByV1Id = hook.requestRevision({
    caseId: 'CASE-2B-CONF-01',
    reason: 'Old callback from v1',
    expectedReportId: v1Rep.reportId,
    expectedReportVersion: 1,
  });
  assert.equal(staleRevByV1Id.ok, false);
  assert.equal(staleRevByV1Id.code, 'STALE_REPORT_VERSION');

  const staleRevByWrongVer = hook.requestRevision({
    caseId: 'CASE-2B-CONF-01',
    reason: 'Wrong version',
    expectedReportId: v2Rep.reportId,
    expectedReportVersion: 1,
  });
  assert.equal(staleRevByWrongVer.ok, false);
  assert.equal(staleRevByWrongVer.code, 'STALE_REPORT_VERSION');

  const missingRevVer = hook.requestRevision({
    caseId: 'CASE-2B-CONF-01',
    reason: 'Missing version',
    expectedReportId: v2Rep.reportId,
    expectedReportVersion: undefined,
  });
  assert.equal(missingRevVer.ok, false);
  assert.equal(missingRevVer.code, 'MISSING_REPORT_VERSION');

  // Stale v1 confirm callback, mismatched version, and missing version are rejected
  const staleConfirmV1 = hook.confirmAndCloseReport({
    caseId: 'CASE-2B-CONF-01',
    reportId: v1Rep.reportId,
    reportVersion: 1,
  });
  assert.equal(staleConfirmV1.ok, false);
  assert.equal(staleConfirmV1.code, 'STALE_REPORT_VERSION');

  const mismatchConfirmVer = hook.confirmAndCloseReport({
    caseId: 'CASE-2B-CONF-01',
    reportId: v2Rep.reportId,
    reportVersion: 99,
  });
  assert.equal(mismatchConfirmVer.ok, false);
  assert.equal(mismatchConfirmVer.code, 'REPORT_VERSION_MISMATCH');

  const missingConfirmVer = hook.confirmAndCloseReport({
    caseId: 'CASE-2B-CONF-01',
    reportId: v2Rep.reportId,
    reportVersion: undefined,
  });
  assert.equal(missingConfirmVer.ok, false);
  assert.equal(missingConfirmVer.code, 'MISSING_REPORT_VERSION');
  assert.equal(storage.ops.length, beforeOps);

  // Valid Confirm & Close in UI on displayed v2 -> transitions Pending Review -> Closed cleanly
  clock = '2026-11-16T08:30:00.000Z';
  const ui = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: operator,
    selectedCaseId: 'CASE-2B-CONF-01',
    onConfirmAndCloseReport: (args) => {
      const out = hook.confirmAndCloseReport(args);
      if (out.ok) {
        hook = renderHook({ currentActor: operator });
        ui.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
  });

  ui.clickButton(translations.vi.wf04Phase2b.confirmClose.openConfirmStepBtn);
  assert.match(ui.getFullText(), new RegExp(v2Rep.reportId));
  ui.changeById('wf04-final-summary', 'Kết luận chính thức v2: truy thu HVAC, loại trừ bảo trì.');
  ui.clickButton(translations.vi.wf04Phase2b.confirmClose.confirmAndCloseBtn);

  hook = renderHook({ currentActor: operator });
  const closed = hook.cases[0];
  assert.equal(closed.status, 'Closed');
  assert.equal(closed.closedAt, '2026-11-16T08:30:00.000Z');
  assert.equal(closed.conclusion.reportId, v2Rep.reportId);
  assert.equal(closed.conclusion.reportVersion, 2);
  assert.equal(closed.conclusion.summary, 'Kết luận chính thức v2: truy thu HVAC, loại trừ bảo trì.');
  assert.equal(
    closed.conclusion.alertResults.find((a) => a.alertId === 'ALT-WF04-CAMPUS-01').resultText,
    'Gian lận xác nhận HVAC'
  );
  assert.equal(
    closed.conclusion.alertResults.find((a) => a.alertId === 'ALT-WF04-CAMPUS-02').resultText,
    'Cảnh báo giả do bảo trì'
  );
  assert.equal(audits.filter((a) => a.action === 'REPORT_CONFIRMED_AND_CLOSED').length, 1);

  // Closed UI renders read-only conclusion with zero confirm/revision/submit actions
  const closedText = ui.getFullText();
  assert.match(closedText, new RegExp(translations.vi.wf04Phase2b.confirmClose.closedBannerTitle));
  assert.equal(ui.findButtonByText(translations.vi.wf04Phase2b.confirmClose.openConfirmStepBtn), undefined);
  assert.equal(ui.findButtonByText(translations.vi.wf04Phase2b.revisionForm.openRevisionBtn), undefined);
  assert.equal(ui.findButtonByText(translations.vi.wf04Phase2b.reportForm.submitReportBtn), undefined);
});

test('Section 8.5: Same Operator self-investigates, submits report, and confirms/closes as two distinct steps without direct closing or combined button', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T10:00:00.000Z';

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  let hook = renderHook({ currentActor: operator });
  hook.createCase({ alertIds: ['ALT-WF04-CAMPUS-01'], caseId: 'CASE-2B-SELF-01' });
  clock = '2026-11-16T10:05:00.000Z';
  hook = renderHook({ currentActor: operator });
  const selfAss = hook.selfAssign({ caseId: 'CASE-2B-SELF-01' });
  assert.equal(selfAss.ok, true);

  // Confirming directly from Investigating BEFORE submitting report MUST fail
  hook = renderHook({ currentActor: operator });
  const directCloseAttempt = hook.confirmAndCloseReport({
    caseId: 'CASE-2B-SELF-01',
    reportId: 'RPT-NONE',
    reportVersion: 1,
  });
  assert.equal(directCloseAttempt.ok, false);
  assert.equal(directCloseAttempt.code, 'INVALID_STATE');

  // While Investigating as self-assigned Operator: UI shows two-step hint and ONLY Submit button (no Confirm & Close button)
  const ui = createStatefulCasesUiHarness({
    investigationCases: hook.cases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: operator,
    selectedCaseId: 'CASE-2B-SELF-01',
    onSubmitReport: (args) => {
      const out = hook.submitReport(args);
      if (out.ok) {
        hook = renderHook({ currentActor: operator });
        ui.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
    onConfirmAndCloseReport: (args) => {
      const out = hook.confirmAndCloseReport(args);
      if (out.ok) {
        hook = renderHook({ currentActor: operator });
        ui.updateProps({ investigationCases: hook.cases });
      }
      return out;
    },
  });

  assert.match(ui.getFullText(), new RegExp(translations.vi.wf04Phase2b.confirmClose.selfInvestigationTwoStepHint));
  assert.equal(ui.findButtonByText(translations.vi.wf04Phase2b.confirmClose.openConfirmStepBtn), undefined);

  // Step 1: Submit report -> moves to Pending Review
  clock = '2026-11-16T10:15:00.000Z';
  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-01', 'Tự điều tra xác nhận bất thường HVAC');
  ui.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-01', 'Kiểm tra công tơ trực tiếp');
  ui.changeById('wf04-report-summary', 'Báo cáo tự điều tra hoàn chỉnh');
  ui.clickButton(translations.vi.wf04Phase2b.reportForm.submitReportBtn);

  hook = renderHook({ currentActor: operator });
  assert.equal(hook.cases[0].status, 'Pending Review');

  // Step 2: Confirm & Close at distinct later timestamp
  clock = '2026-11-16T10:25:00.000Z';
  ui.clickButton(translations.vi.wf04Phase2b.confirmClose.openConfirmStepBtn);
  ui.clickButton(translations.vi.wf04Phase2b.confirmClose.confirmAndCloseBtn);

  hook = renderHook({ currentActor: operator });
  const closed = hook.cases[0];
  assert.equal(closed.status, 'Closed');
  assert.deepEqual(
    closed.history.map((e) => ({ type: e.type, actorId: e.actor.actorId, at: e.at })),
    [
      { type: 'CASE_CREATED', actorId: operator.id, at: '2026-11-16T10:00:00.000Z' },
      { type: 'OPERATOR_SELF_ASSIGNED', actorId: operator.id, at: '2026-11-16T10:05:00.000Z' },
      { type: 'REPORT_SUBMITTED', actorId: operator.id, at: '2026-11-16T10:15:00.000Z' },
      { type: 'REPORT_CONFIRMED_AND_CLOSED', actorId: operator.id, at: '2026-11-16T10:25:00.000Z' },
    ]
  );
  assert.deepEqual(
    audits.map((a) => ({ action: a.action, timestamp: a.timestamp })),
    [
      { action: 'CASE_CREATED', timestamp: '2026-11-16T10:00:00.000Z' },
      { action: 'OPERATOR_SELF_ASSIGNED', timestamp: '2026-11-16T10:05:00.000Z' },
      { action: 'REPORT_SUBMITTED', timestamp: '2026-11-16T10:15:00.000Z' },
      { action: 'REPORT_CONFIRMED_AND_CLOSED', timestamp: '2026-11-16T10:25:00.000Z' },
    ]
  );
});

test('Section 8.6: Enforces role/tenant/assignee/SME-confirmed boundaries and drops unauthorized UI modal/drafts immediately on live actor switch', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const inv2 = bundle.users.find((u) => u.id === 'usr-wf04-inv-2');
  const smeAdmin = bundle.users.find((u) => u.id === 'usr-wf04-sme');
  const branchOperator = bundle.users.find((u) => u.id === 'usr-wf04-branch-op');
  const expInv = bundle.users.find((u) => u.id === 'usr-wf04-exp-inv');
  const platformAdmin = defaultUsersMod.DEMO_USERS.find((u) => u.role === 'Platform Admin');
  const impStaff = defaultUsersMod.DEMO_USERS.find((u) => u.role === 'Implementation Staff');

  const snapshotBase = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Case 1: Investigating assigned to inv1
  const c1Created = hookMod.executeCreateCaseAction({
    snapshot: snapshotBase,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01'],
    caseId: 'CASE-2B-ACL-INV',
    at: '2026-11-16T08:00:00.000Z',
    now: () => '2026-11-16T08:00:00.000Z',
  });
  const c1Ass = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...snapshotBase, cases: c1Created.nextCases },
    actor: operator,
    caseId: 'CASE-2B-ACL-INV',
    assigneeId: inv1.id,
    at: '2026-11-16T08:05:00.000Z',
    now: () => '2026-11-16T08:05:00.000Z',
  });

  // Case 2: Pending Review v1
  const c2Created = hookMod.executeCreateCaseAction({
    snapshot: { ...snapshotBase, cases: c1Ass.nextCases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-02'],
    caseId: 'CASE-2B-ACL-PENDING',
    at: '2026-11-16T08:10:00.000Z',
    now: () => '2026-11-16T08:10:00.000Z',
  });
  const c2Ass = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...snapshotBase, cases: c2Created.nextCases },
    actor: operator,
    caseId: 'CASE-2B-ACL-PENDING',
    assigneeId: inv1.id,
    at: '2026-11-16T08:12:00.000Z',
    now: () => '2026-11-16T08:12:00.000Z',
  });
  const c2Sub = hookMod.executeSubmitInvestigationReportAction({
    snapshot: { ...snapshotBase, cases: c2Ass.nextCases },
    actor: inv1,
    caseId: 'CASE-2B-ACL-PENDING',
    summary: 'Pending draft summary NOT FOR SME ADMIN',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-02', resultText: 'Pending only', evidence: 'Pending ev' }],
    at: '2026-11-16T08:15:00.000Z',
    now: () => '2026-11-16T08:15:00.000Z',
  });

  // Case 3: Revised once then Closed confirmed v2
  const c3Created = hookMod.executeCreateCaseAction({
    snapshot: { ...snapshotBase, cases: c2Sub.nextCases },
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-2B-ACL-CLOSED',
    at: '2026-11-16T08:20:00.000Z',
    now: () => '2026-11-16T08:20:00.000Z',
  });
  const c3Ass = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...snapshotBase, cases: c3Created.nextCases },
    actor: operator,
    caseId: 'CASE-2B-ACL-CLOSED',
    assigneeId: inv1.id,
    at: '2026-11-16T08:22:00.000Z',
    now: () => '2026-11-16T08:22:00.000Z',
  });
  const c3Sub1 = hookMod.executeSubmitInvestigationReportAction({
    snapshot: { ...snapshotBase, cases: c3Ass.nextCases },
    actor: inv1,
    caseId: 'CASE-2B-ACL-CLOSED',
    summary: 'Superseded v1 secret summary',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-03', resultText: 'v1 internal', evidence: 'v1 ev' }],
    at: '2026-11-16T08:25:00.000Z',
    now: () => '2026-11-16T08:25:00.000Z',
  });
  const c3Rev = hookMod.executeRequestInvestigationRevisionAction({
    snapshot: { ...snapshotBase, cases: c3Sub1.nextCases },
    actor: operator,
    caseId: 'CASE-2B-ACL-CLOSED',
    reason: 'SECRET_INTERNAL_REVISION_REASON',
    expectedReportId: c3Sub1.investigationCase.reports[0].reportId,
    expectedReportVersion: 1,
    at: '2026-11-16T08:27:00.000Z',
    now: () => '2026-11-16T08:27:00.000Z',
  });
  const c3Sub2 = hookMod.executeSubmitInvestigationReportAction({
    snapshot: { ...snapshotBase, cases: c3Rev.nextCases },
    actor: inv1,
    caseId: 'CASE-2B-ACL-CLOSED',
    summary: 'v2 clean summary',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-03', resultText: 'v2 confirmed res', evidence: 'v2 ev' }],
    at: '2026-11-16T08:30:00.000Z',
    now: () => '2026-11-16T08:30:00.000Z',
  });
  const c3Closed = hookMod.executeConfirmInvestigationCaseReportAction({
    snapshot: { ...snapshotBase, cases: c3Sub2.nextCases },
    actor: operator,
    caseId: 'CASE-2B-ACL-CLOSED',
    reportId: c3Sub2.investigationCase.reports[1].reportId,
    reportVersion: 2,
    finalSummary: 'PUBLIC_SME_FINAL_CONCLUSION_V2',
    at: '2026-11-16T08:35:00.000Z',
    now: () => '2026-11-16T08:35:00.000Z',
  });

  const allCases = c3Closed.nextCases;
  const allAudits = [
    c1Created.auditEntry,
    c1Ass.auditEntry,
    c2Created.auditEntry,
    c2Ass.auditEntry,
    c2Sub.auditEntry,
    c3Created.auditEntry,
    c3Ass.auditEntry,
    c3Sub1.auditEntry,
    c3Rev.auditEntry,
    c3Sub2.auditEntry,
    c3Closed.auditEntry,
  ];
  const fullSnap = { ...snapshotBase, cases: allCases };

  // Unauthorized executors blocked on submit, revision, confirm
  assert.equal(
    hookMod.executeSubmitInvestigationReportAction({
      snapshot: fullSnap,
      actor: inv2,
      caseId: 'CASE-2B-ACL-INV',
      summary: 'hijack',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'x', evidence: 'y' }],
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_ASSIGNEE'
  );
  assert.equal(
    hookMod.executeSubmitInvestigationReportAction({
      snapshot: fullSnap,
      actor: expInv,
      caseId: 'CASE-2B-ACL-INV',
      summary: 'cross-tenant hijack',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'x', evidence: 'y' }],
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_TENANT'
  );
  assert.equal(
    hookMod.executeSubmitInvestigationReportAction({
      snapshot: fullSnap,
      actor: operator,
      caseId: 'CASE-2B-ACL-INV',
      summary: 'operator overriding assigned investigator',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'x', evidence: 'y' }],
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_ASSIGNEE'
  );
  assert.equal(
    hookMod.executeRequestInvestigationRevisionAction({
      snapshot: fullSnap,
      actor: inv1,
      caseId: 'CASE-2B-ACL-PENDING',
      reason: 'self revision forbidden',
      expectedReportId: c2Sub.investigationCase.reports[0].reportId,
      expectedReportVersion: 1,
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_ROLE'
  );
  assert.equal(
    hookMod.executeConfirmInvestigationCaseReportAction({
      snapshot: fullSnap,
      actor: smeAdmin,
      caseId: 'CASE-2B-ACL-PENDING',
      reportId: c2Sub.investigationCase.reports[0].reportId,
      reportVersion: 1,
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_ROLE'
  );
  assert.equal(
    hookMod.executeConfirmInvestigationCaseReportAction({
      snapshot: fullSnap,
      actor: branchOperator,
      caseId: 'CASE-2B-ACL-PENDING',
      reportId: c2Sub.investigationCase.reports[0].reportId,
      reportVersion: 1,
      at: NOW_ISO,
    }).code,
    'FORBIDDEN_TENANT'
  );

  // Live role switch in CasesView while inv1 has unsent draft on CASE-2B-ACL-INV
  let activeSelectedCaseId = 'CASE-2B-ACL-INV';
  const liveUi = createStatefulCasesUiHarness({
    investigationCases: allCases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: inv1,
    selectedCaseId: activeSelectedCaseId,
    onSelectCaseId: (nextId) => {
      activeSelectedCaseId = nextId;
      liveUi.updateProps({ selectedCaseId: nextId });
    },
  });
  liveUi.changeById('wf04-alert-result-ALT-WF04-CAMPUS-01', 'SECRET_INV1_UNSAVED_DRAFT_TEXT');

  // Switch user to unassigned inv2, SME Admin, Platform Admin, and foreign Operator -> modal hides immediately, zero draft leakage, zero discardConfirmPanel
  for (const outsider of [inv2, smeAdmin, platformAdmin, branchOperator]) {
    liveUi.updateProps({ currentUser: outsider, selectedCaseId: activeSelectedCaseId });
    const htmlText = liveUi.getFullText();
    assert.equal(liveUi.findAll((n) => n.props?.role === 'dialog').length, 0);
    assert.doesNotMatch(htmlText, /SECRET_INV1_UNSAVED_DRAFT_TEXT/);
    assert.doesNotMatch(htmlText, new RegExp(translations.vi.wf04Phase2b.reportForm.discardDraftTitle));
  }
  // Switching back to inv1 does NOT resurrect leaked draft after role switch cleared draftsByScopeKey
  liveUi.updateProps({ currentUser: inv1, selectedCaseId: 'CASE-2B-ACL-INV' });
  assert.equal(liveUi.findById('wf04-alert-result-ALT-WF04-CAMPUS-01').props.value, '');

  // SME Admin visibility across CasesView, ReportsView, auditForUser, buildCaseNotifications, CSV export
  const smeCasesHtml = renderToStaticMarkup(
    React.createElement(CasesViewVi, {
      investigationCases: allCases,
      legacyCaseArchive: [],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: smeAdmin,
      selectedCaseId: 'CASE-2B-ACL-CLOSED',
    })
  );
  assert.match(smeCasesHtml, /PUBLIC_SME_FINAL_CONCLUSION_V2/);
  assert.doesNotMatch(smeCasesHtml, /CASE-2B-ACL-INV/);
  assert.doesNotMatch(smeCasesHtml, /CASE-2B-ACL-PENDING/);
  assert.doesNotMatch(smeCasesHtml, /Pending draft summary NOT FOR SME ADMIN/);
  assert.doesNotMatch(smeCasesHtml, /SECRET_INTERNAL_REVISION_REASON/);
  assert.doesNotMatch(smeCasesHtml, /Superseded v1 secret summary/);

  const smeReportsHtml = renderToStaticMarkup(
    React.createElement(ReportsViewVi, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: smeAdmin,
      investigationCases: allCases,
      legacyCaseArchive: [],
    })
  );
  assert.match(smeReportsHtml, /PUBLIC_SME_FINAL_CONCLUSION_V2/);
  assert.doesNotMatch(smeReportsHtml, /CASE-2B-ACL-PENDING/);
  assert.doesNotMatch(smeReportsHtml, /SECRET_INTERNAL_REVISION_REASON/);

  const smeAudits = enterpriseMod.auditForUser(
    allAudits,
    smeAdmin,
    bundle.enterprises,
    bundle.transactions,
    allCases,
    []
  );
  assert.deepEqual(
    smeAudits.map((a) => ({ action: a.action, target: a.target })),
    [
      { action: 'CASE_CREATED', target: 'CASE-2B-ACL-CLOSED' },
      { action: 'INVESTIGATOR_ASSIGNED', target: 'CASE-2B-ACL-CLOSED' },
      { action: 'REPORT_CONFIRMED_AND_CLOSED', target: 'CASE-2B-ACL-CLOSED' },
    ]
  );
  assert.equal(
    smeAudits.some((a) => a.action === 'REPORT_SUBMITTED' || a.action === 'REVISION_REQUESTED'),
    false
  );

  const smeNotifs = notificationMod.buildCaseNotifications({
    transactions: bundle.transactions,
    investigationCases: allCases,
    legacyArchive: [],
    currentUser: smeAdmin,
    enterprises: bundle.enterprises,
    vi: false,
  });
  const smeCaseNotifs = smeNotifs.filter((n) => n.kind === 'case');
  assert.equal(smeCaseNotifs.length, 1);
  assert.equal(smeCaseNotifs[0].caseId, 'CASE-2B-ACL-CLOSED');
  assert.match(smeCaseNotifs[0].label, /Report v2 confirmed and case closed/);

  const smeCsv = exportCsvMod.buildInvestigationCasesCSVRows(allCases, bundle.users, smeAdmin);
  assert.equal(smeCsv.length, 2); // header + 1 confirmed Closed case
  assert.equal(smeCsv[1][0], 'CASE-2B-ACL-CLOSED');
  assert.equal(smeCsv[1][5], 'PUBLIC_SME_FINAL_CONCLUSION_V2');

  // Platform Admin and Implementation Staff receive zero internal data everywhere
  for (const platformActor of [platformAdmin, impStaff]) {
    assert.equal(
      enterpriseMod.auditForUser(allAudits, platformActor, bundle.enterprises, bundle.transactions, allCases, []).length,
      0
    );
    assert.equal(
      notificationMod.buildCaseNotifications({
        transactions: bundle.transactions,
        investigationCases: allCases,
        legacyArchive: [],
        currentUser: platformActor,
        enterprises: bundle.enterprises,
        vi: true,
      }).length,
      0
    );
    assert.equal(
      exportCsvMod.buildInvestigationCasesCSVRows(allCases, bundle.users, platformActor).length,
      0
    );
    const paReportsHtml = renderToStaticMarkup(
      React.createElement(ReportsViewVi, {
        transactions: bundle.transactions,
        enterprises: bundle.enterprises,
        users: bundle.users,
        currentUser: platformActor,
        investigationCases: allCases,
        legacyCaseArchive: [],
      })
    );
    assert.doesNotMatch(paReportsHtml, /PUBLIC_SME_FINAL_CONCLUSION_V2/);
    assert.doesNotMatch(paReportsHtml, /CASE-2B-ACL-PENDING/);
  }
});

test('Section 8.7: Expired WF-01 Subscription allows full Phase 2B completion on pre-expiry CASE-WF04-EXP-01 while blocking new case creation', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const expOperator = bundle.users.find((u) => u.id === 'usr-wf04-exp-op');
  const expInv = bundle.users.find((u) => u.id === 'usr-wf04-exp-inv');
  const expSme = bundle.users.find((u) => u.id === 'usr-wf04-exp-sme');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T09:00:00.000Z'; // Well past ent-wf04-expired expiresAt (2026-09-01)

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: bundle.initialCases,
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  // 1) New case post-expiry stays blocked
  let hook = renderHook({ currentActor: expOperator });
  const newPostExpiry = hook.createCase({ alertIds: ['ALT-WF04-EXP-NEW-02'] });
  assert.equal(newPostExpiry.ok, false);
  assert.equal(newPostExpiry.code, 'SUBSCRIPTION_EXPIRED');

  // 2) Existing pre-expiry CASE-WF04-EXP-01 completes assign -> submit v1 -> revision -> submit v2 -> confirm & close
  assert.equal(hook.assignInvestigator({ caseId: 'CASE-WF04-EXP-01', assigneeId: expInv.id }).ok, true);

  clock = '2026-11-16T09:05:00.000Z';
  hook = renderHook({ currentActor: expInv });
  const v1 = hook.submitReport({
    caseId: 'CASE-WF04-EXP-01',
    summary: 'Báo cáo v1 trước hết hạn gói',
    alertResults: [{ alertId: 'ALT-WF04-EXP-PRE-01', resultText: 'v1 result', evidence: 'v1 ev' }],
  });
  assert.equal(v1.ok, true);

  clock = '2026-11-16T09:10:00.000Z';
  hook = renderHook({ currentActor: expOperator });
  assert.equal(
    hook.requestRevision({
      caseId: 'CASE-WF04-EXP-01',
      reason: 'Bổ sung đọc số công tơ ký túc xá',
      expectedReportId: v1.investigationCase.reports[0].reportId,
      expectedReportVersion: 1,
    }).ok,
    true
  );

  clock = '2026-11-16T09:15:00.000Z';
  hook = renderHook({ currentActor: expInv });
  const v2 = hook.submitReport({
    caseId: 'CASE-WF04-EXP-01',
    summary: 'Báo cáo v2 đầy đủ sau khi hết hạn gói',
    alertResults: [{ alertId: 'ALT-WF04-EXP-PRE-01', resultText: 'Xác nhận rò điện KTX', evidence: 'Chỉ số công tơ ngày 15/08' }],
  });
  assert.equal(v2.ok, true);

  clock = '2026-11-16T09:20:00.000Z';
  hook = renderHook({ currentActor: expOperator });
  const closed = hook.confirmAndCloseReport({
    caseId: 'CASE-WF04-EXP-01',
    reportId: v2.investigationCase.reports[1].reportId,
    reportVersion: 2,
    finalSummary: 'Kết luận hợp lệ cho case mở trước khi gói hết hạn.',
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.investigationCase.status, 'Closed');

  const smeRead = caseDomain.readConfirmedInvestigationReport({
    investigationCase: closed.investigationCase,
    actor: expSme,
  });
  assert.equal(smeRead.ok, true);
  assert.equal(smeRead.view.conclusion.reportVersion, 2);
});

test('Section 8.8: Double-submit and storage quota/cleanup failures keep committed report state across reload and retry without duplicating versions, audits, or timestamps', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const storage = createScriptedStorage();
  const basePayload = buildBaseV4Payload(bundle);
  const audits = [];
  let clock = '2026-11-16T11:00:00.000Z';

  const renderHook = createInvestigationHookHarness({
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
    initialCases: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, auditEntry }) => ({
      ...basePayload,
      investigationCases: nextCases,
      auditLogs: auditEntry ? [auditEntry, ...audits] : [...audits],
    }),
    onAuditEntry: (entry) => audits.push(entry),
  });

  let hook = renderHook({ currentActor: operator });
  hook.createCase({ alertIds: ['ALT-WF04-CAMPUS-01'], caseId: 'CASE-2B-RES-01' });
  clock = '2026-11-16T11:05:00.000Z';
  hook = renderHook({ currentActor: operator });
  hook.assignInvestigator({ caseId: 'CASE-2B-RES-01', assigneeId: inv1.id });

  // Double-submit from same handler instance using latestCasesRef
  clock = '2026-11-16T11:10:00.000Z';
  hook = renderHook({ currentActor: inv1 });
  const firstSub = hook.submitReport({
    caseId: 'CASE-2B-RES-01',
    summary: 'v1 report',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Res 1', evidence: 'Ev 1' }],
    expectedStatus: 'Investigating',
    expectedBaseVersion: 0,
  });
  assert.equal(firstSub.ok, true);

  const dupSub = hook.submitReport({
    caseId: 'CASE-2B-RES-01',
    summary: 'duplicate submit click',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Res 1b', evidence: 'Ev 1b' }],
    expectedBaseVersion: 0,
  });
  assert.equal(dupSub.ok, false);
  assert.equal(dupSub.code, 'INVALID_STATE');
  assert.equal(audits.filter((a) => a.action === 'REPORT_SUBMITTED').length, 1);

  // Stale expectedBaseVersion when status IS Investigating after revision
  hook = renderHook({ currentActor: operator });
  clock = '2026-11-16T11:12:00.000Z';
  hook.requestRevision({
    caseId: 'CASE-2B-RES-01',
    reason: 'Need v2',
    expectedReportId: firstSub.investigationCase.reports[0].reportId,
    expectedReportVersion: 1,
  });
  hook = renderHook({ currentActor: inv1 });
  const staleSubmitBase = hook.submitReport({
    caseId: 'CASE-2B-RES-01',
    summary: 'stale base 0',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Res', evidence: 'Ev' }],
    expectedStatus: 'Investigating',
    expectedBaseVersion: 0,
  });
  assert.equal(staleSubmitBase.ok, false);
  assert.equal(staleSubmitBase.code, 'STALE_REPORT_VERSION');

  // Quota failure during v2 submitReport (users write fails -> v4 rolls back while in-memory v2 has hasUnsavedChanges: true)
  storage.setFailWriteKeys([storageMod.USERS_STORAGE_KEY_V1]);
  clock = '2026-11-16T11:20:00.000Z';
  const v2QuotaFail = hook.submitReport({
    caseId: 'CASE-2B-RES-01',
    summary: 'v2 committed in memory during quota error',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Res v2', evidence: 'Ev v2' }],
    expectedStatus: 'Investigating',
    expectedBaseVersion: 1,
  });
  assert.equal(v2QuotaFail.ok, true);
  assert.equal(v2QuotaFail.persisted, false);
  assert.equal(v2QuotaFail.rolledBack, true);

  const auditCountAfterSubmitV2 = audits.length;
  storage.setFailWriteKeys([]);
  hook = renderHook({ currentActor: inv1 });
  assert.equal(hook.hasUnsavedChanges, true);
  assert.equal(hook.cases[0].reports.length, 2);

  // retryPersist persists v2 cleanly without re-executing submit or advancing submittedAt
  clock = '2026-11-16T11:25:00.000Z';
  const retryV2 = hook.retryPersist();
  assert.equal(retryV2.ok, true);
  hook = renderHook({ currentActor: inv1 });
  assert.equal(hook.hasUnsavedChanges, false);
  assert.equal(hook.cases[0].reports.length, 2);
  assert.equal(hook.cases[0].reports[1].submittedAt, '2026-11-16T11:20:00.000Z');
  assert.equal(audits.length, auditCountAfterSubmitV2);

  // Simulate STORAGE_CLEANUP_FAILED during confirmAndCloseReport
  storage.setItem(
    storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4,
    JSON.stringify({
      version: 1,
      recordedAt: '2026-11-16T11:26:00.000Z',
      operation: 'prior',
      commitState: 'pending',
      hadPriorWorkspaceV4: true,
      priorWorkspaceV4Raw: storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4),
      hadPriorUsersV1: true,
      priorUsersV1Raw: storage.getItem(storageMod.USERS_STORAGE_KEY_V1),
    })
  );
  storage.setFailRemoveKeys([storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]);

  clock = '2026-11-16T11:30:00.000Z';
  hook = renderHook({ currentActor: operator, restoreStatus: 'recovery_required' });
  const confirmCleanupFail = hook.confirmAndCloseReport({
    caseId: 'CASE-2B-RES-01',
    reportId: hook.cases[0].reports[1].reportId,
    reportVersion: 2,
    finalSummary: 'Final confirmed with pending cleanup',
  });
  // Case-command uses allowRecoveryOverwrite: false -> blocked safely OR via retryPersist cleanup failure
  assert.equal(confirmCleanupFail.ok, true);
  assert.equal(confirmCleanupFail.persisted, false);
  assert.equal(confirmCleanupFail.recoveryRequired, true);

  // Now retryPersist with allowRecoveryOverwrite: true commits Closed + hits removeItem cleanup failure -> STORAGE_CLEANUP_FAILED
  hook = renderHook({ currentActor: operator, restoreStatus: 'recovery_required' });
  const cleanupBlockedRetry = hook.retryPersist({ allowRecoveryOverwrite: true });
  assert.equal(cleanupBlockedRetry.ok, false);
  assert.equal(cleanupBlockedRetry.committed, true);
  assert.equal(cleanupBlockedRetry.cleanupPending, true);
  assert.equal(cleanupBlockedRetry.storageError.code, 'STORAGE_CLEANUP_FAILED');

  // Reloading preserves Closed case + conclusion (never reverting to Pending Review!)
  const reloadedCleanup = storageMod.restoreWorkspaceSnapshot({
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
  assert.equal(reloadedCleanup.status, 'recovery_required');
  assert.equal(reloadedCleanup.cleanupPending, true);
  assert.equal(reloadedCleanup.payload.investigationCases[0].status, 'Closed');
  assert.equal(reloadedCleanup.payload.investigationCases[0].conclusion.confirmedAt, '2026-11-16T11:30:00.000Z');

  // Clear remove fault and finish retryPersist cleanup without duplicating reports/audits/timestamps
  storage.setFailRemoveKeys([]);
  hook = renderHook({ currentActor: operator, restoreStatus: 'recovery_required' });
  const finalRetry = hook.retryPersist({ allowRecoveryOverwrite: true });
  assert.equal(finalRetry.ok, true);
  assert.equal(finalRetry.cleanupPending, false);
  assert.equal(storage.getItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4), null);
  assert.equal(hook.cases[0].reports.length, 2);
  assert.equal(audits.filter((a) => a.action === 'REPORT_CONFIRMED_AND_CLOSED').length, 1);
});

test('Section 8.9: Closed cases reject mutations, emit zero feedback, count 1 case per multi-alert/multi-version case in ReportsView/KPIs/AuditTrailView, and keep legacyCaseArchive read-only', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const snapshotBase = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Build 1 case covering 3 alerts with 2 report versions (v1 revised -> v2 confirmed & closed)
  const cOpen = hookMod.executeCreateCaseAction({
    snapshot: snapshotBase,
    actor: operator,
    alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02', 'ALT-WF04-CAMPUS-03'],
    caseId: 'CASE-2B-COUNTS-01',
    at: '2026-11-16T08:00:00.000Z',
    now: () => '2026-11-16T08:00:00.000Z',
  });
  const cAss = hookMod.executeAssignInvestigatorAction({
    snapshot: { ...snapshotBase, cases: cOpen.nextCases },
    actor: operator,
    caseId: 'CASE-2B-COUNTS-01',
    assigneeId: inv1.id,
    at: '2026-11-16T08:05:00.000Z',
    now: () => '2026-11-16T08:05:00.000Z',
  });
  const cSub1 = hookMod.executeSubmitInvestigationReportAction({
    snapshot: { ...snapshotBase, cases: cAss.nextCases },
    actor: inv1,
    caseId: 'CASE-2B-COUNTS-01',
    summary: 'v1',
    alertResults: [
      { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'r1', evidence: 'e1' },
      { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'r2', evidence: 'e2' },
      { alertId: 'ALT-WF04-CAMPUS-03', resultText: 'r3', evidence: 'e3' },
    ],
    at: '2026-11-16T08:10:00.000Z',
    now: () => '2026-11-16T08:10:00.000Z',
  });
  const cRev = hookMod.executeRequestInvestigationRevisionAction({
    snapshot: { ...snapshotBase, cases: cSub1.nextCases },
    actor: operator,
    caseId: 'CASE-2B-COUNTS-01',
    reason: 'Clarify v2',
    expectedReportId: cSub1.investigationCase.reports[0].reportId,
    expectedReportVersion: 1,
    at: '2026-11-16T08:15:00.000Z',
    now: () => '2026-11-16T08:15:00.000Z',
  });
  const cSub2 = hookMod.executeSubmitInvestigationReportAction({
    snapshot: { ...snapshotBase, cases: cRev.nextCases },
    actor: inv1,
    caseId: 'CASE-2B-COUNTS-01',
    summary: 'v2',
    alertResults: [
      { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'v2 r1', evidence: 'v2 e1' },
      { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'v2 r2', evidence: 'v2 e2' },
      { alertId: 'ALT-WF04-CAMPUS-03', resultText: 'v2 r3', evidence: 'v2 e3' },
    ],
    at: '2026-11-16T08:20:00.000Z',
    now: () => '2026-11-16T08:20:00.000Z',
  });
  const cClosed = hookMod.executeConfirmInvestigationCaseReportAction({
    snapshot: { ...snapshotBase, cases: cSub2.nextCases },
    actor: operator,
    caseId: 'CASE-2B-COUNTS-01',
    reportId: cSub2.investigationCase.reports[1].reportId,
    reportVersion: 2,
    finalSummary: 'Final confirmed conclusion across 3 alerts',
    at: '2026-11-16T08:25:00.000Z',
    now: () => '2026-11-16T08:25:00.000Z',
  });

  const closedCases = cClosed.nextCases;
  const closedSnap = { ...snapshotBase, cases: closedCases };

  // Terminal Closed rejects every write
  assert.equal(
    hookMod.executeSubmitInvestigationReportAction({
      snapshot: closedSnap,
      actor: inv1,
      caseId: 'CASE-2B-COUNTS-01',
      summary: 'post-close write',
      alertResults: [],
      at: NOW_ISO,
    }).code,
    'CASE_ALREADY_CLOSED'
  );
  assert.equal(
    hookMod.executeRequestInvestigationRevisionAction({
      snapshot: closedSnap,
      actor: operator,
      caseId: 'CASE-2B-COUNTS-01',
      reason: 'reopen attempt',
      expectedReportId: cSub2.investigationCase.reports[1].reportId,
      expectedReportVersion: 2,
      at: NOW_ISO,
    }).code,
    'CASE_ALREADY_CLOSED'
  );
  assert.equal(
    hookMod.executeConfirmInvestigationCaseReportAction({
      snapshot: closedSnap,
      actor: operator,
      caseId: 'CASE-2B-COUNTS-01',
      reportId: cSub2.investigationCase.reports[1].reportId,
      reportVersion: 2,
      at: NOW_ISO,
    }).code,
    'CASE_ALREADY_CLOSED'
  );

  // Closing cases creates ZERO feedback & canSaveMember unblocks assignee after closure
  assert.deepEqual(
    [...platformSummaryMod.platformSummary(defaultTxMod.fraudGuardTransactions, { wf04Managed: true }).feedback],
    []
  );
  assert.equal(
    permissionsMod.canSaveMember(
      bundle.users.find((u) => u.id === 'usr-wf04-sme'),
      { ...inv1, role: 'Operator' },
      bundle.users,
      bundle.transactions,
      closedCases,
      []
    ),
    true
  );

  // Legacy archive stays read-only alongside ReportsView & CasesView
  const legacyEntry = {
    archiveId: 'ARCH-2B-RO-01',
    legacyCaseId: 'CS-LEGACY-2B-RO',
    legacyCaseStatus: 'Reported',
    enterpriseId: 'ent-wf04-campus',
    alertIds: ['ALT-WF04-CAMPUS-04'],
    transactionIds: ['tx-wf04-campus-04'],
    transactionRefs: ['ELEC-CMP-261114-04'],
    reasonCode: 'MISSING_CREATION_PROVENANCE',
    reason: 'Legacy record lacks verified operator provenance',
    blocksAlertCreation: true,
    requiresManualReconciliation: true,
    transactions: [bundle.transactions.find((t) => t.alertId === 'ALT-WF04-CAMPUS-04')],
  };

  // ReportsView counts strictly 1 case, 1 Closed, and 2 report versions separately; legacy archive stays hidden from main operational UI
  const reportsHtml = renderToStaticMarkup(
    React.createElement(ReportsViewVi, {
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: operator,
      investigationCases: closedCases,
      legacyCaseArchive: [legacyEntry],
    })
  );
  assert.match(reportsHtml, /v2 \(2\)/);
  assert.match(reportsHtml, /1 hồ sơ phù hợp bộ lọc hiện tại/);
  assert.equal(reportsHtml.includes(translations.vi.wf04Phase2a.legacy.legacyArchiveTitle), false);
  assert.doesNotMatch(reportsHtml, /CS-LEGACY-2B-RO/);

  // Cases table has strictly 1 row in main tbody for the 3-alert, 2-version case and omits legacy archive section
  const casesHtml = renderToStaticMarkup(
    React.createElement(CasesViewVi, {
      investigationCases: closedCases,
      legacyCaseArchive: [legacyEntry],
      transactions: bundle.transactions,
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: operator,
      selectedCaseId: null,
    })
  );
  assert.equal(casesHtml.includes(translations.vi.wf04Phase2a.legacy.legacyArchiveTitle), false);
  assert.doesNotMatch(casesHtml, /CS-LEGACY-2B-RO/);
  const tbodyMatch = casesHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch);
  assert.equal((tbodyMatch[1].match(/<tr/g) || []).length, 1);

  // AlertCaseDrawer preserves read-only inspection for archived legacy entries without mutation controls
  let legacyDrawerTxMutated = false;
  const legacyDrawerHtml = renderToStaticMarkup(
    React.createElement(AlertCaseDrawerVi, {
      transaction: {
        ...legacyEntry.transactions[0],
        caseId: 'CS-LEGACY-2B-RO',
        caseStatus: 'Reported',
      },
      open: true,
      onClose() {},
      users: bundle.users,
      currentUser: operator,
      investigationCases: closedCases,
      legacyCaseArchive: [legacyEntry],
      wf04Managed: true,
      onUpdateTransaction() {
        legacyDrawerTxMutated = true;
      },
    })
  );
  assert.equal(legacyDrawerTxMutated, false);
  assert.match(legacyDrawerHtml, /CS-LEGACY-2B-RO/);
  assert.equal(
    legacyDrawerHtml.includes(translations.vi.wf04Phase2a.legacy.legacyCannotEditNotice),
    true
  );
  assert.doesNotMatch(legacyDrawerHtml, /Phase 2A/);
  assert.doesNotMatch(legacyDrawerHtml, /<select/);
  assert.doesNotMatch(legacyDrawerHtml, /<textarea/);

  // AuditTrailView renders all 3 Phase 2B actions cleanly in VI and EN
  const phase2bAudits = [cSub1.auditEntry, cRev.auditEntry, cClosed.auditEntry];
  const auditViHtml = renderToStaticMarkup(
    React.createElement(AuditTrailViewVi, { initialLogs: phase2bAudits })
  );
  assert.match(auditViHtml, new RegExp(translations.vi.wf04Phase2b.auditActions.reportSubmitted));
  assert.match(auditViHtml, new RegExp(translations.vi.wf04Phase2b.auditActions.revisionRequested));
  assert.match(auditViHtml, new RegExp(translations.vi.wf04Phase2b.auditActions.reportConfirmedClosed));

  const auditEnHtml = renderToStaticMarkup(
    React.createElement(AuditTrailViewEn, { initialLogs: phase2bAudits })
  );
  assert.match(auditEnHtml, new RegExp(translations.en.wf04Phase2b.auditActions.reportSubmitted));
  assert.match(auditEnHtml, new RegExp(translations.en.wf04Phase2b.auditActions.revisionRequested));
  assert.match(
    auditEnHtml,
    new RegExp(translations.en.wf04Phase2b.auditActions.reportConfirmedClosed.replace(/&/g, '&amp;'))
  );
});

test('Section 8.10: Draft scoping isolates unsent drafts per (caseId, actorId, baseReportVersion), prompts discard confirm on dirty close/switch, and invalidates stale draft scopes', () => {
  const bundle = wf04Demo.getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const inv1 = bundle.users.find((u) => u.id === 'usr-wf04-inv-1');
  const snapshotBase = {
    cases: [],
    enterprises: bundle.enterprises,
    projects: bundle.projects,
    alerts: bundle.transactions,
    legacyArchive: [],
    users: bundle.users,
  };

  // Scope key distinct across caseId, actorId, and baseReportVersion
  const kA_v0 = buildReportDraftScopeKey('CASE-A', inv1.id, 0);
  const kA_v1 = buildReportDraftScopeKey('CASE-A', inv1.id, 1);
  const kB_v0 = buildReportDraftScopeKey('CASE-B', inv1.id, 0);
  const kA_op = buildReportDraftScopeKey('CASE-A', operator.id, 0);
  assert.equal(new Set([kA_v0, kA_v1, kB_v0, kA_op]).size, 4);

  // Two Investigating cases assigned to inv1
  const cA = hookMod.executeAssignInvestigatorAction({
    snapshot: hookMod.executeCreateCaseAction({
      snapshot: snapshotBase,
      actor: operator,
      alertIds: ['ALT-WF04-CAMPUS-01'],
      caseId: 'CASE-2B-DRAFT-A',
      at: NOW_ISO,
    }).nextCases
      ? {
          ...snapshotBase,
          cases: hookMod.executeCreateCaseAction({
            snapshot: snapshotBase,
            actor: operator,
            alertIds: ['ALT-WF04-CAMPUS-01'],
            caseId: 'CASE-2B-DRAFT-A',
            at: NOW_ISO,
          }).nextCases,
        }
      : snapshotBase,
    actor: operator,
    caseId: 'CASE-2B-DRAFT-A',
    assigneeId: inv1.id,
    at: NOW_ISO,
  });
  const cB = hookMod.executeAssignInvestigatorAction({
    snapshot: {
      ...snapshotBase,
      cases: hookMod.executeCreateCaseAction({
        snapshot: { ...snapshotBase, cases: cA.nextCases },
        actor: operator,
        alertIds: ['ALT-WF04-CAMPUS-02'],
        caseId: 'CASE-2B-DRAFT-B',
        at: NOW_ISO,
      }).nextCases,
    },
    actor: operator,
    caseId: 'CASE-2B-DRAFT-B',
    assigneeId: inv1.id,
    at: NOW_ISO,
  });

  // isReportDraftDirty detects dirty vs baseline cleanly
  assert.equal(isReportDraftDirty(undefined, cA.investigationCase), false);
  assert.equal(
    isReportDraftDirty(buildReportDraftBaseline(cA.investigationCase), cA.investigationCase),
    false
  );
  assert.equal(
    isReportDraftDirty(
      {
        summary: 'unsaved summary',
        perAlert: { 'ALT-WF04-CAMPUS-01': { resultText: '', evidence: '' } },
      },
      cA.investigationCase
    ),
    true
  );

  // Exercise CasesView dirty-leave confirmation (Keep Editing vs Discard)
  let selectedId = 'CASE-2B-DRAFT-A';
  const ui = createStatefulCasesUiHarness({
    investigationCases: cB.nextCases,
    legacyCaseArchive: [],
    transactions: bundle.transactions,
    enterprises: bundle.enterprises,
    users: bundle.users,
    currentUser: inv1,
    selectedCaseId: selectedId,
    onSelectCaseId: (nextId) => {
      selectedId = nextId;
      ui.updateProps({ selectedCaseId: nextId });
    },
  });

  // Type into Case A draft -> try closing modal -> discardConfirmPanel appears, modal remains open
  ui.changeById('wf04-report-summary', 'Unsent dirty draft on Case A');
  ui.clickByAriaLabel(translations.vi.wf04Phase2a.caseQueue.closeModalBtn);
  assert.match(ui.getFullText(), new RegExp(translations.vi.wf04Phase2b.reportForm.discardDraftTitle));
  assert.equal(selectedId, 'CASE-2B-DRAFT-A');

  // Keep Editing hides confirmation and preserves draft text
  ui.clickButton(translations.vi.wf04Phase2b.reportForm.keepEditingBtn);
  assert.doesNotMatch(ui.getFullText(), new RegExp(translations.vi.wf04Phase2b.reportForm.discardDraftTitle));
  assert.equal(ui.findById('wf04-report-summary').props.value, 'Unsent dirty draft on Case A');

  // Closing again -> Confirm Discard clears draft & closes modal; reopening Case A starts clean; Case B never sees Case A's draft
  ui.clickByAriaLabel(translations.vi.wf04Phase2a.caseQueue.closeModalBtn);
  ui.clickButton(translations.vi.wf04Phase2b.reportForm.discardDraftConfirmBtn);
  assert.equal(selectedId, null);

  ui.updateProps({ selectedCaseId: 'CASE-2B-DRAFT-A' });
  assert.equal(ui.findById('wf04-report-summary').props.value, '');
  ui.updateProps({ selectedCaseId: 'CASE-2B-DRAFT-B' });
  assert.equal(ui.findById('wf04-report-summary').props.value, '');
});

test('Section 8.11: Fraud Monitoring loading.tsx renders an isolated light-background dashboard shell with accessible status, responsive CSS breakpoints, and untouched dashboard dark tokens', () => {
  const LoadingComponent = LoadingModule.default;
  const html = renderToStaticMarkup(React.createElement(LoadingComponent));

  // Accessibility & zero interactive/fake content
  assert.match(html, /class="loadingShell"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status"/);
  assert.match(html, /Đang tải dữ liệu bảng điều khiển\.\.\. \/ Loading dashboard data\.\.\./);
  assert.doesNotMatch(html, /\u2014/);
  assert.doesNotMatch(html, /<button\b|<a\b|<input\b|<select\b|<textarea\b|tabindex="0"/i);

  // Neutral skeleton structure: Sidebar, Header, Main with 4 KPI blocks + 1 large table skeleton
  assert.match(html, /<aside class="loadingSidebar" aria-hidden="true">/);
  assert.match(html, /<header class="loadingHeader" aria-hidden="true">/);
  assert.match(html, /<div class="loadingGrid" aria-hidden="true">/);
  const kpiBlockMatches = html.match(/class="loadingSkeleton loadingBlock"/g) || [];
  assert.equal(kpiBlockMatches.length, 4);
  const tableSkeletonMatches = html.match(/class="loadingSkeleton loadingTable"/g) || [];
  assert.equal(tableSkeletonMatches.length, 1);

  // Zero fake privileged nav text or fake user names leaked
  assert.doesNotMatch(html, /Lê Minh Quân|Platform Admin|SME Admin|Rule Sets/i);

  // Verify CSS in SecurityDashboard.module.css enforces light shell, responsive breakpoints, reduced-motion, and preserves dark tokens
  const cssSource = fs.readFileSync(
    path.join(ROOT, 'src/components/fraudguard-dashboard/SecurityDashboard.module.css'),
    'utf8'
  );
  assert.match(cssSource, /\.loadingShell\s*\{[^}]*background:\s*#ffffff/i);
  assert.match(cssSource, /\.loadingShell\s*\{[^}]*color:\s*#0f172a/i);
  assert.match(cssSource, /@media\s*\(max-width:\s*900px\)[\s\S]*\.loadingSidebar\s*\{[^}]*display:\s*none/);
  assert.match(cssSource, /@media\s*\(max-width:\s*900px\)[\s\S]*\.loadingShell\s+\.loadingGrid\s*\{[^}]*repeat\(2,/);
  assert.match(cssSource, /@media\s*\(max-width:\s*420px\)[\s\S]*\.loadingShell\s+\.loadingGrid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(cssSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.loadingSkeleton\s*\{[^}]*animation:\s*none/);
  // Dark dashboard root surface variables remain intact
  assert.match(cssSource, /\.root\s*\{[^}]*background:\s*var\(--security-bg\)/);
  assert.match(cssSource, /\.root\s*\{[^}]*color:\s*var\(--security-text\)/);
  const globalsCss = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  assert.match(globalsCss, /:root\s*\{[\s\S]*color-scheme:\s*dark;[\s\S]*--security-bg:\s*#17181c/i);
});
