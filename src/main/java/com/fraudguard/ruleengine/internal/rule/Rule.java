package com.fraudguard.ruleengine.internal.rule;

import com.fraudguard.common.BaseTenantEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

@Entity
@Table(name = "rules")
public class Rule extends BaseTenantEntity {

    @Column(nullable = false)
    private String name;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RuleStatus status = RuleStatus.DRAFT;

    @Column(name = "current_version", nullable = false)
    private int currentVersion;

    protected Rule() {
    }

    public Rule(String tenantId, String name, String description) {
        super(tenantId);
        this.name = name;
        this.description = description;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public RuleStatus getStatus() {
        return status;
    }

    public int getCurrentVersion() {
        return currentVersion;
    }
}
