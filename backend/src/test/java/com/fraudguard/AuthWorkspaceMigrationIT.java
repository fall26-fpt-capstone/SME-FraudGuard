package com.fraudguard;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@Testcontainers(disabledWithoutDocker = true)
class AuthWorkspaceMigrationIT {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private String schema;

    @BeforeEach
    void prepareLegacySchema() {
        schema = "migration_" + UUID.randomUUID().toString().replace("-", "");
        flyway("4").migrate();
    }

    @Test
    void resolvesUuidRetainsKeysAndHistoryAndRevokesOnlyEnterpriseSessions() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        UUID enterprise = UUID.randomUUID();
        UUID platform = UUID.randomUUID();
        try (var db = connection(); var sql = db.createStatement()) {
            insertWorkspace(db, workspaceId, "school-a");
            sql.executeUpdate("INSERT INTO auth_accounts (id, login_name, password_hash, role, workspace_id) VALUES "
                    + "('" + enterprise + "', 'admin@school-a.fg', 'synthetic-hash', 'SME_ADMIN', 'school-a'),"
                    + "('" + platform + "', 'platform', 'synthetic-hash', 'PLATFORM_ADMIN', NULL)");
            sql.executeUpdate("INSERT INTO auth_sessions (id, account_id, workspace_id, platform_scope, expires_at) VALUES "
                    + "('" + UUID.randomUUID() + "', '" + enterprise + "', 'school-a', FALSE, now() + interval '1 hour'),"
                    + "('" + UUID.randomUUID() + "', '" + enterprise + "', 'old-unmapped-key', FALSE, now() + interval '1 hour'),"
                    + "('" + UUID.randomUUID() + "', '" + platform + "', NULL, TRUE, now() + interval '1 hour')");
        }

        flyway(null).migrate();

        try (var db = connection(); var sql = db.createStatement()) {
            try (var rows = sql.executeQuery("SELECT workspace_id, workspace_key, password_hash, must_change_password "
                    + "FROM auth_accounts WHERE id = '" + enterprise + "'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getObject("workspace_id", UUID.class)).isEqualTo(workspaceId);
                assertThat(rows.getString("workspace_key")).isEqualTo("school-a");
                assertThat(rows.getString("password_hash")).isEqualTo("synthetic-hash");
                assertThat(rows.getBoolean("must_change_password")).isTrue();
            }
            try (var rows = sql.executeQuery("SELECT count(*) AS total, count(*) FILTER (WHERE revoked) AS revoked "
                    + "FROM auth_sessions WHERE NOT platform_scope")) {
                rows.next();
                assertThat(rows.getInt("total")).isEqualTo(2);
                assertThat(rows.getInt("revoked")).isEqualTo(2);
            }
            try (var rows = sql.executeQuery("SELECT revoked, workspace_id, workspace_key FROM auth_sessions WHERE platform_scope")) {
                rows.next();
                assertThat(rows.getBoolean("revoked")).isFalse();
                assertThat(rows.getObject("workspace_id")).isNull();
                assertThat(rows.getString("workspace_key")).isNull();
            }
            UUID otherId = UUID.randomUUID();
            insertWorkspace(db, otherId, "school-b");
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE auth_accounts SET workspace_id = '" + otherId
                    + "' WHERE id = '" + enterprise + "'"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("fk_auth_account_workspace");
        }
    }

    @Test
    void unmappedAccountStopsMigrationWithoutChangingItsScopeAndCanBeReconciled() throws Exception {
        try (var db = connection(); var sql = db.createStatement()) {
            sql.executeUpdate("INSERT INTO auth_accounts (id, login_name, password_hash, role, workspace_id) VALUES ('"
                    + UUID.randomUUID() + "', 'admin@missing.fg', 'synthetic-hash', 'SME_ADMIN', 'missing')");
        }
        assertThatThrownBy(() -> flyway(null).migrate())
                .hasMessageContaining("account workspace keys have no matching workspace");
        UUID verifiedId = UUID.randomUUID();
        try (var db = connection(); var sql = db.createStatement()) {
            try (var rows = sql.executeQuery("SELECT workspace_id FROM auth_accounts")) {
                rows.next();
                assertThat(rows.getString("workspace_id")).isEqualTo("missing");
            }
            insertWorkspace(db, verifiedId, "missing");
        }
        flyway(null).migrate();
        try (var db = connection(); var sql = db.createStatement();
             var rows = sql.executeQuery("SELECT workspace_id, workspace_key FROM auth_accounts")) {
            rows.next();
            assertThat(rows.getObject("workspace_id", UUID.class)).isEqualTo(verifiedId);
            assertThat(rows.getString("workspace_key")).isEqualTo("missing");
        }
    }

    private Flyway flyway(String target) {
        var config = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration");
        if (target != null) { config.target(target); }
        return config.load();
    }

    private Connection connection() throws SQLException {
        var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        connection.setSchema(schema);
        return connection;
    }

    private void insertWorkspace(Connection db, UUID id, String key) throws SQLException {
        try (var sql = db.prepareStatement("INSERT INTO workspaces "
                + "(id, workspace_key, enterprise_name, contact_name, contact_email, version, created_at, updated_at) "
                + "VALUES (?, ?, ?, 'Synthetic contact', 'contact@example.org', 0, now(), now())")) {
            sql.setObject(1, id);
            sql.setString(2, key);
            sql.setString(3, "Synthetic " + key);
            sql.executeUpdate();
        }
    }
}
