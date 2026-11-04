"""Detailed target interactions and processing flows for Report 4.

Operation signatures are proposed design contracts, not implemented HTTP routes.
The catalogue links each operation back to its confirmed SRS functions.
"""
import re
import json
import textwrap
from pathlib import Path

FLOWS = {}
ACTIVITIES = {}

REPOSITORIES = {
    1: 'AccountRepository', 2: 'WorkspaceRepository', 3: 'SubscriptionRepository',
    4: 'OnboardingRepository', 5: 'MemberRepository', 6: 'ConfigurationRepository',
    7: 'TransactionRepository', 8: 'DetectionAttemptRepository',
    9: 'DetectionAttemptRepository', 10: 'TransactionQueryRepository',
    11: 'CaseRepository', 12: 'ReportRepository', 13: 'NotificationRepository',
    14: 'AuditRepository',
}

CONTROLLERS = {
    1: 'AuthController', 2: 'WorkspaceController', 3: 'SubscriptionController',
    4: 'OnboardingController', 5: 'MemberController', 6: 'ConfigurationController',
    7: 'IntegrationController', 8: 'TransactionIngestedListener',
    9: 'DetectionCoordinator', 10: 'TransactionReviewController',
    11: 'CaseController', 12: 'ReportingController',
    13: 'NotificationController', 14: 'MonitoringController',
}


def q(method, statement, result='record', caller='S'):
    """Repository/database round trip with explicit execution specifications."""
    statement = statement.replace('\n', r'\n')
    return f'''{caller} -> R ++: {method}
R -> DB ++: {statement}
DB --> R --: rows / committed result
R --> {caller} --: {result}
'''


def call(target, method, result, caller='S'):
    return f'''{caller} -> {target} ++: {method}
{target} --> {caller} --: {result}
'''


def flow(group, index, method, request, response, body, *, actor='Authorized User',
         view='Workspace Page', controller=None, service=None, ports=None, worker=False,
         fields=None):
    assert (group,index) not in FLOWS
    FLOWS[group,index] = dict(method=method, request=request, response=response, body=body,
        actor=actor, view=view, controller=controller or CONTROLLERS[group], service=service,
        ports=ports or {}, worker=worker, fields=fields or '- workspaceId: UUID\n- expectedVersion: long')


flow(1,1,'login','LoginRequest','LoginResponse',
    q('findByLoginAndScope(req, ctx)', 'SELECT account by login and portal scope', 'account') + r'''
S -> S: verifyPassword(req, account)
alt invalidCredentialOrScope
  S -> S: denyLogin()
else validAccount
  S -> S: createScopedSession(account)
  alt mustChangePassword
    S -> S: selectSetupOnlyDestination()
  else workspaceNotActivated
    S -> S: selectOnboardingDestination()
  else normalAccess
    S -> S: selectRoleDestination(account)
  end
end
''', actor='Provisioned User',view='Login Page',
    fields='- loginName: String\n- password: String\n- portal: PortalType')
flow(1,2,'completeInitialPassword','PasswordChangeRequest','AccountResponse', r'''
S -> S: requireSetupSession(ctx)
S -> S: validateNewPassword(req)
alt validPasswordAndSession
''' + q('saveInitialCredential(req, ctx)', 'UPDATE credential + clear setup restriction\nWHERE current account; COMMIT', 'accountUpdated') + r'''
else validationOrPersistenceFailure
  S -> S: retainSetupRestriction()
end
''', actor='Provisioned User',view='Initial Password Page',
    fields='- newPassword: String\n- confirmation: String')
flow(1,3,'changePassword','PasswordChangeRequest','AccountResponse',
    q('findCurrentAccount(ctx)', 'SELECT authenticated account', 'account') + r'''
S -> S: verifyCurrentIdentity(req, account)
S -> S: validateNewPassword(req)
alt verifiedAndValid
''' + q('updateCredentialIfCurrent(req, ctx)', 'UPDATE protected credential\nWHERE account and current version; COMMIT', 'updated / stale / failed') + r'''
else invalidVerificationOrPassword
  S -> S: rejectCredentialChange()
end
''', actor='Authenticated User',view='Account Page',
    fields='- verification: String\n- newPassword: String\n- confirmation: String')
flow(1,4,'logout','LogoutRequest','LogoutResponse',
    q('endSession(req, ctx)', 'UPDATE current session as ended; COMMIT', 'ended / unconfirmed') + r'''
alt sessionEnded
  S -> S: rejectSubsequentSessionUse(ctx)
else terminationUnconfirmed
  S -> S: returnRetryableOutcome()
end
''',actor='Authenticated User',view='Account Menu',fields='- sessionRef: UUID')

flow(2,1,'readOrUpdateWorkspace','WorkspaceRequest','WorkspaceResponse', r'''
S -> S: authorizeAdministrativeScope(ctx)
''' + q('findAuthorizedWorkspaces(req, ctx)','SELECT administrative metadata\nWHERE admin scope or active Staff assignment','workspacePage') + r'''
opt metadataUpdateRequested
  S -> S: requirePlatformAdmin(ctx)
  S -> S: validateMetadata(req)
''' + q('updateMetadataIfCurrent(req, ctx)','UPDATE permitted metadata with version check\n+ INSERT audit; COMMIT','updated / stale / invalid') + 'end\n',
    actor='Platform Admin / Staff',view='Workspaces Page',
    fields='- workspaceId: UUID\n- criteria: WorkspaceFilter\n- changes: WorkspaceMetadata\n- expectedVersion: long')
flow(2,2,'provisionWorkspace','ProvisionWorkspaceRequest','WorkspaceResponse', r'''
S -> S: requirePlatformAdmin(ctx)
S -> S: validateProvisioning(req)
''' + q('findProvisioningConflicts(req)','SELECT enterprise, workspace and login uniqueness','conflicts') + r'''
alt noConflict
''' + q('createWorkspaceAndAdmin(req, ctx)','BEGIN; INSERT enterprise + workspace\n+ restricted SME Admin + audit; COMMIT','provisioningResult') + r'''
else duplicateOrInvalid
  S -> S: rejectProvisioning()
end
''',actor='Platform Admin',view='Provision Workspace Page',
    fields='- enterprise: EnterpriseInput\n- workspaceSlug: String\n- adminLogin: String\n- contactEmail: String')
flow(2,3,'updateStaffAssignments','StaffAssignmentRequest','WorkspaceResponse', r'''
S -> S: requirePlatformAdmin(ctx)
''' + q('findCurrentAssignments(req)','SELECT assignments + eligible platform Staff','assignmentSet') + r'''
S -> S: validateAssignmentChanges(req)
alt eligibleAndCurrent
''' + q('applyAssignmentChanges(req, ctx)','UPDATE selected assignments + INSERT new assignments\n+ history; COMMIT if current version','currentAssignments') + r'''
else ineligibleOrStale
  S -> S: rejectAssignmentChanges()
end
''',actor='Platform Admin',view='Staff Assignment Page',
    fields='- workspaceId: UUID\n- additions: Set<UUID>\n- removals: Set<UUID>\n- expectedVersion: long')

flow(3,1,'maintainOffer','PlanOfferRequest','PlanOfferResponse', r'''
S -> S: requirePlatformAdmin(ctx)
''' + q('findOffersAndUsage(req)','SELECT offer metadata + usage references','offers') + r'''
opt saveOrRetireRequested
  S -> S: validateFixedEntitlementsAndPrices(req)
  alt usedOfferDeletion
    S -> S: rejectDeletionAndRequireRetirement()
  else validOfferChange
''' + q('saveOfferIfCurrent(req, ctx)','UPDATE/INSERT offer + audit; COMMIT\nPreserve historical quotes and periods','saved / stale / failed') + '  end\nend\n',
    actor='Platform Admin',view='Plan Catalogue Page',
    fields='- planType: PlanType\n- monthlyPrice: Decimal\n- annualPrice: Decimal\n- currency: String\n- action: OfferAction\n- expectedVersion: long')
flow(3,2,'grantInitialPlan','InitialPlanRequest','SubscriptionResponse', r'''
S -> S: requirePlatformAdmin(ctx)
''' + q('findWorkspaceAndOffer(req)','SELECT onboarding state + available offer','allocationContext') + r'''
alt onboardingAndAvailableOffer
''' + q('saveInitialAllocation(req, ctx)','INSERT single initial allocation + history; COMMIT','awaitingActivation / Free') + r'''
else invalidOrAlreadyOperational
  S -> S: rejectInitialGrant()
end
''',actor='Platform Admin',view='Initial Plan Page',
    fields='- workspaceId: UUID\n- offerId: UUID\n- termMonths: int')
flow(3,3,'purchaseSubscription','PurchaseRequest','CheckoutResponse', r'''
S -> S: requireOwnWorkspaceAdmin(ctx)
''' + q('findEntitlementAndOffers(req, ctx)','SELECT current periods, purchases and available offers','currentSubscription') + r'''
S -> S: validateOperationalPurchase(req)
''' + q('createQuotedPurchase(req, ctx)','INSERT purchase + fixed quote + history; COMMIT','pendingPurchase') +
    call('P','initiateCheckout(purchase)','checkoutReference') + r'''
S -> S: mapServerKnownPurchaseStatus(purchase)
''',actor='SME Admin',view='Plans and Checkout Page',ports={'P':('PaymentGatewayPort','external')},
    fields='- offerId: UUID\n- termMonths: int\n- reviewedQuote: QuoteReference')
