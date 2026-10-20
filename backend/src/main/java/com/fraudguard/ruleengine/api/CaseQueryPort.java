package com.fraudguard.ruleengine.api;

import java.util.List;

/** What {@code dashboard} (and any other module) may ask {@code ruleengine} about cases. Read-only. */
public interface CaseQueryPort {

    /** Newest first. */
    List<CaseSummary> findRecentCases(String tenantId, int limit);
}
