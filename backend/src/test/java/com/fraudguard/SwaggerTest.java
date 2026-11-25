package com.fraudguard;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import com.fraudguard.auth.service.AuthService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"auth.jwt.secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "spring.autoconfigure.exclude="
        + "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration"})
@AutoConfigureMockMvc
@ActiveProfiles("local")
class SwaggerTest {
    @MockBean com.fraudguard.workspace.service.WorkspaceService workspaceService;
    @MockBean com.fraudguard.subscription.service.PlanOfferService planOfferService;
    @MockBean
    AuthService authService;

    @Autowired
    MockMvc mvc;

    @Test
    void localProfileServesOpenApiAndSwaggerUi() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").value("3.0.1"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
                .andExpect(jsonPath("$.paths['/api/v1/auth/login'].post").exists())
                .andExpect(jsonPath("$.components.schemas.LoginRequest.properties.workspaceKey.type").value("string"))
                .andExpect(jsonPath("$.components.schemas.LoginRequest.properties.workspaceId").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.SessionResponse.properties.workspaceId.format").value("uuid"))
                .andExpect(jsonPath("$.components.schemas.SessionResponse.properties.workspaceKey.type").value("string"))
                .andExpect(jsonPath("$.paths['/api/v1/plan-offers'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/workspaces'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/members'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/auth/session'].get.security[0].bearerAuth").exists());
        mvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Swagger UI")));
    }
}
