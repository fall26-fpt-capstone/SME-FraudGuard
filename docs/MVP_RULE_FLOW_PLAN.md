# MVP plan: rule-based flow for two members

Working plan for the first end-to-end slice. It splits the work between two members so that they do not edit the same files. It does not assign names or dates: the team must confirm owners (see [business specification](02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md), section 15.2) and set its own schedule. Business rule identifiers such as RUL-01 and AC-05 refer to that specification, which is the source of truth when this plan disagrees with it.

## MVP flow

A Free-plan workspace, then: declare fields and a channel mapping → ingest by REST, CSV/Excel or Webhook → evaluate the active rules → one Rule Alert per transaction → view transactions and alerts in the dashboard.

## Deferred from the MVP

| Deferred | Reason |
| --- | --- |
| AI scoring, Subscription, fallback, recovery reanalysis | Free plan uses rules only; the AI contract is open (OPEN-05). |
| Plan catalogue and online payments | v1 payments are manual (PLN-08). |
| Cases and investigation | Cases open only from AI Alerts (CAS-01). The existing `cases` table and `Severity`/`score` do not match the specification; do not extend them. |
| Onboarding workflow, handover, documents, Staff assignment | Use one seeded workspace. |
| Real accounts, activation and authentication | Keep the development `X-Tenant-Id` stub. Risk: no real authorization, so use synthetic data only. |
| Sensitive-field encryption | Same risk; use synthetic data only. |
| Webhook replay window and event-ID retention | Keep the existing HMAC check (OPEN-06). |
| Notifications, email, reports, export, platform health | Not needed for the flow (OPEN-10). |

## Phase 0: contracts and schema (one person, merged first)

Both tracks depend on these, so one person delivers them in a single PR and the other reviews. The dashboard `AGENTS.md` keeps `src/services` empty until an API contract is approved, so the team leader approves the contract before frontend work starts.

1. **One Flyway migration** containing every table the MVP needs, chosen from the proposed database design (`diagrams/report-4-sdd/database-design/`). Add only entities the flow needs; a likely set is `field_definitions`, `channel_mappings`, `field_mappings`, `rules`, `rule_conditions`, `transactions`, `detection_attempts`, `rule_matches`, `alerts`, `import_batches`, `import_rows`. The team confirms the final list.
2. **Frozen cross-module contracts:**
   - `ingestion.api.FieldCatalogPort`: read-only list of declared fields for a workspace.
   - `ruleengine.api.AlertQueryPort` and `AlertSummary`: read-only alert queries for the dashboard.
   - Rule JSON shape: AND or OR over one level of `{field, operator, value}`, including "has value" and "has no value".
3. **Shared files:** all new `pom.xml` dependencies (CSV and Excel parsing), CORS configuration, and namespaced keys in `application*.yml`.
4. **API contract document:** endpoints, request and response shapes, error format.

## Track A: data in (`ingestion`, `dashboard`)

| # | Task |
| --- | --- |
| A1 | Field-definition and per-channel mapping APIs, including type conversion (ING-03, ING-04, ING-06). |
| A2 | REST ingest: apply the mapping, validate required fields and types, reject invalid data without detection. |
| A3 | Duplicates: same ID and equivalent content is a recorded duplicate; same ID and different content is a conflict (HTTP 409) with no overwrite (section 6.2). |
| A4 | CSV/Excel import: reject a file with a missing column, process valid rows, report errors per row (ING-09). |
| A5 | Webhook uses the same payload and mapping path. |
| A6 | Dashboard read APIs for transactions and alerts, through `AlertQueryPort`. |
| A7 | Frontend: import dialog, mapping screen and transactions table wired to the API. |

## Track B: rule engine and alerts (`ruleengine`)

| # | Task |
| --- | --- |
| B1 | Rule create, read, update, publish, enable and disable. Edits go to a draft; publishing creates a new version. |
| B2 | Evaluation: type-aware operators, an empty optional field never matches an ordinary comparison (RUL-01), disabled rules skipped. |
| B3 | One Rule Alert per transaction listing every matched rule and condition (RUL-02), plus a detection record with source `RULE`. |
| B4 | `AlertQueryPort` implementation. Track A depends on it, so deliver it early. |
| B5 | Dry-run endpoint for JSON samples that persists nothing (TST-02 to TST-06). |
| B6 | Listener wiring: Free plan evaluates rules only; remove the stub score path from the MVP flow. |
| B7 | Frontend: rule builder, rule testing and alerts views wired to the API. |

Track A carries more work because of three channels. If it slips, move A5 to Track B.

## Rules for working without conflicts

1. **Package ownership** follows `backend/OWNERS.md`: Track A owns `ingestion` and `dashboard`, Track B owns `ruleengine`. Modules talk only through `api` packages; the ArchUnit test fails the build otherwise.
2. **Frozen contracts.** Change anything in an `api` package only after both members agree, in a PR both approve.
3. **Migrations:**
   - Use a timestamp version such as `V20261105_1430__add_x.sql`, one migration per PR.
   - Never edit a migration that has been applied in a shared environment.
   - Set `spring.flyway.out-of-order=true` for the `local` and `test` profiles only.
4. **Branches** are short-lived: `feat/ingest-*` and `feat/rules-*`. Keep PRs to about 400 changed lines, rebase on `main` before opening, and merge at least daily through the team leader. Do not keep a long-lived integration branch.
5. **Shared-file hotspots:**
   - `pom.xml`, `package.json` and lockfiles: announce any new dependency first.
   - Backend `common/` and `ArchitectureTest`: change only in Phase 0 or by agreement.
   - Frontend `FraudGuardDashboard.tsx`, `translations.ts`, `types/fraudguard.ts`, `navigation.ts`, `permissions.ts`: keep PRs tiny and merge the same day.
   - New frontend types go in `types/ingestion.ts` or `types/rules.ts`; API clients in `src/services/ingestion.ts` or `src/services/rules.ts`; translation keys use an own prefix and are added in both `vi` and `en`.
6. **Tests:** every PR adds tests inside its own packages. Integration tests use unique tenant identifiers (for example `it-rules-*`) so they do not collide. CI must pass before merge.
7. **Definition of done:**
   - The validation commands in the root `AGENTS.md` pass: `./mvnw clean verify` in `backend/`, `npm run check` and `npm run build` in `frontend/LCS/`.
   - Behavior matches the cited specification rule.
   - The author can explain the change at the defense, including agent-assisted code.
8. **Daily 10-minute sync:** what merged, what is next, and any contract change.

## Integration and hardening

After both tracks merge, do a joint pass:

1. Run the end-to-end flow on synthetic data: acceptance scenarios AC-05 to AC-12 and the fixtures in `02_Reports/Report5_TestDocumentation/test-data/`.
2. Check tenant isolation (AC-01). Today it is only the `tenant_id` column plus `TenantContext`; the repository-level filter is still a TODO.

## Assumptions and open points

- Frontend wiring was planned from the file list and `frontend/LCS/AGENTS.md`, not from reading each dashboard component. Check `FraudGuardDashboard.tsx` before estimating Track A7 and B7.
- The MVP table list, mapping format, field type and date/time rules, and "equivalent duplicate" definition still need team decisions (OPEN-01, OPEN-02).