flow(3,4,'verifyAndApplyPayment','PaymentConfirmation','PaymentProcessingResult',
    call('P','verifyConfirmation(req)','verifiedPayment / rejection') +
    q('lockPurchaseAndEntitlement(req)','SELECT purchase + current validity FOR UPDATE','purchaseContext') + r'''
S -> S: matchPaymentIdentityAmountCurrency(req)
alt verifiedSuccessfulPayment
  alt purchaseAlreadyApplied
    S -> S: reuseAppliedEntitlement()
  else firstPaidEffect
    S -> S: calculateCalendarPeriod(req)
''' + q('applyPaymentOnce(req)','INSERT verified payment + period + audit\nCOMMIT once by purchase identity','applied / recoverableFailure') + r'''
  end
else unverifiedOrMismatched
''' + q('recordUnappliedPayment(req)','INSERT safe verification outcome; no entitlement','unapplied') + 'end\n',
    actor='VNPay',controller='PaymentCallbackController',worker=True,
    ports={'P':('PaymentGatewayPort','external')},
    fields='- purchaseRef: UUID\n- providerRef: String\n- amount: Decimal\n- currency: String\n- authenticatedProof: ProviderProof')
flow(3,5,'resolveEntitlement','EntitlementRequest','EntitlementDecision',
    q('findCommittedPeriods(req)','SELECT committed workspace Subscription periods','periods') + r'''
S -> S: evaluateValidityAt(req, periods)
alt startInclusiveAndBeforeExpiry
  S -> S: allowSubscriptionPath()
else noValidPeriod
  S -> S: selectRulesAndDenyNewCase()
else inconsistentOrUnavailable
  S -> S: failEntitlementResolution()
end
''',actor='Protected Operation',controller='EntitlementPolicy',worker=True,
    fields='- workspaceId: UUID\n- operationTime: Instant\n- operationType: OperationType')

flow(4,1,'maintainSpecifications','SpecificationRequest','OnboardingResponse', r'''
S -> S: authorizeSetupScope(ctx)
''' + q('findProgressAndSpecifications(req, ctx)','SELECT specifications, Staff and onboarding events\nWHERE authorized workspace','onboardingDetail') + r'''
opt specificationUpdateRequested
  S -> S: validateDocumentAndSpecifications(req)
''' + call('P','storeProtectedDocument(req)','protectedDocumentRef') +
    q('saveSpecificationsWithHistory(req, ctx)','INSERT/UPDATE specification references + attribution; COMMIT','saved / failed') + 'end\n',
    actor='Authorized Setup Actor',view='Onboarding Page',ports={'P':('DocumentStoragePort','external')},
    fields='- workspaceId: UUID\n- specifications: SpecificationInput\n- document: UploadedDocument\n- expectedVersion: long')
flow(4,2,'confirmReadiness','ReadinessRequest','OnboardingResponse', r'''
S -> S: requireAssignedStaff(ctx)
''' + call('P','getAppliedConfigurationEvidence(req)','currentVersion + testEvidence') + r'''
S -> S: validateCurrentAssessment(req)
alt completeAndCurrent
''' + q('saveReadinessIfCurrent(req, ctx)','INSERT readiness + actor/time/config reference\nCOMMIT if current version','pendingHandoverReview') + r'''
else missingOrChangedConfiguration
  S -> S: rejectReadiness()
end
''',actor='Assigned Staff',view='Readiness Page',ports={'P':('ConfigurationQueryPort','port')},
    fields='- workspaceId: UUID\n- configurationRef: UUID\n- testRef: UUID\n- assessment: String\n- expectedVersion: long')
flow(4,3,'reviewHandover','HandoverRequest','OnboardingResponse', r'''
S -> S: requirePlatformAdmin(ctx)
''' + q('findCurrentReadiness(req)','SELECT current readiness + assessed configuration','readiness') + r'''
S -> S: validateHandoverDecision(req)
alt currentReadinessAndApproval
''' + q('saveApprovalIfCurrent(req, ctx)','INSERT approval + history; COMMIT if current','approvedForActivation') + r'''
else returnedWithComments
''' + q('saveReturnIfCurrent(req, ctx)','INSERT return comments + history; COMMIT if current','renewedReadinessRequired') + r'''
else missingOrStaleDecision
  S -> S: rejectHandoverDecision()
end
''',actor='Platform Admin',view='Handover Review Page',
    fields='- readinessRef: UUID\n- decision: HandoverDecision\n- comments: String\n- expectedVersion: long')
flow(4,4,'activateWorkspace','ActivationRequest','OnboardingResponse', r'''
S -> S: requireOwnWorkspaceAdmin(ctx)
''' + q('lockActivationState(req, ctx)','SELECT workspace + readiness + approval FOR UPDATE','activationContext') + r'''
alt alreadyActivated
  S -> S: reuseActivationResult()
else currentReadinessAndApproval
''' + call('P','prepareInitialTerm(req)','initialTerm / Free') +
    q('activateWithInitialTermOnce(req, ctx)','UPDATE activation + INSERT initial term + history\nCOMMIT atomically once','operational / rolledBack') + r'''
else unmetOrStaleGate
  S -> S: denyActivation()
end
''',actor='SME Admin',view='Workspace Activation Page',ports={'P':('SubscriptionPort','port')},
    fields='- workspaceId: UUID\n- approvalRef: UUID\n- expectedVersion: long')

flow(5,1,'manageMember','MemberRequest','MemberResponse', r'''
S -> S: requireOwnWorkspaceAdmin(ctx)
''' + q('findAuthorizedMembers(req, ctx)','SELECT own-workspace account metadata','memberPage') + r'''
opt provisionOrChangeRequested
  S -> S: validateEnterpriseRoleAndLogin(req)
  S -> S: checkContinuityAndCaseResponsibility(req)
  alt permittedAndCurrent
''' + q('saveMemberIfCurrent(req, ctx)','INSERT/UPDATE enterprise member + audit\nNew account requires initial password change; COMMIT','saved / stale / failed') + r'''
  else forbiddenOrUnresolved
    S -> S: rejectMemberChange()
  end
end
''',actor='SME Admin',view='Members Page',
    fields='- memberId: UUID\n- loginName: String\n- contactEmail: String\n- enterpriseRole: EnterpriseRole\n- action: MemberAction\n- expectedVersion: long')
flow(5,2,'setFieldPermission','FieldPermissionRequest','MemberResponse', r'''
S -> S: requireOwnWorkspaceAdmin(ctx)
''' + q('findMemberAndFieldScope(req, ctx)','SELECT target role + declared sensitive fields','permissionContext') + r'''
S -> S: requireOperatorOrInvestigatorTarget(req)
alt allowedFieldScopeAndCurrent
''' + q('saveFieldGrantIfCurrent(req, ctx)','UPDATE explicit field grants + value-free audit; COMMIT','grantState') + r'''
else invalidOrStalePermission
  S -> S: rejectPermissionChange()
end
''',actor='SME Admin',view='Member Permissions Page',
    fields='- memberId: UUID\n- fieldIds: Set<UUID>\n- grant: boolean\n- expectedVersion: long')

flow(6,1,'editCandidate','ConfigurationEditRequest','ConfigurationResponse', r'''
S -> S: requireCurrentStaffAssignment(ctx)
''' + q('findActiveAndCandidate(req, ctx)','SELECT separate active and candidate revisions','configurationDetail') + r'''
opt draftChangeRequested
  S -> S: validateFieldsMappingsAndFlatRules(req)
  S -> S: checkTypedOperatorsAndEmptySemantics(req)
  alt validAndCurrentRevision
''' + q('saveDraftRevisionIfCurrent(req, ctx)','INSERT candidate revision + change history\nWHERE expected draft revision; COMMIT','newDraftRevision') + r'''
  else invalidOrStale
    S -> S: rejectCandidateChange()
  end
end
''',actor='Assigned Staff',view='Configuration Editor',
    fields='- workspaceId: UUID\n- draftRef: UUID\n- expectedRevision: long\n- fieldChanges: List<FieldInput>\n- mappingChanges: List<MappingInput>\n- ruleChanges: List<RuleInput>')
flow(6,2,'testConfiguration','ConfigurationTestRequest','TestRunResponse', r'''
S -> S: requireCurrentStaffAssignment(ctx)
''' + q('findExactRevision(req)','SELECT immutable configuration at requested revision','pinnedConfiguration') + r'''
S -> S: validateSampleStructure(req)
alt usableSampleInput
  loop eachSample
''' + call('P','validateSample(req)','normalizedSample / safeFieldErrors') + r'''
    opt sampleValid
''' + call('E','evaluateSample(req)','matchedRules / explicitFailure') + r'''
    end
  end
end
''' + q('saveSafeRunMetadata(req, ctx)','INSERT runner, time, revision, counts and outcome\nExclude sample contents; COMMIT','testRunRef') + r'''
S -> S: cleanupTemporarySamplesInFinally(req)
opt historyRequested
''' + q('findAuthorizedTestHistory(req, ctx)','SELECT safe run metadata in assigned workspace','testRunPage') + 'end\n',
    actor='Assigned Staff',view='Sample Test Page',
    ports={'P':('SampleValidationPort','port'),'E':('SampleRuleEvaluationPort','port')},
    fields='- configurationRef: UUID\n- revision: long\n- channel: IngestionChannel\n- temporarySamples: SampleInput')
