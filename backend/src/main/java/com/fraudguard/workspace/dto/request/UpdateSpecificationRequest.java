package com.fraudguard.workspace.dto.request;

import jakarta.validation.Valid;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;

public record UpdateSpecificationRequest(@NotNull @PositiveOrZero Long version,
        @NotNull @Valid SpecificationRequest specification) {
    @JsonAnySetter
    public void rejectUnknownProperty(String name, Object value) {
        throw new IllegalArgumentException("Unknown specification update property");
    }
}
