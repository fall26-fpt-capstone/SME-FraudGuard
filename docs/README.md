# Documentation Workspace

This directory is the repository snapshot of the project's working documentation.

## Software v1 working specification

Read [Software v1 business specification](02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md) for the team's consolidated business rules, role boundaries, workflows, acceptance criteria, and open decisions. It is a working input to the SRS, SDD, and ERD, not a statement of implemented behavior or an approved replacement for the [current registration proposal](01_Registration/SEP490_FA26SE215_R2_Registration.pdf). Use registration v2 and the latest confirmed SRS decisions when an older working-spec statement differs; registration v1 is obsolete.

## Report sources and supporting assets

- [Report 4 design documentation](02_Reports/Report4_SDD/README.md): native Google Doc, review PDF and organized PlantUML diagram sources.
- [Report 5 test documentation](02_Reports/Report5_TestDocumentation/README.md): native Google Doc, review PDF, system-test workbook, synthetic fixtures and asset validation.

The SDD and test catalogue use the agreed SRS sections 1, 2, 4 and 5. Detailed functional-requirement mapping follows the finalized SRS section 3. Designed test cases and expected outcomes are not test-execution evidence.

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
