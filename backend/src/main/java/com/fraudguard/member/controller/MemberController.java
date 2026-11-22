package com.fraudguard.member.controller;

import com.fraudguard.auth.dto.response.MemberPage;
import com.fraudguard.auth.dto.response.MemberResponse;
import com.fraudguard.member.service.MemberService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/members")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Enterprise members", description = "Own-workspace member reads for SME Admin; no credentials")
public class MemberController {
    private final MemberService service;

    public MemberController(MemberService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "List enterprise members within the authenticated SME Admin's workspace")
    public MemberPage list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()), search, page, size);
    }

    @GetMapping("/{id}")
    public MemberResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getId()), id);
    }
}
