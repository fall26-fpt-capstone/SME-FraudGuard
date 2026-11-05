const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(relative, imports = {}) {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    structuredClone,
    require: (name) => {
      if (name in imports) return imports[name];
      if (/^@\/(utils|data|config|routes|hooks)\//.test(name)) {
        const sub = `src/${name.slice(2)}`;
        return load(fs.existsSync(path.join(root, `${sub}.ts`)) ? `${sub}.ts` : `${sub}.tsx`, imports);
      }
      if (name === './transaction-origin') return load('src/utils/transaction-origin.ts', imports);
      if (name.startsWith('./')) {
        const base = path.relative(root, path.resolve(path.dirname(filename), name)).replace(/\\/g, '/');
        if (fs.existsSync(path.join(root, `${base}.tsx`))) return load(`${base}.tsx`, imports);
        if (fs.existsSync(path.join(root, `${base}.ts`))) return load(`${base}.ts`, imports);
      }
      return require(name);
    },
  }, { filename });
  return exports;
}

test('CSV preserves Vietnamese and special characters while neutralizing spreadsheet formulas', () => {
  const { serializeCSV } = load('src/utils/export-csv.ts');
  const csv = serializeCSV([['Tên dự án', 'Số tiền'], ['An "Phúc", #1\nDòng 2', 15000000], ['=1+1', -5]]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('"An ""Phúc"", #1\nDòng 2","15000000"'));
  assert.ok(csv.includes('"\'=1+1","-5"'));
});

test('member role changes wait until assigned cases are reassigned or closed', () => {
  const { canSaveMember } = loadRoles();
  const admin = { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'SME Admin', enterpriseId: 'company' };
  const member = { id: 'member', name: 'Member', email: 'member@example.test', role: 'Investigator', enterpriseId: 'company' };
  const changed = { ...member, role: 'Operator' };
  const active = { scoringSource: 'AI', caseId: 'case', assignedInvestigatorId: member.id, assignedInvestigator: 'Old name', caseStatus: 'Assigned' };
  for (const caseStatus of ['Assigned', 'Investigating', 'Reported']) assert.equal(canSaveMember(admin, changed, [admin, member], [{ ...active, caseStatus }]), false);
  assert.equal(canSaveMember(admin, changed, [admin, member], [{ ...active, assignedInvestigatorId: 'other' }]), true);
  for (const caseStatus of ['Confirmed Fraud', 'False Alarm', 'Resolved']) assert.equal(canSaveMember(admin, changed, [admin, member], [{ ...active, caseStatus }]), true);
  assert.equal(canSaveMember(admin, member, [admin, member], [active]), true);
});

test('case lifecycle keeps assignment by ID through renamed users and enterprise decisions', () => {
  const { canUpdateCase, isCaseAssignee } = load('src/utils/case-workflow.ts');
  const operator = { id: 'op', name: 'Operator', role: 'Operator' };
  const investigator = { id: 'inv', name: 'New name', role: 'Investigator' };
  const alert = { id: 'tx', projectId: 'p', riskLevel: 'Abnormal', scoringSource: 'AI' };
  const assigned = { ...alert, caseId: 'case', caseStatus: 'Assigned', assignedInvestigatorId: 'inv', assignedInvestigator: 'Old name' };
  assert.equal(canUpdateCase(alert, assigned, operator), true);
  assert.equal(isCaseAssignee(assigned, investigator), true);
  assert.equal(isCaseAssignee(assigned, { id: 'other', name: 'Old name' }), false);
  const working = { ...assigned, caseStatus: 'Investigating' };
  assert.equal(canUpdateCase(assigned, working, investigator), true);
  const report = { ...working, caseStatus: 'Reported', investigationReport: { finding: 'Legitimate', notes: 'Verified against evidence', submittedBy: 'New name' } };
  assert.equal(canUpdateCase(working, report, investigator), true);
  const closed = { ...report, caseStatus: 'False Alarm', caseDecision: { directive: 'Reviewed evidence', status: 'False Alarm' } };
  assert.equal(canUpdateCase(report, closed, investigator), false);
  assert.equal(canUpdateCase(report, closed, { ...operator, role: 'SME Admin' }), false);
  assert.equal(canUpdateCase(report, closed, operator), true);
  assert.equal(canUpdateCase(closed, assigned, operator), false);
});

test('investigator report uses account ID first and supports legacy name assignments', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const translations = load('src/config/translations.ts').translations;
  const component = load('src/components/fraudguard-dashboard/ReportsView.tsx', {
    '@/utils/export-csv': {},
    './RiskLevelBadge': { RiskLevelBadge: () => null },
    './ScoringSourceBadge': { ScoringSourceBadge: () => null },
    '@/context/ToastProvider': { useToast: () => ({ toast() {} }) },
    '@/context/LanguageContext': { useLanguage: () => ({ language: 'vi', t: translations.vi }) },
    './SecurityDashboard.module.css': { default: {} },
  }).ReportsView;
  const base = { scoringSource: 'AI', caseId: 'CASE', caseStatus: 'Assigned', riskLevel: 'Abnormal', processedAt: new Date().toISOString(), projectId: 'p1', projectName: 'Wallet' };
  const html = renderToStaticMarkup(React.createElement(component, {
    currentUser: { id: 'owner', name: 'New name', role: 'Investigator' },
    transactions: [
      { ...base, id: '1', transactionReference: 'ID-OWNED', assignedInvestigatorId: 'owner', assignedInvestigator: 'Old name' },
      { ...base, id: '2', transactionReference: 'OTHER-OWNER', assignedInvestigatorId: 'other', assignedInvestigator: 'New name' },
      { ...base, id: '3', transactionReference: 'LEGACY-OWNED', assignedInvestigator: 'New name' },
    ],
  }));
  assert.match(html, /ID-OWNED/);
  assert.match(html, /LEGACY-OWNED/);
  assert.doesNotMatch(html, /OTHER-OWNER/);
});
const engine = load('src/utils/rule-sandbox.ts');
const { evaluateSandboxRule: evaluate, nextSandboxVersion } = engine;
const lifecycle = load('src/utils/rule-lifecycle.ts', { './rule-sandbox': engine });
const rules = load('src/data/fraudguard-rules.ts').fraudGuardRules;
const condition = (field, operator, value) => ({ type: 'condition', id: field, field, operator, value });
const group = (logic, children) => ({ type: 'group', id: 'group', logic, children });
const rule = (node) => ({ ...rules[0], conditionGroup: group('AND', [node]) });
const tx = (fields, extra = {}) => ({ projectId: 'proj-abc-cod', transactionType: 'payment', fields, ...extra });

test('selected condition tree and nested AND/OR directly determine the result', () => {
  const r = rule(group('OR', [condition('amount', '>', 100), group('AND', [condition('channel', '==', 'COD'), condition('amount', '>=', 50)])]));
  assert.equal(evaluate(r, tx({ amount: 50, channel: 'COD' })).actualAnomaly, true);

  assert.equal(evaluate(r, tx({ amount: 50, channel: 'Online' })).actualAnomaly, false);
});

test('all supported operators preserve number, text and boolean semantics', () => {
  for (const [actual, operator, expected, matched] of [
    [10, '>', 10, false], [10, '>=', 10, true], [10, '<', 10, false], [10, '<=', 10, true],
    [10, '==', '10', true], [10, '!=', 10, false], [false, '==', 'false', true],
    ['VN', 'in', 'VN,SG', true], ['VN', 'not_in', '["SG","US"]', true],
    [10, 'in', '[5,10]', true], [10, 'between', '10,20', true], [20, 'between', '[10,20]', true],
    [21, 'between', '10,20', false],
  ]) assert.equal(evaluate(rule(condition('field', operator, expected)), tx({ field: actual })).actualAnomaly, matched);
});

test('invalid/missing data raises an error even in an OR branch', () => {
  assert.throws(() => evaluate(rule(group('OR', [condition('amount', '>', 1), condition('missing', '!=', 0)])), tx({ amount: 20 })), /Missing sample field/);
  for (const [actual, operator, expected] of [[true, '>', 0], [10, '>', ''], [10, 'between', '20,10'], [10, 'in', ''], [true, '==', 'yes']]) {
    assert.throws(() => evaluate(rule(condition('field', operator, expected)), tx({ field: actual })));
  }
  assert.throws(() => evaluate(rule(group('AND', [])), tx({})), /Empty/);
  assert.throws(() => evaluate(rule(condition('field', 'unknown', 1)), tx({ field: 1 })), /Unsupported/);
});

test('results contain no risk score and a matching rule always returns abnormal', () => {
  const result = evaluate(rule(condition('amount', '>', 0)), tx({ amount: 1 }));
  assert.equal(result.actualAnomaly, true);
  assert.equal('actualScore' in result, false);
  assert.equal(result.triggered.length, 1);
});

test('project/type applicability is enforced; disabled drafts can be tested', () => {
  const r = { ...rules[0], enabled: false, appliesTo: { projects: ['proj-abc-cod'], transactionTypes: ['payment'] } };
  assert.equal(evaluate(r, tx({ amount: 20000000, channel: 'COD' })).actualAnomaly, true);
  assert.equal(evaluate(r, tx({}, { projectId: 'other' })).actualAnomaly, false);
  assert.equal(evaluate(r, tx({}, { transactionType: 'refund' })).actualAnomaly, false);
});

test('versions advance from the selected version and reject unsupported formats', () => {
  assert.equal(nextSandboxVersion('v1.2'), 'v1.3');
  assert.equal(nextSandboxVersion('2.4.9'), 'v2.4.10');
  assert.equal(nextSandboxVersion('v2.0'), 'v2.1');
  assert.equal(nextSandboxVersion('draft'), null);
});

// Exercise the real component handlers without a browser; this is not a DOM/E2E test.
function harness(initialRules = rules, withPublisher = true, extraProps = {}) {
  const states = [], effectDeps = [], toasts = [], published = [];
  let cursor, effects, dirty, tree, props;
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      return [states[slot], (value) => { const next = typeof value === 'function' ? value(states[slot]) : value; if (!Object.is(next, states[slot])) { states[slot] = next; dirty = true; } }];
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!effectDeps[slot] || deps.some((d, i) => !Object.is(d, effectDeps[slot][i]))) { effectDeps[slot] = deps; effects.push(effect); }
    },
  };
  const translations = load('src/config/translations.ts').translations;
  const component = load('src/components/fraudguard-dashboard/RuleTestingView.tsx', {
    './ReadableConditions': load('src/components/fraudguard-dashboard/ReadableConditions.tsx', { './SecurityDashboard.module.css': { default: {} } }),
    react, './RuleSetTestingView': { RuleSetTestingView: () => null }, '@/utils/rule-sandbox': engine, '@/utils/rule-lifecycle': lifecycle, './SecurityDashboard.module.css': { default: {} },
    'lucide-react': { Play: 'icon', Check: 'icon', Sliders: 'icon' },
    '@/context/ToastProvider': { useToast: () => ({ toast: (...args) => toasts.push(args) }) },
    '@/context/LanguageContext': { useLanguage: () => ({ language: 'en', t: translations.en }) },
  }).RuleTestingView;
  props = { rules: initialRules, onPublishRule: withPublisher ? (r) => { published.push(r); props.rules = props.rules.map((old) => old.id === r.id ? r : old); } : undefined };
  function render() {
    for (let i = 0; i < 10; i++) { cursor = 0; effects = []; dirty = false; tree = component(props); effects.forEach((e) => e()); if (!dirty) return; }
    throw Error('Render did not settle');
  }
  function nodes() { const result = []; function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object' && n.props) { result.push(n); walk(n.props.children); } } walk(tree); return result; }
  const action = (name) => nodes().find((n) => n.type === 'button' && n.props.onClick?.name === name);
  const click = (name) => { const button = action(name); assert.ok(button); if (!button.props.disabled) button.props.onClick(); render(); };
  const change = (id, value) => { nodes().find((n) => n.props.id === id).props.onChange({ target: { value } }); render(); };
  Object.assign(props, extraProps);
  render();
  nodes().find(n => n.props.id === 'sandbox-single-mode')?.props.onClick(); render();
  return { action, click, change, nodes, toasts, published, render };
}

test('sandbox isolates the selected enterprise even when active sets reuse rule IDs', () => {
  const activeRules = ['p1', 'p2'].map(project => ({ ...rules[0], appliesTo: { ...rules[0].appliesTo, projects: [project] } }));
  const ui = harness(rules, true, { activeRules, enterprises: [
    { id: 'e1', name: 'First', projectIds: ['p1'] },
    { id: 'e2', name: 'Second', projectIds: ['p2'] },
  ] });
  ui.nodes().find(n => n.type === 'button' && n.props.children === 'Rule set test').props.onClick(); ui.render();
  let sandbox = ui.nodes().find(n => n.props.enterpriseLabel === 'First');
  assert.equal(sandbox.props.rules.length, 1);
  assert.equal(sandbox.props.rules[0].appliesTo.projects[0], 'p1');
  ui.nodes().find(n => n.type === 'select' && n.props.value === 'e1').props.onChange({ target: { value: 'e2' } }); ui.render();
  sandbox = ui.nodes().find(n => n.props.enterpriseLabel === 'Second');
  assert.equal(sandbox.props.rules.length, 1);
  assert.equal(sandbox.props.rules[0].appliesTo.projects[0], 'p2');
});