flow(6,3,'applyConfiguration','ApplyConfigurationRequest','ConfigurationResponse', r'''
S -> S: requireCurrentStaffAssignment(ctx)
''' + q('lockCandidateAndActive(req)','SELECT draft, test metadata and active reference FOR UPDATE','applicationContext') + r'''
S -> S: validateExactRevisionTestAndAssessment(req)
alt validCurrentDraftAndExpectedActive
''' + q('activateRevisionIfCurrent(req, ctx)','SWITCH single active version + retain previous version\n+ INSERT application history; COMMIT','newActiveVersion / rolledBack') + r'''
else invalidUntestedOrStale
  S -> S: retainPreviousActiveVersion()
end
''',actor='Assigned Staff',view='Configuration Apply Page',
    fields='- draftRef: UUID\n- revision: long\n- testRef: UUID\n- expectedActiveRef: UUID\n- assessment: String')

flow(7,1,'manageCredential','CredentialRequest','CredentialResponse', r'''
S -> S: authorizeKeyAdministration(ctx)
''' + q('findCredentialMetadata(req, ctx)','SELECT prefix, status and history only','credentialPage') + r'''
alt issueOrReplaceRequested
  S -> S: requireAdminOrAssignedStaff(ctx)
  S -> S: generateSecretAndVerifier()
''' + q('saveNewVerifier(req, ctx)','INSERT credential verifier + safe history; COMMIT','issuedCredential') + r'''
  S -> S: discloseNewSecretOnce()
else disableRequested
''' + q('disableCredentialIfAllowed(req, ctx)','UPDATE disabled state + safe history; COMMIT','disabled / alreadyDisabled / failed') + r'''
end
''',actor='Authorized Key Actor',view='Integration Keys Page',controller='CredentialController',
    service='CredentialService',
    fields='- credentialId: UUID\n- action: CredentialAction\n- expectedVersion: long')
flow(7,2,'submitRest','RestTransactionRequest','IngestionResult',
    call('P','authenticateSubmission(req)','trustedWorkspace / rejection') + r'''
alt validKeyAndActivatedWorkspace
''' + call('A','validateAndAccept(req)','accepted / duplicate / conflict / invalid') + r'''
else invalidKeyOrInactiveWorkspace
  S -> S: rejectBeforeAcceptance()
end
''',actor='Customer Transaction System',controller='RestIngestController',worker=True,
    service='TransactionIngestionService',
    ports={'P':('SubmissionAuthenticationPort','port'),'A':('TransactionAcceptancePort','port')},
    fields='- credential: SubmissionCredential\n- payload: TransactionPayload')
flow(7,3,'receiveWebhook','WebhookDeliveryRequest','WebhookReceipt', r'''
S -> S: verifySenderSignatureAndReplay(req)
S -> S: requireActivatedWorkspace(req)
''' + q('findDeliveryState(req)','SELECT connection-scoped delivery identity and stage','deliveryState') + r'''
alt completedDelivery
  S -> S: reuseDeliveryResult()
else newOrRetryableDelivery
''' + call('A','validateAndAccept(req)','accepted / duplicate / conflict / invalid') +
    q('saveDeliveryStage(req)','INSERT/UPDATE authenticated delivery receipt; COMMIT','guaranteedStage') + r'''
end
''',actor='Customer Transaction System',controller='WebhookController',worker=True,
    service='TransactionIngestionService',ports={'A':('TransactionAcceptancePort','port')},
    fields='- connectionRef: UUID\n- eventRef: String\n- authentication: DeliveryProof\n- payload: TransactionPayload')
flow(7,4,'importTransactions','ProductionImportRequest','ImportResponse', r'''
S -> S: requireAdminOrOperator(ctx)
S -> S: validateActivationAndFileStructure(req)
alt structurallyValidFile
''' + q('createImportBatch(req, ctx)','INSERT import reference and processing stage; COMMIT','batchRef') + r'''
  loop eachReadableRow
''' + call('A','validateAndAccept(req)','new / duplicate / conflict / invalid') +
    q('saveExclusiveRowOutcome(req)','INSERT one row outcome + safe reference; COMMIT','rowRecorded') + r'''
  end
''' + q('reconcileBatchCounts(req)','UPDATE completed categories and pending count; COMMIT','importSummary') + r'''
else unreadableOrInvalidStructure
  S -> S: rejectFileWithoutProductionRows()
end
''',actor='SME Admin / Operator',view='Production Import Page',controller='FileImportController',
    service='TransactionIngestionService',ports={'A':('TransactionAcceptancePort','port')},
    fields='- workspaceId: UUID\n- file: UploadedFile\n- channel: File')
flow(7,5,'normalizeAndValidate','ValidationRequest','ValidationResult',
    call('P','resolvePinnedMapping(req)','fieldDefinitions + channelMapping') + r'''
S -> S: convertDeclaredTypes(req)
S -> S: validateRequiredFieldsAndPrecision(req)
alt invalidOrAmbiguousValue
  S -> S: returnSafeFieldErrors()
else validSample
  S -> S: returnTemporaryValuesOnly()
else validProductionValues
  S -> S: calculateBusinessFingerprint(req)
end
''',actor='Authenticated Channel',controller='ValidationPipeline',worker=True,
    service='NormalizationService',ports={'P':('ConfigurationQueryPort','port')},
    fields='- configurationRef: UUID\n- mode: ProcessingMode\n- sourceValues: TypedValues\n- channel: IngestionChannel')
flow(7,6,'acceptNormalized','AcceptanceRequest','IngestionResult', r'''
S -> S: resolveAuthoritativeAcceptanceContext(req)
''' + q('resolveBusinessIdentityAtomically(req)','BEGIN; resolve unique(workspace, externalId)\nand normalized fingerprint','identityOutcome') + r'''
alt equivalentNormalizedContent
  S -> S: returnExistingReference()
else conflictingContent
  S -> S: rejectWithoutOverwriting()
else newBusinessIdentity
''' + q('commitTransactionAndReceipt(req)','INSERT protected transaction + receipt\n+ selected plan/configuration context; COMMIT','acceptedRef / explicitFailure') + r'''
  opt acceptanceCommitted
''' + call('P','publishTransactionIngested(req)','eventPublished / recoverableDispatchFailure') + r'''
  end
end
''',actor='Validated Production Channel',controller='TransactionAcceptanceHandler',worker=True,
    service='TransactionIngestionService',ports={'P':('TransactionEventPublisher','port')},
    fields='- workspaceId: UUID\n- externalId: String\n- normalizedValues: TypedValues\n- fingerprint: String\n- selectedContext: AcceptanceContext')

flow(8,1,'evaluateTransaction','RuleEvaluationRequest','RuleEvaluationResult',
    call('P','findEnabledRules(req)','selectedVersion + enabledRules') + r'''
loop eachEnabledRule
  S -> S: evaluateTypedConditions(req)
end
alt invalidConfigurationOrEvaluationError
''' + q('saveFailedAttempt(req)','INSERT failed attempt + safe diagnostic reference; COMMIT','failedAttempt') + r'''
else completedEvaluation
''' + q('saveAttemptAndAllMatches(req)','INSERT attempt + every matched-rule reference; COMMIT','completedAttempt') + r'''
  opt matchedRulesNotEmpty
''' + call('A','createRuleAlertOnce(req)','oneAggregatedRuleAlert / recoverableFailure') + r'''
  end
end
''',actor='TransactionIngestedEvent / Fallback',worker=True,service='RuleEvaluationService',
    ports={'P':('ConfigurationQueryPort','port'),'A':('AlertCommandPort','port')},
    fields='- transactionRef: UUID\n- normalizedValues: TypedValues\n- configurationRef: UUID\n- source: RuleDetectionSource')

flow(9,1,'classifyAcceptedTransaction','DetectionRequest','DetectionResult',
    call('P','classify(req)','Normal / Anomaly + modelVersion / unusable') + r'''
alt validClassificationAndVersion
''' + q('saveAiAttempt(req)','INSERT AI attempt + model/service version; COMMIT','aiAttempt') + r'''
  opt classificationIsAnomaly
''' + call('A','createOrReuseAiAlert(req)','singleTransactionAiAlert') + r'''
  end
else timeoutUnavailableOrInvalidResponse
''' + q('saveFailedAiAttempt(req)','INSERT failed AI attempt with safe reason; COMMIT','failedAiAttempt') +
    call('E','evaluateFallback(req)','matched / noMatch / explicitFailure') +
    q('linkFallbackAttempt(req)','SAVE distinct fallback attempt/source; COMMIT','fallbackResult') + 'end\n',
    actor='Accepted Subscription Work',worker=True,service='ScoringService',
    ports={'P':('AIServicePort','external'),'E':('RuleEnginePort','port'),'A':('AlertCommandPort','port')},
    fields='- transactionRef: UUID\n- permittedFeatures: TypedValues\n- selectedContext: AcceptanceContext')
flow(9,2,'recoverFallbackTransaction','RecoveryRequest','DetectionResult',
    call('H','findHistoricalEntitlement(req)','eventTimeEligible / ineligible') + r'''
alt historicallyEntitledEventTime
''' + q('findRecoveryOperation(req)','SELECT stored fallback and recovery operation identity','existingOperation') + r'''
  alt operationAlreadyCompleted
    S -> S: reuseRecoveryResult()
  else newOrRetryableOperation
''' + call('P','classify(req)','classification + modelVersion / failure') +
    q('appendRecoveryAttempt(req)','INSERT separate recovery attempt + original references; COMMIT','recoveryAttempt') + r'''
    alt validAnomaly
''' + call('A','createOrReuseAiAlert(req)','singleTransactionAiAlert') + r'''
    else normalOrFailed
      S -> S: preserveExistingAlertsAndCases()
    end
  end
else noHistoricalEntitlement
  S -> S: excludeFromRecovery()
end
''',actor='AI Recovery Worker',controller='RecoveryCoordinator',worker=True,service='ScoringService',
    ports={'H':('EntitlementHistoryPort','port'),'P':('AIServicePort','external'),'A':('AlertCommandPort','port')},
    fields='- transactionRef: UUID\n- eventTime: Instant\n- operationRef: UUID')

