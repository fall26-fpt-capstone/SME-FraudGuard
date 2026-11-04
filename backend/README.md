# SME-FraudGuard backend foundation

This is the agreed package scaffold for one Spring Boot monolith. It prepares the codebase for implementing the current SRS; it does not implement the 65 functional requirements. Legacy demo endpoints, fake authentication, numeric AI scores and case logic have been removed. There are no business controllers, service implementations, entity mappings, repositories or external clients yet.

Java 21, Spring Boot 3.3.5, Maven Wrapper, Spring Data JPA, PostgreSQL, Flyway, JUnit 5, ArchUnit and Testcontainers are retained. No runtime dependency or framework version is added or upgraded.

## Specification and responsibility

Use [Report 3 functional requirements](../docs/02_Reports/Report3_SRS/sections/functional-requirements.md) and [Report 4 detailed design](../docs/02_Reports/Report4_SDD/sections/detailed-design.md). Report 4 signatures express proposed responsibilities, not approved Java/HTTP contracts. Its provisional ERD is not a final database schema.

One backend maintainer owns the application. The team reviews shared contracts/schema changes before implementation. The former Dev A/Dev B ownership split is retired.

| Module | SRS | Responsibility |
| --- | --- | --- |
| `auth` | 3.2 | Credentials, login, initial/current password changes and server sessions. |
| `workspace` | 3.3, 3.5 | Enterprise/workspace metadata, concurrent Staff assignments, onboarding, readiness, handover and activation. |
| `member` | 3.6 | Enterprise members, roles and sensitive-field grants; uses auth services for credential provisioning. |
| `subscription` | 3.4 | Offers, initial allocation, purchases, verified payment effects and current/historical validity. |
| `configuration` | 3.7 | Fields, mappings, flat rules, draft revisions, temporary sample testing and explicit application. |
| `ingestion` | 3.8, 3.11.1-2, 3.11.6 | API keys, REST/Webhook/file acceptance, normalization, identity, transaction/import review and controlled field disclosure. |
| `detection` | 3.9-10, 3.11.3-5 | Rules/AI processing, fallback/recovery, alerts, flags and attempt history. |
| `investigation` | 3.12 | Cases, assignment, findings, report versions, final conclusions and assigned-case access decisions. |
| `reporting` | 3.13 | Authorized dashboard summaries, report views, generation and safe export. |
| `notification` | 3.14 | Scoped in-app notifications and independent email delivery orchestration. |
| `audit` | 3.15.2 | Safe attribution and authorized object history; required local audit writes share the business transaction. |
| `common` | Cross-cutting; 3.15.1 | Minimal config, security/error/persistence infrastructure and safe operational monitoring. |
| `integration` | External interfaces | AI, VNPay, email and protected file storage adapters. |

Configuration owns definitions; detection owns production execution and results. Sample testing must reuse production rule semantics without production records. Choose its evaluator contract during feature implementation and avoid circular service calls. Transaction views stay in ingestion, alert views in detection and case views in investigation; reporting consumes authorized summaries.

## Folder layout

Each business module has the following folders under `src/main/java/com/fraudguard`. `.gitkeep` preserves empty folders in Git; `package-info.java` documents responsibilities. Add real classes with a feature, then remove its unnecessary placeholder.