test('deployment sandbox directs publication to the enterprise draft instead of individual rules', () => {
 let opened;
 const ui = harness(rules, false, { enterprises: [{ id: 'e1', name: 'First', projectIds: ['p1'] }], onOpenDraft: id => { opened = id; } });
 assert.equal(ui.nodes().some(n => n.props.id === 'sandbox-single-mode'), false);
 assert.equal(ui.action('handlePublishVersion'), undefined);
 ui.nodes().find(n => n.type === 'button' && n.props.children === 'Open rule set to test the draft').props.onClick();
 assert.equal(opened, 'e1');
});

test('publish requires a passing current test; changing rules invalidates even if reverted', () => {
  const ui = harness(rules.map(r => lifecycle.saveRuleDraft(r, { ...r, description: r.description + " revised" })));
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
  ui.click('handleRunSandboxTest');
  assert.match(ui.toasts.at(-1)[1], /5\/5/);
  assert.equal(ui.action('handlePublishVersion').props.disabled, false);
  ui.change('sandbox-rule', 'rule-cod-002');
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
  ui.change('sandbox-rule', 'rule-cod-001');
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
  ui.click('handleRunSandboxTest');
  ui.click('handlePublishVersion');
  assert.equal(ui.published[0].version, 'v1.1');
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
});

test('changed conditions fail independent labels and missing fields block publishing', () => {
  const changed = {...rules[0], conditionGroup: group('AND', [condition('amount', '>', 15000000)])};
  const ui = harness([changed, ...rules.slice(1)]);
  ui.click('handleRunSandboxTest');
  assert.match(ui.toasts.at(-1)[1], /4\/5/);
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
  ui.change('sandbox-rule', 'rule-cod-004');
  ui.click('handleRunSandboxTest');
  assert.match(ui.toasts.at(-1)[1], /5\/5/);
  ui.change('sandbox-rule', 'rule-001');
  ui.click('handleRunSandboxTest');
  assert.ok(ui.nodes().some((n) => n.props.role === 'alert' && JSON.stringify(n.props.children).includes('velocity.tx_count.1h')));
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
});

test('no rules or no publish callback cannot report a successful publication', () => {
  assert.equal(harness([]).action('handleRunSandboxTest').props.disabled, true);
  const ui = harness(rules, false);
  ui.click('handleRunSandboxTest');
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
});

test('demo rule and fallback transactions agree with triggered rules and alerts', () => {
  const transactions = load('src/data/fraudguard-transactions.ts').fraudGuardTransactions;
  for (const tx of transactions) {
    assert.equal('riskScore' in tx, false);
    assert.ok(['Normal', 'Abnormal'].includes(tx.riskLevel));
    if (tx.scoringSource !== 'AI') {
      assert.equal(tx.riskLevel === 'Abnormal', tx.triggeredRules.length > 0, tx.id);
      if (tx.riskLevel === 'Abnormal') assert.ok(tx.alertId, tx.id);
    }
  }
  for (const rule of rules) {
    assert.equal('riskPoints' in rule, false);
    assert.equal('threshold' in rule, false);
  }
});

test('CSV exports classification, source and explanation without a score', async () => {
  let blob;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/export-csv.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Blob, setTimeout: callback => callback(),
    URL: {createObjectURL(value) {blob = value; return 'blob:test';}, revokeObjectURL() {}},
    document: {body: {appendChild() {}}, createElement() {return {click() {}, remove() {}};}},
  });
  exports.exportTransactionsCSV([{riskLevel:'Abnormal', transactionReference:'test', projectName:'demo', transactionType:'payment', scoringSource:'RULE', triggeredRules:['rule-a','rule-b'], explanation:'Matched "amount", review required', entityReference:'entity', processedAt:'2026-10-12'}]);
  const csv = await blob.text();
  assert.doesNotMatch(csv.split('\n')[0], /score/i);
  assert.match(csv, /Detection Result.*Detection Source.*Triggered Rules.*Explanation/);
  assert.match(csv, /"Abnormal"/);
  assert.match(csv, /"rule-a; rule-b"/);
  assert.match(csv, /"Matched ""amount"", review required"/);
});

test('draft edits never overwrite the active definition; publication preserves history and activation', () => {
  const live = rules[0];
  const edited = { ...live, name: 'Changed', conditionGroup: group('AND', [condition('amount', '>', 15000000)]) };
  const saved = lifecycle.saveRuleDraft(live, edited);
  assert.equal(saved.name, live.name);
  assert.equal(saved.conditionGroup, live.conditionGroup);
  assert.equal(saved.draft.name, 'Changed');
  const published = lifecycle.publishRuleDraft(saved);
  assert.equal(published.name, 'Changed');
  assert.equal(published.version, 'v1.1');
  assert.equal(published.history[0].name, live.name);
  assert.equal(published.enabled, live.enabled);
  assert.throws(() => lifecycle.publishRuleDraft(published), /No draft/);
});
test('new rule first publication is v1.0 and disabled; forged lifecycle fields are discarded on save', () => {
  const saved = lifecycle.saveRuleDraft(undefined, { ...rules[0], version: 'v99.9', enabled: true });
  assert.equal(saved.status, 'Draft');
  assert.equal(saved.enabled, false);
  assert.equal(saved.version, 'v1.0');
  const published = lifecycle.publishRuleDraft(saved);
  assert.equal(published.version, 'v1.0');
  assert.equal(published.enabled, false);
});
test('unchanged published rule cannot be republished after a passing sandbox run', () => {
  const ui = harness(); ui.click('handleRunSandboxTest');
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
});

const ingestion = load('src/utils/ingestion-validation.ts');
test('CSV and JSON validation reads content and rejects incomplete transactions', () => {
  const row = { timestamp: '2026-10-12T01:00:00Z', amount: 100, currency: 'VND', transaction_type: 'payment', user_hash: 'user,one' };
  assert.equal(ingestion.validateIngestion(JSON.stringify([row]), 'sample.json'), 1);
  assert.equal(ingestion.validateIngestion('timestamp,amount,currency,transaction_type,user_hash\r\n2026-10-12T01:00:00Z,100,VND,payment,"user,one"', 'sample.csv'), 1);
  assert.throws(() => ingestion.validateIngestion(JSON.stringify([{ ...row, amount: -1 }]), 'sample.json'), /Invalid/);
  assert.throws(() => ingestion.validateIngestion(JSON.stringify([{}]), 'sample.json'), /Missing/);
  assert.throws(() => ingestion.validateIngestion('timestamp,amount\n"unfinished', 'sample.csv'), /Unclosed/);
  assert.throws(() => ingestion.validateIngestion('[]', 'sample.xlsx'), /CSV/);
});
test('saving an unchanged published definition does not create a publishable draft', () => {
  assert.equal(lifecycle.saveRuleDraft(rules[0], { ...rules[0] }).draft, undefined);
});

test('custom dataset supports new rules, rejects out-of-scope samples, and edits invalidate publication', () => {
  const draft = lifecycle.saveRuleDraft(undefined, { ...rules[0], id: 'custom-qa', appliesTo: { projects: ['qa'], transactionTypes: ['payment'] }, conditionGroup: group('AND', [condition('amount', '>', 10)]) });
  const ui = harness([draft]);
  const sample = { id: 'one', ref: 'QA-1', projectId: 'qa', transactionType: 'payment', fields: { amount: 11 }, expectedAnomaly: true };
  ui.change('sandbox-dataset', JSON.stringify([sample])); ui.click('handleRunSandboxTest');
  assert.equal(ui.action('handlePublishVersion').props.disabled, false);
  ui.change('sandbox-dataset', JSON.stringify([{ ...sample, projectId: 'wrong' }]));
  assert.equal(ui.action('handlePublishVersion').props.disabled, true);
  ui.click('handleRunSandboxTest');
  assert.ok(ui.nodes().some(n => n.props.role === 'alert' && JSON.stringify(n.props.children).includes('scope')));
});

const cases = load('src/utils/case-workflow.ts');
test('case mutations require the assigned investigator and nonempty authored findings', () => {
  const previous = { id: 'tx', scoringSource: 'AI', caseId: 'case', caseStatus: 'Investigating', assignedInvestigator: 'Owner', riskLevel: 'Abnormal' };
  const owner = { role: 'Investigator', name: 'Owner' };
  const report = { ...previous, caseStatus: 'Reported', investigationReport: { notes: 'Observed evidence', submittedBy: 'Owner' } };
  assert.equal(cases.canUpdateCase(previous, report, owner), true);
  assert.equal(cases.canUpdateCase(previous, report, { ...owner, name: 'Other' }), false);
  assert.equal(cases.canUpdateCase(previous, { ...report, investigationReport: { notes: ' ', submittedBy: 'Owner' } }, owner), false);
  for (const role of ['Viewer', 'Platform Admin']) assert.equal(cases.canUpdateCase(previous, report, { role, name: 'Owner' }), false);
});
test('final case decisions need a reason; closed cases and normal transactions cannot be mutated', () => {
  const previous = { id: 'tx', scoringSource: 'AI', caseId: 'case', caseStatus: 'Open', riskLevel: 'Abnormal' };
  const actor = { role: 'Operator', name: 'Lead' };
  const final = { ...previous, caseStatus: 'Confirmed Fraud', caseDecision: { directive: 'Reviewed evidence' } };
  assert.equal(cases.canUpdateCase(previous, final, actor), true);
  assert.equal(cases.canUpdateCase(previous, { ...final, caseDecision: { directive: '' } }, actor), false);
  assert.equal(cases.canUpdateCase(final, { ...final, caseStatus: 'Assigned', assignedInvestigator: 'Owner' }, actor), false);
  assert.equal(cases.canUpdateCase({ id: 'tx', riskLevel: 'Normal' }, previous, actor), false);
});

const ruleSet = load('src/utils/rule-set.ts', { './rule-sandbox': engine });
const active = (id, node, extra = {}) => ({ ...rules[0], id, name: id, status: 'Published', enabled: true, conditionGroup: group('AND', [node]), appliesTo: { projects: ['p1'], transactionTypes: ['payment'] }, ...extra });
const inputTx = { projectId: 'p1', transactionType: 'payment', fields: { amount: 12 } };
test('rule set checks all 10 applicable rules and one match is abnormal', () => {
  const ten = Array.from({ length: 10 }, (_, index) => active('r' + index, condition('amount', '>', index === 0 ? 10 : 100)));
  const result = ruleSet.evaluateRuleSet(ten, inputTx);
  assert.equal(result.applicable, 10); assert.equal(result.evaluated, 10); assert.equal(result.matched, 1);
  assert.equal(result.result, 'Abnormal'); assert.equal(result.status, 'Complete');
});
test('only live enabled scope-matching rules run, never drafts or other project rules', () => {
  const base = active('live', condition('amount', '>', 100));
  const result = ruleSet.evaluateRuleSet([base, { ...base, id: 'disabled', enabled: false }, { ...base, id: 'draft', status: 'Draft' }, { ...base, id: 'other', appliesTo: { projects: ['other'], transactionTypes: ['payment'] } }, { ...base, id: 'refund', appliesTo: { projects: ['p1'], transactionTypes: ['refund'] } }], inputTx);
  assert.equal(result.applicable, 1); assert.equal(result.result, 'Normal');
});
test('missing fields do not abort other rules or become normal', () => {
  const missing = active('missing', condition('history.count', '>', 3));
  const match = active('match', condition('amount', '>', 10));
  const result = ruleSet.evaluateRuleSet([missing, match], inputTx);
  assert.equal(result.result, 'Abnormal'); assert.equal(result.status, 'Incomplete'); assert.equal(result.failed, 1); assert.equal(result.matched, 1);
  assert.equal(ruleSet.evaluateRuleSet([missing], inputTx).result, 'Undetermined');
  assert.equal(ruleSet.evaluateRuleSet([], inputTx).status, 'NotEvaluated');
  assert.equal(ruleSet.evaluateRuleSet([], inputTx).result, 'Undetermined');
});
test('evaluation snapshots survive edits and only abnormal results create alerts, not cases', () => {
  const live = active('r1', condition('amount', '>', 10));
  const evaluation = ruleSet.evaluateRuleSet([live], inputTx);
  live.conditionGroup.children[0].value = 500;
  assert.equal(evaluation.rules[0].conditionGroup.children[0].value, 10);
  const sample = { ...inputTx, id: 'sample', ref: 'TX1' };
  const row = ruleSet.detectionTransaction(sample, evaluation, 'Project', 'demo1');
  assert.ok(row.alertId); assert.equal(row.caseId, undefined); assert.equal(row.caseStatus, undefined);
  const unknown = ruleSet.detectionTransaction(sample, ruleSet.evaluateRuleSet([], inputTx), 'Project', 'demo2');
  assert.equal(unknown.alertId, undefined); assert.equal(unknown.riskLevel, 'Undetermined');
});
test('dataset parser accepts unlabeled samples but rejects duplicate IDs and invalid field values', () => {
  const sample = { ...inputTx, id: 's1', ref: 'TX1' };
  assert.equal(ruleSet.parseRuleSetSamples(JSON.stringify([sample])).length, 1);
  assert.throws(() => ruleSet.parseRuleSetSamples(JSON.stringify([sample, sample])), /Duplicate/);
  assert.throws(() => ruleSet.parseRuleSetSamples(JSON.stringify([{ ...sample, fields: { amount: null } }])), /fields/);
});

