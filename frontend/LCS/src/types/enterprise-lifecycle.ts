import type { ClarifiedFieldItem, Enterprise, ServicePlan } from "./enterprise";
import type { RuleTemplate, UserProfile } from "./fraudguard";
import type { ManagedRuleSet, SetTest, SetVersion } from "@/utils/rule-set-lifecycle";

export type EnterpriseLifecycleStatus =
  | "SettingUp"
  | "PendingPlatformApproval"
  | "PendingSMEActivation"
  | "Operating";

export type EnterpriseLifecycleErrorCode =
  | "ENTERPRISE_NOT_FOUND"
  | "UNINITIALIZED_LIFECYCLE"
  | "ALREADY_INITIALIZED"
  | "ALREADY_OPERATING"
  | "INVALID_STATE"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_TENANT"
  | "FORBIDDEN_STAFF"
  | "INVALID_ACTOR"
  | "INVALID_TIMESTAMP"
  | "MISSING_PROJECT_SCOPE"
  | "MISSING_DEPLOYMENT_STAFF"
  | "MISSING_CONFIG_VERSION"
  | "DUPLICATE_CONFIG_VERSION"
  | "RELEASE_NOT_FOUND"
  | "INVALID_RULESET_SCOPE"
  | "MISSING_SCHEMA"
  | "INVALID_SCHEMA"
  | "MISSING_TEST_EVIDENCE"
  | "STALE_TEST_EVIDENCE"
  | "FAILED_TEST_EVIDENCE"
  | "CONFIG_CONTENT_MISMATCH"
  | "VERSION_MISMATCH"
  | "SNAPSHOT_TAMPERED"
  | "MISSING_REASON"
  | "MISSING_SERVICE_PLAN"
  | "PLAN_NOT_SUBSCRIPTION"
  | "MISSING_SUBSCRIPTION_DURATION"
  | "INVALID_SUBSCRIPTION_DURATION"
  | "SUBSCRIPTION_CONFIG_MISMATCH"
  | "RULESET_NOT_FOUND";

export interface LifecycleActorRef {
  id: string;
  name?: string;
}

export type LifecycleActorInput = Pick<UserProfile, "id" | "role" | "enterpriseId"> & {
  name?: string;
};

export type SubscriptionDurationUnit = "days" | "months";

export interface SubscriptionDuration {
  value: number;
  unit: SubscriptionDurationUnit;
}

export interface EnterpriseSubscriptionRecord {
  duration: SubscriptionDuration;
  startedAt: string;
  expiresAt: string;
}

export interface EnterpriseInternalReviewMetadata {
  reviewer: string;
  reviewNote: string;
  publishedAt: string;
}

export interface EnterpriseConfigTestEvidence {
  signature: string;
  testedAt: string;
  sampleCount: number;
  labeled: number;
  mismatched: number;
  complete: boolean;
  testDigest: string;
  test: SetTest;
}

/**
 * Immutable submission snapshot for WF-01 approval and activation.
 * Currently covers the enterprise scope, rule set release, rule definitions,
 * ClarifiedFieldItem[] schema catalog, and verified SetTest evidence; source-to-schema
 * field mapping rules can be appended when ingestion mapping expands.
 */
export interface EnterpriseConfigSnapshot {
  submissionId: string;
  enterpriseId: string;
  configVersion: string;
  ruleSetId: string;
  ruleSetName: string;
  ruleSetVersion: number;
  projectIds: string[];
  rules: RuleTemplate[];
  schema: ClarifiedFieldItem[];
  testEvidence: EnterpriseConfigTestEvidence;
  internalReview: EnterpriseInternalReviewMetadata;
  submittedAt: string;
  submittedBy: LifecycleActorRef;
  specificationVersion?: string;
  note?: string;
  contentHash: string;
}

export interface PlatformApprovalRecord {
  approvalId: string;
  approvedAt: string;
  approvedBy: LifecycleActorRef;
  submissionId: string;
  configVersion: string;
  ruleSetId?: string;
  ruleSetVersion?: number;
  contentHash: string;
  note?: string;
}

export interface SMERevisionRequestRecord {
  requestId: string;
  requestedAt: string;
  requestedBy: LifecycleActorRef;
  reason: string;
  targetSubmissionId: string;
  targetConfigVersion: string;
  targetRuleSetId: string;
  targetRuleSetVersion: number;
  targetContentHash: string;
  targetTestedAt: string;
  targetTestDigest: string;
}

export interface EnterpriseActivationRecord {
  activatedAt: string;
  activatedBy: LifecycleActorRef;
  submissionId: string;
  configVersion: string;
  contentHash: string;
  note?: string;
}

export type EnterpriseLifecycleEventType =
  | "INITIALIZED"
  | "SUBSCRIPTION_CONFIGURED"
  | "SUBMITTED_FOR_APPROVAL"
  | "PLATFORM_APPROVED"
  | "REVISION_REQUESTED"
  | "SME_ACTIVATED";

export interface EnterpriseLifecycleEvent {
  id: string;
  type: EnterpriseLifecycleEventType;
  at: string;
  actor: LifecycleActorRef;
  fromStatus: EnterpriseLifecycleStatus | null;
  toStatus: EnterpriseLifecycleStatus;
  submissionId?: string;
  configVersion?: string;
  contentHash?: string;
  note?: string;
  reason?: string;
  duration?: SubscriptionDuration;
}

