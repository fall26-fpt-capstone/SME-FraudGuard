# SME-FraudGuard v1 software business specification

Compiled on: 02/11/2026. Status: consolidated draft for team review, serving as input to the SRS, SDD, ERD and work allocation. This document describes target behavior; it does not confirm that the current code implements it.

## 1. Scope sources and usage

- The authoritative source for the topic and scope is [Registration with BM03](../01_Registration/SWP490_FA26SE215_R2_Registration.pdf). [BM03 Word version](../01_Registration/SWP490_R2_BM03_Record_of_Changes_1.docx) explains proposal changes.
- This document consolidates business decisions discussed with the team leader and adds software implementation details. It does not replace or independently amend the proposal, or confirm that the review board has approved the changes.
- Sections marked **confirmed** contain decisions confirmed in discussion. Sections marked **proposed** or **pending confirmation** must not be treated as official requirements during coding without approval.
- Differences from the proposal must be recorded and agreed with the team before updating official reports. Current code/demo behavior is not a basis for expanding scope.
- Coding agents should read this document with the [general guidelines](../../AGENTS.md), README and relevant module instructions. This is a product specification, not an agent's personal log or memory.

## 2. v1 goals and boundaries

**Confirmed:** SME-FraudGuard is a multi-tenant B2B SaaS solution supporting anomaly detection in online payment transactions for SMEs across multiple industries. The platform ingests, normalizes, detects, alerts and supports investigation; business response decisions belong to the enterprise.

| In v1 | Outside v1 or pending confirmation |
| --- | --- |
| One enterprise, one workspace, one active rule set | Multiple projects or independent business configuration sets within a workspace |
| REST API, Webhook, CSV/Excel with separate mappings | Multiple input formats active simultaneously within one channel |
| Dynamic rules on standard and custom fields, evaluated per transaction | Historical aggregation and time-window rules; consider for v2 |
| Free and Subscription, with manual plan administration | Online payments, QR and automatic reconciliation |
| AI Alert and investigation workflow, testable with simulated AI | AI algorithms, data, contracts and retraining workflow not yet finalized |
| Backend authorization; protection of sensitive data | No promise that the platform is entirely unable to decrypt data |

- No shared 0–100 risk score mechanism. Do not add Low/Medium/High severity levels; these are not currently required. Additional AI outputs await review in section 10.
- Do not automatically block customer accounts, cancel orders, reject payments or execute measures in customer systems.
- V1 does not set commercial quotas for accounts, rules, transactions or storage. This does not remove technical limits needed to protect the service; those limits must be defined in NFRs.
- The team prioritizes completing the software before integrating the model. Simulated AI is only for clearly labeled tests/demos; it must not be presented as real model output.
- The planned demo uses a sales website built by the team to generate payment events. No experimental results yet demonstrate that AI outperforms rules.

## 3. Terminology

| Term | Meaning |
| --- | --- |
| Workspace / tenant | Data and operational scope of one enterprise |
| Internal field | A field with consistent meaning and data type within a workspace, used to configure rules |
| Mapping | Mapping a channel's input fields to internal fields, including conversion rules |
| Transaction | An online payment transaction; not a Webhook event or upload attempt |
| Detection result | The result of one transaction evaluation, with its source and relevant version information |
| Rule Alert | An alert that a transaction matches one or more rules |
| AI Alert | An alert that AI detected an abnormal transaction |
| Case | An investigation case that an Operator explicitly opens from an AI Alert |
| Import batch | One file upload and processing run, with its own progress and results |
| Plan | A service plan definition, introductory information, pricing and availability status |
| Workspace subscription | A workspace's time-limited plan entitlement; distinct from the plan definition |
| Platform Admin / SME Admin | Platform administrator / enterprise administrator; do not use the shared name “Admin” when writing requirements |

## 4. Accounts, workspaces and roles

### 4.1 Confirmed rules

