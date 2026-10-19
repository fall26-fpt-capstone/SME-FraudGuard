package com.fraudguard;

import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Rule factories, parameterised by root package so the very same rules can be applied to the real code
 * ({@link ArchitectureTest}) and to deliberately broken fixtures ({@link ArchitectureRulesSelfTest}).
 */
final class ArchitectureRules {

    private ArchitectureRules() {
    }

    /** Nothing outside a feature module may touch that module's {@code internal} package. */
    static ArchRule internalIsPrivateToModule(String root, String module) {
        return noClasses()
                .that().resideOutsideOfPackage(root + "." + module + "..")
                .should().dependOnClassesThat().resideInAPackage(root + "." + module + ".internal..")
                .because("'" + module + ".internal' is private; other packages may only use '" + module + ".api'")
                .as("No class outside '" + module + "' may depend on '" + module + ".internal'");
    }

    /** The public {@code api} package must stay free of implementation types, otherwise internals leak through it. */
    static ArchRule apiDoesNotExposeInternals(String root, String module) {
        return noClasses()
                .that().resideInAPackage(root + "." + module + ".api..")
                .should().dependOnClassesThat().resideInAPackage("..internal..")
                .allowEmptyShould(true)
                .because("types in '" + module + ".api' must not reference any '*.internal' type")
                .as("'" + module + ".api' must not depend on any '*.internal' package");
    }

    /** Dependency direction between feature modules: {@code from} must not use {@code to} at all. */
    static ArchRule moduleMustNotDependOn(String root, String from, String to, String reason) {
        return noClasses()
                .that().resideInAPackage(root + "." + from + "..")
                .should().dependOnClassesThat().resideInAPackage(root + "." + to + "..")
                .because(reason)
                .as("'" + from + "' must not depend on '" + to + "'");
    }

    /** Shared packages ({@code common}, {@code aiclient}) sit below the feature modules. */
    static ArchRule sharedPackageDoesNotDependOnFeatures(String root, String shared) {
        return noClasses()
                .that().resideInAPackage(root + "." + shared + "..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        root + ".ingestion..", root + ".ruleengine..", root + ".dashboard..")
                .because("'" + shared + "' is shared infrastructure and must not know about feature modules")
                .as("'" + shared + "' must not depend on feature modules");
    }
}
