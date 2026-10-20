package com.fraudguard.dashboard.internal.reporting;

import com.fraudguard.common.TenantContext;
import com.fraudguard.ruleengine.api.CaseQueryPort;
import com.fraudguard.ruleengine.api.CaseSummary;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only dashboard queries. Talks to ruleengine exclusively through {@link CaseQueryPort}. */
@RestController
@RequestMapping("/api/v1/dashboard")
class ReportingController {

    private final CaseQueryPort caseQuery;

    ReportingController(CaseQueryPort caseQuery) {
        this.caseQuery = caseQuery;
    }

    @GetMapping("/cases")
    List<CaseSummary> caseQueue(@RequestParam(defaultValue = "50") int limit) {
        // TODO: filters, pagination, statistics endpoints, export.
        return caseQuery.findRecentCases(TenantContext.require(), limit);
    }
}
