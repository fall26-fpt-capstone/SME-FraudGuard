package com.fraudguard.subscription.mapper;

import com.fraudguard.subscription.dto.response.*;
import com.fraudguard.subscription.entity.PlanOffer;
import com.fraudguard.subscription.entity.PlanOfferRevision;

public final class PlanOfferMapper {
    private PlanOfferMapper() { }

    public static PlanOfferResponse response(PlanOffer offer) {
        return new PlanOfferResponse(offer.getId(), offer.getName(), offer.getDescription(), offer.getPlanType(),
                offer.getMonthlyPrice(), offer.getAnnualPrice(), offer.getCurrency(), offer.getTaxTreatment(),
                offer.isAvailable(), offer.getVersion(), offer.getCreatedAt(), offer.getUpdatedAt());
    }

    public static PlanOfferHistoryResponse history(PlanOfferRevision revision) {
        return new PlanOfferHistoryResponse(revision.getActorId(), revision.getAction(), revision.getChangedAt(),
                new PlanOfferResponse(revision.getOfferId(), revision.getName(), revision.getDescription(), revision.getPlanType(),
                        revision.getMonthlyPrice(), revision.getAnnualPrice(), revision.getCurrency(), revision.getTaxTreatment(),
                        revision.isAvailable(), revision.getVersion(), revision.getCreatedAt(), revision.getChangedAt()));
    }
}
