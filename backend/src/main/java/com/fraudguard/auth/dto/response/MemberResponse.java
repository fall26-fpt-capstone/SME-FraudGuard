package com.fraudguard.auth.dto.response;

import java.util.UUID;

public record MemberResponse(UUID id, String loginName, Role role, boolean enabled, boolean mustChangePassword) { }
