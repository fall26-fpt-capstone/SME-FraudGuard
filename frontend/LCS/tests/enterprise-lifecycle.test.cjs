const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
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

const lifecycleMod = load('src/utils/enterprise-lifecycle.ts');
const ruleSetLifecycleMod = load('src/utils/rule-set-lifecycle.ts');
const ingestionValidationMod = load('src/utils/ingestion-validation.ts');
const rulesData = load('src/data/fraudguard-rules.ts').fraudGuardRules;
const demoEnterprises = load('src/data/fraudguard-enterprises.ts').demoEnterprises;

const platformAdmin = {
  id: 'usr-platform-admin',
  name: 'Platform Admin',
  role: 'Platform Admin',
};
const assignedStaff = {
  id: 'usr-staff-1',
  name: 'Implementation Staff One',
  role: 'Implementation Staff',
};
const otherStaff = {
  id: 'usr-staff-2',
  name: 'Implementation Staff Two',
  role: 'Implementation Staff',
};
const smeAdmin = {
  id: 'usr-sme-1',
  name: 'SME Admin One',
  role: 'SME Admin',
  enterpriseId: 'ent-net-1',
};
const otherTenantSmeAdmin = {
  id: 'usr-sme-2',
  name: 'SME Admin Other',
  role: 'SME Admin',
  enterpriseId: 'ent-other',
};
const operatorUser = {
  id: 'usr-op-1',
  name: 'Operator',
  role: 'Operator',
  enterpriseId: 'ent-net-1',
};
const investigatorUser = {
  id: 'usr-inv-1',
  name: 'Investigator',
  role: 'Investigator',
  enterpriseId: 'ent-net-1',
};
const viewerUser = {
  id: 'usr-view-1',
  name: 'Viewer',
  role: 'Viewer',
  enterpriseId: 'ent-net-1',
};

function makeEnterprise(overrides = {}) {
  return {
    id: 'ent-net-1',
    code: 'NC-1001',
    name: 'Cyber Net 247',
    plan: 'Subscription',
    projectIds: ['proj-net-1'],
    deploymentStaffId: assignedStaff.id,
    ...overrides,
  };
}

function makeSchema() {
  return [
    { name: 'kwh', type: 'number', required: true, description: 'Electricity kWh' },
    { name: 'after_hours', type: 'boolean', required: true, description: 'After closing' },
    { name: 'meter_id', type: 'string', required: false, description: 'Meter identifier' },
  ];
}

function makeSamples(projectId = 'proj-net-1') {
  return [
    {
      id: 'sample-1',
      ref: 'REC-001',
      projectId,
      transactionType: 'electricity',
      fields: { kwh: 42.5, after_hours: true, meter_id: 'M-01' },
      expected: 'Abnormal',
    },
    {
      id: 'sample-2',
      ref: 'REC-002',
      projectId,
      transactionType: 'electricity',
      fields: { kwh: 3.2, after_hours: false, meter_id: 'M-01' },
      expected: 'Normal',
    },
  ];
}

function buildTestedPublishedRuleSet(options = {}) {
  const enterpriseId = options.enterpriseId ?? 'ent-net-1';
  const projectIds = options.projectIds ?? ['proj-net-1'];
  const schema = options.schema ?? makeSchema();
  const samples = options.samples ?? makeSamples(projectIds[0]);
  const ruleBase = {
    ...rulesData[0],
    id: options.ruleId ?? 'rule-net-after-hours',
    name: options.ruleName ?? 'High after-hours electricity usage',
    description: 'Detect abnormally high electricity consumption after closing hours',
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
      id: 'grp-1',
      logic: 'AND',
      children: [
        { type: 'condition', id: 'c1', field: 'after_hours', operator: '==', value: true },
        { type: 'condition', id: 'c2', field: 'kwh', operator: '>', value: options.threshold ?? 20 },
      ],
    },
  };

  const snapRules = ruleSetLifecycleMod.snapshotRules([ruleBase], projectIds);
  const draftSet = {
    id: options.ruleSetId ?? 'rs-net-1',
    name: 'Net Cafe Electricity Rules',
    enterpriseId,
    projectIds,
    versions: [],
    draft: { rules: snapRules },
  };
  draftSet.draft.test = ruleSetLifecycleMod.testDraft(draftSet, samples, schema);
  if (options.testedAt) {
    draftSet.draft.test.testedAt = options.testedAt;
  }
  const published = ruleSetLifecycleMod.publishSet(
    draftSet,
    options.reviewer ?? 'Implementation Internal Reviewer',
    options.reviewNote ?? 'Verified against net cafe specification',
    schema,
  );
  return { published, schema, samples };
}

test('crypto digest and strict ISO timestamp validation are timezone-independent', () => {
  const expectedSha = nodeCrypto.createHash('sha256').update('abc').digest('hex');
  assert.equal(lifecycleMod.sha256Hex('abc'), expectedSha);

  assert.equal(lifecycleMod.parseStrictIsoTimestamp('2026-11-11T10:00:00').ok, false);
  assert.equal(lifecycleMod.parseStrictIsoTimestamp('2026-02-30T10:00:00Z').ok, false);
  const offsetParsed = lifecycleMod.parseStrictIsoTimestamp('2026-11-11T17:00:00+07:00');
  assert.equal(offsetParsed.ok, true);
  assert.equal(offsetParsed.iso, '2026-11-11T10:00:00.000Z');
});

