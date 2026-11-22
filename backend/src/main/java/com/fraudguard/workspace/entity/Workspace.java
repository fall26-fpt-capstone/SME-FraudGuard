package com.fraudguard.workspace.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspaces")
public class Workspace {
    @Id private UUID id;
    @Column(name = "workspace_key", nullable = false, unique = true, updatable = false, length = 64)
    private String workspaceKey;
    @Column(name = "enterprise_name", nullable = false, length = 255) private String enterpriseName;
    @Column(name = "contact_name", nullable = false, length = 120) private String contactName;
    @Column(name = "contact_email", nullable = false, length = 254) private String contactEmail;
    @Column(name = "contact_phone", length = 40) private String contactPhone;
    @Version private Long version;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected Workspace() { }

    public Workspace(String workspaceKey, String enterpriseName, String contactName, String contactEmail, String contactPhone) {
        id = UUID.randomUUID();
        this.workspaceKey = workspaceKey;
        createdAt = Instant.now();
        updateMetadata(enterpriseName, contactName, contactEmail, contactPhone);
    }

    public void updateMetadata(String enterpriseName, String contactName, String contactEmail, String contactPhone) {
        this.enterpriseName = enterpriseName;
        this.contactName = contactName;
        this.contactEmail = contactEmail;
        this.contactPhone = contactPhone;
        touch();
    }

    public void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public String getWorkspaceKey() { return workspaceKey; }
    public String getEnterpriseName() { return enterpriseName; }
    public String getContactName() { return contactName; }
    public String getContactEmail() { return contactEmail; }
    public String getContactPhone() { return contactPhone; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
