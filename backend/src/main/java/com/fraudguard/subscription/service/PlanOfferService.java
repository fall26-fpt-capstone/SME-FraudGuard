package com.fraudguard.subscription.service;

import com.fraudguard.subscription.dto.request.*;
import com.fraudguard.subscription.dto.response.*;
import java.util.UUID;

public interface PlanOfferService {
    PlanOfferResponse create(UUID actorId, UUID sessionId, PlanOfferRequest request);
    PlanOfferPage list(UUID actorId, UUID sessionId, String search, PlanType planType, Boolean available, int page, int size);
    PlanOfferResponse get(UUID actorId, UUID sessionId, UUID offerId);
    PlanOfferResponse update(UUID actorId, UUID sessionId, UUID offerId, UpdatePlanOfferRequest request);
    PlanOfferResponse retire(UUID actorId, UUID sessionId, UUID offerId, RetirePlanOfferRequest request);
    PlanOfferHistoryPage history(UUID actorId, UUID sessionId, UUID offerId, int page, int size);
}