- ACC-01: One enterprise has one workspace; a dedicated subdomain such as `nhanhoa.fraudguard.vn` is planned. The domain is an example; ownership and DNS deployment are not confirmed.
- ACC-02: Enterprise accounts are provisioned by the platform, belong to one workspace and one role, and cannot log into other workspaces. Google/Facebook/GitHub login is outside the discussed scope.
- ACC-03: Usernames follow `username@workspace.fg`, for example `admin@nhanhoa.fg`. This is an internal identifier, not necessarily a real mailbox. Personal email/contact addresses for receiving account information are stored separately.
- ACC-04: Users must change their password at first login before use. Secure activation delivery, expiry and account recovery need separate design; sending plaintext passwords by email has not been agreed.
- ACC-05: The backend checks identity, workspace, role, plan and object scope. Do not infer permissions from username suffixes, subdomains or UI button states.
- ACC-06: Platform Admin and Staff accounts belong to the platform. Do not infer from SME account rules that each needs a separate account in customer workspaces; Staff work in the platform portal.

### 4.2 Confirmed business permission matrix

“Pending confirmation” is not a default permission. The SRS must specify read/write permissions per object before the relevant implementation.

| Activity | Platform Admin | Implementation Staff | SME Admin | Operator | Investigator |
| --- | --- | --- | --- | --- | --- |
| Manage enterprises, workspaces and Staff assignments | Administer | View assigned scope | Own workspace | No | No |
| Manage plan catalogue, pricing and enterprise terms | Administer | No | View own plan | No administration | No administration |
| Upload onboarding specifications | Yes | Yes, as assigned | Yes, own workspace | Pending confirmation | No |
| Analyze, map, configure rules and run tests | Track progress; no direct implementation | Perform as assigned | Coordinate confirmation; no self-configuration | No | No |
| Request / confirm handover | Monitor | Request | Confirm acceptance | No | No |
| Manage enterprise members | Detailed administrative scope pending confirmation | No | Yes | No | No |
| View production data and investigation reports | No | No | Overview/reports as permitted | Operate within workspace | Only data related to assigned cases |
| Open cases, investigate directly or assign | No | No | No involvement in handling | Yes, subject to plan entitlement | Cannot open/assign; receives assigned cases |
| Prepare investigation reports | No | No | View reports | Yes, when investigating directly | Yes, assigned cases |
| Confirm final conclusions | No | No | No | Yes | No |
| View sensitive fields in plaintext | No | No | Pending separate confirmation | Subject to permission and object scope | Subject to permission and assigned case |

Platform Admin has full CRUD rights within platform administration; this does not grant rights to read/edit enterprise transactions or investigation reports. Deletion of enterprises, workspaces and accounts with history needs a separate lifecycle policy; cascading deletion must not be inferred as permitted.

## 5. Onboarding and handover

### 5.1 Confirmed workflow

1. Customers contact the team from the landing page and indicate a plan of interest; their needs may still change after consultation.
2. Platform Admin creates enterprise information, a workspace and an SME Admin account; access information is sent to the contact email.
3. SME Admin changes the initial password, enters the onboarding UI directly and sees the workspace being implemented. They may upload specifications and track progress, but cannot yet operate in production.
4. Platform Admin assigns Staff. Staff work on the workspace object in the platform portal, rather than logging into the customer's subdomain.
5. Staff and the enterprise confirm specifications, fields, mappings and detection conditions; documents may be received outside the system and uploaded by Admin/Staff on the customer's behalf. Specification files are for humans to read/analyze; automatic AI analysis is not assumed.
6. Staff use customer-provided or self-created samples to check mapping and detection.
7. Humans assess that the configuration is satisfactory; Staff request handover.
8. The workspace enters operation when SME Admin confirms acceptance. If it is not satisfactory, SME Admin records requests for additions, which Staff address before requesting handover again.
9. Staff continue supporting configuration changes after handover; enterprises cannot edit mappings/rules themselves.

