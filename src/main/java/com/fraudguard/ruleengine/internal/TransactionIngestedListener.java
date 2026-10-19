package com.fraudguard.ruleengine.internal;

import com.fraudguard.aiclient.ScoringResponse;
import com.fraudguard.ingestion.api.TransactionIngestedEvent;
import com.fraudguard.ruleengine.internal.rule.RuleEvaluationService;
import com.fraudguard.ruleengine.internal.scoring.ScoringService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Entry point of the rule engine: reacts to {@link TransactionIngestedEvent} once the ingestion transaction
 * has committed (or immediately when published outside a transaction). Knows nothing about how ingestion stores data.
 */
@Component
class TransactionIngestedListener {

    private static final Logger log = LoggerFactory.getLogger(TransactionIngestedListener.class);

    private final RuleEvaluationService ruleEvaluation;
    private final ScoringService scoring;

    TransactionIngestedListener(RuleEvaluationService ruleEvaluation, ScoringService scoring) {
        this.ruleEvaluation = ruleEvaluation;
        this.scoring = scoring;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void on(TransactionIngestedEvent event) {
        log.info("[ruleengine] consumed TransactionIngestedEvent tenant={} txn={}", event.tenantId(), event.transactionId());
        // The transaction is already stored: a rule-engine failure must not surface to the ingest caller.
        try {
            ruleEvaluation.evaluate(event);
            ScoringResponse response = scoring.score(event);
            log.info("[ruleengine] txn={} score={}", event.transactionId(), response.score());
            // TODO: open a case (casemgmt) when severity is high enough; make this reliable (outbox / retry).
        } catch (RuntimeException e) {
            log.error("[ruleengine] failed to process txn={} tenant={}", event.transactionId(), event.tenantId(), e);
        }
    }
}
