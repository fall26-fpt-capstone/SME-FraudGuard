const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, createUiImports, createScriptedStorage, createInvestigationHookHarness } = require('./helpers/wf04.cjs');
const feedback = load('src/utils/report-feedback.ts');
const demo = load('src/data/wf04-demo.ts');
const storageMod = load('src/utils/workspace-storage.ts');
const migration = load('src/utils/case-migration.ts');
const summary = load('src/utils/platform-summary.ts');
const enterprise = load('src/utils/enterprise.ts');
const hookMod = load('src/hooks/useInvestigationCases.ts');
const { translations } = load('src/config/translations.ts');
const ROOT = path.resolve(__dirname, '..');
const AT = '2026-11-17T10:00:00.001Z';

function fixture(options = {}) {
  const b = demo.getWf04DemoBundle();
  const operator = b.users.find(u => u.id === 'usr-wf04-op');
  const sme = b.users.find(u => u.id === 'usr-wf04-sme');
  const other = b.users.find(u => u.id === 'usr-wf04-branch-sme');
  const pa = { ...sme, id: 'pa-feedback', role: 'Platform Admin', enterpriseId: undefined };
  b.users.push(pa);
  const storage = createScriptedStorage();
  const audits = [];
  const meta = migration.migrateWorkspaceLegacyCases({ transactions: [], enterprises: b.enterprises, projects: b.projects, users: b.users, sourceSchema: 'seed', migratedAt: AT });
  const base = { schemaVersion: 4, rules: b.rules, ruleSets: b.ruleSets, enterprises: b.enterprises, legacyUnassigned: [], projects: b.projects, transactions: b.transactions, auditLogs: [], investigationCases: [], legacyCaseArchive: [], migrationMeta: meta.migrationMeta, wf04DemoActive: false };
  let clock = '2026-11-16T08:00:00.000Z';
  const render = createInvestigationHookHarness({
    enterprises: b.enterprises, projects: b.projects, alerts: b.transactions, users: b.users,
    initialCases: [], initialFeedbacks: [], legacyArchive: [], restoreStatus: 'ready', storage,
    now: () => clock, persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, nextFeedbacks, auditEntry }) => ({ ...base, investigationCases: nextCases, reportFeedbacks: nextFeedbacks, auditLogs: auditEntry ? [...audits, auditEntry] : [...audits] }),
    onAuditEntry: e => audits.push(e),
  });
  let h = render({ currentActor: operator });
  assert.equal(h.createCase({ caseId: 'CASE-FEEDBACK', alertIds: ['ALT-WF04-CAMPUS-01', 'ALT-WF04-CAMPUS-02'] }).ok, true);
  clock = '2026-11-16T08:10:00.000Z';
  h = render({ currentActor: operator });
  assert.equal(h.selfAssign({ caseId: 'CASE-FEEDBACK' }).ok, true);
  clock = '2026-11-16T08:20:00.000Z';
  h = render({ currentActor: operator });
  assert.equal(h.submitReport({ caseId: 'CASE-FEEDBACK', summary: 'Two distinct findings', expectedBaseVersion: 0, expectedStatus: 'Investigating', alertResults: [
    { alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Unexplained usage', evidence: 'Meter log A' },
    { alertId: 'ALT-WF04-CAMPUS-02', resultText: 'Authorized maintenance', evidence: 'Work order B' },
  ] }).ok, true);
  h = render({ currentActor: operator });
  const report = h.cases[0].reports[0];
  clock = '2026-11-16T08:30:00.000Z';
  assert.equal(h.confirmAndCloseReport({ caseId: 'CASE-FEEDBACK', reportId: report.reportId, reportVersion: report.version, finalSummary: 'Different outcomes per alert' }).ok, true);
  clock = AT;
  h = render({ currentActor: sme });
  const args = { caseId: 'CASE-FEEDBACK', expectedReportId: report.reportId, expectedReportVersion: report.version, smeComment: 'Please assess these findings.' };
  const domainArgs = { ...args, feedbackId: 'FB-1', actor: sme, cases: h.cases, enterprises: b.enterprises, users: b.users, existingFeedbacks: [], submittedAt: AT };
  const restore = () => storageMod.restoreWorkspaceSnapshot({ storage, defaultRules: b.rules, defaultEnterprises: b.enterprises, defaultProjects: b.projects, defaultTransactions: b.transactions, defaultUsers: b.users, defaultAuditLogs: [], migratedAt: AT });
  return { b, sme, operator, other, pa, storage, audits, render, args, domainArgs, restore, h, base, ...options };
}

test('Feedback is explicit, immutable, matches preview and preserves different alert outcomes', () => {
  const f = fixture();
  assert.equal(f.h.feedbacks.length, 0);
  assert.equal(summary.platformSummary(f.b.transactions, { wf04Managed: true, reportFeedbacks: f.h.feedbacks }).feedback.length, 0);
  const before = JSON.stringify(f.h.cases);
  const preview = feedback.buildConfirmedReportFeedbackPreview(f.domainArgs);
  const sent = feedback.submitConfirmedReportFeedback({ ...f.domainArgs, snapshot: { secret: 'forged' } });
  assert.equal(sent.ok, true);
  assert.equal(JSON.stringify(sent.value.feedback.snapshot), JSON.stringify(preview.snapshot));
  assert.equal(JSON.stringify(f.h.cases), before);
  const snap = sent.value.feedback.snapshot;
  assert.deepEqual(Array.from(snap.alertResults, a => a.resultText), ['Unexplained usage', 'Authorized maintenance']);
  assert.equal(snap.secret, undefined);
  assert.equal(snap.history, undefined);
  assert.equal(snap.reports, undefined);
  assert.equal(Object.isFrozen(snap.alertResults[0]), true);
  const changed = structuredClone(f.h.cases);
  changed[0].reports[0].summary = 'later change';
  assert.equal(snap.reportSummary, 'Two distinct findings');
});

test('Feedback rejects wrong role/tenant/directory, unconfirmed case and stale report identity', () => {
  const f = fixture();
  for (const actor of [f.operator, f.pa, f.other, { ...f.sme, role: 'Investigator' }]) {
    assert.equal(feedback.submitConfirmedReportFeedback({ ...f.domainArgs, actor }).ok, false);
  }
  for (const patch of [{ expectedReportId: undefined }, { expectedReportVersion: undefined }, { expectedReportVersion: 2 }, { submittedAt: '2020-01-01T00:00:00Z' }, { submittedAt: 'invalid' }]) {
    assert.equal(feedback.submitConfirmedReportFeedback({ ...f.domainArgs, ...patch }).ok, false);
  }
  const cases = structuredClone(f.h.cases);
  cases[0].status = 'Pending Review';
  assert.equal(feedback.submitConfirmedReportFeedback({ ...f.domainArgs, cases }).ok, false);
  assert.equal(feedback.submitConfirmedReportFeedback({ ...f.domainArgs, users: f.b.users.filter(u => u.id !== f.sme.id) }).ok, false);
});

test('Double click is deduplicated and reload retains one feedback and one audit', () => {
  const f = fixture();
  const out = f.h.submitReportFeedback(f.args);
  assert.equal(out.ok, true);
  assert.equal(out.persisted, true);
  assert.equal(f.h.submitReportFeedback(f.args).code, 'DUPLICATE_REPORT_FEEDBACK');
  const restored = f.restore();
  assert.equal(restored.status, 'ready');
  assert.equal(restored.payload.reportFeedbacks.length, 1);
  assert.equal(restored.payload.auditLogs.filter(a => a.action === 'REPORT_FEEDBACK_SENT').length, 1);
  assert.equal(restored.payload.investigationCases[0].status, 'Closed');
});

