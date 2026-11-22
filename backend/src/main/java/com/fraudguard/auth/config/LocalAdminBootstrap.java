package com.fraudguard.auth.config;

import com.fraudguard.auth.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;

@Configuration
@Profile("local")
public class LocalAdminBootstrap {
    @Bean
    ApplicationRunner bootstrapAdmin(AuthService service,
            @Value("${AUTH_BOOTSTRAP_LOGIN:}") String login,
            @Value("${AUTH_BOOTSTRAP_PASSWORD:}") String password) {
        return args -> {
            if (!login.isBlank() || !password.isBlank()) {
                service.bootstrapPlatformAdmin(login, password);
            }
        };
    }
}