test('1. Valid lifecycle SettingUp -> PendingPlatformApproval -> PendingSMEActivation -> Operating works atomically and distinguishes publishSet reviewer from Platform Admin', () => {
  const baseEnterprise = makeEnterprise();
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  // publishSet having reviewer does NOT mark anything Platform Admin approved or Operating.
  assert.equal(published.versions[0].reviewer, 'Implementation Internal Reviewer');
  assert.equal(lifecycleMod.isEnterpriseOperating(baseEnterprise), false);

  const initRes = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
    eventId: 'evt-init-1',
  });
  assert.equal(initRes.ok, true);
  assert.equal(initRes.enterprise.lifecycle.status, 'SettingUp');
  assert.equal(initRes.enterprise.lifecycle.subscription, undefined);

  const submitRes = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: initRes.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
    eventId: 'evt-sub-1',
    submissionId: 'sub-1',
  });
  assert.equal(submitRes.ok, true);
  assert.equal(submitRes.enterprise.lifecycle.status, 'PendingPlatformApproval');
  assert.equal(submitRes.enterprise.lifecycle.subscription, undefined);
  assert.equal(submitRes.enterprise.lifecycle.pendingSubmission.submittedBy.id, assignedStaff.id);

  const approveRes = lifecycleMod.approveEnterpriseConfig({
    enterprise: submitRes.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    schema,
    at: '2026-11-11T09:30:00.000Z',
    eventId: 'evt-app-1',
    approvalId: 'appr-1',
  });
  assert.equal(approveRes.ok, true);
  assert.equal(approveRes.enterprise.lifecycle.status, 'PendingSMEActivation');
  assert.equal(approveRes.enterprise.lifecycle.subscription, undefined);
  assert.equal(approveRes.enterprise.lifecycle.approvalHistory.length, 1);

  const otherSet = {
    id: 'rs-old-unused',
    name: 'Old Set',
    enterpriseId: baseEnterprise.id,
    projectIds: baseEnterprise.projectIds,
    versions: [],
    activeVersion: 1,
  };
  const foreignSet = {
    id: 'rs-foreign',
    name: 'Foreign',
    enterpriseId: 'ent-other',
    projectIds: ['proj-other'],
    versions: [],
    activeVersion: 2,
  };

  const activateRes = lifecycleMod.activateEnterprise({
    enterprise: approveRes.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-1.0',
    ruleSet: published,
    ruleSets: [otherSet, published, foreignSet],
    schema,
    at: '2026-11-11T10:00:00.000Z',
    eventId: 'evt-act-1',
  });
  assert.equal(activateRes.ok, true);
  assert.equal(activateRes.enterprise.lifecycle.status, 'Operating');
  assert.equal(activateRes.enterprise.lifecycle.activatedConfig.configVersion, 'cfg-1.0');
  assert.equal(activateRes.enterprise.lifecycle.activation.activatedBy.id, smeAdmin.id);
  assert.equal(activateRes.enterprise.lifecycle.subscription.startedAt, '2026-11-11T10:00:00.000Z');
  assert.equal(activateRes.enterprise.lifecycle.subscription.expiresAt, '2026-12-11T10:00:00.000Z');

  assert.equal(activateRes.activationCommand.ruleSetId, published.id);
  assert.equal(activateRes.activationCommand.activeVersion, 1);
  assert.equal(activateRes.ruleSets.find(s => s.id === otherSet.id).activeVersion, undefined);
  assert.equal(activateRes.ruleSets.find(s => s.id === published.id).activeVersion, 1);
  assert.equal(activateRes.ruleSets.find(s => s.id === foreignSet.id).activeVersion, 2);
  assert.equal(activateRes.enterprise.lifecycle.history.length, 4);

  // Reducer produces matching state transitions
  const viaReducer = lifecycleMod.enterpriseLifecycleReducer(baseEnterprise, {
    type: 'INITIALIZE',
    actor: platformAdmin,
    at: '2026-11-11T08:00:00.000Z',
  });
  assert.equal(viaReducer.ok, true);
  assert.equal(viaReducer.enterprise.lifecycle.status, 'SettingUp');
});

test('2 & 3. Enforces role permissions, assigned Implementation Staff, and cross-tenant isolation', () => {
  const baseEnterprise = makeEnterprise();
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  for (const unauthorized of [assignedStaff, smeAdmin, operatorUser, investigatorUser, viewerUser]) {
    const r = lifecycleMod.initializeEnterpriseLifecycle({
      enterprise: baseEnterprise,
      actor: unauthorized,
      at: '2026-11-11T08:00:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'FORBIDDEN_ROLE');
  }

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  // Unassigned staff blocked
  const badStaff = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: otherStaff,
    configVersion: 'cfg-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  });
  assert.equal(badStaff.ok, false);
  assert.equal(badStaff.code, 'FORBIDDEN_STAFF');

  // Non-Implementation-Staff roles blocked from submitting
  for (const actor of [platformAdmin, smeAdmin, operatorUser, investigatorUser, viewerUser]) {
    const r = lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor,
      configVersion: 'cfg-1',
      ruleSet: published,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'FORBIDDEN_ROLE');
  }

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: assignedStaff,
    configVersion: 'cfg-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  }).enterprise;

  for (const actor of [assignedStaff, smeAdmin, operatorUser, investigatorUser, viewerUser]) {
    const r = lifecycleMod.approveEnterpriseConfig({
      enterprise: s1,
      actor,
      configVersion: 'cfg-1',
      at: '2026-11-11T09:30:00.000Z',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'FORBIDDEN_ROLE');
  }

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1,
    actor: platformAdmin,
    configVersion: 'cfg-1',
    at: '2026-11-11T09:30:00.000Z',
  }).enterprise;

  // Cross-tenant SME Admin cannot request revision or activate
  const crossRev = lifecycleMod.requestEnterpriseRevision({
    enterprise: s2,
    actor: otherTenantSmeAdmin,
    reason: 'Wrong field mapping',
    at: '2026-11-11T09:45:00.000Z',
  });
  assert.equal(crossRev.ok, false);
  assert.equal(crossRev.code, 'FORBIDDEN_TENANT');

  const crossAct = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: otherTenantSmeAdmin,
    configVersion: 'cfg-1',
    at: '2026-11-11T09:45:00.000Z',
  });
  assert.equal(crossAct.ok, false);
  assert.equal(crossAct.code, 'FORBIDDEN_TENANT');

  // Operator, Investigator, Viewer, Platform Admin, Implementation Staff cannot request revision or activate
  for (const actor of [platformAdmin, assignedStaff, operatorUser, investigatorUser, viewerUser]) {
    const rev = lifecycleMod.requestEnterpriseRevision({
      enterprise: s2,
      actor,
      reason: 'Reason',
      at: '2026-11-11T09:45:00.000Z',
    });
    assert.equal(rev.ok, false);
    assert.equal(rev.code, 'FORBIDDEN_ROLE');

    const act = lifecycleMod.activateEnterprise({
      enterprise: s2,
      actor,
      configVersion: 'cfg-1',
      at: '2026-11-11T09:45:00.000Z',
    });
    assert.equal(act.ok, false);
    assert.equal(act.code, 'FORBIDDEN_ROLE');

    if (actor === operatorUser || actor === investigatorUser || actor === viewerUser) {
      const cfg = lifecycleMod.configureEnterpriseSubscriptionDuration({
        enterprise: s0,
        actor,
        duration: { value: 30, unit: 'days' },
        at: '2026-11-11T08:10:00.000Z',
      });
      assert.equal(cfg.ok, false);
      assert.equal(cfg.code, 'FORBIDDEN_ROLE');
    }
  }
});

test('4. Rejects out-of-order and duplicate state transitions', () => {
  const baseEnterprise = makeEnterprise();
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  // Uninitialized enterprise cannot be approved, submitted, activated, or revised
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: baseEnterprise,
      actor: assignedStaff,
      configVersion: 'cfg-1',
      ruleSet: published,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'UNINITIALIZED_LIFECYCLE',
  );

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  // Cannot re-initialize
  assert.equal(
    lifecycleMod.initializeEnterpriseLifecycle({
      enterprise: s0,
      actor: platformAdmin,
      at: '2026-11-11T08:01:00.000Z',
    }).code,
    'ALREADY_INITIALIZED',
  );

  // Cannot approve or activate in SettingUp
  assert.equal(
    lifecycleMod.approveEnterpriseConfig({
      enterprise: s0,
      actor: platformAdmin,
      configVersion: 'cfg-1',
      at: '2026-11-11T08:05:00.000Z',
    }).code,
    'INVALID_STATE',
  );
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: s0,
      actor: smeAdmin,
      configVersion: 'cfg-1',
      at: '2026-11-11T08:05:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: assignedStaff,
    configVersion: 'cfg-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  }).enterprise;

  // Cannot re-submit or activate in PendingPlatformApproval
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s1,
      actor: assignedStaff,
      configVersion: 'cfg-1b',
      ruleSet: published,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:10:00.000Z',
    }).code,
    'INVALID_STATE',
  );
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: s1,
      actor: smeAdmin,
      configVersion: 'cfg-1',
      at: '2026-11-11T09:10:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1,
    actor: platformAdmin,
    configVersion: 'cfg-1',
    at: '2026-11-11T09:30:00.000Z',
  }).enterprise;

  // Cannot re-approve or re-submit in PendingSMEActivation
  assert.equal(
    lifecycleMod.approveEnterpriseConfig({
      enterprise: s2,
      actor: platformAdmin,
      configVersion: 'cfg-1',
      at: '2026-11-11T09:35:00.000Z',
    }).code,
    'INVALID_STATE',
  );
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s2,
      actor: assignedStaff,
      configVersion: 'cfg-1b',
      ruleSet: published,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:35:00.000Z',
    }).code,
    'INVALID_STATE',
  );
});

