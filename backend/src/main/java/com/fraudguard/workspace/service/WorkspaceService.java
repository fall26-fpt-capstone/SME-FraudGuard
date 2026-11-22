package com.fraudguard.workspace.service;

import com.fraudguard.auth.dto.response.StaffPage;
import com.fraudguard.workspace.dto.request.*;
import com.fraudguard.workspace.dto.response.*;
import java.util.UUID;

public interface WorkspaceService {
    WorkspacePage list(UUID actorId, UUID sessionId, String search, int page, int size);
    WorkspaceResponse get(UUID actorId, UUID sessionId, UUID workspaceId);
    WorkspaceResponse update(UUID actorId, UUID sessionId, UUID workspaceId, WorkspaceMetadataRequest request);
    WorkspaceHistoryPage history(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size);
    StaffPage eligibleStaff(UUID actorId, UUID sessionId, UUID workspaceId, String search, int page, int size);
    StaffAssignmentPage assignments(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size);
    StaffAssignmentResult assign(UUID actorId, UUID sessionId, UUID workspaceId, StaffAssignmentRequest request);
    StaffAssignmentResult remove(UUID actorId, UUID sessionId, UUID workspaceId, UUID staffId, long version);
    SpecificationResponse specification(UUID actorId, UUID sessionId, UUID workspaceId);
    SpecificationResponse createSpecification(UUID actorId, UUID sessionId, UUID workspaceId, SpecificationRequest request);
    SpecificationResponse updateSpecification(UUID actorId, UUID sessionId, UUID workspaceId, UpdateSpecificationRequest request);
    WorkspaceHistoryPage specificationHistory(UUID actorId, UUID sessionId, UUID workspaceId, int page, int size);
}
