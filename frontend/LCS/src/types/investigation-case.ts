import type { Enterprise, ServicePlan } from "./enterprise";
import type { EnterpriseLifecycleStatus, SubscriptionDuration } from "./enterprise-lifecycle";
import type { ProjectItem, TransactionRisk, UserProfile, UserRole } from "./fraudguard";

export type InvestigationCaseStatus =
  | "Open"
  | "Investigating"
  | "Pending Review"
  | "Closed";

export type InvestigationCaseAssignmentMode = "assigned" | "self_investigated";

export type InvestigationCaseEventType =
  | "CASE_CREATED"
  | "INVESTIGATOR_ASSIGNED"
  | "OPERATOR_SELF_ASSIGNED"
  | "REPORT_SUBMITTED"
  | "REVISION_REQUESTED"
  | "REPORT_CONFIRMED_AND_CLOSED";

export type InvestigationCaseErrorCode =
  | "INVALID_CASE"
  | "MISSING_CASE_ID"
  | "DUPLICATE_CASE_ID"
  | "MISSING_EXISTING_CASES"
  | "CASE_ALREADY_CLOSED"
  | "INVALID_STATE"
  | "INVALID_ACTOR"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_TENANT"
  | "FORBIDDEN_ASSIGNEE"
  | "INVALID_TIMESTAMP"
  | "TIMESTAMP_OUT_OF_ORDER"
  | "INVALID_ID"
  | "DUPLICATE_EVENT_ID"
  | "ENTERPRISE_NOT_FOUND"
  | "ENTERPRISE_LIFECYCLE_UNINITIALIZED"
  | "ENTERPRISE_NOT_OPERATING"
  | "MISSING_SERVICE_PLAN"
  | "PLAN_NOT_SUBSCRIPTION"
  | "SUBSCRIPTION_NOT_STARTED"
  | "SUBSCRIPTION_EXPIRED"
  | "EMPTY_ALERT_LIST"
  | "INVALID_ALERT_ID"
  | "DUPLICATE_ALERT_ID"
  | "ALERT_NOT_FOUND"
  | "AMBIGUOUS_ALERT_MAPPING"
  | "INELIGIBLE_ALERT_SOURCE"
  | "INELIGIBLE_ALERT_RISK_LEVEL"
  | "INVALID_PROJECT_MAPPING"
  | "CROSS_TENANT_ALERT"
  | "ALERT_ALREADY_LINKED"
  | "ALERT_LEGACY_LINKED"
  | "INVALID_USER_DIRECTORY"
  | "AMBIGUOUS_USER"
  | "MISSING_ASSIGNEE_ID"
  | "ASSIGNEE_NOT_FOUND"
  | "INVALID_ASSIGNEE_ROLE"
  | "ASSIGNEE_TENANT_MISMATCH"
  | "MISSING_REPORT_SUMMARY"
  | "MISSING_REPORT_ID"
  | "INVALID_REPORT_ID"
  | "DUPLICATE_REPORT_ID"
  | "INVALID_REPORT_ALERT_RESULTS"
  | "DUPLICATE_REPORT_ALERT"
  | "EXTRA_REPORT_ALERT"
  | "MISSING_REPORT_ALERT"
  | "MISSING_ALERT_RESULT"
  | "MISSING_ALERT_EVIDENCE"
  | "MISSING_REVISION_REASON"
  | "NO_PENDING_REPORT"
  | "MISSING_REPORT_VERSION"
  | "INVALID_REPORT_VERSION"
  | "REPORT_NOT_FOUND"
  | "REPORT_VERSION_MISMATCH"
  | "STALE_REPORT_VERSION"
  | "MISSING_CONCLUSION_SUMMARY"
  | "REPORT_NOT_CONFIRMED";

export type InvestigationCaseActorInput = Pick<
  UserProfile,
  "id" | "role" | "enterpriseId"
> & {
  name?: string;
};

export interface InvestigationCaseActorRef {
  readonly actorId: string;
  readonly role: UserRole;
  readonly enterpriseId?: string;
  readonly name?: string;
}

export interface InvestigationCaseAlertLink {
  readonly alertId: string;
  readonly transactionId: string;
  readonly transactionReference: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly transactionType: string;
  readonly entityReference: string;
  readonly scoringSource: "AI";
  readonly riskLevel: "Abnormal";
  readonly processedAt: string;
  readonly alertName?: string;
  readonly confidence?: number;
  readonly modelVersion?: string;
  readonly explanation?: string;
}

export interface InvestigationCaseCreationEligibility {
  readonly verifiedAt: string;
  readonly operatingStatus: EnterpriseLifecycleStatus;
  readonly servicePlan: ServicePlan;
  readonly activatedAt: string;
  readonly configVersion: string;
  readonly subscriptionStartedAt: string;
  readonly subscriptionExpiresAt: string;
  readonly subscriptionDuration: SubscriptionDuration;
}

export interface InvestigationCaseAlertReportItemInput {
  alertId: string;
  /**
   * Temporary free-text per-alert conclusion for Phase 1; business conclusion
   * enums and AI evaluation label mappings are deferred to backend/AI integration.
   */
  resultText: string;
  evidence: string;
}

export interface InvestigationCaseAlertReportItem {
  readonly alertId: string;
  readonly transactionId: string;
  readonly transactionReference: string;
  readonly resultText: string;
  readonly evidence: string;
}

