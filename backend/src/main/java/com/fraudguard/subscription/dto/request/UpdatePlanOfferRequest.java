package com.fraudguard.subscription.dto.request;

import jakarta.validation.Valid;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record UpdatePlanOfferRequest(@NotNull @PositiveOrZero Long version,
                                     @NotNull @Valid PlanOfferMetadataRequest offer) {
    @JsonAnySetter
    public void rejectUnknownProperty(String name, Object value) {
        throw new IllegalArgumentException("Unknown offer update property");
    }
}
