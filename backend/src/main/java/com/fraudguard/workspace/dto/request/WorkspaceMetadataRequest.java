package com.fraudguard.workspace.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;

public record WorkspaceMetadataRequest(@NotNull @PositiveOrZero Long version,
        @NotBlank @Size(max = 255) String enterpriseName,
        @NotBlank @Size(max = 120) String contactName,
        @NotBlank @Email @Size(max = 254) String contactEmail,
        @Size(max = 40) String contactPhone) {
    @JsonAnySetter
    public void rejectUnknownProperty(String name, Object value) {
        throw new IllegalArgumentException("Unknown workspace metadata property");
    }
}