test('Read guards expose only submitted snapshots to PA and owning SME', () => {
  const f = fixture();
  const sent = f.h.submitReportFeedback(f.args);
  for (const actor of [f.pa, f.sme]) {
    assert.equal(feedback.readReportFeedbacksForUser({ actor, feedbacks: sent.feedbacks, users: f.b.users }).length, 1);
  }
  for (const actor of [f.operator, f.other, { ...f.sme, role: 'Implementation Staff' }]) {
    assert.equal(feedback.readReportFeedbacksForUser({ actor, feedbacks: sent.feedbacks, users: f.b.users }).length, 0);
    assert.equal(feedback.readReportFeedbackDetailForUser({ actor, feedbacks: sent.feedbacks, feedbackId: sent.feedback.feedbackId, users: f.b.users }).ok, false);
  }
  const ownAudit = enterprise.auditForUser(f.audits, f.pa, f.b.enterprises, f.b.transactions, f.h.cases);
  assert.equal(ownAudit.length, 1);
  assert.equal(ownAudit[0].action, 'REPORT_FEEDBACK_SENT');
});

test('Restore rejects nested corruption, duplicate report keys and invalid confirming role/tenant', () => {
  const f = fixture();
  const sent = f.h.submitReportFeedback(f.args);
  assert.equal(feedback.validateReportFeedbackList(sent.feedbacks).ok, true);
  for (const mutate of [
    fb => { fb.snapshot.alertResults = [null]; },
    fb => { fb.snapshot.reportVersion = 99; },
    fb => { fb.snapshot.confirmedBy.actorRole = 'Platform Admin'; },
    fb => { fb.snapshot.confirmedBy.enterpriseId = 'another-enterprise'; },
    fb => { fb.snapshot.alertResults.push(fb.snapshot.alertResults[0]); },
  ]) {
    const list = structuredClone(sent.feedbacks);
    mutate(list[0]);
    assert.equal(feedback.validateReportFeedbackList(list).ok, false);
  }
  assert.equal(feedback.validateReportFeedbackList([...sent.feedbacks, { ...sent.feedback, feedbackId: 'another-id' }]).ok, false);
});

test('Old v4 payload defaults to no feedback; unrelated writes and demo restore preserve sent records', () => {
  const f = fixture();
  const old = JSON.parse(f.storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4));
  delete old.reportFeedbacks;
  f.storage.setItem(storageMod.WORKSPACE_STORAGE_KEY_V4, JSON.stringify(old));
  assert.equal(f.restore().payload.reportFeedbacks.length, 0);
  assert.equal(f.h.submitReportFeedback(f.args).ok, true);
  const payload = f.restore().payload;
  assert.equal(storageMod.mergeAndPersistWorkspaceSlice({ currentPayload: payload, patch: { rules: payload.rules }, restoreStatus: 'ready', storage: f.storage }).ok, true);
  assert.equal(f.restore().payload.reportFeedbacks.length, 1);
  const activated = demo.applyWf04DemoWorkspace({ currentPayload: payload, currentUsers: f.b.users, savedAt: AT });
  const restored = demo.restorePreDemoWorkspace({ currentPayload: activated.payload });
  assert.equal(JSON.stringify(restored.payload.reportFeedbacks), JSON.stringify(payload.reportFeedbacks));
});

test('Failed write retries persistence without repeating feedback command', () => {
  const f = fixture();
  f.storage.setFailWriteKeys([storageMod.WORKSPACE_STORAGE_KEY_V4]);
  const sent = f.h.submitReportFeedback(f.args);
  assert.equal(sent.ok, true);
  assert.equal(sent.persisted, false);
  assert.equal(f.restore().payload.reportFeedbacks.length, 0);
  f.storage.setFailWriteKeys([]);
  const h = f.render({ currentActor: f.sme });
  assert.equal(h.retryPersist().ok, true);
  assert.equal(f.restore().payload.reportFeedbacks.length, 1);
  assert.equal(f.audits.filter(a => a.action === 'REPORT_FEEDBACK_SENT').length, 1);
});

test('Committed cleanup failure reloads new feedback and retry keeps IDs and timestamps', () => {
  const f = fixture();
  f.storage.setItem(storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4, JSON.stringify({
    version: 1, recordedAt: AT, operation: 'prior', commitState: 'pending',
    hadPriorWorkspaceV4: true, priorWorkspaceV4Raw: f.storage.getItem(storageMod.WORKSPACE_STORAGE_KEY_V4),
    hadPriorUsersV1: true, priorUsersV1Raw: f.storage.getItem(storageMod.USERS_STORAGE_KEY_V1),
  }));
  f.storage.setFailRemoveKeys([storageMod.WORKSPACE_RECOVERY_JOURNAL_KEY_V4]);
  const sent = f.h.submitReportFeedback(f.args);
  assert.equal(sent.persisted, false);
  const retry = f.render({ currentActor: f.sme, restoreStatus: 'recovery_required' }).retryPersist();
  assert.equal(retry.committed, true, JSON.stringify(retry.storageError));
  assert.equal(retry.cleanupPending, true);
  const restored = f.restore();
  assert.equal(restored.payload.reportFeedbacks[0].feedbackId, sent.feedback.feedbackId);
  f.storage.setFailRemoveKeys([]);
  assert.equal(f.render({ currentActor: f.sme }).retryPersist().ok, true);
  assert.equal(f.restore().payload.reportFeedbacks[0].submittedAt, AT);
  assert.equal(f.audits.filter(a => a.action === 'REPORT_FEEDBACK_SENT').length, 1);
});

test('Feedback submission on an already Closed case does not add a subscription expiry gate', () => {
  const f = fixture();
  const enterprises = structuredClone(f.b.enterprises);
  enterprises.find(e => e.id === f.sme.enterpriseId).lifecycle = undefined;
  assert.equal(feedback.submitConfirmedReportFeedback({ ...f.domainArgs, enterprises }).ok, true);
});

test('VI/EN preview and PA detail render submitted per-alert evidence without internal history', () => {
  const f = fixture();
  const sent = f.h.submitReportFeedback(f.args);
  for (const lang of ['vi', 'en']) {
    const { ReportFeedbackModal } = load('src/components/fraudguard-dashboard/ReportFeedbackModal.tsx', createUiImports(lang));
    const html = renderToStaticMarkup(React.createElement(ReportFeedbackModal, { open: true, caseId: f.args.caseId, actor: f.sme, cases: f.h.cases, enterprises: f.b.enterprises, users: f.b.users, feedbacks: sent.feedbacks, onClose() {} }));
    assert.match(html, /Meter log A/);
    assert.match(html, /Work order B/);
    assert.match(html, /Please assess these findings/);
    assert.doesNotMatch(html, /textarea/);
    const denied = renderToStaticMarkup(React.createElement(ReportFeedbackModal, { open: true, caseId: f.args.caseId, actor: f.operator, cases: f.h.cases, enterprises: f.b.enterprises, onClose() {} }));
    assert.equal(denied, '');
  }
});

