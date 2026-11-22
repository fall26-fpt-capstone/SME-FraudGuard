package com.fraudguard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import com.fraudguard.auth.service.AuthService;
import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.response.LoginResponse;
import com.fraudguard.auth.dto.response.SessionResponse;
import org.springframework.http.*;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Verifies PostgreSQL bootstrap and protection of removed legacy routes. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class FraudGuardApplicationIT {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    TestRestTemplate rest;

    @Autowired
    AuthService authService;

    @BeforeEach
    void useJdkHttpClient() {
        // HttpURLConnection streaming cannot read some 401 responses with request bodies.
        rest.getRestTemplate().setRequestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory());
    }

    @Test
    void scaffoldStartsWithoutLegacyDemoEndpoints() {
        assertThat(rest.getForEntity("/api/v1/dashboard/cases", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(rest.postForEntity("/api/v1/ingest/transactions", null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void jwtPasswordChangeAndLogoutPersistInPostgres() {
        String initial = "Initial-test-password-123";
        String changed = "Changed-test-password-456";
        authService.bootstrapPlatformAdmin("integration-admin", initial);
        var login = rest.postForEntity("/api/v1/auth/login",
                new LoginRequest("integration-admin", initial, LoginRequest.Portal.PLATFORM, null), LoginResponse.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(login.getBody()).isNotNull();
        assertThat(login.getBody().account().mustChangePassword()).isTrue();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(login.getBody().accessToken());
        assertThat(rest.exchange("/api/v1/auth/initial-password", HttpMethod.POST,
                new HttpEntity<>(Map.of("currentPassword", initial, "newPassword", changed, "confirmation", "mismatch"), headers),
                String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var unchanged = rest.exchange("/api/v1/auth/session", HttpMethod.GET,
                new HttpEntity<>(headers), SessionResponse.class);
        assertThat(unchanged.getBody().mustChangePassword()).isTrue();
        var change = rest.exchange("/api/v1/auth/initial-password", HttpMethod.POST,
                new HttpEntity<>(Map.of("currentPassword", initial, "newPassword", changed, "confirmation", changed), headers),
                SessionResponse.class);
        assertThat(change.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(change.getBody().mustChangePassword()).isFalse();
        assertThat(rest.postForEntity("/api/v1/auth/login",
                new LoginRequest("integration-admin", initial, LoginRequest.Portal.PLATFORM, null), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(rest.postForEntity("/api/v1/auth/login",
                new LoginRequest("integration-admin", changed, LoginRequest.Portal.PLATFORM, null), LoginResponse.class)
                .getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(rest.exchange("/api/v1/auth/logout", HttpMethod.POST, new HttpEntity<>(headers), Void.class)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(rest.exchange("/api/v1/auth/session", HttpMethod.GET, new HttpEntity<>(headers), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(rest.exchange("/api/v1/auth/logout", HttpMethod.POST, new HttpEntity<>(headers), Void.class)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }
}
