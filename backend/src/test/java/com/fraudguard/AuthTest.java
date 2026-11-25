package com.fraudguard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fraudguard.auth.entity.Account;
import com.fraudguard.auth.entity.AuthSession;
import com.fraudguard.auth.dto.response.Role;
import com.fraudguard.auth.repository.AccountRepository;
import com.fraudguard.auth.repository.AuthSessionRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.autoconfigure.exclude="
        + "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
@ActiveProfiles("test")
class AuthTest {
    @MockBean com.fraudguard.workspace.service.WorkspaceService workspaceService;
    @MockBean com.fraudguard.subscription.service.PlanOfferService planOfferService;
    private static final String INITIAL = "Initial-password-123";
    private static final String CHANGED = "Changed-password-456";
    private static final String HASH = new BCryptPasswordEncoder(4).encode(INITIAL);
    private static final UUID WORKSPACE_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder encoder;
    @MockBean AccountRepository accounts;
    @MockBean AuthSessionRepository sessions;
    private Account account;
    private Map<UUID, AuthSession> storedSessions;

    @BeforeEach
    void prepare() {
        account = new Account("admin@acme.fg", HASH, Role.SME_ADMIN, WORKSPACE_ID, "acme");
        storedSessions = new HashMap<>();
        when(accounts.findByLoginName(any())).thenAnswer(a ->
                account.getLoginName().equals(a.getArgument(0)) ? Optional.of(account) : Optional.empty());
        when(accounts.findById(any())).thenAnswer(a ->
                account.getId().equals(a.getArgument(0)) ? Optional.of(account) : Optional.empty());
        when(accounts.findForUpdate(any())).thenAnswer(a ->
                account.getId().equals(a.getArgument(0)) ? Optional.of(account) : Optional.empty());
        when(sessions.save(any())).thenAnswer(a -> {
            AuthSession session = a.getArgument(0);
            storedSessions.put(session.getId(), session);
            return session;
        });
        when(sessions.findById(any())).thenAnswer(a -> Optional.ofNullable(storedSessions.get(a.getArgument(0))));
    }

