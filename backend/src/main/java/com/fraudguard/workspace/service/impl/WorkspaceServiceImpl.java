package com.fraudguard.workspace.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fraudguard.auth.dto.response.*;
import com.fraudguard.auth.service.AuthService;
import com.fraudguard.workspace.dto.request.*;
import com.fraudguard.workspace.dto.response.*;
import com.fraudguard.workspace.entity.*;
import com.fraudguard.workspace.mapper.WorkspaceMapper;
import com.fraudguard.workspace.repository.*;
import com.fraudguard.workspace.service.WorkspaceService;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class WorkspaceServiceImpl implements WorkspaceService {
    private final AuthService auth;
    private final WorkspaceRepository workspaces;
    private final StaffAssignmentRepository assignments;
    private final SpecificationRepository specifications;
    private final WorkspaceHistoryRepository history;
    private final ObjectMapper json;

    public WorkspaceServiceImpl(AuthService auth, WorkspaceRepository workspaces, StaffAssignmentRepository assignments,
            SpecificationRepository specifications, WorkspaceHistoryRepository history, ObjectMapper json) {
        this.auth = auth;
        this.workspaces = workspaces;
        this.assignments = assignments;
        this.specifications = specifications;
        this.history = history;
        this.json = json;
    }

    @Override
    @Transactional(readOnly = true)
    public WorkspacePage list(UUID actorId, UUID sessionId, String search, int page, int size) {
        var actor = actor(actorId, sessionId);
        requirePlatformReader(actor);
        if (search == null || search.length() > 100) { throw badRequest("Invalid workspace search"); }
        var result = workspaces.search(search.trim(), actor.role() == Role.PLATFORM_ADMIN, actor.accountId(),
                pageRequest(page, size).withSort(Sort.by("enterpriseName", "id")));
        return new WorkspacePage(result.getContent().stream().map(WorkspaceMapper::response).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    @Transactional(readOnly = true)
    public WorkspaceResponse get(UUID actorId, UUID sessionId, UUID workspaceId) {
        var actor = actor(actorId, sessionId);
        requirePlatformReader(actor);
        return WorkspaceMapper.response(accessibleWorkspace(actor, workspaceId, false, false));
    }

    @Override
    public WorkspaceResponse update(UUID actorId, UUID sessionId, UUID workspaceId, WorkspaceMetadataRequest request) {
        var actor = actor(actorId, sessionId);
        requireAdmin(actor);
        var workspace = accessibleWorkspace(actor, workspaceId, true, false);
        requireVersion(workspace.getVersion(), request.version());
        String name = request.enterpriseName().trim();
        if (workspaces.existsByEnterpriseNameIgnoreCaseAndIdNot(name, workspaceId)) {
            throw conflict("Enterprise name already exists");
        }
        var before = WorkspaceMapper.response(workspace);
        workspace.updateMetadata(name, request.contactName().trim(), request.contactEmail().trim(),
                request.contactPhone() == null ? null : request.contactPhone().trim());
        workspaces.saveAndFlush(workspace);
        var after = WorkspaceMapper.response(workspace);
        record(workspace, actor.accountId(), "METADATA_UPDATED", Map.of("before", before, "after", after));
        return after;
    }

    @Override
    @Transactional(readOnly = true)
    public WorkspaceHistoryPage history(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size) {
        var actor = actor(actorId, sessionId);
        requirePlatformReader(actor);
        accessibleWorkspace(actor, workspaceId, false, false);
        return historyPage(history.findByWorkspaceIdOrderByOccurredAtDescIdDesc(workspaceId, pageRequest(page, size)), page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public StaffPage eligibleStaff(UUID actorId, UUID sessionId, UUID workspaceId, String search, int page, int size) {
        var actor = actor(actorId, sessionId);
        requireAdmin(actor);
        accessibleWorkspace(actor, workspaceId, false, false);
        return auth.listEligibleStaff(actorId, sessionId, search, page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public StaffAssignmentPage assignments(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size) {
        var actor = actor(actorId, sessionId);
        requirePlatformReader(actor);
        var workspace = accessibleWorkspace(actor, workspaceId, false, false);
        var result = assignments.findByWorkspaceIdAndActiveTrue(workspaceId,
                pageRequest(page, size).withSort(Sort.by("staffId")));
        return new StaffAssignmentPage(result.getContent().stream().map(WorkspaceMapper::assignment).toList(),
                workspace.getVersion(), page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    public StaffAssignmentResult assign(UUID actorId, UUID sessionId, UUID workspaceId, StaffAssignmentRequest request) {
        var actor = actor(actorId, sessionId);
        requireAdmin(actor);
        var workspace = accessibleWorkspace(actor, workspaceId, true, false);
        requireVersion(workspace.getVersion(), request.version());
        auth.getEligibleStaff(actorId, sessionId, request.staffId());
        var assignment = assignments.findByWorkspaceIdAndStaffId(workspaceId, request.staffId()).orElse(null);
        if (assignment != null && assignment.isActive()) {
            return new StaffAssignmentResult(workspaceId, request.staffId(), true, workspace.getVersion());
        }
        if (assignment == null) { assignment = new StaffAssignment(workspaceId, request.staffId()); }
        else { assignment.assign(); }
        assignments.save(assignment);
        workspace.touch();
        workspaces.saveAndFlush(workspace);
        record(workspace, actor.accountId(), "STAFF_ASSIGNED", Map.of("staffId", request.staffId()));
        return new StaffAssignmentResult(workspaceId, request.staffId(), true, workspace.getVersion());
    }

    @Override
    public StaffAssignmentResult remove(UUID actorId, UUID sessionId, UUID workspaceId, UUID staffId, long version) {
        var actor = actor(actorId, sessionId);
        requireAdmin(actor);
        if (version < 0) { throw badRequest("Version must be nonnegative"); }
        var workspace = accessibleWorkspace(actor, workspaceId, true, false);
        requireVersion(workspace.getVersion(), version);
        var assignment = assignments.findByWorkspaceIdAndStaffId(workspaceId, staffId).orElse(null);
        if (assignment != null && assignment.isActive()) {
            assignment.remove();
            workspace.touch();
            workspaces.saveAndFlush(workspace);
            record(workspace, actor.accountId(), "STAFF_REMOVED", Map.of("staffId", staffId));
        }
        return new StaffAssignmentResult(workspaceId, staffId, false, workspace.getVersion());
    }

    @Override
    @Transactional(readOnly = true)
    public SpecificationResponse specification(UUID actorId, UUID sessionId, UUID workspaceId) {
        accessibleWorkspace(actor(actorId, sessionId), workspaceId, false, true);
        return WorkspaceMapper.specification(findSpecification(workspaceId));
    }

    @Override
    public SpecificationResponse createSpecification(UUID actorId, UUID sessionId, UUID workspaceId, SpecificationRequest request) {
        var actor = actor(actorId, sessionId);
        var workspace = accessibleWorkspace(actor, workspaceId, true, true);
        if (specifications.existsById(workspaceId)) { throw conflict("Specification already exists; use the update endpoint"); }
        var specification = new OnboardingSpecification(workspaceId, request.businessSpecification().trim(),
                request.fieldDescriptions(), request.knownAnomalyConditions());
        specifications.saveAndFlush(specification);
        var response = WorkspaceMapper.specification(specification);
        record(workspace, actor.accountId(), "SPECIFICATION_CREATED", response);
        return response;
    }

    @Override
    public SpecificationResponse updateSpecification(UUID actorId, UUID sessionId, UUID workspaceId, UpdateSpecificationRequest request) {
        var actor = actor(actorId, sessionId);
        var workspace = accessibleWorkspace(actor, workspaceId, true, true);
        var specification = findSpecification(workspaceId);
        requireVersion(specification.getVersion(), request.version());
        var before = WorkspaceMapper.specification(specification);
        var data = request.specification();
        specification.update(data.businessSpecification().trim(), data.fieldDescriptions(), data.knownAnomalyConditions());
        specifications.saveAndFlush(specification);
        var after = WorkspaceMapper.specification(specification);
        record(workspace, actor.accountId(), "SPECIFICATION_UPDATED", Map.of("before", before, "after", after));
        return after;
    }

    @Override
    @Transactional(readOnly = true)
    public WorkspaceHistoryPage specificationHistory(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size) {
        accessibleWorkspace(actor(actorId, sessionId), workspaceId, false, true);
        return historyPage(history.findByWorkspaceIdAndActionInOrderByOccurredAtDescIdDesc(workspaceId,
                List.of("SPECIFICATION_CREATED", "SPECIFICATION_UPDATED"), pageRequest(page, size)), page, size);
    }

    private SessionResponse actor(UUID actorId, UUID sessionId) {
        var actor = auth.resolveSession(actorId, sessionId);
        if (actor.mustChangePassword()) { throw forbidden(); }
        return actor;
    }

    private void requireAdmin(SessionResponse actor) {
        if (actor.role() != Role.PLATFORM_ADMIN || actor.workspaceId() != null) { throw forbidden(); }
    }

    private void requirePlatformReader(SessionResponse actor) {
        if ((actor.role() != Role.PLATFORM_ADMIN && actor.role() != Role.IMPLEMENTATION_STAFF)
                || actor.workspaceId() != null) { throw forbidden(); }
    }

    private Workspace accessibleWorkspace(SessionResponse actor, UUID id, boolean lock, boolean ownAdminAllowed) {
        boolean platform = actor.role() == Role.PLATFORM_ADMIN || actor.role() == Role.IMPLEMENTATION_STAFF;
        if (!platform && !(ownAdminAllowed && actor.role() == Role.SME_ADMIN)) { throw forbidden(); }
        if (platform && actor.workspaceId() != null) { throw forbidden(); }
        var workspace = (lock ? workspaces.findForUpdate(id) : workspaces.findById(id)).orElseThrow(this::notFound);
        if (actor.role() == Role.IMPLEMENTATION_STAFF
                && !assignments.existsByWorkspaceIdAndStaffIdAndActiveTrue(id, actor.accountId())) { throw notFound(); }
        if (actor.role() == Role.SME_ADMIN && !workspace.getWorkspaceKey().equals(actor.workspaceId())) { throw notFound(); }
        return workspace;
    }

    private OnboardingSpecification findSpecification(UUID workspaceId) {
        return specifications.findById(workspaceId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Specification not submitted"));
    }

    private void requireVersion(Long actual, Long expected) {
        if (!actual.equals(expected)) { throw conflict("Record changed; reload before saving"); }
    }

    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw badRequest("Invalid pagination");
        }
        return PageRequest.of(page, size);
    }

    private WorkspaceHistoryPage historyPage(Page<WorkspaceEvent> result, int page, int size) {
        return new WorkspaceHistoryPage(result.getContent().stream().map(event -> WorkspaceMapper.history(event, json)).toList(),
                page, size, result.getTotalElements(), result.getTotalPages());
    }

    private void record(Workspace workspace, UUID actorId, String action, Object details) {
        try {
            history.save(new WorkspaceEvent(workspace.getId(), actorId, action, workspace.getVersion(), json.writeValueAsString(details)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Workspace history could not be saved", e);
        }
    }

    private ResponseStatusException forbidden() { return new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied"); }
    private ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found"); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
