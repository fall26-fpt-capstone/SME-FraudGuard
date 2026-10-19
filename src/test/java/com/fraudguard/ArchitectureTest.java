package com.fraudguard;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * Enforces the modular-monolith rules; a violation fails {@code ./mvnw verify}.
 *
 * <p>How to see it fail: temporarily add one of these to production code, run {@code ./mvnw test}, then revert.
 * <pre>{@code
 * // in com.fraudguard.dashboard.internal.reporting.ReportingController
 * import com.fraudguard.ruleengine.internal.casemgmt.CaseRepository;      // breaks internalIsPrivate
 * private CaseRepository repo;
 *
 * // in com.fraudguard.ruleengine.internal.TransactionIngestedListener
 * import com.fraudguard.ingestion.internal.transaction.TransactionRepository; // breaks internalIsPrivate
 * private TransactionRepository repo;
 * }</pre>
 * The same rules are also proven to catch violations automatically in {@link ArchitectureRulesSelfTest}.
 */
@AnalyzeClasses(packages = "com.fraudguard", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String ROOT = "com.fraudguard";

    // --- the core rule: other packages go through '<module>.api' only ---------------------------------------

    @ArchTest
    static final ArchRule ingestion_internal_is_private = ArchitectureRules.internalIsPrivateToModule(ROOT, "ingestion");

    @ArchTest
    static final ArchRule ruleengine_internal_is_private = ArchitectureRules.internalIsPrivateToModule(ROOT, "ruleengine");

    @ArchTest
    static final ArchRule dashboard_internal_is_private = ArchitectureRules.internalIsPrivateToModule(ROOT, "dashboard");

    // --- 'api' packages must not leak implementation types --------------------------------------------------

    @ArchTest
    static final ArchRule ingestion_api_is_clean = ArchitectureRules.apiDoesNotExposeInternals(ROOT, "ingestion");

    @ArchTest
    static final ArchRule ruleengine_api_is_clean = ArchitectureRules.apiDoesNotExposeInternals(ROOT, "ruleengine");

    @ArchTest
    static final ArchRule dashboard_api_is_clean = ArchitectureRules.apiDoesNotExposeInternals(ROOT, "dashboard");

    // --- dependency direction between modules ---------------------------------------------------------------

    @ArchTest
    static final ArchRule ingestion_knows_nobody = ArchitectureRules.moduleMustNotDependOn(ROOT, "ingestion", "ruleengine",
            "ingestion only publishes TransactionIngestedEvent; it must not know who consumes it");

    @ArchTest
    static final ArchRule ingestion_does_not_use_dashboard = ArchitectureRules.moduleMustNotDependOn(ROOT, "ingestion", "dashboard",
            "ingestion is upstream of everything else");

    @ArchTest
    static final ArchRule ruleengine_does_not_use_dashboard = ArchitectureRules.moduleMustNotDependOn(ROOT, "ruleengine", "dashboard",
            "dashboard is a consumer of ruleengine, never the other way round");

    @ArchTest
    static final ArchRule dashboard_does_not_use_ingestion = ArchitectureRules.moduleMustNotDependOn(ROOT, "dashboard", "ingestion",
            "dashboard reads cases through ruleengine.api (CaseQueryPort)");

    @ArchTest
    static final ArchRule common_is_shared_kernel = ArchitectureRules.sharedPackageDoesNotDependOnFeatures(ROOT, "common");

    @ArchTest
    static final ArchRule aiclient_is_independent = ArchitectureRules.sharedPackageDoesNotDependOnFeatures(ROOT, "aiclient");

    @ArchTest
    static final ArchRule no_cycles_between_modules = slices().matching("com.fraudguard.(*)..").should().beFreeOfCycles();
}