```text
investigation/
|-- package-info.java
|-- controller/
|-- service/                 # CaseService interface goes here
|   `-- impl/                # CaseServiceImpl goes here
|-- repository/
|-- entity/
|-- dto/
|   |-- request/
|   `-- response/
`-- mapper/
```

The two service names above are examples, not existing classes. Common infrastructure has `config`, `exception`, `security` and `persistence` packages; integration has `ai`, `payment`, `email` and `storage` packages. AI training remains outside the backend.

This replaces the former `api`/`internal` convention with the agreed layered packages. Public cross-module contracts live in service interfaces and DTOs.

## Layer rules

| Layer | Responsibility |
| --- | --- |
| `controller` | HTTP mapping, request validation and status codes. Calls service interfaces; never repositories, entities or service implementations. |
| `service` | Public interfaces using explicit DTOs/safe identifiers; never JPA entities or repositories. |
| `service/impl` | Business orchestration, current role/workspace/object checks and transaction boundaries. |
| `repository` | Workspace/object-scoped Spring Data JPA queries, private to the owning module. |
| `entity` | Persistence model and local invariants, private to the owning module; never serialized directly to HTTP. |
| `dto/request` | Validated request/command data. Caller-provided roles/workspace IDs are not authorization. |
| `dto/response` | Explicit permitted response/query data, protecting sensitive fields. |
| `mapper` | Entity/DTO conversion without database queries, authorization or business decisions. |

Follow `Controller -> Service interface -> ServiceImpl -> Repository -> database`. Use constructor injection and service transaction boundaries. Give service/integration boundaries interfaces; concrete mappers/helpers do not need interfaces by default. Do not create a generic CRUD base layer.

Other modules cannot import controllers, entities, repositories, mappers or service implementations. Common cannot depend on business modules or integration; adapters cannot depend on business modules. Avoid module cycles. Add public queries, DTOs or events only for concrete use cases. Keep business types out of common.

## Constraints for implementation

- Design real authentication before exposing business endpoints. The previous trusted-header filter and demo keys are removed. Mandatory password setup and server-side logout remain required.
- Check role, workspace, Staff assignment, case assignment and field permission separately. SME Admin manages grants without gaining plaintext access.
- Readiness, approval and enterprise activation are separate gates. Initial Subscription starts once at activation.
- Subscription uses calendar month/year terms in `Asia/Ho_Chi_Minh`, UTC instants and `[start, expiry)`. Current entitlement differs from historical recovery eligibility.
- Draft edits/tests do not activate configuration. Apply requires the exact tested revision and explicit Staff assessment. Accepted work retains its chosen context.
- All ingestion channels share normalization and atomic transaction identity. Acceptance differs from completed detection; delivery IDs differ from business transaction IDs.
- Free uses rules. Subscription uses AI first, then rules on AI failure. AI returns Normal/Anomaly plus model/service version, without numeric score/severity.
- Integration owns external transport; the calling module owns business decisions. AI/VNPay/email/storage contracts, timeouts and adapters are not implemented.
- Aggregate matched rules into one Rule Alert per attempt. Recovery preserves history and reuses the transaction's single AI Alert. Never open cases automatically.
- Case lifecycle is Open, Investigating, Pending Review, Closed. Assignment and the four conclusions are separate. Existing authorized case work survives expiry; reopening is not implied.
- Notification retries do not repeat business effects. Logs/audit/exports/notifications exclude secrets, unauthorized plaintext and temporary samples.

These are constraints, not working features. HTTP routes, session mechanics, external wire formats and target schema migrations will be designed with each feature.

## Database history

`src/main/resources/db/migration/V1__init.sql` is retained byte-for-byte. Its legacy tables, score fields and states are not the target model; the scaffold has no entities mapped to them. A fresh database still applies V1 at startup. Add reviewed migrations for later schema changes; never rewrite V1, drop tables or reset shared data. This scaffold change performs no database migration or cleanup.

## Build and run

From `backend/` on Windows:

```powershell
.\mvnw.cmd clean verify
docker compose up -d
.\mvnw.cmd spring-boot:run
```

On Unix use `./mvnw`. The local profile uses PostgreSQL at `localhost:5432/fraudguard`; `DB_URL`, `DB_USER` and `DB_PASSWORD` override local defaults. Compose credentials are local-development defaults. Check the target before running Compose/Flyway against an existing environment.

There are no business endpoints. Old `/api/v1/ingest/*` and `/api/v1/dashboard/cases` routes are removed. The frontend currently uses demo state; agree and connect new API contracts during implementation.

- `ArchitectureTest` checks module privacy, service interfaces, layers, infrastructure independence and cycles. Empty selections are allowed while layers contain no business classes.
- `ArchitectureRulesSelfTest` proves that illegal entity/repository access and entity-leaking service contracts are rejected; service-interface consumers are allowed.
- `FraudGuardApplicationIT` starts with PostgreSQL and checks that old routes are absent. Testcontainers skips it without Docker. This is not a business acceptance test.

Implement one feature at a time with its DTOs, authorization, service interface/implementation, repository, entity/migration where needed and meaningful tests. Update this README as routes become real. Runtime dependency arrows should reflect real service/event relationships after those are implemented.
