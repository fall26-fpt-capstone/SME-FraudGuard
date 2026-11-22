package com.fraudguard.subscription.dto.response;

import java.time.Instant;
import java.util.UUID;

public record PlanOfferHistoryResponse(UUID actorId, String action, Instant changedAt, PlanOfferResponse offer) {
}
