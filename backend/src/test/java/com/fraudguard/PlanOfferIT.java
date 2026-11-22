package com.fraudguard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.response.Role;
import com.fraudguard.auth.entity.Account;
import com.fraudguard.auth.repository.AccountRepository;
import com.fraudguard.subscription.dto.request.*;
import com.fraudguard.subscription.dto.response.*;
import com.fraudguard.subscription.repository.PlanOfferHistoryRepository;
import com.fraudguard.subscription.service.PlanOfferService;
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
import java.math.BigDecimal;
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
class PlanOfferIT {
    private static final String PASSWORD = "Synthetic-test-password-123";
    private static final String HASH = new BCryptPasswordEncoder(4).encode(PASSWORD);
    @Container @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AccountRepository accounts;
    @Autowired PlanOfferService service;
    @SpyBean PlanOfferHistoryRepository revisions;
    private String adminToken;
    private String staffToken;
    private String enterpriseToken;
    private String setupToken;
    private UUID actorId;
    private UUID sessionId;

    @BeforeEach
    void provisionSyntheticAccounts() throws Exception {
        String suffix = UUID.randomUUID().toString();
        adminToken = accountToken("catalogue-admin-" + suffix, Role.PLATFORM_ADMIN, null, true);
        var jwt = json.readTree(Base64.getUrlDecoder().decode(adminToken.split("\\.")[1]));
        actorId = UUID.fromString(jwt.get("sub").asText());
        sessionId = UUID.fromString(jwt.get("jti").asText());
        staffToken = accountToken("catalogue-staff-" + suffix, Role.IMPLEMENTATION_STAFF, null, true);
        enterpriseToken = accountToken("admin-" + suffix + "@catalogue.fg", Role.SME_ADMIN, "catalogue", true);
        setupToken = accountToken("catalogue-setup-" + suffix, Role.PLATFORM_ADMIN, null, false);
    }

