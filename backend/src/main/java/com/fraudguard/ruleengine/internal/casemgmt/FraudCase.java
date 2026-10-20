package com.fraudguard.ruleengine.internal.casemgmt;

import com.fraudguard.common.BaseTenantEntity;
import com.fraudguard.ruleengine.api.CaseStatus;
import com.fraudguard.ruleengine.api.Severity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A fraud case (table {@code cases}). Named FraudCase rather than Case because CASE is a reserved word in JPQL/HQL.
 * {@code transactionId} is the external transaction id, deliberately not a foreign key into the ingestion module.
 */
@Entity
@Table(name = "cases")
public class FraudCase extends BaseTenantEntity {

    @Column(name = "transaction_id", nullable = false, updatable = false)
    private String transactionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseStatus status = CaseStatus.NEW;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Severity severity;

    @Column(nullable = false)
    private double score;

    private String assignee;

    @Column(name = "opened_at", nullable = false, updatable = false)
    private Instant openedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    protected FraudCase() {
    }

    public FraudCase(String tenantId, String transactionId, Severity severity, double score) {
        super(tenantId);
        this.transactionId = transactionId;
        this.severity = severity;
        this.score = score;
        this.openedAt = Instant.now();
    }

    public String getTransactionId() {
        return transactionId;
    }

    public CaseStatus getStatus() {
        return status;
    }

    public Severity getSeverity() {
        return severity;
    }

    public double getScore() {
        return score;
    }

    public String getAssignee() {
        return assignee;
    }

    public Instant getOpenedAt() {
        return openedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    // TODO: state machine (NEW -> IN_REVIEW -> RESOLVED | ESCALATED ...) with guarded transitions.
}
