package com.fraudguard.workspace.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspace_staff_assignments")
public class StaffAssignment {
    @Id private UUID id;
    @Column(name = "workspace_id", nullable = false, updatable = false) private UUID workspaceId;
    @Column(name = "staff_id", nullable = false, updatable = false) private UUID staffId;
    @Column(nullable = false) private boolean active;
    @Column(name = "assigned_at", nullable = false) private Instant assignedAt;

    protected StaffAssignment() { }

    public StaffAssignment(UUID workspaceId, UUID staffId) {
        id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.staffId = staffId;
        assign();
    }

    public void assign() { active = true; assignedAt = Instant.now(); }
    public void remove() { active = false; }
    public UUID getStaffId() { return staffId; }
    public boolean isActive() { return active; }
    public Instant getAssignedAt() { return assignedAt; }
}
