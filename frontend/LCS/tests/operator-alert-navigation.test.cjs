const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, createUiImports } = require('./helpers/wf04.cjs');

test('Operator alert navigation exposes only the sources for the enterprise plan', () => {
  const { getOperatorAlertSources } = load('src/routes/navigation.ts');
  assert.deepEqual([...getOperatorAlertSources('Subscription')], ['AI', 'RULE_FALLBACK']);
  assert.deepEqual([...getOperatorAlertSources('Free')], ['RULE']);
  assert.deepEqual([...getOperatorAlertSources()], []);
  for (const lang of ['vi', 'en']) {
    const { AlertNavigationGroup } = load('src/layouts/AlertNavigationGroup.tsx', createUiImports(lang));
    const { translations } = load('src/config/translations.ts');
    const labels = translations[lang].nav.items;
    const html = renderToStaticMarkup(React.createElement(AlertNavigationGroup, { alertPlan: 'Subscription', activeAlertSource: 'AI' }));
    assert.ok(html.includes(labels.aiAlerts) && html.includes(labels.fallbackAlerts));
    assert.ok(!html.includes(labels.ruleAlerts));
    assert.ok(html.includes('aria-current="page"'));
    const free = renderToStaticMarkup(React.createElement(AlertNavigationGroup, { alertPlan: 'Free' }));
    assert.ok(free.includes(labels.ruleAlerts));
    assert.ok(!free.includes(labels.aiAlerts) && !free.includes(labels.fallbackAlerts));
  }
});

test('Each source page filters rows and counts before pagination without changing source data', () => {
  const { AlertsView } = load('src/components/fraudguard-dashboard/AlertsView.tsx', createUiImports('vi'));
  const bundle = load('src/data/wf04-demo.ts').getWf04DemoBundle();
  const base = bundle.transactions[0];
  const transactions = ['AI', 'RULE_FALLBACK', 'RULE'].map((scoringSource, i) => ({ ...base, id: `nav-${i}`, alertId: `ALERT-NAV-${i}`, scoringSource }));
  const before = JSON.stringify(transactions);
  for (let i = 0; i < transactions.length; i++) {
    const html = renderToStaticMarkup(React.createElement(AlertsView, { transactions, fixedSource: transactions[i].scoringSource, onReview() {} }));
    for (let j = 0; j < transactions.length; j++) assert.equal(html.includes(`ALERT-NAV-${j}`), i === j);
  }
  assert.equal(JSON.stringify(transactions), before);
});

