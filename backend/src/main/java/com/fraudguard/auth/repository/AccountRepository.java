package com.fraudguard.auth.repository;

import com.fraudguard.auth.entity.Account;
import com.fraudguard.auth.dto.response.Role;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {
    @Query("select a from Account a where a.workspaceId = :workspaceId and a.role in :roles "
            + "and locate(lower(:search), lower(a.loginName)) > 0")
    Page<Account> findEnterpriseMembers(String workspaceId, List<Role> roles, String search, Pageable pageable);

    Optional<Account> findByIdAndWorkspaceIdAndRoleIn(UUID id, String workspaceId,
            List<Role> roles);
    @Query("select a from Account a where a.enabled = true and a.role = :role and a.workspaceId is null "
            + "and locate(lower(:search), lower(a.loginName)) > 0")
    Page<Account> findEligibleStaff(Role role, String search, Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Account> findByLoginName(String loginName);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.id = :id")
    Optional<Account> findForUpdate(UUID id);
}
