package com.fraudguard.ingestion.internal.transaction;

import com.fraudguard.ingestion.api.IngestionChannel;
import com.fraudguard.ingestion.api.IngestionResult;
import com.fraudguard.ingestion.api.TransactionIngestedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/** Single place where a transaction is stored and announced, whatever channel it came from. */
@Service
public class TransactionIngestionService {

    private static final Logger log = LoggerFactory.getLogger(TransactionIngestionService.class);

    private final TransactionRepository repository;
    private final ApplicationEventPublisher events;

    TransactionIngestionService(TransactionRepository repository, ApplicationEventPublisher events) {
        this.repository = repository;
        this.events = events;
    }

    /** Stores the transaction, then publishes {@link TransactionIngestedEvent}. */
    @Transactional
    public IngestionResult ingest(String tenantId, IngestionChannel channel, TransactionPayload payload) {
        // TODO: idempotency (duplicate tenant_id + transaction_id), field normalisation / semantic mapping.
        Instant occurredAt = payload.occurredAt() != null ? payload.occurredAt() : Instant.now();
        Map<String, Object> fields = payload.semanticFields() != null ? payload.semanticFields() : Map.of();

        repository.save(new Transaction(tenantId, payload.transactionId(), occurredAt, channel, fields));
        events.publishEvent(new TransactionIngestedEvent(tenantId, payload.transactionId(), occurredAt, fields));
        log.info("[ingestion] stored + published TransactionIngestedEvent tenant={} txn={} channel={}",
                tenantId, payload.transactionId(), channel);
        return new IngestionResult(1, 0);
    }
}