test('AI page supports case selection while AI fallback and Rule pages stay monitoring-only with source-accurate copy', () => {
  const { translations } = load('src/config/translations.ts');
  const bundle = load('src/data/wf04-demo.ts').getWf04DemoBundle();
  const operator = bundle.users.find(u => u.role === 'Operator');
  const aiNewer = {
    ...bundle.transactions.find(tx => tx.scoringSource === 'AI' && tx.riskLevel === 'Abnormal'),
    id: 'tx-sort-newer',
    alertId: 'ALT-AI-SORT-NEWER',
    transactionReference: 'ELEC-NEW',
    processedAt: '2026-11-18T10:00:00.005Z',
  };
  const aiOlder = {
    ...aiNewer,
    id: 'tx-sort-older',
    alertId: 'ALT-AI-SORT-OLDER',
    transactionReference: 'ELEC-OLD',
    processedAt: '2026-11-18T10:00:00.001Z',
  };
  const fallbackAlert = {
    ...aiNewer,
    id: 'tx-fb-only',
    alertId: 'ALT-FB-ONLY',
    transactionReference: 'ELEC-FB',
    scoringSource: 'RULE_FALLBACK',
    modelVersion: undefined,
  };
  const ruleAlert = {
    ...aiNewer,
    id: 'tx-rule-only',
    alertId: 'ALT-RULE-ONLY',
    transactionReference: 'ELEC-RULE',
    scoringSource: 'RULE',
    modelVersion: undefined,
  };

  for (const lang of ['vi', 'en']) {
    const { AlertsView } = load('src/components/fraudguard-dashboard/AlertsView.tsx', createUiImports(lang));
    const listCopy = translations[lang].alertsView.list;

    const aiHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        fixedSource: 'AI',
        transactions: [aiOlder, aiNewer],
        canManageCases: true,
        currentUser: operator,
        enterprises: bundle.enterprises,
        onCreateInvestigationCase: () => ({ ok: true }),
        onReview() {},
      })
    );
    assert.ok(aiHtml.includes('type="checkbox"'));
    assert.ok(aiHtml.includes(listCopy.needsCaseTab));
    assert.ok(aiHtml.includes(listCopy.aiSubtitle));
    assert.ok(aiHtml.indexOf('ALT-AI-SORT-NEWER') < aiHtml.indexOf('ALT-AI-SORT-OLDER'));

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        fixedSource: 'RULE_FALLBACK',
        transactions: [fallbackAlert],
        canManageCases: true,
        currentUser: operator,
        enterprises: bundle.enterprises,
        onCreateInvestigationCase: () => ({ ok: true }),
        onReview() {},
      })
    );
    assert.equal(fallbackHtml.includes('type="checkbox"'), false);
    assert.equal(fallbackHtml.includes(listCopy.needsCaseTab), false);
    assert.equal(fallbackHtml.includes(listCopy.hasCaseTab), false);
    assert.ok(fallbackHtml.includes(listCopy.fallbackSubtitle));
    assert.equal(fallbackHtml.includes(listCopy.aiSubtitle), false);
    assert.equal(/Phase\s*2|WF-04/i.test(fallbackHtml), false);

    const ruleHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        fixedSource: 'RULE',
        transactions: [ruleAlert],
        canManageCases: true,
        currentUser: operator,
        enterprises: bundle.enterprises,
        onCreateInvestigationCase: () => ({ ok: true }),
        onReview() {},
      })
    );
    assert.equal(ruleHtml.includes('type="checkbox"'), false);
    assert.equal(ruleHtml.includes(listCopy.needsCaseTab), false);
    assert.ok(ruleHtml.includes(listCopy.ruleSubtitle));
    assert.equal(ruleHtml.includes(listCopy.aiSubtitle), false);

    const fallbackEmptyHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        fixedSource: 'RULE_FALLBACK',
        transactions: [],
        canManageCases: true,
        currentUser: operator,
        enterprises: bundle.enterprises,
        onCreateInvestigationCase: () => ({ ok: true }),
        onReview() {},
      })
    );
    assert.ok(fallbackEmptyHtml.includes(listCopy.noFallbackAlerts));

    const ruleEmptyHtml = renderToStaticMarkup(
      React.createElement(AlertsView, {
        fixedSource: 'RULE',
        transactions: [],
        canManageCases: true,
        currentUser: operator,
        enterprises: bundle.enterprises,
        onCreateInvestigationCase: () => ({ ok: true }),
        onReview() {},
      })
    );
    assert.ok(ruleEmptyHtml.includes(listCopy.noRuleAlerts));
  }
});

test('Case Detail modal applies dedicated desktop/mobile section spacing without changing shared builderBody', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'components',
    'fraudguard-dashboard',
    'SecurityDashboard.module.css'
  );
  const css = fs.readFileSync(cssPath, 'utf8');

  const builderBodyBlock = css.match(/\.builderBody\s*\{([^}]*)\}/);
  assert.ok(builderBodyBlock);
  assert.doesNotMatch(builderBodyBlock[1], /display\s*:\s*flex/);
  assert.doesNotMatch(builderBodyBlock[1], /gap\s*:/);

  const desktopDetailBody = css.match(/\.caseDetailBody\s*\{([^}]*)\}/);
  assert.ok(desktopDetailBody);
  assert.match(desktopDetailBody[1], /display\s*:\s*flex/);
  assert.match(desktopDetailBody[1], /flex-direction\s*:\s*column/);
  assert.match(desktopDetailBody[1], /gap\s*:\s*16px/);

  const detailBodyChildren = css.match(/\.caseDetailModal\s+\.caseDetailBody\s*>\s*\*\s*\{([^}]*)\}/);
  assert.ok(detailBodyChildren);
  assert.match(detailBodyChildren[1], /margin-bottom\s*:\s*0/);

  const mobileBlock = css.match(
    /@media\s*\(max-width:\s*680px\)\s*\{\s*\.caseDetailModal\s*\{[^}]*\}\s*\.caseDetailBody\s*\{([^}]*)\}/
  );
  assert.ok(mobileBlock);
  assert.match(mobileBlock[1], /gap\s*:\s*12px/);

  const bundle = load('src/data/wf04-demo.ts').getWf04DemoBundle();
  const samples = load('src/data/wf04-demo.ts').getWf04ReviewSamples();
  const closedCase = samples.cases.find((c) => c.status === 'Closed');
  assert.ok(closedCase);
  const smeAdmin = bundle.users.find(
    (u) => u.role === 'SME Admin' && u.enterpriseId === closedCase.enterpriseId
  );
  const operator = bundle.users.find((u) => u.role === 'Operator');
  assert.ok(smeAdmin && operator);

  const { CasesView } = load('src/components/fraudguard-dashboard/CasesView.tsx', createUiImports('vi'));

  const internalHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: [closedCase],
      legacyCaseArchive: [],
      transactions: [...bundle.transactions, ...samples.transactions],
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: operator,
      selectedCaseId: closedCase.caseId,
    })
  );
  assert.ok(internalHtml.includes('class="builderBody caseDetailBody"'));

  const smeHtml = renderToStaticMarkup(
    React.createElement(CasesView, {
      investigationCases: [closedCase],
      legacyCaseArchive: [],
      transactions: [...bundle.transactions, ...samples.transactions],
      enterprises: bundle.enterprises,
      users: bundle.users,
      currentUser: smeAdmin,
      selectedCaseId: closedCase.caseId,
    })
  );
  assert.ok(smeHtml.includes('class="builderBody caseDetailBody"'));
  assert.doesNotMatch(smeHtml, /class="roleNoticeBanner" style="margin-bottom:14px"/);
});

