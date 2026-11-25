package com.fraudguard.auth.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record LoginRequest(@NotBlank @Size(max = 128) String loginName,
                           @NotBlank @Size(max = 72) String password,
                           @NotNull Portal portal,
                           @Schema(description = "Readable enterprise workspace code, not a UUID; null for PLATFORM", example = "school-a")
                           @Size(max = 64) String workspaceKey) {
    public enum Portal { PLATFORM, ENTERPRISE }

    @JsonAnySetter
    public void rejectUnknownProperty(String name, Object value) {
        throw new IllegalArgumentException("Unknown login property");
    }

    @Override
    public String toString() {
        return "LoginRequest[credentials=REDACTED]";
    }
}
