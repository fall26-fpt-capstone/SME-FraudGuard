package com.fraudguard;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves the rules in {@link ArchitectureRules} really catch violations, using fixture classes under
 * {@code com.archfixture} (outside {@code com.fraudguard}, so they never affect {@link ArchitectureTest}).
 */
class ArchitectureRulesSelfTest {

    private static final String FIXTURE_ROOT = "com.archfixture";
    private final JavaClasses fixtures = new ClassFileImporter().importPackages(FIXTURE_ROOT);

    @Test
    void importingAnotherModulesInternalIsDetected() {
        // com.archfixture.beta.internal.BetaViolator imports com.archfixture.alpha.internal.AlphaSecret
        assertThatThrownBy(() -> ArchitectureRules.internalIsPrivateToModule(FIXTURE_ROOT, "alpha").check(fixtures))
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("BetaViolator");
    }

    @Test
    void apiLeakingInternalsIsDetected() {
        // com.archfixture.alpha.api.AlphaLeak exposes com.archfixture.alpha.internal.AlphaSecret
        assertThatThrownBy(() -> ArchitectureRules.apiDoesNotExposeInternals(FIXTURE_ROOT, "alpha").check(fixtures))
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("AlphaLeak");
    }

    @Test
    void usingOnlyTheApiIsAllowed() {
        // beta's good class only talks to alpha.api, and beta.internal is not touched by anyone
        assertThatCode(() -> ArchitectureRules.internalIsPrivateToModule(FIXTURE_ROOT, "beta").check(fixtures))
                .doesNotThrowAnyException();
    }
}
