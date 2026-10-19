-- Single-schema multi-tenancy: every business table carries tenant_id.
-- No foreign keys across module boundaries (ingestion / ruleengine / dashboard):
-- cases.transaction_id is a plain reference to the external transaction id.

CREATE TABLE transactions (
    id              UUID         PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    transaction_id  VARCHAR(128) NOT NULL,
    occurred_at     TIMESTAMPTZ  NOT NULL,
    source_channel  VARCHAR(32)  NOT NULL,
    semantic_fields JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_transactions_tenant_txn UNIQUE (tenant_id, transaction_id)
);
CREATE INDEX idx_transactions_tenant_occurred ON transactions (tenant_id, occurred_at DESC);

CREATE TABLE rules (
    id              UUID         PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(32)  NOT NULL,
    current_version INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_rules_tenant_name UNIQUE (tenant_id, name)
);
CREATE INDEX idx_rules_tenant_status ON rules (tenant_id, status);

CREATE TABLE rule_versions (
    id             UUID         PRIMARY KEY,
    tenant_id      VARCHAR(64)  NOT NULL,
    rule_id        UUID         NOT NULL REFERENCES rules (id),
    version_number INTEGER      NOT NULL,
    definition     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    published      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by     VARCHAR(128),
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_rule_versions_rule_version UNIQUE (rule_id, version_number)
);
CREATE INDEX idx_rule_versions_tenant ON rule_versions (tenant_id);

CREATE TABLE cases (
    id             UUID             PRIMARY KEY,
    tenant_id      VARCHAR(64)      NOT NULL,
    transaction_id VARCHAR(128)     NOT NULL,
    status         VARCHAR(32)      NOT NULL,
    severity       VARCHAR(16)      NOT NULL,
    score          DOUBLE PRECISION NOT NULL,
    assignee       VARCHAR(128),
    opened_at      TIMESTAMPTZ      NOT NULL,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ      NOT NULL,
    updated_at     TIMESTAMPTZ      NOT NULL
);
CREATE INDEX idx_cases_tenant_status_opened ON cases (tenant_id, status, opened_at DESC);
CREATE INDEX idx_cases_tenant_transaction ON cases (tenant_id, transaction_id);