- ONB-01: Record the actor, time and comments at handover steps.
- ONB-02: A Subscription granted during onboarding starts its term only when SME Admin confirms handover and the workspace enters operation.
- ONB-03: Onboarding and plan entitlement are independent conditions; granting a Subscription does not bypass handover.
- ONB-04: Staff may process specifications/samples for onboarding, but cannot view production transactions.

### 5.2 Proposed states for the SRS/SDD

`Implementation in progress → Awaiting handover confirmation → Operational`.

When SME Admin requests additions: `Awaiting handover confirmation → Implementation in progress`. These state names are proposals; enums, workspace suspension and the configuration-change release process after handover are not finalized.

## 6. Fields, mappings and the three ingestion channels

### 6.1 Confirmed rules

- ING-01: Support REST API + API key, Webhook and CSV/Excel. V1 has one active format configuration per channel; multiple simultaneous formats within a channel are not yet supported.
- ING-02: Multiple files may be uploaded in the configured format. CSV and Excel belong to the same import channel; do not assume they have two independent mappings.
- ING-03: Field names may differ across the three channels. Staff declare/map them to the same internal field set before configuring rules.
- ING-04: Support custom fields for enterprise domains. Each field has a name, data type, required status and sensitivity classification. Rules may select only declared fields.
- ING-05: Documentation describes transaction fields generically according to workspace configuration, including types, required status and conversions. The team has not finalized a mandatory standard field list or shared date/time format; do not turn test sample fields into the product data contract.
- ING-06: Mappings must define type conversions, such as how amounts and date/time values are parsed. Missing required fields or invalid types produce errors and must not undergo detection.
- ING-07: API/Webhook ingestion is event-based; files are processed in batches, row by row. Channels share business logic after normalization, without separate rule sets per channel.
- ING-08: The same normalized data and detection context/version must be evaluated consistently. Do not require identical AI results across runs unless the model contract guarantees that.
- ING-09: Unreadable files or files missing required columns are rejected before processing. For row-level errors, process valid rows and clearly report invalid rows; provide progress, row counts and results per import.

Illustrative example, not an API contract:

| Internal field | REST API | Webhook | CSV/Excel |
| --- | --- | --- | --- |
| Transaction identifier | `payment_id` | `data.txn_id` | `Payment identifier` |
| Amount | `total` | `data.amount` | `Total amount` |
| Transaction time | `paid_at` | `data.timestamp` | `Payment date` |
| Device type, custom field | `device_type` | `data.device` | `Device` |

### 6.2 Duplicate transactions and conflicts

**Confirmed:** transaction identifiers are checked within a workspace across all three channels. Do not create additional transactions/alerts merely because the same transaction is resent through another channel. Concurrent requests must also be handled; UI-only checking is insufficient.

| Scenario | Target behavior |
| --- | --- |
| New ID | Accept and run detection according to the plan |
| Existing ID, equivalent normalized data | Record a duplicate submission; do not create another transaction or detection attempt merely due to resubmission |
| Existing ID, different content | Report a conflict; do not silently overwrite or treat the new submission as an independent transaction |

**Proposal requiring explicit confirmation:** Operators may select individual conflicting submissions to “Test the resubmitted version”, view field differences and detection results, without replacing the original or creating production alerts/cases. Returning later to run a test requires protected temporary storage of the conflicting submission; retention, permissions and AI entitlement for this action are not finalized.

- The definition of “equivalent” after normalization, compared fields and interaction with mapping changes need design. Do not treat submission channel/receipt time as transaction content differences.
- Rerunning after AI fallback is another processing attempt for a stored transaction, not a new transaction; it must not be blocked simply because the ID is the same.
- There is no workflow yet for correcting accepted transactions. Two sources assigning the same ID to different transactions must be addressed in the transaction identifier contract, rather than ignored.

## 7. Rule Engine

**Confirmed:** v1 evaluates conditions on individual transactions, supports standard and custom fields, and does not allow arbitrary code execution. Staff configure names, descriptions, conditions and rule enable/disable settings. Transactions are evaluated against all active rules in the workspace.

