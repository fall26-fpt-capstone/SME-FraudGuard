package com.fraudguard.workspace.dto.response;

import java.time.Instant;
import java.util.UUID;

public record SpecificationResponse(UUID workspaceId, String businessSpecification, String fieldDescriptions,
        String knownAnomalyConditions, long version, Instant updatedAt) { }
