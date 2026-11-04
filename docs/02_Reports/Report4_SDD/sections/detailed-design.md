# 3. Detailed Design

This section presents the target detailed design derived from Report 3 functional requirements, Sections 3.2-3.15. Class diagrams identify controllers/listeners, service interfaces and implementations, repositories, DTOs and domain types. Sequence diagrams use the same class names and operations, with explicit calls, returns, activation bars and repository/database interactions. These proposed design signatures are not claims of implemented Java classes or approved HTTP routes; cross-module calls use public APIs/ports within the modular monolith.

All operations enforce current identity, role, workspace and object/assignment scope on the backend. Integration authentication establishes workspace scope before mapping or acceptance. Sensitive values remain protected in ordinary results and diagnostics; required writes retain history atomically. The headings named State Diagram follow the supplied reference: their figures use processing activities, decision diamonds, guarded branches and start/end nodes. Exact external wire formats, upload limits, timeout values and retry schedules remain subject to their confirmed interface specifications.

## 3.1 Authentication and Account Access

SRS reference: 3.2.1-3.2.4. Sessions bind verified identity to platform or enterprise scope. Mandatory initial password change restricts access until saved; logout ends authorization without deleting business history.

### 3.1.1 Class Diagram

![01-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/01-class-01.png)

Figure 4.3.1.1.1. Authentication and Account Access Class Diagram.

### 3.1.2 Sequence Diagrams

![01-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/01-sequence-01.png)

Figure 4.3.1.2.1. Log In and Select the Permitted Destination Sequence Diagram.

![01-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/01-sequence-02.png)

Figure 4.3.1.2.2. Complete Mandatory Initial Password Change Sequence Diagram.

![01-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/01-sequence-03.png)

Figure 4.3.1.2.3. Change Current Password Sequence Diagram.

![01-sequence-04](../../../diagrams/report-4-sdd/detailed-design/exports/01-sequence-04.png)

Figure 4.3.1.2.4. Log Out and Reject the Ended Session Sequence Diagram.

### 3.1.3 State Diagrams

![01-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/01-state-01.png)

Figure 4.3.1.3.1. Authenticated Session Lifecycle State Diagram.

## 3.2 Customer and Workspace Management

SRS reference: 3.3.1-3.3.4. Platform Admin provisions one workspace per enterprise and its initial SME Admin. Staff accesses assigned setup metadata only; assignment changes never grant production-data access.

### 3.2.1 Class Diagram

![02-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/02-class-01.png)

Figure 4.3.2.1.1. Customer and Workspace Management Class Diagram.

### 3.2.2 Sequence Diagrams

![02-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/02-sequence-01.png)

Figure 4.3.2.2.1. List, Inspect and Update Administrative Workspace Information Sequence Diagram.

![02-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/02-sequence-02.png)

Figure 4.3.2.2.2. Provision Enterprise, Workspace and Initial SME Admin Sequence Diagram.

![02-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/02-sequence-03.png)

Figure 4.3.2.2.3. Add or Remove Concurrent Implementation Staff Assignments Sequence Diagram.

## 3.3 Plan and Subscription Management

SRS reference: 3.4.1-3.4.7. Free and Subscription have fixed entitlements. Purchases retain quotes and only verified server-side payment applies rights once. Calendar validity uses Asia/Ho_Chi_Minh, UTC storage and [start, expiry).

### 3.3.1 Class Diagram

![03-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/03-class-01.png)

Figure 4.3.3.1.1. Plan and Subscription Management Class Diagram.

### 3.3.2 Sequence Diagrams

![03-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/03-sequence-01.png)

Figure 4.3.3.2.1. Review and Maintain Plan Offers Sequence Diagram.

![03-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/03-sequence-02.png)

Figure 4.3.3.2.2. Grant the Initial Workspace Plan Sequence Diagram.

![03-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/03-sequence-03.png)

Figure 4.3.3.2.3. View Subscription and Initiate Purchase or Renewal Sequence Diagram.

![03-sequence-04](../../../diagrams/report-4-sdd/detailed-design/exports/03-sequence-04.png)