test('5. Rejects missing, failing, forged, schema-incompatible, or unexercised test evidence', () => {
  const baseEnterprise = makeEnterprise();
  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  // Missing test entirely
  const missingTestSet = structuredClone(published);
  delete missingTestSet.versions[0].test;
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-missing-test',
      ruleSet: missingTestSet,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'MISSING_TEST_EVIDENCE',
  );

  // Unexercised rule in the release fails coverage even if caller marks test complete
  const secondRule = structuredClone(published.versions[0].rules[0]);
  secondRule.id = 'rule-unexercised-refund';
  secondRule.appliesTo.transactionTypes = ['refund'];
  const partialSet = structuredClone(published);
  partialSet.versions[0].rules.push(secondRule);
  partialSet.versions[0].test = ruleSetLifecycleMod.testDraft(
    { ...partialSet, draft: { rules: partialSet.versions[0].rules } },
    makeSamples(),
    schema,
  );
  partialSet.versions[0].test.testedAt = '2026-11-11T09:00:00.000Z';
  partialSet.versions[0].test.complete = true;
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-partial-coverage',
      ruleSet: partialSet,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'FAILED_TEST_EVIDENCE',
  );

  // Forged tested:true / missing SetTest structure
  const forged = structuredClone(published);
  forged.versions[0].test = { tested: true };
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-forged',
      ruleSet: forged,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'MISSING_TEST_EVIDENCE',
  );

  // Forged complete:true & mismatched:0 even when sample expects Normal for Abnormal outcome
  const forgedResults = structuredClone(published);
  forgedResults.versions[0].test.samples[0].expected = 'Normal';
  forgedResults.versions[0].test.complete = true;
  forgedResults.versions[0].test.mismatched = 0;
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-fake-pass',
      ruleSet: forgedResults,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'FAILED_TEST_EVIDENCE',
  );

  // Rule modified after test was recorded
  const staleRuleSet = structuredClone(published);
  staleRuleSet.versions[0].rules[0].conditionGroup.children[1].value = 100;
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-stale-rule',
      ruleSet: staleRuleSet,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'STALE_TEST_EVIDENCE',
  );

  // Schema changed in submit without supplying fresh test
  const updatedSchema = [
    ...schema,
    { name: 'branch_code', type: 'string', required: true, description: 'Branch code' },
  ];
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-schema-changed',
      ruleSet: published,
      ruleSetVersion: 1,
      schema: updatedSchema,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'STALE_TEST_EVIDENCE',
  );

  // Passing a stale test alongside the new schema still fails normalizeFields validation
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: s0,
      actor: assignedStaff,
      configVersion: 'cfg-schema-mismatch',
      ruleSet: published,
      ruleSetVersion: 1,
      schema: updatedSchema,
      test: published.versions[0].test,
      at: '2026-11-11T09:05:00.000Z',
    }).code,
    'FAILED_TEST_EVIDENCE',
  );
});

test('6. Locks approval and activation against version mismatch, content drift keeping version number, and snapshot tampering', () => {
  const baseEnterprise = makeEnterprise();
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: assignedStaff,
    configVersion: 'cfg-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  }).enterprise;

  // Wrong configVersion at approval
  assert.equal(
    lifecycleMod.approveEnterpriseConfig({
      enterprise: s1,
      actor: platformAdmin,
      configVersion: 'cfg-999',
      at: '2026-11-11T09:30:00.000Z',
    }).code,
    'VERSION_MISMATCH',
  );

  // Content modified in live ruleSet while keeping version=1 -> caught at approval
  const mutatedLiveSet = structuredClone(published);
  mutatedLiveSet.versions[0].rules[0].conditionGroup.children[1].value = 999;
  assert.equal(
    lifecycleMod.approveEnterpriseConfig({
      enterprise: s1,
      actor: platformAdmin,
      configVersion: 'cfg-1',
      ruleSet: mutatedLiveSet,
      schema,
      at: '2026-11-11T09:30:00.000Z',
    }).code,
    'CONFIG_CONTENT_MISMATCH',
  );

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1,
    actor: platformAdmin,
    configVersion: 'cfg-1',
    ruleSet: published,
    schema,
    at: '2026-11-11T09:30:00.000Z',
  }).enterprise;

  // Wrong configVersion or modified live schema/rules keeping version=1 -> rejected at activation
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: s2,
      actor: smeAdmin,
      configVersion: 'cfg-other',
      at: '2026-11-11T10:00:00.000Z',
    }).code,
    'VERSION_MISMATCH',
  );
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: s2,
      actor: smeAdmin,
      configVersion: 'cfg-1',
      ruleSet: mutatedLiveSet,
      schema,
      at: '2026-11-11T10:00:00.000Z',
    }).code,
    'CONFIG_CONTENT_MISMATCH',
  );
  const mutatedSchema = structuredClone(schema);
  mutatedSchema[0].required = false;
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: s2,
      actor: smeAdmin,
      configVersion: 'cfg-1',
      ruleSet: published,
      schema: mutatedSchema,
      at: '2026-11-11T10:00:00.000Z',
    }).code,
    'CONFIG_CONTENT_MISMATCH',
  );

  // Direct mutation inside approvedConfig snapshot without changing version -> caught as SNAPSHOT_TAMPERED
  const tamperedEnterprise = structuredClone(s2);
  tamperedEnterprise.lifecycle.approvedConfig.rules[0].conditionGroup.children[1].value = 1;
  const tamperedAct = lifecycleMod.activateEnterprise({
    enterprise: tamperedEnterprise,
    actor: smeAdmin,
    configVersion: 'cfg-1',
    at: '2026-11-11T10:00:00.000Z',
  });
  assert.equal(tamperedAct.ok, false);
  assert.equal(tamperedAct.code, 'SNAPSHOT_TAMPERED');
});