const enterpriseData = loadEnterprises();
test('SME transaction scope excludes foreign projects and fails closed without an enterprise', () => {
 const data = load('src/data/fraudguard-transactions.ts').fraudGuardTransactions;
 for (const role of ['SME Admin', 'Operator']) {
   const abc = enterpriseData.transactionsForEnterprise(data, { role, enterpriseId: 'tenant-abc' }, enterpriseData.demoEnterprises);
   assert.ok(abc.length > 0);
   assert.ok(abc.every(tx => tx.projectId === 'proj-abc-cod'));
   const techpay = enterpriseData.transactionsForEnterprise(data, { role, enterpriseId: 'tenant-techpay' }, enterpriseData.demoEnterprises);
   assert.ok(techpay.length > 0);
   assert.ok(techpay.every(tx => ['proj-wallet', 'proj-checkout'].includes(tx.projectId)));
   assert.ok(!techpay.some(tx => abc.some(item => item.id === tx.id)));
 }
 assert.equal(enterpriseData.transactionsForEnterprise(data, { role: 'SME Admin' }, enterpriseData.demoEnterprises).length, 0);
 assert.equal(enterpriseData.transactionsForEnterprise(data, { role: 'SME Admin', enterpriseId: 'unknown' }, enterpriseData.demoEnterprises).length, 0);
});
const roleData = loadRoles();

test('route access follows each role and rejects legacy or unknown roles', () => {
 assert.equal(roleData.canAccessView('Investigator', 'reports'), true);
 for (const view of ['risk-overview', 'projects', 'audit-trail', 'rule-sets', 'members']) assert.equal(roleData.canAccessView('Investigator', view), false);
 assert.equal(roleData.canAccessView('Platform Admin', 'rule-testing'), false);
 assert.equal(roleData.canAccessView('Implementation Staff', 'reports'), false);
 assert.equal(roleData.canAccessView('SME Admin', 'members'), true);
 assert.equal(roleData.canAccessView('Operator', 'members'), false);
 assert.equal(roleData.canAccessView('Viewer', 'risk-overview'), false);
 assert.equal(roleData.canAccessView('unknown', 'reports'), false);
 assert.equal(roleData.getRolePermissions('SME Admin').canManageCases, false);
});

test('investigator scope uses assigned user IDs and never includes foreign or unassigned cases', () => {
 const owner = { id: 'owner', name: 'Renamed', role: 'Investigator', enterpriseId: 'e1' };
 const enterprises = [{ id: 'e1', projectIds: ['p1'] }];
 const base = { id: 'a', projectId: 'p1', caseId: 'c1', scoringSource: 'AI', assignedInvestigatorId: 'owner', assignedInvestigator: 'Old name' };
 const rows = [base, { ...base, id: 'b', assignedInvestigatorId: 'other', assignedInvestigator: 'Renamed' }, { ...base, id: 'c', projectId: 'p2' }, { ...base, id: 'd', caseId: undefined }, { ...base, id: 'e', scoringSource: 'RULE' }];
 assert.deepEqual(Array.from(enterpriseData.transactionsForEnterprise(rows, owner, enterprises), tx => tx.id), ['a']);
 assert.equal(enterpriseData.transactionsForEnterprise(rows, { ...owner, role: 'Viewer' }, enterprises).length, 0);
});

test('audit scope includes colleagues and assigned staff but excludes foreign and unresolved events', () => {
 const enterprises = [{ id: 'e1', name: 'One', projectIds: ['p1'], deploymentStaffId: 'staff' }, { id: 'e2', name: 'Two', projectIds: ['p2'], deploymentStaffId: 'other' }];
 const logs = [{ id: 'a', enterpriseId: 'e1', target: 'set' }, { id: 'b', enterpriseId: 'e2', target: 'p1' }, { id: 'c', target: 'case1' }, { id: 'd', target: 'Enterprise rule sets' }];
 const txs = [{ id: 'tx', caseId: 'case1', projectId: 'p1' }];
 for (const user of [{ role: 'SME Admin', enterpriseId: 'e1' }, { role: 'Operator', enterpriseId: 'e1' }, { role: 'Implementation Staff', id: 'staff' }]) {
  assert.deepEqual(Array.from(enterpriseData.auditForUser(logs, user, enterprises, txs), log => log.id), ['a', 'c']);
 }
 assert.equal(enterpriseData.auditForUser(logs, { role: 'Investigator', enterpriseId: 'e1' }, enterprises, txs).length, 0);
 assert.equal(enterpriseData.auditForUser(logs, { role: 'Platform Admin' }, enterprises, txs).length, 4);
});

test('SME admins cannot mutate cases and investigators cannot change transaction scope or assigned identity', () => {
 const previous = { id: 'tx', projectId: 'p1', scoringSource: 'AI', riskLevel: 'Abnormal', caseId: 'case', caseStatus: 'Assigned', assignedInvestigator: 'Owner', assignedInvestigatorId: 'owner' };
 const updated = { ...previous, caseStatus: 'Investigating' };
 assert.equal(cases.canUpdateCase(previous, updated, { id: 'owner', name: 'Owner', role: 'Investigator' }), true);
 for (const changed of [{ ...updated, projectId: 'p2' }, { ...updated, assignedInvestigatorId: 'other' }]) assert.equal(cases.canUpdateCase(previous, changed, { id: 'owner', name: 'Owner', role: 'Investigator' }), false);
 assert.equal(cases.canUpdateCase(previous, { ...previous, caseStatus: 'Resolved', caseDecision: { directive: 'Done' } }, { role: 'SME Admin' }), false);
});
const managed = load('src/utils/rule-set-lifecycle.ts', { './ingestion-validation': load('src/utils/ingestion-validation.ts'), '@/utils/enterprise': enterpriseData, './rule-lifecycle': lifecycle, './rule-set': ruleSet });
function draftSet(id = 'set1') { return { id, name: id, enterpriseId: 'e1', projectIds: ['p1'], versions: [], draft: { rules: managed.snapshotRules([active('r1', condition('amount', '>', 10))], 'p1') } }; }
const labeledSample = { ...inputTx, id: 's1', ref: 'TX-1', expected: 'Abnormal' };
test('set publication requires complete current tests and reviewer evidence', () => {
 const set = draftSet(); assert.equal(managed.canPublishSet(set), false);
 assert.throws(() => managed.publishSet(set, 'Admin', 'reviewed'));
 set.draft.test = managed.testDraft(set, [labeledSample]);
 assert.equal(managed.canPublishSet(set), true);
 assert.throws(() => managed.publishSet(set, 'Admin', ' '));
 const released = managed.publishSet(set, 'Admin', 'Reviewed specification');
 assert.equal(released.versions[0].version, 1); assert.equal(released.activeVersion, undefined); assert.equal(released.draft, undefined);
 set.draft.rules[0].conditionGroup.children[0].value = 100;
 assert.equal(managed.canPublishSet(set), false);
 assert.equal(released.versions[0].rules[0].conditionGroup.children[0].value, 10);
});
test('missing data, mismatches and unexercised members block set publication', () => {
 const set = draftSet();
 for (const sample of [{ ...labeledSample, expected: 'Normal' }, { ...labeledSample, fields: {} }]) {
  set.draft.test = managed.testDraft(set, [sample]); assert.equal(managed.canPublishSet(set), false);
 }
 set.draft.rules.push({ ...set.draft.rules[0], id: 'refund-only', appliesTo: { projects: ['p1'], transactionTypes: ['refund'] } });
 set.draft.test = managed.testDraft(set, [labeledSample]); assert.equal(managed.canPublishSet(set), false);
 assert.throws(() => managed.testDraft(set, [{ ...labeledSample, projectId: 'other' }]));
});
test('activation is exclusive per project and draft edits never alter runtime release', () => {
 function publish(id) { const s = draftSet(id); s.draft.test = managed.testDraft(s, [labeledSample]); return managed.publishSet(s, 'Admin', 'Confirmed'); }
 let sets = managed.activateSet([publish('one'), publish('two')], 'one', 1);
 assert.equal(managed.activeSetRules(sets).length, 1);
 sets[0].draft = { rules: structuredClone(sets[0].versions[0].rules) };
 sets[0].draft.rules[0].conditionGroup.children[0].value = 500;
 assert.equal(managed.activeSetRules(sets)[0].conditionGroup.children[0].value, 10);
 sets = managed.activateSet(sets, 'two', 1);
 assert.equal(sets[0].activeVersion, undefined); assert.equal(sets[1].activeVersion, 1);
 assert.throws(() => managed.activateSet(sets, 'two', 2));
});
test('unlabeled tests retain their unlabeled evidence and snapshots are independent of library drafts', () => {
 const source = active('r1', condition('amount', '>', 10)); source.draft = { ...source, conditionGroup: group('AND', [condition('amount', '>', 20)]) };
 const snapshots = managed.snapshotRules([source], 'p1'); source.draft.conditionGroup.children[0].value = 999;
 assert.equal(snapshots[0].conditionGroup.children[0].value, 20);
 const s = draftSet(); s.draft.test = managed.testDraft(s, [{ ...labeledSample, expected: undefined }]);
 assert.equal(s.draft.test.labeled, 0); assert.equal(managed.canPublishSet(s), true);
 const release = managed.publishSet(s, 'Reviewer', 'Manually checked against specification');
 assert.equal(release.versions[0].test.labeled, 0);
});

test('draft and publication preserve the current handover until an atomic release switch', () => {
 const first = draftSet(); first.draft.test = managed.testDraft(first, [labeledSample]);
 const live = managed.handoverSet(managed.publishSet(first, 'Staff', 'Checked'), 1, 'Staff');
 const editing = { ...live, draft: { rules: structuredClone(live.versions[0].rules) } };
 editing.draft.rules[0].conditionGroup.children[0].value = 15;
 assert.equal(live.versions[0].rules[0].conditionGroup.children[0].value, 10);
 assert.equal(editing.activeVersion, 1);
 assert.equal(editing.handover.version, 1);
 editing.draft.test = managed.testDraft(editing, [{ ...labeledSample, expected: undefined }]);
 const published = managed.publishSet(editing, 'Staff', 'Checked updated threshold');
 assert.equal(published.activeVersion, 1);
 assert.equal(published.handover.version, 1);
 const next = managed.handoverSet(published, 2, 'Staff');
 assert.equal(next.activeVersion, 2); assert.equal(next.handover.version, 2);
 assert.equal(published.activeVersion, 1);
 assert.throws(() => managed.handoverSet(next, 99, 'Staff'));
 const corrupted = structuredClone(next); corrupted.versions[1].rules.push(corrupted.versions[1].rules[0]);
 assert.throws(() => managed.handoverSet(corrupted, 2, 'Staff'));
});

test('rule set UI creates, tests, reviews, publishes and activates a version', () => {
 const states = []; let cursor, tree;
 const react = { useState(initial) { const slot = cursor++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; } };
 const Tester = () => null;
 const component = load('src/components/fraudguard-dashboard/RuleSetsView.tsx', {
  './ReadableConditions': load('src/components/fraudguard-dashboard/ReadableConditions.tsx', { './SecurityDashboard.module.css': { default: {} } }),
  react, './EnterpriseRulesView': { EnterpriseRulesView: () => null }, '@/utils/enterprise': enterpriseData, '@/data/fraudguard-roles': roleData, '@/utils/rule-set': ruleSet, '@/utils/rule-set-lifecycle': managed, './RuleSetTestingView': { RuleSetTestingView: Tester }, '@/utils/rule-lifecycle': lifecycle,
  '@/context/LanguageContext': { useLanguage: () => ({ language: 'vi' }) }, './SecurityDashboard.module.css': { default: {} }
 }).RuleSetsView;
 const s = draftSet();
 const props = { sets: [s], rules: s.draft.rules, projects: [{ id: 'p1', name: 'Wallet' }], enterprises: [{ id: 'e1', name: 'Enterprise', projectIds: ['p1'], deploymentStaffId: 'staff' }], currentUser: { id: 'staff', role: 'Implementation Staff' }, onAssign() {}, reviewer: 'Admin', onOpenLibrary() {}, onChange(next) { props.sets = next; } };
 function render() { cursor = 0; tree = component(props); }
 function nodes() { const out = []; function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { out.push(n); walk(n.props.children); } } walk(tree); return out; }
 function button(text) { return nodes().find(n => n.type === 'button' && (Array.isArray(n.props.children) ? n.props.children.filter(child => typeof child === 'string').join('') : n.props.children) === text); }
 function click(text) { const b = button(text); assert.ok(b, text); assert.ok(!b.props.disabled, text); b.props.onClick(); render(); }
 render(); click('Xem chi tiết');
 assert.equal(button('Phát hành phiên bản tập rule').props.disabled, true);
 nodes().find(n => n.type === Tester).props.onTestCompleted([labeledSample]); render();
 assert.equal(button('Phát hành phiên bản tập rule').props.disabled, true);
 nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: 'Verified the business specification.' } }); render();
 nodes().filter(n => n.type === 'input' && n.props.type === 'checkbox').at(-1).props.onChange({ target: { checked: true } }); render();
 click('Phát hành phiên bản tập rule');
 assert.equal(props.sets[0].versions.length, 1); assert.equal(props.sets[0].activeVersion, undefined);
 click('Áp dụng và bàn giao'); assert.equal(props.sets[0].activeVersion, 1);
 assert.equal(props.sets[0].handover.version, 1);
 click('Tạo phiên bản nháp mới');
 assert.equal(props.sets[0].activeVersion, 1); assert.equal(button('Phát hành phiên bản tập rule').props.disabled, true);
});

