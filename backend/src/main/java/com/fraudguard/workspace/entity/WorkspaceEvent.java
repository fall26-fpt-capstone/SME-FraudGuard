package com.fraudguard.workspace.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspace_history")
public class WorkspaceEvent {
    @Id private UUID id;
    @Column(name = "workspace_id", nullable = false, updatable = false) private UUID workspaceId;
    @Column(name = "actor_id", nullable = false, updatable = false) private UUID actorId;
    @Column(nullable = false, updatable = false, length = 32) private String action;
    @Column(name = "workspace_version", nullable = false, updatable = false) private long workspaceVersion;
    @Column(name = "occurred_at", nullable = false, updatable = false) private Instant occurredAt;
    @Column(nullable = false, updatable = false, columnDefinition = "text") private String details;

    protected WorkspaceEvent() { }

    public WorkspaceEvent(UUID workspaceId, UUID actorId, String action, long workspaceVersion, String details) {
        id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.actorId = actorId;
        this.action = action;
        this.workspaceVersion = workspaceVersion;
        this.details = details;
        occurredAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getActorId() { return actorId; }
    public String getAction() { return action; }
    public long getWorkspaceVersion() { return workspaceVersion; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getDetails() { return details; }
}
