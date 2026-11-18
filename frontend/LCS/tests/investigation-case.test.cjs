'use strict';

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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    output,
    {
      exports,
      structuredClone,
      crypto: globalThis.crypto,
      TextEncoder: globalThis.TextEncoder,
      require: name => {
        if (name in imports) return imports[name];
        if (/^@\/(utils|data|config|routes|hooks)\//.test(name)) {
          const sub = `src/${name.slice(2)}`;
          return load(
            fs.existsSync(path.join(root, `${sub}.ts`)) ? `${sub}.ts` : `${sub}.tsx`,
            imports,
          );
        }
        if (name.startsWith('./')) {
          const base = path
            .relative(root, path.resolve(path.dirname(filename), name))
            .replace(/\\/g, '/');
          if (fs.existsSync(path.join(root, `${base}.tsx`))) return load(`${base}.tsx`, imports);
          if (fs.existsSync(path.join(root, `${base}.ts`))) return load(`${base}.ts`, imports);
        }
        return require(name);
      },
    },
    { filename },
  );
  return exports;
}

const caseMod = load('src/utils/investigation-case.ts');
const lifecycleMod = load('src/utils/enterprise-lifecycle.ts');
const ruleSetLifecycleMod = load('src/utils/rule-set-lifecycle.ts');
const rulesData = load('src/data/fraudguard-rules.ts').fraudGuardRules;
const demoEnterprises = load('src/data/fraudguard-enterprises.ts').demoEnterprises;
const demoTransactions = load('src/data/fraudguard-transactions.ts').fraudGuardTransactions;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

const platformAdmin = {
  id: 'usr-pa-1',
  name: 'Platform Admin',
  role: 'Platform Admin',
};
const implStaff = {
  id: 'usr-staff-1',
  name: 'Implementation Staff One',
  role: 'Implementation Staff',
};
const smeAdmin = {
  id: 'usr-sme-1',
  enterpriseId: 'ent-school-1',
  name: 'Tran Mai Anh',
  role: 'SME Admin',
};
const operator1 = {
  id: 'usr-op-1',
  enterpriseId: 'ent-school-1',
  name: 'Dang Tuan Kiet',
  role: 'Operator',
};
const operator2 = {
  id: 'usr-op-2',
  enterpriseId: 'ent-school-1',
  name: 'Le Hoang Nam',
  role: 'Operator',
};
const investigator1 = {
  id: 'usr-inv-1',
  enterpriseId: 'ent-school-1',
  name: 'Nguyen Van An',
  role: 'Investigator',
};
const investigatorDuplicateName = {
  id: 'usr-inv-2',
  enterpriseId: 'ent-school-1',
  name: 'Nguyen Van An',
  role: 'Investigator',
};
const viewer1 = {
  id: 'usr-view-1',
  enterpriseId: 'ent-school-1',
  name: 'Viewer One',
  role: 'Viewer',
};

const otherOperator = {
  id: 'usr-op-other',
  enterpriseId: 'ent-other-2',
  name: 'Other Operator',
  role: 'Operator',
};
const otherInvestigator = {
  id: 'usr-inv-other',
  enterpriseId: 'ent-other-2',
  name: 'Other Investigator',
  role: 'Investigator',
};
const otherSmeAdmin = {
  id: 'usr-sme-other',
  enterpriseId: 'ent-other-2',
  name: 'Other SME Admin',
  role: 'SME Admin',
};

const directoryUsers = [
  platformAdmin,
  implStaff,
  smeAdmin,
  operator1,
  operator2,
  investigator1,
  investigatorDuplicateName,
  viewer1,
  otherOperator,
  otherInvestigator,
  otherSmeAdmin,
];

function makeElectricitySchema() {
  return [
    { name: 'kwh', type: 'number', required: true, description: 'Electricity consumption kWh' },
    { name: 'after_hours', type: 'boolean', required: true, description: 'Outside operating hours' },
    { name: 'meter_id', type: 'string', required: false, description: 'Facility meter identifier' },
  ];
}

function makePublishedElectricityRuleSet(enterpriseId, projectIds) {
  const schema = makeElectricitySchema();
  const samples = [
    {
      id: 'sample-elec-1',
      ref: 'REC-ELEC-001',
      projectId: projectIds[0],
      transactionType: 'electricity',
      fields: { kwh: 46.5, after_hours: true, meter_id: 'M-CAMPUS-01' },
      expected: 'Abnormal',
    },
    {
      id: 'sample-elec-2',
      ref: 'REC-ELEC-002',
      projectId: projectIds[0],
      transactionType: 'electricity',
      fields: { kwh: 4.1, after_hours: false, meter_id: 'M-CAMPUS-01' },
      expected: 'Normal',
    },
  ];
  const ruleBase = {
    ...rulesData[0],
    id: `rule-elec-${enterpriseId}`,
    name: 'After-hours electricity threshold',
    description: 'Detect abnormally high electricity draw outside campus operating hours',
    category: 'behavior',
    version: 'v1.0',
    status: 'Published',
    enabled: true,
    appliesTo: {
      projects: ['*'],
      transactionTypes: ['electricity'],
    },
    conditionGroup: {
      type: 'group',
      id: 'grp-elec',
      logic: 'AND',
      children: [
        { type: 'condition', id: 'c1', field: 'after_hours', operator: '==', value: true },
        { type: 'condition', id: 'c2', field: 'kwh', operator: '>', value: 20 },
      ],
    },
  };
  const snapRules = ruleSetLifecycleMod.snapshotRules([ruleBase], projectIds);
  const draftSet = {
    id: `rs-${enterpriseId}`,
    name: 'Facility Electricity Rules',
    enterpriseId,
    projectIds,
    versions: [],
    draft: { rules: snapRules },
  };
  draftSet.draft.test = ruleSetLifecycleMod.testDraft(draftSet, samples, schema);
  draftSet.draft.test.testedAt = '2026-11-15T06:00:00.000Z';
  const published = ruleSetLifecycleMod.publishSet(
    draftSet,
    'Implementation Internal Reviewer',
    'Verified electricity baseline against campus specification',
    schema,
  );
  return { published, schema };
}

function buildEnterpriseThroughWf01(options = {}) {
  const enterpriseId = options.enterpriseId ?? 'ent-school-1';
  const projectIds = options.projectIds ?? ['proj-school-elec', 'proj-office-elec'];
  const plan = options.plan ?? 'Subscription';
  const targetStage = options.stage ?? 'Operating';
  const activatedAt = options.activatedAt ?? '2026-11-15T08:00:00.000Z';
  const duration = options.subscriptionDuration ?? { value: 30, unit: 'days' };
  const adminActor = options.smeAdminActor ?? {
    id: smeAdmin.id,
    name: smeAdmin.name,
    role: 'SME Admin',
    enterpriseId,
  };

  const base = {
    id: enterpriseId,
    code: 'SCH-01',
    name: options.name ?? 'Campus & Office Energy Monitoring',
    plan,
    projectIds,
    deploymentStaffId: implStaff.id,
  };

  const { published, schema } = makePublishedElectricityRuleSet(enterpriseId, projectIds);

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: base,
    actor: platformAdmin,
    ...(plan === 'Subscription' ? { subscriptionDuration: duration } : {}),
    at: '2026-11-15T05:00:00.000Z',
    eventId: `evt-init-${enterpriseId}`,
  });
  assert.equal(s0.ok, true);
  if (targetStage === 'SettingUp') return s0.enterprise;

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0.enterprise,
    actor: implStaff,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-15T06:30:00.000Z',
    eventId: `evt-sub-${enterpriseId}`,
    submissionId: `sub-${enterpriseId}`,
  });
  assert.equal(s1.ok, true);
  if (targetStage === 'PendingPlatformApproval') return s1.enterprise;

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    schema,
    at: '2026-11-15T07:00:00.000Z',
    eventId: `evt-app-${enterpriseId}`,
    approvalId: `appr-${enterpriseId}`,
  });
  assert.equal(s2.ok, true);
  if (targetStage === 'PendingSMEActivation') return s2.enterprise;

  const s3 = lifecycleMod.activateEnterprise({
    enterprise: s2.enterprise,
    actor: adminActor,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    ruleSets: [published],
    schema,
    at: activatedAt,
    eventId: `evt-act-${enterpriseId}`,
  });
  assert.equal(s3.ok, true);
  return s3.enterprise;
}

function makeAlertTx(overrides = {}) {
  const idx = overrides.seq ?? 1;
  return {
    id: overrides.id ?? `tx-elec-${idx}`,
    transactionReference: overrides.transactionReference ?? `ELEC-20261115-00${idx}`,
    projectId: overrides.projectId ?? 'proj-school-elec',
    projectName: overrides.projectName ?? 'School Electricity Meter',
    transactionType: overrides.transactionType ?? 'electricity',
    entityReference: overrides.entityReference ?? `METER-BLDG-${idx}`,
    amount: overrides.amount ?? 482,
    currency: 'kWh',
    riskLevel: overrides.riskLevel ?? 'Abnormal',
    confidence: 0.94,
    modelVersion: 'elec-ai-v2.1',
    scoringSource: overrides.scoringSource ?? 'AI',
    triggeredRules: overrides.triggeredRules ?? ['after_hours_baseline_drift'],
    explanation:
      overrides.explanation ??
      'AI detected abnormal after-hours electricity draw compared to building baseline.',
    alertId: 'alertId' in overrides ? overrides.alertId : `ALT-ELEC-${idx}`,
    alertName: overrides.alertName ?? `After-hours anomaly #${idx}`,
    processedAt: overrides.processedAt ?? '2026-11-15T09:15:00.000Z',
    ...overrides.extra,
  };
}

function createStandardCaseSetup() {
  const enterprise = buildEnterpriseThroughWf01();
  const foreignEnterprise = buildEnterpriseThroughWf01({
    enterpriseId: 'ent-other-2',
    name: 'Other Facility',
    projectIds: ['proj-other-elec'],
    smeAdminActor: otherSmeAdmin,
  });
  const alerts = [
    makeAlertTx({ seq: 1, projectId: 'proj-school-elec', projectName: 'School Building A' }),
    makeAlertTx({ seq: 2, projectId: 'proj-office-elec', projectName: 'Admin Office Block' }),
    makeAlertTx({ seq: 3, projectId: 'proj-school-elec', projectName: 'School Lab Wing' }),
    makeAlertTx({ seq: 4, projectId: 'proj-other-elec', projectName: 'Foreign Site' }),
  ];
  const enterprises = [enterprise, foreignEnterprise];
  const projects = [
    { id: 'proj-school-elec' },
    { id: 'proj-office-elec' },
    { id: 'proj-other-elec' },
  ];
  return { enterprise, foreignEnterprise, enterprises, projects, alerts };
}

test('1. Creates one Open case for 1 AI alert and one Open case with full links for N AI alerts', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  // 1-alert case
  const singleRes = caseMod.createInvestigationCase({
    caseId: 'CASE-SINGLE-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
    note: 'Single after-hours anomaly opened by operator',
  });
  assert.equal(singleRes.ok, true);
  assert.equal(singleRes.investigationCase.status, 'Open');
  assert.equal(singleRes.investigationCase.enterpriseId, 'ent-school-1');
  assert.deepEqual(singleRes.investigationCase.alertIds, ['ALT-ELEC-1']);
  assert.equal(singleRes.investigationCase.alerts.length, 1);
  assert.equal(singleRes.investigationCase.alerts[0].transactionId, 'tx-elec-1');
  assert.equal(singleRes.investigationCase.alerts[0].transactionReference, 'ELEC-20261115-001');
  assert.equal(singleRes.investigationCase.alerts[0].scoringSource, 'AI');
  assert.equal(singleRes.investigationCase.alerts[0].riskLevel, 'Abnormal');
  assert.equal(singleRes.investigationCase.createdBy.actorId, operator1.id);
  assert.equal(singleRes.investigationCase.creationEligibility.operatingStatus, 'Operating');
  assert.equal(singleRes.investigationCase.creationEligibility.servicePlan, 'Subscription');
  assert.equal(
    singleRes.investigationCase.creationEligibility.subscriptionStartedAt,
    '2026-11-15T08:00:00.000Z',
  );
  assert.equal(singleRes.investigationCase.reports.length, 0);
  assert.equal(singleRes.investigationCase.history.length, 1);
  assert.equal(singleRes.event.type, 'CASE_CREATED');
  assert.equal(singleRes.event.fromStatus, null);
  assert.equal(singleRes.event.toStatus, 'Open');

  // N-alert case across multiple owned projects -> single Open case with full links
  const multiRes = caseMod.createInvestigationCase({
    caseId: 'CASE-MULTI-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2', 'ALT-ELEC-3'],
    alerts,
    enterprises,
    projects,
    existingCases: [singleRes.investigationCase],
    at: '2026-11-15T17:30:00+07:00',
  });
  assert.equal(multiRes.ok, true);
  assert.equal(multiRes.investigationCase.status, 'Open');
  assert.equal(multiRes.investigationCase.createdAt, '2026-11-15T10:30:00.000Z');
  assert.deepEqual(multiRes.investigationCase.alertIds, ['ALT-ELEC-2', 'ALT-ELEC-3']);
  assert.equal(multiRes.investigationCase.alerts.length, 2);
  assert.equal(multiRes.investigationCase.alerts[0].projectId, 'proj-office-elec');
  assert.equal(multiRes.investigationCase.alerts[1].projectId, 'proj-school-elec');
  assert.equal(multiRes.investigationCase.history.length, 1);

  // Caller-forged eligible: true on an uninitialized/non-operating enterprise is ignored
  const forgedLegacyEnterprise = {
    ...demoEnterprises[0],
    eligible: true,
    isOperating: true,
  };
  const forgedRes = caseMod.createInvestigationCase({
    caseId: 'CASE-FORGED-01',
    enterprise: forgedLegacyEnterprise,
    actor: { ...operator1, enterpriseId: forgedLegacyEnterprise.id },
    alertIds: ['ALT-LEGACY-1'],
    alerts: [
      makeAlertTx({
        seq: 99,
        alertId: 'ALT-LEGACY-1',
        projectId: forgedLegacyEnterprise.projectIds[0],
      }),
    ],
    existingCases: [],
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(forgedRes.ok, false);
  assert.equal(forgedRes.code, 'ENTERPRISE_LIFECYCLE_UNINITIALIZED');
});

