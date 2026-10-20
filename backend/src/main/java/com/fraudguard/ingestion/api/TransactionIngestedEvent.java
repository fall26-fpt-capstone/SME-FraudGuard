package com.fraudguard.ingestion.api;

import java.time.Instant;
import java.util.Map;

/**
 * The only contract between {@code ingestion} and {@code ruleengine}.
 * Published right after a transaction has been stored successfully.
 */
public record TransactionIngestedEvent(
        String tenantId,
        String transactionId,
        Instant occurredAt,
        Map<String, Object> semanticFields // actor_id, numeric_value, device_id, ...
) {
}
