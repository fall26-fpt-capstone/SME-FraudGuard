package com.fraudguard.ingestion.internal.transaction;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;

/**
 * Canonical transaction shape shared by every ingest channel: the REST and webhook bodies are bound to it
 * directly, CSV rows are mapped into it. Anything beyond the id and timestamp goes into {@code semanticFields}.
 */
public record TransactionPayload(
        @NotBlank @Size(max = 128) String transactionId,
        Instant occurredAt,
        Map<String, Object> semanticFields
) {
}
