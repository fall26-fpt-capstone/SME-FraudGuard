# General guidelines for coding agents

These guidelines apply to the entire SME-FraudGuard repository, a transaction fraud detection capstone project for SMEs developed by a four-member team. Each member is responsible for understanding, checking and explaining changes made with agent assistance.

## Before starting

- Read the request, the root `README.md` and the README for the area you will change. Also read any `AGENTS.md` in the relevant directories; instructions in subdirectories add rules for their own scope.
- Check the branch and `git status` before editing. Existing changes may belong to another team member; do not overwrite, revert or delete them unless requested.
- Identify the scope: the area to change, callers, API contracts, data and tests affected. Read only additional documentation needed for the current task.
- Stay within the business scope agreed by the team. If a request conflicts with documentation or requires a shared contract change, explain this so the team can agree before implementing the dependent work.

## Structure and boundaries

- `backend/`: Java 21, Spring Boot, Maven Wrapper; preserve the modular monolith architecture and `api` / `internal` boundaries described in `backend/README.md`.
- `frontend/LCS/`: Next.js dashboard; follow `frontend/LCS/AGENTS.md` and the UI documentation it references.
- `frontend/LCS_landingpage/`: independent landing page application; use its own README and package scripts.
- `ai-service/`, `database/`, `infra/`: inspect the actual contents before working; do not assume an implementation or integration contract already exists.
- `docs/`: capstone documentation; follow `docs/README.md`. Distinguish working features from plans, stubs and demo data when writing documentation.

## Making code changes

- Make the smallest change that fully resolves the request. Reuse existing helpers, components, libraries and organization patterns.
- Do not expand features, add dependencies, change the architecture, refactor broadly or format unrelated files on your own.
- When fixing a bug, find its callers and fix the root cause in the shared implementation. When changing a contract, update all consumers and related tests within the agreed scope.
- Preserve input validation, error handling, authorization and tenant isolation. Do not treat browser-side data as proof of authentication or access rights.
- Do not put passwords, tokens, API keys, personal environment files or real customer data in Git or logs.
- Do not modify migrations already applied in shared environments; add a new migration. Do not delete data, reset databases or run destructive commands without specific permission.
- Add or update appropriate tests for new logic or behavior changes. Documentation-only changes do not require running the entire application.

## Git and team coordination

- Use a separate branch for each task, following the team's naming convention; if none exists, use `feat/`, `fix/` or `docs/` followed by the task name.
- Do not implement changes directly on `main`. Do not commit, push, merge PRs or force-push unless requested; the team leader reviews and merges into `main`.
- Before changing an API contract, schema or shared file, explain the impact so the responsible members can coordinate. Separate branches can still conflict when editing the same file.
- Do not stash, reset, clean or resolve conflicts by discarding someone else's changes on your own. If the intent of both sides is unclear, stop work on the conflicting part and report it.
- Keep the diff within the task scope. Update lockfiles only for related dependency changes.

## Agent context and documentation

- The root `AGENTS.md` contains shared conventions, not session logs, personal progress or temporary task lists.
- Write all repository Markdown (`.md`) files in English, including new documentation and updates to existing files. Preserve the meaning of translated content and keep technical identifiers, commands and paths unchanged. This documentation rule does not change the application's UI language.
- Do not create memory, context, plan, handoff or session-report files, or copies of instructions in the repository on your own. Create them only when requested or when the task requires a specific handoff document.
- If private notes are needed, use personal storage outside the repository or a local directory ignored by Git. Verify the actual ignore rules before saving; `.git/info/exclude` may be used for machine-local rules.
- Shared documentation must be useful to the team: run instructions, design decisions, contracts and tests. Update existing documentation before creating a new file.
- Do not change shared instructions on your own to justify how a task is performed. Convention changes must be reviewed by the team like code.

## Validation and handoff

Run commands from the correct directory for the changed area:

| Area | Validation |
| --- | --- |
| Backend | In `backend/`: `./mvnw.cmd clean verify` on Windows or `./mvnw clean verify` on Unix; integration tests require Docker. |
| Dashboard | In `frontend/LCS/`: `npm run check` and `npm run build`. |
| Landing page | In `frontend/LCS_landingpage/`: `npm run typecheck` and `npm run build`. |
| Other areas | Follow the README and existing validation tools for that area. |

- Use npm with the committed frontend lockfile; use `npm ci` when installing dependencies.
- Report the exact commands run, results, skipped tests and environment limitations. Do not claim verification without running it; a successful build does not replace business tests.
- At handoff, summarize what changed, why, how it was checked and remaining risks in plain language so the responsible member can review and explain it during the defense.
