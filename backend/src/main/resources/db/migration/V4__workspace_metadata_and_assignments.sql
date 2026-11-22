CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    workspace_key VARCHAR(64) NOT NULL UNIQUE CHECK (workspace_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    enterprise_name VARCHAR(255) NOT NULL CHECK (length(trim(enterprise_name)) > 0),
    contact_name VARCHAR(120) NOT NULL CHECK (length(trim(contact_name)) > 0),
    contact_email VARCHAR(254) NOT NULL,
    contact_phone VARCHAR(40),
    version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX uq_workspaces_enterprise_name ON workspaces(lower(enterprise_name));

CREATE TABLE workspace_staff_assignments (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    staff_id UUID NOT NULL,
    active BOOLEAN NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL,
    UNIQUE(workspace_id, staff_id)
);
CREATE INDEX idx_workspace_staff_active ON workspace_staff_assignments(staff_id, active, workspace_id);

CREATE TABLE workspace_specifications (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
    business_specification VARCHAR(10000) NOT NULL CHECK (length(trim(business_specification)) > 0),
    field_descriptions VARCHAR(10000),
    known_anomaly_conditions VARCHAR(10000),
    version BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE workspace_history (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    actor_id UUID NOT NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('METADATA_UPDATED', 'STAFF_ASSIGNED', 'STAFF_REMOVED',
        'SPECIFICATION_CREATED', 'SPECIFICATION_UPDATED')),
    workspace_version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    details TEXT NOT NULL
);
CREATE INDEX idx_workspace_history ON workspace_history(workspace_id, occurred_at DESC, id DESC);
