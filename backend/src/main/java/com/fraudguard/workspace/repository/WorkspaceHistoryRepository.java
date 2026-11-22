package com.fraudguard.workspace.repository;

import com.fraudguard.workspace.entity.WorkspaceEvent;
import org.springframework.data.domain.*;
import org.springframework.data.repository.Repository;
import java.util.List;
import java.util.UUID;

public interface WorkspaceHistoryRepository extends Repository<WorkspaceEvent, UUID> {
    WorkspaceEvent save(WorkspaceEvent event);
    Page<WorkspaceEvent> findByWorkspaceIdOrderByOccurredAtDescIdDesc(UUID workspaceId, Pageable pageable);
    Page<WorkspaceEvent> findByWorkspaceIdAndActionInOrderByOccurredAtDescIdDesc(UUID workspaceId,
            List<String> actions, Pageable pageable);
}
