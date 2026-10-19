package com.fraudguard.ruleengine.internal.casemgmt;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CaseRepository extends JpaRepository<FraudCase, UUID> {

    List<FraudCase> findByTenantIdOrderByOpenedAtDesc(String tenantId, Pageable pageable);
}
