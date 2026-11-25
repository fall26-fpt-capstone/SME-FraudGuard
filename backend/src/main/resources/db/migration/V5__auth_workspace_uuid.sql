-- Resolve legacy account keys before changing their meaning. Do not fabricate workspaces.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM auth_accounts a
        LEFT JOIN workspaces w ON w.workspace_key = a.workspace_id
        WHERE a.workspace_id IS NOT NULL AND w.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot migrate auth workspace scope: account workspace keys have no matching workspace. Reconcile verified workspace records before retrying V5.';
    END IF;
END $$;

ALTER TABLE auth_accounts RENAME COLUMN workspace_id TO workspace_key;
ALTER TABLE auth_accounts ADD COLUMN workspace_id UUID;
UPDATE auth_accounts a SET workspace_id = w.id
FROM workspaces w WHERE w.workspace_key = a.workspace_key;

-- Both values are immutable workspace identity; prevent mismatched UUID/key pairs.
ALTER TABLE workspaces ADD CONSTRAINT uq_workspace_id_key UNIQUE (id, workspace_key);
ALTER TABLE auth_accounts DROP CONSTRAINT ck_auth_account_scope;
ALTER TABLE auth_accounts ADD CONSTRAINT ck_auth_account_scope CHECK (
    (role IN ('PLATFORM_ADMIN', 'IMPLEMENTATION_STAFF') AND workspace_id IS NULL AND workspace_key IS NULL) OR
    (role IN ('SME_ADMIN', 'OPERATOR', 'INVESTIGATOR') AND workspace_id IS NOT NULL AND workspace_key IS NOT NULL)
);
ALTER TABLE auth_accounts ADD CONSTRAINT fk_auth_account_workspace
    FOREIGN KEY (workspace_id, workspace_key) REFERENCES workspaces(id, workspace_key);

ALTER TABLE auth_sessions RENAME COLUMN workspace_id TO workspace_key;
ALTER TABLE auth_sessions ADD COLUMN workspace_id UUID;
UPDATE auth_sessions s SET workspace_id = w.id
FROM workspaces w WHERE w.workspace_key = s.workspace_key;

-- Retain historical sessions, but require enterprise users to log in under the new contract.
-- This also closes stale sessions whose old scope no longer maps to a workspace.
UPDATE auth_sessions SET revoked = TRUE WHERE NOT platform_scope;
ALTER TABLE auth_sessions ADD CONSTRAINT fk_auth_session_workspace
    FOREIGN KEY (workspace_id, workspace_key) REFERENCES workspaces(id, workspace_key);
