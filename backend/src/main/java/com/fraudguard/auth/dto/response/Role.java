package com.fraudguard.auth.dto.response;

public enum Role {
    PLATFORM_ADMIN, IMPLEMENTATION_STAFF, SME_ADMIN, OPERATOR, INVESTIGATOR;

    public boolean isPlatformRole() {
        return this == PLATFORM_ADMIN || this == IMPLEMENTATION_STAFF;
    }
}
