package com.fraudguard.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record LoginRequest(@NotBlank @Size(max = 128) String loginName,
                           @NotBlank @Size(max = 72) String password,
                           @NotNull Portal portal,
                           @Size(max = 64) String workspaceId) {
    public enum Portal { PLATFORM, ENTERPRISE }

    @Override
    public String toString() {
        return "LoginRequest[credentials=REDACTED]";
    }
}
