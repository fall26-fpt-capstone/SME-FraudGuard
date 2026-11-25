package com.fraudguard.auth.dto.response;

import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

public record SessionResponse(UUID accountId, String loginName, Role role,
                              @Schema(description = "Workspace row UUID used in /workspaces/{id} routes; null for platform accounts")
                              UUID workspaceId,
                              @Schema(description = "Readable workspace code used for enterprise login; null for platform accounts", example = "school-a")
                              String workspaceKey, boolean mustChangePassword) {
}