test('2. Rejects empty selection, duplicates, missing/ambiguous alerts, Open/Closed linked alerts, legacy links, and duplicate case IDs atomically', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-EXISTING-OPEN',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T09:30:00.000Z',
  }).investigationCase;

  // Build a Closed case holding ALT-ELEC-2
  const preClosedOpen = caseMod.createInvestigationCase({
    caseId: 'CASE-EXISTING-CLOSED',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    enterprises,
    projects,
    existingCases: [openCase],
    at: '2026-11-15T09:31:00.000Z',
  }).investigationCase;
  const selfAssigned = caseMod.selfAssignInvestigationCase({
    investigationCase: preClosedOpen,
    actor: operator1,
    at: '2026-11-15T09:32:00.000Z',
  }).investigationCase;
  const submitted = caseMod.submitInvestigationReport({
    investigationCase: selfAssigned,
    actor: operator1,
    summary: 'Confirmed unauthorized lab load',
    alertResults: [
      {
        alertId: 'ALT-ELEC-2',
        resultText: 'Confirmed after-hours equipment left running',
        evidence: 'Meter log showed 48 kWh continuous draw at 01:00',
      },
    ],
    at: '2026-11-15T09:35:00.000Z',
  }).investigationCase;
  const closedCase = caseMod.confirmInvestigationCaseReport({
    investigationCase: submitted,
    actor: operator1,
    reportId: submitted.pendingReviewReportId,
    reportVersion: submitted.pendingReviewReportVersion,
    at: '2026-11-15T09:40:00.000Z',
  }).investigationCase;

  const legacyLinkedTx = makeAlertTx({
    seq: 10,
    alertId: 'ALT-LEGACY-CASE',
    projectId: 'proj-school-elec',
    extra: { caseId: 'CASE-OLD-001', caseStatus: 'Assigned' },
  });
  const legacyStatusOnlyTx = makeAlertTx({
    seq: 11,
    alertId: 'ALT-LEGACY-STATUS',
    projectId: 'proj-school-elec',
    extra: { caseStatus: 'Open' },
  });
  const dupSourceA = makeAlertTx({ seq: 12, id: 'tx-dup-a', alertId: 'ALT-DUP-MAP' });
  const dupSourceB = makeAlertTx({ seq: 13, id: 'tx-dup-b', alertId: 'ALT-DUP-MAP' });

  const allAlerts = [...alerts, legacyLinkedTx, legacyStatusOnlyTx, dupSourceA, dupSourceB];
  const existingCases = [openCase, closedCase];
  const existingSnapshot = structuredClone(existingCases);
  const alertsSnapshot = structuredClone(allAlerts);

  const emptyRes = caseMod.createInvestigationCase({
    caseId: 'CASE-EMPTY',
    enterprise,
    actor: operator1,
    alertIds: [],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(emptyRes.ok, false);
  assert.equal(emptyRes.code, 'EMPTY_ALERT_LIST');

  const blankAlertRes = caseMod.createInvestigationCase({
    caseId: 'CASE-BLANK-ALT',
    enterprise,
    actor: operator1,
    alertIds: ['   '],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(blankAlertRes.ok, false);
  assert.equal(blankAlertRes.code, 'INVALID_ALERT_ID');

  const dupSelectionRes = caseMod.createInvestigationCase({
    caseId: 'CASE-DUP-SEL',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3', 'ALT-ELEC-3'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(dupSelectionRes.ok, false);
  assert.equal(dupSelectionRes.code, 'DUPLICATE_ALERT_ID');

  const missingAlertRes = caseMod.createInvestigationCase({
    caseId: 'CASE-MISSING-ALT',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-DOES-NOT-EXIST'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(missingAlertRes.ok, false);
  assert.equal(missingAlertRes.code, 'ALERT_NOT_FOUND');

  // Must not substitute transaction.id for alertId
  const txIdAsAlertRes = caseMod.createInvestigationCase({
    caseId: 'CASE-TX-AS-ALERT',
    enterprise,
    actor: operator1,
    alertIds: ['tx-elec-3'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(txIdAsAlertRes.ok, false);
  assert.equal(txIdAsAlertRes.code, 'ALERT_NOT_FOUND');

  const ambiguousMapRes = caseMod.createInvestigationCase({
    caseId: 'CASE-AMB-MAP',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-DUP-MAP'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(ambiguousMapRes.ok, false);
  assert.equal(ambiguousMapRes.code, 'AMBIGUOUS_ALERT_MAPPING');

  // Atomic rejection when mixing valid ALT-ELEC-3 with Open-linked ALT-ELEC-1
  const openLinkedMixRes = caseMod.createInvestigationCase({
    caseId: 'CASE-ATOMIC-OPEN',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3', 'ALT-ELEC-1'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(openLinkedMixRes.ok, false);
  assert.equal(openLinkedMixRes.code, 'ALERT_ALREADY_LINKED');

  // Atomic rejection when mixing valid ALT-ELEC-3 with Closed-linked ALT-ELEC-2
  const closedLinkedMixRes = caseMod.createInvestigationCase({
    caseId: 'CASE-ATOMIC-CLOSED',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3', 'ALT-ELEC-2'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(closedLinkedMixRes.ok, false);
  assert.equal(closedLinkedMixRes.code, 'ALERT_ALREADY_LINKED');

  // Atomic rejection when mixing valid ALT-ELEC-3 with legacy linked transactions
  for (const legacyAlertId of ['ALT-LEGACY-CASE', 'ALT-LEGACY-STATUS']) {
    const legacyMixRes = caseMod.createInvestigationCase({
      caseId: 'CASE-ATOMIC-LEGACY',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-3', legacyAlertId],
      alerts: allAlerts,
      existingCases,
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(legacyMixRes.ok, false);
    assert.equal(legacyMixRes.code, 'ALERT_LEGACY_LINKED');
  }

  // Duplicate caseId (both Open and Closed) and blank caseId rejected
  for (const existingCaseId of ['CASE-EXISTING-OPEN', 'CASE-EXISTING-CLOSED']) {
    const dupCaseRes = caseMod.createInvestigationCase({
      caseId: existingCaseId,
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-3'],
      alerts: allAlerts,
      existingCases,
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(dupCaseRes.ok, false);
    assert.equal(dupCaseRes.code, 'DUPLICATE_CASE_ID');
  }
  const blankCaseIdRes = caseMod.createInvestigationCase({
    caseId: '  ',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(blankCaseIdRes.ok, false);
  assert.equal(blankCaseIdRes.code, 'MISSING_CASE_ID');

  // Verify existingCases & alerts untouched and valid ALT-ELEC-3 was never partially linked
  assert.deepEqual(existingCases, existingSnapshot);
  assert.deepEqual(allAlerts, alertsSnapshot);

  const validAfterFailures = caseMod.createInvestigationCase({
    caseId: 'CASE-AFTER-ATOMIC-REJECTIONS',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts: allAlerts,
    existingCases,
    enterprises,
    projects,
    at: '2026-11-15T10:05:00.000Z',
  });
  assert.equal(validAfterFailures.ok, true);
  assert.deepEqual(validAfterFailures.investigationCase.alertIds, ['ALT-ELEC-3']);
});

test('3. Blocks Rule, Rule Fallback, Normal, Undetermined alerts, mixed-tenant alerts, and invalid project->enterprise mappings', () => {
  const { enterprise, foreignEnterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  const ruleAlert = makeAlertTx({ seq: 20, alertId: 'ALT-RULE', scoringSource: 'RULE' });
  const fallbackAlert = makeAlertTx({
    seq: 21,
    alertId: 'ALT-FALLBACK',
    scoringSource: 'RULE_FALLBACK',
  });
  const normalAiAlert = makeAlertTx({ seq: 22, alertId: 'ALT-NORMAL', riskLevel: 'Normal' });
  const undeterminedAiAlert = makeAlertTx({
    seq: 23,
    alertId: 'ALT-UNDET',
    riskLevel: 'Undetermined',
  });
  const blankProjectAlert = makeAlertTx({
    seq: 24,
    alertId: 'ALT-BLANK-PROJ',
    projectId: '   ',
  });
  const unknownCatalogProjectAlert = makeAlertTx({
    seq: 25,
    alertId: 'ALT-UNCATALOGED-PROJ',
    projectId: 'proj-missing-from-catalog',
  });
  const unmappedProjectAlert = makeAlertTx({
    seq: 26,
    alertId: 'ALT-UNMAPPED-PROJ',
    projectId: 'proj-orphan',
  });
  const sharedAmbiguousProjectAlert = makeAlertTx({
    seq: 27,
    alertId: 'ALT-SHARED-PROJ',
    projectId: 'proj-shared-ambiguity',
  });

  const pool = [
    ...alerts,
    ruleAlert,
    fallbackAlert,
    normalAiAlert,
    undeterminedAiAlert,
    blankProjectAlert,
    unknownCatalogProjectAlert,
    unmappedProjectAlert,
    sharedAmbiguousProjectAlert,
  ];

  // Block RULE and RULE_FALLBACK
  for (const id of ['ALT-RULE', 'ALT-FALLBACK']) {
    const res = caseMod.createInvestigationCase({
      caseId: `CASE-${id}`,
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-1', id],
      alerts: pool,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INELIGIBLE_ALERT_SOURCE');
  }

  // Block Normal and Undetermined
  for (const id of ['ALT-NORMAL', 'ALT-UNDET']) {
    const res = caseMod.createInvestigationCase({
      caseId: `CASE-${id}`,
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-1', id],
      alerts: pool,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'INELIGIBLE_ALERT_RISK_LEVEL');
  }

  // Also test real repo demo anomalies (Normal with alertId/caseId, RULE, RULE_FALLBACK)
  const techPayEnt = buildEnterpriseThroughWf01({
    enterpriseId: 'tenant-techpay',
    projectIds: ['proj-wallet', 'proj-checkout'],
    smeAdminActor: {
      id: 'usr-techpay-admin',
      name: 'TechPay Admin',
      role: 'SME Admin',
      enterpriseId: 'tenant-techpay',
    },
  });
  const techPayOp = { id: 'usr-tp-op', enterpriseId: 'tenant-techpay', role: 'Operator', name: 'TP Op' };
  const tx002Fallback = demoTransactions.find(tx => tx.id === 'tx-002'); // proj-wallet RULE_FALLBACK
  assert.equal(tx002Fallback.scoringSource, 'RULE_FALLBACK');
  const demoFallbackRes = caseMod.createInvestigationCase({
    caseId: 'CASE-DEMO-FALLBACK',
    enterprise: techPayEnt,
    actor: techPayOp,
    alertIds: [tx002Fallback.alertId],
    alerts: demoTransactions,
    existingCases: [],
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(demoFallbackRes.ok, false);
  assert.equal(demoFallbackRes.code, 'INELIGIBLE_ALERT_SOURCE');

  // Mixed-tenant alerts (own tenant + foreign tenant)
  const mixedTenantRes = caseMod.createInvestigationCase({
    caseId: 'CASE-MIXED-TENANT',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1', 'ALT-ELEC-4'],
    alerts: pool,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(mixedTenantRes.ok, false);
  assert.equal(mixedTenantRes.code, 'CROSS_TENANT_ALERT');

  // Invalid project -> enterprise mappings
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-BLANK-PROJ',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-BLANK-PROJ'],
      alerts: pool,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'INVALID_PROJECT_MAPPING',
  );

  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-UNCATALOGED-PROJ',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-UNCATALOGED-PROJ'],
      alerts: pool,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'INVALID_PROJECT_MAPPING',
  );

  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-UNMAPPED-PROJ',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-UNMAPPED-PROJ'],
      alerts: pool,
      existingCases: [],
      enterprises,
      projects: [...projects, { id: 'proj-orphan' }],
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'INVALID_PROJECT_MAPPING',
  );

  // Ambiguous project mapped to two enterprises
  const entWithSharedA = { ...enterprise, projectIds: [...enterprise.projectIds, 'proj-shared-ambiguity'] };
  const entWithSharedB = {
    ...foreignEnterprise,
    projectIds: [...foreignEnterprise.projectIds, 'proj-shared-ambiguity'],
  };
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-AMBIGUOUS-PROJ',
      enterprise: entWithSharedA,
      actor: operator1,
      alertIds: ['ALT-SHARED-PROJ'],
      alerts: pool,
      existingCases: [],
      enterprises: [entWithSharedA, entWithSharedB],
      projects: [...projects, { id: 'proj-shared-ambiguity' }],
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'INVALID_PROJECT_MAPPING',
  );

  // Foreign project claimed in local enterprise.projectIds while directory maps it elsewhere
  const spoofedEnterprise = { ...enterprise, projectIds: [...enterprise.projectIds, 'proj-other-elec'] };
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-SPOOFED-PROJ',
      enterprise: spoofedEnterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-4'],
      alerts: pool,
      existingCases: [],
      enterprises: [enterprise, foreignEnterprise],
      projects,
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'CROSS_TENANT_ALERT',
  );
});

test('4. Enforces actor role/tenant and WF-01 Operating + Subscription boundaries using real WF-01 helpers', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  // Wrong actor roles and cross-tenant operator
  for (const forbiddenActor of [investigator1, smeAdmin, platformAdmin, implStaff, viewer1]) {
    const res = caseMod.createInvestigationCase({
      caseId: 'CASE-BAD-ROLE',
      enterprise,
      actor: forbiddenActor,
      alertIds: ['ALT-ELEC-1'],
      alerts,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'FORBIDDEN_ROLE');
  }
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-CROSS-OP',
      enterprise,
      actor: otherOperator,
      alertIds: ['ALT-ELEC-1'],
      alerts,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'FORBIDDEN_TENANT',
  );
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-INVALID-ACTOR',
      enterprise,
      actor: { id: ' ', role: 'Operator', enterpriseId: 'ent-school-1' },
      alertIds: ['ALT-ELEC-1'],
      alerts,
      existingCases: [],
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'INVALID_ACTOR',
  );

  // Missing enterprise and uninitialized legacy enterprise (demoEnterprises[0])
  assert.equal(
    caseMod.checkInvestigationCaseCreationEligibility(undefined, '2026-11-15T10:00:00.000Z').code,
    'ENTERPRISE_NOT_FOUND',
  );
  const abcLegacy = demoEnterprises[0];
  assert.equal(abcLegacy.specification.stage, 'confirmed');
  assert.equal(
    caseMod.checkInvestigationCaseCreationEligibility(abcLegacy, '2026-11-15T10:00:00.000Z').code,
    'ENTERPRISE_LIFECYCLE_UNINITIALIZED',
  );

  // Real WF-01 non-Operating stages blocked
  for (const stage of ['SettingUp', 'PendingPlatformApproval', 'PendingSMEActivation']) {
    const nonOpEnt = buildEnterpriseThroughWf01({
      enterpriseId: `ent-${stage}`,
      projectIds: ['proj-school-elec'],
      stage,
    });
    assert.equal(lifecycleMod.isEnterpriseOperating(nonOpEnt), false);
    const res = caseMod.createInvestigationCase({
      caseId: `CASE-${stage}`,
      enterprise: nonOpEnt,
      actor: { ...operator1, enterpriseId: nonOpEnt.id },
      alertIds: ['ALT-ELEC-1'],
      alerts,
      existingCases: [],
      at: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ENTERPRISE_NOT_OPERATING');
  }

  // Real WF-01 Free plan Operating enterprise allowed by general Operating check, blocked for AI investigation
  const freeOperatingEnt = buildEnterpriseThroughWf01({
    enterpriseId: 'ent-free-1',
    projectIds: ['proj-school-elec'],
    plan: 'Free',
    stage: 'Operating',
  });
  assert.equal(lifecycleMod.isEnterpriseOperating(freeOperatingEnt), true);
  assert.equal(
    lifecycleMod.checkEnterpriseOperationalEligibility(freeOperatingEnt, {
      at: '2026-11-15T10:00:00.000Z',
      requireSubscription: false,
    }).eligible,
    true,
  );
  const freeRes = caseMod.createInvestigationCase({
    caseId: 'CASE-FREE-PLAN',
    enterprise: freeOperatingEnt,
    actor: { ...operator1, enterpriseId: 'ent-free-1' },
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(freeRes.ok, false);
  assert.equal(freeRes.code, 'PLAN_NOT_SUBSCRIPTION');

  // Exact WF-01 Subscription [startedAt, expiresAt) boundaries:
  // activatedAt = 2026-11-15T08:00:00.000Z, 30 days => expiresAt = 2026-12-15T08:00:00.000Z
  assert.equal(enterprise.lifecycle.subscription.startedAt, '2026-11-15T08:00:00.000Z');
  assert.equal(enterprise.lifecycle.subscription.expiresAt, '2026-12-15T08:00:00.000Z');
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(enterprise, '2026-11-15T07:59:59.999Z'),
    false,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(enterprise, '2026-11-15T08:00:00.000Z'),
    true,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(enterprise, '2026-12-15T07:59:59.999Z'),
    true,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(enterprise, '2026-12-15T08:00:00.000Z'),
    false,
  );

  // 1ms before startedAt -> blocked
  const beforeStartRes = caseMod.createInvestigationCase({
    caseId: 'CASE-BEFORE-START',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    at: '2026-11-15T07:59:59.999Z',
  });
  assert.equal(beforeStartRes.ok, false);
  assert.equal(beforeStartRes.code, 'SUBSCRIPTION_NOT_STARTED');

  // Exact startedAt (via +07:00 offset) -> allowed
  const atStartRes = caseMod.createInvestigationCase({
    caseId: 'CASE-AT-START',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    at: '2026-11-15T15:00:00+07:00',
  });
  assert.equal(atStartRes.ok, true);
  assert.equal(atStartRes.investigationCase.createdAt, '2026-11-15T08:00:00.000Z');

  // 1ms before expiresAt -> allowed
  const beforeExpiryRes = caseMod.createInvestigationCase({
    caseId: 'CASE-BEFORE-EXPIRY',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [atStartRes.investigationCase],
    at: '2026-12-15T07:59:59.999Z',
  });
  assert.equal(beforeExpiryRes.ok, true);

  // Exact expiresAt -> blocked
  const atExpiryRes = caseMod.createInvestigationCase({
    caseId: 'CASE-AT-EXPIRY',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts,
    existingCases: [atStartRes.investigationCase, beforeExpiryRes.investigationCase],
    at: '2026-12-15T08:00:00.000Z',
  });
  assert.equal(atExpiryRes.ok, false);
  assert.equal(atExpiryRes.code, 'SUBSCRIPTION_EXPIRED');

  // Missing timezone timestamp -> rejected
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-BAD-TS',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-3'],
      alerts,
      existingCases: [atStartRes.investigationCase, beforeExpiryRes.investigationCase],
      at: '2026-11-15T10:00:00',
    }).code,
    'INVALID_TIMESTAMP',
  );

  // Tampered WF-01 activatedConfig snapshot -> rejected by real WF-01 hash verification
  const tamperedEnterprise = structuredClone(enterprise);
  tamperedEnterprise.lifecycle.activatedConfig.rules[0].conditionGroup.children[1].value = 999999;
  assert.equal(
    caseMod.createInvestigationCase({
      caseId: 'CASE-TAMPERED-WF01',
      enterprise: tamperedEnterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-3'],
      alerts,
      existingCases: [atStartRes.investigationCase, beforeExpiryRes.investigationCase],
      at: '2026-11-15T10:00:00.000Z',
    }).code,
    'ENTERPRISE_NOT_OPERATING',
  );
});

test('5. Assigns same-tenant Investigator Open -> Investigating by ID, rejecting wrong tenant/role/missing ID and duplicate display names', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-ASSIGN-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;

  // Reject wrong actor roles and cross-tenant operator
  for (const actor of [investigator1, smeAdmin, platformAdmin, implStaff, viewer1]) {
    assert.equal(
      caseMod.assignInvestigatorToCase({
        investigationCase: openCase,
        actor,
        assigneeId: investigator1.id,
        users: directoryUsers,
        at: '2026-11-15T10:05:00.000Z',
      }).code,
      'FORBIDDEN_ROLE',
    );
  }
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: otherOperator,
      assigneeId: investigator1.id,
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'FORBIDDEN_TENANT',
  );

  // Reject missing/unknown assigneeId and display-name lookup attempt
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: operator1,
      assigneeId: '  ',
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'MISSING_ASSIGNEE_ID',
  );
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: operator1,
      assigneeId: 'usr-does-not-exist',
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'ASSIGNEE_NOT_FOUND',
  );
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: operator1,
      assigneeId: investigator1.name,
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'ASSIGNEE_NOT_FOUND',
  );

  // Reject wrong assignee role & wrong tenant investigator
  for (const nonInvestigator of [operator2, smeAdmin, platformAdmin, implStaff, viewer1]) {
    assert.equal(
      caseMod.assignInvestigatorToCase({
        investigationCase: openCase,
        actor: operator1,
        assigneeId: nonInvestigator.id,
        users: directoryUsers,
        at: '2026-11-15T10:05:00.000Z',
      }).code,
      'INVALID_ASSIGNEE_ROLE',
    );
  }
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: operator1,
      assigneeId: otherInvestigator.id,
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'ASSIGNEE_TENANT_MISMATCH',
  );

  // Reject duplicate user IDs in directory and spoofed actor role mismatch
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: operator1,
      assigneeId: investigator1.id,
      users: [...directoryUsers, { ...investigator1 }],
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'AMBIGUOUS_USER',
  );
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: openCase,
      actor: { ...operator1, id: investigator1.id },
      assigneeId: investigator1.id,
      users: directoryUsers,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'INVALID_ACTOR',
  );

  // Valid assignment transitions directly Open -> Investigating (no Assigned step)
  const assignRes = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:10:00.000Z',
  });
  assert.equal(assignRes.ok, true);
  assert.equal(assignRes.investigationCase.status, 'Investigating');
  assert.equal(assignRes.investigationCase.assignmentMode, 'assigned');
  assert.equal(assignRes.investigationCase.assignee.actorId, investigator1.id);
  assert.equal(assignRes.investigationCase.assignedBy.actorId, operator1.id);
  assert.equal(assignRes.event.type, 'INVESTIGATOR_ASSIGNED');
  assert.equal(assignRes.event.fromStatus, 'Open');
  assert.equal(assignRes.event.toStatus, 'Investigating');

  // Cannot re-assign once Investigating in Phase 1
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: assignRes.investigationCase,
      actor: operator1,
      assigneeId: investigatorDuplicateName.id,
      users: directoryUsers,
      at: '2026-11-15T10:12:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  // Duplicate display name ('Nguyen Van An') on usr-inv-2 does NOT grant write or read access
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: assignRes.investigationCase,
      actor: investigatorDuplicateName,
      summary: 'Impersonation via matching display name',
      alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Suspicious', evidence: 'Log' }],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'FORBIDDEN_ASSIGNEE',
  );
  assert.equal(
    caseMod.readInternalInvestigationCase({
      investigationCase: assignRes.investigationCase,
      actor: investigatorDuplicateName,
    }).code,
    'FORBIDDEN_ASSIGNEE',
  );

  // True assignee (usr-inv-1) retains access even if their display name changes
  const renamedOwner = { ...investigator1, name: 'Nguyen Van An (Renamed)' };
  assert.equal(
    caseMod.readInternalInvestigationCase({
      investigationCase: assignRes.investigationCase,
      actor: renamedOwner,
    }).ok,
    true,
  );
});

test('6. Assigned Investigator submits report to Pending Review; unassigned Investigator or non-self-assigned Operator blocked', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-SUBMIT-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;

  // Cannot submit before Investigating
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: openCase,
      actor: operator1,
      summary: 'Premature report on Open case',
      alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Abnormal', evidence: 'Meter' }],
      at: '2026-11-15T10:02:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  const assignedCase = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;

  const validReportPayload = {
    investigationCase: assignedCase,
    summary: 'Campus meter M-01 exceeded night threshold due to unscheduled equipment load.',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Confirmed after-hours anomaly requiring facility follow-up',
        evidence: 'Smart meter interval log 01:00-03:00 recorded 46.5 kWh.',
      },
    ],
    at: '2026-11-15T10:20:00.000Z',
  };

  // Operator who did NOT self-assign cannot write/submit report for an Investigator-assigned case
  assert.equal(
    caseMod.submitInvestigationReport({ ...validReportPayload, actor: operator1 }).code,
    'FORBIDDEN_ASSIGNEE',
  );
  // Unassigned same-tenant Investigator blocked
  assert.equal(
    caseMod.submitInvestigationReport({
      ...validReportPayload,
      actor: investigatorDuplicateName,
    }).code,
    'FORBIDDEN_ASSIGNEE',
  );
  // Cross-tenant Investigator blocked
  assert.equal(
    caseMod.submitInvestigationReport({ ...validReportPayload, actor: otherInvestigator }).code,
    'FORBIDDEN_TENANT',
  );
  // SME Admin, Platform Admin, Implementation Staff, Viewer blocked
  for (const roleActor of [smeAdmin, platformAdmin, implStaff, viewer1]) {
    assert.equal(
      caseMod.submitInvestigationReport({ ...validReportPayload, actor: roleActor }).code,
      'FORBIDDEN_ROLE',
    );
  }

  // Assigned Investigator submits -> Pending Review
  const submitRes = caseMod.submitInvestigationReport({
    ...validReportPayload,
    actor: investigator1,
    reportId: 'RPT-SUB-1',
  });
  assert.equal(submitRes.ok, true);
  assert.equal(submitRes.investigationCase.status, 'Pending Review');
  assert.equal(submitRes.investigationCase.pendingReviewReportId, 'RPT-SUB-1');
  assert.equal(submitRes.investigationCase.pendingReviewReportVersion, 1);
  assert.equal(submitRes.investigationCase.reports.length, 1);
  assert.equal(submitRes.investigationCase.reports[0].submittedBy.actorId, investigator1.id);
  assert.equal(submitRes.event.type, 'REPORT_SUBMITTED');

  // Another Operator cannot submit on a self-investigated case owned by operator1
  const openSelf = caseMod.createInvestigationCase({
    caseId: 'CASE-SUBMIT-SELF-LOCK',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [submitRes.investigationCase],
    enterprises,
    projects,
    at: '2026-11-15T10:30:00.000Z',
  }).investigationCase;
  const selfCase = caseMod.selfAssignInvestigationCase({
    investigationCase: openSelf,
    actor: operator1,
    at: '2026-11-15T10:31:00.000Z',
  }).investigationCase;
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: selfCase,
      actor: operator2,
      summary: 'Second operator hijacking report',
      alertResults: [{ alertId: 'ALT-ELEC-2', resultText: 'Note', evidence: 'Log' }],
      at: '2026-11-15T10:32:00.000Z',
    }).code,
    'FORBIDDEN_ASSIGNEE',
  );
});

test('7. Same Operator self-assigns, submits report, and confirms to Closed as distinct steps recorded separately in audit history', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  const createRes = caseMod.createInvestigationCase({
    caseId: 'CASE-SELF-FLOW',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1', 'ALT-ELEC-2'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T09:00:00.000Z',
  });
  assert.equal(createRes.ok, true);

  // Non-Operator / cross-tenant Operator cannot self-assign
  assert.equal(
    caseMod.selfAssignInvestigationCase({
      investigationCase: createRes.investigationCase,
      actor: investigator1,
      at: '2026-11-15T09:05:00.000Z',
    }).code,
    'FORBIDDEN_ROLE',
  );
  assert.equal(
    caseMod.selfAssignInvestigationCase({
      investigationCase: createRes.investigationCase,
      actor: otherOperator,
      at: '2026-11-15T09:05:00.000Z',
    }).code,
    'FORBIDDEN_TENANT',
  );

  const selfRes = caseMod.selfAssignInvestigationCase({
    investigationCase: createRes.investigationCase,
    actor: operator1,
    at: '2026-11-15T09:10:00.000Z',
  });
  assert.equal(selfRes.ok, true);
  assert.equal(selfRes.investigationCase.status, 'Investigating');
  assert.equal(selfRes.investigationCase.assignmentMode, 'self_investigated');
  assert.equal(selfRes.investigationCase.assignee.actorId, operator1.id);

  const submitRes = caseMod.submitInvestigationReport({
    investigationCase: selfRes.investigationCase,
    actor: operator1,
    summary: 'Self-investigated office and school building electricity anomalies',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Confirmed AC chiller left active overnight',
        evidence: 'HVAC controller schedule & 45 kWh meter spike at 01:30',
      },
      {
        alertId: 'ALT-ELEC-2',
        resultText: 'Verified authorized server backup window',
        evidence: 'IT change ticket CHG-2026-11 approved overnight run',
      },
    ],
    at: '2026-11-15T09:30:00.000Z',
  });
  assert.equal(submitRes.ok, true);
  assert.equal(submitRes.investigationCase.status, 'Pending Review');

  const confirmRes = caseMod.confirmInvestigationCaseReport({
    investigationCase: submitRes.investigationCase,
    actor: operator1,
    reportId: submitRes.investigationCase.pendingReviewReportId,
    reportVersion: submitRes.investigationCase.pendingReviewReportVersion,
    at: '2026-11-15T09:45:00.000Z',
  });
  assert.equal(confirmRes.ok, true);
  const closed = confirmRes.investigationCase;
  assert.equal(closed.status, 'Closed');
  assert.equal(closed.closedAt, '2026-11-15T09:45:00.000Z');
  assert.equal(closed.conclusion.confirmedBy.actorId, operator1.id);
  assert.equal(closed.conclusion.confirmedAt, '2026-11-15T09:45:00.000Z');
  assert.equal(closed.conclusion.reportVersion, 1);

  assert.equal(closed.history.length, 4);
  assert.deepEqual(
    closed.history.map(e => ({
      type: e.type,
      from: e.fromStatus,
      to: e.toStatus,
      actorId: e.actor.actorId,
      at: e.at,
    })),
    [
      {
        type: 'CASE_CREATED',
        from: null,
        to: 'Open',
        actorId: operator1.id,
        at: '2026-11-15T09:00:00.000Z',
      },
      {
        type: 'OPERATOR_SELF_ASSIGNED',
        from: 'Open',
        to: 'Investigating',
        actorId: operator1.id,
        at: '2026-11-15T09:10:00.000Z',
      },
      {
        type: 'REPORT_SUBMITTED',
        from: 'Investigating',
        to: 'Pending Review',
        actorId: operator1.id,
        at: '2026-11-15T09:30:00.000Z',
      },
      {
        type: 'REPORT_CONFIRMED_AND_CLOSED',
        from: 'Pending Review',
        to: 'Closed',
        actorId: operator1.id,
        at: '2026-11-15T09:45:00.000Z',
      },
    ],
  );
  assert.equal(closed.history[2].reportId, closed.reports[0].reportId);
  assert.equal(closed.history[3].reportId, closed.reports[0].reportId);
});

