# Report 4 detailed design diagrams

Section 3 follows Report 3 functional requirements 3.2-3.15: all 65 detailed functions are covered in 14 groups. The 80 monochrome UML figures comprise 14 class diagrams, 43 sequence diagrams, 11 activity diagrams and 12 state machines. Sequence figures group related functions; the catalogue gives exact SRS references for each figure. Activity diagrams describe workflows. The complete report state-machine set covers the object/operation lifecycles listed below. The presentation selects three figures from this full set. Logical stage labels do not prescribe implementation enums; the four case statuses are explicitly defined by the SRS.

- `build_design.py`: source-generation entry point.
- `design_model.json`: editable group, domain and SRS coverage model.
- `technical_design.py`: technical class layout, typed sequence flows, activity diagrams and entity state machines, with coverage/participant consistency assertions.
- `*.puml`: generated editable PlantUML source per figure.
- `catalogue.json`: ordered figures, captions, SRS references and report paragraphs.
- `exports/*.svg`: vector figures for inspection and reuse.
- `exports/*.png`: publication images inserted into Google Docs, preserving aspect ratio.
- [Section 3 text source](../../../02_Reports/Report4_SDD/sections/detailed-design.md).

The reference report's monochrome style is retained: UML class compartments, sequence lifelines and activation bars, and processing activities with decision diamonds and start/end nodes. Each state block contains its name only. State machines use a top-down main flow, explicit initial/final nodes and guarded choice branches instead of tiny self-loop hooks. Their `!pragma layout elk` selects PlantUML's bundled orthogonal layout engine. A final node completes the modeled lifecycle without deleting retained business records. Images and centered numbered captions appear under matching headings, on the same page as their diagrams. Activity files use `*-activity-*.puml`; their figure numbers and image contents remain unchanged. State machines use descriptive filenames. Misleading legacy activity filenames and rejected prototype state sources/exports have been removed; the catalogue identifies the maintained set.

| Lifecycle | Source and exports | SRS basis and final boundary |
| --- | --- | --- |
| Authenticated Session | [PlantUML](01-session-state.puml), [SVG](exports/01-session-state.svg), [PNG](exports/01-session-state.png) | 3.2.1-3.2.4; Ended completes one scoped session, preserving account and business history. |
| Workspace Onboarding | [PlantUML](04-workspace-onboarding-state.puml), [SVG](exports/04-workspace-onboarding-state.svg), [PNG](exports/04-workspace-onboarding-state.png) | 3.3.2 and 3.5.1-3.5.5; completion at Operational ends onboarding, not workspace operation. |
| Subscription Validity Period | [PlantUML](03-subscription-validity-state.puml), [SVG](exports/03-subscription-validity-state.svg), [PNG](exports/03-subscription-validity-state.png) | 3.4.3 and 3.4.5-3.4.7; Expired ends this interval. Pre-expiry renewal extends it; post-expiry activation starts a different interval. |
| Subscription Purchase | [PlantUML](03-subscription-purchase-state.puml), [SVG](exports/03-subscription-purchase-state.svg), [PNG](exports/03-subscription-purchase-state.png) | 3.4.5-3.4.6; verified final payment/application outcomes end handling; paid but locally unapplied purchases remain recoverable. |
| Configuration Candidate | [PlantUML](06-configuration-candidate-state.puml), [SVG](exports/06-configuration-candidate-state.svg), [PNG](exports/06-configuration-candidate-state.png) | 3.7.1-3.7.8; Applied completes promotion of a candidate. Tests bind to its exact revision; edits require new testing. |
| Workspace API Credential | [PlantUML](07-api-credential-state.puml), [SVG](exports/07-api-credential-state.svg), [PNG](exports/07-api-credential-state.png) | 3.8.1-3.8.3; Disabled completes usable-key handling. Rotation creates a separate key and preserves metadata/history. |
| Production Import Batch | [PlantUML](07-production-import-state.puml), [SVG](exports/07-production-import-state.svg), [PNG](exports/07-production-import-state.png) | 3.8.6-3.8.7; complete, row-issue and interrupted run outcomes retain reconciled row progress and safe retry identity. |
| Initial Transaction Detection | [PlantUML](09-initial-detection-state.puml), [SVG](exports/09-initial-detection-state.svg), [PNG](exports/09-initial-detection-state.png) | 3.9.1-3.10.2; Completed/Failed end one initial processing operation, preserving distinct attempt sources and the acceptance-time context. |
| AI Recovery Operation | [PlantUML](09-ai-recovery-state.puml), [SVG](exports/09-ai-recovery-state.svg), [PNG](exports/09-ai-recovery-state.png) | 3.10.3; Completed/Failed/Excluded end this recovery operation on the existing transaction. Historical entitlement and previous alerts/cases remain authoritative. |
| Investigation Case | [PlantUML](11-investigation-case-state.puml), [SVG](exports/11-investigation-case-state.svg), [PNG](exports/11-investigation-case-state.png) | 3.12.1-3.12.7; confirmed Closed ends handling while records remain. Invalid reports and requests for additional work return to Investigating as applicable. |
| Enterprise Report Generation | [PlantUML](12-report-generation-state.puml), [SVG](exports/12-report-generation-state.svg), [PNG](exports/12-report-generation-state.png) | 3.13.3-3.13.4; Available/Failed end generation. Reading/exporting retained results still rechecks current access. |
| Email Delivery Attempt | [PlantUML](13-email-delivery-state.puml), [SVG](exports/13-email-delivery-state.svg), [PNG](exports/13-email-delivery-state.png) | 3.14.2; Sent/Failed end one independent delivery attempt. Retry never repeats the original business effect. |

