package com.fraudguard.workspace.repository;

import com.fraudguard.workspace.entity.Workspace;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    @Query("""
            select w from Workspace w
            where (locate(lower(:search), lower(w.enterpriseName)) > 0
                or locate(lower(:search), lower(w.workspaceKey)) > 0)
              and (:admin = true or exists (select a.id from StaffAssignment a
                   where a.workspaceId = w.id and a.staffId = :actorId and a.active = true))
            """)
    Page<Workspace> search(String search, boolean admin, UUID actorId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Workspace w where w.id = :id")
    Optional<Workspace> findForUpdate(UUID id);

    boolean existsByEnterpriseNameIgnoreCaseAndIdNot(String enterpriseName, UUID id);
}
