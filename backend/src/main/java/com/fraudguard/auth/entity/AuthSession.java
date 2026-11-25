package com.fraudguard.auth.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import java.util.Objects;

@Entity
@Table(name = "auth_sessions")
public class AuthSession {
    @Id
    private UUID id;
    @Column(name = "account_id", nullable = false)
    private UUID accountId;
    @Column(name = "workspace_id")
    private UUID workspaceId;
    @Column(name = "workspace_key", length = 64)
    private String workspaceKey;
    @Column(name = "platform_scope", nullable = false)
    private boolean platformScope;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private boolean revoked;

    protected AuthSession() { }

    public AuthSession(Account account, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.accountId = account.getId();
        this.workspaceId = account.getWorkspaceId();
        this.workspaceKey = account.getWorkspaceKey();
        this.platformScope = account.getRole().isPlatformRole();
        this.expiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public UUID getAccountId() { return accountId; }
    public boolean matchesScope(Account account) {
        return accountId.equals(account.getId()) && Objects.equals(workspaceId, account.getWorkspaceId())
                && Objects.equals(workspaceKey, account.getWorkspaceKey())
                && platformScope == account.getRole().isPlatformRole();
    }
    public boolean isActive(Instant now) { return !revoked && now.isBefore(expiresAt); }
    public void revoke() { revoked = true; }
}
