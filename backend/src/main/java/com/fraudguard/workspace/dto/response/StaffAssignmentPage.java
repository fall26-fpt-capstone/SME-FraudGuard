package com.fraudguard.workspace.dto.response;

import java.util.List;

public record StaffAssignmentPage(List<StaffAssignmentResponse> items, long workspaceVersion,
        int page, int size, long totalElements, int totalPages) { }