test('8. Blocks direct closing from Open/Investigating and blocks Investigator, SME Admin, Platform Admin, and cross-tenant Operator confirmation', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-CONFIRM-GUARDS',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;

  // Cannot confirm/close Open directly
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: openCase,
      actor: operator1,
      reportId: 'RPT-ANY',
      reportVersion: 1,
      at: '2026-11-15T10:05:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  const investigatingCase = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:10:00.000Z',
  }).investigationCase;

  // Cannot confirm/close Investigating directly
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: investigatingCase,
      actor: operator1,
      reportId: 'RPT-ANY',
      reportVersion: 1,
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  const pendingCase = caseMod.submitInvestigationReport({
    investigationCase: investigatingCase,
    actor: investigator1,
    summary: 'Initial findings for building A',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Needs facility check',
        evidence: 'Meter reading M-01 at 02:00',
      },
    ],
    at: '2026-11-15T10:20:00.000Z',
  }).investigationCase;

  // Investigator, SME Admin, Platform Admin, Implementation Staff, Viewer cannot confirm
  for (const forbidden of [investigator1, smeAdmin, platformAdmin, implStaff, viewer1]) {
    const confirmRes = caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingCase,
      actor: forbidden,
      reportId: pendingCase.pendingReviewReportId,
      reportVersion: pendingCase.pendingReviewReportVersion,
      at: '2026-11-15T10:25:00.000Z',
    });
    assert.equal(confirmRes.ok, false);
    assert.equal(confirmRes.code, 'FORBIDDEN_ROLE');

    const revRes = caseMod.requestInvestigationCaseRevision({
      investigationCase: pendingCase,
      actor: forbidden,
      reason: 'Unauthorized revision attempt',
      at: '2026-11-15T10:25:00.000Z',
    });
    assert.equal(revRes.ok, false);
    assert.equal(revRes.code, 'FORBIDDEN_ROLE');
  }

  // Cross-tenant Operator cannot confirm or request revision
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingCase,
      actor: otherOperator,
      reportId: pendingCase.pendingReviewReportId,
      reportVersion: pendingCase.pendingReviewReportVersion,
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'FORBIDDEN_TENANT',
  );
  assert.equal(
    caseMod.requestInvestigationCaseRevision({
      investigationCase: pendingCase,
      actor: otherOperator,
      reason: 'Cross-tenant revision attempt',
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'FORBIDDEN_TENANT',
  );
});

