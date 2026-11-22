package com.fraudguard.auth.service;

import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.request.PasswordChangeRequest;
import com.fraudguard.auth.dto.response.*;
import java.util.UUID;

public interface AuthService {
    LoginResponse login(LoginRequest request);
    SessionResponse resolveSession(UUID accountId, UUID sessionId);
    SessionResponse changePassword(UUID accountId, UUID sessionId, PasswordChangeRequest request, boolean initial);
    void logout(String token);
    void bootstrapPlatformAdmin(String loginName, String password);
    StaffPage listEligibleStaff(UUID actorId, UUID sessionId, String search, int page, int size);
    StaffResponse getEligibleStaff(UUID actorId, UUID sessionId, UUID staffId);
    MemberPage listEnterpriseMembers(UUID actorId, UUID sessionId, String search, int page, int size);
    MemberResponse getEnterpriseMember(UUID actorId, UUID sessionId, UUID memberId);
}
