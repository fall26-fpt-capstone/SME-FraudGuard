# SME-FraudGuard backend

This is one Spring Boot modular monolith. Auth implements credential login, JWT sessions, mandatory initial password change, current password change and logout. Subscription implements Platform Admin plan-offer catalogue administration with versioned history. Workspace implements scoped metadata reads/updates, concurrent Staff assignments and text-only onboarding specifications with history. Member exposes scoped list/detail reads through auth's public directory queries. Other business features remain planned; this does not implement all 65 functional requirements. Legacy demo endpoints, fake authentication, numeric AI scores and case logic have been removed.

Java 21, Spring Boot 3.3.5, Maven Wrapper, Spring Data JPA, PostgreSQL, Flyway, JUnit 5, ArchUnit and Testcontainers are retained. Spring Security's OAuth2 Resource Server starter supplies JWT verification and Nimbus signing support; it does not add an OAuth login flow. springdoc-openapi 2.6.0 provides Swagger UI and OpenAPI documentation.

## Specification and responsibility

Use [Report 3 functional requirements](../docs/02_Reports/Report3_SRS/sections/functional-requirements.md) and [Report 4 detailed design](../docs/02_Reports/Report4_SDD/sections/detailed-design.md). Report 4 signatures express proposed responsibilities, not approved Java/HTTP contracts. Its provisional ERD is not a final database schema.

One backend maintainer owns the application. The team reviews shared contracts/schema changes before implementation. The former Dev A/Dev B ownership split is retired.

## Agreed behavior and implementation gaps

Business-facing views use Enterprise / Doanh nghiệp. Technical `workspace` module/table/route names remain; one enterprise has one isolated workspace. This does not introduce a second customer-managed project.

The table separates implemented behavior from remaining target work:

| Area | Current implementation | Agreed target / remaining work |
| --- | --- | --- |
| Workspace identity | Login accepts string `workspaceKey`; login/session return UUID `workspaceId` and string `workspaceKey`. Workspace route `{id}` uses that UUID. V5 maps persisted auth scope from legacy keys. | Consumers must use the new input and response meanings; reconcile any unmapped legacy account keys before deploying V5. |
| Enterprise creation | Metadata reads/updates only; no creation or subdomain-availability endpoint. | Platform Admin enters enterprise name, phone, enterprise email and proposed subdomain; check availability during entry and uniqueness again at save. Confirm subdomain/key mapping and reserved names before defining the creation contract. |
| Initial SME Admin | Opt-in local Platform Admin bootstrap and mandatory initial password change exist; enterprise invitation email/setup tokens do not. | Enterprise creation sends the FG-format username and a time-limited, single-use password-setup link to the designated email. Confirm delivery-email policy, token lifetime, resend/recovery and failure handling. |
| Onboarding documents | Scoped text specifications and history only. | Onboarding tracks implementation; discussions may happen externally. Retain agreed specifications/confirmation references. Platform Admin, assigned Staff and own-enterprise SME Admin may upload protected supporting files. |
| Enterprise personnel | SME Admin can list/read members only. | Assigned Staff provisions Operator/Investigator accounts from confirmed enterprise requests, including after handover. SME Admin changes those personnel roles, locks access immediately and administers field-view grants; Platform Admin handles administrator replacement. |
| Handover | Readiness, approval, production activation and entitlement allocation are not implemented. | Staff tests and submits readiness, Platform Admin approves, SME Admin accepts and activates production. Password setup does not activate production or start an initial Subscription. |
| Implementation order | Auth, plan catalogue, enterprise metadata, assignments, text specifications and member reads are implemented. | Implement independently usable agreed parts first. Webhook integration, rule configuration/testing and payment processing remain deferred; catalogue CRUD is independent of checkout. Missing steps must not report fabricated success. |

**Identity integration contract:** SME Admin obtains the workspace UUID from login `account.workspaceId` or GET `/api/v1/auth/session` `workspaceId`, then uses it in specification routes. The separate `workspaceKey` is the readable login code. Workspace list/detail remains restricted to platform roles; no extra discovery endpoint is needed. Never send the key in `{id}` or use browser-supplied identity as authorization.

This is a breaking login contract change: replace input `workspaceId` with `workspaceKey`; legacy `workspaceId` and other unknown login properties return 400 instead of being ignored. Response `workspaceId` now means UUID. The dashboard has no backend auth client yet; other clients must update together with the backend. V5 retains legacy keys under `workspace_key`, maps UUIDs from existing verified workspace rows and enforces matching UUID/key pairs. It aborts if any enterprise account lacks a matching workspace; it never fabricates rows or guesses UUIDs. Existing enterprise sessions are retained but revoked and require login again; platform sessions retain their current state. Historical unmapped enterprise sessions remain revoked. Applied V1-V4 migrations are unchanged.

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

