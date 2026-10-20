package com.fraudguard.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Dev-only tenant resolution from the {@code X-Tenant-Id} header.
 * TODO: replace with tenant resolution from the authenticated principal (JWT claim) once auth exists.
 * The REST ingestion channel ignores this header and derives the tenant from the API key instead.
 */
@Component
public class TenantContextFilter extends OncePerRequestFilter {

    public static final String TENANT_HEADER = "X-Tenant-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            String tenantId = request.getHeader(TENANT_HEADER);
            if (tenantId != null && !tenantId.isBlank()) {
                TenantContext.set(tenantId.trim());
            }
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
