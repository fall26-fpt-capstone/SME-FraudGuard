package com.fraudguard.workspace.dto.response;

import java.time.Instant;
import java.util.UUID;

public record WorkspaceResponse(UUID id, String workspaceKey, String enterpriseName, String contactName,
        String contactEmail, String contactPhone, long version, Instant createdAt, Instant updatedAt) { }