export interface EnterpriseRuleSetActivationCommand {
  enterpriseId: string;
  submissionId: string;
  ruleSetId: string;
  ruleSetName: string;
  activeVersion: number;
  configVersion: string;
  projectIds: string[];
  rules: RuleTemplate[];
  schema: ClarifiedFieldItem[];
  testEvidence: EnterpriseConfigTestEvidence;
  contentHash: string;
  activatedAt: string;
  activatedBy: LifecycleActorRef;
}

export interface ApplyEnterpriseActivationCommandSuccess {
  ok: true;
  ruleSets: ManagedRuleSet[];
  activeRelease: SetVersion;
}

export type ApplyEnterpriseActivationCommandResult =
  | ApplyEnterpriseActivationCommandSuccess
  | EnterpriseLifecycleError;

export interface EnterpriseLifecycle {
  enterpriseId: string;
  status: EnterpriseLifecycleStatus;
  initializedAt: string;
  initializedBy: LifecycleActorRef;
  usedConfigVersions: string[];
  pendingSubmission?: EnterpriseConfigSnapshot;
  approvedConfig?: EnterpriseConfigSnapshot;
  activatedConfig?: EnterpriseConfigSnapshot;
  activation?: EnterpriseActivationRecord;
  subscriptionConfig?: SubscriptionDuration;
  subscription?: EnterpriseSubscriptionRecord;
  approvalHistory: PlatformApprovalRecord[];
  revisionHistory: SMERevisionRequestRecord[];
  latestRevisionRequest?: SMERevisionRequestRecord;
  history: EnterpriseLifecycleEvent[];
}

export type ResolvedEnterpriseLifecycle =
  | {
      initialized: false;
      isLegacy: true;
      status: null;
      isOperating: false;
    }
  | {
      initialized: true;
      isLegacy: false;
      status: EnterpriseLifecycleStatus;
      isOperating: boolean;
      lifecycle: EnterpriseLifecycle;
    };

export interface EnterpriseOperationalEligibility {
  eligible: boolean;
  initialized: boolean;
  isLegacy: boolean;
  status: EnterpriseLifecycleStatus | null;
  plan?: ServicePlan;
  isOperating: boolean;
  subscriptionActive: boolean;
  reasonCode?:
    | "ENTERPRISE_NOT_FOUND"
    | "UNINITIALIZED_LEGACY"
    | "NOT_OPERATING"
    | "MISSING_SERVICE_PLAN"
    | "PLAN_NOT_SUBSCRIPTION"
    | "SUBSCRIPTION_NOT_STARTED"
    | "SUBSCRIPTION_EXPIRED"
    | "INVALID_TIMESTAMP";
  reason?: string;
}

export interface InitializeEnterpriseLifecycleInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  subscriptionDuration?: SubscriptionDuration;
  at?: string;
  eventId?: string;
  note?: string;
}

export interface ConfigureSubscriptionDurationInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  duration: SubscriptionDuration;
  at?: string;
  eventId?: string;
  note?: string;
}

export interface SubmitEnterpriseConfigInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  configVersion: string;
  ruleSet: ManagedRuleSet;
  ruleSetVersion: number;
  schema?: ClarifiedFieldItem[];
  test?: SetTest;
  note?: string;
  at?: string;
  eventId?: string;
  submissionId?: string;
}

export interface ApproveEnterpriseConfigInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  configVersion: string;
  submissionId?: string;
  contentHash?: string;
  ruleSet?: ManagedRuleSet;
  ruleSets?: ManagedRuleSet[];
  schema?: ClarifiedFieldItem[];
  note?: string;
  at?: string;
  eventId?: string;
  approvalId?: string;
}

export interface RequestEnterpriseRevisionInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  reason: string;
  at?: string;
  eventId?: string;
  requestId?: string;
}

export interface ActivateEnterpriseInput {
  enterprise: Enterprise;
  actor: LifecycleActorInput;
  configVersion: string;
  submissionId?: string;
  contentHash?: string;
  ruleSet?: ManagedRuleSet;
  schema?: ClarifiedFieldItem[];
  ruleSets?: ManagedRuleSet[];
  subscriptionDuration?: SubscriptionDuration;
  note?: string;
  at?: string;
  eventId?: string;
}

export type EnterpriseLifecycleCommand =
  | ({ type: "INITIALIZE" } & Omit<InitializeEnterpriseLifecycleInput, "enterprise">)
  | ({ type: "CONFIGURE_SUBSCRIPTION" } & Omit<ConfigureSubscriptionDurationInput, "enterprise">)
  | ({ type: "SUBMIT_CONFIG" } & Omit<SubmitEnterpriseConfigInput, "enterprise">)
  | ({ type: "APPROVE_CONFIG" } & Omit<ApproveEnterpriseConfigInput, "enterprise">)
  | ({ type: "REQUEST_REVISION" } & Omit<RequestEnterpriseRevisionInput, "enterprise">)
  | ({ type: "ACTIVATE" } & Omit<ActivateEnterpriseInput, "enterprise">);

export interface EnterpriseLifecycleError {
  ok: false;
  code: EnterpriseLifecycleErrorCode;
  error: string;
}

export interface EnterpriseLifecycleSuccess {
  ok: true;
  enterprise: Enterprise;
  event: EnterpriseLifecycleEvent;
}

export type EnterpriseLifecycleResult<Extra extends object = Record<never, never>> =
  | (EnterpriseLifecycleSuccess & Extra)
  | EnterpriseLifecycleError;

export type ActivateEnterpriseResult = EnterpriseLifecycleResult<{
  activationCommand: EnterpriseRuleSetActivationCommand;
  ruleSets?: ManagedRuleSet[];
}>;
