export interface DeploymentSpecification { schema?: import('@/utils/ingestion-validation').DataField[]; requirements: string; fields: string; conditions: string; sampleJson: string; updatedAt: string; confirmedAt?: string; confirmedBy?: string }
export type ServicePlan = "Free" | "Subscription";
export interface Enterprise { plan?: ServicePlan; specification?: DeploymentSpecification; id: string; name: string; projectIds: string[]; deploymentStaffId: string }
