package com.fraudguard.ingestion.internal.transaction;

import com.fraudguard.common.BaseTenantEntity;
import com.fraudguard.ingestion.api.IngestionChannel;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "transactions")
public class Transaction extends BaseTenantEntity {

    @Column(name = "transaction_id", nullable = false, updatable = false)
    private String transactionId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_channel", nullable = false)
    private IngestionChannel sourceChannel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "semantic_fields", nullable = false)
    private Map<String, Object> semanticFields;

    protected Transaction() {
    }

    public Transaction(String tenantId, String transactionId, Instant occurredAt,
                       IngestionChannel sourceChannel, Map<String, Object> semanticFields) {
        super(tenantId);
        this.transactionId = transactionId;
        this.occurredAt = occurredAt;
        this.sourceChannel = sourceChannel;
        this.semanticFields = semanticFields;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public IngestionChannel getSourceChannel() {
        return sourceChannel;
    }

    public Map<String, Object> getSemanticFields() {
        return semanticFields;
    }
}