test('7 & 8. Revision request requires reason, keeps prior approval history, blocks Operating revisions, and supports schema-only fix with new configVersion + fresh test', () => {
  const baseEnterprise = makeEnterprise();
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 1, unit: 'months' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: assignedStaff,
    configVersion: 'cfg-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
    submissionId: 'sub-1',
  }).enterprise;

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1,
    actor: platformAdmin,
    configVersion: 'cfg-1',
    at: '2026-11-11T09:30:00.000Z',
    approvalId: 'appr-1',
  }).enterprise;

  // Empty reason rejected
  assert.equal(
    lifecycleMod.requestEnterpriseRevision({
      enterprise: s2,
      actor: smeAdmin,
      reason: '   ',
      at: '2026-11-11T09:40:00.000Z',
    }).code,
    'MISSING_REASON',
  );

  const sRev = lifecycleMod.requestEnterpriseRevision({
    enterprise: s2,
    actor: smeAdmin,
    reason: 'Field meter_id must be required instead of optional',
    at: '2026-11-11T09:45:00.000Z',
    requestId: 'rev-1',
  });
  assert.equal(sRev.ok, true);
  assert.equal(sRev.enterprise.lifecycle.status, 'SettingUp');
  assert.equal(sRev.enterprise.lifecycle.approvedConfig, undefined);
  assert.equal(sRev.enterprise.lifecycle.approvalHistory.length, 1);
  assert.equal(sRev.enterprise.lifecycle.revisionHistory.length, 1);

  // Old approval is no longer activatable
  assert.equal(
    lifecycleMod.activateEnterprise({
      enterprise: sRev.enterprise,
      actor: smeAdmin,
      configVersion: 'cfg-1',
      at: '2026-11-11T09:46:00.000Z',
    }).code,
    'INVALID_STATE',
  );

  // Resubmitting with reused configVersion rejected
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: sRev.enterprise,
      actor: assignedStaff,
      configVersion: 'cfg-1',
      ruleSet: published,
      ruleSetVersion: 1,
      schema,
      at: '2026-11-11T09:50:00.000Z',
    }).code,
    'DUPLICATE_CONFIG_VERSION',
  );

  // Schema fixed while keeping the same rules (ruleSetVersion=1), WITH stale pre-revision test -> rejected
  const fixedSchema = [
    { name: 'kwh', type: 'number', required: true, description: 'Electricity kWh' },
    { name: 'after_hours', type: 'boolean', required: true, description: 'After closing' },
    { name: 'meter_id', type: 'string', required: true, description: 'Meter identifier (required)' },
  ];
  const staleTestBeforeReq = ruleSetLifecycleMod.testDraft(
    { ...published, draft: { rules: published.versions[0].rules } },
    makeSamples(),
    fixedSchema,
  );
  staleTestBeforeReq.testedAt = '2026-11-11T09:44:59.000Z';

  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: sRev.enterprise,
      actor: assignedStaff,
      configVersion: 'cfg-2',
      ruleSet: published,
      ruleSetVersion: 1,
      schema: fixedSchema,
      test: staleTestBeforeReq,
      at: '2026-11-11T09:50:00.000Z',
    }).code,
    'STALE_TEST_EVIDENCE',
  );

  // Fresh test recorded AFTER revision request with new published release (version 2) keeping the same rules and updated schema
  const freshTest = ruleSetLifecycleMod.testDraft(
    { ...published, draft: { rules: published.versions[0].rules } },
    makeSamples(),
    fixedSchema,
  );
  freshTest.testedAt = '2026-11-11T09:55:00.000Z';

  // Attempting to mask old release v1 with schema override instead of publishing a new release is rejected
  assert.equal(
    lifecycleMod.submitEnterpriseConfigForApproval({
      enterprise: sRev.enterprise,
      actor: assignedStaff,
      configVersion: 'cfg-2',
      ruleSet: published,
      ruleSetVersion: 1,
      schema: fixedSchema,
      test: freshTest,
      at: '2026-11-11T10:00:00.000Z',
    }).code,
    'CONFIG_CONTENT_MISMATCH',
  );

  // Publish release v2 with identical rules, fixedSchema, and freshTest while preserving v1 history
  const draftForV2 = {
    ...structuredClone(published),
    draft: {
      rules: structuredClone(published.versions[0].rules),
      test: structuredClone(freshTest),
    },
  };
  const publishedV2 = ruleSetLifecycleMod.publishSet(
    draftForV2,
    'Implementation Internal Reviewer',
    'Updated meter_id to required per SME Admin revision request',
    fixedSchema,
  );
  publishedV2.versions[1].test = structuredClone(freshTest);
  assert.equal(publishedV2.versions.length, 2);
  assert.equal(publishedV2.versions[0].version, 1);
  assert.equal(publishedV2.versions[0].schema[2].required, false);
  assert.equal(publishedV2.versions[1].version, 2);
  assert.equal(publishedV2.versions[1].schema[2].required, true);
  assert.deepEqual(publishedV2.versions[1].rules, publishedV2.versions[0].rules);

  const s3 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: sRev.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-2',
    ruleSet: publishedV2,
    ruleSetVersion: 2,
    schema: fixedSchema,
    test: freshTest,
    at: '2026-11-11T10:00:00.000Z',
    submissionId: 'sub-2',
  });
  assert.equal(s3.ok, true);
  assert.equal(s3.enterprise.lifecycle.status, 'PendingPlatformApproval');

  const s4 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s3.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-2',
    ruleSet: publishedV2,
    schema: fixedSchema,
    at: '2026-11-11T10:15:00.000Z',
    approvalId: 'appr-2',
  });
  assert.equal(s4.ok, true);
  assert.equal(s4.enterprise.lifecycle.approvalHistory.length, 2);
  assert.equal(s4.enterprise.lifecycle.approvalHistory[0].configVersion, 'cfg-1');
  assert.equal(s4.enterprise.lifecycle.approvalHistory[1].configVersion, 'cfg-2');

  const s5 = lifecycleMod.activateEnterprise({
    enterprise: s4.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-2',
    ruleSet: publishedV2,
    ruleSets: [publishedV2],
    schema: fixedSchema,
    at: '2026-11-11T10:30:00.000Z',
  });
  assert.equal(s5.ok, true);
  assert.equal(s5.enterprise.lifecycle.status, 'Operating');
  assert.equal(s5.enterprise.lifecycle.activatedConfig.schema[2].required, true);
  const activeRuleSet = s5.ruleSets.find(s => s.id === publishedV2.id);
  assert.equal(activeRuleSet.activeVersion, 2);
  const activeRelease = activeRuleSet.versions.find(v => v.version === activeRuleSet.activeVersion);
  assert.deepEqual(activeRelease.schema, fixedSchema);
  assert.equal(activeRelease.test.testedAt, '2026-11-11T09:55:00.000Z');
  assert.deepEqual(activeRelease.rules, s5.enterprise.lifecycle.activatedConfig.rules);
  assert.equal(activeRuleSet.versions[0].schema[2].required, false);

  // Requirement 8: WF-01 revision request MUST NOT be allowed once Operating
  const postOpRevision = lifecycleMod.requestEnterpriseRevision({
    enterprise: s5.enterprise,
    actor: smeAdmin,
    reason: 'Too late WF-01 revision',
    at: '2026-11-11T11:00:00.000Z',
  });
  assert.equal(postOpRevision.ok, false);
  assert.equal(postOpRevision.code, 'ALREADY_OPERATING');
});

