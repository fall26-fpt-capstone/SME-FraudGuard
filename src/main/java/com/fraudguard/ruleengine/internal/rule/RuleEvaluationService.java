package com.fraudguard.ruleengine.internal.rule;

import com.fraudguard.ingestion.api.TransactionIngestedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class RuleEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(RuleEvaluationService.class);

    /** Returns the ids of the active rules that matched the transaction. */
    public List<String> evaluate(TransactionIngestedEvent event) {
        // TODO: load the tenant's ACTIVE rules (published versions) and evaluate them against event.semanticFields().
        log.debug("[ruleengine] rule evaluation not implemented yet, txn={}", event.transactionId());
        return List.of();
    }

    /** Evaluates a draft rule definition against sample data without persisting anything. */
    public List<String> dryRun(Map<String, Object> ruleDefinition, Map<String, Object> sampleFields) {
        // TODO: dry-run evaluation used by the rule editor ("test this rule on sample/historic data").
        throw new UnsupportedOperationException("dry-run not implemented yet");
    }
}