flow(10,1,'reviewTransactionsOrImport','TransactionReviewRequest','TransactionReviewResponse', r'''
S -> S: authorizeRequestedReview(ctx)
alt authorizedOperatorTransactionView
''' + q('findProtectedTransactions(req, ctx)','SELECT bounded transaction projection\nWHERE workspace and permitted object scope','protectedTransactionPage') + r'''
else authorizedAdminOrOperatorImportView
''' + q('findImportResults(req, ctx)','SELECT batch + exclusive row outcomes + pending counts\nWHERE authorized workspace','safeImportDetail') + r'''
else forbiddenRoleOrObject
  S -> S: denyWithoutDisclosure()
end
''',actor='Enterprise User',view='Transactions / Import Results Page',service='ReviewService',
    fields='- transactionRef: UUID\n- batchRef: UUID\n- criteria: ReviewFilter\n- page: PageRequest')
flow(10,2,'reviewAlertsAndHistory','AlertReviewRequest','AlertReviewResponse', r'''
S -> S: requireWorkspaceOperator(ctx)
''' + q('findProtectedAlertHistory(req, ctx)','SELECT original alert, attempts and version references\nWHERE workspace scope','protectedAlertHistory') + r'''
opt ruleAlertFollowUpRequested
''' + q('saveReviewFlagIfCurrent(req, ctx)','UPDATE Rule Alert follow-up flag + audit\nWHERE current version; COMMIT','saved / stale / failed') + r'''
end
S -> S: preserveOriginalDetectionSources()
''',actor='Operator',view='Alerts and Detection History Page',controller='AlertReviewController',
    service='ReviewService',
    fields='- alertRef: UUID\n- transactionRef: UUID\n- followUp: boolean\n- expectedVersion: long')
flow(10,3,'revealFields','DisclosureRequest','DisclosureResponse',
    call('P','authorizeCurrentDisclosure(req, ctx)','permittedFields / denied') + r'''
alt currentRoleFieldGrantAndObjectAccess
''' + q('findProtectedValues(req, ctx)','SELECT authorized encrypted fields + key reference','protectedValues') +
    call('E','decryptPermittedFields(req)','authorizedPlaintext / failure') +
    q('recordDisclosureAudit(req, ctx)','INSERT actor/time/object/field references; COMMIT\nExclude plaintext values','auditCommitted / failed') + r'''
  alt decryptionAndAuditSucceeded
    S -> S: createPermittedDisclosureResponse(req)
  else requiredProcessingFailed
    S -> S: discardPlaintextResponse()
  end
else missingGrantOrAssignment
  S -> S: denyWithoutDisclosure()
end
''',actor='Operator / Assigned Investigator',view='Authorized Field Reveal',
    controller='DisclosureController',service='DisclosureService',
    ports={'P':('DisclosurePolicy','policy'),'E':('ProtectedValuePort','port')},
    fields='- transactionRef: UUID\n- caseRef: UUID\n- fieldIds: Set<UUID>')

flow(11,1,'openCase','OpenCaseRequest','CaseResponse', r'''
S -> S: requireWorkspaceOperator(ctx)
''' + call('P','requireCurrentSubscription(req, ctx)','eligible / denied') +
    call('A','validateUnlinkedAiAlerts(req, ctx)','sameWorkspaceAiAlertRefs / denied') + r'''
alt eligibleCurrentSubscriptionAndAiAlerts
''' + q('createCaseWithUniqueAiLinks(req, ctx)','INSERT Open case + all AI-only links + audit\nCOMMIT with unique alert-to-case protection','caseRef / concurrentLinkConflict') + r'''
else invalidOriginScopeOrEntitlement
  S -> S: rejectCaseCreation()
end
''',actor='Operator',view='AI Alert Case Creation Page',service='CaseService',
    ports={'P':('EntitlementQueryPort','port'),'A':('AlertQueryPort','port')},
    fields='- aiAlertIds: Set<UUID>\n- caseInformation: CaseInput')
flow(11,2,'readOrAssignCase','CaseAssignmentRequest','CaseResponse', r'''
S -> S: authorizeCaseScope(ctx)
''' + q('findAuthorizedCases(req, ctx)','SELECT protected cases\nWHERE Operator workspace or current Investigator assignment','casePage') + r'''
opt assignmentOrSelfInvestigationRequested
  S -> S: requireOperatorAndEligibleAssignee(req, ctx)
  S -> S: requireOpenOrActiveCurrentCase(req)
''' + q('assignCaseIfCurrent(req, ctx)','SAVE assignment + history; first start Open -> Investigating\nReassignment retains active/review state; COMMIT','currentResponsibility / stale') + r'''
end
''',actor='Operator / Investigator',view='Cases and Assignment Page',service='CaseService',
    fields='- caseRef: UUID\n- assigneeRef: UUID\n- investigatePersonally: boolean\n- expectedVersion: long')
flow(11,3,'saveFindingsAndSubmit','InvestigationRequest','InvestigationResponse', r'''
S -> S: requireInvestigatingCaseAccess(req, ctx)
S -> S: validateFindingsAndEvidence(req)
''' + q('saveFindingsIfCurrent(req, ctx)','INSERT protected findings + evidence references + authorship\nCOMMIT if current case/assignment','savedFindings / stale / failed') + r'''
opt reportSubmissionRequested
  S -> S: recheckAssignmentAndRequiredReport(req, ctx)
''' + q('submitReportIfCurrent(req, ctx)','INSERT submitted version + history\nUPDATE Investigating -> Pending Review; COMMIT atomically','submitted / rolledBack') + 'end\n',
    actor='Operator / Assigned Investigator',view='Investigation Report Page',service='CaseService',
    fields='- caseRef: UUID\n- findings: ProtectedText\n- evidenceRefs: Set<UUID>\n- proposedConclusion: ConclusionType\n- submit: boolean\n- expectedVersion: long')
flow(11,4,'reviewInvestigation','CaseReviewRequest','CaseResponse', r'''
S -> S: requireWorkspaceOperator(ctx)
''' + q('findCurrentSubmittedReport(req, ctx)','SELECT Pending Review case + latest submitted report','reviewContext') + r'''
S -> S: validateReviewVersionAndDecision(req)
alt requestMoreWorkWithComments
''' + q('returnToInvestigationIfCurrent(req, ctx)','INSERT review comments + history\nUPDATE Pending Review -> Investigating; COMMIT','investigating / stale / failed') + r'''
else validFinalConclusion
''' + q('confirmConclusionIfCurrent(req, ctx)','INSERT separate conclusion + confirmation history\nUPDATE Pending Review -> Closed; COMMIT atomically','closed / stale / failed') + r'''
else forbiddenOrIncompleteReview
  S -> S: rejectReviewWithoutTransition()
end
''',actor='Operator',view='Investigation Review Page',service='CaseService',
    fields='- caseRef: UUID\n- reportRef: UUID\n- action: ReviewAction\n- conclusion: ConclusionType\n- rationale: ProtectedText\n- expectedVersion: long')

flow(12,1,'viewDashboardOrReport','ReportingQueryRequest','ReportingResponse', r'''
S -> S: validateCriteriaAndReportingScope(req, ctx)
alt authorizedDashboard
''' + call('P','queryAuthorizedAggregates(req, ctx)','roleScopedSummary') + r'''
else authorizedInvestigationReport
''' + call('P','queryAuthorizedReportVersion(req, ctx)','protectedReportVersion') + r'''
else forbiddenTarget
  S -> S: denyReportRead()
end
S -> S: protectResultFieldsAndHistory()
''',actor='Enterprise User',view='Dashboard / Reports Page',service='ReportingService',
    ports={'P':('ReportingQueryPort','port')},
    fields='- criteria: ReportingCriteria\n- reportRef: UUID\n- page: PageRequest')
flow(12,2,'generateAndExport','ReportExportRequest','ReportExportResponse', r'''
S -> S: authorizeGenerationCriteria(req, ctx)
''' + q('createReportOperation(req, ctx)','INSERT generation reference + validated criteria','operationRef') +
    call('P','queryAuthorizedReportData(req, ctx)','protectedReportData / failure') +
    q('completeReportOperation(req)','SAVE complete/empty report or explicit failed stage; COMMIT','generationResult') + r'''
opt supportedExportRequested
  S -> S: recheckExportScope(req, ctx)
  S -> S: protectFieldsAndNeutralizeFormulas(req)
''' + q('saveCompleteExport(req, ctx)','INSERT complete protected export reference; COMMIT','artifactRef / failed') + r'''
end
opt downloadRequested
  S -> S: recheckArtifactAccess(req, ctx)
  S -> S: serveOnlyCompleteAuthorizedArtifact(req)
end
''',actor='SME Admin / Operator',view='Report Generation and Export Page',service='ReportingService',
    ports={'P':('ReportingQueryPort','port')},
    fields='- criteria: ReportingCriteria\n- reportRef: UUID\n- format: ExportFormat\n- action: ReportAction')