function createStatefulCasesWithDrawerHarness(initialProps, lang = 'vi') {
  const instances = new Map();
  let activeInstance = null;
  let hookCursor = 0;
  let pendingEffects = [];
  let dirty = false;

  const FRAGMENT = Symbol('Fragment');
  function createEl(type, props, key) {
    return { type, props: props || {}, key };
  }
  const jsxRuntime = { Fragment: FRAGMENT, jsx: createEl, jsxs: createEl };

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
      const setState = updater => {
        const next = typeof updater === 'function' ? updater(inst.slots[idx]) : updater;
        if (!Object.is(next, inst.slots[idx])) {
          inst.slots[idx] = next;
          dirty = true;
        }
      };
      return [inst.slots[idx], setState];
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
      useToast: () => ({ toast() {}, showToast() {} }),
    },
    '@/hooks/useDialogFocus': {
      useDialogFocus: () => ({ current: null }),
    },
  };

  const { CasesView } = load('src/components/fraudguard-dashboard/CasesView.tsx', statefulImports);
  const { AlertCaseDrawer } = load('src/components/fraudguard-dashboard/AlertCaseDrawer.tsx', statefulImports);

  function Shell(props) {
    const [reviewingTx, setReviewingTx] = mockReact.useState(null);
    return createEl(FRAGMENT, {
      children: [
        createEl(CasesView, {
          ...props.casesProps,
          key: 'cases',
          onReviewTransaction: tx => setReviewingTx(tx),
        }),
        createEl(AlertCaseDrawer, {
          key: 'drawer',
          open: Boolean(reviewingTx),
          transaction: reviewingTx,
          onClose: () => setReviewingTx(null),
          users: props.casesProps.users,
          currentUser: props.casesProps.currentUser,
          investigationCases: props.casesProps.investigationCases,
          legacyCaseArchive: props.casesProps.legacyCaseArchive,
          wf04Managed: true,
          onOpenInvestigationCase: props.onOpenInvestigationCase || (() => {}),
          onUpdateTransaction: props.onUpdateTransaction || (() => {}),
        }),
      ],
    });
  }

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
      renderedTree = expandNode(createEl(Shell, currentProps), 'root', visitedKeys);
      for (const existingKey of Array.from(instances.keys())) {
        if (!visitedKeys.has(existingKey)) {
          instances.delete(existingKey);
        }
      }
      for (const eff of pendingEffects) eff();
      if (!dirty) return renderedTree;
    }
    return renderedTree;
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

  function findById(id) {
    return findAll(n => n.props && n.props.id === id)[0];
  }

  function clickButton(textFragment) {
    const btn = findAll(n => n.type === 'button' && getText(n).includes(textFragment))[0];
    assert.ok(btn, `Expected button containing "${textFragment}"`);
    assert.ok(!btn.props.disabled, `Button "${textFragment}" must not be disabled`);
    btn.props.onClick();
    return render();
  }

  function clickByAriaLabel(labelText) {
    const btn = findAll(n => n.type === 'button' && n.props['aria-label'] === labelText)[0];
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

  render();
  return {
    findAll,
    findById,
    clickButton,
    clickByAriaLabel,
    changeById,
    getFullText: () => getText(renderedTree),
  };
}

