package com.fraudguard.auth.dto.response;

import java.time.Instant;

public record LoginResponse(String accessToken, String tokenType, Instant expiresAt,
                            SessionResponse account) {
    @Override
    public String toString() {
        return "LoginResponse[accessToken=REDACTED, tokenType=" + tokenType + "]";
    }
}
