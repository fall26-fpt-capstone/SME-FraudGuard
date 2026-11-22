package com.fraudguard.subscription.dto.response;

import java.util.List;

public record PlanOfferHistoryPage(List<PlanOfferHistoryResponse> items, int page, int size,
                                   long totalElements, int totalPages) {
}