    @Test
    void loginRequiresCorrectCredentialsPortalAndWorkspace() throws Exception {
        login("unknown", INITIAL, "ENTERPRISE", "acme").andExpect(status().isUnauthorized());
        login(account.getLoginName(), "wrong", "ENTERPRISE", "acme").andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "PLATFORM", null).andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "ENTERPRISE", "other").andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "ENTERPRISE", null).andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "ENTERPRISE", WORKSPACE_ID.toString()).andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "ENTERPRISE", "acme")
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.account.workspaceId").value(WORKSPACE_ID.toString()))
                .andExpect(jsonPath("$.account.workspaceKey").value("acme"))
                .andExpect(jsonPath("$.account.mustChangePassword").value(true))
                .andExpect(jsonPath("$.account.passwordHash").doesNotExist());
        assertThat(storedSessions).hasSize(1);
    }

    @Test
    void platformAccountCannotUseEnterprisePortal() throws Exception {
        account = new Account("platform-admin", HASH, Role.PLATFORM_ADMIN, null, null);
        login(account.getLoginName(), INITIAL, "ENTERPRISE", "acme").andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "PLATFORM", "acme").andExpect(status().isUnauthorized());
        login(account.getLoginName(), INITIAL, "PLATFORM", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.account.workspaceId").isEmpty())
                .andExpect(jsonPath("$.account.workspaceKey").isEmpty());
    }

    @Test
    void rejectsLegacyWorkspaceIdInputInsteadOfSilentlyIgnoringIt() throws Exception {
        for (String portal : List.of("ENTERPRISE", "PLATFORM")) {
            mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(Map.of("loginName", account.getLoginName(),
                            "password", INITIAL, "portal", portal, "workspaceId", "acme"))))
                    .andExpect(status().isBadRequest());
        }
        assertThat(storedSessions).isEmpty();
    }

    @Test
    void readableKeyChangesAlsoInvalidateExistingSession() throws Exception {
        String token = token();
        org.springframework.test.util.ReflectionTestUtils.setField(account, "workspaceKey", "other");
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void setupRestrictionClearsOnlyAfterValidPasswordChange() throws Exception {
        String token = token();
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspaceId").value(WORKSPACE_ID.toString()))
                .andExpect(jsonPath("$.workspaceKey").value("acme"));
        change("password", token, INITIAL, CHANGED, CHANGED).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/protected").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        change("initial-password", token, INITIAL, CHANGED, "mismatch").andExpect(status().isBadRequest());
        change("initial-password", token, "wrong", CHANGED, CHANGED).andExpect(status().isUnauthorized());
        change("initial-password", token, INITIAL, INITIAL, INITIAL).andExpect(status().isBadRequest());
        assertThat(account.isMustChangePassword()).isTrue();
        change("initial-password", token, INITIAL, CHANGED, CHANGED).andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false));
        assertThat(new BCryptPasswordEncoder().matches(CHANGED, account.getPasswordHash())).isTrue();
        change("initial-password", token, CHANGED, "Another-password-789", "Another-password-789")
                .andExpect(status().isForbidden());
        change("password", token, CHANGED, "Another-password-789", "Another-password-789")
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void logoutRevokesOnlyCurrentSessionAndIsIdempotent() throws Exception {
        String first = token();
        String second = token();
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + first))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + first))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + first))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + second))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/logout")).andExpect(status().isNoContent());
    }

    @Test
    void rejectsMissingTamperedExpiredAndUnknownSessionTokens() throws Exception {
        mvc.perform(get("/api/v1/auth/session")).andExpect(status().isUnauthorized());
        String token = token();
        String[] parts = token.split("\\.");
        parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + String.join(".", parts)))
                .andExpect(status().isUnauthorized());
        String expired = signedToken(Instant.now().minusSeconds(120), UUID.randomUUID().toString());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized());
        String unknown = signedToken(Instant.now().plusSeconds(300), UUID.randomUUID().toString());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + unknown))
                .andExpect(status().isUnauthorized());
        String malformed = signedToken(Instant.now().plusSeconds(300), "not-a-uuid");
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + malformed))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void currentDatabaseStateOverridesJwtAndSessionExpiry() throws Exception {
        String token = token();
        when(accounts.findById(account.getId())).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        when(accounts.findById(account.getId())).thenReturn(Optional.of(account));
        AuthSession expired = new AuthSession(account, Instant.now().minusSeconds(1));
        when(sessions.findById(any())).thenReturn(Optional.of(expired));
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validationDoesNotEchoPasswordsAndRejectsBcryptByteOverflow() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginName\":\"\",\"password\":\"secret-value\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret-value"))));
        change("initial-password", token(), INITIAL, "é".repeat(37), "é".repeat(37))
                .andExpect(status().isBadRequest());
        assertThat(account.isMustChangePassword()).isTrue();
    }

    @Test
    void docsAreNotPublicOutsideLocal() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isUnauthorized());
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isUnauthorized());
    }

    @Test
    void disabledAccountsAreRejectedAndWorkspaceChangesInvalidateExistingSession() throws Exception {
        String token = token();
        org.springframework.test.util.ReflectionTestUtils.setField(account, "enabled", false);
        login(account.getLoginName(), INITIAL, "ENTERPRISE", "acme").andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        org.springframework.test.util.ReflectionTestUtils.setField(account, "enabled", true);
        org.springframework.test.util.ReflectionTestUtils.setField(account, "workspaceId", UUID.randomUUID());
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void currentRoleIsReadFromDatabase() throws Exception {
        String token = token();
        org.springframework.test.util.ReflectionTestUtils.setField(account, "role", Role.INVESTIGATOR);
        mvc.perform(get("/api/v1/auth/session").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("INVESTIGATOR"));
    }

    private ResultActions login(String login, String password, String portal, String workspace) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("loginName", login); body.put("password", password);
        body.put("portal", portal); body.put("workspaceKey", workspace);
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    private String token() throws Exception {
        String response = login(account.getLoginName(), INITIAL, "ENTERPRISE", "acme")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("accessToken").asText();
    }

    private ResultActions change(String route, String token, String current, String next, String confirmation) throws Exception {
        return mvc.perform(post("/api/v1/auth/" + route).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                        "currentPassword", current, "newPassword", next, "confirmation", confirmation))));
    }

    private String signedToken(Instant expiry, String sessionId) {
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().issuer("fraudguard-service").audience(List.of("fraudguard-api"))
                        .subject(account.getId().toString()).id(sessionId).issuedAt(Instant.now().minusSeconds(300))
                        .expiresAt(expiry).build())).getTokenValue();
    }
}