test('enterprise roles separate platform administration from assigned deployment', () => {
 const admin = { id: 'admin', role: 'Platform Admin' }, staff = { id: 'staff', role: 'Implementation Staff' };
 const enterprises = [{ id: 'e1', name: 'One', projectIds: ['p1','p2'], deploymentStaffId: 'staff' }, { id: 'e2', name: 'Two', projectIds: ['p3'], deploymentStaffId: 'other' }];
 assert.equal(roleData.getRolePermissions('Platform Admin').canManageRules, false);
 assert.equal(roleData.getRolePermissions('Platform Admin').canAccessRuleTesting, false);
 assert.equal(roleData.getRolePermissions('Implementation Staff').canManageRules, true);
 assert.equal(roleData.getRolePermissions('Implementation Staff').canManageCases, false);
 assert.equal(enterpriseData.visibleEnterprises(admin, enterprises).length, 2);
 assert.equal(enterpriseData.visibleEnterprises(staff, enterprises).length, 1);
 const one = draftSet();
 assert.equal(managed.canChangeEnterpriseSets([], [one], staff, enterprises), true);
 assert.equal(managed.canChangeEnterpriseSets([], [one], admin, enterprises), false);
 assert.equal(managed.canChangeEnterpriseSets([], [one, {...one, id:'second'}], staff, enterprises), false);
 assert.equal(managed.canChangeEnterpriseSets([], [{...one, enterpriseId:'e2'}], staff, enterprises), false);
 assert.equal(managed.canChangeEnterpriseSets([], [{...one, projectIds:['p3']}], staff, enterprises), false);
 assert.equal(managed.canChangeEnterpriseSets([one], [], staff, enterprises), false);
});
test('one enterprise set accepts multiple owned projects but rejects foreign samples', () => {
 const source = {...active('shared', condition('amount','>',10)), appliesTo:{projects:['*'],transactionTypes:['*']}};
 const snapshots = managed.snapshotRules([source], ['p1','p2']);
 const set = {...draftSet(),projectIds:['p1','p2'],draft:{rules:snapshots}};
 assert.equal(managed.testDraft(set,[labeledSample,{...labeledSample,id:'two',projectId:'p2'}]).complete,true);
 assert.throws(()=>managed.testDraft(set,[{...labeledSample,projectId:'foreign'}]));
 assert.equal(snapshots[0].appliesTo.projects.includes('*'),false);
 assert.equal(snapshots[0].appliesTo.projects.length,2);
});
test('legacy migration preserves single releases, archives ambiguous project sets and retains unknown projects', () => {
 const enterprise = {id:'e1',name:'One',projectIds:['p1','p2'],deploymentStaffId:'staff'};
 const original = {...draftSet(),projectId:'p1'};delete original.enterpriseId;delete original.projectIds;
 const one=managed.migrateProjectSets([original],[enterprise]);
 assert.equal(one.sets[0].enterpriseId,'e1');assert.equal(one.sets[0].draft.rules.length,1);
 const multiple=managed.migrateProjectSets([original,{...original,id:'old-two',projectId:'p2'},{...original,id:'unknown',projectId:'unknown'}],[enterprise]);
 assert.equal(multiple.sets.length,1);assert.equal(multiple.sets[0].legacySets.length,2);
 assert.equal(multiple.sets[0].activeVersion,undefined);assert.equal(multiple.unassigned.length,1);
 assert.equal(original.projectId,'p1');
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const readable = load('src/components/fraudguard-dashboard/ReadableConditions.tsx', { './SecurityDashboard.module.css': { default: {} } });
test('duplicate rule IDs cannot be snapshotted, tested or published as a set',()=>{
 const duplicateRules=[rules[0],structuredClone(rules[0])];
 assert.throws(()=>managed.snapshotRules(duplicateRules,['proj-abc-cod']),/Trùng mã/);
 const set={id:'duplicate-set',enterpriseId:'tenant',projectIds:['proj-abc-cod'],name:'Duplicate',versions:[],draft:{rules:duplicateRules}};
 assert.throws(()=>managed.testDraft(set,[{id:'sample',ref:'sample',...tx({amount:1,channel:'COD'})}]),/trùng mã/);
 set.draft.test={signature:managed.setSignature(duplicateRules),complete:true,mismatched:0};
 assert.equal(managed.canPublishSet(set),false);
});

test('legacy duplicate active rules are reported as errors instead of inflated successful matches', () => {
  const duplicate = { ...rules[0], status: 'Published', enabled: true };
  const result = ruleSet.evaluateRuleSet([duplicate, structuredClone(duplicate)], tx({ amount: 20000000, channel: 'COD' }));
  assert.equal(result.matched, 0);
  assert.equal(result.failed, 2);
  assert.equal(result.status, 'Incomplete');
  assert.equal(result.result, 'Undetermined');
  assert.match(result.rules[0].error, /Trùng mã/);
});
const businessView = load('src/components/fraudguard-dashboard/EnterpriseRulesView.tsx', {
 './ReadableConditions': readable,
 '@/context/LanguageContext': { useLanguage: () => ({ language: 'vi' }) },
 './SecurityDashboard.module.css': { default: {} }
}).EnterpriseRulesView;
const business = { id: 'e1', name: 'Enterprise', projectIds: ['p1'], deploymentStaffId: 'staff' };
function businessHtml(set) { return renderToStaticMarkup(React.createElement(businessView, { set, enterprise: business, projects: [{ id: 'p1', name: 'Wallet' }] })); }
function handedOverSet() {
 const draft = draftSet(); draft.draft.test = managed.testDraft(draft, [labeledSample]);
 const published = managed.publishSet(draft, 'Reviewer', 'INTERNAL_REVIEW_ONLY');
 return { ...published, activeVersion: 1, handover: { version: 1, by: 'Reviewer', at: '2026-10-15T00:00:00Z' } };
}
test('SME pending view explains handover without a dead details button or draft exposure', () => {
 const set = draftSet(); set.draft.rules[0].name = 'SECRET_DRAFT';
 const html = businessHtml(set);
 assert.match(html, /Đội triển khai đang chuẩn bị/);
 assert.doesNotMatch(html, /SECRET_DRAFT|Xem chi tiết|disabled|conditionGroup/);
});
test('SME sees readable handed-over conditions, never draft definitions or review evidence', () => {
 const set = handedOverSet(); set.draft = { rules: [{ ...set.versions[0].rules[0], name: 'SECRET_DRAFT' }] };
 const html = businessHtml(set);
 assert.match(html, /Xem chi tiết/); assert.match(html, /Số tiền giao dịch/); assert.match(html, /lớn hơn/); assert.match(html, /Đang áp dụng/);
 assert.doesNotMatch(html, /SECRET_DRAFT|INTERNAL_REVIEW_ONLY|conditionGroup|<pre/);
});
test('activation keeps last handover visible but marks it as no longer active until new handover', () => {
 const set = handedOverSet(); set.versions.push({ ...structuredClone(set.versions[0]), version: 2, rules: [{ ...set.versions[0].rules[0], name: 'UNDELIVERED_VERSION' }] });
 const next = managed.activateSet([set], set.id, 2)[0];
 assert.equal(next.handover.version, 1);
 const html = businessHtml(next);
 assert.match(html, /Đang cập nhật/); assert.match(html, /không phải phiên bản đang được kích hoạt/);
 assert.doesNotMatch(html, /UNDELIVERED_VERSION/);
});
test('readable conditions preserve nested AND/OR and strict versus inclusive comparisons', () => {
 const node = group('OR', [condition('amount', '>', 10), group('AND', [condition('amount', '>=', 20), condition('device.is_new', '==', false)])]);
 const html = renderToStaticMarkup(React.createElement(readable.ReadableConditions, { node, vi: true }));
 assert.match(html, /ít nhất một/); assert.match(html, /tất cả điều kiện/);
 assert.match(html, /lớn hơn/); assert.match(html, /từ/); assert.match(html, /Không/);
});


test('initial and switched demo accounts land on their role homepage', () => {
  const { DEFAULT_DEMO_USER, DEMO_USERS, getRoleHomeView } = loadRoles();
  assert.equal(DEFAULT_DEMO_USER.id, 'usr-deployment');
  assert.equal(getRoleHomeView(DEFAULT_DEMO_USER.role), 'rule-sets');
  const expected = {
    'Platform Admin': 'platform-health',
    'Implementation Staff': 'rule-sets',
    'Operator': 'active-cases',
    'Investigator': 'active-cases',
    'SME Admin': 'risk-overview',
    'Viewer': 'risk-overview',
  };
  for (const user of DEMO_USERS) assert.equal(getRoleHomeView(user.role), expected[user.role]);
});

 test('rule and fallback alerts cannot enter investigation', () => {
 for (const scoringSource of ['RULE','RULE_FALLBACK']) {
 const tx = { id: 'tx', scoringSource, riskLevel: 'Abnormal' };
 for (const role of ['Operator','SME Admin','Investigator']) assert.equal(cases.canUpdateCase(tx, {...tx, caseId:'case', caseStatus:'Open'}, {role,name:'Owner'}),false);
 }
 });
 test('operator can investigate an AI alert and submit their own findings', () => {
 const tx = { id:'tx', scoringSource:'AI', riskLevel:'Abnormal' };
 const actor={role:'Operator',name:'Owner'};
 const started={...tx,caseId:'case',caseStatus:'Investigating',assignedInvestigator:'Owner'};
 assert.equal(cases.canUpdateCase(tx,started,actor),true);
 assert.equal(cases.canUpdateCase(started,{...started,investigationNotes:[]},actor),true);
 assert.equal(cases.canUpdateCase(started,{...started,caseStatus:'Reported',investigationReport:{notes:'Evidence',submittedBy:'Owner'}},actor),true);
 assert.equal(cases.canUpdateCase(started,{...started,caseStatus:'Reported',investigationReport:{notes:' ',submittedBy:'Owner'}},actor),false);
 assert.equal(cases.canUpdateCase(started,{...started,caseStatus:'Reported',investigationReport:{notes:'Evidence',submittedBy:'Other'}},{...actor,name:'Other'}),false);
 });

function caseDrawerHarness(source, role = 'Operator') {
 const states=[]; let cursor=0, tree;
 const translations=load('src/config/translations.ts').translations;
 const props={open:true,currentRole:role,currentUserName:'Owner',onClose:()=>{},transaction:{id:'tx',transactionReference:'TX',scoringSource:source,riskLevel:'Abnormal',triggeredRules:[],processedAt:new Date().toISOString(),caseId:'case',caseStatus:'Open'},onUpdateTransaction(next){assert.equal(cases.canUpdateCase(props.transaction,next,{role,name:'Owner'}),true);props.transaction=next;}};
 const component=load('src/components/fraudguard-dashboard/AlertCaseDrawer.tsx',{
 react:{useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=initial;return [states[slot],v=>states[slot]=v];},useEffect(){}},
 './ReadableConditions':readable, '@/hooks/useDialogFocus':{useDialogFocus:()=>null}, './RuleEvaluationDetails':{RuleEvaluationDetails:()=>null}, './RiskLevelBadge':{RiskLevelBadge:()=>null}, './ScoringSourceBadge':{ScoringSourceBadge:()=>null}, '@/context/ToastProvider':{useToast:()=>({toast(){}})}, '@/context/LanguageContext':{useLanguage:()=>({language:'en',t:translations.en})}, './SecurityDashboard.module.css':{default:{}}
 }).AlertCaseDrawer;
 function render(){cursor=0;tree=component(props);}
 function nodes(){const result=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n?.props){result.push(n);walk(n.props.children);}}walk(tree);return result;}
 function click(name){const b=nodes().find(n=>n.type==='button'&&n.props.onClick?.name===name);assert.ok(b,name);assert.ok(!b.props.disabled);b.props.onClick();render();}
 render();return {props,nodes,click,render};
}
test('rule and fallback detail UI hides case creation, assignment and self-investigation',()=>{
 for(const source of ['RULE','RULE_FALLBACK']){
 const ui=caseDrawerHarness(source);
 const actions=ui.nodes().filter(n=>n.type==='button').map(n=>n.props.onClick?.name);
 for(const action of ['handleCreateCase','handleAssignInvestigator','handleSelfInvestigate','handleSubmitInvestigationReport'])assert.ok(!actions.includes(action),action);
 }
});
test('operator detail UI supports self-investigation, notes and report submission end to end',()=>{
 const ui=caseDrawerHarness('AI');ui.click('handleSelfInvestigate');
 assert.equal(ui.props.transaction.assignedInvestigator,'Owner');
 const inputs=ui.nodes().filter(n=>n.type==='textarea'||n.type==='input'&&!n.props.type);
 assert.ok(inputs.length>=2);
 for(const input of inputs) input.props.onChange({target:{value:'Evidence reviewed'}});
 ui.render();ui.click('handleAddInvestigatorNote');
 assert.ok(ui.props.transaction.investigationNotes.some(n=>n.text==='Evidence reviewed'));
 ui.click('handleSubmitInvestigationReport');
 assert.equal(ui.props.transaction.caseStatus,'Reported');
 assert.equal(ui.props.transaction.investigationReport.submittedBy,'Owner');
});

