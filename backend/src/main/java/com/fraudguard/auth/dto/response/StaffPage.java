package com.fraudguard.auth.dto.response;

import java.util.List;

public record StaffPage(List<StaffResponse> items, int page, int size, long totalElements, int totalPages) { }
