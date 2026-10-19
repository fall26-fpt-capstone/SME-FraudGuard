package com.fraudguard.ingestion.internal.webhook;

import com.fraudguard.common.FraudGuardException;
import com.fraudguard.common.TenantContext;
import com.fraudguard.ingestion.api.IngestionChannel;
import com.fraudguard.ingestion.api.IngestionResult;
import com.fraudguard.ingestion.internal.transaction.TransactionIngestionService;
import com.fraudguard.ingestion.internal.transaction.TransactionPayload;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Webhook channel. Shares {@link TransactionPayload} (the mapping) with the REST channel. */
@RestController
@RequestMapping("/api/v1/ingest/webhook")
class WebhookController {

    static final String SIGNATURE_HEADER = "X-Signature";

    private final TransactionIngestionService ingestion;

    WebhookController(TransactionIngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping
    IngestionResult receive(@RequestHeader(value = SIGNATURE_HEADER, required = false) String signature,
                            @Valid @RequestBody TransactionPayload payload) {
        if (signature == null || signature.isBlank()) {
            throw new FraudGuardException(HttpStatus.UNAUTHORIZED, "INVALID_SIGNATURE", "Missing " + SIGNATURE_HEADER + " header");
        }
        // TODO: verify the HMAC signature over the raw request body with the tenant's webhook secret,
        //  and resolve the tenant from that secret instead of the X-Tenant-Id header.
        return ingestion.ingest(TenantContext.require(), IngestionChannel.WEBHOOK, payload);
    }
}
