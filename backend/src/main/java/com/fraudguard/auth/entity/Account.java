package com.fraudguard.auth.entity;

import com.fraudguard.auth.dto.response.Role;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "auth_accounts")
public class Account {
    @Id
    private UUID id;
    @Column(name = "login_name", nullable = false, unique = true, length = 128)
    private String loginName;
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;
    @Column(name = "workspace_id", length = 64)
    private String workspaceId;
    @Column(nullable = false)
    private boolean enabled;
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    protected Account() { }

    public Account(String loginName, String passwordHash, Role role, String workspaceId) {
        if (role.isPlatformRole() ? workspaceId != null : workspaceId == null || workspaceId.isBlank()) {
            throw new IllegalArgumentException("Account role and workspace scope do not match");
        }
        this.id = UUID.randomUUID();
        this.loginName = loginName;
        this.passwordHash = passwordHash;
        this.role = role;
        this.workspaceId = workspaceId;
        this.enabled = true;
        this.mustChangePassword = true;
    }

    public UUID getId() { return id; }
    public String getLoginName() { return loginName; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public String getWorkspaceId() { return workspaceId; }
    public boolean isEnabled() { return enabled; }
    public boolean isMustChangePassword() { return mustChangePassword; }

    public void changePassword(String hash) {
        passwordHash = hash;
        mustChangePassword = false;
    }
}