| Type / scenario | v1 operations |
| --- | --- |
| Numbers, date/time | Equal, not equal, greater than, less than, greater than or equal, less than or equal |
| Strings | Equal, not equal, in list, not in list |
| Boolean | True / false |
| Empty values | Has value / has no value |
| Multiple conditions | AND or OR within one rule, without multilevel nesting yet |

- RUL-01: Empty optional fields cause ordinary comparisons to return no match, including “not equal” and “not in list”. Detecting empty values requires a dedicated condition.
- RUL-02: A transaction matching multiple rules creates one Rule Alert containing all matching rules/reasons, rather than one alert per rule.
- RUL-03: Rule explanations include the name, description and actual matched conditions; they must not disclose sensitive fields without permission.
- RUL-04: Rule Alerts support viewing, monitoring flags and history lookup; investigation cases cannot be opened from Rule Alerts.
- RUL-05: Do not assign risk or severity to rules on your own. Frequency/history-based rules are outside v1 and must not be assumed to be supported by AI either.

The SRS needs to specify string case sensitivity, empty-value definitions, timezones/numeric precision and rule/mapping version management. Do not choose defaults that change business meaning.

## 8. Configuration testing

### 8.1 Confirmed

- TST-01: Assigned Platform Staff run tests; JSON for API/Webhook and CSV/Excel for the file channel.
- TST-02: Use the same mapping, validation and Rule Engine logic as production. Testing does not mean bypassing data checks.
- TST-03: Display errors or normal/abnormal results, with matched rules, conditions and descriptions.
- TST-04: Do not create production transactions, alerts, cases, training feedback or statistics.
- TST-05: Do not retain test files/payloads long-term. Data is processed temporarily, cleaned up afterward and not logged in plaintext.
- TST-06: Retain only an audit trail: runner, time, configuration version and result/error counts; do not retain sample transaction content in that trail.
- TST-07: Humans assess satisfactory/unsatisfactory results; test completion must not trigger automatic handover.

### 8.2 Design needed

Temporary-file cleanup timing, failed-job handling, file size, timeouts, result formats and configuration version references. Customer specification documents retained for onboarding differ from test sample files; do not apply test-file deletion rules to all specification documents.

## 9. Free, Subscription and the plan catalogue

### 9.1 Confirmed entitlements and lifecycle

| Rule | Free | Subscription |
| --- | --- | --- |
| Term | Unlimited | 1 month or 1 year |
| Detection for new transactions | Rule Engine | AI; rule fallback when AI fails |
| Alerts | Rule Alert | AI Alert, or Rule Alert during fallback |
| Open cases from AI Alerts | No | Operator decides whether to open |
| Mapping/rule configuration | Staff-assisted | Staff-assisted |
| v1 payments | None | Platform Admin grants/renews manually |

- PLN-01: Plans apply per workspace; roles and object scope are still checked separately.
- PLN-02: The landing-page selection expresses initial needs. Platform Admin may change the plan as agreed, activate, renew and adjust its term.
- PLN-03: A Subscription granted during onboarding starts its term when SME Admin confirms handover. An upgrade for an operational workspace starts on successful activation.
- PLN-04: Renewal while active extends the current expiry date; after expiry, the term starts on reactivation. Use calendar months/years; if the corresponding day does not exist, use the last day of the month.
- PLN-05: On expiry or early downgrade to Free by Admin: new transactions use rules, and no new cases may be opened, including from old AI Alerts. Existing cases may continue to investigation completion; old history/reports remain accessible according to permissions.
- PLN-06: AI unavailability does not remove the enterprise's Subscription. Use fallback and record the detection source.
- PLN-07: Enforce entitlements in the backend and processing flows, rather than only hiding UI. Direct API calls to open cases on Free must still be rejected.
- PLN-08: SME Admin self-purchase/term selection/payment is a post-v1 direction; do not create fake payment workflows in production.

### 9.2 Confirmed plan catalogue administration

