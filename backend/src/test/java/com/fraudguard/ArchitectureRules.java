package com.fraudguard;

import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

final class ArchitectureRules {

    private ArchitectureRules() {
    }

    static ArchRule moduleImplementationIsPrivate(String root, String module) {
        String base = root + "." + module;
        return noClasses().that().resideOutsideOfPackage(base + "..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        base + ".controller..", base + ".repository..", base + ".entity..",
                        base + ".mapper..", base + ".service.impl..")
                .allowEmptyShould(true)
                .because("other modules use service interfaces and DTOs, not implementation details");
    }

    static ArchRule controllersUseServices(String root) {
        return noClasses().that().resideInAPackage(root + "..controller..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        root + "..repository..", root + "..entity..", root + "..service.impl..")
                .allowEmptyShould(true)
                .because("controllers use service interfaces and DTOs");
    }

    static ArchRule contractsDoNotExposePersistence(String root) {
        return noClasses().that().resideInAnyPackage(root + "..service", root + "..dto..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        root + "..entity..", root + "..repository..", root + "..service.impl..")
                .allowEmptyShould(true)
                .because("public contracts must not leak persistence or service implementations");
    }
}
