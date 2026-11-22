package com.fraudguard.workspace.repository;

import com.fraudguard.workspace.entity.StaffAssignment;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface StaffAssignmentRepository extends JpaRepository<StaffAssignment, UUID> {
    boolean existsByWorkspaceIdAndStaffIdAndActiveTrue(UUID workspaceId, UUID staffId);
    Optional<StaffAssignment> findByWorkspaceIdAndStaffId(UUID workspaceId, UUID staffId);
    Page<StaffAssignment> findByWorkspaceIdAndActiveTrue(UUID workspaceId, Pageable pageable);
}
