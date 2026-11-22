package com.fraudguard.auth.repository;

import com.fraudguard.auth.entity.AuthSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AuthSessionRepository extends JpaRepository<AuthSession, UUID> {
}