test('9, 10 & 11. Free vs Subscription, invalid/missing duration, repeated activation idempotency, and expiration boundaries', () => {
  // Free plan activation without Subscription duration
  const freeEnterprise = makeEnterprise({ plan: 'Free' });
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  const f0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: freeEnterprise,
    actor: platformAdmin,
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;
  const f1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: f0,
    actor: assignedStaff,
    configVersion: 'cfg-free-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  }).enterprise;
  const f2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: f1,
    actor: platformAdmin,
    configVersion: 'cfg-free-1',
    at: '2026-11-11T09:20:00.000Z',
  }).enterprise;
  const f3 = lifecycleMod.activateEnterprise({
    enterprise: f2,
    actor: smeAdmin,
    configVersion: 'cfg-free-1',
    at: '2026-11-11T10:00:00.000Z',
  });
  assert.equal(f3.ok, true);
  assert.equal(f3.enterprise.lifecycle.subscription, undefined);
  assert.equal(lifecycleMod.isEnterpriseOperating(f3.enterprise), true);
  assert.equal(lifecycleMod.isEnterpriseSubscriptionActive(f3.enterprise, '2026-11-11T10:00:00.000Z'), false);
  assert.equal(
    lifecycleMod.checkEnterpriseOperationalEligibility(f3.enterprise, {
      at: '2026-11-11T10:00:00.000Z',
      requireSubscription: false,
    }).eligible,
    true,
  );
  assert.equal(
    lifecycleMod.checkEnterpriseOperationalEligibility(f3.enterprise, {
      at: '2026-11-11T10:00:00.000Z',
      requireSubscription: true,
    }).reasonCode,
    'PLAN_NOT_SUBSCRIPTION',
  );

  // Subscription enterprise without configured duration fails at activation until configured
  const subEnt = makeEnterprise({ plan: 'Subscription' });
  const p0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: subEnt,
    actor: platformAdmin,
    at: '2026-01-31T10:00:00.000Z',
  }).enterprise;

  // Invalid durations rejected
  for (const badDuration of [
    { value: 0, unit: 'days' },
    { value: -30, unit: 'days' },
    { value: 1.5, unit: 'months' },
    { value: Number.NaN, unit: 'days' },
    { value: 30, unit: 'weeks' },
  ]) {
    assert.equal(
      lifecycleMod.configureEnterpriseSubscriptionDuration({
        enterprise: p0,
        actor: platformAdmin,
        duration: badDuration,
        at: '2026-01-31T10:05:00.000Z',
      }).code,
      'INVALID_SUBSCRIPTION_DURATION',
    );
  }

  const p1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: p0,
    actor: assignedStaff,
    configVersion: 'cfg-sub-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-01-31T11:00:00.000Z',
  }).enterprise;
  const p2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: p1,
    actor: platformAdmin,
    configVersion: 'cfg-sub-1',
    at: '2026-01-31T12:00:00.000Z',
  }).enterprise;

  // Missing duration on Subscription activation rejected clearly
  const missingDurAct = lifecycleMod.activateEnterprise({
    enterprise: p2,
    actor: smeAdmin,
    configVersion: 'cfg-sub-1',
    at: '2026-01-31T23:00:00.000Z',
  });
  assert.equal(missingDurAct.ok, false);
  assert.equal(missingDurAct.code, 'MISSING_SUBSCRIPTION_DURATION');

  // Platform Admin configures 1 month -> still no startedAt yet
  const p2Configured = lifecycleMod.configureEnterpriseSubscriptionDuration({
    enterprise: p2,
    actor: platformAdmin,
    duration: { value: 1, unit: 'months' },
    at: '2026-01-31T22:00:00.000Z',
  });
  assert.equal(p2Configured.ok, true);
  assert.equal(p2Configured.enterprise.lifecycle.subscription, undefined);

  // SME Admin activates at 2026-02-01T06:00:00+07:00 (= 2026-01-31T23:00:00.000Z); 1 month UTC clamps to Feb 28
  const p3 = lifecycleMod.activateEnterprise({
    enterprise: p2Configured.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-sub-1',
    at: '2026-02-01T06:00:00+07:00',
  });
  assert.equal(p3.ok, true);
  assert.equal(p3.enterprise.lifecycle.subscription.startedAt, '2026-01-31T23:00:00.000Z');
  assert.equal(p3.enterprise.lifecycle.subscription.expiresAt, '2026-02-28T23:00:00.000Z');

  // Repeated activation does not reset or extend subscription
  const repeatAct = lifecycleMod.activateEnterprise({
    enterprise: p3.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-sub-1',
    at: '2026-02-15T10:00:00.000Z',
  });
  assert.equal(repeatAct.ok, false);
  assert.equal(repeatAct.code, 'ALREADY_OPERATING');
  assert.equal(p3.enterprise.lifecycle.subscription.startedAt, '2026-01-31T23:00:00.000Z');
  assert.equal(p3.enterprise.lifecycle.subscription.expiresAt, '2026-02-28T23:00:00.000Z');

  // Boundary checks: [startedAt, expiresAt)
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(p3.enterprise, '2026-01-31T22:59:59.999Z'),
    false,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(p3.enterprise, '2026-01-31T23:00:00.000Z'),
    true,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(p3.enterprise, '2026-02-28T22:59:59.999Z'),
    true,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(p3.enterprise, '2026-02-28T23:00:00.000Z'),
    false,
  );
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(p3.enterprise, '2026-03-01T06:00:00+07:00'),
    false,
  );
  assert.equal(
    lifecycleMod.checkEnterpriseOperationalEligibility(p3.enterprise, {
      at: '2026-02-28T23:00:00.000Z',
      requireSubscription: true,
    }).reasonCode,
    'SUBSCRIPTION_EXPIRED',
  );
});

test('12. Inputs and intermediate results stay immutable and isolated from external mutations', () => {
  const enterprise = makeEnterprise();
  const enterpriseBefore = structuredClone(enterprise);
  const { published, schema } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });
  const publishedBefore = structuredClone(published);
  const duration = { value: 14, unit: 'days' };

  const r0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise,
    actor: platformAdmin,
    subscriptionDuration: duration,
    at: '2026-11-11T08:00:00.000Z',
  });
  duration.value = 9999;
  assert.deepEqual(enterprise, enterpriseBefore);
  assert.equal(r0.enterprise.lifecycle.subscriptionConfig.value, 14);

  const r1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: r0.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-iso-1',
    ruleSet: published,
    ruleSetVersion: 1,
    schema,
    at: '2026-11-11T09:05:00.000Z',
  });

  // Mutate original published rules/schema/samples AND mutate r0 returned history
  published.versions[0].rules[0].name = 'MUTATED';
  schema[0].name = 'mutated_field';
  r0.enterprise.lifecycle.history.push({ id: 'fake' });
  assert.deepEqual(
    r1.enterprise.lifecycle.pendingSubmission.rules[0].name,
    publishedBefore.versions[0].rules[0].name,
  );
  assert.equal(r1.enterprise.lifecycle.pendingSubmission.schema[0].name, 'kwh');

  const r2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: r1.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-iso-1',
    at: '2026-11-11T09:30:00.000Z',
  });

  // Mutate r1 pendingSubmission and r2.event after the calls
  r1.enterprise.lifecycle.pendingSubmission.rules[0].name = 'HACKED_AFTER_SUBMIT';
  r2.event.note = 'HACKED_EVENT';
  assert.equal(
    r2.enterprise.lifecycle.approvedConfig.rules[0].name,
    publishedBefore.versions[0].rules[0].name,
  );
  assert.equal(r2.enterprise.lifecycle.history.at(-1).note, undefined);

  const r3 = lifecycleMod.activateEnterprise({
    enterprise: r2.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-iso-1',
    at: '2026-11-11T10:00:00.000Z',
  });
  r2.enterprise.lifecycle.approvedConfig.schema[0].required = false;
  assert.equal(r3.enterprise.lifecycle.activatedConfig.schema[0].required, true);
});

