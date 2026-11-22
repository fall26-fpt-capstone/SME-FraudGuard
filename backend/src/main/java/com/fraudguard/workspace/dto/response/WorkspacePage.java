package com.fraudguard.workspace.dto.response;

import java.util.List;

public record WorkspacePage(List<WorkspaceResponse> items, int page, int size, long totalElements, int totalPages) { }
