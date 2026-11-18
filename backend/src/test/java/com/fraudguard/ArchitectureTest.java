package com.fraudguard;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

class ArchitectureTest {

    private static final String ROOT = "com.fraudguard";
    private static final List<String> MODULES = List.of(
            "auth", "workspace", "member", "subscription", "configuration", "ingestion",
            "detection", "investigation", "reporting", "notification", "audit");
    private static final JavaClasses APPLICATION = new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests()).importPackages(ROOT);

    @Test
    void moduleImplementationsStayPrivate() {
        MODULES.forEach(module -> ArchitectureRules.moduleImplementationIsPrivate(ROOT, module).check(APPLICATION));
    }

    @Test
    void controllersAndContractsRespectLayers() {
        ArchitectureRules.controllersUseServices(ROOT).check(APPLICATION);
        ArchitectureRules.contractsDoNotExposePersistence(ROOT).check(APPLICATION);
        classes().that().resideInAnyPackage(MODULES.stream().map(m -> ROOT + "." + m + ".service")
                        .toArray(String[]::new))
                .should().beInterfaces().allowEmptyShould(true).check(APPLICATION);
    }

    @Test
    void infrastructureDoesNotDependOnBusinessModules() {
        String[] businessPackages = MODULES.stream().map(m -> ROOT + "." + m + "..").toArray(String[]::new);
        noClasses().that().resideInAnyPackage(ROOT + ".common..", ROOT + ".integration..")
                .should().dependOnClassesThat().resideInAnyPackage(businessPackages)
                .allowEmptyShould(true).check(APPLICATION);
        noClasses().that().resideInAPackage(ROOT + ".common..")
                .should().dependOnClassesThat().resideInAPackage(ROOT + ".integration..")
                .allowEmptyShould(true).check(APPLICATION);
    }

    @Test
    void modulesHaveNoDependencyCycles() {
        slices().matching(ROOT + ".(*)..").should().beFreeOfCycles()
                .allowEmptyShould(true).check(APPLICATION);
    }
}