flow(13,1,'createAndReadNotifications','NotificationRequest','NotificationResponse', r'''
S -> S: resolveRelevantRecipients(req)
''' + q('saveMinimalNotification(req)','INSERT recipient-scoped minimal safe context; COMMIT','notificationRef') + r'''
opt recipientListsNotifications
  S -> S: authorizeCurrentRecipient(ctx)
''' + q('findRelevantNotifications(req, ctx)','SELECT bounded recipient/workspace notification summaries','notificationPage') + r'''
end
opt targetLinkOpened
  S -> S: recheckTargetRoleWorkspaceAndAssignment(req, ctx)
end
''',actor='Enterprise Recipient / Committed Event',view='Notifications Page',
    service='NotificationService',
    fields='- eventRef: UUID\n- notificationRef: UUID\n- criteria: NotificationFilter')
flow(13,2,'deliverEmail','EmailNotificationRequest','EmailDeliveryResult',
    call('P','resolveAuthorizedContact(req)','configuredContact / invalid') + r'''
alt permittedRecipientAndContact
  S -> S: buildMinimalSafeTemplate(req)
''' + call('E','sendMinimalEmail(req)','sent / providerFailure') + r'''
else missingOrUnauthorizedContact
  S -> S: rejectEmailDisclosure()
end
''' + q('saveDeliveryOutcome(req)','SAVE delivery result + safe retry reference; COMMIT','deliveryRecorded') + r'''
opt retryableDelivery
''' + call('P','resolveAuthorizedContact(req)','currentPermittedContact / denied') +
    call('E','retryDeliveryOnly(req)','deliveryOutcome') + 'end\n',
    actor='Notification Event / Retry Worker',controller='NotificationListener',worker=True,
    service='NotificationService',ports={'P':('ContactDirectoryPort','port'),'E':('EmailPort','external')},
    fields='- eventRef: UUID\n- recipientRef: UUID\n- templateRef: String\n- deliveryRef: UUID')

flow(14,1,'monitorOperations','MonitoringRequest','MonitoringResponse', r'''
S -> S: requirePlatformAdmin(ctx)
S -> S: validateOperationalFilters(req)
''' + call('P','readSafeOperationalTelemetry(req)','observedStatus + time + safeCounts') + r'''
alt currentTelemetry
  S -> S: mapObservedHealth()
else staleMissingOrUnavailable
  S -> S: mapUnknownOrLastKnownState()
end
''',actor='Platform Admin',view='Platform Monitoring Page',service='MonitoringService',
    ports={'P':('OperationalTelemetryPort','port')},
    fields='- serviceRef: String\n- timeRange: TimeRange\n- statusFilter: HealthFilter')
flow(14,2,'recordAndReadHistory','AuditRequest','AuditResponse', r'''
opt validatedLocalBusinessAction
  S -> S: buildValueFreeAttribution(req, ctx)
''' + q('commitBusinessChangeAndAudit(req, ctx)','COMMIT local business change + required audit together\nROLLBACK both when required history fails','committed / rolledBack') + r'''
end
opt objectHistoryRequested
''' + call('P','authorizeUnderlyingObjectHistory(req, ctx)','permittedScope / denied') + r'''
  alt authorizedObjectScope
''' + q('findScopedHistory(req, ctx)','SELECT protected immutable attribution\nWHERE underlying administrative/case scope','auditPage') + r'''
  else unauthorizedSearch
    S -> S: denyAuditRead()
  end
end
''',actor='Business Action / Authorized Reader',view='Object History Page',controller='AuditController',
    service='AuditService',ports={'P':('ObjectAccessPolicy','policy')},
    fields='- action: AuditAction\n- objectRef: UUID\n- safeMetadata: SafeMetadata\n- criteria: AuditFilter')

for key, repository in {
    (3,1):'PlanRepository', (3,3):'PurchaseOrderRepository',
    (3,4):'PurchaseOrderRepository', (3,5):'SubscriptionPeriodRepository',
    (7,1):'ApiCredentialRepository', (7,3):'IngestionReceiptRepository',
    (7,4):'ImportBatchRepository',
}.items():
    FLOWS[key]['repository'] = repository