test('13. Legacy enterprise records without lifecycle are not auto-marked Operating and retain all original data', () => {
  const abcLegacy = structuredClone(demoEnterprises[0]);
  const snapshotBefore = structuredClone(abcLegacy);

  // Even though ABC Fashion has specification.stage === 'confirmed', WF-01 lifecycle is uninitialized.
  assert.equal(abcLegacy.specification.stage, 'confirmed');
  const resolved = lifecycleMod.resolveEnterpriseLifecycle(abcLegacy);
  assert.equal(resolved.initialized, false);
  assert.equal(resolved.isLegacy, true);
  assert.equal(resolved.status, null);
  assert.equal(resolved.isOperating, false);

  assert.equal(lifecycleMod.isEnterpriseOperating(abcLegacy), false);
  assert.equal(
    lifecycleMod.isEnterpriseSubscriptionActive(abcLegacy, '2026-11-11T10:00:00.000Z'),
    false,
  );

  const elig = lifecycleMod.checkEnterpriseOperationalEligibility(abcLegacy, {
    at: '2026-11-11T10:00:00.000Z',
    requireSubscription: true,
  });
  assert.equal(elig.eligible, false);
  assert.equal(elig.isLegacy, true);
  assert.equal(elig.reasonCode, 'UNINITIALIZED_LEGACY');
  assert.deepEqual(abcLegacy, snapshotBefore);
});