test('Post-cleanup regression: AlertCaseDrawer keeps unsent report drafts intact and reload/demo helpers preserve cases, reports, feedbacks and legacyCaseArchive without auto-feedback', () => {
  const f = fixture();
  const inv1 = f.b.users.find(u => u.id === 'usr-wf04-inv-1');

  // Create a second Investigating case assigned to inv1 alongside the already Closed CASE-FEEDBACK
  let clock = '2026-11-18T09:00:00.000Z';
  const r2 = createInvestigationHookHarness({
    enterprises: f.b.enterprises,
    projects: f.b.projects,
    alerts: f.b.transactions,
    users: f.b.users,
    initialCases: [],
    initialFeedbacks: [],
    legacyArchive: [],
    restoreStatus: 'ready',
    storage: f.storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, nextFeedbacks, auditEntry }) => ({
      ...f.base,
      investigationCases: nextCases,
      reportFeedbacks: nextFeedbacks,
      auditLogs: auditEntry ? [...f.audits, auditEntry] : [...f.audits],
    }),
    onAuditEntry: e => f.audits.push(e),
  });

  // First close a fresh multi-alert case CASE-2C-CLOSE-ZERO without submitting feedback
  let h2 = r2({ currentActor: f.operator });
  assert.equal(h2.createCase({ caseId: 'CASE-2C-CLOSE-ZERO', alertIds: ['ALT-WF04-CAMPUS-03'] }).ok, true);
  clock = '2026-11-18T09:05:00.000Z';
  h2 = r2({ currentActor: f.operator });
  assert.equal(h2.selfAssign({ caseId: 'CASE-2C-CLOSE-ZERO' }).ok, true);
  clock = '2026-11-18T09:10:00.000Z';
  h2 = r2({ currentActor: f.operator });
  assert.equal(h2.submitReport({
    caseId: 'CASE-2C-CLOSE-ZERO',
    summary: 'Closed case summary without SME feedback',
    expectedBaseVersion: 0,
    expectedStatus: 'Investigating',
    alertResults: [{ alertId: 'ALT-WF04-CAMPUS-03', resultText: 'Confirmed Anomaly', evidence: 'Trace 03' }],
  }).ok, true);
  h2 = r2({ currentActor: f.operator });
  const r03 = h2.cases.find(c => c.caseId === 'CASE-2C-CLOSE-ZERO').reports[0];
  clock = '2026-11-18T09:15:00.000Z';
  assert.equal(h2.confirmAndCloseReport({
    caseId: 'CASE-2C-CLOSE-ZERO',
    reportId: r03.reportId,
    reportVersion: r03.version,
    finalSummary: 'Final conclusion preserved without auto-feedback',
  }).ok, true);
  h2 = r2({ currentActor: f.operator });
  const closedZeroCase = h2.cases.find(c => c.caseId === 'CASE-2C-CLOSE-ZERO');
  assert.equal(closedZeroCase.status, 'Closed');
  assert.equal(closedZeroCase.conclusion.summary, 'Final conclusion preserved without auto-feedback');

  // Merge Closed CASE-FEEDBACK + CASE-2C-CLOSE-ZERO and create Investigating CASE-2C-DRAFT-DRAWER for inv1
  const closedFeedbackCase = f.h.cases[0];
  const sentFeedback = feedback.submitConfirmedReportFeedback({
    ...f.domainArgs,
    feedbackId: 'FB-KEEP-01',
    submittedAt: '2026-11-18T09:20:00.000Z',
  });
  assert.equal(sentFeedback.ok, true);

  const openRes = hookMod.executeCreateCaseAction({
    snapshot: {
      cases: [closedFeedbackCase, closedZeroCase],
      enterprises: f.b.enterprises,
      projects: f.b.projects,
      alerts: f.b.transactions,
      legacyArchive: [],
      users: f.b.users,
    },
    actor: f.operator,
    caseId: 'CASE-2C-DRAFT-DRAWER',
    alertIds: ['ALT-WF04-CAMPUS-04'],
    at: '2026-11-18T09:25:00.000Z',
  });
  assert.equal(openRes.ok, true);
  const assignedRes = hookMod.executeAssignInvestigatorAction({
    snapshot: {
      cases: openRes.nextCases,
      enterprises: f.b.enterprises,
      projects: f.b.projects,
      alerts: f.b.transactions,
      legacyArchive: [],
      users: f.b.users,
    },
    actor: f.operator,
    caseId: 'CASE-2C-DRAFT-DRAWER',
    assigneeId: inv1.id,
    at: '2026-11-18T09:30:00.000Z',
  });
  assert.equal(assignedRes.ok, true);

  // (a) Stateful CasesView + AlertCaseDrawer: inspecting linked alert preserves unsent report draft
  let submitCalls = 0;
  let drawerTxMutated = false;
  const ui = createStatefulCasesWithDrawerHarness({
    casesProps: {
      investigationCases: assignedRes.nextCases,
      legacyCaseArchive: [],
      transactions: f.b.transactions,
      enterprises: f.b.enterprises,
      users: f.b.users,
      currentUser: inv1,
      selectedCaseId: 'CASE-2C-DRAFT-DRAWER',
      onSubmitReport: () => {
        submitCalls += 1;
        return { ok: false, code: 'FORBIDDEN_ROLE', error: 'unexpected submit' };
      },
      onRequestRevision: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'unexpected revision' }),
      onConfirmAndCloseReport: () => ({ ok: false, code: 'FORBIDDEN_ROLE', error: 'unexpected confirm' }),
    },
    onUpdateTransaction: () => {
      drawerTxMutated = true;
    },
  });

  ui.changeById('wf04-alert-result-ALT-WF04-CAMPUS-04', 'Draft alert 04 result preserved');
  ui.changeById('wf04-alert-evidence-ALT-WF04-CAMPUS-04', 'Draft alert 04 evidence preserved');
  ui.changeById('wf04-report-summary', 'Unsent draft summary while inspecting AlertCaseDrawer');

  ui.clickButton(translations.vi.wf04Phase2a.caseQueue.openSourceAlertBtn);

  // Drawer opens with alertInspectionOverlay / alertInspectionDrawer + clean linked notice (no "Phase 2A")
  const overlays = ui.findAll(n => typeof n.props?.className === 'string' && n.props.className.includes('alertInspectionOverlay'));
  const drawers = ui.findAll(n => typeof n.props?.className === 'string' && n.props.className.includes('alertInspectionDrawer'));
  assert.equal(overlays.length, 1);
  assert.equal(drawers.length, 1);
  const fullTextOpen = ui.getFullText();
  assert.equal(fullTextOpen.includes(translations.vi.wf04Phase2a.alertQueue.linkedCaseDrawerNotice), true);
  assert.equal(fullTextOpen.includes('Phase 2A'), false);
  assert.equal(fullTextOpen.includes(translations.vi.wf04Phase2b.reportForm.discardDraftTitle), false);
  assert.equal(submitCalls, 0);
  assert.equal(drawerTxMutated, false);

  // Close drawer via Close button (aria-label 'Đóng chi tiết giao dịch') and verify unsent draft survives verbatim
  ui.clickByAriaLabel('Đóng chi tiết giao dịch');
  assert.equal(ui.findById('wf04-alert-result-ALT-WF04-CAMPUS-04').props.value, 'Draft alert 04 result preserved');
  assert.equal(ui.findById('wf04-alert-evidence-ALT-WF04-CAMPUS-04').props.value, 'Draft alert 04 evidence preserved');
  assert.equal(ui.findById('wf04-report-summary').props.value, 'Unsent draft summary while inspecting AlertCaseDrawer');
  assert.equal(submitCalls, 0);

  // (b) Reload + applyWf04DemoWorkspace / restorePreDemoWorkspace preserve cases, reports, conclusions, feedbacks, legacyCaseArchive, preDemoSnapshot
  const keptArchiveTx = {
    ...f.b.transactions.find(t => t.alertId === 'ALT-WF04-CAMPUS-04'),
    id: 'tx-legacy-keep-01',
    alertId: 'ALT-LEGACY-KEEP-01',
    caseId: 'CS-LEGACY-KEEP-01',
    caseStatus: 'Resolved',
  };
  const keptArchiveEntry = {
    archiveId: 'ARCH-KEEP-01',
    legacyCaseId: 'CS-LEGACY-KEEP-01',
    enterpriseId: 'ent-wf04-campus',
    alertIds: ['ALT-LEGACY-KEEP-01'],
    transactionIds: ['tx-legacy-keep-01'],
    transactionRefs: [keptArchiveTx.transactionReference],
    legacyCaseStatus: 'Resolved',
    reasonCode: 'MISSING_CREATION_PROVENANCE',
    reason: 'Archived legacy record',
    requiresManualReconciliation: true,
    blocksAlertCreation: true,
    transactions: [keptArchiveTx],
  };
  const persistedPayload = {
    ...f.base,
    investigationCases: assignedRes.nextCases,
    reportFeedbacks: [sentFeedback.value.feedback],
    legacyCaseArchive: [keptArchiveEntry],
  };
  const persistStorage = createScriptedStorage();
  const writeRes = storageMod.persistWorkspaceAndUsers({
    payload: persistedPayload,
    users: f.b.users,
    restoreStatus: 'ready',
    storage: persistStorage,
    operation: 'phase2c-regression',
    now: () => AT,
  });
  assert.equal(writeRes.ok, true, JSON.stringify(writeRes));

  const reloadedBeforeDemo = storageMod.restoreWorkspaceSnapshot({
    storage: persistStorage,
    defaultRules: f.b.rules,
    defaultEnterprises: f.b.enterprises,
    defaultProjects: f.b.projects,
    defaultTransactions: f.b.transactions,
    defaultUsers: f.b.users,
    defaultAuditLogs: [],
    migratedAt: AT,
  });
  assert.equal(reloadedBeforeDemo.status, 'ready');
  assert.equal(reloadedBeforeDemo.payload.investigationCases.length, 3);
  const reloadedClosedZero = reloadedBeforeDemo.payload.investigationCases.find(
    c => c.caseId === 'CASE-2C-CLOSE-ZERO'
  );
  assert.ok(reloadedClosedZero);
  assert.equal(reloadedClosedZero.reports.length, 1);
  assert.equal(
    reloadedClosedZero.conclusion.summary,
    'Final conclusion preserved without auto-feedback'
  );
  assert.equal(reloadedBeforeDemo.payload.reportFeedbacks.length, 1);
  assert.equal(reloadedBeforeDemo.payload.legacyCaseArchive.length, 1);

  const appliedDemo = demo.applyWf04DemoWorkspace({
    currentPayload: reloadedBeforeDemo.payload,
    currentUsers: f.b.users,
    savedAt: AT,
  });
  assert.ok(appliedDemo.payload.preDemoSnapshot);
  assert.equal(appliedDemo.payload.preDemoSnapshot.investigationCases.length, 3);
  assert.equal(appliedDemo.payload.preDemoSnapshot.reportFeedbacks.length, 1);
  assert.equal(appliedDemo.payload.preDemoSnapshot.legacyCaseArchive.length, 1);
  // Zero auto-feedback created when loading sample data over Closed cases
  assert.equal(appliedDemo.payload.reportFeedbacks.length, 1);
  assert.equal(appliedDemo.payload.legacyCaseArchive.some(a => a.archiveId === 'ARCH-KEEP-01'), true);
  assert.equal(appliedDemo.payload.investigationCases.some(c => c.caseId === 'CASE-2C-CLOSE-ZERO' && c.reports.length === 1 && c.conclusion.summary === 'Final conclusion preserved without auto-feedback'), true);

  assert.equal(
    storageMod.persistWorkspaceAndUsers({
      payload: appliedDemo.payload,
      users: appliedDemo.users,
      restoreStatus: 'ready',
      storage: persistStorage,
      operation: 'phase2c-demo-applied',
      now: () => AT,
    }).ok,
    true
  );
  const reloadedDuringDemo = storageMod.restoreWorkspaceSnapshot({
    storage: persistStorage,
    defaultRules: f.b.rules,
    defaultEnterprises: f.b.enterprises,
    defaultProjects: f.b.projects,
    defaultTransactions: f.b.transactions,
    defaultUsers: f.b.users,
    defaultAuditLogs: [],
    migratedAt: AT,
  });
  assert.equal(reloadedDuringDemo.status, 'ready');
  assert.ok(reloadedDuringDemo.payload.preDemoSnapshot);
  assert.equal(reloadedDuringDemo.payload.reportFeedbacks.length, 1);

  const restoredPreDemo = demo.restorePreDemoWorkspace({ currentPayload: reloadedDuringDemo.payload });
  assert.equal(restoredPreDemo.payload.preDemoSnapshot, undefined);
  assert.equal(restoredPreDemo.payload.investigationCases.length, 3);
  const restoredClosedZero = restoredPreDemo.payload.investigationCases.find(
    c => c.caseId === 'CASE-2C-CLOSE-ZERO'
  );
  assert.ok(restoredClosedZero);
  assert.equal(restoredClosedZero.reports.length, 1);
  assert.equal(
    restoredClosedZero.conclusion.summary,
    'Final conclusion preserved without auto-feedback'
  );
  assert.deepEqual(restoredPreDemo.payload.reportFeedbacks, reloadedBeforeDemo.payload.reportFeedbacks);
  assert.deepEqual(restoredPreDemo.payload.legacyCaseArchive, reloadedBeforeDemo.payload.legacyCaseArchive);

  // CSS sanity: zero missing styles.* keys across feedback/case/report/platform views against SecurityDashboard.module.css
  const cssSource = fs.readFileSync(
    path.join(ROOT, 'src/components/fraudguard-dashboard/SecurityDashboard.module.css'),
    'utf8'
  );
  for (const rel of [
    'ReportFeedbackModal.tsx',
    'ReportsView.tsx',
    'CasesView.tsx',
    'PlatformHealthView.tsx',
    'AlertCaseDrawer.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, 'src/components/fraudguard-dashboard', rel), 'utf8');
    const missing = [...src.matchAll(/styles\.([A-Za-z0-9_]+)/g)]
      .map(m => m[1])
      .filter(cls => !new RegExp(`\\.${cls}(?![A-Za-z0-9_-])`).test(cssSource));
    assert.deepEqual(missing, [], `Undefined CSS classes in ${rel}: ${missing.join(', ')}`);
  }
});

