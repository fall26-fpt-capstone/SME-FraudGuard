package com.fraudguard.aiclient;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/** Mock scorer so backend devs are never blocked on the AI service. Always returns the same fixed score. */
@Component
@ConditionalOnProperty(name = "fraudguard.ai.mode", havingValue = "stub", matchIfMissing = true)
class StubFraudScoringClient implements FraudScoringClient {

    @Override
    public ScoringResponse score(ScoringRequest request) {
        return new ScoringResponse(0.5, List.of("stub score"), "stub-0");
    }
}
