package com.fraudguard.workspace.repository;

import com.fraudguard.workspace.entity.OnboardingSpecification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface SpecificationRepository extends JpaRepository<OnboardingSpecification, UUID> { }
