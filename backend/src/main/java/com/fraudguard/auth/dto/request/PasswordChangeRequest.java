package com.fraudguard.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordChangeRequest(@NotBlank @Size(max = 72) String currentPassword,
                                    @NotBlank @Size(min = 12, max = 72) String newPassword,
                                    @NotBlank @Size(max = 72) String confirmation) {
    @Override
    public String toString() {
        return "PasswordChangeRequest[credentials=REDACTED]";
    }
}
