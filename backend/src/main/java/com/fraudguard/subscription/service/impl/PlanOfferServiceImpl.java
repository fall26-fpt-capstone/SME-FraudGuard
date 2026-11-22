package com.fraudguard.subscription.service.impl;

import com.fraudguard.auth.dto.response.Role;
import com.fraudguard.auth.service.AuthService;
import com.fraudguard.subscription.dto.request.*;
import com.fraudguard.subscription.dto.response.*;
import com.fraudguard.subscription.entity.PlanOffer;
import com.fraudguard.subscription.entity.PlanOfferRevision;
import com.fraudguard.subscription.mapper.PlanOfferMapper;
import com.fraudguard.subscription.repository.PlanOfferHistoryRepository;
import com.fraudguard.subscription.repository.PlanOfferRepository;
import com.fraudguard.subscription.service.PlanOfferService;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.Currency;
import java.util.UUID;

@Service
@Transactional
public class PlanOfferServiceImpl implements PlanOfferService {
    private final AuthService auth;
    private final PlanOfferRepository offers;
    private final PlanOfferHistoryRepository revisions;

    public PlanOfferServiceImpl(AuthService auth, PlanOfferRepository offers, PlanOfferHistoryRepository revisions) {
        this.auth = auth;
        this.offers = offers;
        this.revisions = revisions;
    }

    @Override
    public PlanOfferResponse create(UUID actorId, UUID sessionId, PlanOfferRequest request) {
        requireAdmin(actorId, sessionId);
        validateTerms(request.planType(), request.monthlyPrice(), request.annualPrice(), request.currency());
        PlanOffer offer = new PlanOffer(request.name().trim(), request.description().trim(), request.planType(),
                request.monthlyPrice(), request.annualPrice(), request.currency(), request.taxTreatment().trim(), request.available());
        return save(offer, actorId, "CREATED");
    }

    @Override
    @Transactional(readOnly = true)
    public PlanOfferPage list(UUID actorId, UUID sessionId, String search, PlanType planType,
                              Boolean available, int page, int size) {
        requireAdmin(actorId, sessionId);
        if (search == null || search.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search must have at most 100 characters");
        }
        var result = offers.search(search.trim(), planType, available,
                pageRequest(page, size).withSort(Sort.by("name", "id")));
        return new PlanOfferPage(result.getContent().stream().map(PlanOfferMapper::response).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    @Transactional(readOnly = true)
    public PlanOfferResponse get(UUID actorId, UUID sessionId, UUID offerId) {
        requireAdmin(actorId, sessionId);
        return PlanOfferMapper.response(findOffer(offerId));
    }

    @Override
    public PlanOfferResponse update(UUID actorId, UUID sessionId, UUID offerId, UpdatePlanOfferRequest request) {
        requireAdmin(actorId, sessionId);
        PlanOffer offer = findOffer(offerId);
        requireVersion(offer, request.version());
        PlanOfferMetadataRequest data = request.offer();
        validateTerms(data.planType(), data.monthlyPrice(), data.annualPrice(), data.currency());
        offer.update(data.name().trim(), data.description().trim(), data.planType(), data.monthlyPrice(),
                data.annualPrice(), data.currency(), data.taxTreatment().trim(), offer.isAvailable());
        return save(offer, actorId, "UPDATED");
    }

    @Override
    public PlanOfferResponse retire(UUID actorId, UUID sessionId, UUID offerId, RetirePlanOfferRequest request) {
        requireAdmin(actorId, sessionId);
        PlanOffer offer = findOffer(offerId);
        requireVersion(offer, request.version());
        if (!offer.isAvailable()) {
            return PlanOfferMapper.response(offer);
        }
        offer.retire();
        return save(offer, actorId, "RETIRED");
    }

    @Override
    @Transactional(readOnly = true)
    public PlanOfferHistoryPage history(UUID actorId, UUID sessionId, UUID offerId, int page, int size) {
        requireAdmin(actorId, sessionId);
        findOffer(offerId);
        var result = revisions.findByOfferIdOrderByVersionDesc(offerId, pageRequest(page, size));
        return new PlanOfferHistoryPage(result.getContent().stream().map(PlanOfferMapper::history).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    private void requireAdmin(UUID actorId, UUID sessionId) {
        var actor = auth.resolveSession(actorId, sessionId);
        if (actor.role() != Role.PLATFORM_ADMIN || actor.workspaceId() != null || actor.mustChangePassword()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform Admin access required");
        }
    }

    private PlanOffer findOffer(UUID id) {
        return offers.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Plan offer not found"));
    }

    private void requireVersion(PlanOffer offer, Long version) {
        if (!offer.getVersion().equals(version)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Offer changed; reload before saving");
        }
    }

    private PlanOfferResponse save(PlanOffer offer, UUID actorId, String action) {
        offers.saveAndFlush(offer);
        revisions.save(new PlanOfferRevision(offer, actorId, action));
        return PlanOfferMapper.response(offer);
    }

    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page offset is out of range or size is outside 1 to 100");
        }
        return PageRequest.of(page, size);
    }

    private void validateTerms(PlanType type, java.math.BigDecimal monthlyPrice, java.math.BigDecimal annualPrice, String currency) {
        if (type == PlanType.FREE && (monthlyPrice.signum() != 0 || annualPrice.signum() != 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Free offers must have zero prices");
        }
        try {
            Currency.getInstance(currency);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid ISO 4217 currency code is required");
        }
    }
}
