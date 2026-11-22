package com.fraudguard.subscription.controller;

import com.fraudguard.subscription.dto.request.*;
import com.fraudguard.subscription.dto.response.*;
import com.fraudguard.subscription.service.PlanOfferService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/plan-offers")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Plan offers", description = "Platform Admin catalogue administration; does not grant subscriptions")
public class PlanOfferController {
    private final PlanOfferService service;

    public PlanOfferController(PlanOfferService service) { this.service = service; }

    @PostMapping
    @Operation(summary = "Create a Free or Subscription offer")
    public ResponseEntity<PlanOfferResponse> create(@AuthenticationPrincipal Jwt jwt,
                                                   @Valid @RequestBody PlanOfferRequest request) {
        var result = service.create(actor(jwt), session(jwt), request);
        return ResponseEntity.created(URI.create("/api/v1/plan-offers/" + result.id())).body(result);
    }

    @GetMapping
    @Operation(summary = "List offers with name search, type/availability filters and pagination")
    public PlanOfferPage list(@AuthenticationPrincipal Jwt jwt,
                              @RequestParam(defaultValue = "") String search,
                              @RequestParam(required = false) PlanType planType,
                              @RequestParam(required = false) Boolean available,
                              @RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "20") int size) {
        return service.list(actor(jwt), session(jwt), search, planType, available, page, size);
    }

    @GetMapping("/{id}")
    public PlanOfferResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(actor(jwt), session(jwt), id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace offer metadata using its current version")
    public PlanOfferResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                    @Valid @RequestBody UpdatePlanOfferRequest request) {
        return service.update(actor(jwt), session(jwt), id, request);
    }

    @PostMapping("/{id}/retire")
    @Operation(summary = "Stop offering a plan while retaining its record and history")
    public PlanOfferResponse retire(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                    @Valid @RequestBody RetirePlanOfferRequest request) {
        return service.retire(actor(jwt), session(jwt), id, request);
    }

    @GetMapping("/{id}/history")
    @Operation(summary = "Read retained offer snapshots, newest version first")
    public PlanOfferHistoryPage history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        return service.history(actor(jwt), session(jwt), id, page, size);
    }

    private UUID actor(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private UUID session(Jwt jwt) { return UUID.fromString(jwt.getId()); }
}