The two service names above are examples, not existing classes. Auth uses `AuthController -> AuthService -> AuthServiceImpl -> AccountRepository / AuthSessionRepository`. Its security configuration and local bootstrap are private to auth. Common infrastructure has `config`, `exception`, `security` and `persistence` packages; integration has `ai`, `payment`, `email` and `storage` packages. AI training remains outside the backend.

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

These are constraints; only the auth, plan-offer catalogue, workspace administration and member reads documented below are implemented. Other HTTP routes, external wire formats and target schema migrations will be designed with each feature.

## Database history

`src/main/resources/db/migration/V1__init.sql` is retained byte-for-byte. Its legacy tables, score fields and states are not the target model; no entities map to them. A fresh database still applies V1 at startup. `V2__auth_accounts_and_sessions.sql` adds auth accounts and revocable JWT sessions without changing legacy data. `V3__plan_offer_catalogue.sql` adds the offer catalogue and its attributed revision snapshots. `V4__workspace_metadata_and_assignments.sql` adds workspace metadata, Staff assignment links, text specifications and local history. V4 does not backfill or fabricate workspace rows for existing accounts. `V5__auth_workspace_uuid.sql` renames auth's old string scope to `workspace_key`, adds UUID `workspace_id`, maps exact key matches and enforces matching account/session UUID-key references to workspaces. It does not add foreign keys from workspace Staff/history records to auth actors. Add reviewed migrations for later schema changes; never rewrite applied migrations, drop tables or reset shared data.

Before deploying V5 to an existing environment, use read-only checks to identify unmapped account keys:

```sql
SELECT DISTINCT a.workspace_id AS legacy_workspace_key
FROM auth_accounts a
LEFT JOIN workspaces w ON w.workspace_key = a.workspace_id
WHERE a.workspace_id IS NOT NULL AND w.id IS NULL;
```

This query applies only before V5. Any returned key needs verified enterprise/workspace reconciliation with the team before retrying migration. Do not insert arbitrary workspaces, delete accounts or reset the database to make migration pass. Flyway's PostgreSQL transaction leaves the existing scope unchanged when V5 rejects an unmapped account.

## Build and run

From `backend/` on Windows:

```powershell
.\mvnw.cmd clean verify
docker compose up -d
# Generate a signing key for this terminal session; use a managed secret outside local development.
$env:AUTH_JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Optional, local profile only: create the first Platform Admin without a committed password.
$env:AUTH_BOOTSTRAP_LOGIN = Read-Host "Initial Platform Admin login"
$env:AUTH_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new("", (Read-Host "Initial password (12+ characters)" -AsSecureString)).Password
.\mvnw.cmd spring-boot:run
```

On Unix use `./mvnw`. The local profile uses PostgreSQL at `localhost:5432/fraudguard`; `DB_URL`, `DB_USER` and `DB_PASSWORD` override local defaults. Compose credentials are local-development defaults. Check the target before running Compose/Flyway against an existing environment.

For local IntelliJ runs, `backend/.env` can hold `AUTH_JWT_SECRET`, `DB_URL`, `DB_USER` and `DB_PASSWORD`. The `local` profile imports this file when the working directory is either the repository root or `backend/`; other working directories require an explicit configuration location. Use unquoted `NAME=value` lines (Java properties syntax), without `export`. The file is ignored by Git and is not bundled in the application JAR. Environment variables still take precedence. If `.env` already contains a private signing key, skip the key-generation command above to keep existing tokens valid. PostgreSQL must still be running. Optional `AUTH_BOOTSTRAP_LOGIN` and `AUTH_BOOTSTRAP_PASSWORD` values may also be placed in this ignored local file; remove them after provisioning.

The signing key is mandatory: `AUTH_JWT_SECRET` must be Base64 encoding of at least 32 cryptographically random bytes. Keep it stable and private in deployed environments; replacing it invalidates previously issued JWTs. There is no fallback key. Automated tests use a synthetic key under `src/test/resources`, excluded from the application JAR. Bootstrap never changes an existing account or resets its password. Remove `AUTH_BOOTSTRAP_LOGIN` and `AUTH_BOOTSTRAP_PASSWORD` from the terminal environment after first use. Do not point local bootstrap at shared or production databases.

