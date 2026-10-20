package com.fraudguard.ruleengine.internal.scoring;

import com.fraudguard.aiclient.FraudScoringClient;
import com.fraudguard.aiclient.ScoringRequest;
import com.fraudguard.aiclient.ScoringResponse;
import com.fraudguard.ingestion.api.TransactionIngestedEvent;
import org.springframework.stereotype.Service;

@Service
public class ScoringService {

    private final FraudScoringClient aiClient;

    ScoringService(FraudScoringClient aiClient) {
        this.aiClient = aiClient;
    }

    public ScoringResponse score(TransactionIngestedEvent event) {
        // TODO: severity calculation (AI score + matched rules), timeouts / fallback when the AI service is down.
        return aiClient.score(new ScoringRequest(
                event.tenantId(), event.transactionId(), event.occurredAt(), event.semanticFields()));
    }
}
