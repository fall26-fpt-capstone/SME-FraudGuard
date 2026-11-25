package com.fraudguard.auth.controller;

import com.fraudguard.auth.dto.request.LoginRequest;
import com.fraudguard.auth.dto.request.PasswordChangeRequest;
import com.fraudguard.auth.dto.response.LoginResponse;
import com.fraudguard.auth.dto.response.SessionResponse;
import com.fraudguard.auth.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService service;

    public AuthController(AuthService service) { this.service = service; }

    @PostMapping("/login")
    @Operation(summary = "Log in with an internal identifier, portal and enterprise workspaceKey",
            description = "ENTERPRISE uses the readable workspaceKey. The returned account.workspaceId is the UUID for workspace routes. PLATFORM uses a null workspaceKey. Legacy workspaceId login input is rejected.")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.login(request));
    }

    @GetMapping("/session")
    @SecurityRequirement(name = "bearerAuth")
    public SessionResponse session(@AuthenticationPrincipal Jwt jwt) {
        return service.resolveSession(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()));
    }

    @PostMapping("/initial-password")
    @SecurityRequirement(name = "bearerAuth")
    public SessionResponse initialPassword(@AuthenticationPrincipal Jwt jwt,
                                           @Valid @RequestBody PasswordChangeRequest request) {
        return service.changePassword(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()), request, true);
    }

    @PostMapping("/password")
    @SecurityRequirement(name = "bearerAuth")
    public SessionResponse password(@AuthenticationPrincipal Jwt jwt,
                                    @Valid @RequestBody PasswordChangeRequest request) {
        return service.changePassword(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()), request, false);
    }

    @PostMapping("/logout")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header != null && (!header.regionMatches(true, 0, "Bearer ", 0, 7) || header.length() <= 7)) {
            throw new org.springframework.security.authentication.BadCredentialsException("Authentication failed");
        }
        service.logout(header == null ? null : header.substring(7));
        return ResponseEntity.noContent().build();
    }
}