test('demo membership enforces enterprise boundary, role restrictions and unique identity',()=>{
 const {canSaveMember,DEMO_USERS}=loadRoles();
 assert.equal(new Set(DEMO_USERS.map(u=>u.role)).size,5);
 assert.ok(!DEMO_USERS.some(u=>['Viewer','Operation','Deployment Staff'].includes(u.role)));
 const admin=DEMO_USERS.find(u=>u.id==='usr-sme-admin');
 const member={...admin,id:'new',name:'New person',email:'new@example.com',role:'Operator'};
 assert.equal(canSaveMember(admin,member,DEMO_USERS),true);
 assert.equal(canSaveMember({...admin,role:'Operator'},member,DEMO_USERS),false);
 assert.equal(canSaveMember(admin,{...member,enterpriseId:'tenant-techpay'},DEMO_USERS),false);
 assert.equal(canSaveMember(admin,{...member,role:'Platform Admin'},DEMO_USERS),false);
 assert.equal(canSaveMember(admin,{...member,id:admin.id},DEMO_USERS),false);
 assert.equal(canSaveMember(admin,{...member,email:admin.email},DEMO_USERS),false);
 assert.equal(canSaveMember(admin,{...member,email:'bad'},DEMO_USERS),false);
});

test('unconfirmed onboarding permits drafts but blocks publishing, activation and handover',()=>{
 const owner={id:'e1',name:'Business',projectIds:['p1'],deploymentStaffId:'staff',specification:{requirements:'',fields:'',conditions:'',sampleJson:'',updatedAt:'now'}};
 const actor={id:'staff',role:'Implementation Staff'};const draft=draftSet();
 assert.equal(managed.canChangeEnterpriseSets([], [draft], actor, [owner]),true);
 const published={...draft,versions:[{version:1,rules:draft.draft.rules}]};
 assert.equal(managed.canChangeEnterpriseSets([draft],[published],actor,[owner]),false);
 assert.equal(managed.canChangeEnterpriseSets([published],[{...published,activeVersion:1}],actor,[owner]),false);
 assert.equal(managed.canChangeEnterpriseSets([published],[{...published,handover:{version:1,by:'staff',at:'now'}}],actor,[owner]),false);
 assert.equal(managed.canChangeEnterpriseSets([draft],[published],actor,[{...owner,specification:{...owner.specification,confirmedAt:'now'}}]),true);
 assert.equal(managed.canChangeEnterpriseSets([], [draft], {id:'other',role:'Implementation Staff'}, [owner]),false);
});

const importPipeline = load('src/utils/transaction-import.ts', { './rule-set': ruleSet, './ingestion-validation': load('src/utils/ingestion-validation.ts') });

test('configured schema validates required fields and normalizes CSV without losing text identifiers', () => {
 const schema = [{ name: 'amount', type: 'number', required: true }, { name: 'user_hash', type: 'string', required: true }, { name: 'flag', type: 'boolean', required: false }];
 const targetRules = [active('schema-rule', condition('amount', '>', 10))];
 const result = importPipeline.previewTransactionImport('transaction_reference,transaction_type,amount,user_hash,flag\nA,payment,20,00123,true', 'file.csv', 'p1', 'Wallet', targetRules, [], schema);
 assert.equal(result[0].error, ''); assert.equal(result[0].transaction.entityReference, '00123');
 const missing = importPipeline.previewTransactionImport(JSON.stringify([{ ref:'B',transactionType:'payment',fields:{amount:20} }]),'file.json','p1','Wallet',targetRules,[],schema);
 assert.match(missing[0].error,/user_hash/);
 const wrong = importPipeline.previewTransactionImport(JSON.stringify([{ ref:'B',transactionType:'payment',fields:{amount:'20',user_hash:'00123'} }]),'file.json','p1','Wallet',targetRules,[],schema);
 assert.match(wrong[0].error,/amount/);
});

test('publication freezes the schema and rejects samples that do not satisfy it', () => {
 const schema = [{ name:'amount',type:'number',required:true }];
 const draft = draftSet(); draft.draft.test = managed.testDraft(draft,[labeledSample],schema);
 const published = managed.publishSet(draft,'Staff','Checked',schema);
 schema[0].name = 'changed';
 assert.equal(published.versions[0].schema[0].name,'amount');
 assert.throws(()=>managed.testDraft(draft,[labeledSample],schema),/changed/);
 assert.throws(()=>managed.publishSet(draft,'Staff','Checked',schema),/changed/);
});

test('Excel import preserves text IDs and rejects formulas and ambiguous worksheets', async () => {
 const { Workbook } = require('exceljs');
 const reader = load('src/utils/transaction-file.ts');
 const workbook = new Workbook(); const sheet = workbook.addWorksheet('Transactions');
 sheet.addRow(['transaction_reference','transaction_type','amount','user_hash']);
 sheet.addRow(['00001','payment',20,'00123']);
 async function file() { const bytes = await workbook.xlsx.writeBuffer(); return {name:'transactions.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}; }
 const parsed = await reader.readTransactionFile(await file());
 const rows = JSON.parse(parsed.text); assert.equal(rows[0].transaction_reference,'00001'); assert.equal(rows[0].user_hash,'00123');
 sheet.getCell('C2').value = {formula:'10+10',result:20};
 await assert.rejects(reader.readTransactionFile(await file()),/C2/);
 sheet.getCell('C2').value = 20; workbook.addWorksheet('Other').addRow(['data']);
 await assert.rejects(reader.readTransactionFile(await file()),/trang/);
});
test('file ingestion previews normal and rule alerts without creating investigation cases',()=>{
 const rules=[active('import-rule',condition('amount','>',10))];
 const rows=importPipeline.previewTransactionImport('transaction_reference,transaction_type,amount,user_hash\nA,payment,20,00123\nB,payment,5,00456','samples.csv','p1','Wallet',rules,[]);
 assert.equal(rows[0].transaction.riskLevel,'Abnormal');assert.ok(rows[0].transaction.alertId);assert.equal(rows[0].transaction.caseId,undefined);
 assert.equal(rows[0].transaction.entityReference,'00123');assert.equal(rows[1].transaction.riskLevel,'Normal');assert.equal(rows[1].transaction.alertId,undefined);
 assert.equal(rows[0].transaction.scoringSource,'RULE');
});
test('ingestion blocks cross-scope data, missing rule fields, duplicate references and unsupported files',()=>{
 const rules=[active('import-rule',condition('amount','>',10))];
 const row={ref:'A',projectId:'p1',transactionType:'payment',fields:{amount:20}};
 const preview=(data,existing=[])=>importPipeline.previewTransactionImport(JSON.stringify(data),'samples.json','p1','Wallet',rules,existing);
 assert.ok(preview([{...row,projectId:'other'}])[0].error);
 assert.ok(preview([{...row,fields:{}}])[0].error);
 assert.ok(preview([row,row])[1].error);
 const first=preview([row])[0].transaction;
 assert.ok(preview([row],[first])[0].error);
 assert.ok(preview([{...row,transactionType:'unsupported'}])[0].error);
 assert.throws(()=>importPipeline.previewTransactionImport('','data.xlsx','p1','Wallet',rules,[]));
});

test('import dialog requires preview and saves only after explicit confirmation',async()=>{
 const states=[];let cursor=0,tree,saves=0;
 const component=load('src/components/fraudguard-dashboard/DataIngestionModal.tsx',{ '@/utils/transaction-file': load('src/utils/transaction-file.ts'),
 react:{useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=initial;return [states[slot],v=>states[slot]=v];}},
 '@/hooks/useDialogFocus':{useDialogFocus:()=>null},'@/context/LanguageContext':{useLanguage:()=>({language:'vi'})},'./SecurityDashboard.module.css':{default:{}}
 }).DataIngestionModal;
 const rules=[active('import-rule',condition('amount','>',10))];
 const preview=(text,name,project)=>importPipeline.previewTransactionImport(text,name,project,'Wallet',rules,[]);
 const props={open:true,onClose(){},projects:[{id:'p1',name:'Wallet'}],actions:{preview,save(text,name,project){saves++;const rows=preview(text,name,project);assert.ok(rows.every(r=>!r.error));return rows.length;}}};
 const render=()=>{cursor=0;tree=component(props);};
 const nodes=()=>{const result=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n?.props){result.push(n);walk(n.props.children);}}walk(tree);return result;};
 const button=text=>nodes().find(n=>n.type==='button'&&n.props.children===text);
 render();assert.ok(button('Kiểm tra và xem trước').props.disabled);assert.equal(button('Lưu vào danh sách giao dịch'),undefined);
 const input=nodes().find(n=>n.type==='input'&&n.props.type==='file');
 await input.props.onChange({currentTarget:{files:[{size:100,name:'test.csv',text:async()=>'transaction_reference,transaction_type,amount\nA,payment,20'}],value:'file'}});
 render();assert.equal(saves,0);button('Kiểm tra và xem trước').props.onClick();render();assert.equal(saves,0);
 assert.ok(!button('Lưu vào danh sách giao dịch').props.disabled);button('Lưu vào danh sách giao dịch').props.onClick();render();assert.equal(saves,1);assert.ok(button('Lưu vào danh sách giao dịch').props.disabled);
});
test('file import preserves text identifiers and rejects object metadata',()=>{
 const rules=[active('import-rule',condition('amount','>',10))];
 const result=importPipeline.previewTransactionImport('transaction_reference,transaction_type,amount,user_hash\nA,payment,20,true','test.csv','p1','Wallet',rules,[]);
 assert.equal(result[0].transaction.entityReference,'true');
 const invalid=importPipeline.previewTransactionImport(JSON.stringify([{ref:{bad:true},transactionType:'payment',fields:{amount:20}}]),'test.json','p1','Wallet',rules,[]);
 assert.ok(invalid[0].error);
});

test('enterprise usage separates AI, rules and fallback and respects enterprise scope',()=>{
 const owner={id:'new',name:'New',projectIds:['p1'],deploymentStaffId:'staff'};
 const transactions=[{projectId:'p1',scoringSource:'AI'},{projectId:'p1',scoringSource:'RULE'},{projectId:'p1',scoringSource:'RULE_FALLBACK'},{projectId:'p2',scoringSource:'AI'}];
 const result=enterpriseData.enterpriseUsage(owner,transactions);
 assert.equal(result.total,3);assert.equal(result.ai,1);assert.equal(result.rule,1);assert.equal(result.fallback,1);
 assert.equal(enterpriseData.enterprisePlan(owner),undefined);
 assert.equal(enterpriseData.enterprisePlan({...owner,id:'tenant-greenmart'}),'Free');
 assert.equal(enterpriseData.enterprisePlan({...owner,id:'tenant-greenmart',plan:'Subscription'}),'Subscription');
});
test('platform view uses shared enterprises and shows no Free allowance',()=>{
 const component=load('src/components/fraudguard-dashboard/PlatformHealthView.tsx',{
 '@/utils/platform-summary':load('src/utils/platform-summary.ts'),
 '@/utils/enterprise':enterpriseData,
 '../../data/fraudguard-platform':load('src/data/fraudguard-platform.ts'),
 '@/hooks/useDialogFocus':{useDialogFocus:()=>null},'@/context/ToastProvider':{useToast:()=>({toast(){}})},
 '@/context/LanguageContext':{useLanguage:()=>({language:'vi',t:load('src/config/translations.ts').translations.vi})},
 './SecurityDashboard.module.css':{default:{}}
 }).PlatformHealthView;
 const html=renderToStaticMarkup(React.createElement(component,{enterprises:[{id:'new-company',name:'Shared Company',plan:'Free',projectIds:['p1'],deploymentStaffId:'staff'}],transactions:[],onPlanChange(){}}));
 assert.match(html,/Shared Company/);assert.match(html,/Không áp dụng/);assert.doesNotMatch(html,/TechPay|12[.,]850|20[.,]000/);
});

test('only platform staff can provision the first enterprise administrator with a unique email',()=>{
 const admin={role:'Platform Admin'}, existing=[{email:'owner@example.com'}];
 assert.ok(roleData.canProvisionEnterpriseAdmin(admin,'Owner','new@example.com',existing));
 assert.equal(roleData.canProvisionEnterpriseAdmin({role:'Implementation Staff'},'Owner','new@example.com',existing),false);
 assert.equal(roleData.canProvisionEnterpriseAdmin(admin,'Owner',' OWNER@example.com ',existing),false);
 assert.equal(roleData.canProvisionEnterpriseAdmin(admin,' ','new@example.com',existing),false);
 assert.equal(roleData.canProvisionEnterpriseAdmin(admin,'Owner','invalid',existing),false);
});
test('active investigation KPI excludes rule alerts, missing cases and closed cases',()=>{
 const base={scoringSource:'AI',riskLevel:'Abnormal',caseId:'case-1',caseStatus:'Investigating'};
 assert.ok(cases.isActiveInvestigation(base));
 for(const change of [{scoringSource:'RULE'},{scoringSource:'RULE_FALLBACK'},{caseId:undefined},{caseStatus:'Resolved'},{riskLevel:'Normal'}]) assert.equal(cases.isActiveInvestigation({...base,...change}),false);
});

