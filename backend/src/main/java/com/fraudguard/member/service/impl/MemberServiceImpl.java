package com.fraudguard.member.service.impl;

import com.fraudguard.auth.dto.response.MemberPage;
import com.fraudguard.auth.dto.response.MemberResponse;
import com.fraudguard.auth.service.AuthService;
import com.fraudguard.member.service.MemberService;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class MemberServiceImpl implements MemberService {
    private final AuthService auth;

    public MemberServiceImpl(AuthService auth) { this.auth = auth; }

    @Override
    public MemberPage list(UUID actorId, UUID sessionId, String search, int page, int size) {
        return auth.listEnterpriseMembers(actorId, sessionId, search, page, size);
    }

    @Override
    public MemberResponse get(UUID actorId, UUID sessionId, UUID memberId) {
        return auth.getEnterpriseMember(actorId, sessionId, memberId);
    }
}
