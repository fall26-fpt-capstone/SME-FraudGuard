package com.fraudguard.aiclient;

import java.time.Instant;
import java.util.Map;

/** JSON request body sent to the AI scoring service. Deliberately independent of any feature module. */
public record ScoringRequest(
        String tenantId,
        String transactionId,
        Instant occurredAt,
        Map<String, Object> features
) {
}