test('9. Revision request requires reason, preserves prior versions, increments version on resubmit, and blocks confirming stale versions', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-REVISION-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;

  const investigatingCase = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;

  const pendingV1 = caseMod.submitInvestigationReport({
    investigationCase: investigatingCase,
    actor: investigator1,
    reportId: 'RPT-V1',
    summary: 'Preliminary summary missing meter photo',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Suspected after-hours HVAC load',
        evidence: 'Raw meter log entry only',
      },
    ],
    at: '2026-11-15T10:15:00.000Z',
  }).investigationCase;

  // Blank revision reason rejected
  assert.equal(
    caseMod.requestInvestigationCaseRevision({
      investigationCase: pendingV1,
      actor: operator1,
      reason: '   ',
      at: '2026-11-15T10:20:00.000Z',
    }).code,
    'MISSING_REVISION_REASON',
  );

  // Valid revision request -> Investigating, keeps v1 untouched
  const revised = caseMod.requestInvestigationCaseRevision({
    investigationCase: pendingV1,
    actor: operator1,
    reason: 'Attach building guard log and hourly sub-meter breakdown.',
    at: '2026-11-15T10:25:00.000Z',
  });
  assert.equal(revised.ok, true);
  assert.equal(revised.investigationCase.status, 'Investigating');
  assert.equal(revised.investigationCase.pendingReviewReportId, undefined);
  assert.equal(revised.investigationCase.pendingReviewReportVersion, undefined);
  assert.equal(revised.investigationCase.reports.length, 1);
  assert.deepEqual(revised.investigationCase.reports[0], pendingV1.reports[0]);
  assert.equal(revised.event.type, 'REVISION_REQUESTED');
  assert.equal(
    revised.event.reason,
    'Attach building guard log and hourly sub-meter breakdown.',
  );

  // Cannot confirm while back in Investigating even though v1 exists in reports[]
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: revised.investigationCase,
      actor: operator1,
      reportId: 'RPT-V1',
      reportVersion: 1,
      at: '2026-11-15T10:26:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  // Resubmit increments version to 2 while preserving v1
  const pendingV2 = caseMod.submitInvestigationReport({
    investigationCase: revised.investigationCase,
    actor: investigator1,
    reportId: 'RPT-V2',
    summary: 'Updated report with guard shift log and sub-meter chart.',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Confirmed unauthorized chiller operation after closing',
        evidence: 'Guard log #412 + sub-meter M-01 hourly chart showing 48 kWh spike',
      },
    ],
    at: '2026-11-15T10:40:00.000Z',
  }).investigationCase;
  assert.equal(pendingV2.status, 'Pending Review');
  assert.equal(pendingV2.reports.length, 2);
  assert.equal(pendingV2.reports[0].version, 1);
  assert.deepEqual(pendingV2.reports[0], pendingV1.reports[0]);
  assert.equal(pendingV2.reports[1].version, 2);
  assert.equal(pendingV2.reports[1].reportId, 'RPT-V2');
  assert.equal(pendingV2.pendingReviewReportId, 'RPT-V2');
  assert.equal(pendingV2.pendingReviewReportVersion, 2);

  // Stale v1 reportId or reportVersion blocked from confirmation
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingV2,
      actor: operator1,
      reportId: 'RPT-V1',
      reportVersion: 2,
      at: '2026-11-15T10:45:00.000Z',
    }).code,
    'STALE_REPORT_VERSION',
  );
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingV2,
      actor: operator1,
      reportId: 'RPT-V2',
      reportVersion: 1,
      at: '2026-11-15T10:45:00.000Z',
    }).code,
    'STALE_REPORT_VERSION',
  );
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingV2,
      actor: operator1,
      reportId: 'RPT-UNKNOWN',
      reportVersion: 2,
      at: '2026-11-15T10:45:00.000Z',
    }).code,
    'REPORT_NOT_FOUND',
  );
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingV2,
      actor: operator1,
      reportId: 'RPT-V2',
      reportVersion: 99,
      at: '2026-11-15T10:45:00.000Z',
    }).code,
    'REPORT_VERSION_MISMATCH',
  );
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pendingV2,
      actor: operator1,
      reportId: 'RPT-V2',
      reportVersion: 0,
      at: '2026-11-15T10:45:00.000Z',
    }).code,
    'INVALID_REPORT_VERSION',
  );

  // Confirming active v2 succeeds and stores conclusion referencing v2 while retaining v1 & v2
  const confirmedV2 = caseMod.confirmInvestigationCaseReport({
    investigationCase: pendingV2,
    actor: operator1,
    reportId: 'RPT-V2',
    reportVersion: 2,
    at: '2026-11-15T10:50:00.000Z',
  });
  assert.equal(confirmedV2.ok, true);
  assert.equal(confirmedV2.investigationCase.status, 'Closed');
  assert.equal(confirmedV2.investigationCase.reports.length, 2);
  assert.equal(confirmedV2.investigationCase.conclusion.reportId, 'RPT-V2');
  assert.equal(confirmedV2.investigationCase.conclusion.reportVersion, 2);
});