ACTIVITIES[1, 1] = '''
start
:Trigger: login / password change / logout;
switch (Action type?)
case (login)
  :Verify account, credential and portal/workspace membership;
  if (Valid available account?) then (yes)
    if (Initial password change required?) then (yes)
      :Issue setup-only session and open password form;
    else (no)
      :Create scoped session; route unactivated SME Admin to onboarding;
    endif
  else (no)
    :Deny login with safe error;
  endif
case (password change)
  :Verify setup/current identity and password policy;
  if (Valid request?) then (yes)
    :Save protected credential;
    if (Save committed?) then (yes)
      :Clear initial-change restriction when applicable;
    else (no)
      :Keep existing credential and restriction;
    endif
  else (no)
    :Return safe validation error;
  endif
case (logout)
  :Invalidate server session and clear local authentication;
  if (Server termination confirmed?) then (yes)
    :Return logged-out state;
  else (no)
    :Show unconfirmed termination; allow retry;
  endif
endswitch
stop
'''
ACTIVITIES[3,1] = '''
start
:Trigger: initial allocation or entitlement check;
if (Initial onboarding Subscription?) then (yes)
  if (Approved workspace activated?) then (yes)
    :Start initial calendar term once;
    :Persist UTC start and expiry;
  else (no)
    :Retain allocation awaiting activation;
    stop
  endif
endif
:Load authoritative committed periods;
if (Period data available and consistent?) then (yes)
  if (Start <= now < expiry?) then (yes)
    :Allow Subscription AI path for new acceptance;
    :Permit new-case request only after role and AI Alert checks;
  else (no)
    :Use primary rules for new acceptance;
    :Deny new case creation;
  endif
  :Preserve selected context of already accepted work;
  :Retain authorized existing cases and history;
else (no)
  :Return controlled entitlement error;
endif
stop
'''
ACTIVITIES[3,2] = '''
start
:Receive payment confirmation or reconciliation;
:Authenticate provider and resolve stored purchase;
if (Successful payment matches identity, amount and currency?) then (yes)
  :Serialize purchase and entitlement update;
  if (Purchase already applied?) then (yes)
    :Return previously committed paid effect;
  else (no)
    if (Current Subscription still valid?) then (yes)
      :Extend from current expiry;
    else (no)
      :Start from paid-entitlement activation;
    endif
    :Calculate calendar month/year in Asia/Ho_Chi_Minh;
    :Clamp missing calendar date to month end;
    :Commit payment, UTC period and history once;
    if (Local commit succeeded?) then (yes)
      :Expose active entitlement;
    else (no)
      :Retain recoverable outcome without another charge;
    endif
  endif
else (no)
  :Record unapplied outcome; grant no rights;
endif
stop
'''
ACTIVITIES[4,1] = '''
start
:Retain enterprise specifications and documents;
:Assigned Staff configures and tests exact revision;
:Explicitly apply assessed configuration;
if (Required setup and current assessment complete?) then (yes)
  :Staff explicitly confirms readiness;
  :Platform Admin reviews current handover;
  if (Handover approved?) then (yes)
    :SME Admin explicitly requests activation;
    :Recheck current readiness, approval and workspace authority;
    if (Already activated?) then (yes)
      :Return existing activation; do not extend term;
    else (no)
      :Commit activation, initial term and history once;
      if (Commit succeeded?) then (yes)
        :Enable permitted production operations;
      else (no)
        :Keep production unavailable;
      endif
    endif
  else (return)
    :Record return comments and history;
    :Require corrected work, renewed readiness and review;
  endif
else (no)
  :Show missing setup or changed configuration;
endif
stop
'''
ACTIVITIES[6, 1] = '''
start
:Trigger: edit / sample test / Apply;
:Recheck current Staff assignment and workspace;
switch (Action type?)
case (edit)
  :Validate fields, mappings and typed flat rules;
  if (Valid and revision current?) then (yes)
    :Save new draft revision and attribution;
    :Keep active version; require retest before Apply;
  else (no)
    :Reject invalid or stale edit;
  endif
case (sample test)
  :Pin exact revision; validate file structure;
  if (Usable input?) then (yes)
    :Map rows; evaluate valid samples; show temporary results;
  else (no)
    :Return safe structural error;
  endif
  :Retain safe run/revision counts; clean temporary samples including failures;
  :Do not apply or approve handover automatically;
case (Apply)
  :Require relevant exact-revision test and Staff assessment;
  if (Draft and expected active version current?) then (yes)
    :Atomically replace single active version and save history;
    if (Committed?) then (yes)
      :Use new version for new acceptance; preserve already accepted context;
    else (no)
      :Retain previous active version;
    endif
  else (no)
    :Require correction, review and retest;
  endif
endswitch
stop
'''
ACTIVITIES[7,1] = '''
start
:Trigger: issue, replace or disable API key;
:Check current role, workspace and Staff assignment;
if (Issuance or replacement requested?) then (yes)
  if (Platform Admin or assigned Staff?) then (yes)
    :Generate secret and protected verifier;
    :Save verifier and safe issuance history;
    if (Credential committed?) then (yes)
      :Disclose new full secret once for secure delivery;
      :Allow controlled old/new overlap until separate revocation;
    else (no)
      :Do not show unpersisted secret as usable;
    endif
  else (no)
    :Deny issuance;
  endif
else (disable)
  if (Authorized actor for this credential?) then (yes)
    :Commit disabled state and history idempotently;
    :Reject later authentication with disabled key;
    :Preserve accepted transactions;
  else (no)
    :Deny revocation;
  endif
endif
stop
'''
ACTIVITIES[7,2] = '''
start
:SME Admin or Operator submits production CSV/Excel;
:Check workspace activation, role and technical limits;
:Validate readability and required columns;
if (File structure valid?) then (yes)
  :Create import operation reference;
  repeat
    :Read and map next row using File mapping;
    if (Typed required values valid?) then (yes)
      :Resolve workspace business identity atomically;
      if (Identity already accepted?) then (yes)
        if (Normalized content equivalent?) then (yes)
          :Record Duplicate and existing reference;
        else (no)
          :Record Conflict; preserve original;
        endif
      else (no)
        :Commit new protected transaction and selected context;
        if (Durable acceptance committed?) then (yes)
          :Record New and request detection;
        else (no)
          :Expose completed versus pending work and safe retry;
          stop
        endif
      endif
    else (no)
      :Record Invalid with safe row/field error;
    endif
    :Update one exclusive row outcome and pending count;
  repeat while (More rows and processing available?) is (yes) not (no)
  if (Unfinished rows remain?) then (yes)
    :Expose partial progress and safe retry reference;
  else (no)
    :Reconcile totals and mark import completed;
  endif
else (no)
  :Reject file with zero production rows;
endif
stop
'''
ACTIVITIES[9,1] = '''
start
:Load durably accepted transaction and selected context;
if (Selected Subscription context?) then (yes)
  :Call AI with permitted normalized features;
  if (Valid Normal/Anomaly and model version?) then (yes)
    :Retain AI attempt and model version;
    if (Anomaly?) then (yes)
      :Create or reuse transaction's single AI Alert;
    else (Normal)
      :Create no new AI Alert;
    endif
    :Retain original attempt history;
    stop
  else (no)
    :Retain failed AI attempt and safe reason;
    :Select rule-fallback source;
  endif
else (Free)
  :Select primary-rule source;
endif
:Evaluate enabled rules in selected configuration;
if (Rule evaluation succeeded?) then (yes)
  :Retain attempt, source and all matched reasons;
  if (Any rule matched?) then (yes)
    :Create one aggregated Rule Alert for attempt;
  else (no)
    :Record successful no-match; create no Rule Alert;
  endif
else (no)
  :Record explicit detection failure; never Normal;
endif
:Retain acceptance and attempt history;
stop
'''
ACTIVITIES[9,2] = '''
start
:AI recovers; select stored fallback transaction;
:Check event time against historical Subscription periods;
if (Historically entitled?) then (yes)
  :Resolve idempotent recovery operation reference;
  if (Recovery already completed?) then (yes)
    :Reuse recorded recovery result;
  else (no)
    :Call AI on the same stored transaction;
    if (Usable classification and model version?) then (yes)
      :Append separate AI recovery attempt;
      if (Anomaly?) then (yes)
        :Create or reuse the transaction's single AI Alert;
      else (Normal)
        :Retain Normal history without deleting existing alerts;
      endif
    else (no)
      :Retain controlled recovery failure for eligible retry;
    endif
  endif
  :Preserve earlier Rule Alerts, AI Alerts and existing cases;
  :Recheck current Subscription on any later new-case request;
else (no)
  :Exclude from recovery AI processing;
endif
stop
'''
ACTIVITIES[11, 1] = '''
start
:Trigger: create / investigate / review case;
:Verify current identity, workspace and object scope;
switch (Action type?)
case (create)
  :Require Operator, current Subscription and same-workspace unlinked AI Alerts;
  if (All opening gates satisfied?) then (yes)
    :Commit Open case, unique AI links and history;
  else (no)
    :Reject without partial case or links;
  endif
case (investigate)
  :Load current case and version; reject Closed changes;
  :Operator assigns eligible user or self; first start changes Open to Investigating;
  :Reassignment preserves Investigating/Pending Review;
  :Operator/assigned Investigator saves protected findings in Investigating;
  if (Report submitted?) then (yes)
    :Recheck assignment, required content and version;
    :Commit report and Pending Review together;
  else (no)
    :Retain findings and current state;
  endif
case (review)
  :Require Operator, Pending Review and current report;
  if (Additional work needed?) then (yes)
    :Require comments; retain report; return to Investigating;
  else (confirm)
    :Validate supported conclusion and rationale;
    :Commit separate conclusion, history and Closed state;
    :No automatic training, enforcement or reopening;
  endif
endswitch
:Existing authorized case work continues after Subscription expiry;
stop
'''
ACTIVITIES[12,1] = '''
start
:SME Admin or Operator requests enterprise report;
:Validate criteria, workspace, role and field restrictions;
if (Authorized request?) then (yes)
  :Create generation operation;
  :Read authorized report data;
  if (Generation completed?) then (yes)
    :Retain complete or explicit empty report;
    if (Export requested?) then (yes)
      :Recheck report access and supported format;
      :Protect sensitive fields and neutralize formulas;
      :Generate complete export;
      if (Complete artifact available?) then (yes)
        :Recheck current permission at download;
        if (Download still authorized?) then (yes)
          :Serve complete scoped artifact;
        else (no)
          :Deny download;
        endif
      else (no)
        :Report export failure; do not serve partial output;
      endif
    endif
  else (no)
    :Mark failed generation; no successful partial report;
  endif
else (no)
  :Reject invalid criteria or forbidden scope;
endif
stop
'''

