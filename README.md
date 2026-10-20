# SME-FraudGuard

SME-FraudGuard is a multi-tenant SaaS platform for transaction anomaly detection in SMEs.

## Project structure

```text
SME-FraudGuard/
├── backend/       # Spring Boot backend
├── frontend/      # Frontend application
├── ai-service/    # AI/ML service
├── infra/         # Deployment and infrastructure configuration
├── database/      # Shared database scripts and supporting assets
└── docs/          # Project documentation
    ├── registration/
    ├── reports/
    ├── review-2/
    └── diagrams/
```

The existing backend project has been moved into `backend/`. Other top-level areas are currently placeholders and will be filled as the project progresses.

## Backend

See [`backend/README.md`](backend/README.md) for backend architecture, setup, local development, build, and test instructions.
