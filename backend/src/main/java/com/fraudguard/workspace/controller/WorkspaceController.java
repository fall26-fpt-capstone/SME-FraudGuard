package com.fraudguard.workspace.controller;

import com.fraudguard.auth.dto.response.StaffPage;
import com.fraudguard.workspace.dto.request.*;
import com.fraudguard.workspace.dto.response.*;
import com.fraudguard.workspace.service.WorkspaceService;
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
@RequestMapping("/api/v1/workspaces")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Workspace administration", description = "Metadata, Staff assignments and text specifications; no provisioning or activation")
public class WorkspaceController {
    private final WorkspaceService service;

    public WorkspaceController(WorkspaceService service) { this.service = service; }

    @GetMapping
    public WorkspacePage list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(actor(jwt), session(jwt), search, page, size);
    }

    @GetMapping("/{id}")
    public WorkspaceResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(actor(jwt), session(jwt), id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update enterprise/contact metadata; identity, permissions and activation remain unchanged")
    public WorkspaceResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody WorkspaceMetadataRequest request) {
        return service.update(actor(jwt), session(jwt), id, request);
    }

    @GetMapping("/{id}/history")
    public WorkspaceHistoryPage history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.history(actor(jwt), session(jwt), id, page, size);
    }

    @GetMapping("/{id}/eligible-staff")
    public StaffPage eligibleStaff(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "") String search, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.eligibleStaff(actor(jwt), session(jwt), id, search, page, size);
    }

    @GetMapping("/{id}/staff-assignments")
    public StaffAssignmentPage assignments(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.assignments(actor(jwt), session(jwt), id, page, size);
    }

    @PostMapping("/{id}/staff-assignments")
    @Operation(summary = "Assign one eligible Staff member without replacing other assignments")
    public StaffAssignmentResult assign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody StaffAssignmentRequest request) {
        return service.assign(actor(jwt), session(jwt), id, request);
    }

    @DeleteMapping("/{id}/staff-assignments/{staffId}")
    @Operation(summary = "Remove one Staff assignment while preserving its history")
    public StaffAssignmentResult remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @PathVariable UUID staffId, @RequestParam long version) {
        return service.remove(actor(jwt), session(jwt), id, staffId, version);
    }

    @GetMapping("/{id}/specification")
    public SpecificationResponse specification(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.specification(actor(jwt), session(jwt), id);
    }

    @PostMapping("/{id}/specification")
    @Operation(summary = "Submit initial text specifications; no upload, approval or activation")
    public ResponseEntity<SpecificationResponse> createSpecification(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody SpecificationRequest request) {
        var response = service.createSpecification(actor(jwt), session(jwt), id, request);
        return ResponseEntity.created(URI.create("/api/v1/workspaces/" + id + "/specification")).body(response);
    }

    @PutMapping("/{id}/specification")
    public SpecificationResponse updateSpecification(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody UpdateSpecificationRequest request) {
        return service.updateSpecification(actor(jwt), session(jwt), id, request);
    }

    @GetMapping("/{id}/specification/history")
    public WorkspaceHistoryPage specificationHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.specificationHistory(actor(jwt), session(jwt), id, page, size);
    }

    private UUID actor(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private UUID session(Jwt jwt) { return UUID.fromString(jwt.getId()); }
}
