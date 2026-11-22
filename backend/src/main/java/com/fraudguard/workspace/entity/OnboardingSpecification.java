package com.fraudguard.workspace.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspace_specifications")
public class OnboardingSpecification {
    @Id @Column(name = "workspace_id") private UUID workspaceId;
    @Column(name = "business_specification", nullable = false, length = 10000) private String businessSpecification;
    @Column(name = "field_descriptions", length = 10000) private String fieldDescriptions;
    @Column(name = "known_anomaly_conditions", length = 10000) private String knownAnomalyConditions;
    @Version private Long version;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected OnboardingSpecification() { }

    public OnboardingSpecification(UUID workspaceId, String businessSpecification,
            String fieldDescriptions, String knownAnomalyConditions) {
        this.workspaceId = workspaceId;
        update(businessSpecification, fieldDescriptions, knownAnomalyConditions);
    }

    public void update(String businessSpecification, String fieldDescriptions, String knownAnomalyConditions) {
        this.businessSpecification = businessSpecification;
        this.fieldDescriptions = fieldDescriptions;
        this.knownAnomalyConditions = knownAnomalyConditions;
        updatedAt = Instant.now();
    }

    public UUID getWorkspaceId() { return workspaceId; }
    public String getBusinessSpecification() { return businessSpecification; }
    public String getFieldDescriptions() { return fieldDescriptions; }
    public String getKnownAnomalyConditions() { return knownAnomalyConditions; }
    public Long getVersion() { return version; }
    public Instant getUpdatedAt() { return updatedAt; }
}
