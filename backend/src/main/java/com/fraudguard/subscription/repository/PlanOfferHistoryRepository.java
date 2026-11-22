package com.fraudguard.subscription.repository;

import com.fraudguard.subscription.entity.PlanOfferRevision;
import org.springframework.data.domain.*;
import org.springframework.data.repository.Repository;
import java.util.UUID;

public interface PlanOfferHistoryRepository extends Repository<PlanOfferRevision, UUID> {
    PlanOfferRevision save(PlanOfferRevision revision);
    Page<PlanOfferRevision> findByOfferIdOrderByVersionDesc(UUID offerId, Pageable pageable);
}