export interface InvestigationCaseReportVersion {
  readonly reportId: string;
  readonly version: number;
  readonly submittedBy: InvestigationCaseActorRef;
  readonly submittedAt: string;
  readonly summary: string;
  readonly alertResults: readonly InvestigationCaseAlertReportItem[];
}

export interface InvestigationCaseConclusionAlertResult {
  readonly alertId: string;
  readonly transactionId: string;
  readonly transactionReference: string;
  readonly resultText: string;
  readonly evidence: string;
}

export interface InvestigationCaseConclusion {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly confirmedBy: InvestigationCaseActorRef;
  readonly confirmedAt: string;
  readonly summary: string;
  readonly alertResults: readonly InvestigationCaseConclusionAlertResult[];
}

export interface InvestigationCaseEvent {
  readonly eventId: string;
  readonly type: InvestigationCaseEventType;
  readonly at: string;
  readonly actor: InvestigationCaseActorRef;
  readonly fromStatus: InvestigationCaseStatus | null;
  readonly toStatus: InvestigationCaseStatus;
  readonly assignee?: InvestigationCaseActorRef;
  readonly reportId?: string;
  readonly reportVersion?: number;
  readonly reason?: string;
  readonly note?: string;
}

export interface InvestigationCase {
  readonly caseId: string;
  readonly enterpriseId: string;
  readonly status: InvestigationCaseStatus;
  readonly alertIds: readonly string[];
  readonly alerts: readonly InvestigationCaseAlertLink[];
  readonly createdBy: InvestigationCaseActorRef;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly creationEligibility: InvestigationCaseCreationEligibility;
  readonly assignmentMode?: InvestigationCaseAssignmentMode;
  readonly assignee?: InvestigationCaseActorRef;
  readonly assignedBy?: InvestigationCaseActorRef;
  readonly assignedAt?: string;
  readonly pendingReviewReportId?: string;
  readonly pendingReviewReportVersion?: number;
  readonly reports: readonly InvestigationCaseReportVersion[];
  readonly conclusion?: InvestigationCaseConclusion;
  readonly closedAt?: string;
  readonly history: readonly InvestigationCaseEvent[];
}

/** Input for creating a new `Open` investigation case; `existingCases` is mandatory (`[]` if none). */
export interface CreateInvestigationCaseInput {
  caseId: string;
  enterprise: Enterprise;
  actor: InvestigationCaseActorInput;
  alertIds: readonly string[];
  alerts: readonly TransactionRisk[];
  at: string;
  existingCases: readonly InvestigationCase[];
  enterprises?: readonly Enterprise[];
  projects?: readonly Pick<ProjectItem, "id">[];
  eventId?: string;
  note?: string;
}

export interface AssignInvestigatorInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
  assigneeId: string;
  users: readonly InvestigationCaseActorInput[];
  at: string;
  eventId?: string;
  note?: string;
}

export interface SelfAssignInvestigationCaseInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
  at: string;
  eventId?: string;
  note?: string;
}

export interface SubmitInvestigationReportInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
  summary: string;
  alertResults: readonly InvestigationCaseAlertReportItemInput[];
  at: string;
  reportId?: string;
  eventId?: string;
  note?: string;
}

export interface RequestInvestigationCaseRevisionInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
  reason: string;
  at: string;
  eventId?: string;
}

/** Input for confirming and closing a case; both `reportId` and `reportVersion` must match the pending latest report. */
export interface ConfirmInvestigationCaseReportInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
  at: string;
  reportId: string;
  reportVersion: number;
  finalSummary?: string;
  eventId?: string;
  note?: string;
}

export interface ReadInvestigationCaseInput {
  investigationCase: InvestigationCase;
  actor: InvestigationCaseActorInput;
}

export interface InvestigationCaseReadAccess {
  readonly canViewInternalCase: boolean;
  readonly canViewConfirmedReport: boolean;
  readonly reasonCode?: InvestigationCaseErrorCode;
  readonly reason?: string;
}

export interface ConfirmedInvestigationReportView {
  readonly caseId: string;
  readonly enterpriseId: string;
  readonly status: "Closed";
  readonly alertIds: readonly string[];
  readonly alerts: readonly InvestigationCaseAlertLink[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string;
  readonly confirmedReport: InvestigationCaseReportVersion;
  readonly conclusion: InvestigationCaseConclusion;
}

export interface InvestigationCaseError {
  readonly ok: false;
  readonly code: InvestigationCaseErrorCode;
  readonly error: string;
}

export type InvestigationCaseResult<
  Extra extends object = Record<never, never>,
> = ({ readonly ok: true } & Extra) | InvestigationCaseError;

export type InvestigationCaseCreationEligibilityResult = InvestigationCaseResult<{
  readonly eligibility: InvestigationCaseCreationEligibility;
}>;

export type InvestigationCaseCommandResult = InvestigationCaseResult<{
  readonly investigationCase: InvestigationCase;
  readonly event: InvestigationCaseEvent;
}>;

export type ReadInternalInvestigationCaseResult = InvestigationCaseResult<{
  readonly investigationCase: InvestigationCase;
}>;

export type ReadConfirmedInvestigationReportResult = InvestigationCaseResult<{
  readonly view: ConfirmedInvestigationReportView;
}>;