test('Real RULE and RULE_FALLBACK alerts hide all case-creation UI in AlertCaseDrawer and still fail domain case creation', () => {
  const { translations } = load('src/config/translations.ts');
  const bundle = load('src/data/wf04-demo.ts').getWf04DemoBundle();
  const operator = bundle.users.find((u) => u.id === 'usr-wf04-op');
  const campus = bundle.enterprises.find((e) => e.id === 'ent-wf04-campus');
  const ruleTx = bundle.transactions.find((tx) => tx.alertId === 'ALT-WF04-CAMPUS-RULE-05');
  const fallbackTx = bundle.transactions.find((tx) => tx.alertId === 'ALT-WF04-CAMPUS-FALLBACK-06');

  assert.ok(operator && campus);
  assert.equal(ruleTx?.scoringSource, 'RULE');
  assert.equal(fallbackTx?.scoringSource, 'RULE_FALLBACK');

  const activeAt = campus.lifecycle.subscription.startedAt;
  const { createInvestigationCase, checkInvestigationCaseCreationEligibility } = load(
    'src/utils/investigation-case.ts'
  );
  const enterpriseEligibility = checkInvestigationCaseCreationEligibility(campus, activeAt);
  assert.equal(enterpriseEligibility.ok, true);

  for (const nonAiTx of [ruleTx, fallbackTx]) {
    const created = createInvestigationCase({
      actor: operator,
      enterprise: campus,
      caseId: 'CASE-BLOCKED-NON-AI',
      alertIds: [nonAiTx.alertId],
      alerts: bundle.transactions,
      existingCases: [],
      at: activeAt,
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, 'INELIGIBLE_ALERT_SOURCE');
  }

  for (const lang of ['vi', 'en']) {
    const { AlertCaseDrawer } = load(
      'src/components/fraudguard-dashboard/AlertCaseDrawer.tsx',
      createUiImports(lang)
    );
    const copy = translations[lang];

    for (const wf04Managed of [true, false]) {
      for (const tx of [ruleTx, fallbackTx]) {
        const html = renderToStaticMarkup(
          React.createElement(AlertCaseDrawer, {
            transaction: tx,
            open: true,
            onClose() {},
            users: bundle.users,
            currentUser: operator,
            investigationCases: [],
            legacyCaseArchive: [],
            wf04Managed,
          })
        );
        assert.ok(html.includes(tx.transactionReference));
        assert.ok(html.includes(tx.entityReference));
        assert.ok(html.includes(tx.projectName));
        assert.ok(html.includes('Off-Hours Power Surge'));
        assert.ok(html.includes(tx.explanation));
        assert.equal(html.includes(copy.drawer.createCaseTitle), false);
        assert.equal(html.includes(copy.drawer.createCaseBtn), false);
        assert.equal(html.includes('Tạo hồ sơ điều tra'), false);
        assert.equal(html.includes('Tự điều tra'), false);
        assert.equal(html.includes('Investigate myself'), false);
        assert.equal(html.includes(copy.wf04Phase2a.caseQueue.caseSummarySectionTitle), false);
        assert.doesNotMatch(html, /<button[^>]*disabled/);
        if (tx.scoringSource === 'RULE_FALLBACK') {
          assert.match(html, /Rule Engine.*AI|backup Rule Engine/i);
        }
      }
    }
  }
});
