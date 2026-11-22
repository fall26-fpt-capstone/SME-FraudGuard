package com.fraudguard.subscription.entity;

import com.fraudguard.subscription.dto.response.PlanType;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscription_plan_offer_history")
public class PlanOfferRevision {
    @Id
    private UUID id;
    @Column(name = "offer_id", nullable = false, updatable = false)
    private UUID offerId;
    @Column(name = "actor_id", nullable = false, updatable = false)
    private UUID actorId;
    @Column(nullable = false, updatable = false, length = 16)
    private String action;
    @Column(nullable = false, updatable = false)
    private long version;
    @Column(nullable = false, updatable = false, length = 120)
    private String name;
    @Column(nullable = false, updatable = false, length = 2000)
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false, updatable = false, length = 20)
    private PlanType planType;
    @Column(name = "monthly_price", nullable = false, updatable = false, precision = 19, scale = 4)
    private BigDecimal monthlyPrice;
    @Column(name = "annual_price", nullable = false, updatable = false, precision = 19, scale = 4)
    private BigDecimal annualPrice;
    @Column(nullable = false, updatable = false, length = 3)
    private String currency;
    @Column(name = "tax_treatment", nullable = false, updatable = false, length = 500)
    private String taxTreatment;
    @Column(nullable = false, updatable = false)
    private boolean available;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt;

    protected PlanOfferRevision() { }

    public PlanOfferRevision(PlanOffer offer, UUID actorId, String action) {
        id = UUID.randomUUID();
        offerId = offer.getId();
        this.actorId = actorId;
        this.action = action;
        version = offer.getVersion();
        name = offer.getName();
        description = offer.getDescription();
        planType = offer.getPlanType();
        monthlyPrice = offer.getMonthlyPrice();
        annualPrice = offer.getAnnualPrice();
        currency = offer.getCurrency();
        taxTreatment = offer.getTaxTreatment();
        available = offer.isAvailable();
        createdAt = offer.getCreatedAt();
        changedAt = offer.getUpdatedAt();
    }

    public UUID getOfferId() { return offerId; }
    public UUID getActorId() { return actorId; }
    public String getAction() { return action; }
    public long getVersion() { return version; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public PlanType getPlanType() { return planType; }
    public BigDecimal getMonthlyPrice() { return monthlyPrice; }
    public BigDecimal getAnnualPrice() { return annualPrice; }
    public String getCurrency() { return currency; }
    public String getTaxTreatment() { return taxTreatment; }
    public boolean isAvailable() { return available; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getChangedAt() { return changedAt; }
}
