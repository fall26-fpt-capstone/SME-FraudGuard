package com.fraudguard.common;

import org.springframework.http.HttpStatus;

public class TenantNotResolvedException extends FraudGuardException {

    public TenantNotResolvedException() {
        super(HttpStatus.UNAUTHORIZED, "TENANT_NOT_RESOLVED",
                "Tenant could not be resolved for this request (missing " + TenantContextFilter.TENANT_HEADER + " header?)");
    }
}