test('10. Validates exact alert coverage and non-empty report fields while preserving distinct per-alert results through close', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-DISTINCT-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1', 'ALT-ELEC-2'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;
  const investigating = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;

  // Blank summary
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: '   ',
      alertResults: [
        { alertId: 'ALT-ELEC-1', resultText: 'R1', evidence: 'E1' },
        { alertId: 'ALT-ELEC-2', resultText: 'R2', evidence: 'E2' },
      ],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'MISSING_REPORT_SUMMARY',
  );

  // Missing alert in report
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: 'Summary',
      alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'R1', evidence: 'E1' }],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'MISSING_REPORT_ALERT',
  );

  // Extra alert in report
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: 'Summary',
      alertResults: [
        { alertId: 'ALT-ELEC-1', resultText: 'R1', evidence: 'E1' },
        { alertId: 'ALT-ELEC-2', resultText: 'R2', evidence: 'E2' },
        { alertId: 'ALT-ELEC-3', resultText: 'R3', evidence: 'E3' },
      ],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'EXTRA_REPORT_ALERT',
  );

  // Duplicate alert in report
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: 'Summary',
      alertResults: [
        { alertId: 'ALT-ELEC-1', resultText: 'R1', evidence: 'E1' },
        { alertId: 'ALT-ELEC-1', resultText: 'R1b', evidence: 'E1b' },
      ],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'DUPLICATE_REPORT_ALERT',
  );

  // Blank resultText and blank evidence
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: 'Summary',
      alertResults: [
        { alertId: 'ALT-ELEC-1', resultText: '  ', evidence: 'E1' },
        { alertId: 'ALT-ELEC-2', resultText: 'R2', evidence: 'E2' },
      ],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'MISSING_ALERT_RESULT',
  );
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: investigating,
      actor: investigator1,
      summary: 'Summary',
      alertResults: [
        { alertId: 'ALT-ELEC-1', resultText: 'R1', evidence: 'E1' },
        { alertId: 'ALT-ELEC-2', resultText: 'R2', evidence: '\t\n' },
      ],
      at: '2026-11-15T10:15:00.000Z',
    }).code,
    'MISSING_ALERT_EVIDENCE',
  );

  // Submit two alerts in reverse order with completely distinct results & evidence
  const pending = caseMod.submitInvestigationReport({
    investigationCase: investigating,
    actor: investigator1,
    reportId: 'RPT-DISTINCT-1',
    summary: 'One confirmed unauthorized draw and one authorized maintenance event.',
    alertResults: [
      {
        alertId: 'ALT-ELEC-2',
        resultText: 'Authorized scheduled lab maintenance',
        evidence: 'Signed work order WO-2026-44 for 01:00-02:00 transformer check',
      },
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Unauthorized after-hours equipment operation',
        evidence: 'Meter M-BLDG-1 spike 48.2 kWh with empty room access log',
      },
    ],
    at: '2026-11-15T10:20:00.000Z',
  }).investigationCase;

  // Blank explicit finalSummary rejected
  assert.equal(
    caseMod.confirmInvestigationCaseReport({
      investigationCase: pending,
      actor: operator1,
      reportId: pending.pendingReviewReportId,
      reportVersion: pending.pendingReviewReportVersion,
      finalSummary: '   ',
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'MISSING_CONCLUSION_SUMMARY',
  );

  // Confirm with overall summary; verify per-alert distinct results are NOT collapsed into one result
  const closed = caseMod.confirmInvestigationCaseReport({
    investigationCase: pending,
    actor: operator1,
    reportId: pending.pendingReviewReportId,
    reportVersion: pending.pendingReviewReportVersion,
    finalSummary: 'Case closed with mixed per-alert outcomes for facility action.',
    at: '2026-11-15T10:30:00.000Z',
  }).investigationCase;

  assert.equal(closed.conclusion.summary, 'Case closed with mixed per-alert outcomes for facility action.');
  assert.deepEqual(
    closed.reports[0].alertResults.map(r => ({
      alertId: r.alertId,
      resultText: r.resultText,
      evidence: r.evidence,
    })),
    [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Unauthorized after-hours equipment operation',
        evidence: 'Meter M-BLDG-1 spike 48.2 kWh with empty room access log',
      },
      {
        alertId: 'ALT-ELEC-2',
        resultText: 'Authorized scheduled lab maintenance',
        evidence: 'Signed work order WO-2026-44 for 01:00-02:00 transformer check',
      },
    ],
  );
  assert.deepEqual(closed.conclusion.alertResults, closed.reports[0].alertResults);

  // Confirmed view for SME Admin preserves both distinct per-alert results intact
  const adminRead = caseMod.readConfirmedInvestigationReport({
    investigationCase: closed,
    actor: smeAdmin,
  });
  assert.equal(adminRead.ok, true);
  assert.equal(adminRead.view.conclusion.alertResults[0].resultText, 'Unauthorized after-hours equipment operation');
  assert.equal(adminRead.view.conclusion.alertResults[1].resultText, 'Authorized scheduled lab maintenance');
});

test('11. Pre-expiry cases continue assign/investigate, submit, revision, resubmit, confirm, close, and read after expiresAt while new cases fail', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const expiresAt = enterprise.lifecycle.subscription.expiresAt; // 2026-12-15T08:00:00.000Z
  assert.equal(expiresAt, '2026-12-15T08:00:00.000Z');

  // Open two valid cases before expiresAt
  const preExpiryInvCase = caseMod.createInvestigationCase({
    caseId: 'CASE-PRE-EXP-INV',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-12-15T07:59:00.000Z',
  }).investigationCase;

  const preExpirySelfCase = caseMod.createInvestigationCase({
    caseId: 'CASE-PRE-EXP-SELF',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [preExpiryInvCase],
    enterprises,
    projects,
    at: '2026-12-15T07:59:30.000Z',
  }).investigationCase;

  // At exact expiresAt, creating a NEW case fails
  const newCaseAtExpiry = caseMod.createInvestigationCase({
    caseId: 'CASE-NEW-AT-EXPIRY',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts,
    existingCases: [preExpiryInvCase, preExpirySelfCase],
    enterprises,
    projects,
    at: expiresAt,
  });
  assert.equal(newCaseAtExpiry.ok, false);
  assert.equal(newCaseAtExpiry.code, 'SUBSCRIPTION_EXPIRED');

  // Existing pre-expiry case continues full lifecycle at and well after expiresAt
  const assignedAfter = caseMod.assignInvestigatorToCase({
    investigationCase: preExpiryInvCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: expiresAt,
  });
  assert.equal(assignedAfter.ok, true);

  const v1After = caseMod.submitInvestigationReport({
    investigationCase: assignedAfter.investigationCase,
    actor: investigator1,
    summary: 'Post-expiry initial report',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Abnormal draw', evidence: 'Meter log v1' }],
    at: '2026-12-20T10:00:00.000Z',
  });
  assert.equal(v1After.ok, true);

  const revAfter = caseMod.requestInvestigationCaseRevision({
    investigationCase: v1After.investigationCase,
    actor: operator1,
    reason: 'Add circuit breaker log',
    at: '2026-12-21T10:00:00.000Z',
  });
  assert.equal(revAfter.ok, true);

  const v2After = caseMod.submitInvestigationReport({
    investigationCase: revAfter.investigationCase,
    actor: investigator1,
    summary: 'Post-expiry revised report',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Confirmed compressor fault',
        evidence: 'Meter log + breaker trip log',
      },
    ],
    at: '2026-12-22T10:00:00.000Z',
  });
  assert.equal(v2After.ok, true);

  const closedAfter = caseMod.confirmInvestigationCaseReport({
    investigationCase: v2After.investigationCase,
    actor: operator1,
    reportId: v2After.investigationCase.pendingReviewReportId,
    reportVersion: v2After.investigationCase.pendingReviewReportVersion,
    at: '2026-12-23T10:00:00.000Z',
  });
  assert.equal(closedAfter.ok, true);
  assert.equal(closedAfter.investigationCase.status, 'Closed');

  // Self-assign pre-expiry case also completes after expiry
  const selfAfter = caseMod.selfAssignInvestigationCase({
    investigationCase: preExpirySelfCase,
    actor: operator1,
    at: '2026-12-20T09:00:00.000Z',
  });
  assert.equal(selfAfter.ok, true);
  const selfSubAfter = caseMod.submitInvestigationReport({
    investigationCase: selfAfter.investigationCase,
    actor: operator1,
    summary: 'Self investigation completed after expiry',
    alertResults: [{ alertId: 'ALT-ELEC-2', resultText: 'Normal maintenance', evidence: 'Ticket #9' }],
    at: '2026-12-20T09:30:00.000Z',
  });
  assert.equal(selfSubAfter.ok, true);
  const selfClosedAfter = caseMod.confirmInvestigationCaseReport({
    investigationCase: selfSubAfter.investigationCase,
    actor: operator1,
    reportId: selfSubAfter.investigationCase.pendingReviewReportId,
    reportVersion: selfSubAfter.investigationCase.pendingReviewReportVersion,
    at: '2026-12-20T09:45:00.000Z',
  });
  assert.equal(selfClosedAfter.ok, true);

  // Reads work after expiry according to role/tenant/assignee
  assert.equal(
    caseMod.readInternalInvestigationCase({
      investigationCase: closedAfter.investigationCase,
      actor: investigator1,
    }).ok,
    true,
  );
  assert.equal(
    caseMod.readConfirmedInvestigationReport({
      investigationCase: closedAfter.investigationCase,
      actor: smeAdmin,
    }).ok,
    true,
  );
});

test('12. Enforces strict read authorization across Open, Investigating, Pending Review, and Closed states', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-READ-AUTH',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;

  const investigatingCase = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;

  const pendingCase = caseMod.submitInvestigationReport({
    investigationCase: investigatingCase,
    actor: investigator1,
    summary: 'Pending review report',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Suspicious draw', evidence: 'Meter log' }],
    at: '2026-11-15T10:15:00.000Z',
  }).investigationCase;

  const closedCase = caseMod.confirmInvestigationCaseReport({
    investigationCase: pendingCase,
    actor: operator1,
    reportId: pendingCase.pendingReviewReportId,
    reportVersion: pendingCase.pendingReviewReportVersion,
    at: '2026-11-15T10:30:00.000Z',
  }).investigationCase;

  // Before Closed: Operator & assigned Investigator can read internal, NOT confirmed; SME Admin blocked from both
  for (const activeCase of [openCase, investigatingCase, pendingCase]) {
    assert.equal(
      caseMod.readInternalInvestigationCase({ investigationCase: activeCase, actor: operator1 }).ok,
      true,
    );
    assert.equal(
      caseMod.readConfirmedInvestigationReport({ investigationCase: activeCase, actor: operator1 }).code,
      'REPORT_NOT_CONFIRMED',
    );
    assert.equal(
      caseMod.readInternalInvestigationCase({ investigationCase: activeCase, actor: smeAdmin }).code,
      'FORBIDDEN_ROLE',
    );
    assert.equal(
      caseMod.readConfirmedInvestigationReport({ investigationCase: activeCase, actor: smeAdmin }).code,
      'REPORT_NOT_CONFIRMED',
    );
  }

  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: openCase, actor: investigator1 }).code,
    'FORBIDDEN_ASSIGNEE',
  );
  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: investigatingCase, actor: investigator1 }).ok,
    true,
  );
  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: pendingCase, actor: investigator1 }).ok,
    true,
  );

  // Closed: assigned Investigator & same-tenant Operator can read internal + confirmed;
  // SME Admin can read confirmed report ONLY (never internal case)
  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: closedCase, actor: investigator1 }).ok,
    true,
  );
  assert.equal(
    caseMod.readConfirmedInvestigationReport({ investigationCase: closedCase, actor: investigator1 }).ok,
    true,
  );
  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: closedCase, actor: operator1 }).ok,
    true,
  );
  assert.equal(
    caseMod.readConfirmedInvestigationReport({ investigationCase: closedCase, actor: operator1 }).ok,
    true,
  );

  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: closedCase, actor: smeAdmin }).code,
    'FORBIDDEN_ROLE',
  );
  const smeRead = caseMod.readConfirmedInvestigationReport({
    investigationCase: closedCase,
    actor: smeAdmin,
  });
  assert.equal(smeRead.ok, true);
  assert.equal(smeRead.view.caseId, 'CASE-READ-AUTH');
  assert.equal(smeRead.view.status, 'Closed');
  assert.equal(smeRead.view.confirmedReport.version, 1);
  assert.equal('history' in smeRead.view, false);

  // Unassigned Investigator (even same display name) denied both
  for (const targetCase of [investigatingCase, pendingCase, closedCase]) {
    assert.equal(
      caseMod.readInternalInvestigationCase({
        investigationCase: targetCase,
        actor: investigatorDuplicateName,
      }).code,
      'FORBIDDEN_ASSIGNEE',
    );
    assert.equal(
      caseMod.readConfirmedInvestigationReport({
        investigationCase: targetCase,
        actor: investigatorDuplicateName,
      }).code,
      'FORBIDDEN_ASSIGNEE',
    );
  }

  // Cross-tenant roles denied both
  for (const crossActor of [otherOperator, otherInvestigator, otherSmeAdmin]) {
    for (const targetCase of [openCase, pendingCase, closedCase]) {
      assert.equal(
        caseMod.readInternalInvestigationCase({ investigationCase: targetCase, actor: crossActor }).code,
        'FORBIDDEN_TENANT',
      );
      assert.equal(
        caseMod.readConfirmedInvestigationReport({ investigationCase: targetCase, actor: crossActor }).code,
        'FORBIDDEN_TENANT',
      );
    }
  }

  // Platform Admin (even with enterpriseId set), Implementation Staff (even assigned to enterprise), and Viewer have NO default access
  const paWithTenant = { ...platformAdmin, enterpriseId: 'ent-school-1' };
  const staffWithTenant = { ...implStaff, enterpriseId: 'ent-school-1' };
  for (const deniedActor of [platformAdmin, paWithTenant, implStaff, staffWithTenant, viewer1]) {
    for (const targetCase of [openCase, investigatingCase, pendingCase, closedCase]) {
      const access = caseMod.evaluateInvestigationCaseReadAccess(targetCase, deniedActor);
      assert.equal(access.canViewInternalCase, false);
      assert.equal(access.canViewConfirmedReport, false);
      assert.equal(access.reasonCode, 'FORBIDDEN_ROLE');
      assert.equal(
        caseMod.readInternalInvestigationCase({ investigationCase: targetCase, actor: deniedActor }).code,
        'FORBIDDEN_ROLE',
      );
      assert.equal(
        caseMod.readConfirmedInvestigationReport({ investigationCase: targetCase, actor: deniedActor }).code,
        'FORBIDDEN_ROLE',
      );
    }
  }
});

