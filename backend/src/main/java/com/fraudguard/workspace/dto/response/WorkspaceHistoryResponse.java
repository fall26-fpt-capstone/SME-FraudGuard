package com.fraudguard.workspace.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;

public record WorkspaceHistoryResponse(UUID id, UUID actorId, String action, long workspaceVersion,
        Instant occurredAt, JsonNode details) { }