Figure 4.3.3.2.4. Verify Payment and Apply One Calendar Entitlement Effect Sequence Diagram.

![03-sequence-05](../../../diagrams/report-4-sdd/detailed-design/exports/03-sequence-05.png)

Figure 4.3.3.2.5. Enforce Expiry at New Operations and Preserve Existing Work Sequence Diagram.

### 3.3.3 State Diagrams

![03-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/03-state-01.png)

Figure 4.3.3.3.1. Subscription Entitlement Lifecycle State Diagram.

![03-state-02](../../../diagrams/report-4-sdd/detailed-design/exports/03-state-02.png)

Figure 4.3.3.3.2. Purchase Verification and Local Entitlement Application State Diagram.

## 3.4 Workspace Onboarding and Activation

SRS reference: 3.5.1-3.5.5. Specifications are retained for human configuration work. Staff readiness, Platform Admin handover approval and SME Admin activation are distinct recorded gates; initial Subscription starts only at activation.

### 3.4.1 Class Diagram

![04-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/04-class-01.png)

Figure 4.3.4.1.1. Workspace Onboarding and Activation Class Diagram.

### 3.4.2 Sequence Diagrams

![04-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/04-sequence-01.png)

Figure 4.3.4.2.1. Maintain Specifications and Track Onboarding Progress Sequence Diagram.

![04-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/04-sequence-02.png)

Figure 4.3.4.2.2. Confirm Implementation Readiness Sequence Diagram.

![04-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/04-sequence-03.png)

Figure 4.3.4.2.3. Approve or Return Workspace Handover Sequence Diagram.

![04-sequence-04](../../../diagrams/report-4-sdd/detailed-design/exports/04-sequence-04.png)

Figure 4.3.4.2.4. Activate Approved Workspace and Start the Initial Term Once Sequence Diagram.

### 3.4.3 State Diagrams

![04-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/04-state-01.png)

Figure 4.3.4.3.1. Workspace Readiness, Handover and Activation Lifecycle State Diagram.

## 3.5 Enterprise Member and Permission Management

SRS reference: 3.6.1-3.6.4. SME Admin manages only own-workspace enterprise accounts and explicit field-view grants. Permission administration does not grant SME Admin plaintext access; history survives role/access changes.

### 3.5.1 Class Diagram

![05-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/05-class-01.png)

Figure 4.3.5.1.1. Enterprise Member and Permission Management Class Diagram.

### 3.5.2 Sequence Diagrams

![05-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/05-sequence-01.png)

Figure 4.3.5.2.1. List, Provision and Update Enterprise Members Sequence Diagram.

![05-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/05-sequence-02.png)

Figure 4.3.5.2.2. Grant or Revoke Explicit Sensitive-Field Viewing Permission Sequence Diagram.

## 3.6 Detection Configuration Management

SRS reference: 3.7.1-3.7.8. Assigned Staff edits a versioned candidate containing fields, channel mappings and rules. Testing uses the exact revision and temporary samples; explicit application atomically changes one active version for newly accepted work.

### 3.6.1 Class Diagram

![06-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/06-class-01.png)

Figure 4.3.6.1.1. Detection Configuration Management Class Diagram.

### 3.6.2 Sequence Diagrams

![06-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/06-sequence-01.png)

Figure 4.3.6.2.1. View and Edit Candidate Fields, Mappings and Rules Sequence Diagram.

![06-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/06-sequence-02.png)

Figure 4.3.6.2.2. Test an Exact Revision and Review Safe Run History Sequence Diagram.

![06-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/06-sequence-03.png)

Figure 4.3.6.2.3. Apply the Tested Candidate Atomically Sequence Diagram.

### 3.6.3 State Diagrams

![06-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/06-state-01.png)

Figure 4.3.6.3.1. Candidate Configuration Testing and Application Lifecycle State Diagram.

## 3.7 Integration and Transaction Ingestion

SRS reference: 3.8.1-3.8.7. Credentials establish integration workspace scope before mapping. REST, Webhook and production file import share normalization and atomic cross-channel business identity. Acceptance is durable and distinct from detection completion.

### 3.7.1 Class Diagram

![07-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/07-class-01.png)

