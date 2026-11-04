package com.fraudguard;

import com.archfixture.consumer.controller.BadController;
import com.archfixture.consumer.service.impl.BadConsumer;
import com.archfixture.consumer.service.impl.GoodConsumer;
import com.archfixture.provider.entity.ProviderEntity;
import com.archfixture.provider.repository.ProviderRepository;
import com.archfixture.provider.service.LeakingService;
import com.archfixture.provider.service.ProviderService;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ArchitectureRulesSelfTest {

    private static final String ROOT = "com.archfixture";

    @Test
    void anotherModulesEntityIsRejected() {
        JavaClasses fixture = new ClassFileImporter().importClasses(BadConsumer.class, ProviderEntity.class);
        assertThatThrownBy(() -> ArchitectureRules.moduleImplementationIsPrivate(ROOT, "provider").check(fixture))
                .isInstanceOf(AssertionError.class).hasMessageContaining("BadConsumer");
    }

    @Test
    void anotherModulesServiceInterfaceIsAllowed() {
        JavaClasses fixture = new ClassFileImporter().importClasses(GoodConsumer.class, ProviderService.class);
        assertThatCode(() -> ArchitectureRules.moduleImplementationIsPrivate(ROOT, "provider").check(fixture))
                .doesNotThrowAnyException();
    }

    @Test
    void controllerBypassingServiceIsRejected() {
        JavaClasses fixture = new ClassFileImporter().importClasses(BadController.class, ProviderRepository.class);
        assertThatThrownBy(() -> ArchitectureRules.controllersUseServices(ROOT).check(fixture))
                .isInstanceOf(AssertionError.class).hasMessageContaining("BadController");
    }

    @Test
    void publicServiceLeakingEntityIsRejected() {
        JavaClasses fixture = new ClassFileImporter().importClasses(LeakingService.class, ProviderEntity.class);
        assertThatThrownBy(() -> ArchitectureRules.contractsDoNotExposePersistence(ROOT).check(fixture))
                .isInstanceOf(AssertionError.class).hasMessageContaining("LeakingService");
    }
}
