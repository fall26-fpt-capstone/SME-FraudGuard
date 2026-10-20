package com.fraudguard.ingestion.api;

/** Outcome of an ingest call, returned to the client by all three channels. */
public record IngestionResult(int accepted, int rejected) {
}