Old `/api/v1/ingest/*` and `/api/v1/dashboard/cases` routes remain removed; unauthenticated requests now receive 401 from the security boundary. The frontend still uses demo state and is not connected to auth yet.

With the `local` profile (the default), open [Swagger UI](http://localhost:8080/swagger-ui/index.html). The OpenAPI JSON is available at `/v3/api-docs`. Both documentation endpoints are disabled outside the `local` profile by default. Select a non-local profile explicitly in deployed environments.

## Auth API and trying it in Swagger

| Method | Path | Input / behavior |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | `loginName`, `password`, `portal` (`PLATFORM` or `ENTERPRISE`), and enterprise string `workspaceKey`; returns `accessToken`, `tokenType`, UTC `expiresAt`, and safe `account` data including UUID `workspaceId` and string `workspaceKey`. |
| GET | `/api/v1/auth/session` | Bearer JWT; returns current account ID, login name, role, UUID `workspaceId`, string `workspaceKey` and `mustChangePassword`. Both workspace fields are null for platform accounts. Allowed during initial setup. |
| POST | `/api/v1/auth/initial-password` | Setup-only Bearer JWT and `currentPassword`, `newPassword`, `confirmation`. Clears setup restriction only after saving successfully. |
| POST | `/api/v1/auth/password` | Fully set up Bearer JWT and the same password fields. Retains the current session. |
| POST | `/api/v1/auth/logout` | Revokes the supplied Bearer JWT's persisted session. Returns 204; repeating logout for that signed, unexpired token also returns 204. No token returns 204 without creating a session. Invalid/expired tokens return 401. |

1. Start PostgreSQL and the application with the environment variables above. Initial passwords must contain at least 12 characters and at most 72 UTF-8 bytes (BCrypt's input limit).
2. In Swagger, call login with the bootstrap login/password, `"portal": "PLATFORM"` and `"workspaceKey": null` (or omit the key). Enterprise accounts use `"portal": "ENTERPRISE"` and their stored string `workspaceKey`; login identifiers are distinct from contact emails. Do not send `workspaceId` in the login body.
3. Copy `accessToken`, press **Authorize**, and paste the token without the `Bearer` prefix. Swagger adds the header.
4. Call `initial-password` with the initial password and a different new password entered twice. Before this succeeds, operational endpoints and ordinary password change are forbidden.
5. Call `session`, optionally `password`, then `logout`. Calling `session` with the logged-out token returns 401. Login again using the latest password for another session.

For enterprise integration, a synthetic login body is:

```json
{
  "loginName": "admin@school-a.fg",
  "password": "<password supplied at runtime>",
  "portal": "ENTERPRISE",
  "workspaceKey": "school-a"
}
```

The login `account` object and the session response use this shape (IDs are illustrative, not seeded accounts):

```json
{
  "accountId": "6f7ce810-905a-4c55-8269-338b32ba2001",
  "loginName": "admin@school-a.fg",
  "role": "SME_ADMIN",
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "workspaceKey": "school-a",
  "mustChangePassword": false
}
```

After required password setup, use `account.workspaceId` from login (or `workspaceId` from session) for GET/POST/PUT `/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000/specification`. An absent specification returns 404; POST creates it. Setup-only accounts remain forbidden from specification routes. Other-workspace UUIDs return 404, and a readable key in a UUID route returns 400. The backend still resolves current membership on every request; knowledge of a UUID is not permission.

JWTs use HS256, a fixed issuer/audience and a 15-minute lifetime (`auth.jwt.ttl`, supported range one second to one hour). Claims contain only account/session identifiers and standard token metadata; passwords, roles and workspace data are not embedded. Every authenticated request validates the signature/expiry and checks the persisted session plus the current enabled account, role and original portal/workspace scope. Logout ends only the current session. Multiple logins have independent sessions. Current password changes retain existing sessions; authorization and setup restrictions are always rechecked from the database.

Tokens are accepted only through `Authorization: Bearer ...`; there is no authentication cookie or HTTP session. CSRF is disabled for this header-only API. HTTPS is required outside local development. The browser integration should keep access tokens in memory and must not log them. No refresh token is issued: expiry requires login again. The API currently has no cross-origin browser configuration; use Swagger on the backend origin until frontend integration defines allowed origins.

Missing/invalid credentials, disabled accounts and portal/workspace mismatches return a generic 401 without identifying the matching credential. Invalid request fields/password policy return 400, setup/flow restrictions return 403, and concurrent persistence conflicts return 409. The password policy currently requires a different, nonblank password of at least 12 characters and no more than 72 UTF-8 bytes. JSON validation errors do not echo passwords.

Workspace provisioning/activation, onboarding destinations, member creation/contact delivery, account recovery, login rate limiting, and audit-module integration are not implemented. There is no public signup or provisioning endpoint. The opt-in local bootstrap supplies a real persisted Platform Admin for local testing; enterprise provisioning belongs to the later workspace/member features. Each future business endpoint must additionally enforce its role, workspace, assignment and object rules; `ACCOUNT_READY` alone is not business authorization. Production deployment still needs login throttling and a retention policy for expired session records.

- `ArchitectureTest` checks module privacy, service interfaces, layers, infrastructure independence and cycles. Empty selections are allowed while layers contain no business classes.
- `ArchitectureRulesSelfTest` proves that illegal entity/repository access and entity-leaking service contracts are rejected; service-interface consumers are allowed.
- `AuthTest` exercises the real HTTP security chain, JWT signing/validation and service logic with mocked repositories: scope checks, setup restrictions, password validation, disabled accounts, current roles, expiry and revocation. It does not prove database transactions.
- `AuthWorkspaceMigrationIT` exercises V4-to-V5 conversion in isolated PostgreSQL schemas: UUID/key mapping, retained/revoked sessions, mismatched-pair rejection, and safe failure/retry for unmapped account keys. `WorkspaceIT` verifies that an SME Admin can use the session UUID for specifications without platform directory access. These tests require Docker; a skip is not migration validation.
- `SwaggerTest` verifies local Swagger assets, auth operations and the Bearer security scheme.
- `FraudGuardApplicationIT` starts PostgreSQL, applies migrations, validates entity mappings and tests persisted login/password/logout behavior plus protection of removed routes. Testcontainers skips it without Docker; a skipped integration test is not database validation.
- `PlanOfferIT` uses PostgreSQL and the real HTTP/JWT chain to test catalogue writes, pagination/filters, history, validation, role/setup restrictions, stale/concurrent edits and rollback if history cannot be saved. It also requires Docker.
- `WorkspaceIT` uses PostgreSQL and real JWT requests for workspace scoping, metadata versions, independent Staff assignment/removal, concurrent edits, eligible-Staff filtering, text specifications, member directory isolation, rejection of workflow-field injection and transactional history rollback. All account/workspace fixture records are synthetic and created only in isolated test containers.

## Plan-offer catalogue API

This implements SRS 3.4.1-3.4.2 only. `PlanOfferController -> PlanOfferService -> PlanOfferServiceImpl -> PlanOfferRepository / PlanOfferHistoryRepository` follows the agreed layers. All six operations require a current, enabled Platform Admin session with initial password setup completed. Staff and enterprise accounts cannot use this administrative catalogue, even if they know an offer UUID. The service rechecks authorization through the auth service interface; no client-supplied actor, role or workspace is trusted.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/v1/plan-offers` | Create an offer; returns 201 and a Location header. |
| GET | `/api/v1/plan-offers` | List with optional `search` (literal case-insensitive name substring), `planType`, `available`, `page` and `size`. |
| GET | `/api/v1/plan-offers/{id}` | Read current metadata and version. |
| PUT | `/api/v1/plan-offers/{id}` | Replace metadata using `{ "version": currentVersion, "offer": { ... } }`. |
| POST | `/api/v1/plan-offers/{id}/retire` | Set availability to false using `{ "version": currentVersion }`; retains the offer and history. |
| GET | `/api/v1/plan-offers/{id}/history` | Read immutable saved snapshots with actor UUID and UTC timestamp, newest version first. |

List and history responses contain `items`, zero-based `page`, `size`, `totalElements`, and `totalPages`. Page defaults to 0, size to 20; size must be 1-100 and the offset (`page * size`) must fit a signed 32-bit integer for JPA. Catalogue ordering is name then UUID. Search is limited to 100 characters; an unmatched search returns an empty page. Administrative listing includes available and retired offers unless filtered.

Create and the nested update `offer` share the following metadata fields. Availability is accepted only at creation:

| Field | Contract |
| --- | --- |
| `name` | Nonblank, at most 120 characters. Names are descriptions, not unique identifiers; UUID identifies an offer. |
| `description` | Nonblank, at most 2,000 characters; never changes backend entitlements. |
| `planType` | `FREE` or `SUBSCRIPTION` only. |
| `monthlyPrice`, `annualPrice` | Required nonnegative decimals; at most 15 integer digits and 4 fractional digits. Free requires both to be zero. These are technical storage limits, not approved product prices. |
| `currency` | Required uppercase ISO 4217 code. Recording a code does not establish payment-provider support. |
| `taxTreatment` | Required descriptive metadata, at most 500 characters. Records the commercial offer's supplied treatment; performs no tax calculation. |
| `available` | Required boolean on create only. Not accepted in a metadata update; use the retirement endpoint to stop availability. |

`PUT /api/v1/plan-offers/{id}` now uses a dedicated `PlanOfferMetadataRequest` inside `offer`. Sending `available` in this object returns 400; accepted updates preserve the existing availability. Unknown update properties are rejected. There is no reactivation endpoint in the agreed scope. This changes the earlier update payload contract: callers must omit `available` on PUT, while POST creation still requires it.

No commercial price/currency/tax default or seed offer is supplied: the administrator must enter the approved offer. Do not use test fixture amounts as product prices. Offer editing does not allocate a plan, start validity, grant permissions or process payments. There is no DELETE endpoint, including for unused offers; stop availability instead. Existing and future grant/purchase histories must retain their own accepted terms rather than reading mutable catalogue prices as historical truth.

Create starts at version 0. Updates and first retirement increment the version. Submit the version returned by GET; stale versions and optimistic locking races return 409. Invalid payloads, prices, currency or pagination return 400; unauthenticated calls return 401; disallowed accounts return 403; an authorized request for a missing UUID returns 404. Retiring an already unavailable offer at its current version is a no-op. Each successful mutation saves an attributed full snapshot in the same database transaction; failure to save history rolls back the offer mutation. This is subscription-local history, not the unimplemented platform-wide audit API.

To try this in Swagger, log in as Platform Admin, complete initial password setup, then Authorize with the JWT. Create a commercial offer using the fields above, copy its `id` and `version`, inspect it, submit a versioned update, retire it using the latest version, and inspect `/history`. Restart the backend to apply V3 and expose these routes. Migration/build verification uses isolated Testcontainers databases; the agent does not migrate a shared database as part of tests.

## Workspace administration API

These APIs implement the metadata/assignment portions of SRS 3.3.1, 3.3.3 and 3.3.4, plus text information from 3.5.1. They do not implement workspace provisioning (3.3.2), protected file uploads, progress/readiness/approval/activation or entitlement changes. There is no POST `/api/v1/workspaces` and no workspace DELETE endpoint. Secure setup delivery and atomic workspace/initial SME Admin provisioning must be designed before adding creation. A new local database therefore has an empty workspace list; no demo workspaces or customer accounts are seeded. Do not insert manual production records as a substitute for provisioning.

The workspace table holds the one-to-one enterprise/workspace administrative metadata. `workspaceKey` is immutable, lowercase alphanumeric/hyphen, at most 64 characters, and corresponds to auth account scope; `id` is the immutable UUID used in routes. Enterprise name is unique ignoring case. Neither identifier is accepted by metadata PUT.

`WorkspaceController -> WorkspaceService -> WorkspaceServiceImpl -> workspace repositories` follows the agreed layers. It uses only auth's public interfaces/DTOs for sessions and eligible Staff; it never imports auth entities or repositories.

All routes require a current enabled account with initial password setup completed:

| Method | Path | Permission and behavior |
| --- | --- | --- |
| GET | `/api/v1/workspaces` | Platform Admin lists all; Staff lists only currently assigned workspaces. Optional `search` matches enterprise name or workspace key, with pagination. |
| GET | `/api/v1/workspaces/{id}` | Platform Admin or currently assigned Staff reads administrative metadata. |
| PUT | `/api/v1/workspaces/{id}` | Platform Admin updates only enterprise/contact metadata with the current `version`. |
| GET | `/api/v1/workspaces/{id}/history` | Platform Admin or assigned Staff reads local metadata, assignment and specification history. |
| GET | `/api/v1/workspaces/{id}/eligible-staff` | Platform Admin searches/paginates currently enabled platform Staff. Returns only Staff UUID and internal login; does not expose credentials. |
| GET | `/api/v1/workspaces/{id}/staff-assignments` | Platform Admin or assigned Staff lists active assignment references and the current `workspaceVersion`. |
| POST | `/api/v1/workspaces/{id}/staff-assignments` | Platform Admin assigns one eligible Staff using `{ "staffId": "UUID", "version": currentWorkspaceVersion }`. |
| DELETE | `/api/v1/workspaces/{id}/staff-assignments/{staffId}?version=N` | Platform Admin removes only that assignment, retains its row/history and returns the resulting assignment status/version. Does not delete an account or workspace. |
| GET | `/api/v1/workspaces/{id}/specification` | Platform Admin, currently assigned Staff or own-workspace SME Admin reads submitted text specifications. |
| POST | `/api/v1/workspaces/{id}/specification` | The same roles submit initial text specifications; returns 201. Existing specification returns 409. |
| PUT | `/api/v1/workspaces/{id}/specification` | The same roles replace text using `{ "version": currentSpecificationVersion, "specification": { ... } }`. Requires an existing specification. |
| GET | `/api/v1/workspaces/{id}/specification/history` | The same roles read only specification events. SME Admin cannot use the broader workspace administration history endpoint. |

Metadata PUT accepts `version`, `enterpriseName` (nonblank, max 255), `contactName` (nonblank, max 120), `contactEmail` (valid nonblank email, max 254), and optional `contactPhone` (max 40). Unknown properties are rejected; roles, workspace keys, assignments, activation and entitlement cannot be changed through this form. Contact email is administrative information and does not change any login identifier or send email.

Specification POST accepts `businessSpecification` (nonblank, max 10,000 characters), optional `fieldDescriptions` and optional `knownAnomalyConditions` (each max 10,000). Specification PUT wraps those fields with its current version. Unknown specification/update properties are rejected. Text storage does not upload files, analyze requirements automatically, generate rules, submit readiness, approve handover or activate production. No field claims those later workflows have completed. An absent specification returns 404, explicitly representing not yet submitted; PUT never silently creates one.

Workspace metadata and assignment mutations share the workspace's `version`. Staff mutations lock the workspace row and compare the expected version before changing one link; stale concurrent requests return 409 and must refresh. Other Staff links remain active. Assigning an already active Staff or removing an absent/inactive assignment at the current version is a no-op. Reassignment can reactivate the retained link. Removed Staff loses access on subsequent requests; specification writers serialize with assignment changes through the same workspace lock. Specifications have their own independent `version`.

Lists default to `page=0&size=20`; size is 1-100, search at most 100 characters, and offsets must fit JPA's signed 32-bit range. Workspace ordering is enterprise name then UUID; assignment ordering is Staff UUID; eligible Staff ordering is login then UUID; history ordering is newest timestamp then UUID. Invalid inputs return 400, disallowed roles 403, missing/inaccessible workspace references 404, stale/duplicate metadata or specifications 409. Unassigned Staff and cross-workspace SME Admin references do not reveal whether the workspace exists.

Required local history is committed in the same transaction as each mutation. Metadata/specification edits retain explicit before/after snapshots; assignment events record the Staff UUID without secrets. A history write failure rolls back the related change. Own-workspace SME Admin sees specification history only. This is object-scoped local history, not a global audit privilege/API.

## Enterprise member read API

`GET /api/v1/members?search=&page=0&size=20` and `GET /api/v1/members/{id}` implement the read portion of SRS 3.6.1. Only a current SME Admin with completed password setup can access them. Workspace scope is resolved from the persisted authenticated account; no client workspace selector is accepted. Other-workspace and platform-account IDs return 404. Lists include enabled/disabled SME Admin, Operator and Investigator accounts only, with literal case-insensitive login search, default 20/max 100 items and bounded offsets. Responses contain UUID, internal login, role, enabled state and initial-password-change state; never password hashes, tokens or contact assumptions.

`MemberController -> MemberService -> MemberServiceImpl -> AuthService -> auth repository` preserves credential ownership. The auth directory exposes safe public DTOs rather than sharing its entities/repositories or creating a duplicate member account table. Contact/provisioning delivery, account creation, role/access mutations and sensitive-field grants remain deferred. Reads do not grant plaintext or case access.

Workspace provisioning plus initial SME Admin setup, member role/access changes, protected files, field/mapping/rule draft workflows, grants, checkout/payment and activation remain deferred for joint design and implementation. These are not safe standalone CRUD shortcuts. Current implemented routes total 25: 5 auth, 6 offers, 12 workspace/assignment/specification and 2 member reads; this is not the API count of the full specification.

Implement one feature at a time with its DTOs, authorization, service interface/implementation, repository, entity/migration where needed and meaningful tests. Update this README as routes become real. Runtime dependency arrows should reflect real service/event relationships after those are implemented.
