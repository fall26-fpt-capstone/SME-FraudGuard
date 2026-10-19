package com.fraudguard.ruleengine.internal.rule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface RuleVersionRepository extends JpaRepository<RuleVersion, UUID> {
}