test('paid imports record unavailable AI as rules fallback without AI confidence or cases', () => {
 const targetRules=[{...rules[0], appliesTo:{projects:['p1'],transactionTypes:['payment']},conditionGroup:group('AND',[condition('amount','>',10)])}];
 const text=JSON.stringify([{ref:'PAID-1',transactionType:'payment',fields:{amount:20}}]);
 const paid=importPipeline.previewTransactionImport(text,'x.json','p1','Wallet',targetRules,[],[],'Subscription')[0].transaction;
 const free=importPipeline.previewTransactionImport(text,'x.json','p1','Wallet',targetRules,[],[],'Free')[0].transaction;
 assert.equal(paid.scoringSource,'RULE_FALLBACK'); assert.equal(free.scoringSource,'RULE');
 assert.equal(paid.riskLevel,'Abnormal');assert.equal(paid.confidence,undefined);assert.equal(paid.caseId,undefined);assert.ok(paid.alertId);
 const usage=loadEnterprises().enterpriseUsage({projectIds:['p1']},[paid,free]);
 assert.equal(usage.ai,0);assert.equal(usage.rule,1);assert.equal(usage.fallback,1);
});

test('platform metrics use recorded AI and fallback only and confirmed AI feedback',()=>{
 const summary=load('src/utils/platform-summary.ts').platformSummary;
 const base={processedAt:'2026-10-23T01:20:00Z'};
 const result=summary([{...base,scoringSource:'RULE'}, {...base,scoringSource:'AI',caseDecision:{status:'False Alarm'}},{...base,scoringSource:'RULE_FALLBACK',caseDecision:{status:'Confirmed Fraud'}}]);
 assert.equal(result.fallbackRate,50);assert.equal(result.feedback.length,1);assert.equal(result.trend.length,1);assert.equal(result.trend[0].aiRequests,1);assert.equal(result.trend[0].fallbackRequests,1);assert.equal(summary([]).fallbackRate,null);
});

const notifications=load('src/utils/notification-feed.ts');
test('notification feed follows enterprise and investigator scope',()=>{
 const enterprise={id:'e1',projectIds:['p1']};
 const own={id:'a',projectId:'p1',scoringSource:'AI',riskLevel:'Abnormal',caseId:'c1',assignedInvestigatorId:'i1',processedAt:'2026-10-24T01:00:00Z'};
 const rows=[own,{...own,id:'b',projectId:'p2'},{...own,id:'c',assignedInvestigatorId:'i2'},{...own,id:'d',riskLevel:'Normal'}];
 const data=loadEnterprises();
 const visible=data.transactionsForEnterprise(rows,{id:'i1',role:'Investigator',enterpriseId:'e1'},[enterprise]);
 assert.deepEqual(Array.from(notifications.notificationFeed(visible),x=>x.id),['a']);
 assert.equal(notifications.notificationFeed(data.transactionsForEnterprise(rows,{role:'Platform Admin'},[enterprise])).length,0);
});
test('notification updates change read identity and sort by latest event',()=>{
 const first={id:'a',scoringSource:'AI',riskLevel:'Abnormal',caseId:'c1',caseStatus:'Open',processedAt:'2026-10-23T01:00:00Z'};
 const later={...first,id:'b',processedAt:'2026-10-23T02:00:00Z'};
 const assigned={...first,caseStatus:'Assigned',assignedInvestigatorId:'i1',assignedAt:'2026-10-24T01:00:00Z'};
 assert.notEqual(notifications.notificationId(first),notifications.notificationId(assigned));
 assert.equal(notifications.notificationFeed([later,assigned])[0].id,'a');
 assert.equal(notifications.notificationLabel(assigned,true),'Đã giao người điều tra');
 assert.equal(notifications.notificationLabel({...first,scoringSource:'RULE_FALLBACK'},true),'Cảnh báo từ quy tắc dự phòng');
});
test('notifications ignore normal transactions and do not invent invalid timestamps',()=>{
 const tx={id:'a',riskLevel:'Normal',alertId:'a1',processedAt:'invalid'};
 assert.equal(notifications.notificationFeed([tx]).length,0);
 assert.equal(notifications.notificationTime(tx),undefined);
 assert.equal(notifications.notificationFeed([{...tx,riskLevel:'Abnormal'}]).length,1);
});

test('sandbox records are excluded from usage, health, feedback and notifications',()=>{
 const sample={id:'demo-batch-1',dataOrigin:'sandbox',projectId:'p1',riskLevel:'Abnormal',scoringSource:'AI',alertId:'a1',processedAt:'2026-10-24T00:00:00Z',caseDecision:{status:'Confirmed Fraud'}};
 const real={...sample,id:'import:p1:A',dataOrigin:'import'};
 const data=loadEnterprises();
 const usage=data.enterpriseUsage({projectIds:['p1']},[sample,real]);
 assert.equal(usage.total,1);assert.equal(usage.ai,1);
 const health=load('src/utils/platform-summary.ts').platformSummary([sample,real]);
 assert.equal(health.trend[0].aiRequests,1);assert.equal(health.feedback.length,1);
 assert.equal(notifications.notificationFeed([sample,real]).length,1);
});
test('legacy sandbox recognition requires both generated ID and sandbox explanation',()=>{
 const {isSandboxTransaction}=load('src/utils/transaction-origin.ts');
 assert.equal(isSandboxTransaction({id:'demo-abc-0',explanation:'Sandbox demo: 1/1 rules matched; 0 errors.'}),true);
 assert.equal(isSandboxTransaction({id:'demo-abc-0',explanation:'Imported payment'}),false);
 assert.equal(isSandboxTransaction({id:'import:x',explanation:'Sandbox demo: copied text'}),false);
 assert.equal(isSandboxTransaction({id:'demo-abc-0',dataOrigin:'import',explanation:'Sandbox demo: copied text'}),false);
});
test('a sandbox reference does not block a real import but an existing import does',()=>{
 const targetRules=[{...rules[0],appliesTo:{projects:['p1'],transactionTypes:['payment']},conditionGroup:group('AND',[condition('amount','>',10)])}];
 const text=JSON.stringify([{ref:'SAME',transactionType:'payment',fields:{amount:20}}]);
 const sample={id:'s1',dataOrigin:'sandbox',projectId:'p1',transactionReference:'SAME'};
 const result=importPipeline.previewTransactionImport(text,'x.json','p1','Wallet',targetRules,[sample]);
 assert.equal(result[0].error,'');assert.equal(result[0].transaction.dataOrigin,'import');
 const duplicate=importPipeline.previewTransactionImport(text,'x.json','p1','Wallet',targetRules,[result[0].transaction]);
 assert.match(duplicate[0].error,/trùng/);
});

test('saved draft results remain visible after reopening and stale results are hidden',()=>{
 const targetRules=[{...rules[0],appliesTo:{projects:['p1'],transactionTypes:['payment']},conditionGroup:group('AND',[condition('amount','>',10)])}];
 const samples=[{id:'saved-1',ref:'saved-1',projectId:'p1',transactionType:'payment',fields:{amount:20},expected:'Abnormal'}];
 const saved=managed.testDraft({projectIds:['p1'],draft:{rules:targetRules},versions:[]},samples);
 const component=load('src/components/fraudguard-dashboard/RuleSetTestingView.tsx',{
 '@/utils/ingestion-validation':load('src/utils/ingestion-validation.ts'),'@/utils/rule-set':ruleSet,
 './RuleEvaluationDetails':{RuleEvaluationDetails:()=>null},'./RiskLevelBadge':{RiskLevelBadge:({riskLevel})=>React.createElement('span',null,riskLevel)},
 '@/context/LanguageContext':{useLanguage:()=>({language:'vi'})},'./SecurityDashboard.module.css':{default:{}}
 }).RuleSetTestingView;
 const props={rules:targetRules,initialSamples:samples,initialTest:saved,allowedProjectIds:['p1'],draftMode:true};
 const render=extra=>renderToStaticMarkup(React.createElement(component,{...props,...extra}));
 assert.match(render({}),/Khớp kỳ vọng/);assert.doesNotMatch(render({}),/Chờ chạy/);
 assert.match(render({initialSamples:[{...samples[0],fields:{amount:5}}]}),/Chờ chạy/);
 assert.match(render({rules:[{...targetRules[0],conditionGroup:group('AND',[condition('amount','>',30)])}]}),/Chờ chạy/);
});

function onboardingHarness(staffId = 'usr-deployment', customEnterprises) {
 const states = [], effectDeps = [], openedRules = [], audits = [];
 let cursor = 0, effects = [], dirty = false, tree;
 const react = {
  useState(initial) {
   const slot = cursor++;
   if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
   return [states[slot], (value) => { const next = typeof value === 'function' ? value(states[slot]) : value; if (!Object.is(next, states[slot])) { states[slot] = next; dirty = true; } }];
  },
  useEffect(effect, deps) {
   const slot = cursor++;
   if (!effectDeps[slot] || deps.some((d, i) => !Object.is(d, effectDeps[slot][i]))) { effectDeps[slot] = deps; effects.push(effect); }
  },
 };
 const lucideStub = new Proxy({}, { get: () => () => null });
 const enterpriseUtils = loadEnterprises();
 const { OnboardingView } = load('src/components/fraudguard-dashboard/OnboardingView.tsx', {
  react,
  'lucide-react': lucideStub,
  '@/utils/enterprise': enterpriseUtils,
  '@/utils/ingestion-validation': load('src/utils/ingestion-validation.ts'),
  '@/utils/transaction-file': load('src/utils/transaction-file.ts'),
  '@/hooks/useDialogFocus': { useDialogFocus: () => null },
  '@/context/LanguageContext': { useLanguage: () => ({ language: 'vi' }) },
  './SecurityDashboard.module.css': { default: {} },
 });
 const defaultEnterprises = structuredClone(enterpriseUtils.demoEnterprises);
 const props = {
  enterprises: customEnterprises || defaultEnterprises,
  users: loadRoles().DEMO_USERS,
  currentUser: { id: staffId, name: 'Nhân sự triển khai', email: 'deployment@fraudguard.vn', role: 'Implementation Staff' },
  sets: [],
  onCreate: () => true,
  onProvisionWorkspace(enterpriseId) {
   const target = props.enterprises.find((e) => e.id === enterpriseId);
   if (props.currentUser.role !== 'Platform Admin' || !target || target.projectIds.length > 0) return false;
   const projectId = 'workspace-' + enterpriseId;
   props.enterprises = props.enterprises.map((e) => {
    if (e.id !== enterpriseId) return e;
    const updated = { ...e, projectIds: [projectId] };
    if (updated.specification) {
     const readiness = enterpriseUtils.evaluateSetupReadiness(updated.specification, true, updated);
     updated.specification = {
      ...updated.specification,
      confirmedAt: readiness.ready
       ? updated.specification.confirmedAt || updated.specification.enterpriseConfirmation?.confirmedAt || new Date().toISOString()
       : undefined,
      confirmedBy: readiness.ready
       ? updated.specification.enterpriseConfirmation?.confirmedBy || updated.specification.confirmedBy || props.currentUser.name
       : undefined,
     };
    }
    return updated;
   });
   audits.push({ enterpriseId, auditDetail: 'Khởi tạo phạm vi workspace: ' + projectId });
   dirty = true;
   return true;
  },
  onSave(enterpriseId, specification, auditDetail) {
   const owner = props.enterprises.find((e) => e.id === enterpriseId);
   const check = enterpriseUtils.validateOnboardingSave(owner, props.currentUser, specification, true);
   if (!check.ok || !check.specification) return false;
   audits.push({ enterpriseId, auditDetail });
   props.enterprises = props.enterprises.map((e) => e.id === enterpriseId ? { ...e, specification: check.specification } : e);
   dirty = true;
   return true;
  },
  onOpenRules(enterpriseId) { openedRules.push(enterpriseId); },
 };
 function expandTree(n) {
  if (Array.isArray(n)) return n.map(expandTree);
  if (!n || typeof n !== 'object') return n;
  if (typeof n.type === 'function') return expandTree(n.type(n.props || {}));
  if (n.props && 'children' in n.props) return { ...n, props: { ...n.props, children: expandTree(n.props.children) } };
  return n;
 }
 function render() {
  for (let i = 0; i < 10; i++) { cursor = 0; effects = []; dirty = false; tree = expandTree(OnboardingView(props)); effects.forEach((e) => e()); if (!dirty) return; }
  throw Error('OnboardingView render did not settle');
 }
 function nodes() {
  const result = [];
  function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object' && n.props) { result.push(n); walk(n.props.children); } }
  walk(tree);
  return result;
 }
 function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && nOrProps(node)) return textOf(node.props.children);
  return '';
 }
 function nOrProps(node) { return Boolean(node && node.props); }
 function button(labelSubstring) {
  return nodes().find((n) => n.type === 'button' && textOf(n).includes(labelSubstring));
 }
 function click(labelSubstring) {
  const b = button(labelSubstring);
  assert.ok(b, `Expected button containing "${labelSubstring}"`);
  assert.ok(!b.props.disabled, `Expected button "${labelSubstring}" to be enabled`);
  b.props.onClick();
  render();
 }
 render();
 return { props, nodes, textOf, button, click, render, openedRules, audits };
}

