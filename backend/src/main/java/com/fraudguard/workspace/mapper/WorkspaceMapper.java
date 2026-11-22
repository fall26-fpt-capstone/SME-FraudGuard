package com.fraudguard.workspace.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fraudguard.workspace.dto.response.*;
import com.fraudguard.workspace.entity.*;

public final class WorkspaceMapper {
    private WorkspaceMapper() { }

    public static WorkspaceResponse response(Workspace workspace) {
        return new WorkspaceResponse(workspace.getId(), workspace.getWorkspaceKey(), workspace.getEnterpriseName(),
                workspace.getContactName(), workspace.getContactEmail(), workspace.getContactPhone(),
                workspace.getVersion(), workspace.getCreatedAt(), workspace.getUpdatedAt());
    }

    public static SpecificationResponse specification(OnboardingSpecification specification) {
        return new SpecificationResponse(specification.getWorkspaceId(), specification.getBusinessSpecification(),
                specification.getFieldDescriptions(), specification.getKnownAnomalyConditions(),
                specification.getVersion(), specification.getUpdatedAt());
    }

    public static StaffAssignmentResponse assignment(StaffAssignment assignment) {
        return new StaffAssignmentResponse(assignment.getStaffId(), assignment.getAssignedAt());
    }

    public static WorkspaceHistoryResponse history(WorkspaceEvent event, ObjectMapper json) {
        try {
            return new WorkspaceHistoryResponse(event.getId(), event.getActorId(), event.getAction(),
                    event.getWorkspaceVersion(), event.getOccurredAt(), json.readTree(event.getDetails()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Workspace history is unavailable", e);
        }
    }
}
