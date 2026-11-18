import type { Enterprise } from "./enterprise";
import type { AuditLogEntry, UserProfile, UserRole } from "./fraudguard";
import type { InvestigationCase } from "./investigation-case";

export interface InvestigationActorReference {
  readonly actorId: string;
  readonly actorRole: UserRole;
  readonly enterpriseId?: string;
  readonly name?: string;
}

export type FeedbackActorDirectoryEntry = Pick<
  UserProfile,
  "id" | "role" | "enterpriseId"
> & {
  readonly name?: string;
  readonly email?: string;
  readonly status?: string;
  readonly isActive?: boolean;
  readonly disabled?: boolean;
  readonly ipAddress?: string;
};

export interface InvestigationReportFeedbackAlertItem {
  readonly alertId: string;
  readonly alertName?: string;
  readonly transactionReference: string;
  readonly projectName: string;
  readonly scoringSource: "AI";
  readonly resultText: string;
  readonly evidence: string;
}

export interface InvestigationReportFeedbackSnapshot {
  readonly enterpriseId: string;
  readonly enterpriseName: string;
  readonly caseId: string;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly reportSummary: string;
  readonly conclusionSummary: string;
  readonly confirmedBy: InvestigationActorReference;
  readonly confirmedAt: string;
  readonly submittedBy: InvestigationActorReference;
  readonly submittedAt: string;
  readonly smeComment?: string;
  readonly alertResults: readonly InvestigationReportFeedbackAlertItem[];
}

export interface InvestigationReportFeedback {
  readonly feedbackId: string;
  readonly enterpriseId: string;
  readonly caseId: string;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly submittedBy: InvestigationActorReference;
  readonly submittedAt: string;
  readonly smeComment?: string;
  readonly snapshot: InvestigationReportFeedbackSnapshot;
}

export type InvestigationReportFeedbackErrorCode =
  | "INVALID_FEEDBACK_INPUT"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_TENANT"
  | "CASE_NOT_FOUND"
  | "CASE_NOT_CLOSED"
  | "MISSING_CONFIRMED_REPORT"
  | "MISSING_REPORT_ID"
  | "INVALID_REPORT_ID"
  | "MISSING_REPORT_VERSION"
  | "INVALID_REPORT_VERSION"
  | "REPORT_VERSION_MISMATCH"
  | "STALE_REPORT_VERSION"
  | "INVALID_TIMESTAMP"
  | "TIMESTAMP_OUT_OF_ORDER"
  | "DUPLICATE_REPORT_FEEDBACK"
  | "FORBIDDEN_READ"
  | "FEEDBACK_NOT_FOUND";

export interface BuildConfirmedReportFeedbackPreviewArgs {
  readonly actor: FeedbackActorDirectoryEntry;
  readonly caseId: string;
  readonly cases: readonly InvestigationCase[];
  readonly enterprises: readonly Enterprise[];
  readonly users?: readonly FeedbackActorDirectoryEntry[];
  readonly expectedReportId?: string;
  readonly expectedReportVersion?: number;
  readonly smeComment?: string;
  readonly submittedAt?: string;
  readonly existingFeedbacks?: readonly InvestigationReportFeedback[];
}

export type BuildConfirmedReportFeedbackPreviewResult =
  | {
      readonly ok: true;
      readonly snapshot: InvestigationReportFeedbackSnapshot;
      readonly existingFeedback?: InvestigationReportFeedback;
    }
  | {
      readonly ok: false;
      readonly code: InvestigationReportFeedbackErrorCode;
      readonly message: string;
      readonly existingFeedbackId?: string;
    };

export interface SubmitConfirmedReportFeedbackArgs {
  readonly feedbackId: string;
  readonly actor: FeedbackActorDirectoryEntry;
  readonly caseId: string;
  readonly expectedReportId: string;
  readonly expectedReportVersion: number;
  readonly submittedAt: string;
  readonly cases: readonly InvestigationCase[];
  readonly enterprises: readonly Enterprise[];
  readonly existingFeedbacks: readonly InvestigationReportFeedback[];
  readonly users?: readonly FeedbackActorDirectoryEntry[];
  readonly smeComment?: string;
  readonly auditId?: string;
  readonly ipAddress?: string;
}

export type SubmitConfirmedReportFeedbackResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly feedbacks: readonly InvestigationReportFeedback[];
        readonly feedback: InvestigationReportFeedback;
        readonly auditLog: AuditLogEntry;
      };
    }
  | {
      readonly ok: false;
      readonly code: InvestigationReportFeedbackErrorCode;
      readonly message: string;
      readonly existingFeedbackId?: string;
    };

export type ReadReportFeedbackDetailResult =
  | {
      readonly ok: true;
      readonly value: InvestigationReportFeedback;
    }
  | {
      readonly ok: false;
      readonly code: InvestigationReportFeedbackErrorCode;
      readonly message: string;
    };
