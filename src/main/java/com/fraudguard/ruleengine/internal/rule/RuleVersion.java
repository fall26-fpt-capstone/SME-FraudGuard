package com.fraudguard.ruleengine.internal.rule;

import com.fraudguard.common.BaseTenantEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Map;

@Entity
@Table(name = "rule_versions")
public class RuleVersion extends BaseTenantEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rule_id", nullable = false, updatable = false)
    private Rule rule;

    @Column(name = "version_number", nullable = false, updatable = false)
    private int versionNumber;

    /** TODO: define the rule DSL; for now an opaque JSON document. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Map<String, Object> definition;

    @Column(nullable = false)
    private boolean published;

    @Column(name = "created_by")
    private String createdBy;

    protected RuleVersion() {
    }

    public RuleVersion(String tenantId, Rule rule, int versionNumber, Map<String, Object> definition, String createdBy) {
        super(tenantId);
        this.rule = rule;
        this.versionNumber = versionNumber;
        this.definition = definition;
        this.createdBy = createdBy;
    }

    public Rule getRule() {
        return rule;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public Map<String, Object> getDefinition() {
        return definition;
    }

    public boolean isPublished() {
        return published;
    }

    public String getCreatedBy() {
        return createdBy;
    }
}