- Platform Admin creates/views/edits plan information, names, descriptions, monthly/yearly prices and availability status.
- V1 keeps two fixed entitlement sets: Free/Subscription. Creating a plan record does not create a new entitlement type. Editing feature descriptions must not automatically change backend permissions.
- New prices apply to the next grant/renewal; retain the price at grant/renewal time so history does not change. Specific prices, currency and taxes are not finalized; do not use reference-image prices as product prices.
- Unused plans may be deleted; plans with usage history may only be discontinued. On discontinuation, existing users keep entitlements until expiry, and the plan cannot be newly granted or renewed.
- Record who changed what and when. Platform Admin still cannot view customer investigation data.
- The enterprise UI has plan comparison cards, term-based prices and a “Current plan” status; there is no online payment step yet.

Design needed: exact expiry/timezone boundaries, requests in progress during downgrades, duplicate grants/concurrent renewals, plans discontinued during onboarding and manual Admin adjustments. Do not assume exceptions may all bypass discontinued status.

## 10. AI, fallback and feedback

### 10.1 Confirmed

- AIM-01: Classification targets normal/abnormal, which is not equivalent to legitimate/fraudulent.
- AIM-02: Subscription uses AI as the primary path, without running rules simultaneously under normal conditions; rules are used when AI is unavailable.
- AIM-03: Anomalies create AI Alerts. Cases are not created automatically; the Operator reviews and decides whether to open one.
- AIM-04: Transactions processed by rule fallback during AI failure are reanalyzed after AI recovery if the transaction time falls within a valid Subscription period. Reanalysis remains allowed after the current plan has expired; distinguish processing attempts, do not overwrite old sources/results and do not bypass the conditions for opening new cases.
- AIM-05: A business outcome of “abnormal but legitimate” does not automatically mean the AI was wrong. Distinguish business conclusions from model evaluation labels.
- AIM-06: Retain investigation results as a potential feedback source. There is no commitment to automatic retraining or production deployment of a new model after confirmation.

### 10.2 Awaiting the AI team

- Dataset, features, algorithms, metrics and evidence of detecting scenarios missed by rules.
- Request/response contract, features and model/service version information. The confirmed output is Normal/Anomaly with version; confidence, explanation/evidence and risk scores are not required.
- Timeouts, retries, fallback triggers and batch inference.
- Recovery reanalysis policy still needs agreement: scheduling/rerun mechanism, creation/reconciliation of AI Alerts after fallback Rule Alerts and duplicate-alert prevention. Entitlement based on transaction time is confirmed in AIM-04 and does not depend on current plan expiry.
- Sensitive-field usage and conversion of conclusions into evaluation/training labels.

Plan entitlements and workflows can be tested with a controlled simulated adapter without waiting for the model. A shared contract must be agreed before frontend/backend integration with real AI; consumers must not invent endpoints or assume schemas.

## 11. Alerts, cases and investigation

### 11.1 Confirmed

- CAS-01: Rule Alerts are only for monitoring/flagging/lookup, not investigation. Operators review AI Alerts to open cases.
- CAS-02: A case may handle one or more related alerts/transactions within the workspace; link details and grouping conditions still need design.
- CAS-03: Operators may investigate, prepare reports and confirm conclusions themselves; enterprises with limited staff do not need a second person.
- CAS-04: Operators may assign an Investigator. Investigators access only assigned cases and data needed for them, and submit reports; the Operator gives final confirmation.
- CAS-05: SME Admin views overviews/reports without directly participating in handling. All handling steps need history for enterprise lookup.
- CAS-06: On loss of Subscription, allow completion of existing cases under PLN-05; do not allow new cases by renaming the action.

### 11.2 Proposed, not fully confirmed

