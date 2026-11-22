package com.fraudguard.auth.dto.response;

import java.util.UUID;

public record SessionResponse(UUID accountId, String loginName, Role role,
                              String workspaceId, boolean mustChangePassword) {
}
