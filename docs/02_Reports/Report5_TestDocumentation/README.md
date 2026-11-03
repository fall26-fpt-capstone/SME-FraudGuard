# Report 5 — Test documentation

Project **FA26SE215**, group **GFA26SE97**. The native Report 5 remains the team's working document:
[Report 5](https://docs.google.com/document/d/1wYk7fiQqEdySSm8AwL2fUi29o7t_wNj449oRdj9OjhU/edit).

## Assets

- [Review PDF export](SEP490_FA26SE215_R2_Report5_TestDocumentation.pdf): native-document review snapshot, not a finalized submission or a test-execution report.
- [System test workbook](test-cases/SEP490_FA26SE215_Report5_System_Test_Cases.xlsx): 170 designed cases in 17 feature groups, requirement references, execution fields, test profiles and pending decisions.
- [Structured catalogue](test-cases/system-test-cases.json): editable case definitions and traceability baseline. Keep its case definitions and the workbook consistent when changing a procedure or expectation; record execution evidence in the workbook.
- [Fixture manifest](test-data/fixture-manifest.json): synthetic mapping, active/disabled rule examples and expected import counts.
- `test-data/`: equivalent CSV/XLSX import examples, REST and Webhook **body examples**, and synthetic onboarding/display samples.
- [Asset validator](validate_test_assets.py): checks catalogue consistency, fixture contents, CSV/XLSX equivalence and absence of fabricated execution results in this authored baseline. It does not run the application.

## Source and scope

Use the current registration v2, the team's confirmed decisions, and approved Report 3 sections 1, 2, 4 and 5. The 42 UC, 40 BR and 19 CR identifiers are from the current native SRS. Each has a designed case reference; this is a traceability count, not proof that a requirement has passed. Detailed FR mapping waits until Report 3 section 3 is finalized. Obsolete risk scores, severity, confidence, AI explanations, manual-only subscriptions and Operator-only imports are excluded.

All cases start **Not Run**. Actual result, evidence, tester, date and defect reference stay blank until real execution. The overview computes execution totals from those statuses. Do not infer Pass from a designed expected outcome, successful asset validation or a rendered workbook.

## Prepare an isolated run

1. Provision disposable enterprise/workspace A and B plus the role profiles in the workbook. Obtain credentials and keys at runtime; never put secrets in these assets.
2. Configure `TEST-MAP-A` explicitly for the fixture workspace. Its fields and conversions are **test configuration**, not the global product/API contract. Use the raw-column mappings in the manifest. REST/Webhook examples omit transport authentication and provider-specific envelopes; use the approved integration's real verification mechanism.
   The team has confirmed that product documentation should describe transaction fields, types and date/time conversion generically until a shared contract is finalized.
3. Use fresh business transaction references for independent scenarios. For deliberate duplicates or conflicts, retain the same reference and workspace. Do not use preexisting records from another scenario by accident.
4. Before the mixed or duplicate file, accept `TX-BASE` once through a configured channel. The mixed file then expects **2 accepted, 1 equivalent duplicate, 1 conflict and 3 invalid rows**. The original record must not be overwritten. Row ordering is not assumed.
5. The valid file has 3 accepted rows in a fresh workspace/namespace. The missing-column file is structurally rejected and accepts no rows. Technical file limits and parser behavior must come from the confirmed configuration.
6. Use an AI test double or controlled service for Normal, Anomaly, unavailable, timeout and invalid-response variants. Use a gateway sandbox or controlled **server-side verified** confirmation for payments; browser return flags and JSON fixtures are not payment proof. Use a notification sink. No real money, customers or external account blocking is involved.
7. Read the `Decisions` sheet first. If a decision needed by a scenario is unanswered, leave that boundary pending and run independent scenarios. Do not supply an expected result by guessing.
8. Run every variant listed in a parameterized procedure. Record environment/build, configured values, actual result, evidence, tester/date and defects. Set Pass/Fail only from that evidence. Use Blocked or Not Applicable with a concrete reason where appropriate.

`onboarding-specification.txt` is a retained synthetic onboarding document. Transaction samples for dry runs are temporary and must remain outside production transactions, alerts, cases, feedback and statistics.

## Maintenance and verification

Run from the repository root with Python 3 (standard library only):

```powershell
python docs/02_Reports/Report5_TestDocumentation/validate_test_assets.py
```

The authored baseline validator intentionally rejects filled execution results. Once real execution begins, use `--allow-executed` to validate structure and fixtures while preserving legitimate workbook execution entries; the JSON catalogue still defines the original case design.

AI recovery eligibility follows the transaction's event time: a fallback event inside a historical Subscription validity period may be reanalysed after AI recovery even when the current plan has expired. This does not restore the right to open new cases after expiry. `SYS-DETECT-011` checks both recovery timings and an outside-period control while preserving earlier attempts.

The global input contract is deferred by the team; reporting stays generic and synthetic fixtures remain explicitly test-only. Other pending matters include detailed case lifecycle, AI/Rule Alert reconciliation and recovery scheduling, provider protocols, configuration publication, technical limits, exact billing boundaries, account/data lifecycle, AI evaluation and execution ownership/environment. The Decisions sheet distinguishes deferred, partially confirmed and unanswered items.
