# SME-FraudGuard

SME-FraudGuard is a multi-tenant SaaS platform for transaction anomaly detection in SMEs.

Shared coding-agent guidelines are in [`AGENTS.md`](AGENTS.md). Read them together with the instructions for the area you are changing.

## Project structure

```text
SME-FraudGuard/
├── backend/       # Spring Boot backend
├── frontend/      # Frontend application
├── ai-service/    # AI/ML service
├── infra/         # Deployment and infrastructure configuration
├── database/      # Shared database scripts and supporting assets
└── docs/          # Project documentation
    ├── 01_Registration/
    ├── 02_Reports/
    ├── 03_SelfReview/
    └── diagrams/
```

`backend/` contains implemented auth, plan catalogue, enterprise metadata, Staff assignment, text specification and member-read APIs. `frontend/` contains independent dashboard and landing-page applications; the dashboard uses demo data and is not yet connected to these APIs. `ai-service/`, `database/` and `infra/` remain placeholders. Implemented database migrations live under `backend/src/main/resources/db/migration/`.

Use [the business specification](docs/02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md) for agreed target behavior, [the backend README](backend/README.md) for implemented API contracts and gaps, and [the frontend README](frontend/README.md) for application commands. Business-facing terminology is Enterprise / Doanh nghiệp; `workspace` remains the technical name for each enterprise's isolated scope.

## Backend

See [`backend/README.md`](backend/README.md) for backend architecture, setup, local development, build, and test instructions.
