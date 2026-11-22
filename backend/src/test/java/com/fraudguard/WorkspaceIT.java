package com.fraudguard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.response.Role;
import com.fraudguard.auth.entity.Account;
import com.fraudguard.auth.repository.AccountRepository;
import com.fraudguard.workspace.dto.request.*;
import com.fraudguard.workspace.dto.response.*;
import com.fraudguard.workspace.entity.Workspace;
import com.fraudguard.workspace.repository.WorkspaceHistoryRepository;
import com.fraudguard.workspace.repository.WorkspaceRepository;
import com.fraudguard.workspace.service.WorkspaceService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class WorkspaceIT {
    private static final String PASSWORD = "Synthetic-test-password-123";
    private static final String HASH = new BCryptPasswordEncoder(4).encode(PASSWORD);
    @Container @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AccountRepository accounts;
    @Autowired WorkspaceRepository workspaces;
    @Autowired WorkspaceService service;
    @SpyBean WorkspaceHistoryRepository history;
    private Workspace first;
    private Workspace second;
    private String admin;
    private String staff;
    private String otherStaff;
    private String sme;
    private String otherSme;
    private String operator;
    private String setup;
    private UUID staffId;
    private UUID otherStaffId;
    private String suffix;

    @BeforeEach
    void prepareSyntheticRecords() throws Exception {
        suffix = UUID.randomUUID().toString();
        first = workspaces.saveAndFlush(new Workspace("a-" + suffix, "Enterprise A " + suffix,
                "Synthetic contact", "contact@example.org", null));
        second = workspaces.saveAndFlush(new Workspace("b-" + suffix, "Enterprise B " + suffix,
                "Synthetic contact", "other@example.org", null));
        admin = token("admin-" + suffix, Role.PLATFORM_ADMIN, null, true);
        staff = token("staff-" + suffix, Role.IMPLEMENTATION_STAFF, null, true);
        otherStaff = token("other-staff-" + suffix, Role.IMPLEMENTATION_STAFF, null, true);
        staffId = subject(staff);
        otherStaffId = subject(otherStaff);
        sme = token("sme-" + suffix, Role.SME_ADMIN, first.getWorkspaceKey(), true);
        otherSme = token("other-sme-" + suffix, Role.SME_ADMIN, second.getWorkspaceKey(), true);
        operator = token("operator-" + suffix, Role.OPERATOR, first.getWorkspaceKey(), true);
        setup = token("setup-" + suffix, Role.PLATFORM_ADMIN, null, false);
    }

    @Test
    void workspaceListsAndDetailsRespectCurrentStaffAssignment() throws Exception {
        assign(first.getId(), staffId, 0);
        mvc.perform(get("/api/v1/workspaces").header("Authorization", bearer(admin)).param("search", suffix).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/v1/workspaces").header("Authorization", bearer(staff)).param("search", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(first.getId().toString()));
        getPath(first.getId(), "", staff).andExpect(status().isOk());
        getPath(second.getId(), "", staff).andExpect(status().isNotFound());
        getPath(second.getId(), "/history", staff).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/workspaces").header("Authorization", bearer(otherStaff)).param("search", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        for (String token : List.of(sme, operator, setup)) {
            mvc.perform(get("/api/v1/workspaces").header("Authorization", bearer(token))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/workspaces")).andExpect(status().isUnauthorized());
    }

    @Test
    void metadataUpdatesHaveVersionsAndAttributedBeforeAfterHistory() throws Exception {
        var request = metadata(0, "Changed " + suffix);
        var updated = response(updateMetadata(request, admin).andExpect(status().isOk()).andReturn(), WorkspaceResponse.class);
        assertThat(updated.version()).isEqualTo(1);
        assertThat(updated.workspaceKey()).isEqualTo(first.getWorkspaceKey());
        updateMetadata(request, admin).andExpect(status().isConflict());
        var entries = response(getPath(first.getId(), "/history", admin).andExpect(status().isOk()).andReturn(), WorkspaceHistoryPage.class);
        assertThat(entries.totalElements()).isEqualTo(1);
        assertThat(entries.items().get(0).actorId()).isEqualTo(subject(admin));
        assertThat(entries.items().get(0).details().path("before").path("enterpriseName").asText()).isEqualTo(first.getEnterpriseName());
        assertThat(entries.items().get(0).details().path("after").path("enterpriseName").asText()).isEqualTo(request.enterpriseName());
        updateMetadata(metadata(1, second.getEnterpriseName().toUpperCase(Locale.ROOT)), admin).andExpect(status().isConflict());
        updateMetadata(metadata(1, "Forbidden"), staff).andExpect(status().isForbidden());
        updateMetadata(metadata(1, "Forbidden"), sme).andExpect(status().isForbidden());
    }

    @Test
    void addingAndRemovingOneStaffPreservesOthersAndRevokesAccessImmediately() throws Exception {
        long version = assign(first.getId(), staffId, 0).workspaceVersion();
        version = assign(first.getId(), otherStaffId, version).workspaceVersion();
        getPath(first.getId(), "/staff-assignments", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(delete(path(first.getId(), "/staff-assignments/" + staffId)).header("Authorization", bearer(admin))
                .param("version", Long.toString(version))).andExpect(status().isOk())
                .andExpect(jsonPath("$.assigned").value(false));
        getPath(first.getId(), "", staff).andExpect(status().isNotFound());
        getPath(first.getId(), "/specification", staff).andExpect(status().isNotFound());
        getPath(first.getId(), "", otherStaff).andExpect(status().isOk());
        getPath(first.getId(), "/staff-assignments", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].staffId").value(otherStaffId.toString()));
        mvc.perform(post(path(first.getId(), "/staff-assignments")).header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(new StaffAssignmentRequest(staffId, 0L))))
                .andExpect(status().isConflict());
    }

    @Test
    void eligibleStaffDirectoryDoesNotExposeCredentialsOrAcceptEnterpriseAccounts() throws Exception {
        getPath(first.getId(), "/eligible-staff", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.items[0].role").doesNotExist());
        getPath(first.getId(), "/eligible-staff", staff).andExpect(status().isForbidden());
        mvc.perform(post(path(first.getId(), "/staff-assignments")).header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(new StaffAssignmentRequest(subject(sme), 0L))))
                .andExpect(status().isBadRequest());
        Account disabled = new Account("disabled-" + suffix, HASH, Role.IMPLEMENTATION_STAFF, null);
        org.springframework.test.util.ReflectionTestUtils.setField(disabled, "enabled", false);
        accounts.saveAndFlush(disabled);
        mvc.perform(get(path(first.getId(), "/eligible-staff")).header("Authorization", bearer(admin)).param("search", "disabled-" + suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(post(path(first.getId(), "/staff-assignments")).header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(new StaffAssignmentRequest(disabled.getId(), 0L))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void specificationCreateAndUpdateAreSeparateAndScopedToOwnWorkspace() throws Exception {
        getPath(first.getId(), "/specification", sme).andExpect(status().isNotFound());
        writeSpecification("PUT", new UpdateSpecificationRequest(0L, specification("Initial")), sme)
                .andExpect(status().isNotFound());
        writeSpecification("POST", specification("Initial"), sme).andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(0));
        writeSpecification("POST", specification("Duplicate"), sme).andExpect(status().isConflict());
        writeSpecification("PUT", new UpdateSpecificationRequest(0L, specification("Changed")), sme)
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        writeSpecification("PUT", new UpdateSpecificationRequest(0L, specification("Stale")), sme)
                .andExpect(status().isConflict());
        getPath(first.getId(), "/specification", otherSme).andExpect(status().isNotFound());
        writeSpecification("POST", specification("Other workspace"), otherSme).andExpect(status().isNotFound());
        getPath(first.getId(), "/specification", operator).andExpect(status().isForbidden());
        getPath(first.getId(), "/specification/history", sme).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
        getPath(first.getId(), "/history", sme).andExpect(status().isForbidden());
        getPath(first.getId(), "/specification/history", otherSme).andExpect(status().isNotFound());
    }

    @Test
    void assignedStaffCanEditSpecificationsUntilAssignmentIsRemoved() throws Exception {
        long version = assign(first.getId(), staffId, 0).workspaceVersion();
        writeSpecification("POST", specification("Staff assessment input"), staff).andExpect(status().isCreated());
        mvc.perform(delete(path(first.getId(), "/staff-assignments/" + staffId)).header("Authorization", bearer(admin))
                .param("version", Long.toString(version))).andExpect(status().isOk());
        writeSpecification("PUT", new UpdateSpecificationRequest(0L, specification("Removed Staff")), staff)
                .andExpect(status().isNotFound());
        getPath(first.getId(), "/specification", sme).andExpect(status().isOk())
                .andExpect(jsonPath("$.businessSpecification").value("Staff assessment input"));
    }

    @Test
    void rejectsInvalidMetadataPaginationAndWorkflowInjection() throws Exception {
        var metadata = json.valueToTree(metadata(0, "Injected " + suffix));
        ((com.fasterxml.jackson.databind.node.ObjectNode) metadata).put("workspaceKey", "other");
        updateMetadata(metadata, admin).andExpect(status().isBadRequest());
        var request = json.valueToTree(specification("Injected"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) request).put("activated", true);
        writeSpecification("POST", request, sme).andExpect(status().isBadRequest());
        updateMetadata(new WorkspaceMetadataRequest(0L, "Valid", "Name", "not-an-email", null), admin)
                .andExpect(status().isBadRequest());
        writeSpecification("POST", specification(" "), sme).andExpect(status().isBadRequest());
        for (String endpoint : List.of("/api/v1/workspaces", path(first.getId(), "/history"),
                path(first.getId(), "/eligible-staff"), path(first.getId(), "/staff-assignments"),
                path(first.getId(), "/specification/history"))) {
            mvc.perform(get(endpoint).header("Authorization", bearer(admin)).param("size", "101"))
                    .andExpect(status().isBadRequest());
            mvc.perform(get(endpoint).header("Authorization", bearer(admin)).param("page", "2147483647"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/v1/workspaces").header("Authorization", bearer(admin)))
                .andExpect(status().isMethodNotAllowed());
        mvc.perform(delete(path(first.getId(), "")).header("Authorization", bearer(admin)))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void concurrentStaffAssignmentsRequireRefreshAndDoNotOverwriteOtherMembers() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            List<Future<Integer>> results = new ArrayList<>();
            for (UUID id : List.of(staffId, otherStaffId)) {
                results.add(executor.submit(() -> {
                    if (!start.await(10, TimeUnit.SECONDS)) { throw new IllegalStateException("Test start timed out"); }
                    return mvc.perform(post(path(first.getId(), "/staff-assignments"))
                            .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(new StaffAssignmentRequest(id, 0L))))
                            .andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();
            assertThat(List.of(results.get(0).get(15, TimeUnit.SECONDS), results.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
        var result = response(getPath(first.getId(), "/staff-assignments", admin).andExpect(status().isOk()).andReturn(), StaffAssignmentPage.class);
        UUID existing = result.items().get(0).staffId();
        assign(first.getId(), existing.equals(staffId) ? otherStaffId : staffId, result.workspaceVersion());
        getPath(first.getId(), "/staff-assignments", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void historyFailureRollsBackMetadataAndSpecifications() throws Exception {
        doThrow(new IllegalStateException("Synthetic history failure")).when(history).save(any());
        UUID sessionId = UUID.fromString(claims(admin).get("jti").asText());
        assertThatThrownBy(() -> service.update(subject(admin), sessionId, first.getId(), metadata(0, "Rollback " + suffix)))
                .isInstanceOf(IllegalStateException.class);
        var unchanged = service.get(subject(admin), sessionId, first.getId());
        assertThat(unchanged.enterpriseName()).isEqualTo(first.getEnterpriseName());
        assertThat(unchanged.version()).isZero();
        assertThatThrownBy(() -> service.createSpecification(subject(admin), sessionId, first.getId(), specification("Rollback")))
                .isInstanceOf(IllegalStateException.class);
        getPath(first.getId(), "/specification", sme).andExpect(status().isNotFound());
    }

    @Test
    void memberReadsAreScopedAndNeverExposeCredentials() throws Exception {
        mvc.perform(get("/api/v1/members").header("Authorization", bearer(sme)).param("search", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.items[0].workspaceId").doesNotExist());
        mvc.perform(get("/api/v1/members/" + subject(operator)).header("Authorization", bearer(sme)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("OPERATOR"));
        for (UUID inaccessible : List.of(subject(otherSme), subject(admin), UUID.randomUUID())) {
            mvc.perform(get("/api/v1/members/" + inaccessible).header("Authorization", bearer(sme)))
                    .andExpect(status().isNotFound());
        }
        for (String denied : List.of(admin, staff, operator, setup)) {
            mvc.perform(get("/api/v1/members").header("Authorization", bearer(denied))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/members").header("Authorization", bearer(sme)).param("size", "101"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/members").header("Authorization", bearer(sme)).param("page", "2147483647"))
                .andExpect(status().isBadRequest());
    }

    private WorkspaceMetadataRequest metadata(long version, String name) {
        return new WorkspaceMetadataRequest(version, name, "Synthetic updated contact", "updated@example.org", null);
    }

    private SpecificationRequest specification(String text) {
        return new SpecificationRequest(text, "Synthetic field descriptions", null);
    }

    private StaffAssignmentResult assign(UUID workspaceId, UUID id, long version) throws Exception {
        return response(mvc.perform(post(path(workspaceId, "/staff-assignments")).header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(new StaffAssignmentRequest(id, version))))
                .andExpect(status().isOk()).andReturn(), StaffAssignmentResult.class);
    }

    private ResultActions updateMetadata(Object request, String token) throws Exception {
        return mvc.perform(put(path(first.getId(), "")).header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(request)));
    }

    private ResultActions writeSpecification(String method, Object request, String token) throws Exception {
        var builder = method.equals("POST") ? post(path(first.getId(), "/specification")) : put(path(first.getId(), "/specification"));
        return mvc.perform(builder.header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(request)));
    }

    private ResultActions getPath(UUID id, String suffix, String token) throws Exception {
        return mvc.perform(get(path(id, suffix)).header("Authorization", bearer(token)));
    }

    private String path(UUID id, String suffix) { return "/api/v1/workspaces/" + id + suffix; }
    private String bearer(String token) { return "Bearer " + token; }
    private <T> T response(MvcResult result, Class<T> type) throws Exception {
        return json.readValue(result.getResponse().getContentAsString(), type);
    }

    private com.fasterxml.jackson.databind.JsonNode claims(String token) throws Exception {
        return json.readTree(Base64.getUrlDecoder().decode(token.split("\\.")[1]));
    }
    private UUID subject(String token) throws Exception { return UUID.fromString(claims(token).get("sub").asText()); }

    private String token(String login, Role role, String workspaceKey, boolean ready) throws Exception {
        Account account = new Account(login, HASH, role, workspaceKey);
        if (ready) { account.changePassword(HASH); }
        accounts.saveAndFlush(account);
        var request = new LoginRequest(login, PASSWORD,
                role.isPlatformRole() ? LoginRequest.Portal.PLATFORM : LoginRequest.Portal.ENTERPRISE, workspaceKey);
        var result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(request))).andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("accessToken").asText();
    }
}
