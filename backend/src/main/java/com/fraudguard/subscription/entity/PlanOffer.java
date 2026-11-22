package com.fraudguard.subscription.entity;

import com.fraudguard.subscription.dto.response.PlanType;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscription_plan_offers")
public class PlanOffer {
    @Id
    private UUID id;
    @Column(nullable = false, length = 120)
    private String name;
    @Column(nullable = false, length = 2000)
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false, length = 20)
    private PlanType planType;
    @Column(name = "monthly_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal monthlyPrice;
    @Column(name = "annual_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal annualPrice;
    @Column(nullable = false, length = 3)
    private String currency;
    @Column(name = "tax_treatment", nullable = false, length = 500)
    private String taxTreatment;
    @Column(nullable = false)
    private boolean available;
    @Version
    private Long version;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PlanOffer() { }

    public PlanOffer(String name, String description, PlanType planType, BigDecimal monthlyPrice,
                     BigDecimal annualPrice, String currency, String taxTreatment, boolean available) {
        id = UUID.randomUUID();
        createdAt = Instant.now();
        update(name, description, planType, monthlyPrice, annualPrice, currency, taxTreatment, available);
    }

    public void update(String name, String description, PlanType planType, BigDecimal monthlyPrice,
                        BigDecimal annualPrice, String currency, String taxTreatment, boolean available) {
        this.name = name;
        this.description = description;
        this.planType = planType;
        this.monthlyPrice = monthlyPrice;
        this.annualPrice = annualPrice;
        this.currency = currency;
        this.taxTreatment = taxTreatment;
        this.available = available;
        updatedAt = Instant.now();
    }

    public void retire() {
        available = false;
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public PlanType getPlanType() { return planType; }
    public BigDecimal getMonthlyPrice() { return monthlyPrice; }
    public BigDecimal getAnnualPrice() { return annualPrice; }
    public String getCurrency() { return currency; }
    public String getTaxTreatment() { return taxTreatment; }
    public boolean isAvailable() { return available; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