test('Part A & B: supplement request closes modal into supplement_pending and received supplement returns to intake without jumping to confirmation', () => {
 const { resolveOnboardingStage } = loadEnterprises();
 const ui = onboardingHarness('usr-deployment');
 // Select FastRetail (tenant-fastretail, initial stage: intake)
 const fastRetailRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('FastRetail'));
 assert.ok(fastRetailRow);
 const openProfileBtn = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') openProfileBtn.push(n); walk(n.props.children); } })(fastRetailRow);
 openProfileBtn[0].props.onClick();
 ui.render();

 let fastRetail = ui.props.enterprises.find((e) => e.id === 'tenant-fastretail');
 assert.equal(resolveOnboardingStage(fastRetail), 'intake');

 // Open supplement request modal
 ui.click('Yêu cầu bổ sung thông tin');
 // Submit supplement request
 ui.click('Ghi nhận yêu cầu bổ sung');
 fastRetail = ui.props.enterprises.find((e) => e.id === 'tenant-fastretail');
 assert.equal(fastRetail.specification.stage, 'supplement_pending');
 assert.equal(resolveOnboardingStage(fastRetail), 'supplement_pending');
 assert.equal(fastRetail.specification.supplementRequests[0].guidanceFileName, undefined);
 assert.equal(fastRetail.specification.confirmedAt, undefined);

 // Record received supplement info -> returns to intake so Staff can continue reviewing
 ui.click('Ghi nhận đã nhận thông tin bổ sung');
 const noteTextarea = ui.nodes().find((n) => n.type === 'textarea');
 noteTextarea.props.onChange({ target: { value: 'Doanh nghiệp đã gửi bổ sung bảng mã kho và quy định hoàn tiền.' } });
 ui.render();
 // Click modal confirm button (the second button with that label inside the modal footer)
 const receiveBtns = ui.nodes().filter((n) => n.type === 'button' && ui.textOf(n).includes('Ghi nhận đã nhận thông tin bổ sung'));
 receiveBtns.at(-1).props.onClick();
 ui.render();

 fastRetail = ui.props.enterprises.find((e) => e.id === 'tenant-fastretail');
 assert.equal(fastRetail.specification.stage, 'intake');
 assert.equal(resolveOnboardingStage(fastRetail), 'intake');
 assert.match(fastRetail.specification.supplementRequests[0].receivedNote, /bảng mã kho/);
});

test('Part C: draft save, cancel restore, dynamic version increment, and snapshot isolation work per enterprise', () => {
 const ui = onboardingHarness('usr-deployment-2');
 // Open TechPay (tenant-techpay, initial stage: clarifying, assigned to usr-deployment-2)
 const techPayRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('TechPay'));
 const rowBtns = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') rowBtns.push(n); walk(n.props.children); } })(techPayRow);
 rowBtns[0].props.onClick();
 ui.render();

 // Save initial draft
 ui.click('Lưu bản nháp');
 let techPay = ui.props.enterprises.find((e) => e.id === 'tenant-techpay');
 const savedCondCount = techPay.specification.savedDraft.conditionsList.length;
 assert.equal(savedCondCount, 1);

 // Add a second condition in working state without saving, then cancel changes -> restores savedDraft
 ui.click('Thêm điều kiện');
 const condNameInput = ui.nodes().find((n) => n.type === 'input' && n.props.placeholder?.includes('Giao dịch vượt hạn mức'));
 condNameInput.props.onChange({ target: { value: 'Điều kiện nháp tạm thời' } });
 const condCriteriaInput = ui.nodes().find((n) => n.type === 'input' && n.props.placeholder?.includes('amount > 15000000'));
 condCriteriaInput.props.onChange({ target: { value: 'amount > 99999999' } });
 ui.render();
 ui.click('Lưu điều kiện');
 assert.ok(ui.textOf({ props: { children: ui.nodes() } }).includes('Điều kiện nháp tạm thời'));

 // Cancel changes -> restores saved draft without the temporary condition
 ui.click('Hủy thay đổi');
 assert.ok(!ui.textOf({ props: { children: ui.nodes() } }).includes('Điều kiện nháp tạm thời'));

 // Send draft -> creates immutable sentSnapshot v1.0 and moves to waiting_confirmation
 ui.click('Ghi nhận đã gửi dự thảo');
 techPay = ui.props.enterprises.find((e) => e.id === 'tenant-techpay');
 assert.equal(techPay.specification.stage, 'waiting_confirmation');
 assert.equal(techPay.specification.sentSnapshot.version, 'v1.0');
 assert.equal(techPay.specification.sentSnapshot.conditionsList.length, 1);
});

test('Part D: waiting_reconfirmation (Screen 4B) provides two branches, preserves snapshot isolation, and readiness gate requires both confirmation and technical clarification', () => {
 const { evaluateSetupReadiness, nextSpecificationVersion } = loadEnterprises();
 assert.equal(nextSpecificationVersion(undefined), 'v1.0');
 assert.equal(nextSpecificationVersion('v1.0'), 'v1.1');
 assert.equal(nextSpecificationVersion('v2.3'), 'v2.4');

 const ui = onboardingHarness('usr-deployment-2');
 // Open EduLearn (tenant-edulearn, initial stage: waiting_reconfirmation, sent version v1.2, assigned to usr-deployment-2)
 const eduRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('EduLearn'));
 const rowBtns = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') rowBtns.push(n); walk(n.props.children); } })(eduRow);
 rowBtns[0].props.onClick();
 ui.render();

 // Verify Screen 4B does NOT allow jumping directly to rule setup and exposes both branches
 assert.equal(ui.button('Chuyển sang thiết lập quy tắc'), undefined);
 assert.ok(ui.button('Ghi nhận phản hồi & Chuyển sang chỉnh sửa'));
 assert.ok(ui.button('Mở hộp thoại ghi nhận doanh nghiệp đã xác nhận'));

 // Branch 1: Record feedback -> transitions to revising
 const feedbackArea = ui.nodes().find((n) => n.type === 'textarea');
 feedbackArea.props.onChange({ target: { value: 'Đề nghị làm rõ thêm trường coupon_code trước khi chốt.' } });
 ui.render();
 ui.click('Ghi nhận phản hồi & Chuyển sang chỉnh sửa');
 let edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.stage, 'revising');
 assert.equal(edu.specification.sentSnapshot.version, 'v1.2');

 // Modify draft and save -> sentSnapshot v1.2 remains untouched
 ui.click('Thêm điều kiện');
 const condNameInput = ui.nodes().find((n) => n.type === 'input' && n.props.placeholder?.includes('Giao dịch vượt hạn mức'));
 condNameInput.props.onChange({ target: { value: 'Lạm dụng mã giảm giá' } });
 const condCriteriaInput = ui.nodes().find((n) => n.type === 'input' && n.props.placeholder?.includes('amount > 15000000'));
 condCriteriaInput.props.onChange({ target: { value: 'coupon_reuse_count > 3' } });
 ui.render();
 ui.click('Lưu điều kiện');
 ui.click('Lưu bản nháp');
 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.sentSnapshot.conditionsList.length, 1);
 assert.equal(edu.specification.savedDraft.conditionsList.length, 2);

 // Send updated draft -> increments version dynamically from v1.2 to v1.3 and enters waiting_reconfirmation
 ui.click('Ghi nhận đã gửi bản cập nhật');
 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.stage, 'waiting_reconfirmation');
 assert.equal(edu.specification.sentSnapshot.version, 'v1.3');

 // Branch 2: Open confirmation modal and record confirmation while sampleJson is still "[]"
 ui.click('Mở hộp thoại ghi nhận doanh nghiệp đã xác nhận');
 const confirmNoteArea = ui.nodes().filter((n) => n.type === 'textarea').at(-1);
 confirmNoteArea.props.onChange({ target: { value: 'Doanh nghiệp đồng ý các điều kiện phát hiện của bản v1.3.' } });
 ui.render();
 ui.click('Hoàn tất ghi nhận xác nhận');

 // Enterprise business confirmation succeeds and is saved, while setup readiness remains blocked due to empty sampleJson
 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.stage, 'confirmed');
 assert.ok(edu.specification.enterpriseConfirmation.confirmedAt);
 assert.equal(edu.specification.confirmedSnapshot.version, 'v1.3');
 assert.equal(edu.specification.confirmedAt, undefined);
 const missingSampleReadiness = evaluateSetupReadiness(edu.specification, true, edu);
 assert.equal(missingSampleReadiness.enterpriseConfirmed, true);
 assert.equal(missingSampleReadiness.ready, false);
 assert.ok(missingSampleReadiness.missingItems.some((m) => m.includes('sampleJson')));
 assert.equal(ui.button('Chuyển sang thiết lập quy tắc').props.disabled, true);

 // Provide valid sampleJson matching schema & projectIds in Step 2 and save draft -> unlocks rule setup
 ui.click('Soạn bản nháp cập nhật mới');
 const sampleArea = ui.nodes().filter((n) => n.type === 'textarea').at(-1);
 sampleArea.props.onChange({
  target: {
   value: JSON.stringify([
    {
     id: 'el-sample-1',
     ref: 'EL-TX-01',
     projectId: 'proj-edtech',
     transactionType: 'refund',
     fields: { amount: 12000000, user_hash: 'student_01', course_pack: 'COMBO_YEAR' },
     expected: 'Abnormal',
    },
   ]),
  },
 });
 ui.render();
 ui.click('Lưu bản nháp');
 ui.click('Phản hồi & Xác nhận đặc tả');

 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.ok(edu.specification.confirmedAt);
 assert.equal(evaluateSetupReadiness(edu.specification, true, edu).ready, true);

 // Uncheck technical readiness checkbox -> disables "Chuyển sang thiết lập quy tắc" and lists missingItems
 const techCheckbox = ui.nodes().find((n) => n.type === 'input' && n.props.type === 'checkbox');
 techCheckbox.props.onChange({ target: { checked: false } });
 ui.render();
 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.dataAndEvaluationClarified, false);
 assert.equal(edu.specification.confirmedAt, undefined);
 const incompleteReadiness = evaluateSetupReadiness(edu.specification, true, edu);
 assert.equal(incompleteReadiness.ready, false);
 assert.ok(incompleteReadiness.missingItems.length > 0);
 assert.equal(ui.button('Chuyển sang thiết lập quy tắc').props.disabled, true);

 // Re-check technical readiness checkbox -> enables "Chuyển sang thiết lập quy tắc"
 const techCheckbox2 = ui.nodes().find((n) => n.type === 'input' && n.props.type === 'checkbox');
 techCheckbox2.props.onChange({ target: { checked: true } });
 ui.render();
 edu = ui.props.enterprises.find((e) => e.id === 'tenant-edulearn');
 assert.equal(edu.specification.dataAndEvaluationClarified, true);
 assert.ok(edu.specification.confirmedAt);
 assert.equal(evaluateSetupReadiness(edu.specification, true, edu).ready, true);
 ui.click('Chuyển sang thiết lập quy tắc');
 assert.deepEqual(ui.openedRules, ['tenant-edulearn']);
});

