package com.fraudguard.common;

/**
 * Holds the tenant of the request being processed on the current thread.
 * Populated by {@link TenantContextFilter} (and overridden by API-key authentication on the
 * REST ingestion channel); always cleared at the end of the request.
 */
public final class TenantContext {

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(String tenantId) {
        CURRENT.set(tenantId);
    }

    public static String get() {
        return CURRENT.get();
    }

    public static String require() {
        String tenantId = CURRENT.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new TenantNotResolvedException();
        }
        return tenantId;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
