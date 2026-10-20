package com.fraudguard.ruleengine.internal.casemgmt;

import com.fraudguard.ruleengine.api.CaseQueryPort;
import com.fraudguard.ruleengine.api.CaseSummary;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
class CaseQueryPortImpl implements CaseQueryPort {

    private final CaseRepository repository;

    CaseQueryPortImpl(CaseRepository repository) {
        this.repository = repository;
    }

    @Override
    public List<CaseSummary> findRecentCases(String tenantId, int limit) {
        // TODO: status / severity filters, pagination, single-case lookup, counts for statistics.
        return repository.findByTenantIdOrderByOpenedAtDesc(tenantId, PageRequest.of(0, Math.max(1, limit))).stream()
                .map(c -> new CaseSummary(c.getId(), c.getTenantId(), c.getTransactionId(), c.getStatus(),
                        c.getSeverity(), c.getScore(), c.getOpenedAt()))
                .toList();
    }
}
