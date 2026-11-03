# FraudGuard-as-a-Service

A transaction fraud detection system for SMEs, delivered as multi-tenant SaaS (single schema: every business table has `tenant_id`).

**Stack:** Java 21 · Spring Boot 3.3 · Maven (wrapper) · PostgreSQL 16 · Flyway · JUnit 5 · ArchUnit · Testcontainers

> This is a **skeleton**: the package structure, inter-module contracts and architecture rules are in place;
> actual business logic (CSV parsing, rule evaluation, severity, case state machine, AI scoring, etc.) is left empty with `TODO` markers.

## Why a modular monolith

- Small team, 2 backend developers: one process, one DB, one deployment — without the operational overhead of microservices.
- Clear feature boundaries (package-by-feature) still let both developers work in parallel without interfering with each other.
- Boundaries are **automatically checked** (ArchUnit), rather than relying on individual discipline. If services need to be extracted later,
  each module's `api` is the natural separation point.

## Package diagram

```
com.fraudguard
├── ingestion/                       Dev A
│   ├── api/        TransactionIngestedEvent, IngestionResult, IngestionChannel
│   └── internal/
│       ├── transaction/  Transaction entity, repository, persistence + event publishing service, TransactionPayload (shared mapping)
│       ├── csv/          upload CSV/Excel
│       ├── restapi/      REST + X-API-Key authentication
│       └── webhook/      webhook (X-Signature), shares TransactionPayload with restapi
├── ruleengine/                      Dev B
│   ├── api/        CaseQueryPort, CaseSummary, CaseStatus, Severity
│   └── internal/
│       ├── TransactionIngestedListener   listens for ingestion events
│       ├── rule/        Rule, RuleVersion, evaluation + dry-run (stub)
│       ├── scoring/     calls AI through aiclient
│       └── casemgmt/    FraudCase (`cases` table), repository, CaseQueryPort impl
├── dashboard/                       Dev A
│   ├── api/
│   └── internal/reporting/   case queue, statistics, export (calls ruleengine through CaseQueryPort)
├── aiclient/       AI service contract (FraudScoringClient + DTO) + stub returning fake scores
└── common/         TenantContext, base exception, BaseTenantEntity (id, tenant_id, audit)
```

```
 client ──► ingestion ──(TransactionIngestedEvent)──► ruleengine ──► aiclient ──► AI service
                                                          ▲
                                       dashboard ─(CaseQueryPort)
```

## `api` / `internal` rules

1. Each feature module (`ingestion`, `ruleengine`, `dashboard`) has exactly 2 subpackages: `api` and `internal`.
2. **No** package outside a module may import that module's `*.internal.*` — only `*.api.*` may be used.
3. `api` must not reference any type in `internal`.
4. Dependency direction: `ruleengine → ingestion.api`, `dashboard → ruleengine.api`. Ingestion does not know who listens to its events.
5. `common` and `aiclient` do not depend on feature modules; there are no circular dependencies between modules.

These rules are in [`ArchitectureTest`](src/test/java/com/fraudguard/ArchitectureTest.java) — **violations cause `./mvnw verify` to fail**.
[`ArchitectureRulesSelfTest`](src/test/java/com/fraudguard/ArchitectureRulesSelfTest.java) proves that the rules catch real violations
(using intentionally invalid classes in `src/test/java/com/archfixture`). The `ArchitectureTest` Javadoc includes examples of deliberately causing violations to see the build fail.

### Event ingestion → ruleengine

`ingestion` saves the transaction, then calls `ApplicationEventPublisher.publishEvent(new TransactionIngestedEvent(...))`.
`ruleengine` listens with `@TransactionalEventListener(AFTER_COMMIT, fallbackExecution = true)` — it runs only after the ingestion
transaction has committed. Errors in ruleengine are logged without failing the ingestion request (TODO: outbox/retry).

## Local development

Requirements: JDK 21, Docker. No Maven installation is needed (use `mvnw`).

```bash
docker compose up -d
./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run
```

Flyway runs migrations automatically when the app starts (the default profile is `local`). To migrate manually: `./mvnw flyway:migrate`.

Try the end-to-end flow (logs show `stored + published`, followed by `consumed TransactionIngestedEvent`):

```bash
curl -X POST http://localhost:8080/api/v1/ingest/transactions \
  -H "Content-Type: application/json" -H "X-API-Key: demo-key-tenant-a" \
  -d '{"transactionId":"t-1","semanticFields":{"actor_id":"u1","numeric_value":120.5}}'

curl http://localhost:8080/api/v1/dashboard/cases -H "X-Tenant-Id: tenant-a"
```

Other endpoints: `POST /api/v1/ingest/csv` (multipart `file`, `X-Tenant-Id` header),
`POST /api/v1/ingest/webhook` (`X-Tenant-Id`, `X-Signature` headers). Authentication is currently only a development stub
(`X-Tenant-Id`, API key in `application-local.yml`) — replace it with real authentication later.

## Build & test

```bash
./mvnw clean verify
```

- `*Test` (surefire): ArchUnit + unit tests; no Docker required.
- `*IT` (failsafe): runs the app with real PostgreSQL through Testcontainers; automatically skipped when Docker is unavailable.

## Design notes

- The `Case` entity is named `FraudCase` (`cases` table) because `CASE` is a JPQL/HQL keyword.
- `cases.transaction_id` is a business identifier, with **no** foreign key to `transactions` — modules do not share DB constraints.
- Tenant isolation currently consists only of the `tenant_id` column + `TenantContext`. TODO: enforce tenant filtering at the repository layer (Hibernate filter).
