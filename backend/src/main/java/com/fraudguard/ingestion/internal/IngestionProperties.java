package com.fraudguard.ingestion.internal;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Stub credentials for the ingest channels.
 * TODO: move API keys (hashed) and webhook secrets into a per-tenant table instead of configuration.
 */
@ConfigurationProperties("fraudguard.ingestion")
public record IngestionProperties(Map<String, String> apiKeys, String webhookSecret) {

    public IngestionProperties {
        apiKeys = apiKeys == null ? Map.of() : Map.copyOf(apiKeys);
        webhookSecret = webhookSecret == null ? "" : webhookSecret;
    }
}