- States: `Under investigation → Awaiting Operator confirmation → Closed`. Requests for additions by the Operator return the case to investigation; assignment is a separate attribute/history, without a new state for every reassignment.
- Allow Operators to reopen closed cases with a mandatory reason; preserve old reports/conclusions and add new history. Reopening rights after Subscription expiry need agreement.
- Suggested conclusions: confirmed fraud, abnormal but legitimate, false alert, insufficient evidence. Official definitions and enums are needed; insufficient evidence must not automatically become a training label.
- Cases with multiple transactions need verification results per transaction for accurate feedback; do not apply one label to all transactions merely because they share a case.
- Whether an alert may belong to multiple cases is not finalized; no workflow exists yet for merging/splitting existing cases. Do not infer these features from “grouping alerts into a case”.

## 12. API keys and Webhooks

### 12.1 Confirmed API key rules

- KEY-01: The platform issues keys for customer systems to submit data; these differ from login accounts.
- KEY-02: Assigned Staff issue keys; SME Admin receives them and forwards them to the integration contact. A key is bound to a workspace and submission permission, without data-read or investigation access.
- KEY-03: Display the full key only once at issuance; store verification information, with no feature to retrieve old keys. Do not put keys in logs or the repository.
- KEY-04: Revocation stops acceptance immediately. For replacement: issue a new key, have the customer update/test, then revoke the old key; two keys are allowed during transition.

### 12.2 Proposed Webhook direction for confirmation in the integration contract

The user agreed to follow the development team's proposal; the details below are a proposed design, not a contract approved by both parties:

- HTTPS and a separate connection secret, distinct from the REST API key.
- HMAC-SHA256 covering the event ID, timestamp and raw body; authenticate before mapping/processing. Protect the HMAC verification secret through secret management; do not mistakenly apply REST API key hash-only storage, because the server needs the secret to compute HMAC.
- Check timestamps within an allowed window and event IDs per connection to limit replay; event IDs differ from transaction IDs. Sign both timestamp and event ID; do not trust unauthenticated headers.
- Valid retries must not be successfully processed twice; previous failures still need a safe retry path. Do not mark completion merely because the request was received.
- Persist receipt durably before acknowledging success according to the contract; the specific mechanism is not finalized. After authentication, cross-channel transaction deduplication still applies.
- Direct third-party integrations must support the provider's signature scheme; do not assume providers use the FraudGuard contract.

Design references: [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md), [GitHub signature verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). Replay windows, event ID retention, retry/backoff, error responses and secret rotation are not finalized.

## 13. Sensitive data protection

### 13.1 Confirmed requirements

- SEC-01: Both standard and custom fields may be sensitive. UI-only masking is insufficient; list/detail APIs must not return sensitive plaintext by default.
- SEC-02: Viewing plaintext is a separate action: the backend checks workspace, role and object/case permissions, then returns only permitted fields; record access history without decrypted values.
- SEC-03: Platform Admin and Staff cannot view production plaintext. Investigators may view it only for assigned cases. SME Admin plaintext access needs separate confirmation, rather than being inferred from administrative rights.
- SEC-04: Apply protection to mapped data, original payloads/files, test data, errors, logs, notifications and exports. Do not leave plaintext elsewhere while protecting only the main table.
- SEC-05: Customers send data needed for detection through HTTPS. Masking before submission loses information; masking outgoing API responses differs from protecting ingestion transport.

### 13.2 Proposed technical approach

The initial requirement was hashing; it was later clarified that data must be recoverable for investigation. Since hashing is irreversible, backend encryption with decryption authorization is proposed for recoverable fields. Subsequent discussion confirmed API-level protection; library choices, key management and detailed permissions require review during SDD work.

- Use authenticated encryption such as AES-GCM through standard libraries; version data keys per workspace, keep protecting keys separate from the database/repository and use an appropriate key service in production.
- HMAC may be added for identifiers requiring matching. Do not hash amounts/timestamps and expect calculations and comparisons to remain possible. HMAC does not automatically make data fully anonymous.
- Account passwords use dedicated password hashing; do not use the same mechanism as business data encryption.
- Define key lifecycle, rotation, backup/recovery and lost-key handling. Do not invent algorithms.
- Precise commitment: only authorized enterprise users may view plaintext through the application. The backend still has the technical ability to decrypt for detection; do not describe this as an architecture in which the platform cannot decrypt.

