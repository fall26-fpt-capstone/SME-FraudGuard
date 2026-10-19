package com.fraudguard.ruleengine.api;

import java.time.Instant;
import java.util.UUID;

/** Read model of a case, safe to hand to other modules (no JPA entity leaks out of ruleengine). */
public record CaseSummary(
        UUID id,
        String tenantId,
        String transactionId,
        CaseStatus status,
        Severity severity,
        double score,
        Instant openedAt
) {
}
