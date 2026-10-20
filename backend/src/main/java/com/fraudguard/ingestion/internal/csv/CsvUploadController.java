package com.fraudguard.ingestion.internal.csv;

import com.fraudguard.common.FraudGuardException;
import com.fraudguard.common.TenantContext;
import com.fraudguard.ingestion.api.IngestionChannel;
import com.fraudguard.ingestion.api.IngestionResult;
import com.fraudguard.ingestion.internal.transaction.TransactionIngestionService;
import com.fraudguard.ingestion.internal.transaction.TransactionPayload;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** CSV / Excel upload channel (skeleton). */
@RestController
@RequestMapping("/api/v1/ingest/csv")
class CsvUploadController {

    private final TransactionIngestionService ingestion;

    CsvUploadController(TransactionIngestionService ingestion) {
        this.ingestion = ingestion;
    }

    @PostMapping(consumes = "multipart/form-data")
    IngestionResult upload(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new FraudGuardException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Uploaded file is empty");
        }
        // TODO: parse the CSV / Excel rows, map columns to TransactionPayload, ingest each row (async job for big files).
        // Placeholder so the skeleton still demonstrates the event flow: one fake row per upload.
        TransactionPayload placeholder = new TransactionPayload(
                "csv-" + UUID.randomUUID(), Instant.now(), Map.of("source_file", String.valueOf(file.getOriginalFilename())));
        return ingestion.ingest(TenantContext.require(), IngestionChannel.CSV, placeholder);
    }
}
