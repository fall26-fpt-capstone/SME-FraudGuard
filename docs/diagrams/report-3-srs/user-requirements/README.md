# Report 3 user requirement diagrams

Section 2 of the current Report 3 uses one overall diagram (`exports/overall-use-cases.svg` and `.png`) and one native catalogue table for UC-01–UC-42. Its subsections are 2.2.1 Diagram(s) and 2.2.2 Descriptions.

`overall-catalogue.json` records the 42 IDs, names and participating actors. `render_overall.py` generates the semantic PlantUML source and the SVG with fixed, staggered positions. The SVG is the layout source for the report image; rendering the PlantUML source with an automatic layout engine will produce a different arrangement.

## Sources and decisions

- Scope: Registration v2 and BM03 in `docs/01_Registration/`.
- Detailed rules: `docs/02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md`, subject to the following later team decisions.
- Both SME Admin and Operator import production CSV/Excel files.
- Handover: Staff confirms readiness, Platform Admin approves, SME Admin activates the workspace. An onboarding Subscription starts at activation.
- Platform Admin or assigned Staff issues API keys; SME Admin can disable its workspace keys.
- Platform Admin allocates the initial plan. After activation, only SME Admin purchases/renews Subscription online; Payment Gateway provides verified payment confirmation.
- AI outputs Normal/Anomaly and model/service version. Detection source is retained. No AI confidence, explanation or common risk score is required.
- The prior manual-only payment workflow and direct Staff-to-SME handover description in the working spec are superseded by these decisions.

## Notation

Human roles, Customer Transaction System and Payment Gateway are actors. Portal User is an abstract shorthand for the five human roles in UC-01–UC-03; it is not an additional account role. Every actor symbol appears once, outside the left or right side of the system boundary. Solid straight associations meet the left/right extremities of use-case ellipses. Dashed include arrows use the same endpoint convention and point to mandatory shared processing on the successful path. Their six paths do not cross one another. Crossings of other associations do not imply a connection; a narrow white separation keeps those crossings distinct. Internal AI/Rule Engine/database components are not actors.

## Overall figure

The report uses `overall-use-cases.puml`, `exports/overall-use-cases.svg` and `exports/overall-use-cases.png` as Figure 3.2. All 42 use cases, 59 actor associations and six include relationships are retained. Only this overall figure and its source/catalogue/renderer are kept.

## Traceability

| ID | Use case | Source rule / decision |
| --- | --- |
| UC-01 | Log In | ACC-02..06 |
| UC-02 | Change Password | ACC-02..05 |
| UC-03 | Log Out | Proposal module 1 |
| UC-04 | Manage Customers and Workspaces | ACC-01..06; onboarding 5.1 |
| UC-05 | Assign Implementation Staff | ACC-06; ONB-04 |
| UC-06 | Manage Plan Catalogue | Spec 9.2 |
| UC-07 | Grant Initial Workspace Plan | PLN-01..03; latest team decision |
| UC-08 | View Plans and Subscription | PLN-01,05,08; latest team decision |
| UC-09 | Manage Enterprise Members | ACC-02,05; spec 4.2 |
| UC-10 | Submit Onboarding Specifications | Spec 4.2; onboarding 5.1 |
| UC-11 | Track Onboarding Progress | ONB-01..04; latest team decision |
| UC-12 | Configure Fields and Channel Mappings | ING-01..08; SEC-01; spec 5.1 |
| UC-13 | Configure Detection Rules | RUL-01..05; spec 7 |
| UC-14 | Test Detection Configuration | TST-01..07; AC-12 |
| UC-15 | Confirm Implementation Readiness | Latest team handover decision; ONB-01,04 |
| UC-16 | Approve Workspace Handover | Latest team handover decision |
| UC-17 | Activate Workspace | Latest team handover decision; ONB-02,03 |
| UC-18 | Issue or Replace API Key | KEY-01..04; latest team key decision |
| UC-19 | Disable API Key | KEY-02..04; latest team key decision |
| UC-20 | Submit Transactions through REST API | ING-01..09; KEY-01..04; AC-05..07 |
| UC-21 | Submit Transactions through Webhook | ING-01..09; spec 12.2 |
| UC-22 | Import Production Transactions | Latest team upload decision; ING-02,07,09 |
| UC-23 | Review Import Results | ING-09; spec 6.2; latest team upload decision |
| UC-24 | Review Production Transactions | ACC-05; SEC-01..04; CAS-04 |
| UC-25 | Review Rule Alerts | RUL-02..05; CAS-01 |
| UC-26 | Review AI Alerts | Proposal module 4; AIM-01..03 |
| UC-27 | Open Investigation Case | CAS-01,02; AIM-03; PLN-05,07 |
| UC-28 | Assign Investigation Case | CAS-03,04; ACC-05 |
| UC-29 | Investigate Case | CAS-03..06; PLN-05; SEC-02,03 |
| UC-30 | Submit Investigation Report | CAS-03..05; AIM-05,06 |
| UC-31 | Confirm Investigation Conclusion | CAS-03..05; AIM-05,06 |
| UC-32 | View Investigation Reports | CAS-04..06; PLN-05 |
| UC-33 | View Enterprise Dashboard | Proposal module 6; spec 4.2; SEC-01..04 |
| UC-34 | Generate and Export Reports | Proposal module 6; SEC-04 |
| UC-35 | Receive Relevant Notifications | Proposal module 6; SEC-04 |
| UC-36 | Monitor Platform Operations | Proposal module 6; spec 4.2; SEC-03 |
| UC-37 | View Authorized Sensitive Fields | SEC-01..05; AC-21,22 |
| UC-38 | Review Detection History | AIM-02..04; spec 6.2,10.2 |
| UC-39 | Purchase or Renew Subscription | Latest team payment decision; PLN-03,04; spec 9.2 |
| UC-40 | Process Payment Confirmation | Latest team payment decision |
| UC-41 | Validate and Normalize Submitted Data | ING-03..09; spec 6.2; TST-02 |
| UC-42 | Detect Transaction Anomalies | RUL-01..05; AIM-01..06; proposal module 4 |

## Render and verify

Generate the overall SVG and semantic PlantUML using Python's standard library:

```powershell
python render_overall.py
```

The generator checks catalogue completeness, unique actor symbols, actor placement on the two sides, absence of lines through unrelated ellipses, and absence of crossings between include relationships. Export this SVG to PNG at 4000 px width using an SVG-capable browser or editor. The PNG export was rendered with Edge. Keep the aspect ratio when inserting it into Google Docs. Inspect the rendered image and the PDF page, since geometric checks do not prove that text is readable at report scale.

Uploaded Google Docs images do not refresh when local files change.

The catalogue deliberately does not invent case-status enums, case reopening/merging, conflict-sandbox retention, a payment provider, refund/automatic-recurring-payment workflows, AI features or model evaluation metrics. Those need separate detailed decisions where required. Payment Gateway is a newly confirmed external integration; the previously finalized context figure has not been changed in this task.
