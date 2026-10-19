package com.fraudguard.ingestion.internal.restapi;

import com.fraudguard.common.TenantContext;
import com.fraudguard.ingestion.api.IngestionChannel;
import com.fraudguard.ingestion.api.IngestionResult;
import com.fraudguard.ingestion.internal.transaction.TransactionIngestionService;
import com.fraudguard.ingestion.internal.transaction.TransactionPayload;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(RestIngestController.PATH)
class RestIngestController {

    static final String PATH = "/api/v1/ingest/transactions";

    private final TransactionIngestionService ingestion;

    RestIngestController(TransactionIngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping
    IngestionResult ingest(@Valid @RequestBody TransactionPayload payload) {
        // TODO: batch endpoint, per-tenant rate limiting, idempotency-key header.
        return ingestion.ingest(TenantContext.require(), IngestionChannel.REST_API, payload);
    }
}