test('13. Proves zero input mutation on deep-frozen inputs and isolates stored snapshots/history from post-call mutations', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();

  // Part A: Deep-frozen inputs through the entire workflow
  const frozenEnterprise = deepFreeze(structuredClone(enterprise));
  const frozenEnterprises = deepFreeze(structuredClone(enterprises));
  const frozenProjects = deepFreeze(structuredClone(projects));
  const frozenAlerts = deepFreeze(structuredClone(alerts));
  const frozenAlertIds = deepFreeze(['ALT-ELEC-1', 'ALT-ELEC-2']);
  const frozenOp = deepFreeze(structuredClone(operator1));
  const frozenInv = deepFreeze(structuredClone(investigator1));
  const frozenSme = deepFreeze(structuredClone(smeAdmin));
  const frozenUsers = deepFreeze(structuredClone(directoryUsers));
  const frozenExisting = deepFreeze([]);

  const cRes = caseMod.createInvestigationCase({
    caseId: 'CASE-FROZEN-01',
    enterprise: frozenEnterprise,
    actor: frozenOp,
    alertIds: frozenAlertIds,
    alerts: frozenAlerts,
    existingCases: frozenExisting,
    enterprises: frozenEnterprises,
    projects: frozenProjects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(cRes.ok, true);
  assert.equal(Object.isFrozen(cRes.investigationCase), true);
  assert.equal(Object.isFrozen(cRes.investigationCase.alerts), true);
  assert.equal(Object.isFrozen(cRes.investigationCase.history), true);

  const aRes = caseMod.assignInvestigatorToCase({
    investigationCase: cRes.investigationCase,
    actor: frozenOp,
    assigneeId: frozenInv.id,
    users: frozenUsers,
    at: '2026-11-15T10:05:00.000Z',
  });
  assert.equal(aRes.ok, true);

  const frozenResults = deepFreeze([
    { alertId: 'ALT-ELEC-1', resultText: 'Confirmed spike', evidence: 'Meter M-01' },
    { alertId: 'ALT-ELEC-2', resultText: 'Authorized test', evidence: 'Ticket T-1' },
  ]);
  const s1Res = caseMod.submitInvestigationReport({
    investigationCase: aRes.investigationCase,
    actor: frozenInv,
    summary: 'Frozen v1 summary',
    alertResults: frozenResults,
    at: '2026-11-15T10:15:00.000Z',
  });
  assert.equal(s1Res.ok, true);

  const rRes = caseMod.requestInvestigationCaseRevision({
    investigationCase: s1Res.investigationCase,
    actor: frozenOp,
    reason: 'Clarify meter reading',
    at: '2026-11-15T10:20:00.000Z',
  });
  assert.equal(rRes.ok, true);

  const s2Res = caseMod.submitInvestigationReport({
    investigationCase: rRes.investigationCase,
    actor: frozenInv,
    summary: 'Frozen v2 summary',
    alertResults: frozenResults,
    at: '2026-11-15T10:30:00.000Z',
  });
  assert.equal(s2Res.ok, true);

  const kRes = caseMod.confirmInvestigationCaseReport({
    investigationCase: s2Res.investigationCase,
    actor: frozenOp,
    reportId: s2Res.investigationCase.pendingReviewReportId,
    reportVersion: s2Res.investigationCase.pendingReviewReportVersion,
    at: '2026-11-15T10:40:00.000Z',
  });
  assert.equal(kRes.ok, true);

  assert.equal(
    caseMod.readInternalInvestigationCase({ investigationCase: kRes.investigationCase, actor: frozenOp }).ok,
    true,
  );
  assert.equal(
    caseMod.readConfirmedInvestigationReport({ investigationCase: kRes.investigationCase, actor: frozenSme }).ok,
    true,
  );

  // Part B: Mutate caller objects AFTER successful commands -> stored snapshots & history stay intact
  const mutEnterprise = structuredClone(enterprise);
  const mutAlerts = structuredClone(alerts);
  const mutAlertIds = ['ALT-ELEC-1'];
  const mutOp = structuredClone(operator1);
  const mutReportResults = [
    { alertId: 'ALT-ELEC-1', resultText: 'Original result', evidence: 'Original evidence' },
  ];

  const mutCreate = caseMod.createInvestigationCase({
    caseId: 'CASE-ISOLATION-01',
    enterprise: mutEnterprise,
    actor: mutOp,
    alertIds: mutAlertIds,
    alerts: mutAlerts,
    existingCases: [],
    at: '2026-11-15T10:00:00.000Z',
    note: 'Original note',
  });
  assert.equal(mutCreate.ok, true);

  mutEnterprise.lifecycle.status = 'SettingUp';
  mutEnterprise.lifecycle.subscription.expiresAt = '2000-01-01T00:00:00.000Z';
  mutAlerts[0].explanation = 'TAMPERED_EXPLANATION';
  mutAlerts[0].alertId = 'ALT-TAMPERED';
  mutAlertIds.push('ALT-INJECTED');
  mutOp.name = 'TAMPERED_OPERATOR';

  assert.equal(mutCreate.investigationCase.creationEligibility.operatingStatus, 'Operating');
  assert.equal(
    mutCreate.investigationCase.creationEligibility.subscriptionExpiresAt,
    '2026-12-15T08:00:00.000Z',
  );
  assert.equal(
    mutCreate.investigationCase.alerts[0].explanation,
    'AI detected abnormal after-hours electricity draw compared to building baseline.',
  );
  assert.deepEqual(mutCreate.investigationCase.alertIds, ['ALT-ELEC-1']);
  assert.equal(mutCreate.investigationCase.createdBy.name, 'Dang Tuan Kiet');

  const mutSelf = caseMod.selfAssignInvestigationCase({
    investigationCase: mutCreate.investigationCase,
    actor: operator1,
    at: '2026-11-15T10:05:00.000Z',
  });
  assert.equal(mutSelf.ok, true);

  const mutSubmit = caseMod.submitInvestigationReport({
    investigationCase: mutSelf.investigationCase,
    actor: operator1,
    summary: 'Original report summary',
    alertResults: mutReportResults,
    at: '2026-11-15T10:15:00.000Z',
  });
  assert.equal(mutSubmit.ok, true);

  mutReportResults[0].resultText = 'MUTATED_AFTER_SUBMIT';
  mutReportResults[0].evidence = 'MUTATED_EVIDENCE';
  mutReportResults.push({ alertId: 'ALT-EXTRA', resultText: 'X', evidence: 'Y' });

  assert.equal(mutSubmit.investigationCase.reports[0].alertResults.length, 1);
  assert.equal(mutSubmit.investigationCase.reports[0].alertResults[0].resultText, 'Original result');
  assert.equal(mutSubmit.investigationCase.reports[0].alertResults[0].evidence, 'Original evidence');

  // Returned frozen structures reject direct mutation attempts in strict mode
  assert.throws(() => {
    mutSubmit.investigationCase.reports[0].summary = 'MUTATED';
  }, TypeError);
  assert.throws(() => {
    mutSubmit.investigationCase.history.push({ eventId: 'fake' });
  }, TypeError);
});

test('14. Closed cases reject further writes and repeat confirmation without extra events, and closing creates no feedback', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-CLOSED-LOCK',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;
  const selfCase = caseMod.selfAssignInvestigationCase({
    investigationCase: openCase,
    actor: operator1,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;
  const pendingCase = caseMod.submitInvestigationReport({
    investigationCase: selfCase,
    actor: operator1,
    summary: 'Verified unauthorized after-hours usage',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Confirmed anomaly', evidence: 'Meter M-01' }],
    at: '2026-11-15T10:10:00.000Z',
  }).investigationCase;

  const confirmRes = caseMod.confirmInvestigationCaseReport({
    investigationCase: pendingCase,
    actor: operator1,
    reportId: pendingCase.pendingReviewReportId,
    reportVersion: pendingCase.pendingReviewReportVersion,
    at: '2026-11-15T10:20:00.000Z',
  });
  assert.equal(confirmRes.ok, true);
  const closedCase = confirmRes.investigationCase;
  const historyBefore = structuredClone(closedCase.history);
  const conclusionBefore = structuredClone(closedCase.conclusion);

  // Closing does NOT create or send feedback
  assert.deepEqual(Object.keys(confirmRes).sort(), ['event', 'investigationCase', 'ok']);
  assert.equal('feedback' in confirmRes, false);
  assert.equal('feedback' in closedCase, false);
  assert.equal('feedbackSent' in closedCase, false);
  assert.equal('feedbackId' in closedCase, false);
  assert.equal(
    closedCase.history.some(e => String(e.type).toUpperCase().includes('FEEDBACK')),
    false,
  );

  // All further writes and repeat confirmation rejected cleanly with CASE_ALREADY_CLOSED
  assert.equal(
    caseMod.assignInvestigatorToCase({
      investigationCase: closedCase,
      actor: operator1,
      assigneeId: investigator1.id,
      users: directoryUsers,
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'CASE_ALREADY_CLOSED',
  );
  assert.equal(
    caseMod.selfAssignInvestigationCase({
      investigationCase: closedCase,
      actor: operator1,
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'CASE_ALREADY_CLOSED',
  );
  assert.equal(
    caseMod.submitInvestigationReport({
      investigationCase: closedCase,
      actor: operator1,
      summary: 'Post-close overwrite attempt',
      alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'New', evidence: 'New' }],
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'CASE_ALREADY_CLOSED',
  );
  assert.equal(
    caseMod.requestInvestigationCaseRevision({
      investigationCase: closedCase,
      actor: operator1,
      reason: 'Reopen attempt via revision',
      at: '2026-11-15T10:25:00.000Z',
    }).code,
    'CASE_ALREADY_CLOSED',
  );

  const repeatConfirm = caseMod.confirmInvestigationCaseReport({
    investigationCase: closedCase,
    actor: operator1,
    reportId: closedCase.conclusion.reportId,
    reportVersion: closedCase.conclusion.reportVersion,
    at: '2026-11-15T10:30:00.000Z',
  });
  assert.equal(repeatConfirm.ok, false);
  assert.equal(repeatConfirm.code, 'CASE_ALREADY_CLOSED');
  assert.equal('event' in repeatConfirm, false);
  assert.deepEqual(closedCase.history, historyBefore);
  assert.deepEqual(closedCase.conclusion, conclusionBefore);
});

function assertTypedError(res) {
  assert.equal(res.ok, false);
  assert.equal(typeof res.code, 'string');
  assert.ok(res.code.length > 0);
  assert.equal(typeof res.error, 'string');
  assert.ok(res.error.trim().length > 0);
  assert.equal('investigationCase' in res, false);
  assert.equal('event' in res, false);
}

test('15. Regression Step 1: createInvestigationCase requires existingCases explicitly and blocks duplicate alert/case links', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const alertsBefore = structuredClone(alerts);

  // (a) Omitting existingCases, or passing undefined / null / non-array object fails cleanly
  const omittedRes = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-OMIT',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assertTypedError(omittedRes);
  assert.equal(omittedRes.code, 'MISSING_EXISTING_CASES');

  for (const [invalidExisting, expectedCode] of [
    [undefined, 'MISSING_EXISTING_CASES'],
    [null, 'MISSING_EXISTING_CASES'],
    [{}, 'INVALID_CASE'],
  ]) {
    const res = caseMod.createInvestigationCase({
      caseId: 'CASE-REG1-INVALID-EXISTING',
      enterprise,
      actor: operator1,
      alertIds: ['ALT-ELEC-1'],
      alerts,
      existingCases: invalidExisting,
      enterprises,
      projects,
      at: '2026-11-15T10:00:00.000Z',
    });
    assertTypedError(res);
    assert.equal(res.code, expectedCode);
  }
  assert.deepEqual(alerts, alertsBefore);

  // (b) Explicit empty array [] succeeds for first creation
  const firstRes = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-FIRST',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(firstRes.ok, true);
  const firstOpen = firstRes.investigationCase;

  // (c) Creating a second case on the same alert when first Open case is passed is blocked
  const dupOnOpen = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-DUP-OPEN',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [firstOpen],
    enterprises,
    projects,
    at: '2026-11-15T10:05:00.000Z',
  });
  assertTypedError(dupOnOpen);
  assert.equal(dupOnOpen.code, 'ALERT_ALREADY_LINKED');

  // Transition first case to Closed and verify duplicate alert creation is still blocked
  const selfAssigned = caseMod.selfAssignInvestigationCase({
    investigationCase: firstOpen,
    actor: operator1,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;
  const submitted = caseMod.submitInvestigationReport({
    investigationCase: selfAssigned,
    actor: operator1,
    reportId: 'RPT-REG1-1',
    summary: 'Confirmed after-hours electricity draw',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Confirmed anomaly', evidence: 'Meter M-01' }],
    at: '2026-11-15T10:10:00.000Z',
  }).investigationCase;
  const firstClosed = caseMod.confirmInvestigationCaseReport({
    investigationCase: submitted,
    actor: operator1,
    reportId: submitted.pendingReviewReportId,
    reportVersion: submitted.pendingReviewReportVersion,
    at: '2026-11-15T10:15:00.000Z',
  }).investigationCase;
  assert.equal(firstClosed.status, 'Closed');

  const dupOnClosed = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-DUP-CLOSED',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [firstClosed],
    enterprises,
    projects,
    at: '2026-11-15T10:20:00.000Z',
  });
  assertTypedError(dupOnClosed);
  assert.equal(dupOnClosed.code, 'ALERT_ALREADY_LINKED');

  // (d) Duplicate caseId blocked; different alert with unique caseId succeeds
  const dupCaseIdRes = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-FIRST',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [firstClosed],
    enterprises,
    projects,
    at: '2026-11-15T10:20:00.000Z',
  });
  assertTypedError(dupCaseIdRes);
  assert.equal(dupCaseIdRes.code, 'DUPLICATE_CASE_ID');

  const secondValidRes = caseMod.createInvestigationCase({
    caseId: 'CASE-REG1-SECOND',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [firstClosed],
    enterprises,
    projects,
    at: '2026-11-15T10:20:00.000Z',
  });
  assert.equal(secondValidRes.ok, true);
  assert.deepEqual(secondValidRes.investigationCase.alertIds, ['ALT-ELEC-2']);
});

test('16. Regression Step 2: confirmInvestigationCaseReport requires explicit reportId and reportVersion bound to active Pending Review report', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const openCase = caseMod.createInvestigationCase({
    caseId: 'CASE-REG2-01',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1', 'ALT-ELEC-2'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;
  const investigatingCase = caseMod.assignInvestigatorToCase({
    investigationCase: openCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:05:00.000Z',
  }).investigationCase;

  const pendingV1 = caseMod.submitInvestigationReport({
    investigationCase: investigatingCase,
    actor: investigator1,
    reportId: 'RPT-REG2-V1',
    summary: 'Initial draft findings',
    alertResults: [
      { alertId: 'ALT-ELEC-1', resultText: 'Initial anomaly', evidence: 'Log 1' },
      { alertId: 'ALT-ELEC-2', resultText: 'Initial normal', evidence: 'Log 2' },
    ],
    at: '2026-11-15T10:15:00.000Z',
  }).investigationCase;
  const pendingV1Snapshot = structuredClone(pendingV1);

  // (a) Missing both, missing either, blank reportId, or invalid reportVersion all fail without changing state/history
  const invalidCases = [
    [
      { investigationCase: pendingV1, actor: operator1, at: '2026-11-15T10:20:00.000Z' },
      'MISSING_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportVersion: 1,
        at: '2026-11-15T10:20:00.000Z',
      },
      'MISSING_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: 'RPT-REG2-V1',
        at: '2026-11-15T10:20:00.000Z',
      },
      'MISSING_REPORT_VERSION',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: undefined,
        reportVersion: 1,
        at: '2026-11-15T10:20:00.000Z',
      },
      'MISSING_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: null,
        reportVersion: 1,
        at: '2026-11-15T10:20:00.000Z',
      },
      'MISSING_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: '',
        reportVersion: 1,
        at: '2026-11-15T10:20:00.000Z',
      },
      'INVALID_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: '   ',
        reportVersion: 1,
        at: '2026-11-15T10:20:00.000Z',
      },
      'INVALID_REPORT_ID',
    ],
  ];
  for (const [badVersion, expectedCode] of [
    [undefined, 'MISSING_REPORT_VERSION'],
    [null, 'MISSING_REPORT_VERSION'],
    [0, 'INVALID_REPORT_VERSION'],
    [-1, 'INVALID_REPORT_VERSION'],
    [1.5, 'INVALID_REPORT_VERSION'],
    [Number.NaN, 'INVALID_REPORT_VERSION'],
    ['1', 'INVALID_REPORT_VERSION'],
    [{}, 'INVALID_REPORT_VERSION'],
  ]) {
    invalidCases.push([
      {
        investigationCase: pendingV1,
        actor: operator1,
        reportId: 'RPT-REG2-V1',
        reportVersion: badVersion,
        at: '2026-11-15T10:20:00.000Z',
      },
      expectedCode,
    ]);
  }
  for (const [payload, expectedCode] of invalidCases) {
    const res = caseMod.confirmInvestigationCaseReport(payload);
    assertTypedError(res);
    assert.equal(res.code, expectedCode);
  }
  assert.deepEqual(pendingV1, pendingV1Snapshot);

  // (b) Submit v1 -> revision -> submit v2; confirming with v1 fails
  const revised = caseMod.requestInvestigationCaseRevision({
    investigationCase: pendingV1,
    actor: operator1,
    reason: 'Provide detailed HVAC and IT logs',
    at: '2026-11-15T10:25:00.000Z',
  }).investigationCase;
  const pendingV2 = caseMod.submitInvestigationReport({
    investigationCase: revised,
    actor: investigator1,
    reportId: 'RPT-REG2-V2',
    summary: 'Complete findings with distinct per-alert outcomes',
    alertResults: [
      {
        alertId: 'ALT-ELEC-1',
        resultText: 'Confirmed unauthorized after-hours chiller usage',
        evidence: 'HVAC log + sub-meter M-01 48.2 kWh',
      },
      {
        alertId: 'ALT-ELEC-2',
        resultText: 'Authorized scheduled generator test',
        evidence: 'Facility maintenance ticket #88',
      },
    ],
    at: '2026-11-15T10:35:00.000Z',
  }).investigationCase;
  const pendingV2Snapshot = structuredClone(pendingV2);

  const staleV1Confirm = caseMod.confirmInvestigationCaseReport({
    investigationCase: pendingV2,
    actor: operator1,
    reportId: 'RPT-REG2-V1',
    reportVersion: 1,
    at: '2026-11-15T10:40:00.000Z',
  });
  assertTypedError(staleV1Confirm);
  assert.equal(staleV1Confirm.code, 'STALE_REPORT_VERSION');

  // (c) Crossed pairs (v1 id + v2 version), (v2 id + v1 version), missing reportId, unknown id all fail
  const crossedCases = [
    [
      {
        investigationCase: pendingV2,
        actor: operator1,
        reportId: 'RPT-REG2-V1',
        reportVersion: 2,
        at: '2026-11-15T10:40:00.000Z',
      },
      'STALE_REPORT_VERSION',
    ],
    [
      {
        investigationCase: pendingV2,
        actor: operator1,
        reportId: 'RPT-REG2-V2',
        reportVersion: 1,
        at: '2026-11-15T10:40:00.000Z',
      },
      'STALE_REPORT_VERSION',
    ],
    [
      {
        investigationCase: pendingV2,
        actor: operator1,
        reportVersion: 2,
        at: '2026-11-15T10:40:00.000Z',
      },
      'MISSING_REPORT_ID',
    ],
    [
      {
        investigationCase: pendingV2,
        actor: operator1,
        reportId: 'RPT-REG2-UNKNOWN',
        reportVersion: 2,
        at: '2026-11-15T10:40:00.000Z',
      },
      'REPORT_NOT_FOUND',
    ],
  ];
  for (const [payload, expectedCode] of crossedCases) {
    const res = caseMod.confirmInvestigationCaseReport(payload);
    assertTypedError(res);
    assert.equal(res.code, expectedCode);
  }
  assert.deepEqual(pendingV2, pendingV2Snapshot);

  // (d) Exact v2 pair closes cleanly with conclusion referencing v2 & distinct per-alert results intact
  const confirmV2 = caseMod.confirmInvestigationCaseReport({
    investigationCase: pendingV2,
    actor: operator1,
    reportId: 'RPT-REG2-V2',
    reportVersion: 2,
    at: '2026-11-15T10:45:00.000Z',
  });
  assert.equal(confirmV2.ok, true);
  assert.equal(confirmV2.investigationCase.status, 'Closed');
  assert.equal(confirmV2.investigationCase.conclusion.reportId, 'RPT-REG2-V2');
  assert.equal(confirmV2.investigationCase.conclusion.reportVersion, 2);
  assert.deepEqual(
    confirmV2.investigationCase.conclusion.alertResults.map(r => ({
      alertId: r.alertId,
      resultText: r.resultText,
    })),
    [
      { alertId: 'ALT-ELEC-1', resultText: 'Confirmed unauthorized after-hours chiller usage' },
      { alertId: 'ALT-ELEC-2', resultText: 'Authorized scheduled generator test' },
    ],
  );

  // (e) Same Operator self-assign -> submit -> confirm with displayed (reportId, reportVersion) works as two separate steps
  const openSelf = caseMod.createInvestigationCase({
    caseId: 'CASE-REG2-SELF',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts,
    existingCases: [confirmV2.investigationCase],
    enterprises,
    projects,
    at: '2026-11-15T11:00:00.000Z',
  }).investigationCase;
  const selfInvestigating = caseMod.selfAssignInvestigationCase({
    investigationCase: openSelf,
    actor: operator1,
    at: '2026-11-15T11:05:00.000Z',
  }).investigationCase;
  const selfPending = caseMod.submitInvestigationReport({
    investigationCase: selfInvestigating,
    actor: operator1,
    summary: 'Self-investigated electricity anomaly',
    alertResults: [{ alertId: 'ALT-ELEC-3', resultText: 'Confirmed equipment fault', evidence: 'Log' }],
    at: '2026-11-15T11:10:00.000Z',
  }).investigationCase;
  const selfClosed = caseMod.confirmInvestigationCaseReport({
    investigationCase: selfPending,
    actor: operator1,
    reportId: selfPending.pendingReviewReportId,
    reportVersion: selfPending.pendingReviewReportVersion,
    at: '2026-11-15T11:15:00.000Z',
  });
  assert.equal(selfClosed.ok, true);
  assert.equal(selfClosed.investigationCase.status, 'Closed');
  assert.deepEqual(
    selfClosed.investigationCase.history.map(e => e.type),
    [
      'CASE_CREATED',
      'OPERATOR_SELF_ASSIGNED',
      'REPORT_SUBMITTED',
      'REPORT_CONFIRMED_AND_CLOSED',
    ],
  );
});

