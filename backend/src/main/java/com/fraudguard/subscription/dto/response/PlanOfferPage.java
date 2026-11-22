package com.fraudguard.subscription.dto.response;

import java.util.List;

public record PlanOfferPage(List<PlanOfferResponse> items, int page, int size,
                            long totalElements, int totalPages) {
}
