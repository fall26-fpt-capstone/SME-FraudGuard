package com.fraudguard.subscription.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record RetirePlanOfferRequest(@NotNull @PositiveOrZero Long version) {
}