Figure 4.3.7.1.1. Integration and Transaction Ingestion Class Diagram.

### 3.7.2 Sequence Diagrams

![07-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-01.png)

Figure 4.3.7.2.1. Inspect, Issue, Replace and Disable Workspace API Keys Sequence Diagram.

![07-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-02.png)

Figure 4.3.7.2.2. Submit Production Transactions through REST API Sequence Diagram.

![07-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-03.png)

Figure 4.3.7.2.3. Authenticate Incoming Webhook and Handle Delivery Retries Sequence Diagram.

![07-sequence-04](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-04.png)

Figure 4.3.7.2.4. Import Production CSV/Excel with Reconciled Row Outcomes Sequence Diagram.

![07-sequence-05](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-05.png)

Figure 4.3.7.2.5. Normalize and Validate Declared Channel Values Sequence Diagram.

![07-sequence-06](../../../diagrams/report-4-sdd/detailed-design/exports/07-sequence-06.png)

Figure 4.3.7.2.6. Atomically Resolve Cross-Channel Business Identity and Accept Once Sequence Diagram.

### 3.7.3 State Diagrams

![07-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/07-state-01.png)

Figure 4.3.7.3.1. Workspace API Credential Lifecycle State Diagram.

![07-state-02](../../../diagrams/report-4-sdd/detailed-design/exports/07-state-02.png)

Figure 4.3.7.3.2. Production Import Processing Lifecycle State Diagram.

## 3.8 Rule-Based Detection

SRS reference: 3.9.1-3.9.2. Free primary detection and Subscription fallback evaluate the selected configuration with the same typed semantics. All matching rules form one Rule Alert for the completed attempt; no match is distinct from failure.

### 3.8.1 Class Diagram

![08-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/08-class-01.png)

Figure 4.3.8.1.1. Rule-Based Detection Class Diagram.

### 3.8.2 Sequence Diagrams

![08-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/08-sequence-01.png)

Figure 4.3.8.2.1. Evaluate All Enabled Rules and Create One Aggregated Alert Sequence Diagram.

## 3.9 AI Detection and Rule-Based Fallback

SRS reference: 3.10.1-3.10.3. Subscription primary processing calls AI only. Unusable AI responses trigger rules and retain both attempt sources. Recovery reuses the transaction, checks historical event-time entitlement and preserves earlier alerts and cases.

### 3.9.1 Class Diagram

![09-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/09-class-01.png)

Figure 4.3.9.1.1. AI Detection and Rule-Based Fallback Class Diagram.

### 3.9.2 Sequence Diagrams

![09-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/09-sequence-01.png)

Figure 4.3.9.2.1. Classify Subscription Transaction and Fall Back on Unusable AI Sequence Diagram.

![09-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/09-sequence-02.png)

Figure 4.3.9.2.2. Recover Historically Eligible Fallback Work and Reconcile AI Alerts Sequence Diagram.

### 3.9.3 State Diagrams

![09-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/09-state-01.png)

Figure 4.3.9.3.1. Transaction Detection and Rule-Based Fallback Processing State Diagram.

![09-state-02](../../../diagrams/report-4-sdd/detailed-design/exports/09-state-02.png)

Figure 4.3.9.3.2. Historically Entitled AI Recovery Processing State Diagram.

## 3.10 Transaction and Alert Review

SRS reference: 3.11.1-3.11.6. Operator reviews workspace production transactions, alerts and attempt history. Import results have separate SME Admin/Operator scope. Explicit reveal requires current field grants and, for Investigator, the relevant case assignment.

### 3.10.1 Class Diagram

![10-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/10-class-01.png)

Figure 4.3.10.1.1. Transaction and Alert Review Class Diagram.

### 3.10.2 Sequence Diagrams

![10-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/10-sequence-01.png)

Figure 4.3.10.2.1. Review Transactions and Role-Scoped Import Results Sequence Diagram.

![10-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/10-sequence-02.png)

Figure 4.3.10.2.2. Review Rule/AI Alerts, Follow-Up Flags and Attempt History Sequence Diagram.

![10-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/10-sequence-03.png)

