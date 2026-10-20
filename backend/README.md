# FraudGuard-as-a-Service

Hệ thống phát hiện gian lận giao dịch cho SME, dạng SaaS multi-tenant (single-schema: mọi bảng nghiệp vụ có `tenant_id`).

**Stack:** Java 21 · Spring Boot 3.3 · Maven (wrapper) · PostgreSQL 16 · Flyway · JUnit 5 · ArchUnit · Testcontainers

> Đây là **khung sườn** (skeleton): cấu trúc package, hợp đồng giữa các module và luật kiến trúc đã có;
> logic nghiệp vụ thật (parse CSV, rule evaluation, severity, state machine của case, AI scoring...) để trống kèm `TODO`.

## Vì sao modular monolith

- Nhóm nhỏ, 2 backend dev: một process, một DB, một lần deploy — không tốn công vận hành microservices.
- Vẫn chia ranh giới rõ theo tính năng (package-by-feature) để hai dev code song song mà không giẫm chân nhau.
- Ranh giới được **máy kiểm tra** (ArchUnit) chứ không dựa vào kỷ luật cá nhân. Sau này nếu cần tách service,
  `api` của mỗi module chính là điểm cắt tự nhiên.

## Sơ đồ package

```
com.fraudguard
├── ingestion/                       Dev A
│   ├── api/        TransactionIngestedEvent, IngestionResult, IngestionChannel
│   └── internal/
│       ├── transaction/  Transaction entity, repository, service lưu + publish event, TransactionPayload (mapping dùng chung)
│       ├── csv/          upload CSV/Excel
│       ├── restapi/      REST + xác thực X-API-Key
│       └── webhook/      webhook (X-Signature), dùng chung TransactionPayload với restapi
├── ruleengine/                      Dev B
│   ├── api/        CaseQueryPort, CaseSummary, CaseStatus, Severity
│   └── internal/
│       ├── TransactionIngestedListener   lắng nghe event từ ingestion
│       ├── rule/        Rule, RuleVersion, evaluation + dry-run (stub)
│       ├── scoring/     gọi AI qua aiclient
│       └── casemgmt/    FraudCase (bảng `cases`), repository, CaseQueryPort impl
├── dashboard/                       Dev A
│   ├── api/
│   └── internal/reporting/   case queue, thống kê, export (gọi ruleengine qua CaseQueryPort)
├── aiclient/       contract tới AI service (FraudScoringClient + DTO) + stub trả điểm giả
└── common/         TenantContext, exception gốc, BaseTenantEntity (id, tenant_id, audit)
```

```
 client ──► ingestion ──(TransactionIngestedEvent)──► ruleengine ──► aiclient ──► AI service
                                                          ▲
                                       dashboard ─(CaseQueryPort)
```

## Luật `api` / `internal`

1. Mỗi module tính năng (`ingestion`, `ruleengine`, `dashboard`) có đúng 2 sub-package: `api` và `internal`.
2. **Không** package nào ngoài module được import `*.internal.*` của module đó — chỉ được dùng `*.api.*`.
3. `api` không được tham chiếu bất kỳ type nào trong `internal`.
4. Hướng phụ thuộc: `ruleengine → ingestion.api`, `dashboard → ruleengine.api`. Ingestion không biết ai nghe event của nó.
5. `common` và `aiclient` không phụ thuộc vào module tính năng; giữa các module không có vòng phụ thuộc.

Các luật này nằm trong [`ArchitectureTest`](src/test/java/com/fraudguard/ArchitectureTest.java) — **vi phạm là `./mvnw verify` fail**.
[`ArchitectureRulesSelfTest`](src/test/java/com/fraudguard/ArchitectureRulesSelfTest.java) chứng minh các luật bắt được lỗi thật
(dùng class vi phạm cố ý trong `src/test/java/com/archfixture`). Javadoc của `ArchitectureTest` có ví dụ tự tay gây lỗi để xem build fail.

### Event ingestion → ruleengine

`ingestion` lưu transaction rồi `ApplicationEventPublisher.publishEvent(new TransactionIngestedEvent(...))`.
`ruleengine` nghe bằng `@TransactionalEventListener(AFTER_COMMIT, fallbackExecution = true)` — chỉ chạy sau khi transaction của
ingestion đã commit. Lỗi bên ruleengine được log chứ không làm hỏng request ingest (TODO: outbox/retry).

## Chạy local

Yêu cầu: JDK 21, Docker. Không cần cài Maven (dùng `mvnw`).

```bash
docker compose up -d
./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run
```

Flyway tự migrate khi app khởi động (profile mặc định là `local`). Muốn migrate tay: `./mvnw flyway:migrate`.

Thử luồng end-to-end (log sẽ in `stored + published` rồi `consumed TransactionIngestedEvent`):

```bash
curl -X POST http://localhost:8080/api/v1/ingest/transactions \
  -H "Content-Type: application/json" -H "X-API-Key: demo-key-tenant-a" \
  -d '{"transactionId":"t-1","semanticFields":{"actor_id":"u1","numeric_value":120.5}}'

curl http://localhost:8080/api/v1/dashboard/cases -H "X-Tenant-Id: tenant-a"
```

Các endpoint khác: `POST /api/v1/ingest/csv` (multipart `file`, header `X-Tenant-Id`),
`POST /api/v1/ingest/webhook` (header `X-Tenant-Id`, `X-Signature`). Xác thực hiện chỉ là stub dev
(`X-Tenant-Id`, API key trong `application-local.yml`) — thay bằng auth thật sau.

## Build & test

```bash
./mvnw clean verify
```

- `*Test` (surefire): ArchUnit + unit test, không cần Docker.
- `*IT` (failsafe): chạy app với PostgreSQL thật qua Testcontainers; tự bỏ qua nếu máy không có Docker.

## Ghi chú thiết kế

- Entity `Case` tên là `FraudCase` (bảng `cases`) vì `CASE` là từ khóa của JPQL/HQL.
- `cases.transaction_id` là id nghiệp vụ, **không** có foreign key sang `transactions` — các module không chia sẻ ràng buộc DB.
- Cô lập tenant hiện mới ở mức cột `tenant_id` + `TenantContext`. TODO: ép lọc theo tenant ở tầng repository (Hibernate filter).
