package com.fraudguard.aiclient;

/**
 * Contract with the separate AI scoring service (owned by the AI/lab member).
 * Implementations: {@link StubFraudScoringClient} (default, mock scores) and, later, an HTTP client
 * selected with {@code fraudguard.ai.mode=http}.
 */
public interface FraudScoringClient {

    ScoringResponse score(ScoringRequest request);
}
