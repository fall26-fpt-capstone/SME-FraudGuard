# Documentation Workspace

This directory is the repository snapshot of the project's working documentation.

The [Review 2 documentation snapshot (`review-2`)](https://github.com/fall26-fpt-capstone/SME-FraudGuard/tree/refs/tags/review-2) is fixed at commit `fdf1d8b`. BM01 links to this snapshot. BM02's original review was run against commit `3be42a8` before the tag was created; its findings and evidence retain that baseline. The snapshot contains reference/demo frontend code and a backend scaffold, with implementation gaps recorded as Planned. The tag is not evidence of executed business tests or deployment readiness.

## Software v1 working specification

Read [Software v1 business specification](02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md) for the team's consolidated business rules, role boundaries, workflows, acceptance criteria, and open decisions. It is a working input to the SRS, SDD, and ERD, not a statement of implemented behavior or an approved replacement for the [current registration proposal](01_Registration/SEP490_FA26SE215_R2_Registration.pdf). Use registration v2 and the latest confirmed SRS decisions when an older working-spec statement differs; registration v1 is obsolete.

## Report sources and supporting assets

- [Report 3 functional requirements](02_Reports/Report3_SRS/README.md): native Google Doc, editable section 3 source, role screen flows and conceptual ERD diagrams.
- [Report 4 design documentation](02_Reports/Report4_SDD/README.md): native Google Doc, review PDF and organized PlantUML diagram sources.
- [Report 5 test documentation](02_Reports/Report5_TestDocumentation/README.md): native Google Doc, review PDF, unit/system-test workbooks and working Sheets, synthetic fixtures and asset validation.

The SDD and test catalogue use the agreed SRS sections 1, 2, 4 and 5. Detailed functional-requirement mapping follows the finalized SRS section 3. Designed test cases and expected outcomes are not test-execution evidence.

## Report revisions after Review 2

Use the approved registration v3 and the confirmed demo workflows as the baseline for the next report revision. Make report edits in the working Google Docs and update the linked test catalogue and diagram sources as needed. After team review, export fresh PDFs from the Google Docs and place them in the matching report folders. The current PDFs are Review 2 snapshots.

The working business specification now incorporates the agreed changes to WF-01, WF-03 and WF-04 below. Use those sections when revising the reports. The broader input scope and AI output for WF-02 still need to be specified.

| Workflow | Revision notes |
| --- | --- |
| WF-01 Enterprise setup | If the SME Admin requests changes before first activation, make the request visible to the Platform Admin. Implementation Staff revises and tests the configuration, then resubmits it for Platform Admin approval. Activation requires approval of the current configuration and confirmation by the SME Admin. An initially granted Subscription starts at activation. |
| WF-02 AI detection | Update the input scope to cover business events and measurements, including electricity readings, beyond online payments. For mixed CSV imports, report invalid rows and process valid rows. Confirm with the mentor and team whether AI returns one result per reading or one result for a period spanning multiple readings before specifying alert linkage. |
| WF-03 Rule-based detection | Align the reports with the two channels in the working specification: REST API authenticated by an API key, including automated event submissions, and CSV/Excel import. Describe how the Operator reviews matched conditions. Confirm whether the alert action records review or flags the alert for follow-up before naming it in the workflow and tests. |
| WF-04 Investigation | Align the workflow with the SRS case lifecycle: Open → Investigating → Pending Review → Closed. A request for additional investigation returns the case to Investigating. Retain the flow for linking multiple eligible AI Alerts and verify the alert inputs for the combined WF-02/WF-04 demo. |

Review Reports 1–2 and Project Tracking for scope, membership, ownership, and milestones. Align the working business specification and Report 3 first, then update Report 4 and Report 5. Add four end-to-end activity diagrams alongside the applicable module diagrams. Review the existing state machines against the confirmed lifecycle rules and link workflow evidence from the matching folders in the submission drive's `06_WorkflowDemo` directory.

## Workflow

1. The team edits source documents in the internal workspace.
2. Editable source files (`.docx`, `.xlsx`, etc.) are copied into the matching folder here so an AI agent can review them together with the source code and database scripts.
3. For the official Review 2 self-review, the agent must follow the standard prompt and **report only; do not modify files during that run**.
4. After the team verifies and finalizes the documents, official submission snapshots are exported to PDF and placed in the submission drive.
5. The repository state used for Review 2 is tagged `review-2` only after the documents, Iteration 1, database scripts, tests, and CI are ready.

## Structure

- `00_Reference/` — Review 2 guideline and reference material.
- `01_Registration/` — Review 1 registration, proposed Review 2 registration, BM03, and final Registration snapshot when ready.
- `02_Reports/` — Report 1–5 and Project Tracking working files.
- `03_SelfReview/` — BM02 Self Review working file and related output.
- `04_DesignBrief/` — BM01 Design Brief working file.
- `05_PostReview2/` — BM04 Review 2 Commitment, completed after Review 2.
- `diagrams/` — source diagrams used by SDD and review activities.
