import type { DataField } from '@/utils/ingestion-validation';

export type OnboardingStage =
  | 'intake'
  | 'supplement_pending'
  | 'clarifying'
  | 'waiting_confirmation'
  | 'revising'
  | 'waiting_reconfirmation'
  | 'confirmed';

export interface IntakeDocumentItem {
  id: string;
  name: string;
  format: string;
  receivedAt: string;
  summary: string;
  content: string;
  dataUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  previewSupported?: boolean;
}

export interface SupplementRequestRecord {
  id: string;
  requestedAt: string;
  requestedBy: string;
  items: string[];
  note: string;
  guidanceFileName?: string;
  guidanceFileContent?: string;
  guidanceFileDataUrl?: string;
  guidanceFileMimeType?: string;
  guidanceFileSizeBytes?: number;
  receivedAt?: string;
  receivedBy?: string;
  receivedNote?: string;
  receivedDocumentName?: string;
}

export interface ClarifiedConditionItem {
  id: string;
  name: string;
  criteria: string;
  scope: string;
}

export interface ClarifiedFieldItem extends DataField {
  description?: string;
}

export interface SpecificationSnapshot {
  version: string;
  requirements: string;
  conditionsList: ClarifiedConditionItem[];
  schema: ClarifiedFieldItem[];
  sampleJson: string;
  updatedAt: string;
  sentAt?: string;
  sentBy?: string;
  revisionSummary?: string;
}

export interface EnterpriseFeedbackRecord {
  id: string;
  versionTarget: string;
  receivedAt: string;
  channel: string;
  contactPerson: string;
  content: string;
}

export interface EnterpriseConfirmationRecord {
  confirmedAt: string;
  confirmedBy: string;
  channel: string;
  note: string;
  version: string;
}

export interface DeploymentSpecification {
  stage?: OnboardingStage;
  businessModel?: string;
  deploymentScopeNote?: string;
  representativeName?: string;
  representativeRole?: string;
  representativeEmail?: string;
  smeAdminName?: string;
  smeAdminEmail?: string;
  intakeReviewNote?: string;
  intakeDocuments?: IntakeDocumentItem[];
  suggestedSupplementItems?: string[];
  supplementRequests?: SupplementRequestRecord[];
  conditionsList?: ClarifiedConditionItem[];
  schema?: ClarifiedFieldItem[];
  savedDraft?: SpecificationSnapshot;
  sentSnapshot?: SpecificationSnapshot;
  sentHistory?: SpecificationSnapshot[];
  feedbackHistory?: EnterpriseFeedbackRecord[];
  confirmedSnapshot?: SpecificationSnapshot;
  enterpriseConfirmation?: EnterpriseConfirmationRecord;
  dataAndEvaluationClarified?: boolean;
  dataClarifiedAt?: string;
  dataClarifiedBy?: string;
  requirements: string;
  fields: string;
  conditions: string;
  sampleJson: string;
  updatedAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export type ServicePlan = "Free" | "Subscription";

export interface Enterprise {
  id: string;
  code?: string;
  name: string;
  plan?: ServicePlan;
  projectIds: string[];
  deploymentStaffId: string;
  specification?: DeploymentSpecification;
}
