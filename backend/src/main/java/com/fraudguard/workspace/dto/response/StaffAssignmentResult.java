package com.fraudguard.workspace.dto.response;

import java.util.UUID;

public record StaffAssignmentResult(UUID workspaceId, UUID staffId, boolean assigned, long workspaceVersion) { }
