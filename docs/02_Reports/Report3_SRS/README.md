# Report 3 - Software Requirements Specification

- [Native working Google Doc](https://docs.google.com/document/d/1HiJnq5W_VxXMD3-4cvueYZQ__frEhbConCEk0zPV54E/edit).
- [Section 3 editable text source](sections/functional-requirements.md).
- [Screen-flow and conceptual ERD sources/exports](../../diagrams/report-3-srs/functional-requirements/README.md).

Section 3 is a working specification of target behaviour, not implementation or test-execution evidence. Its 65 detailed functions cover UC-01 through UC-42. The 14 business groups run from Authentication and Account Access to Platform Monitoring and Audit. UI screen layouts are intentionally blank for later design; the overview still contains planned view descriptions, authorization, non-screen functions and logical relationships.

The current SRS sections 1, 2, 4 and 5 and later confirmed team decisions take precedence over superseded statements in `SOFTWARE_V1_BUSINESS_SPEC.md`. In particular, the current scope includes online Subscription purchase, Staff readiness -> Platform Admin approval -> SME Admin activation, and AI Normal/Anomaly without scores/confidence/explanations.

Confirmed detailed decisions include Open -> Investigating -> Pending Review -> Closed, with requests for additional work returning to Investigating. Conclusions are separate: Confirmed Fraud, Anomalous but Legitimate, False Alert, and Insufficient Evidence. SME Admin grants/revokes explicit field-view permission for Operator/Investigator without receiving plaintext access; Investigator also requires the relevant case assignment.

Multiple Staff may be assigned concurrently. Configuration changes use a candidate draft, testing of the exact revision and explicit Staff application; stale edits/application are rejected. Accepted transactions retain their selected plan/configuration. Calendar Subscription periods use Asia/Ho_Chi_Minh, UTC storage and start-inclusive/expiry-exclusive validity. Recovery AI Anomaly creates/reuses one AI Alert per transaction; prior Rule Alerts, later Normal outcomes and existing cases retain their history.

Technical upload limits, exact Webhook/AI interfaces and credential settings belong to their confirmed interface/deployment specifications; illustrative fixture values are not global contracts.

Keep this source synchronized with scoped changes in the native document. The associated Report 4 data model is provisional. Report 5's UC-based designed tests are not proof of execution and still require detailed FR mapping after section 3 is finalized.
