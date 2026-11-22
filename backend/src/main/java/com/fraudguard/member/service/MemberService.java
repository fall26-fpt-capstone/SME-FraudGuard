package com.fraudguard.member.service;

import com.fraudguard.auth.dto.response.MemberPage;
import com.fraudguard.auth.dto.response.MemberResponse;
import java.util.UUID;

public interface MemberService {
    MemberPage list(UUID actorId, UUID sessionId, String search, int page, int size);
    MemberResponse get(UUID actorId, UUID sessionId, UUID memberId);
}