ROOT = Path(__file__).resolve().parent
QUERY_RETURNS = {
 'findByLoginAndScope':'Optional<Account>', 'findCurrentAccount':'Account',
 'findAuthorizedWorkspaces':'Page<Workspace>', 'findProvisioningConflicts':'List<ProvisioningConflict>',
 'findCurrentAssignments':'List<StaffAssignment>', 'findOffersAndUsage':'List<PlanOffer>',
 'findWorkspaceAndOffer':'InitialPlanContext', 'findEntitlementAndOffers':'SubscriptionOverview',
 'lockPurchaseAndEntitlement':'PurchaseEntitlementContext', 'findCommittedPeriods':'List<SubscriptionPeriod>',
 'findProgressAndSpecifications':'OnboardingDetail', 'findCurrentReadiness':'ReadinessRecord',
 'lockActivationState':'ActivationContext', 'findAuthorizedMembers':'Page<Account>',
 'findMemberAndFieldScope':'FieldGrantContext', 'findActiveAndCandidate':'ConfigurationDetail',
 'findExactRevision':'ConfigVersion', 'findAuthorizedTestHistory':'Page<TestRun>',
 'lockCandidateAndActive':'ConfigurationApplyContext', 'findCredentialMetadata':'List<CredentialMetadata>',
 'findDeliveryState':'IngestionReceipt', 'resolveBusinessIdentityAtomically':'IdentityResolution',
 'findRecoveryOperation':'RecoveryOperation', 'findProtectedTransactions':'Page<ProtectedTransaction>',
 'findImportResults':'SafeImportDetail', 'findProtectedAlertHistory':'ProtectedAlertHistory',
 'findProtectedValues':'ProtectedFieldValues', 'findAuthorizedCases':'Page<InvestigationCase>',
 'findCurrentSubmittedReport':'InvestigationReport', 'findRelevantNotifications':'Page<Notification>',
 'findScopedHistory':'Page<AuditEvent>', 'findEnabledRules':'List<DetectionRule>',
 'resolvePinnedMapping':'ChannelMapping', 'getAppliedConfigurationEvidence':'ConfigurationEvidence',
 'queryAuthorizedAggregates':'AuthorizedSummary', 'queryAuthorizedReportVersion':'ProtectedReportVersion',
 'queryAuthorizedReportData':'ProtectedReportData', 'resolveAuthorizedContact':'AuthorizedContact',
 'authorizeCurrentDisclosure':'DisclosureDecision', 'authorizeUnderlyingObjectHistory':'AccessDecision',
 'authenticateSubmission':'SubmissionIdentity', 'decryptPermittedFields':'PermittedFieldValues',
 'storeProtectedDocument':'ProtectedDocumentReference', 'prepareInitialTerm':'SubscriptionPeriod',
 'validateUnlinkedAiAlerts':'List<AIAlert>', 'createRuleAlertOnce':'RuleAlert',
 'createOrReuseAiAlert':'AIAlert', 'requireCurrentSubscription':'EntitlementDecision',
}
STYLE = '''@startuml
skinparam monochrome true
skinparam shadowing false
skinparam backgroundColor white
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam ArrowColor #444444
skinparam ArrowThickness 1
skinparam classAttributeIconSize 0
skinparam classBackgroundColor white
skinparam classBorderColor #777777
skinparam classBorderThickness 1
skinparam classFontSize 12
skinparam classAttributeFontSize 11
skinparam stereotypeFontSize 10
skinparam Padding 4
hide circle
'''
SEQUENCE_STYLE = '''
skinparam sequenceMessageAlign left
skinparam sequenceMessageFontSize 11
skinparam sequenceParticipantFontSize 11
skinparam sequenceParticipantBackgroundColor white
skinparam sequenceParticipantBorderColor #777777
skinparam sequenceLifeLineBorderColor #999999
skinparam sequenceLifeLineBackgroundColor white
skinparam sequenceActivationBorderColor #777777
skinparam sequenceActivationBackgroundColor white
skinparam sequenceActivationBorderThickness 0.5
skinparam sequenceGroupBorderThickness 0.6
skinparam sequenceGroupFontSize 10
skinparam maxMessageSize 290
autonumber
'''
ACTIVITY_STYLE = '''
skinparam linetype ortho
skinparam roundcorner 5
skinparam activityBackgroundColor white
skinparam activityBorderColor #222222
skinparam activityBorderThickness 1
skinparam activityDiamondBackgroundColor white
skinparam activityDiamondBorderColor #222222
skinparam activityFontSize 11
skinparam activityDiamondFontSize 11
skinparam conditionStyle InsideDiamond
skinparam wrapWidth 200
skinparam defaultTextAlignment center
'''
RESPONSE_FIELDS = {
    'LoginResponse':'sessionRef: UUID|destination: LoginDestination|setupOnly: boolean',
    'AccountResponse':'accountId: UUID|credentialChanged: boolean',
    'LogoutResponse':'terminationConfirmed: boolean',
    'WorkspaceResponse':'workspaceId: UUID|metadata: WorkspaceMetadata|version: long',
    'PlanOfferResponse':'offers: List<PlanOffer>|availability: OfferStatus',
    'SubscriptionResponse':'planType: PlanType|startsAt: Instant|expiresAt: Instant',
    'CheckoutResponse':'purchaseRef: UUID|checkoutDestination: URI|status: PurchaseStatus',
    'PaymentProcessingResult':'purchaseRef: UUID|effectApplied: boolean|outcome: PaymentOutcome',
    'EntitlementDecision':'subscriptionActive: boolean|detectionPath: DetectionSource|newCaseAllowed: boolean',
    'OnboardingResponse':'workspaceId: UUID|stage: OnboardingStage|configurationRef: UUID|version: long',
    'MemberResponse':'memberId: UUID|role: EnterpriseRole|fieldGrants: Set<UUID>|version: long',
    'ConfigurationResponse':'configurationRef: UUID|revision: long|activeVersionRef: UUID',
    'TestRunResponse':'runRef: UUID|testedRevision: long|counts: TestCounts|temporaryResultRef: UUID',
    'CredentialResponse':'keyPrefix: String|status: CredentialStatus|oneTimeSecret: String [issuance only]',
    'IngestionResult':'transactionRef: UUID|outcome: IngestionOutcome|safeErrors: List<FieldError>',
    'WebhookReceipt':'deliveryRef: String|guaranteedStage: ReceiptStage|outcome: IngestionOutcome',
    'ImportResponse':'batchRef: UUID|counts: ImportCounts|pendingRows: long|status: ImportStage',
    'ValidationResult':'normalizedValues: TypedValues|errors: List<FieldError>|valid: boolean',
    'RuleEvaluationResult':'attemptRef: UUID|matchedRules: List<RuleMatch>|status: AttemptStatus',
    'DetectionResult':'attemptRef: UUID|source: DetectionSource|classification: AIClassification [0..1]|status: AttemptStatus',
    'TransactionReviewResponse':'transactions: ProtectedTransactionPage|importDetail: SafeImportDetail',
    'AlertReviewResponse':'alert: ProtectedAlertDetail|attempts: List<DetectionAttempt>',
    'DisclosureResponse':'authorizedValues: Map<UUID, String>|accessAuditRef: UUID',
    'CaseResponse':'caseRef: UUID|status: CaseStatus|assigneeRef: UUID|version: long',
    'InvestigationResponse':'caseRef: UUID|reportRef: UUID|status: CaseStatus|version: long',
    'ReportingResponse':'aggregates: AuthorizedSummary|report: ProtectedReportVersion',
    'ReportExportResponse':'operationRef: UUID|status: ReportStage|artifactRef: UUID',
    'NotificationResponse':'notifications: List<NotificationSummary>|nextPage: String',
    'EmailDeliveryResult':'deliveryRef: UUID|status: DeliveryStatus|retryReference: UUID',
    'MonitoringResponse':'snapshots: List<HealthSnapshot>|observedAt: Instant',
    'AuditResponse':'events: List<AuditEvent>|mutationStatus: MutationStatus',
}


def participant_map(group, spec):
    names={'C':spec['controller'],'S':spec['service'] or group['classes'][0][0]}
    if re.search(r'\bR\b',spec['body']):
        names.update(R=spec.get('repository',REPOSITORIES[group['number']]),DB='Database')
    names.update({alias:item[0] for alias,item in spec['ports'].items()})
    return names


def sequence_source(group,spec):
    names=participant_map(group,spec)
    lines=[SEQUENCE_STYLE,f'actor "{spec["actor"]}" as User']
    if not spec['worker']:
        lines.append(f'participant "{spec["view"]}" as UI')
    for alias in ['C','S']+list(spec['ports'])+[k for k in ('R','DB') if k in names]:
        lines.append(f'participant "{names[alias]}" as {alias}')
    if spec['worker']:
        lines.append(f'User -> C ++: {spec["method"]}(request)')
    else:
        lines += ['User -> UI ++: submit(request)',f'UI -> C ++: {spec["method"]}(request)']
    lines += ['C -> C: resolveExecutionContext()',
              f'C -> S ++: {spec["method"]}(request, context)',spec['body'].strip(),
              f'S --> C --: {spec["response"]} / controlled error']
    if spec['worker']:
        lines.append('C --> User --: processing result / acknowledgment')
    else:
        lines += [f'C --> UI --: {spec["response"]} / safe error','UI --> User --: render permitted result']
    return '\n'.join(lines)


def signature(expression,request,result='void',visibility='+'):
    m=re.fullmatch(r'(\w+)\((.*)\)',expression)
    assert m,expression
    def typed(value):
        t={'req':request,'request':request,'ctx':'AccessContext','context':'AccessContext',
           'account':'Account','periods':'List<SubscriptionPeriod>','purchase':'PurchaseOrder'}.get(value,'String')
        return value+': '+t
    args=[a.strip() for a in m[2].split(',') if a.strip()]
    return f'{visibility} {m[1]}('+', '.join(typed(a) for a in args)+f'): {result}'


