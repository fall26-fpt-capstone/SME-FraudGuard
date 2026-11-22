package com.fraudguard.workspace.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;

public record SpecificationRequest(@NotBlank @Size(max = 10000) String businessSpecification,
        @Size(max = 10000) String fieldDescriptions, @Size(max = 10000) String knownAnomalyConditions) {
    @JsonAnySetter
    public void rejectUnknownProperty(String name, Object value) {
        throw new IllegalArgumentException("Unknown specification property");
    }
}