test('WF-04 dev sample tools gate requires both allowed env and explicit opt-in, cleans up helper on disable/unmount, and tolerates storage read errors', () => {
  const b = demo.getWf04DemoBundle();
  const base = {
    schemaVersion: 4,
    rules: b.rules,
    ruleSets: b.ruleSets,
    enterprises: b.enterprises,
    legacyUnassigned: [],
    projects: b.projects,
    transactions: b.transactions,
    auditLogs: [],
    investigationCases: [],
    legacyCaseArchive: [],
    migrationMeta: migration.migrateWorkspaceLegacyCases({
      transactions: [],
      enterprises: b.enterprises,
      projects: b.projects,
      users: b.users,
      sourceSchema: 'seed',
      migratedAt: AT,
    }).migrationMeta,
    wf04DemoActive: false,
  };

  // 1) Pure gate helper tests across production default, test-flag build, and development
  const queryAndStorageStorage = createScriptedStorage({ fg_wf04_dev_tools: '1' });
  const emptyStorage = createScriptedStorage();

  // Production without flag: ALWAYS disabled regardless of query or localStorage
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'production' },
      search: '?wf04Dev=1',
      storage: queryAndStorageStorage,
    }),
    false
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS: 'false' },
      search: '?wf04Dev=1',
      storage: queryAndStorageStorage,
    }),
    false
  );

  // Development or test-flag production WITHOUT explicit query or localStorage: disabled
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'development' },
      search: '',
      storage: emptyStorage,
    }),
    false
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS: 'true' },
      search: '',
      storage: emptyStorage,
    }),
    false
  );

  // Development OR NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS='true' + explicit query OR localStorage: enabled
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'development' },
      search: '?wf04Dev=1',
      storage: emptyStorage,
    }),
    true
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'development' },
      search: '',
      storage: queryAndStorageStorage,
    }),
    true
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS: 'true' },
      search: '?wf04Dev=1',
      storage: emptyStorage,
    }),
    true
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS: 'true' },
      search: '',
      storage: queryAndStorageStorage,
    }),
    true
  );

  // Throwing localStorage read does not crash and safely falls back to query or false
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'development' },
      search: '',
      getStorage: () => {
        throw new Error('SecurityError');
      },
    }),
    false
  );
  assert.equal(
    demo.resolveWf04DevToolsEnabled({
      env: { NODE_ENV: 'development' },
      search: '?wf04Dev=1',
      getStorage: () => {
        throw new Error('SecurityError');
      },
    }),
    true
  );

  // 2) Window binding + stale callback protection + repeated non-duplicating demo apply
  const targetWindow = {};
  let loadCalls = 0;
  let restoreCalls = 0;
  let currentDemoPayload = structuredClone(base);
  const cleanupEnabled = demo.syncWf04DevToolsWindowBinding({
    targetWindow,
    enabled: true,
    onLoadSampleData: () => {
      loadCalls += 1;
      currentDemoPayload = demo.applyWf04DemoWorkspace({
        includeReviewSamples: true,
        currentPayload: currentDemoPayload,
        currentUsers: b.users,
        savedAt: AT,
      }).payload;
    },
    onRestorePreDemo: () => {
      restoreCalls += 1;
      currentDemoPayload = demo.restorePreDemoWorkspace({
        currentPayload: currentDemoPayload,
      }).payload;
    },
    isDemoActive: () => Boolean(currentDemoPayload.wf04DemoActive),
  });

  // Binding alone must not auto-load data
  assert.equal(loadCalls, 0);
  assert.equal(typeof targetWindow.__fgWf04DevTools.loadSampleData, 'function');
  assert.equal(targetWindow.__fgWf04DevTools.isDemoActive(), false);

  const staleRef = targetWindow.__fgWf04DevTools;
  staleRef.loadSampleData();
  assert.equal(loadCalls, 1);
  assert.equal(staleRef.isDemoActive(), true);
  assert.equal(currentDemoPayload.investigationCases.some(c => c.caseId === 'CASE-SAMPLE-CLOSED'), true);
  const countAfterFirstLoad = currentDemoPayload.investigationCases.length;

  // Repeated load does not duplicate sample IDs
  staleRef.loadSampleData();
  assert.equal(currentDemoPayload.investigationCases.length, countAfterFirstLoad);

  // Disable / unmount deletes window.__fgWf04DevTools and neutralizes stale captured refs
  cleanupEnabled();
  assert.equal('__fgWf04DevTools' in targetWindow, false);
  staleRef.loadSampleData();
  staleRef.restorePreDemo();
  assert.equal(loadCalls, 2);
  assert.equal(restoreCalls, 0);
  assert.equal(staleRef.isDemoActive(), false);
  // Preserves already loaded data when disabled/unmounted
  assert.equal(currentDemoPayload.investigationCases.length, countAfterFirstLoad);

  // Binding when disabled clears any pre-existing property
  targetWindow.__fgWf04DevTools = staleRef;
  demo.syncWf04DevToolsWindowBinding({
    targetWindow,
    enabled: false,
    onLoadSampleData: () => {
      loadCalls += 1;
    },
    onRestorePreDemo: () => {
      restoreCalls += 1;
    },
    isDemoActive: () => true,
  });
  assert.equal('__fgWf04DevTools' in targetWindow, false);

  // 3) Exercise FraudGuardDashboard component lifecycle across env/opt-in/error/disable/unmount
  function mountDashboardScenario({ nodeEnv, enableFlag, search, storage }) {
    const windowObj = {
      location: { search },
      localStorage: storage,
      innerWidth: 1440,
      addEventListener() {},
      removeEventListener() {},
      getSelection: () => null,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    };
    const stateSlots = [];
    const memoSlots = [];
    const refSlots = [];
    const effectSlots = [];
    let stateIdx = 0;
    let memoIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;

    const fakeReact = {
      ...React,
      useState(init) {
        const i = stateIdx++;
        if (!(i in stateSlots)) {
          stateSlots[i] = typeof init === 'function' ? init() : init;
        }
        const setState = action => {
          stateSlots[i] = typeof action === 'function' ? action(stateSlots[i]) : action;
        };
        return [stateSlots[i], setState];
      },
      useReducer(reducer, initArg, initFn) {
        const i = stateIdx++;
        if (!(i in stateSlots)) {
          stateSlots[i] = initFn ? initFn(initArg) : initArg;
        }
        const dispatch = action => {
          stateSlots[i] = reducer(stateSlots[i], action);
        };
        return [stateSlots[i], dispatch];
      },
      useDeferredValue(v) {
        return v;
      },
      useRef(init) {
        const i = refIdx++;
        if (!(i in refSlots)) {
          refSlots[i] = { current: init };
        }
        return refSlots[i];
      },
      useMemo(fn, deps) {
        const i = memoIdx++;
        const prev = memoSlots[i];
        if (prev && deps && prev.deps && prev.deps.length === deps.length && prev.deps.every((d, idx) => Object.is(d, deps[idx]))) {
          return prev.value;
        }
        const value = fn();
        memoSlots[i] = { value, deps };
        return value;
      },
      useCallback(fn) {
        return fn;
      },
      useEffect(fn, deps) {
        const i = effectIdx++;
        effectSlots[i] = { fn, deps, cleanup: effectSlots[i]?.cleanup };
      },
    };

    const ts = require('typescript');
    const vm = require('node:vm');
    const cache = new Map();
    const resolveMod = (fromDir, spec) => {
      const targetBase = spec.startsWith('@/')
        ? path.join(ROOT, 'src', spec.slice(2))
        : path.resolve(fromDir, spec);
      for (const cand of [targetBase, `${targetBase}.ts`, `${targetBase}.tsx`, path.join(targetBase, 'index.ts'), path.join(targetBase, 'index.tsx')]) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
      }
      throw new Error(`Missing module ${spec}`);
    };
    const uiImports = createUiImports('vi');
    const loadDash = (rel, customEnv = { NODE_ENV: nodeEnv, NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS: enableFlag }) => {
      const filename = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
      if (cache.has(filename)) return cache.get(filename);
      const source = fs.readFileSync(filename, 'utf8');
      const transpiled = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      }).outputText;
      const mod = { exports: {} };
      cache.set(filename, mod.exports);
      const sb = {
        module: mod,
        exports: mod.exports,
        React: fakeReact,
        window: windowObj,
        document: {
          documentElement: { setAttribute() {}, getAttribute: () => 'dark' },
          addEventListener() {},
          removeEventListener() {},
          activeElement: null,
          body: {},
        },
        process: { env: customEnv },
        Error: globalThis.Error,
        URL: globalThis.URL,
        URLSearchParams: globalThis.URLSearchParams,
        Blob: globalThis.Blob,
        structuredClone,
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        setTimeout,
        clearTimeout,
        console,
        require(spec) {
          if (spec === 'react') return fakeReact;
          if (spec === 'react/jsx-runtime') return require('react/jsx-runtime');
          if (spec === 'next/navigation') {
            return {
              useRouter: () => ({
                push() {},
                replace() {},
                prefetch: async () => {},
                back() {},
                forward() {},
                refresh() {},
              }),
              useSearchParams: () => new URLSearchParams(search),
              usePathname: () => '/fraud-monitoring',
            };
          }
          if (spec in uiImports) {
            if (spec === '@/context/LanguageContext') {
              return {
                ...uiImports[spec],
                LanguageProvider: ({ children }) => children,
              };
            }
            if (spec === '@/context/ToastProvider') {
              return {
                ...uiImports[spec],
                ToastProvider: ({ children }) => children,
              };
            }
            return uiImports[spec];
          }
          if (spec.endsWith('.css')) {
            return new Proxy({}, { get: (_, prop) => (typeof prop === 'symbol' || prop === '__esModule' || prop === 'then' ? undefined : String(prop)) });
          }
          if (spec === 'lucide-react' || spec === 'recharts') {
            return new Proxy({}, { get: () => () => null });
          }
          if (spec.startsWith('@/') || spec.startsWith('.')) {
            return loadDash(resolveMod(path.dirname(filename), spec), customEnv);
          }
          return require(spec);
        },
      };
      vm.runInNewContext(transpiled, sb, { filename });
      cache.set(filename, mod.exports);
      return mod.exports;
    };

    const { FraudGuardDashboard } = loadDash('src/components/fraudguard-dashboard/FraudGuardDashboard.tsx');
    const flushEffects = (prevDepsList) => {
      for (let i = 0; i < effectSlots.length; i++) {
        const eff = effectSlots[i];
        const prevDeps = prevDepsList[i];
        const changed = !prevDeps || !eff.deps || prevDeps.length !== eff.deps.length || eff.deps.some((d, j) => !Object.is(d, prevDeps[j]));
        if (changed) {
          if (typeof eff.cleanup === 'function') eff.cleanup();
          eff.cleanup = eff.fn();
          prevDepsList[i] = eff.deps;
        }
      }
    };
    const renderPass = (prevDepsList) => {
      stateIdx = 0;
      memoIdx = 0;
      refIdx = 0;
      effectIdx = 0;
      const tree = FraudGuardDashboard({
        initialTransactions: b.transactions,
        initialRules: b.rules,
        initialProjects: b.projects,
        initialAuditLogs: [],
      });
      const html = renderToStaticMarkup(tree);
      flushEffects(prevDepsList);
      return html;
    };

    const prevDepsList = [];
    // Initial render + mount effects + re-render with updated effect states (max 4 passes)
    let html = '';
    for (let pass = 0; pass < 4; pass++) {
      html = renderPass(prevDepsList);
    }
    const unmount = () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    };
    return { windowObj, html, reRender: () => renderPass(prevDepsList), unmount };
  }

  // Case A: Normal production + ?wf04Dev=1 + localStorage='1' -> NO UI, NO window helper, NO auto-write
  const prodStorage = createScriptedStorage({ fg_wf04_dev_tools: '1' });
  const prodRun = mountDashboardScenario({
    nodeEnv: 'production',
    enableFlag: undefined,
    search: '?wf04Dev=1',
    storage: prodStorage,
  });
  assert.doesNotMatch(prodRun.html, /wf04-dev-sample-tools/);
  assert.equal('__fgWf04DevTools' in prodRun.windowObj, false);
  const rawProdAfterMount = prodStorage.store.get('fraudguard-demo-workspace-v4');
  assert.equal(rawProdAfterMount ? JSON.parse(rawProdAfterMount).wf04DemoActive : undefined, false);
  prodRun.unmount();

  // Case B: NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS='true' without query/localStorage -> hidden UI, no helper
  const flagNoOptStorage = createScriptedStorage();
  const flagNoOptRun = mountDashboardScenario({
    nodeEnv: 'production',
    enableFlag: 'true',
    search: '',
    storage: flagNoOptStorage,
  });
  assert.doesNotMatch(flagNoOptRun.html, /wf04-dev-sample-tools/);
  assert.equal('__fgWf04DevTools' in flagNoOptRun.windowObj, false);
  flagNoOptRun.unmount();

  // Case C: Development with throwing localStorage + NO query -> no crash, UI hidden, no helper
  const throwingStorage = {
    getItem() {
      throw new Error('Quota/Security failure');
    },
    setItem() {},
    removeItem() {},
  };
  const errStorageRun = mountDashboardScenario({
    nodeEnv: 'development',
    enableFlag: undefined,
    search: '',
    storage: throwingStorage,
  });
  assert.doesNotMatch(errStorageRun.html, /wf04-dev-sample-tools/);
  assert.equal('__fgWf04DevTools' in errStorageRun.windowObj, false);
  errStorageRun.unmount();

  // Case D: NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS='true' + localStorage='1' -> renders UI + registers helper;
  // zero auto-load before explicit call; manual load persists; turning off/unmounting removes helper & blocks stale callback
  const enabledStorage = createScriptedStorage({ fg_wf04_dev_tools: '1' });
  const enabledRun = mountDashboardScenario({
    nodeEnv: 'production',
    enableFlag: 'true',
    search: '',
    storage: enabledStorage,
  });
  assert.match(enabledRun.html, /wf04-dev-sample-tools/);
  assert.equal(typeof enabledRun.windowObj.__fgWf04DevTools?.loadSampleData, 'function');
  assert.equal(enabledRun.windowObj.__fgWf04DevTools.isDemoActive(), false);
  const preCallStored = JSON.parse(enabledStorage.store.get('fraudguard-demo-workspace-v4'));
  assert.equal(preCallStored.wf04DemoActive, false);
  assert.equal(preCallStored.investigationCases.some(c => c.caseId === 'CASE-SAMPLE-CLOSED'), false);

  const capturedHelper = enabledRun.windowObj.__fgWf04DevTools;
  capturedHelper.loadSampleData();
  enabledRun.reRender();
  const afterLoadStored = JSON.parse(enabledStorage.store.get('fraudguard-demo-workspace-v4'));
  assert.equal(afterLoadStored.wf04DemoActive, true);
  assert.equal(afterLoadStored.investigationCases.some(c => c.caseId === 'CASE-SAMPLE-CLOSED'), true);
  assert.ok(afterLoadStored.preDemoSnapshot);

  // Unmount removes window.__fgWf04DevTools and stale reference cannot restore/mutate workspace
  enabledRun.unmount();
  assert.equal('__fgWf04DevTools' in enabledRun.windowObj, false);
  capturedHelper.restorePreDemo();
  const afterStaleCall = JSON.parse(enabledStorage.store.get('fraudguard-demo-workspace-v4'));
  assert.equal(afterStaleCall.wf04DemoActive, true);
  assert.equal(afterStaleCall.investigationCases.some(c => c.caseId === 'CASE-SAMPLE-CLOSED'), true);
});

