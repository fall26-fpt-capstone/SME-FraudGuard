package com.fraudguard.subscription.dto.response;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PlanOfferResponse(UUID id, String name, String description, PlanType planType,
                                BigDecimal monthlyPrice, BigDecimal annualPrice, String currency,
                                String taxTreatment, boolean available, long version,
                                Instant createdAt, Instant updatedAt) {
}
