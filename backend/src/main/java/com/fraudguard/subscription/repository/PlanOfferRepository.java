package com.fraudguard.subscription.repository;

import com.fraudguard.subscription.dto.response.PlanType;
import com.fraudguard.subscription.entity.PlanOffer;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.util.UUID;

public interface PlanOfferRepository extends JpaRepository<PlanOffer, UUID> {
    @Query("""
            select o from PlanOffer o
            where (:planType is null or o.planType = :planType)
              and (:available is null or o.available = :available)
              and locate(lower(:search), lower(o.name)) > 0
            """)
    Page<PlanOffer> search(String search, PlanType planType, Boolean available, Pageable pageable);
}
