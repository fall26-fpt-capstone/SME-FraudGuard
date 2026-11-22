package com.fraudguard.auth.security;

import com.fraudguard.auth.dto.response.SessionResponse;
import com.fraudguard.auth.service.AuthService;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Configuration
public class AuthSecurityConfig {
    @Bean
    SecretKey jwtKey(@Value("${auth.jwt.secret}") String secret) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("AUTH_JWT_SECRET must be Base64 encoded");
        }
        if (bytes.length < 32) {
            throw new IllegalArgumentException("AUTH_JWT_SECRET must contain at least 32 random bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(Duration.ZERO),
                new JwtIssuerValidator("fraudguard-service"),
                jwt -> jwt.getExpiresAt() != null && jwt.getIssuedAt() != null
                        && jwt.getAudience().contains("fraudguard-api")
                        && validUuid(jwt.getSubject()) && validUuid(jwt.getId())
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"))));
        return decoder;
    }

    private boolean validUuid(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException e) { return false; }
    }

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    SecurityFilterChain authSecurity(HttpSecurity http, AuthService service, JwtDecoder decoder,
                                    @Value("${springdoc.api-docs.enabled:false}") boolean docsEnabled) throws Exception {
        DefaultBearerTokenResolver bearer = new DefaultBearerTokenResolver();
        http.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Credentials are accepted only through an explicit Bearer header, never cookies.
                .csrf(csrf -> csrf.disable())
                .requestCache(c -> c.disable())
                .logout(l -> l.disable())
                .authorizeHttpRequests(a -> {
                    a.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll();
                    a.requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/logout").permitAll();
                    if (docsEnabled) { a.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll(); }
                    a.requestMatchers(HttpMethod.GET, "/api/v1/auth/session").authenticated()
                            .requestMatchers(HttpMethod.POST, "/api/v1/auth/initial-password").hasAuthority("PASSWORD_SETUP")
                            .anyRequest().hasAuthority("ACCOUNT_READY");
                })
                .oauth2ResourceServer(o -> o.bearerTokenResolver(request ->
                        // Logout validates the JWT in the service so repeated revocation remains idempotent.
                        "POST".equals(request.getMethod())
                                && (request.getContextPath() + "/api/v1/auth/logout").equals(request.getRequestURI())
                                ? null : bearer.resolve(request))
                        .jwt(j -> j.decoder(decoder).jwtAuthenticationConverter(jwt -> {
                            SessionResponse account = service.resolveSession(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()));
                            return new JwtAuthenticationToken(jwt, List.of(
                                    new SimpleGrantedAuthority("ROLE_" + account.role().name()),
                                    new SimpleGrantedAuthority(account.mustChangePassword() ? "PASSWORD_SETUP" : "ACCOUNT_READY")),
                                    account.accountId().toString());
                        })));
        return http.build();
    }

    @Bean
    OpenAPI authOpenApi() {
        return new OpenAPI().components(new Components().addSecuritySchemes("bearerAuth",
                new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }
}
