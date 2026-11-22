CREATE TABLE auth_accounts (
    id UUID PRIMARY KEY,
    login_name VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN (
        'PLATFORM_ADMIN', 'IMPLEMENTATION_STAFF', 'SME_ADMIN', 'OPERATOR', 'INVESTIGATOR')),
    workspace_id VARCHAR(64),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_auth_account_scope CHECK (
        (role IN ('PLATFORM_ADMIN', 'IMPLEMENTATION_STAFF') AND workspace_id IS NULL) OR
        (role IN ('SME_ADMIN', 'OPERATOR', 'INVESTIGATOR') AND workspace_id IS NOT NULL
            AND length(trim(workspace_id)) > 0))
);

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES auth_accounts(id),
    workspace_id VARCHAR(64),
    platform_scope BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_auth_sessions_account ON auth_sessions(account_id);