Figure 4.3.10.2.3. Explicitly Reveal Only Currently Authorized Sensitive Fields Sequence Diagram.

## 3.11 Case and Investigation Management

SRS reference: 3.12.1-3.12.7. Only Operator opens cases from same-workspace AI Alerts under current Subscription. Assignment is separate from lifecycle. Existing case work continues after expiry; Operator may investigate, submit and confirm without a second person.

### 3.11.1 Class Diagram

![11-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/11-class-01.png)

Figure 4.3.11.1.1. Case and Investigation Management Class Diagram.

### 3.11.2 Sequence Diagrams

![11-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/11-sequence-01.png)

Figure 4.3.11.2.1. Open One Case from Eligible AI Alert References Sequence Diagram.

![11-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/11-sequence-02.png)

Figure 4.3.11.2.2. View Cases and Assign or Start Self-Investigation Sequence Diagram.

![11-sequence-03](../../../diagrams/report-4-sdd/detailed-design/exports/11-sequence-03.png)

Figure 4.3.11.2.3. Record Findings and Submit an Investigation Report Sequence Diagram.

![11-sequence-04](../../../diagrams/report-4-sdd/detailed-design/exports/11-sequence-04.png)

Figure 4.3.11.2.4. Request Additional Investigation or Confirm the Final Conclusion Sequence Diagram.

### 3.11.3 State Diagrams

![11-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/11-state-01.png)

Figure 4.3.11.3.1. Investigation Case Lifecycle State Diagram.

## 3.12 Dashboard and Reporting

SRS reference: 3.13.1-3.13.4. Aggregates, reports and exports preserve workspace, role, assignment and field restrictions. Generation and download each recheck access; plaintext reveal does not authorize plaintext export.

### 3.12.1 Class Diagram

![12-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/12-class-01.png)

Figure 4.3.12.1.1. Dashboard and Reporting Class Diagram.

### 3.12.2 Sequence Diagrams

![12-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/12-sequence-01.png)

Figure 4.3.12.2.1. View Authorized Dashboard and Investigation Reports Sequence Diagram.

![12-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/12-sequence-02.png)

Figure 4.3.12.2.2. Generate and Export a Complete Authorized Enterprise Report Sequence Diagram.

### 3.12.3 State Diagrams

![12-state-01](../../../diagrams/report-4-sdd/detailed-design/exports/12-state-01.png)

Figure 4.3.12.3.1. Enterprise Report Generation Lifecycle State Diagram.

## 3.13 Notifications

SRS reference: 3.14.1-3.14.2. Relevant enterprise events produce minimal in-app/email content. Recipients and linked records remain scoped; external delivery is retried independently and never reverses or repeats the committed business effect.

### 3.13.1 Class Diagram

![13-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/13-class-01.png)

Figure 4.3.13.1.1. Notifications Class Diagram.

### 3.13.2 Sequence Diagrams

![13-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/13-sequence-01.png)

Figure 4.3.13.2.1. Create and View Relevant In-App Notifications Sequence Diagram.

![13-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/13-sequence-02.png)

Figure 4.3.13.2.2. Send Minimal Email and Retry Delivery Independently Sequence Diagram.

## 3.14 Platform Monitoring and Audit

SRS reference: 3.15.1-3.15.2. Platform Admin sees operational metadata only. Object history follows the underlying administrative, Staff-assignment or enterprise/case scope. Required local change history commits with the business action and excludes values/secrets.

### 3.14.1 Class Diagram

![14-class-01](../../../diagrams/report-4-sdd/detailed-design/exports/14-class-01.png)

Figure 4.3.14.1.1. Platform Monitoring and Audit Class Diagram.

### 3.14.2 Sequence Diagrams

![14-sequence-01](../../../diagrams/report-4-sdd/detailed-design/exports/14-sequence-01.png)

Figure 4.3.14.2.1. Monitor Platform Operations without Production Content Sequence Diagram.

![14-sequence-02](../../../diagrams/report-4-sdd/detailed-design/exports/14-sequence-02.png)

Figure 4.3.14.2.2. Commit Required Audit Attribution and Read Scoped Object History Sequence Diagram.
