package com.fraudguard.auth.dto.response;

import java.util.List;

public record MemberPage(List<MemberResponse> items, int page, int size, long totalElements, int totalPages) { }