References: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), [OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet), [Google Cloud pseudonymization](https://docs.cloud.google.com/sensitive-data-protection/docs/pseudonymization).

## 14. Acceptance criteria for developing test cases

These describe target behavior, not executed test results. Each test needs seed data, preconditions, execution steps and specific pass/fail results when incorporated into the Test Plan.

| ID | Scenario | Result to verify | Rules |
| --- | --- | --- | --- |
| AC-01 | A workspace A account accesses workspace B through a direct API call | Rejected without disclosing B's data | ACC-02, ACC-05 |
| AC-02 | An account that has not changed its initial password calls an operational feature | Blocked until password change is completed | ACC-04 |
| AC-03 | A workspace has a Subscription before handover | Production remains unavailable; the term does not run during onboarding | ONB-02, ONB-03 |
| AC-04 | Staff request handover, SME Admin requests additions, then confirms on a later attempt | History is retained; only acceptance confirmation enables operation | Section 5 |
| AC-05 | The same valid transaction passes through each corresponding mapping | Normalizes to the same meaning; test each channel independently without duplicate-data interference | ING-03, ING-07 |
| AC-06 | Two channels submit the same ID and content concurrently | One production transaction; no duplicate detection/alerts due to repeated ingestion | Section 6.2 |
| AC-07 | Missing required field / invalid type | Clear errors; no detection on invalid data | ING-06 |
| AC-08 | File contains valid and invalid rows | Valid rows are processed; errors are identified by row | ING-09 |
| AC-09 | File lacks a required column | File rejected before processing | ING-09 |
| AC-10 | Empty optional field with “not equal to X” condition | No match; only “has no value” matches | RUL-01 |
| AC-11 | A transaction matches 5 rules while another rule is disabled | One Rule Alert with 5 reasons; disabled rule does not participate | RUL-02, section 7 |
| AC-12 | Staff test a sample capable of triggering an alert | Results/reasons are shown; no production data is created; audit trail contains no sample data | TST-01..07 |
| AC-13 | Free directly calls the open-case API | Backend rejects it even if the UI/request is modified | PLN-07 |
| AC-14 | Subscription receives an AI Alert | No automatic case opening; Operator decides | AIM-03 |
| AC-15 | Investigator accesses an unassigned case | Rejected even if the workspace has a Subscription | CAS-04 |
| AC-16 | Expiry or early Admin downgrade | Rules for new transactions; no new cases; complete old cases and view history as permitted | PLN-05 |
| AC-17 | Renewal before/after expiry and at month-end | Correct boundaries under PLN-03/04; test timezones once agreed | PLN-03, PLN-04 |
| AC-18 | Admin changes prices or discontinues a plan with existing users | Price history unchanged; active entitlements preserved; discontinued plan cannot be renewed | Section 9.2 |
| AC-19 | AI fails, then recovers | Fallback source recorded; recovery reanalysis creates no new transaction and does not overwrite old results | AIM-02, AIM-04 |
| AC-20 | Key revoked or submitted to another workspace | Rejected; the new key works in the correct workspace during transition | KEY-02..04 |
| AC-21 | Default API returns a transaction with sensitive fields | Response contains no plaintext, including fields hidden in the UI | SEC-01 |
| AC-22 | Unauthorized user calls the plaintext-view API | Rejected; authorized users see only permitted objects, with an audit trail | SEC-02, SEC-03 |

Tests for conflicts/testing new submissions, case reopening and Webhooks must be added after the relevant designs are finalized; do not mark them as accepted.

## 15. Inputs to ERD, SRS and SDD

### 15.1 Data concepts to consider

This is a list of business concepts, not a requirement for one table per row or an approved schema:

| Group | Concepts / relationships to represent |
| --- | --- |
| Customers | Enterprise, workspace, account/role; distinguish platform accounts from SME accounts |
| Implementation | Staff assignment, specifications, progress, handover requests, confirmation/requests for additions |
| Configuration | Internal fields, sensitivity classification, channel mappings, rule sets, conditions, version references |
| Testing | Runs and metrics/audit trails; no long-term sample retention |
| Ingestion | Transactions, workspace-scoped business identifiers, channels/ingestion attempts, batches and row errors |
| Detection | A transaction may have multiple processing attempts, such as fallback then AI; sources and versions must not be lost |
| Investigation | Alerts, cases, alert/transaction links, assignment, reports, conclusions, history; feedback labels need agreement |
| Plans | Plan catalogue, term prices, fixed v1 entitlements, grants/renewals and adjustment history |
| Integration/security | API keys, Webhook connections, event processing states, encryption key references, audit |

### 15.2 Next documentation work

1. SRS: convert rules into FRs by actor, preconditions, main/exception flows and acceptance criteria; define NFRs with metrics/thresholds/measurement methods.
2. ERD: agree identifiers, cardinality, tenant scope, history and retention; do not add entities from the proposed list before they are needed.
3. SDD: describe module boundaries, API contracts, transaction boundaries, concurrency handling, background jobs, idempotency and key management.
4. Test Plan: link FR → workflow → test case; include direct API authorization, submission-channel errors, plan expiry and response protection.
5. Allocation: the team has divided workflows, but details were not provided in the discussion; do not assign member names/owners on your own. Each workflow needs a team-confirmed owner.

Do not claim that new rules in this document already match the code. A separate comparison must state what exists, is missing, differs, and remains only demo/stub behavior.

## 16. Open decisions

| ID | Decision needed | Impact |
| --- | --- | --- |
| OPEN-01 | Required fields; empty-value definitions, types/formats, timezones, unique transaction identifiers | Mapping, validation, ERD |
| OPEN-02 | Mapping and rule release/versioning; old data after configuration changes | Traceability, consistency |
| OPEN-03 | Testing conflicting submissions, permissions, temporary storage/retention and comparison | Ingestion, UI, security |
| OPEN-04 | Case states, reopening, alert grouping, per-transaction conclusions | ERD, permissions, feedback |
| OPEN-05 | AI inputs/outputs, dataset/features, timeouts, recovery reanalysis and labels | AI integration and evaluation |
| OPEN-06 | Specific Webhook authentication, timestamp windows, retries, event retention, secret rotation | Contract and operations |
| OPEN-07 | Sensitive-field list, plaintext viewers, keys/backup/retention | Security SDD |
| OPEN-08 | Account activation/recovery, account locking and administrative data-deletion policy | IAM and data lifecycle |
| OPEN-09 | Realtime/batch performance, upload limits, system load, storage, backup/recovery | Measurable NFRs |
| OPEN-10 | Dashboard, report, export, in-app/email and platform monitoring details | Required by proposal, not yet analyzed in detail |
| OPEN-11 | Exact expiry boundaries, in-flight requests, concurrent grants/renewals and plan exceptions | Subscription lifecycle |

## 17. Compare with the proposal before releasing official documentation

| Topic | Treatment |
| --- | --- |
| Risk Score Gateway and 0–100 scores | BM03 already describes removing the shared mechanism; do not reintroduce it into the software |
| AI confidence, explanation/evidence | Still required by the proposal; awaiting AI review, removal not confirmed |
| Dynamic rules, onboarding and configuration | Elaborate in the SRS; do not assume all demo UI behavior is approved scope |
| Plans/pricing, subdomains, data-viewing rights and handover | Detailed decisions from discussion; trace to FRs and review with the team |
| AI recovery reanalysis, conflict testing, case reopening | Distinguish confirmed decisions from proposals in each section; assess scope impact |
| AI detects cases missed by rules | A goal requiring experimental evidence, not a proven result |

The original proposal and review forms were not modified in this consolidation. This document does not replace the BM02 self-review using the standard prompt or prove that the repository is ready for a review-2 tag.