test('confirmation modal surfaces specific failure reason while preserving user input and separates business confirmation from sample/project readiness', () => {
 const { demoEnterprises, evaluateSetupReadiness } = loadEnterprises();
 // Simulate existing localStorage state where GreenMart has projectIds: [] while sampleJson has projectId: 'proj-market'
 const custom = structuredClone(demoEnterprises).map((e) =>
  e.id === 'tenant-greenmart' ? { ...e, projectIds: [] } : e
 );
 const ui = onboardingHarness('usr-deployment', custom);
 const gmRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('GreenMart'));
 const rowBtns = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') rowBtns.push(n); walk(n.props.children); } })(gmRow);
 rowBtns[0].props.onClick();
 ui.render();

 // Open confirmation modal (Modal 5B)
 ui.click('Mở hộp thoại ghi nhận doanh nghiệp đã xác nhận');

 // 1. Failure case: empty confirmation note -> shows specific error inside modal and preserves representative input
 const modalInputs = ui.nodes().filter((n) => n.type === 'input' && n.props.type === 'text');
 const repInput = modalInputs.at(-2);
 repInput.props.onChange({ target: { value: 'Nguyễn Văn Kiên (Giám đốc Chuỗi GreenMart)' } });
 ui.render();
 ui.click('Hoàn tất ghi nhận xác nhận');
 const alertNodes1 = ui.nodes().filter((n) => n.props?.role === 'alert');
 assert.ok(alertNodes1.some((n) => ui.textOf(n).includes('Ghi chú nội dung xác nhận')));
 // User input must be preserved and modal must remain open
 assert.equal(
  ui.nodes().filter((n) => n.type === 'input' && n.props.type === 'text').at(-2).props.value,
  'Nguyễn Văn Kiên (Giám đốc Chuỗi GreenMart)'
 );

 // 2. Failure case: real dashboard onSave rejects when schema in snapshot has duplicate field names -> shows specific schema reason inside modal & preserves input
 const noteArea = ui.nodes().filter((n) => n.type === 'textarea').at(-1);
 noteArea.props.onChange({ target: { value: 'Xác nhận qua email biên bản ngày 25/10/2026.' } });
 const originalSentSchema = structuredClone(
  ui.props.enterprises.find((e) => e.id === 'tenant-greenmart').specification.sentSnapshot.schema
 );
 ui.props.enterprises = ui.props.enterprises.map((e) =>
  e.id === 'tenant-greenmart'
   ? {
      ...e,
      specification: {
       ...e.specification,
       sentSnapshot: {
        ...e.specification.sentSnapshot,
        schema: [
         ...originalSentSchema,
         { name: originalSentSchema[0].name, type: 'string', required: true, description: 'Trùng tên trường' },
        ],
       },
      },
     }
   : e
 );
 ui.render();
 ui.click('Hoàn tất ghi nhận xác nhận');
 const alertNodes2 = ui.nodes().filter((n) => n.props?.role === 'alert');
 assert.ok(alertNodes2.some((n) => ui.textOf(n).includes('Danh mục trường dữ liệu (schema) không hợp lệ')));
 // Both representative and note inputs must still be preserved inside the open modal
 assert.equal(
  ui.nodes().filter((n) => n.type === 'input' && n.props.type === 'text').at(-2).props.value,
  'Nguyễn Văn Kiên (Giám đốc Chuỗi GreenMart)'
 );
 assert.equal(
  ui.nodes().filter((n) => n.type === 'textarea').at(-1).props.value,
  'Xác nhận qua email biên bản ngày 25/10/2026.'
 );

 // 3. Restore valid schema and submit -> saves enterpriseConfirmation even though projectIds is [], while blocking rule setup
 ui.props.enterprises = ui.props.enterprises.map((e) =>
  e.id === 'tenant-greenmart'
   ? {
      ...e,
      specification: {
       ...e.specification,
       sentSnapshot: {
        ...e.specification.sentSnapshot,
        schema: originalSentSchema,
       },
      },
     }
   : e
 );
 ui.render();
 ui.click('Hoàn tất ghi nhận xác nhận');
 const gm = ui.props.enterprises.find((e) => e.id === 'tenant-greenmart');
 assert.equal(gm.specification.stage, 'confirmed');
 assert.equal(gm.specification.enterpriseConfirmation.confirmedBy, 'Nguyễn Văn Kiên (Giám đốc Chuỗi GreenMart)');
 assert.equal(gm.specification.confirmedAt, undefined);
 const readiness = evaluateSetupReadiness(gm.specification, true, gm);
 assert.equal(readiness.enterpriseConfirmed, true);
 assert.equal(readiness.ready, false);
 assert.ok(readiness.missingItems.some((m) => m.includes('projectIds')));
 assert.equal(ui.button('Chuyển sang thiết lập quy tắc').props.disabled, true);
});

test('reconcileEnterpriseProjects restores true enterprise project links without cross-tenant attachment and Platform Admin workspace provisioning preserves saved specs', () => {
 const { demoEnterprises, reconcileEnterpriseProjects, evaluateSetupReadiness } = loadEnterprises();
 const { initialProjects } = load('src/data/fraudguard-projects.ts');
 const initialRuleSets = [
  { enterpriseId: 'tenant-techpay', rules: [{ projectId: 'proj-checkout' }, { projectId: 'proj-wallet' }] },
 ];

 // Simulate stale localStorage where:
 // - FastRetail had guessed projectIds ['proj-pos'] or []
 // - EduLearn had guessed projectIds ['proj-edu'] or []
 // - GreenMart had foreign projectIds ['proj-market'] (which belongs to FastRetail) or [] and a saved confirmation/draft
 const staleSaved = structuredClone(demoEnterprises).map((e) => {
  if (e.id === 'tenant-fastretail') return { ...e, projectIds: ['proj-pos'] };
  if (e.id === 'tenant-edulearn') return { ...e, projectIds: [] };
  if (e.id === 'tenant-greenmart') {
   return {
    ...e,
    projectIds: ['proj-market'],
    specification: {
     ...e.specification,
     stage: 'confirmed',
     confirmedSnapshot: structuredClone(e.specification.sentSnapshot),
     enterpriseConfirmation: {
      confirmedAt: '03/11/2026, 17:00:00',
      confirmedBy: 'Lê Thanh Tùng (Quản lý Vận hành Chuỗi)',
      channel: 'Email xác nhận',
      note: 'Đã xác nhận đặc tả GreenMart v1.0.',
      version: 'v1.0',
     },
    },
   };
  }
  return e;
 });

 const reconciled = reconcileEnterpriseProjects(staleSaved, demoEnterprises, initialProjects, initialRuleSets);
 const fastRetail = reconciled.find((e) => e.id === 'tenant-fastretail');
 const eduLearn = reconciled.find((e) => e.id === 'tenant-edulearn');
 const greenMart = reconciled.find((e) => e.id === 'tenant-greenmart');

 // FastRetail and EduLearn recover their true canonical projectIds from initialProjects
 assert.deepEqual(Array.from(fastRetail.projectIds), ['proj-market']);
 assert.deepEqual(Array.from(eduLearn.projectIds), ['proj-edtech']);
 // GreenMart does NOT attach FastRetail's proj-market and keeps its saved specification/confirmation intact
 assert.deepEqual(Array.from(greenMart.projectIds), []);
 assert.equal(greenMart.specification.stage, 'confirmed');
 assert.equal(greenMart.specification.enterpriseConfirmation.confirmedBy, 'Lê Thanh Tùng (Quản lý Vận hành Chuỗi)');
 assert.equal(greenMart.specification.confirmedAt, undefined);

 // Open GreenMart in OnboardingView: verify Platform Admin guidance is shown when projectIds is empty
 const ui = onboardingHarness('usr-deployment', reconciled);
 const gmRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('GreenMart'));
 const rowBtns = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') rowBtns.push(n); walk(n.props.children); } })(gmRow);
 rowBtns[0].props.onClick();
 ui.render();

 const screenText = ui.textOf({ props: { children: ui.nodes() } });
 assert.ok(screenText.includes('Platform Admin'));
 assert.ok(screenText.includes('workspace-tenant-greenmart'));
 assert.equal(ui.button('Chuyển sang thiết lập quy tắc').props.disabled, true);

 // Switch to Platform Admin and click "Khởi tạo workspace triển khai" -> links workspace-tenant-greenmart while preserving saved spec
 ui.props.currentUser = { id: 'usr-admin', name: 'Lê Hoàng Phúc', email: 'admin@fraudguard.vn', role: 'Platform Admin' };
 ui.render();
 ui.click('Khởi tạo workspace triển khai (workspace-tenant-greenmart)');

 const provisionedGm = ui.props.enterprises.find((e) => e.id === 'tenant-greenmart');
 assert.deepEqual(Array.from(provisionedGm.projectIds), ['workspace-tenant-greenmart']);
 assert.equal(provisionedGm.specification.enterpriseConfirmation.confirmedBy, 'Lê Thanh Tùng (Quản lý Vận hành Chuỗi)');
 assert.equal(provisionedGm.specification.confirmedSnapshot.version, 'v1.0');

 // Reload simulation with provisioned workspace project in projects list -> workspace-tenant-greenmart stays linked
 const projectsAfterProvision = [
  ...initialProjects,
  {
   id: 'workspace-tenant-greenmart',
   name: provisionedGm.name,
   code: 'tenant-greenmart',
   description: 'Phạm vi triển khai chính',
   environment: 'Staging',
   apiKey: '',
   quota: { used: 0, total: 0, resetDate: '' },
   status: 'Inactive',
   createdAt: new Date().toISOString(),
  },
 ];
 const reloaded = reconcileEnterpriseProjects(ui.props.enterprises, demoEnterprises, projectsAfterProvision, initialRuleSets);
 const reloadedGm = reloaded.find((e) => e.id === 'tenant-greenmart');
 assert.deepEqual(Array.from(reloadedGm.projectIds), ['workspace-tenant-greenmart']);
 assert.equal(reloadedGm.specification.enterpriseConfirmation.confirmedBy, 'Lê Thanh Tùng (Quản lý Vận hành Chuỗi)');
 assert.equal( evaluateSetupReadiness(reloadedGm.specification, true, reloadedGm).enterpriseConfirmed, true );
});

test('document handling accepts .docx/.xlsx without file.text(), preserves exact binary bytes for download, shows honest preview notice, and surfaces storage failures', async () => {
 const {
  readOnboardingAttachment,
  resolveDocumentDownloadBytes,
  isDocumentPreviewSupported,
 } = loadEnterprises();

 // 1. Build a real OpenXML (.docx) binary payload (starts with PK\x03\x04) and make file.text() throw if called
 const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef]);
 const docxFile = {
  name: 'Mo_ta_nghiep_vu_doanh_nghiep.docx',
  size: docxBytes.byteLength,
  arrayBuffer: async () => docxBytes.buffer.slice(docxBytes.byteOffset, docxBytes.byteOffset + docxBytes.byteLength),
  text: async () => { throw new Error('file.text() must NEVER be called on .docx or .xlsx'); },
 };

 const parsedDocx = await readOnboardingAttachment(docxFile, true);
 assert.equal(parsedDocx.format, 'DOCX');
 assert.equal(parsedDocx.previewSupported, false);
 assert.equal(parsedDocx.content, '');
 assert.ok(parsedDocx.dataUrl.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,'));
 assert.equal(isDocumentPreviewSupported(parsedDocx), false);

 // Round-trip download payload must match original bytes 100%
 const downloadPayload = resolveDocumentDownloadBytes(parsedDocx);
 assert.ok(downloadPayload);
 assert.equal(downloadPayload.filename, 'Mo_ta_nghiep_vu_doanh_nghiep.docx');
 assert.deepEqual(Array.from(downloadPayload.bytes), Array.from(docxBytes));

 // 2. Corrupted/fake text renamed to .docx or .xlsx must be rejected
 const fakeDocx = {
  name: 'fake.docx',
  size: 12,
  arrayBuffer: async () => new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]).buffer,
 };
 await assert.rejects(readOnboardingAttachment(fakeDocx, true), /OpenXML/);

 // 3. Upload .docx into FastRetail profile via OnboardingView, open preview modal -> shows unsupported preview notice (not fake text)
 const ui = onboardingHarness('usr-deployment');
 const fastRetailRow = ui.nodes().find((n) => n.type === 'tr' && ui.textOf(n).includes('FastRetail'));
 const openBtns = [];
 (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.type === 'button') openBtns.push(n); walk(n.props.children); } })(fastRetailRow);
 openBtns[0].props.onClick();
 ui.render();

 const fileInput = ui.nodes().find((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept.includes('.docx'));
 assert.ok(fileInput, 'Intake file input must accept .docx');
 await fileInput.props.onChange({ target: { files: [docxFile], value: 'Mo_ta_nghiep_vu_doanh_nghiep.docx' } });
 ui.render();

 const fr = ui.props.enterprises.find((e) => e.id === 'tenant-fastretail');
 const savedDocx = fr.specification.intakeDocuments.find((d) => d.name === 'Mo_ta_nghiep_vu_doanh_nghiep.docx');
 assert.ok(savedDocx);
 assert.equal(savedDocx.previewSupported, false);
 assert.equal(savedDocx.content, '');

 // Click "Xem nội dung" on the .docx row -> modal explicitly explains inline preview is not supported and offers download
 const viewButtons = ui.nodes().filter((n) => n.type === 'button' && ui.textOf(n).includes('Xem nội dung'));
 viewButtons.at(-1).props.onClick();
 ui.render();
 const dialogText = ui.textOf({ props: { children: ui.nodes() } });
 assert.ok(dialogText.includes('Định dạng .DOCX hiện chưa hỗ trợ xem trước trực tiếp trên trình duyệt'));
 assert.ok(dialogText.includes('không tạo nội dung xem trước giả'));
 ui.click('Đóng');

 // 4. Simulate storage failure (QuotaExceededError -> onSave returns false) when saving draft -> shows error and never reports success
 ui.click('Bắt đầu làm rõ đặc tả');
 const origOnSave = ui.props.onSave;
 ui.props.onSave = () => false;
 ui.render();
 ui.click('Lưu bản nháp');
 const alerts = ui.nodes().filter((n) => n.props?.role === 'alert');
 assert.ok(alerts.some((n) => ui.textOf(n).includes('localStorage')));
 const statuses = ui.nodes().filter((n) => n.props?.role === 'status');
 assert.ok(!statuses.some((n) => ui.textOf(n).includes('Đã lưu bản nháp')));
 ui.props.onSave = origOnSave;
});

// Compose fixtures and helpers for existing regression scenarios after the module split.
function loadRoles() { return { ...load('src/data/fraudguard-roles.ts'), ...load('src/utils/permissions.ts'), ...load('src/routes/role-home.ts') }; }
function loadEnterprises() { return { ...load('src/data/fraudguard-enterprises.ts'), ...load('src/utils/enterprise.ts') }; }