def class_source(group):
    n=group['number'];classes={};links=set()
    def add(name,kind='class',stereotype='entity',attrs=''):
        if name not in classes:
            classes[name]=dict(kind=kind,stereotype=stereotype,attrs=attrs,methods=set())
        elif stereotype=='DTO' and attrs:
            classes[name]['attrs']='\n'.join(dict.fromkeys((classes[name]['attrs']+'\n'+attrs).splitlines()))
        return classes[name]
    base_service=group['classes'][0][0]
    for name,attrs,methods in group['classes'][1:]:
        kind='interface' if name.endswith(('Repository','Port')) else 'class'
        tag='repository' if name.endswith('Repository') else 'port' if name.endswith('Port') else 'security' if name.endswith('Policy') else 'service' if name.endswith('Service') else 'entity'
        item=add(name,kind,tag,attrs)
        if tag=='entity':
            for line in methods.splitlines():
                match=re.match(r'[+]\s*(\w+\([^)]*\))(?::\s*(.+))?',line)
                if match:item['methods'].add(signature(match[1],'String',match[2] or 'boolean'))
    add('AccessContext',stereotype='security',attrs='- principalId: UUID [0..1]\n- workspaceId: UUID [0..1]\n- role: Role [0..1]\n- verifiedScope: AccessScope')
    for i in range(1,len(group['sequences'])+1):
        spec=FLOWS[n,i];names=participant_map(group,spec);service=names['S']
        entry_kind='controller' if names['C'].endswith('Controller') else 'listener' if names['C'].endswith('Listener') else 'security' if names['C'].endswith('Policy') else 'application'
        controller=add(names['C'],stereotype=entry_kind,attrs=f'- service: I{service}')
        controller['methods'].update([signature(f'{spec["method"]}(request)',spec['request'],spec['response']),'- resolveExecutionContext(): AccessContext'])
        svc=add(service,stereotype='service');interface=add('I'+service,'interface','service')
        operation=signature(f'{spec["method"]}(request, context)',spec['request'],spec['response'])
        svc['methods'].add(operation);interface['methods'].add(operation)
        add(spec['request'],stereotype='DTO',attrs=spec['fields'])
        response='\n'.join('- '+f for f in RESPONSE_FIELDS[spec['response']].split('|'))
        add(spec['response'],stereotype='DTO',attrs=response)
        links.update([f'{names["C"]} --> I{service}',f'{service} .up.|> I{service}',
                      f'{names["C"]} ..> {spec["request"]}',f'{names["C"]} ..> {spec["response"]}'])
        if 'R' in names:
            add(names['R'],'interface','repository');links.add(f'{service} --> {names["R"]}')
            entity={'AccountRepository':'Account','WorkspaceRepository':'Workspace',
                    'PlanRepository':'PlanOffer','PurchaseOrderRepository':'PurchaseOrder',
                    'SubscriptionPeriodRepository':'SubscriptionPeriod','SubscriptionRepository':'SubscriptionPeriod',
                    'OnboardingRepository':'OnboardingEvent',
                    'MemberRepository':'Account','ConfigurationRepository':'ConfigVersion',
                    'ApiCredentialRepository':'IntegrationCredential','IngestionReceiptRepository':'IngestionReceipt',
                    'ImportBatchRepository':'ImportBatch','TransactionRepository':'Transaction',
                    'DetectionAttemptRepository':'DetectionAttempt','TransactionQueryRepository':'Transaction',
                    'CaseRepository':'InvestigationCase','ReportRepository':'ReportOperation',
                    'NotificationRepository':'Notification','AuditRepository':'AuditEvent'}[names['R']]
            if entity in classes:links.add(f'{names["R"]} --> {entity}')
        for alias,(name,kind) in spec['ports'].items():
            add(name,'class' if kind=='policy' else 'interface','security' if kind=='policy' else 'port')
            links.add(f'{service} --> {name}')
        for line in spec['body'].splitlines():
            m=re.match(r'\s*(\w+)\s*->\s*(\w+)(?:\s+[+]{2})?:\s*(\w+\([^)]*\))\s*$',line)
            if not m or m[2] not in names or m[2]=='DB':continue
            dest=names[m[2]];method=m[3].split('(')[0]
            if m[2]=='S':
                result='boolean' if method.startswith(('verify','check','is')) else 'void'
                if method.startswith(('verify','check','validate','require','authorize')):
                    svc['methods'].add(signature(m[3],spec['request'],result,'-'))
            else:
                result='QueryResult' if method.startswith(('find','get','read','query','resolve')) else 'MutationResult'
                result={'AIServicePort':'AIResult','TransactionAcceptancePort':'IngestionResult',
                        'SampleValidationPort':'ValidationResult','SampleRuleEvaluationPort':'RuleEvaluationResult',
                        'RuleEnginePort':'RuleEvaluationResult','EmailPort':'EmailDeliveryResult',
                        'OperationalTelemetryPort':'List<HealthSnapshot>','TransactionEventPublisher':'void'}.get(dest,result)
                if 'Entitlement' in dest:result='EntitlementDecision'
                if dest=='PaymentGatewayPort':result='CheckoutResponse' if method=='initiateCheckout' else 'VerifiedPayment'
                result=QUERY_RETURNS.get(method,result)
                classes[dest]['methods'].add(signature(m[3],spec['request'],result))
    primary=FLOWS[n,1]['service'] or base_service
    links.add(f'{primary} ..> AccessContext')
    for relation in group['relations']:
        relation=re.sub(r'\b'+re.escape(base_service)+r'\b',primary,relation)
        left=relation.split()[0];right=relation.split(':')[0].strip().split()[-1]
        if left in classes and right in classes:links.add(relation)
    for name,values,owner in ([('Role',['PLATFORM_ADMIN','IMPLEMENTATION_STAFF','SME_ADMIN','OPERATOR','INVESTIGATOR'],'Account')] if n==1 else [('CaseStatus',['OPEN','INVESTIGATING','PENDING_REVIEW','CLOSED'],'InvestigationCase')] if n==11 else [('AIClassification',['NORMAL','ANOMALY'],'AIResult')] if n==9 else []):
        add(name,'enum','')['methods'].update(values);links.add(f'{owner} --> {name}')
    declarations=[]
    # Omit unused empty overview helpers; keep only declared domain/data types and actual dependencies.
    classes={name:item for name,item in classes.items() if item['attrs'] or item['methods']}
    links={line for line in links if line.split()[0] in classes and line.split(':')[0].strip().split()[-1] in classes}
    for name,item in classes.items():
        tag=f' <<{item["stereotype"]}>>' if item['stereotype'] else ''
        body=item['attrs']
        if item['methods']:body+= ('\n--\n' if body else '\n')+'\n'.join(sorted(item['methods']))
        declarations.append(f'{item["kind"]} {name}{tag} {{\n{body}\n}}')
    # Place layers and DTOs deliberately, like the reference's technical class layout.
    controllers=list(dict.fromkeys(FLOWS[n,i]['controller'] for i in range(1,len(group['sequences'])+1)))
    services=[name for name,item in classes.items() if item['stereotype']=='service' and item['kind']=='class']
    interfaces=[name for name,item in classes.items() if item['stereotype']=='service' and item['kind']=='interface']
    repos=[name for name,item in classes.items() if item['stereotype'] in ('repository','port')]
    domains=[name for name,item in classes.items() if item['stereotype']=='entity' or item['kind']=='enum']
    dtos=[name for name,item in classes.items() if item['stereotype']=='DTO']
    security=[name for name,item in classes.items() if item['stereotype']=='security' and name not in controllers]
    columns=[controllers,interfaces+services,repos,domains]
    layout=[]
    for column in columns:
        for a,b in zip(column,column[1:]):layout.append(f'{a} -[hidden]down-> {b}')
    roots=[col[0] for col in columns if col]
    for a,b in zip(roots,roots[1:]):layout.append(f'{a} -[hidden]right-> {b}')
    previous=controllers[-1]
    for start in range(0,len(dtos+security),3):
        row=(dtos+security)[start:start+3]
        layout.append(f'{previous} -[hidden]down-> {row[0]}')
        for a,b in zip(row,row[1:]):layout.append(f'{a} -[hidden]right-> {b}')
        previous=row[0]
    formatted=[]
    for link in sorted(links):
        link=link.replace('.up.|>','-[dashed,norank]-|>')
        link=link.replace('..>','-[dashed,norank]->')
        link=re.sub(r'([*]?)--(>?)',r'\1-[norank]-\2',link)
        formatted.append(link)
    source='top to bottom direction\nskinparam linetype ortho\nskinparam wrapWidth 320\nskinparam nodesep 28\nskinparam ranksep 40\n'
    return source+'\n'.join(declarations+layout+formatted),set(classes)


def build():
    groups=json.loads((ROOT/'design_model.json').read_text(encoding='utf-8'));figures=[];paragraphs=[]
    def paragraph(kind,text,**kwargs):paragraphs.append(dict(kind=kind,text=text,**kwargs))
    paragraph('body','This section presents the target detailed design derived from Report 3 functional requirements, Sections 3.2-3.15. Class diagrams identify controllers/listeners, service interfaces and implementations, repositories, DTOs and domain types. Sequence diagrams use the same class names and operations, with explicit calls, returns, activation bars and repository/database interactions. These proposed design signatures are not claims of implemented Java classes or approved HTTP routes; cross-module calls use public APIs/ports within the modular monolith.')
    paragraph('body','All operations enforce current identity, role, workspace and object/assignment scope on the backend. Integration authentication establishes workspace scope before mapping or acceptance. Sensitive values remain protected in ordinary results and diagnostics; required writes retain history atomically. The headings named State Diagram follow the supplied reference: their figures use processing activities, decision diamonds, guarded branches and start/end nodes. Exact external wire formats, upload limits, timeout values and retry schedules remain subject to their confirmed interface specifications.')
    for group in groups:
        n=group['number'];paragraph('group',f"3.{n} {group['title']}")
        paragraph('body',f"SRS reference: 3.{n+1}.1-3.{n+1}.{group['count']}. {group['purpose']}")
        class_body,class_names=class_source(group)
        def figure(kind,sub,index,title,source,functions=None):
            name=f'{n:02d}-{kind}-{index:02d}'
            (ROOT/(name+'.puml')).write_text(STYLE+source.strip()+'\n@enduml\n',encoding='utf-8')
            item=dict(id=name,file=name+'.puml',group=n,type=kind,title=title,caption=f'Figure 4.3.{n}.{sub}.{index}. {title}.',srs=[f'3.{n+1}.{f}' for f in functions or range(1,group['count']+1)])
            figures.append(item);paragraph('image','',figure=name);paragraph('caption',item['caption'],figure=name)
        paragraph('type',f'3.{n}.1 Class Diagram');figure('class',1,1,group['title']+' Class Diagram',class_body)
        paragraph('type',f'3.{n}.2 Sequence Diagrams');covered=set()
        for i,s in enumerate(group['sequences'],1):
            spec=FLOWS[n,i]
            assert all(name in class_names for alias,name in participant_map(group,spec).items() if alias!='DB')
            figure('sequence',2,i,s['title']+' Sequence Diagram',sequence_source(group,spec),s['functions']);covered.update(s['functions'])
        assert covered==set(range(1,group['count']+1)),group['title']
        if group['states']:
            paragraph('type',f'3.{n}.3 State Diagrams')
            for i,s in enumerate(group['states'],1):
                body=re.sub(r'(?m)^(\s*(?:if|repeat while)) \((.+?)\)(?=\s+(?:then|is)\s+\()',lambda m:m[1]+' ('+r'\n'.join(textwrap.wrap(m[2],28))+')',ACTIVITIES[n,i])
                figure('state',3,i,s['title']+' State Diagram',ACTIVITY_STYLE+body)
    assert len(figures)==68 and len(FLOWS)==43 and len(ACTIVITIES)==11
    assert sum(g['count'] for g in groups)==65 and len({f['id'] for f in figures})==68
    result=dict(groups=[{k:v for k,v in g.items() if k not in ('classes','relations','sequences','states')} for g in groups],figures=figures,paragraphs=paragraphs)
    (ROOT/'catalogue.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    md=['# 3. Detailed Design','']
    for p in paragraphs:
        if p['kind']=='image':md += [f"![{p['figure']}](../../../diagrams/report-4-sdd/detailed-design/exports/{p['figure']}.png)",'']
        else:md += [('## ' if p['kind']=='group' else '### ' if p['kind']=='type' else '')+p['text'],'']
    (ROOT.parents[2]/'02_Reports/Report4_SDD/sections/detailed-design.md').write_text('\n'.join(md),encoding='utf-8')
    print('Built 68 detailed UML sources; 65 SRS functions covered; every sequence participant appears in its class diagram.')