test('Case detail modal renders widened caseDetailModal and accurate 3-column Processing History table across roles, revisions, ms ordering, and long details', () => {
  const b = demo.getWf04DemoBundle();
  const operator = b.users.find(u => u.id === 'usr-wf04-op');
  const inv = b.users.find(u => u.id === 'usr-wf04-inv-1');
  const casesUiVi = load('src/components/fraudguard-dashboard/CasesView.tsx', createUiImports('vi'));
  const casesUiEn = load('src/components/fraudguard-dashboard/CasesView.tsx', createUiImports('en'));
  const { CasesView: CasesViewVi, buildCaseProcessingHistoryRows } = casesUiVi;
  const { CasesView: CasesViewEn } = casesUiEn;

  const meta = migration.migrateWorkspaceLegacyCases({
    transactions: [],
    enterprises: b.enterprises,
    projects: b.projects,
    users: b.users,
    sourceSchema: 'seed',
    migratedAt: AT,
  });
  const base = {
    schemaVersion: 4,
    rules: b.rules,
    ruleSets: b.ruleSets,
    enterprises: b.enterprises,
    legacyUnassigned: [],
    projects: b.projects,
    transactions: b.transactions,
    auditLogs: [],
    investigationCases: [],
    legacyCaseArchive: [],
    migrationMeta: meta.migrationMeta,
    wf04DemoActive: false,
  };
  const storage = createScriptedStorage();
  let clock = '2026-11-18T08:00:00.000Z';
  const renderHook = createInvestigationHookHarness({
    enterprises: b.enterprises,
    projects: b.projects,
    alerts: b.transactions,
    users: b.users,
    initialCases: [],
    initialFeedbacks: [],
    legacyArchive: [],
    restoreStatus: 'ready',
    storage,
    now: () => clock,
    persistUsersWithWorkspace: true,
    buildWorkspacePayload: ({ nextCases, nextFeedbacks }) => ({
      ...base,
      investigationCases: nextCases,
      reportFeedbacks: nextFeedbacks,
    }),
  });

  // 1) Open unassigned case -> assign Investigator -> submit v1 -> Operator requests revision -> submit v2 -> confirm Closed
  let h = renderHook({ currentActor: operator });
  assert.equal(
    h.createCase({ caseId: 'CASE-HIST-INV', alertIds: ['ALT-WF04-CAMPUS-01'], note: 'Initial alert intake' }).ok,
    true
  );
  h = renderHook({ currentActor: operator });

  // Check Open unassigned UI 3-column table
  const openHtml = renderToStaticMarkup(
    React.createElement(CasesViewVi, {
      investigationCases: h.cases,
      legacyCaseArchive: [],
      transactions: b.transactions,
      enterprises: b.enterprises,
      users: b.users,
      currentUser: operator,
      selectedCaseId: 'CASE-HIST-INV',
    })
  );
  assert.match(openHtml, /caseDetailModal/);
  assert.match(openHtml, /<table class="[^"]*caseHistoryTable/);
  assert.match(openHtml, />Sự kiện<\/th>/);
  assert.match(openHtml, />Thực hiện bởi<\/th>/);
  assert.match(openHtml, />Ngày\/giờ<\/th>/);
  assert.doesNotMatch(openHtml, />Người đảm nhận<\/th>/);
  assert.doesNotMatch(openHtml, />Trạng thái sau sự kiện<\/th>/);
  assert.doesNotMatch(openHtml, />Ngày<\/th>/);
  assert.doesNotMatch(openHtml, />Giờ<\/th>/);
  assert.doesNotMatch(openHtml, /Thực hiện bởi:/);
  assert.match(openHtml, /Chưa phân công/);

  clock = '2026-11-18T08:05:00.000Z';
  h = renderHook({ currentActor: operator });
  assert.equal(h.assignInvestigator({ caseId: 'CASE-HIST-INV', assigneeId: inv.id }).ok, true);

  clock = '2026-11-18T08:10:00.000Z';
  h = renderHook({ currentActor: inv });
  assert.equal(
    h.submitReport({
      caseId: 'CASE-HIST-INV',
      summary: 'Draft v1 summary',
      expectedBaseVersion: 0,
      expectedStatus: 'Investigating',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Check HVAC', evidence: 'Log 1' }],
    }).ok,
    true
  );

  clock = '2026-11-18T08:15:00.000Z';
  h = renderHook({ currentActor: operator });
  const v1 = h.cases[0].reports[0];
  const longReason = 'Long revision request reason exceeding one hundred forty characters: please verify nightly HVAC meter spikes against scheduled maintenance work orders A-101 and B-202 before closing.';
  assert.equal(
    h.requestRevision({
      caseId: 'CASE-HIST-INV',
      expectedReportId: v1.reportId,
      expectedReportVersion: v1.version,
      reason: longReason,
    }).ok,
    true
  );

  clock = '2026-11-18T08:20:00.000Z';
  h = renderHook({ currentActor: inv });
  assert.equal(
    h.submitReport({
      caseId: 'CASE-HIST-INV',
      summary: 'Final v2 summary',
      expectedBaseVersion: 1,
      expectedStatus: 'Investigating',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-01', resultText: 'Verified abnormal', evidence: 'Log 1 + Log 2' }],
    }).ok,
    true
  );

  clock = '2026-11-18T08:25:00.000Z';
  h = renderHook({ currentActor: operator });
  const v2 = h.cases[0].reports[1];
  assert.equal(
    h.confirmAndCloseReport({
      caseId: 'CASE-HIST-INV',
      reportId: v2.reportId,
      reportVersion: v2.version,
      finalSummary: 'Confirmed and closed',
    }).ok,
    true
  );
  h = renderHook({ currentActor: operator });

  const closedInvCase = h.cases[0];
  const invRows = buildCaseProcessingHistoryRows({
    history: closedInvCase.history,
    resolveActorName: ref => (ref ? ref.name || ref.actorId : translations.vi.wf04Phase2a.caseQueue.unassignedLabel),
    dateLocale: 'vi-VN',
    t: translations.vi,
  });
  assert.equal(invRows.length, 6);
  // Column 2 must always use evt.actor (e.g. Operator assigns Investigator -> Operator, not Investigator)
  assert.deepEqual(
    invRows.map(r => r.actorName),
    [operator.name, operator.name, inv.name, operator.name, inv.name, operator.name]
  );
  assert.match(invRows[2].eventLabel, /v1/);
  assert.match(invRows[3].eventLabel, /v1/);
  assert.match(invRows[4].eventLabel, /v2/);
  assert.match(invRows[5].eventLabel, /v2/);
  for (const row of invRows) {
    assert.match(row.dateTimeText, /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/);
    assert.equal(row.dateTimeText.includes('.000'), false);
  }
  assert.equal(invRows[3].reason, longReason);

  // Rendered VI modal keeps current assignee and status in case summary/assignment sections, uses 3-column table, <details> for >140 chars, inline for <=140 chars
  const closedHtmlVi = renderToStaticMarkup(
    React.createElement(CasesViewVi, {
      investigationCases: h.cases,
      legacyCaseArchive: [],
      transactions: b.transactions,
      enterprises: b.enterprises,
      users: b.users,
      currentUser: operator,
      selectedCaseId: 'CASE-HIST-INV',
    })
  );
  assert.match(closedHtmlVi, /<details class="[^"]*caseHistoryDetails"/);
  assert.match(closedHtmlVi, /<summary class="[^"]*caseHistorySummary"/);
  assert.match(closedHtmlVi, /Long revision request reason exceeding one hundred forty characters/);
  assert.match(closedHtmlVi, /Initial alert intake/);
  assert.doesNotMatch(closedHtmlVi, /Thực hiện bởi:/);
  assert.match(closedHtmlVi, new RegExp(inv.name));
  assert.match(closedHtmlVi, /Đã đóng/);

  // EN rendering checks 3 headers without repeating Performed by under Event, while keeping My Cases clean for Investigator
  const closedHtmlEn = renderToStaticMarkup(
    React.createElement(CasesViewEn, {
      investigationCases: h.cases,
      legacyCaseArchive: [],
      transactions: b.transactions,
      enterprises: b.enterprises,
      users: b.users,
      currentUser: inv,
      selectedCaseId: 'CASE-HIST-INV',
    })
  );
  assert.match(closedHtmlEn, />Event<\/th>/);
  assert.match(closedHtmlEn, />Performed by<\/th>/);
  assert.match(closedHtmlEn, />Date\/time<\/th>/);
  assert.doesNotMatch(closedHtmlEn, />Assignee<\/th>/);
  assert.doesNotMatch(closedHtmlEn, />Status after event<\/th>/);
  assert.doesNotMatch(closedHtmlEn, /Performed by:/);
  const invQueueTbody = closedHtmlEn.match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(invQueueTbody);
  assert.doesNotMatch(invQueueTbody[1], /v2\s*·/);

  // 2) Operator self-investigate path
  clock = '2026-11-18T09:00:00.000Z';
  h = renderHook({ currentActor: operator });
  assert.equal(h.createCase({ caseId: 'CASE-HIST-SELF', alertIds: ['ALT-WF04-CAMPUS-02'] }).ok, true);
  clock = '2026-11-18T09:01:00.000Z';
  h = renderHook({ currentActor: operator });
  assert.equal(h.selfAssign({ caseId: 'CASE-HIST-SELF' }).ok, true);
  clock = '2026-11-18T09:02:00.000Z';
  h = renderHook({ currentActor: operator });
  assert.equal(
    h.submitReport({
      caseId: 'CASE-HIST-SELF',
      summary: 'Operator self report',
      expectedBaseVersion: 0,
      expectedStatus: 'Investigating',
      alertResults: [{ alertId: 'ALT-WF04-CAMPUS-02', resultText: 'OK', evidence: 'Verified log' }],
    }).ok,
    true
  );
  h = renderHook({ currentActor: operator });
  const selfCase = h.cases.find(c => c.caseId === 'CASE-HIST-SELF');
  clock = '2026-11-18T09:03:00.000Z';
  assert.equal(
    h.confirmAndCloseReport({
      caseId: 'CASE-HIST-SELF',
      reportId: selfCase.reports[0].reportId,
      reportVersion: 1,
      finalSummary: 'Operator self closed',
    }).ok,
    true
  );
  h = renderHook({ currentActor: operator });
  const finalSelfCase = h.cases.find(c => c.caseId === 'CASE-HIST-SELF');
  const selfRows = buildCaseProcessingHistoryRows({
    history: finalSelfCase.history,
    resolveActorName: ref => (ref ? ref.name || ref.actorId : translations.vi.wf04Phase2a.caseQueue.unassignedLabel),
    dateLocale: 'vi-VN',
    t: translations.vi,
  });
  assert.deepEqual(
    selfRows.map(r => r.actorName),
    [operator.name, operator.name, operator.name, operator.name]
  );

  // 3) Edge cases: millisecond sorting without displaying ms, equal-timestamp stability, long actor name, empty history
  const longActorName = 'Nguyen Tran Hoang Long (Truong ca truc van hanh he thong giam sat gian lan lien vung)';
  const msAndLongRows = buildCaseProcessingHistoryRows({
    history: [
      {
        eventId: 'evt-ms-5',
        type: 'REPORT_SUBMITTED',
        at: '2026-11-18T10:15:30.005Z',
        actor: { actorId: inv.id, role: 'Investigator', name: longActorName },
        reportVersion: 1,
        fromStatus: 'Investigating',
        toStatus: 'Pending Review',
      },
      {
        eventId: 'evt-ms-1',
        type: 'INVESTIGATOR_ASSIGNED',
        at: '2026-11-18T10:15:30.001Z',
        actor: { actorId: operator.id, role: 'Operator', name: operator.name },
        assignee: { actorId: inv.id, role: 'Investigator', name: inv.name },
        fromStatus: 'Open',
        toStatus: 'Investigating',
      },
      {
        eventId: 'evt-tie-a',
        type: 'REVISION_REQUESTED',
        at: '2026-11-18T10:15:30.005Z',
        actor: { actorId: operator.id, role: 'Operator', name: operator.name },
        reportVersion: 1,
        reason: 'Please verify meter reading log',
      },
    ],
    resolveActorName: ref => ref?.name || 'Unknown',
    dateLocale: 'vi-VN',
    t: translations.vi,
  });
  assert.deepEqual(msAndLongRows.map(r => r.eventId), ['evt-ms-1', 'evt-ms-5', 'evt-tie-a']);
  assert.equal(msAndLongRows[0].actorName, operator.name);
  assert.equal(msAndLongRows[1].actorName, longActorName);
  assert.equal(msAndLongRows[0].dateTimeText.includes('.001'), false);
  assert.equal(msAndLongRows[1].dateTimeText.includes('.005'), false);

  // Empty history renders timelineEmpty without crashing
  const emptyHistHtml = renderToStaticMarkup(
    React.createElement(CasesViewVi, {
      investigationCases: [{ ...closedInvCase, history: [] }],
      legacyCaseArchive: [],
      transactions: b.transactions,
      enterprises: b.enterprises,
      users: b.users,
      currentUser: operator,
      selectedCaseId: 'CASE-HIST-INV',
    })
  );
  assert.match(emptyHistHtml, new RegExp(translations.vi.wf04Phase2a.caseQueue.timelineEmpty));
  assert.doesNotMatch(emptyHistHtml, /caseHistoryTable/);
});