test('14. Regression P1: enforces single consistent activation source across ruleSet/ruleSets, blocks schema override masking stale release, and verifies command-only application', () => {
  const baseEnterprise = makeEnterprise();
  const { published: publishedV1, schema: schemaV1 } = buildTestedPublishedRuleSet({
    testedAt: '2026-11-11T09:00:00.000Z',
  });

  const s0 = lifecycleMod.initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    subscriptionDuration: { value: 30, unit: 'days' },
    at: '2026-11-11T08:00:00.000Z',
  }).enterprise;

  const s1 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: s0,
    actor: assignedStaff,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSetVersion: 1,
    schema: schemaV1,
    at: '2026-11-11T09:05:00.000Z',
  }).enterprise;

  const s2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: s1,
    actor: platformAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    schema: schemaV1,
    at: '2026-11-11T09:15:00.000Z',
  }).enterprise;

  const s2Before = structuredClone(s2);
  const publishedV1Before = structuredClone(publishedV1);

  // Case 1: valid ruleSet (threshold 20) + target in ruleSets has threshold changed to 999 keeping version 1 -> rejected
  const driftedTarget = structuredClone(publishedV1);
  driftedTarget.versions[0].rules[0].conditionGroup.children[1].value = 999;
  const driftedListInput = [driftedTarget];
  const driftedListBefore = structuredClone(driftedListInput);
  const case1Res = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: driftedListInput,
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case1Res.ok, false);
  assert.equal(case1Res.code, 'CONFIG_CONTENT_MISMATCH');
  assert.deepEqual(s2, s2Before);
  assert.deepEqual(driftedListInput, driftedListBefore);

  // Case 1b: drifted ruleSet (threshold 999) + valid target in ruleSets -> also rejected
  const case1ReverseRes = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: driftedTarget,
    ruleSets: [structuredClone(publishedV1)],
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case1ReverseRes.ok, false);
  assert.equal(case1ReverseRes.code, 'CONFIG_CONTENT_MISMATCH');

  // Case 2: valid ruleSet + empty ruleSets: [] -> rejected
  const emptyListInput = [];
  const case2Res = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: emptyListInput,
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case2Res.ok, false);
  assert.equal(case2Res.code, 'RULESET_NOT_FOUND');
  assert.deepEqual(emptyListInput, []);

  // Case 3a: duplicate target in ruleSets -> rejected
  const dupListInput = [structuredClone(publishedV1), structuredClone(publishedV1)];
  const dupListBefore = structuredClone(dupListInput);
  const case3Dup = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: dupListInput,
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case3Dup.ok, false);
  assert.equal(case3Dup.code, 'INVALID_RULESET_SCOPE');
  assert.deepEqual(dupListInput, dupListBefore);

  // Case 3b: target in ruleSets belongs only to another tenant -> rejected
  const foreignTenantTarget = {
    ...structuredClone(publishedV1),
    enterpriseId: 'ent-other',
    projectIds: ['proj-other'],
  };
  const foreignTargetInput = [foreignTenantTarget];
  const foreignTargetBefore = structuredClone(foreignTargetInput);
  const case3WrongTenant = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: foreignTargetInput,
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case3WrongTenant.ok, false);
  assert.ok(
    case3WrongTenant.code === 'FORBIDDEN_TENANT' ||
      case3WrongTenant.code === 'INVALID_RULESET_SCOPE',
  );
  assert.deepEqual(foreignTargetInput, foreignTargetBefore);

  // Case 3c: target in ruleSets is missing the approved release version -> rejected
  const missingReleaseTarget = {
    ...structuredClone(publishedV1),
    versions: [],
  };
  const missingReleaseInput = [missingReleaseTarget];
  const missingReleaseBefore = structuredClone(missingReleaseInput);
  const case3MissingRel = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: missingReleaseInput,
    schema: schemaV1,
    at: '2026-11-11T09:30:00.000Z',
  });
  assert.equal(case3MissingRel.ok, false);
  assert.equal(case3MissingRel.code, 'RELEASE_NOT_FOUND');
  assert.deepEqual(missingReleaseInput, missingReleaseBefore);

  // Case 4: matching parameters activate cleanly, preserving other enterprise sets
  const siblingSameTenant = {
    id: 'rs-sibling-old',
    name: 'Legacy Sibling Set',
    enterpriseId: baseEnterprise.id,
    projectIds: baseEnterprise.projectIds,
    versions: [],
    activeVersion: 1,
  };
  const untouchedOtherTenant = {
    id: 'rs-other-enterprise',
    name: 'Other Enterprise Set',
    enterpriseId: 'ent-other',
    projectIds: ['proj-other'],
    versions: [],
    activeVersion: 3,
    handover: { version: 3, by: 'Other Admin', at: '2026-11-01T00:00:00.000Z' },
  };
  const validMultiList = [siblingSameTenant, structuredClone(publishedV1), untouchedOtherTenant];
  const validMultiListBefore = structuredClone(validMultiList);

  const case4Res = lifecycleMod.activateEnterprise({
    enterprise: s2,
    actor: smeAdmin,
    configVersion: 'cfg-reg-1',
    ruleSet: publishedV1,
    ruleSets: validMultiList,
    schema: schemaV1,
    at: '2026-11-11T09:35:00.000Z',
  });
  assert.equal(case4Res.ok, true);
  assert.deepEqual(validMultiList, validMultiListBefore);
  const activatedTargetV1 = case4Res.ruleSets.find(s => s.id === publishedV1.id);
  const activeRelV1 = activatedTargetV1.versions.find(
    v => v.version === activatedTargetV1.activeVersion,
  );
  assert.deepEqual(activeRelV1.rules, case4Res.enterprise.lifecycle.activatedConfig.rules);
  assert.deepEqual(activeRelV1.schema, case4Res.enterprise.lifecycle.activatedConfig.schema);
  assert.deepEqual(
    activeRelV1.test,
    case4Res.enterprise.lifecycle.activatedConfig.testEvidence.test,
  );
  assert.equal(
    case4Res.ruleSets.find(s => s.id === siblingSameTenant.id).activeVersion,
    undefined,
  );
  assert.deepEqual(
    case4Res.ruleSets.find(s => s.id === untouchedOtherTenant.id),
    untouchedOtherTenant,
  );

  // Cases 5, 6, 7, 8 & 9: Schema-only revision via new release v2, blocking schema override on stale release, normalizeFields enforcement, command-only application, and deep immutability
  const revStep = lifecycleMod.requestEnterpriseRevision({
    enterprise: s2,
    actor: smeAdmin,
    reason: 'Require meter_id in operational schema',
    at: '2026-11-11T09:40:00.000Z',
  });
  assert.equal(revStep.ok, true);

  const requiredMeterSchema = [
    { name: 'kwh', type: 'number', required: true, description: 'Electricity kWh' },
    { name: 'after_hours', type: 'boolean', required: true, description: 'After closing' },
    { name: 'meter_id', type: 'string', required: true, description: 'Meter identifier (required)' },
  ];
  const freshTestV2 = ruleSetLifecycleMod.testDraft(
    { ...publishedV1, draft: { rules: publishedV1.versions[0].rules } },
    makeSamples(),
    requiredMeterSchema,
  );
  freshTestV2.testedAt = '2026-11-11T09:50:00.000Z';

  // Case 6a: Attempting to submit old release v1 with schema override is rejected
  const overrideSubmit = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: revStep.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-reg-override',
    ruleSet: publishedV1,
    ruleSetVersion: 1,
    schema: requiredMeterSchema,
    test: freshTestV2,
    at: '2026-11-11T09:55:00.000Z',
  });
  assert.equal(overrideSubmit.ok, false);
  assert.equal(overrideSubmit.code, 'CONFIG_CONTENT_MISMATCH');

  // Case 6b: Attempting to overwrite historical release v1 in-place instead of publishing release v2 is rejected
  const overwrittenV1 = structuredClone(publishedV1);
  overwrittenV1.versions[0].schema = structuredClone(requiredMeterSchema);
  overwrittenV1.versions[0].test = structuredClone(freshTestV2);
  const inPlaceOverwriteSubmit = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: revStep.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-reg-overwrite-v1',
    ruleSet: overwrittenV1,
    ruleSetVersion: 1,
    schema: requiredMeterSchema,
    test: freshTestV2,
    at: '2026-11-11T09:55:00.000Z',
  });
  assert.equal(inPlaceOverwriteSubmit.ok, false);
  assert.equal(inPlaceOverwriteSubmit.code, 'CONFIG_CONTENT_MISMATCH');

  // Case 5: Publish release v2 keeping identical rules, new schema, and fresh test while keeping v1 history intact
  const publishedV2 = ruleSetLifecycleMod.publishSet(
    {
      ...structuredClone(publishedV1),
      draft: {
        rules: structuredClone(publishedV1.versions[0].rules),
        test: structuredClone(freshTestV2),
      },
    },
    'Implementation Internal Reviewer',
    'Release v2 with meter_id required',
    requiredMeterSchema,
  );
  publishedV2.versions[1].test = structuredClone(freshTestV2);
  const publishedV2Before = structuredClone(publishedV2);

  const subV2 = lifecycleMod.submitEnterpriseConfigForApproval({
    enterprise: revStep.enterprise,
    actor: assignedStaff,
    configVersion: 'cfg-reg-2',
    ruleSet: publishedV2,
    ruleSetVersion: 2,
    schema: requiredMeterSchema,
    test: freshTestV2,
    at: '2026-11-11T10:00:00.000Z',
  });
  assert.equal(subV2.ok, true);

  // Case 6c: At approval, passing a ruleSet whose release v2 still has old schema (even if input.schema has requiredMeterSchema) is rejected
  const staleSchemaInV2 = structuredClone(publishedV2);
  staleSchemaInV2.versions[1].schema = structuredClone(schemaV1);
  const staleApprove = lifecycleMod.approveEnterpriseConfig({
    enterprise: subV2.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-reg-2',
    ruleSet: staleSchemaInV2,
    schema: requiredMeterSchema,
    at: '2026-11-11T10:05:00.000Z',
  });
  assert.equal(staleApprove.ok, false);
  assert.equal(staleApprove.code, 'CONFIG_CONTENT_MISMATCH');

  const appV2 = lifecycleMod.approveEnterpriseConfig({
    enterprise: subV2.enterprise,
    actor: platformAdmin,
    configVersion: 'cfg-reg-2',
    ruleSet: publishedV2,
    schema: requiredMeterSchema,
    at: '2026-11-11T10:05:00.000Z',
  });
  assert.equal(appV2.ok, true);

  // Case 6d: At activation, passing ruleSets whose release v2 still has old schema (or old test) while passing schema: requiredMeterSchema is rejected
  const staleActivateSchema = lifecycleMod.activateEnterprise({
    enterprise: appV2.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-reg-2',
    ruleSets: [staleSchemaInV2],
    schema: requiredMeterSchema,
    at: '2026-11-11T10:10:00.000Z',
  });
  assert.equal(staleActivateSchema.ok, false);
  assert.equal(staleActivateSchema.code, 'CONFIG_CONTENT_MISMATCH');

  const staleTestInV2 = structuredClone(publishedV2);
  staleTestInV2.versions[1].test = structuredClone(publishedV1.versions[0].test);
  const staleActivateTest = lifecycleMod.activateEnterprise({
    enterprise: appV2.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-reg-2',
    ruleSets: [staleTestInV2],
    schema: requiredMeterSchema,
    at: '2026-11-11T10:10:00.000Z',
  });
  assert.equal(staleActivateTest.ok, false);
  assert.equal(staleActivateTest.code, 'CONFIG_CONTENT_MISMATCH');

  // Case 5 & 7: Activate with valid ruleSets: [publishedV2] and verify operational schema with normalizeFields
  const actV2WithSets = lifecycleMod.activateEnterprise({
    enterprise: appV2.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-reg-2',
    ruleSet: publishedV2,
    ruleSets: [publishedV2, untouchedOtherTenant],
    schema: requiredMeterSchema,
    at: '2026-11-11T10:15:00.000Z',
  });
  assert.equal(actV2WithSets.ok, true);
  const opSet = actV2WithSets.ruleSets.find(s => s.id === publishedV2.id);
  assert.equal(opSet.activeVersion, 2);
  const opRelease = opSet.versions.find(v => v.version === opSet.activeVersion);
  assert.deepEqual(opRelease.schema, requiredMeterSchema);
  assert.deepEqual(opRelease.test, structuredClone(freshTestV2));
  assert.deepEqual(
    opRelease.test,
    actV2WithSets.enterprise.lifecycle.activatedConfig.testEvidence.test,
  );
  assert.deepEqual(opRelease.rules, actV2WithSets.enterprise.lifecycle.activatedConfig.rules);
  // Historical version 1 remains preserved with meter_id.required === false
  assert.equal(opSet.versions[0].version, 1);
  assert.equal(opSet.versions[0].schema[2].required, false);

  // Case 7: normalizeFields using operational activeRelease.schema rejects missing meter_id and accepts valid sample
  assert.throws(
    () =>
      ingestionValidationMod.normalizeFields(
        { kwh: 42.5, after_hours: true },
        opRelease.schema,
      ),
    /meter_id/,
  );
  const normalizedOk = ingestionValidationMod.normalizeFields(
    { kwh: 42.5, after_hours: true, meter_id: 'M-01' },
    opRelease.schema,
  );
  assert.deepEqual(structuredClone(normalizedOk), {
    kwh: 42.5,
    after_hours: true,
    meter_id: 'M-01',
  });

  // Case 8: Command-only path and pure command application helper
  const actCommandOnly = lifecycleMod.activateEnterprise({
    enterprise: appV2.enterprise,
    actor: smeAdmin,
    configVersion: 'cfg-reg-2',
    at: '2026-11-11T10:20:00.000Z',
  });
  assert.equal(actCommandOnly.ok, true);
  assert.equal(actCommandOnly.ruleSets, undefined);
  assert.equal(typeof lifecycleMod.applyEnterpriseActivationCommand, 'function');
  assert.deepEqual(actCommandOnly.activationCommand.schema, requiredMeterSchema);
  assert.deepEqual(
    actCommandOnly.activationCommand.rules,
    actCommandOnly.enterprise.lifecycle.activatedConfig.rules,
  );
  assert.equal(
    actCommandOnly.activationCommand.testEvidence.testDigest,
    actCommandOnly.enterprise.lifecycle.activatedConfig.testEvidence.testDigest,
  );

  // Applying command to mismatched/stale/empty/duplicate/wrong-tenant sets fails without mutating input
  const staleListForCmd = [structuredClone(staleSchemaInV2)];
  const staleListForCmdBefore = structuredClone(staleListForCmd);
  const badCmdApplySchema = lifecycleMod.applyEnterpriseActivationCommand(
    staleListForCmd,
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplySchema.ok, false);
  assert.equal(badCmdApplySchema.code, 'CONFIG_CONTENT_MISMATCH');
  assert.deepEqual(staleListForCmd, staleListForCmdBefore);

  const driftedTargetV2 = structuredClone(publishedV2);
  driftedTargetV2.versions[1].rules[0].conditionGroup.children[1].value = 999;
  const badCmdApplyDriftedRule = lifecycleMod.applyEnterpriseActivationCommand(
    [driftedTargetV2],
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplyDriftedRule.ok, false);
  assert.equal(badCmdApplyDriftedRule.code, 'CONFIG_CONTENT_MISMATCH');

  const badCmdApplyMissingRelease = lifecycleMod.applyEnterpriseActivationCommand(
    [driftedTarget],
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplyMissingRelease.ok, false);
  assert.equal(badCmdApplyMissingRelease.code, 'RELEASE_NOT_FOUND');

  const badCmdApplyDup = lifecycleMod.applyEnterpriseActivationCommand(
    [structuredClone(publishedV2), structuredClone(publishedV2)],
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplyDup.ok, false);
  assert.equal(badCmdApplyDup.code, 'INVALID_RULESET_SCOPE');

  const badCmdApplyForeignTenant = lifecycleMod.applyEnterpriseActivationCommand(
    [{ ...structuredClone(publishedV2), enterpriseId: 'ent-other' }],
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplyForeignTenant.ok, false);
  assert.equal(badCmdApplyForeignTenant.code, 'FORBIDDEN_TENANT');

  const badCmdApplyEmpty = lifecycleMod.applyEnterpriseActivationCommand(
    [],
    actCommandOnly.activationCommand,
  );
  assert.equal(badCmdApplyEmpty.ok, false);
  assert.equal(badCmdApplyEmpty.code, 'RULESET_NOT_FOUND');

  const tamperedCmd = structuredClone(actCommandOnly.activationCommand);
  tamperedCmd.schema[2].required = false;
  const badTamperedCmdApply = lifecycleMod.applyEnterpriseActivationCommand(
    [publishedV2],
    tamperedCmd,
  );
  assert.equal(badTamperedCmdApply.ok, false);
  assert.equal(badTamperedCmdApply.code, 'SNAPSHOT_TAMPERED');

  // Applying command to valid ruleSets succeeds and yields verified activeRelease
  const validListForCmd = [siblingSameTenant, structuredClone(publishedV2), untouchedOtherTenant];
  const validListForCmdBefore = structuredClone(validListForCmd);
  const goodCmdApply = lifecycleMod.applyEnterpriseActivationCommand(
    validListForCmd,
    actCommandOnly.activationCommand,
  );
  assert.equal(goodCmdApply.ok, true);
  assert.deepEqual(validListForCmd, validListForCmdBefore);
  assert.deepEqual(goodCmdApply.activeRelease.schema, requiredMeterSchema);
  assert.throws(
    () =>
      ingestionValidationMod.normalizeFields(
        { kwh: 15, after_hours: false },
        goodCmdApply.activeRelease.schema,
      ),
    /meter_id/,
  );

  // Case 9: Mutating nested output from activation or command application does not mutate inputs or historical releases
  actV2WithSets.ruleSets.find(s => s.id === publishedV2.id).versions[1].schema[2].required = false;
  actV2WithSets.ruleSets.find(s => s.id === publishedV2.id).versions[0].schema[2].required = true;
  actCommandOnly.activationCommand.schema[2].required = false;
  goodCmdApply.activeRelease.schema[2].required = false;
  assert.deepEqual(structuredClone(publishedV1), publishedV1Before);
  assert.deepEqual(structuredClone(publishedV2), publishedV2Before);
  assert.equal(
    goodCmdApply.ruleSets.find(s => s.id === publishedV2.id).versions[1].schema[2].required,
    true,
  );
  assert.equal(
    goodCmdApply.ruleSets.find(s => s.id === publishedV2.id).versions[0].schema[2].required,
    false,
  );
});