    @Test
    void createsUpdatesRetiresAndRetainsHistoricalPrices() throws Exception {
        PlanOfferRequest original = offer("Subscription " + UUID.randomUUID(), "125.50", true);
        PlanOfferResponse created = create(original);
        assertThat(created.version()).isZero();
        mvc.perform(get("/api/v1/plan-offers/" + created.id()).header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value(original.name()));
        PlanOfferMetadataRequest next = metadata(original.name(), "250.75");
        PlanOfferResponse updated = readOffer(update(created.id(), new UpdatePlanOfferRequest(created.version(), next))
                .andExpect(status().isOk()).andReturn());
        assertThat(updated.version()).isEqualTo(created.version() + 1);
        PlanOfferResponse retired = readOffer(mvc.perform(post("/api/v1/plan-offers/" + created.id() + "/retire")
                        .header("Authorization", bearer(adminToken)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new RetirePlanOfferRequest(updated.version()))))
                .andExpect(status().isOk()).andReturn());
        assertThat(retired.available()).isFalse();
        assertThat(retired.version()).isEqualTo(updated.version() + 1);
        PlanOfferHistoryPage history = history(created.id());
        assertThat(history.totalElements()).isEqualTo(3);
        assertThat(history.items()).extracting(PlanOfferHistoryResponse::action)
                .containsExactly("RETIRED", "UPDATED", "CREATED");
        assertThat(history.items()).allMatch(h -> h.actorId().equals(actorId));
        assertThat(history.items().get(2).offer().monthlyPrice()).isEqualByComparingTo("125.50");
        assertThat(history.items().get(0).offer().monthlyPrice()).isEqualByComparingTo("250.75");
        mvc.perform(delete("/api/v1/plan-offers/" + created.id()).header("Authorization", bearer(adminToken)))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void paginatesFiltersAndSearchesLiteralNames() throws Exception {
        String name = "Filter_%" + UUID.randomUUID();
        create(offer(name + " A", "10", true));
        create(offer(name + " B", "20", false));
        var result = mvc.perform(get("/api/v1/plan-offers").header("Authorization", bearer(adminToken))
                        .param("search", name.toUpperCase(Locale.ROOT)).param("planType", "SUBSCRIPTION")
                        .param("available", "true").param("page", "0").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].name").value(name + " A")).andReturn();
        assertThat(json.readTree(result.getResponse().getContentAsString()).get("size").asInt()).isEqualTo(1);
        mvc.perform(get("/api/v1/plan-offers").header("Authorization", bearer(adminToken))
                        .param("search", UUID.randomUUID().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        for (String[] parameters : List.of(new String[]{"page", "-1"}, new String[]{"size", "0"},
                new String[]{"size", "101"}, new String[]{"page", "2147483647"}, new String[]{"search", "x".repeat(101)})) {
            mvc.perform(get("/api/v1/plan-offers").header("Authorization", bearer(adminToken))
                    .param(parameters[0], parameters[1])).andExpect(status().isBadRequest());
        }
    }

    @Test
    void rejectsInvalidPricesTypesCurrencyAndMissingCommercialInformation() throws Exception {
        Map<String, Object> valid = json.convertValue(offer("Validation", "10", true), new TypeReference<>() { });
        for (var invalid : List.of(Map.entry("monthlyPrice", (Object) "-1"), Map.entry("annualPrice", (Object) "1.00001"),
                Map.entry("monthlyPrice", (Object) "1000000000000000"), Map.entry("currency", (Object) "ZZZ"),
                Map.entry("taxTreatment", (Object) " "), Map.entry("name", (Object) " "),
                Map.entry("planType", (Object) "CUSTOM"), Map.entry("planType", (Object) "FREE"))) {
            Map<String, Object> body = new HashMap<>(valid);
            body.put(invalid.getKey(), invalid.getValue());
            mvc.perform(post("/api/v1/plan-offers").header("Authorization", bearer(adminToken))
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
        create(new PlanOfferRequest("Free " + UUID.randomUUID(), "Synthetic free offer", PlanType.FREE,
                BigDecimal.ZERO, BigDecimal.ZERO, "VND", "Synthetic test tax description", true));
    }

    @Test
    void deniesAllOperationsForStaffEnterpriseUsersAndSetupAccounts() throws Exception {
        UUID id = create(offer("Access " + UUID.randomUUID(), "10", true)).id();
        for (String token : List.of(staffToken, enterpriseToken, setupToken)) {
            mvc.perform(get("/api/v1/plan-offers").header("Authorization", bearer(token))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/plan-offers/" + id).header("Authorization", bearer(token)))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/plan-offers/" + id + "/history").header("Authorization", bearer(token)))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/plan-offers").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(offer("Forbidden", "10", true)))).andExpect(status().isForbidden());
            mvc.perform(put("/api/v1/plan-offers/" + id).header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(new UpdatePlanOfferRequest(0L, metadata("Forbidden", "20")))))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/plan-offers/" + id + "/retire").header("Authorization", bearer(token))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"version\":0}")).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/plan-offers")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsStaleVersionsAndMissingRecords() throws Exception {
        PlanOfferResponse original = create(offer("Stale " + UUID.randomUUID(), "10", true));
        var request = new UpdatePlanOfferRequest(original.version(), metadata(original.name(), "20"));
        update(original.id(), request).andExpect(status().isOk());
        update(original.id(), request).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/plan-offers/" + original.id() + "/retire").header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":0}")).andExpect(status().isConflict());
        assertThat(history(original.id()).totalElements()).isEqualTo(2);
        mvc.perform(get("/api/v1/plan-offers/" + UUID.randomUUID()).header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/plan-offers/" + UUID.randomUUID() + "/history").header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    void simultaneousUpdatesCannotOverwriteEachOther() throws Exception {
        PlanOfferResponse original = create(offer("Race " + UUID.randomUUID(), "10", true));
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            List<Future<Integer>> results = new ArrayList<>();
            for (String price : List.of("20", "30")) {
                results.add(executor.submit(() -> {
                    if (!start.await(10, TimeUnit.SECONDS)) { throw new IllegalStateException("Test start timed out"); }
                    return update(original.id(), new UpdatePlanOfferRequest(original.version(),
                            metadata(original.name(), price))).andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();
            assertThat(List.of(results.get(0).get(15, TimeUnit.SECONDS), results.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
        assertThat(history(original.id()).totalElements()).isEqualTo(2);
    }

    @Test
    void historyFailureRollsBackOfferUpdate() throws Exception {
        PlanOfferResponse original = create(offer("Rollback " + UUID.randomUUID(), "10", true));
        doThrow(new IllegalStateException("Synthetic history write failure")).when(revisions).save(any());
        assertThatThrownBy(() -> service.update(actorId, sessionId, original.id(),
                new UpdatePlanOfferRequest(original.version(), metadata(original.name(), "99"))))
                .isInstanceOf(IllegalStateException.class);
        PlanOfferResponse after = service.get(actorId, sessionId, original.id());
        assertThat(after.version()).isEqualTo(original.version());
        assertThat(after.monthlyPrice()).isEqualByComparingTo(original.monthlyPrice());
        assertThat(history(original.id()).totalElements()).isEqualTo(1);
    }

    private PlanOfferRequest offer(String name, String monthlyPrice, boolean available) {
        return new PlanOfferRequest(name, "Synthetic catalogue test only", PlanType.SUBSCRIPTION,
                new BigDecimal(monthlyPrice), new BigDecimal("1000"), "VND", "Synthetic tax metadata", available);
    }

    private PlanOfferMetadataRequest metadata(String name, String monthlyPrice) {
        return new PlanOfferMetadataRequest(name, "Synthetic catalogue test only", PlanType.SUBSCRIPTION,
                new BigDecimal(monthlyPrice), new BigDecimal("1000"), "VND", "Synthetic tax metadata");
    }

    @Test
    void metadataCannotRetireOrReactivateAnOffer() throws Exception {
        var original = create(offer("Separate status " + UUID.randomUUID(), "10", true));
        var body = json.createObjectNode().put("version", original.version());
        var data = json.valueToTree(metadata(original.name(), "20"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) data).put("available", false);
        body.set("offer", data);
        mvc.perform(put("/api/v1/plan-offers/" + original.id()).header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        assertThat(service.get(actorId, sessionId, original.id()).available()).isTrue();
        var retired = readOffer(mvc.perform(post("/api/v1/plan-offers/" + original.id() + "/retire")
                        .header("Authorization", bearer(adminToken)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new RetirePlanOfferRequest(original.version()))))
                .andExpect(status().isOk()).andReturn());
        var updated = readOffer(update(original.id(), new UpdatePlanOfferRequest(retired.version(), metadata(original.name(), "30")))
                .andExpect(status().isOk()).andReturn());
        assertThat(updated.available()).isFalse();
    }

    private String accountToken(String login, Role role, String workspace, boolean ready) throws Exception {
        Account account = new Account(login, HASH, role, workspace);
        if (ready) { account.changePassword(HASH); }
        accounts.saveAndFlush(account);
        var request = new LoginRequest(login, PASSWORD,
                role.isPlatformRole() ? LoginRequest.Portal.PLATFORM : LoginRequest.Portal.ENTERPRISE, workspace);
        var result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(request)))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("accessToken").asText();
    }

    private PlanOfferResponse create(PlanOfferRequest request) throws Exception {
        return readOffer(mvc.perform(post("/api/v1/plan-offers").header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(header().exists("Location")).andReturn());
    }

    private ResultActions update(UUID id, UpdatePlanOfferRequest request) throws Exception {
        return mvc.perform(put("/api/v1/plan-offers/" + id).header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(request)));
    }

    private PlanOfferResponse readOffer(MvcResult result) throws Exception {
        return json.readValue(result.getResponse().getContentAsString(), PlanOfferResponse.class);
    }

    private PlanOfferHistoryPage history(UUID id) throws Exception {
        var result = mvc.perform(get("/api/v1/plan-offers/" + id + "/history").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk()).andReturn();
        return json.readValue(result.getResponse().getContentAsString(), PlanOfferHistoryPage.class);
    }

    private String bearer(String token) { return "Bearer " + token; }
}
