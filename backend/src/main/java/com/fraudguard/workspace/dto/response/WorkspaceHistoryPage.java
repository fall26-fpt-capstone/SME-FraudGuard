package com.fraudguard.workspace.dto.response;

import java.util.List;

public record WorkspaceHistoryPage(List<WorkspaceHistoryResponse> items, int page, int size,
        long totalElements, int totalPages) { }
