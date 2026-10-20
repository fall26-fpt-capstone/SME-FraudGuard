package com.fraudguard.ingestion.internal.restapi;

import com.fraudguard.common.FraudGuardException;
import com.fraudguard.common.TenantContext;
import com.fraudguard.ingestion.internal.IngestionProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** Authenticates the REST ingestion channel with the {@code X-API-Key} header and binds the key's tenant. */
@Component
class ApiKeyInterceptor implements HandlerInterceptor {

    static final String API_KEY_HEADER = "X-API-Key";

    private final IngestionProperties properties;

    ApiKeyInterceptor(IngestionProperties properties) {
        this.properties = properties;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String apiKey = request.getHeader(API_KEY_HEADER);
        String tenantId = apiKey == null ? null : properties.apiKeys().get(apiKey);
        if (tenantId == null) {
            throw new FraudGuardException(HttpStatus.UNAUTHORIZED, "INVALID_API_KEY", "Missing or invalid " + API_KEY_HEADER + " header");
        }
        // The key decides the tenant; any X-Tenant-Id header is deliberately overridden.
        TenantContext.set(tenantId);
        return true;
    }
}