test('17. Regression Step 3: post-create commands enforce monotonic UTC ms timeline and reject corrupted case timestamps', () => {
  const { enterprise, enterprises, projects, alerts } = createStandardCaseSetup();
  const baseOpen = caseMod.createInvestigationCase({
    caseId: 'CASE-REG3-TIME',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-1'],
    alerts,
    existingCases: [],
    enterprises,
    projects,
    at: '2026-11-15T10:00:00.000Z',
  }).investigationCase;
  const baseOpenSnapshot = structuredClone(baseOpen);

  // (a) & (b) Earlier timestamps fail on all 5 post-create commands without modifying state/history
  const badAssign = caseMod.assignInvestigatorToCase({
    investigationCase: baseOpen,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T09:59:59.999Z',
  });
  assertTypedError(badAssign);
  assert.equal(badAssign.code, 'TIMESTAMP_OUT_OF_ORDER');

  const badSelfAssign = caseMod.selfAssignInvestigationCase({
    investigationCase: baseOpen,
    actor: operator1,
    at: '2026-11-15T09:59:59.999Z',
  });
  assertTypedError(badSelfAssign);
  assert.equal(badSelfAssign.code, 'TIMESTAMP_OUT_OF_ORDER');
  assert.deepEqual(baseOpen, baseOpenSnapshot);

  const assignedAt1010 = caseMod.assignInvestigatorToCase({
    investigationCase: baseOpen,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: '2026-11-15T10:10:00.000Z',
  }).investigationCase;
  const assignedSnapshot = structuredClone(assignedAt1010);

  // Submit before assign fails
  const badSubmit = caseMod.submitInvestigationReport({
    investigationCase: assignedAt1010,
    actor: investigator1,
    summary: 'Backdated submit',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Abnormal', evidence: 'Meter' }],
    at: '2026-11-15T10:09:59.999Z',
  });
  assertTypedError(badSubmit);
  assert.equal(badSubmit.code, 'TIMESTAMP_OUT_OF_ORDER');
  assert.deepEqual(assignedAt1010, assignedSnapshot);

  const submittedAt1020 = caseMod.submitInvestigationReport({
    investigationCase: assignedAt1010,
    actor: investigator1,
    reportId: 'RPT-REG3-1',
    summary: 'Timely submit',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Abnormal', evidence: 'Meter' }],
    at: '2026-11-15T10:20:00.000Z',
  }).investigationCase;
  const submittedSnapshot = structuredClone(submittedAt1020);

  // Revision request before submit fails
  const badRevision = caseMod.requestInvestigationCaseRevision({
    investigationCase: submittedAt1020,
    actor: operator1,
    reason: 'Backdated revision',
    at: '2026-11-15T10:19:59.999Z',
  });
  assertTypedError(badRevision);
  assert.equal(badRevision.code, 'TIMESTAMP_OUT_OF_ORDER');

  // Close before submit / before create fails (10:19:59.999Z and 09:00:00Z < 10:00:00Z)
  for (const earlierTs of ['2026-11-15T10:19:59.999Z', '2026-11-15T09:00:00.000Z']) {
    const badConfirm = caseMod.confirmInvestigationCaseReport({
      investigationCase: submittedAt1020,
      actor: operator1,
      reportId: 'RPT-REG3-1',
      reportVersion: 1,
      at: earlierTs,
    });
    assertTypedError(badConfirm);
    assert.equal(badConfirm.code, 'TIMESTAMP_OUT_OF_ORDER');
  }
  assert.deepEqual(submittedAt1020, submittedSnapshot);

  // (c) Equal instant (===) allowed across full workflow preserving event order
  const sameTs = '2026-11-15T10:00:00.000Z';
  const eqOpen = caseMod.createInvestigationCase({
    caseId: 'CASE-REG3-EQUAL',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-2'],
    alerts,
    existingCases: [baseOpen],
    enterprises,
    projects,
    at: sameTs,
  }).investigationCase;
  const eqSelf = caseMod.selfAssignInvestigationCase({
    investigationCase: eqOpen,
    actor: operator1,
    at: sameTs,
  });
  assert.equal(eqSelf.ok, true);
  const eqSub = caseMod.submitInvestigationReport({
    investigationCase: eqSelf.investigationCase,
    actor: operator1,
    summary: 'Same-instant report',
    alertResults: [{ alertId: 'ALT-ELEC-2', resultText: 'Normal', evidence: 'Log' }],
    at: sameTs,
  });
  assert.equal(eqSub.ok, true);
  const eqClose = caseMod.confirmInvestigationCaseReport({
    investigationCase: eqSub.investigationCase,
    actor: operator1,
    reportId: eqSub.investigationCase.pendingReviewReportId,
    reportVersion: eqSub.investigationCase.pendingReviewReportVersion,
    at: sameTs,
  });
  assert.equal(eqClose.ok, true);
  assert.equal(eqClose.investigationCase.history.length, 4);

  // (d) Cross-offset ISO strings compare in absolute UTC ms (not string sort order)
  // 2026-11-15T16:59:59.999+07:00 = 09:59:59.999Z (lexicographically > '10:00Z', actually 1ms earlier -> FAIL)
  const crossEarlier = caseMod.selfAssignInvestigationCase({
    investigationCase: baseOpen,
    actor: operator1,
    at: '2026-11-15T16:59:59.999+07:00',
  });
  assertTypedError(crossEarlier);
  assert.equal(crossEarlier.code, 'TIMESTAMP_OUT_OF_ORDER');
  // 2026-11-15T05:00:00-05:00 = 10:00:00.000Z (lexicographically < '10:00Z', identical instant -> PASS)
  const crossSelf = caseMod.selfAssignInvestigationCase({
    investigationCase: baseOpen,
    actor: operator1,
    at: '2026-11-15T05:00:00-05:00',
  });
  assert.equal(crossSelf.ok, true);
  // 2026-11-15T17:00:00+07:00 = 10:00:00.000Z (identical instant -> PASS)
  const crossSub = caseMod.submitInvestigationReport({
    investigationCase: crossSelf.investigationCase,
    actor: operator1,
    summary: 'Cross-offset submit',
    alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Confirmed', evidence: 'Meter' }],
    at: '2026-11-15T17:00:00+07:00',
  });
  assert.equal(crossSub.ok, true);
  // 2026-11-15T05:00:01-05:00 = 10:00:01.000Z (lexicographically < '10:00Z', 1s later -> PASS)
  const crossConfirm = caseMod.confirmInvestigationCaseReport({
    investigationCase: crossSub.investigationCase,
    actor: operator1,
    reportId: crossSub.investigationCase.pendingReviewReportId,
    reportVersion: crossSub.investigationCase.pendingReviewReportVersion,
    at: '2026-11-15T05:00:01-05:00',
  });
  assert.equal(crossConfirm.ok, true);
  assert.equal(crossConfirm.investigationCase.closedAt, '2026-11-15T10:00:01.000Z');

  // (e) Corrupt / non-ISO / NaN / contradictory createdAt, updatedAt, or history[i].at return typed error (never throw/bypass)
  const corruptOpenCases = [
    { ...structuredClone(baseOpen), createdAt: 'not-a-date' },
    { ...structuredClone(baseOpen), createdAt: '2026-11-15T10:00:00' },
    { ...structuredClone(baseOpen), updatedAt: 'NaN' },
    { ...structuredClone(baseOpen), updatedAt: Number.NaN },
    { ...structuredClone(baseOpen), updatedAt: '2026-02-30T10:00:00Z' },
    { ...structuredClone(baseOpen), updatedAt: '2026-11-15T09:00:00.000Z' }, // updatedAt < createdAt
    {
      ...structuredClone(baseOpen),
      history: [{ ...structuredClone(baseOpen.history[0]), at: 'invalid-ts' }],
    },
    {
      ...structuredClone(baseOpen),
      history: [{ ...structuredClone(baseOpen.history[0]), at: '2026-11-15T10:05:00.000Z' }],
    }, // history later than updatedAt
  ];
  for (const corrupt of corruptOpenCases) {
    assertTypedError(
      caseMod.assignInvestigatorToCase({
        investigationCase: corrupt,
        actor: operator1,
        assigneeId: investigator1.id,
        users: directoryUsers,
        at: '2026-11-15T12:00:00.000Z',
      }),
    );
    assertTypedError(
      caseMod.selfAssignInvestigationCase({
        investigationCase: corrupt,
        actor: operator1,
        at: '2026-11-15T12:00:00.000Z',
      }),
    );
  }

  const corruptPendingCases = [
    { ...structuredClone(submittedAt1020), updatedAt: 'invalid' },
    {
      ...structuredClone(submittedAt1020),
      history: [
        structuredClone(submittedAt1020.history[0]),
        { ...structuredClone(submittedAt1020.history[1]), at: '2026-11-15T09:00:00.000Z' }, // history regresses
        structuredClone(submittedAt1020.history[2]),
      ],
    },
  ];
  for (const corrupt of corruptPendingCases) {
    assertTypedError(
      caseMod.requestInvestigationCaseRevision({
        investigationCase: corrupt,
        actor: operator1,
        reason: 'Check corrupt history handling',
        at: '2026-11-15T12:00:00.000Z',
      }),
    );
    assertTypedError(
      caseMod.confirmInvestigationCaseReport({
        investigationCase: corrupt,
        actor: operator1,
        reportId: 'RPT-REG3-1',
        reportVersion: 1,
        at: '2026-11-15T12:00:00.000Z',
      }),
    );
  }
  const corruptInvestigating = {
    ...structuredClone(assignedAt1010),
    history: [
      structuredClone(assignedAt1010.history[0]),
      { ...structuredClone(assignedAt1010.history[1]), at: 'bad-timestamp' },
    ],
  };
  assertTypedError(
    caseMod.submitInvestigationReport({
      investigationCase: corruptInvestigating,
      actor: investigator1,
      summary: 'Should fail on corrupt history',
      alertResults: [{ alertId: 'ALT-ELEC-1', resultText: 'Abnormal', evidence: 'Meter' }],
      at: '2026-11-15T12:00:00.000Z',
    }),
  );

  // (f) Pre-expiry case continues assign -> submit -> revision -> resubmit -> confirm chronologically after expiresAt;
  // new case creation after expiresAt still fails.
  const expiresAt = enterprise.lifecycle.subscription.expiresAt; // 2026-12-15T08:00:00.000Z
  const preExpCase = caseMod.createInvestigationCase({
    caseId: 'CASE-REG3-GRANDFATHER',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-3'],
    alerts,
    existingCases: [baseOpen, eqClose.investigationCase],
    enterprises,
    projects,
    at: '2026-12-15T07:59:00.000Z',
  }).investigationCase;

  const postExpAssign = caseMod.assignInvestigatorToCase({
    investigationCase: preExpCase,
    actor: operator1,
    assigneeId: investigator1.id,
    users: directoryUsers,
    at: expiresAt,
  });
  assert.equal(postExpAssign.ok, true);

  const postExpSub1 = caseMod.submitInvestigationReport({
    investigationCase: postExpAssign.investigationCase,
    actor: investigator1,
    reportId: 'RPT-EXP-V1',
    summary: 'Post-expiry v1',
    alertResults: [{ alertId: 'ALT-ELEC-3', resultText: 'Abnormal', evidence: 'Meter log' }],
    at: '2026-12-16T09:00:00.000Z',
  });
  assert.equal(postExpSub1.ok, true);

  const postExpRev = caseMod.requestInvestigationCaseRevision({
    investigationCase: postExpSub1.investigationCase,
    actor: operator1,
    reason: 'Attach breaker audit',
    at: '2026-12-17T10:00:00.000Z',
  });
  assert.equal(postExpRev.ok, true);

  const postExpSub2 = caseMod.submitInvestigationReport({
    investigationCase: postExpRev.investigationCase,
    actor: investigator1,
    reportId: 'RPT-EXP-V2',
    summary: 'Post-expiry v2',
    alertResults: [
      { alertId: 'ALT-ELEC-3', resultText: 'Confirmed', evidence: 'Meter + breaker audit' },
    ],
    at: '2026-12-18T11:00:00.000Z',
  });
  assert.equal(postExpSub2.ok, true);

  const postExpConfirm = caseMod.confirmInvestigationCaseReport({
    investigationCase: postExpSub2.investigationCase,
    actor: operator1,
    reportId: 'RPT-EXP-V2',
    reportVersion: 2,
    at: '2026-12-19T12:00:00.000Z',
  });
  assert.equal(postExpConfirm.ok, true);
  assert.equal(postExpConfirm.investigationCase.status, 'Closed');

  const extraUnlinkedAlert = makeAlertTx({
    seq: 5,
    projectId: 'proj-school-elec',
    projectName: 'School Annex',
  });
  const newAfterExpiry = caseMod.createInvestigationCase({
    caseId: 'CASE-REG3-NEW-EXPIRED',
    enterprise,
    actor: operator1,
    alertIds: ['ALT-ELEC-5'],
    alerts: [...alerts, extraUnlinkedAlert],
    existingCases: [baseOpen, eqClose.investigationCase, postExpConfirm.investigationCase],
    enterprises,
    projects,
    at: '2026-12-19T12:00:00.000Z',
  });
  assertTypedError(newAfterExpiry);
  assert.equal(newAfterExpiry.code, 'SUBSCRIPTION_EXPIRED');
});
