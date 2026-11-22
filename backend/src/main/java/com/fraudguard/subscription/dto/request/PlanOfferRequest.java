package com.fraudguard.subscription.dto.request;

import com.fraudguard.subscription.dto.response.PlanType;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record PlanOfferRequest(
        @NotBlank @Size(max = 120) String name,
        @NotBlank @Size(max = 2000) String description,
        @NotNull PlanType planType,
        @NotNull @DecimalMin("0") @Digits(integer = 15, fraction = 4) BigDecimal monthlyPrice,
        @NotNull @DecimalMin("0") @Digits(integer = 15, fraction = 4) BigDecimal annualPrice,
        @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
        @NotBlank @Size(max = 500) String taxTreatment,
        @NotNull Boolean available) {
}
