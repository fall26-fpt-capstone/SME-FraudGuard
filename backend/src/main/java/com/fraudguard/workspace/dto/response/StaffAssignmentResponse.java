package com.fraudguard.workspace.dto.response;

import java.time.Instant;
import java.util.UUID;

public record StaffAssignmentResponse(UUID staffId, Instant assignedAt) { }
