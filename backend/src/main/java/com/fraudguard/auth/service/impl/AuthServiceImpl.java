package com.fraudguard.auth.service.impl;

import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.request.PasswordChangeRequest;
import com.fraudguard.auth.dto.response.*;
import com.fraudguard.auth.entity.Account;
import com.fraudguard.auth.entity.AuthSession;
import com.fraudguard.auth.repository.AccountRepository;
import com.fraudguard.auth.repository.AuthSessionRepository;
import com.fraudguard.auth.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@Transactional
public class AuthServiceImpl implements AuthService {
    private final AccountRepository accounts;
    private final AuthSessionRepository sessions;
    private final PasswordEncoder passwords;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final Duration tokenTtl;
    private final String dummyHash;

    public AuthServiceImpl(AccountRepository accounts, AuthSessionRepository sessions,
                           PasswordEncoder passwords, JwtEncoder encoder, JwtDecoder decoder,
                           @Value("${auth.jwt.ttl:PT15M}") Duration tokenTtl) {
        if (tokenTtl.compareTo(Duration.ofSeconds(1)) < 0 || tokenTtl.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("JWT lifetime must be between one second and one hour");
        }
        this.accounts = accounts;
        this.sessions = sessions;
        this.passwords = passwords;
        this.encoder = encoder;
        this.decoder = decoder;
        this.tokenTtl = tokenTtl;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Override
    public LoginResponse login(LoginRequest request) {
        Account account = accounts.findByLoginName(request.loginName()).orElse(null);
        // Check a hash even for an unknown login to reduce account enumeration by timing.
        boolean matches = withinBcryptLimit(request.password())
                && passwords.matches(request.password(), account == null ? dummyHash : account.getPasswordHash());
        if (account == null || !matches || !account.isEnabled() || !scopeMatches(account, request)) {
            throw denied();
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expiry = now.plus(tokenTtl).truncatedTo(ChronoUnit.SECONDS);
        AuthSession session = sessions.save(new AuthSession(account, expiry));
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("fraudguard-service")
                .audience(List.of("fraudguard-api")).subject(account.getId().toString())
                .id(session.getId().toString()).issuedAt(now).expiresAt(expiry).build();
        String token = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new LoginResponse(token, "Bearer", expiry, response(account));
    }

    private boolean scopeMatches(Account account, LoginRequest request) {
        if (account.getRole().isPlatformRole()) {
            return request.portal() == LoginRequest.Portal.PLATFORM && request.workspaceKey() == null;
        }
        return request.portal() == LoginRequest.Portal.ENTERPRISE
                && Objects.equals(account.getWorkspaceKey(), request.workspaceKey());
    }

    @Override
    @Transactional(readOnly = true)
    public SessionResponse resolveSession(UUID accountId, UUID sessionId) {
        Account account = accounts.findById(accountId).filter(Account::isEnabled).orElseThrow(this::denied);
        requireSession(account, sessionId);
        return response(account);
    }

    private void requireSession(Account account, UUID sessionId) {
        sessions.findById(sessionId)
                .filter(s -> s.matchesScope(account) && s.isActive(Instant.now()))
                .orElseThrow(this::denied);
    }

    @Override
    public SessionResponse changePassword(UUID accountId, UUID sessionId,
                                          PasswordChangeRequest request, boolean initial) {
        Account account = accounts.findForUpdate(accountId).filter(Account::isEnabled).orElseThrow(this::denied);
        requireSession(account, sessionId);
        if (account.isMustChangePassword() != initial) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Password change flow is not permitted");
        }
        if (!withinBcryptLimit(request.currentPassword())
                || !passwords.matches(request.currentPassword(), account.getPasswordHash())) {
            throw denied();
        }
        validateNewPassword(request.newPassword());
        if (!request.newPassword().equals(request.confirmation())
                || passwords.matches(request.newPassword(), account.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Confirm a different new password");
        }
        account.changePassword(passwords.encode(request.newPassword()));
        accounts.saveAndFlush(account);
        return response(account);
    }

    @Override
    public void logout(String token) {
        if (token == null) {
            return;
        }
        try {
            Jwt jwt = decoder.decode(token);
            UUID accountId = UUID.fromString(jwt.getSubject());
            UUID sessionId = UUID.fromString(jwt.getId());
            sessions.findById(sessionId).filter(s -> s.getAccountId().equals(accountId))
                    .ifPresent(AuthSession::revoke);
        } catch (JwtException | IllegalArgumentException e) {
            throw denied();
        }
    }

    @Override
    public void bootstrapPlatformAdmin(String loginName, String password) {
        if (loginName == null || loginName.isBlank() || loginName.length() > 128) {
            throw new IllegalArgumentException("A valid bootstrap login is required");
        }
        validateNewPassword(password);
        if (accounts.findByLoginName(loginName).isEmpty()) {
            accounts.saveAndFlush(new Account(loginName, passwords.encode(password), Role.PLATFORM_ADMIN, null, null));
        }
    }

    private void validateNewPassword(String password) {
        if (password == null || password.isBlank() || password.length() < 12 || !withinBcryptLimit(password)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must have at least 12 characters and at most 72 UTF-8 bytes");
        }
    }

    private boolean withinBcryptLimit(String value) {
        return value != null && value.getBytes(StandardCharsets.UTF_8).length <= 72;
    }

    private SessionResponse response(Account account) {
        return new SessionResponse(account.getId(), account.getLoginName(), account.getRole(),
                account.getWorkspaceId(), account.getWorkspaceKey(), account.isMustChangePassword());
    }

    @Override
    @Transactional(readOnly = true)
    public StaffPage listEligibleStaff(UUID actorId, UUID sessionId, String search, int page, int size) {
        requirePlatformAdmin(actorId, sessionId);
        if (search == null || search.length() > 100 || page < 0 || size < 1 || size > 100
                || (long) page * size > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid staff search or pagination");
        }
        var result = accounts.findEligibleStaff(Role.IMPLEMENTATION_STAFF, search.trim(),
                PageRequest.of(page, size, Sort.by("loginName", "id")));
        return new StaffPage(result.getContent().stream().map(a -> new StaffResponse(a.getId(), a.getLoginName())).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    @Transactional(readOnly = true)
    public StaffResponse getEligibleStaff(UUID actorId, UUID sessionId, UUID staffId) {
        requirePlatformAdmin(actorId, sessionId);
        var account = accounts.findById(staffId).filter(a -> a.isEnabled()
                && a.getRole() == Role.IMPLEMENTATION_STAFF && a.getWorkspaceId() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Eligible platform Staff required"));
        return new StaffResponse(account.getId(), account.getLoginName());
    }

    private void requirePlatformAdmin(UUID actorId, UUID sessionId) {
        var actor = resolveSession(actorId, sessionId);
        if (actor.role() != Role.PLATFORM_ADMIN || actor.mustChangePassword() || actor.workspaceId() != null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform Admin access required");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public MemberPage listEnterpriseMembers(UUID actorId, UUID sessionId, String search, int page, int size) {
        var actor = requireEnterpriseAdmin(actorId, sessionId);
        if (search == null || search.length() > 100 || page < 0 || size < 1 || size > 100
                || (long) page * size > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid member search or pagination");
        }
        var result = accounts.findEnterpriseMembers(actor.workspaceId(), enterpriseRoles(), search.trim(),
                PageRequest.of(page, size, Sort.by("loginName", "id")));
        return new MemberPage(result.getContent().stream().map(this::member).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    @Transactional(readOnly = true)
    public MemberResponse getEnterpriseMember(UUID actorId, UUID sessionId, UUID memberId) {
        var actor = requireEnterpriseAdmin(actorId, sessionId);
        return member(accounts.findByIdAndWorkspaceIdAndRoleIn(memberId, actor.workspaceId(), enterpriseRoles())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found")));
    }

    private SessionResponse requireEnterpriseAdmin(UUID actorId, UUID sessionId) {
        var actor = resolveSession(actorId, sessionId);
        if (actor.role() != Role.SME_ADMIN || actor.mustChangePassword() || actor.workspaceId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Own-workspace SME Admin access required");
        }
        return actor;
    }

    private List<Role> enterpriseRoles() { return List.of(Role.SME_ADMIN, Role.OPERATOR, Role.INVESTIGATOR); }

    private MemberResponse member(Account account) {
        return new MemberResponse(account.getId(), account.getLoginName(), account.getRole(),
                account.isEnabled(), account.isMustChangePassword());
    }

    private BadCredentialsException denied() {
        return new BadCredentialsException("Authentication failed");
    }
}