All 14 report groups were assessed for state coverage:

| Report group | State coverage or reason for no separate chart |
| --- | --- |
| 3.1 Authentication | Authenticated Session. |
| 3.2 Customer/Workspace | Provisioning starts Workspace Onboarding in 3.4; ordinary information edits retain the current lifecycle state. |
| 3.3 Plans/Subscription | Subscription Validity Period and Subscription Purchase; catalogue CRUD/availability is described in its class/sequence figures. |
| 3.4 Onboarding | Workspace Onboarding, including return for work, approval and activation. |
| 3.5 Members/Permissions | Account, role and field grants are administrative attributes. SRS 3.6.3 leaves detailed member lifecycle constraints to agreement; no invented deletion/reactivation status policy is added. Session authorization rechecks changed access. |
| 3.6 Configuration | Configuration Candidate; sample execution is described in the existing Activity/Sequence figures and supplies exact-revision test evidence. |
| 3.7 Integration/Ingestion | API Credential and Production Import Batch. REST/Webhook acceptance uses the shared sequence and validation flow before initial detection. |
| 3.8 Rules | Primary rule processing is covered within Initial Transaction Detection in 3.9, with the rule engine's own class/sequence contracts retained here. |
| 3.9 AI/Fallback | Initial Transaction Detection and AI Recovery Operation, keeping source/version history separate. |
| 3.10 Transaction/Alert Review | Read-only views retain entity status. Rule Alert review/follow-up flags have no confirmed status enumeration in 3.11.3; no invented Viewed/Resolved lifecycle is added. AI Alert case creation enters the case lifecycle in 3.11. |
| 3.11 Investigation | Investigation Case; assignment and conclusion remain separate from case status. |
| 3.12 Reporting | Enterprise Report Generation; export/read operations retain the result and recheck authorization. |
| 3.13 Notifications | Email Delivery Attempt; in-app notification listing/link opening does not imply an unconfirmed read/unread status. |
| 3.14 Monitoring/Audit | Operational-metadata reading and retained audit attribution do not define a separate SRS business-object status lifecycle. Existing class/sequence figures cover these functions. |

Review/follow-up flags for Rule Alerts are specified in SRS 3.11.3, but no additional Rule Alert status enumeration is invented here. States, report conclusions and assignment are separate concepts. Normal-path arrows denote successful committed changes; access, stale-version and persistence failures preserve the last committed state as described beside each figure.

Regenerate from the repository root with Python 3, Java 21 and PlantUML 1.2026.9 (Graphviz is required for class layouts):

```powershell
python docs/diagrams/report-4-sdd/detailed-design/build_design.py
java -jar path/to/plantuml.jar -checkonly docs/diagrams/report-4-sdd/detailed-design
java -jar path/to/plantuml.jar -tsvg -o exports docs/diagrams/report-4-sdd/detailed-design
java "-DPLANTUML_LIMIT_SIZE=16384" -jar path/to/plantuml.jar -Sdpi=200 -tpng -o exports docs/diagrams/report-4-sdd/detailed-design
```

The generator checks complete SRS-function coverage and unique figure IDs. PlantUML checks syntax; visual inspection is still required for labels, relationships and layout. Google Docs images do not automatically refresh when local images change. Reinsert changed figures and inspect the native report's PDF before submission.

This is target design, not implementation evidence. Logical services/classes/operations do not prescribe Java packages, endpoints or migrations. Cross-module interactions must use module public APIs/ports, preserving the modular monolith's `api`/`internal` boundary. Session state, field grants, draft revisions and operation metadata are logical requirements; the provisional section 2 model may need later schema alignment. No unconfirmed Webhook/payment/AI wire formats, technical limits, timeout values or retry schedules are selected here.

Current SRS decisions govern roles, sensitive disclosure, configuration application, Subscription boundaries, recovery alert reconciliation and case transitions. External email failure is separate from committed business effects. Business conclusions are retained history, not automatic model-error/training labels or authorization to enforce customer-system actions.
