import type { UserProfile, UserRole, SecondaryView, RolePermissions, TransactionRisk } from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";

export interface LegacyCaseArchiveLike {
  archiveId?: string;
  legacyCaseId?: string;
  legacyCaseStatus?: string;
  originalStatus?: string;
  enterpriseId?: string;
  reasonCode?: string;
  blocksAlertCreation?: boolean;
  alertIds?: readonly string[];
  transactionIds?: readonly string[];
  canResolveAssigneeId?: string;
  assignedInvestigatorName?: string;
  transactions?: readonly Pick<
    TransactionRisk,
    "id" | "alertId" | "caseId" | "caseStatus" | "assignedInvestigatorId" | "assignedInvestigator"
  >[];
}

export function canAccessView(role: UserRole, view: SecondaryView): boolean {
  const views: Partial<Record<UserRole, SecondaryView[]>> = {
    'Platform Admin': ['onboarding', 'platform-health', 'rule-sets', 'audit-trail'],
    'Implementation Staff': ['onboarding', 'rule-sets', 'rule-templates', 'rule-testing', 'projects', 'audit-trail'],
    'SME Admin': ['risk-overview', 'recent-alerts', 'active-cases', 'reports', 'members', 'projects', 'rule-sets', 'audit-trail'],
    'Operator': ['risk-overview', 'recent-alerts', 'active-cases', 'reports', 'audit-trail'],
    'Investigator': ['active-cases', 'my-cases', 'reports'],
  };
  return views[role]?.includes(view) ?? false;
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case "Platform Admin":
      return {
        canManageProjects: false,
        canManageRules: false,
        canManageCases: false,
        canInvestigateCases: false,
        canViewAllCases: false,
        canViewAudit: true,
        canExport: false,
        isReadOnly: false,
        isSuperAdmin: true,
        canAccessRuleTesting: false,
        canAccessOnboarding: false,
      };
    case "Implementation Staff":
      return {
        canManageProjects: true,
        canManageRules: true,
        canManageCases: false,
        canInvestigateCases: false,
        canViewAllCases: false,
        canViewAudit: true,
        canExport: false,
        isReadOnly: false,
        isSuperAdmin: false,
        canAccessRuleTesting: true,
        canAccessOnboarding: true,
      };
    case "SME Admin":
      return {
        canManageProjects: true,
        canManageRules: false,
        canManageCases: false,
        canInvestigateCases: false,
        canViewAllCases: true,
        canViewAudit: true,
        canExport: true,
        isReadOnly: false,
        isSuperAdmin: false,
        canAccessRuleTesting: false,
        canAccessOnboarding: false,
      };
    case "Operator":
      return {
        canManageProjects: false,
        canManageRules: false,
        canManageCases: true, // Assign, review reports, close/confirm
        canInvestigateCases: true,
        canViewAllCases: true,
        canViewAudit: true,
        canExport: true,
        isReadOnly: false,
        isSuperAdmin: false,
        canAccessRuleTesting: false,
        canAccessOnboarding: false,
      };
    case "Investigator":
      return {
        canManageProjects: false,
        canManageRules: false,
        canManageCases: false, // Cannot assign or close case
        canInvestigateCases: true, // Can submit investigation notes & report
        canViewAllCases: false, // Only "My Cases"
        canViewAudit: false,
        canExport: false,
        isReadOnly: false,
        isSuperAdmin: false,
        canAccessRuleTesting: false,
        canAccessOnboarding: false,
      };
    case "Viewer":
    default:
      return {
        canManageProjects: false,
        canManageRules: false,
        canManageCases: false,
        canInvestigateCases: false,
        canViewAllCases: true,
        canViewAudit: true,
        canExport: true,
        isReadOnly: true,
        isSuperAdmin: false,
        canAccessRuleTesting: false,
        canAccessOnboarding: false,
      };
  }
}

const ACTIVE_INVESTIGATION_STATUSES = new Set(["Investigating", "Pending Review"]);
const ACTIVE_LEGACY_CASE_STATUSES = new Set(["Assigned", "Investigating", "Reported"]);

function isLegacyArchiveAssignedToMember(
  entry: LegacyCaseArchiveLike,
  member: Pick<UserProfile, "id" | "name">,
): boolean {
  if (entry.canResolveAssigneeId) return entry.canResolveAssigneeId === member.id;
  const txWithId = entry.transactions?.find((tx) => Boolean(tx.assignedInvestigatorId));
  if (txWithId) return entry.transactions?.some((tx) => tx.assignedInvestigatorId === member.id) ?? false;
  const fallbackName = entry.assignedInvestigatorName ?? entry.transactions?.find((tx) => Boolean(tx.assignedInvestigator))?.assignedInvestigator;
  return Boolean(fallbackName && fallbackName === member.name);
}

function hasActiveRoleAssignment(
  enterpriseId: string,
  previous: Pick<UserProfile, "id" | "name">,
  enterpriseTransactions: readonly TransactionRisk[],
  investigationCases: readonly InvestigationCase[],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[],
): boolean {
  if (
    investigationCases.some(
      (c) =>
        c.enterpriseId === enterpriseId &&
        ACTIVE_INVESTIGATION_STATUSES.has(c.status) &&
        c.assignee?.actorId === previous.id,
    )
  ) {
    return true;
  }

  if (
    legacyCaseArchive.some((entry) => {
      if (entry.enterpriseId !== enterpriseId) return false;
      const status =
        entry.originalStatus ??
        entry.legacyCaseStatus ??
        entry.transactions?.find((tx) => Boolean(tx.caseStatus))?.caseStatus ??
        "";
      return ACTIVE_LEGACY_CASE_STATUSES.has(status) && isLegacyArchiveAssignedToMember(entry, previous);
    })
  ) {
    return true;
  }

  const coveredTxIds = new Set<string>();
  const coveredAlertIds = new Set<string>();
  const coveredCaseIds = new Set<string>();

  for (const c of investigationCases) {
    coveredCaseIds.add(c.caseId);
    for (const alertId of c.alertIds) coveredAlertIds.add(alertId);
    for (const alert of c.alerts) {
      coveredTxIds.add(alert.transactionId);
      coveredAlertIds.add(alert.alertId);
    }
  }
  for (const entry of legacyCaseArchive) {
    if (entry.legacyCaseId) coveredCaseIds.add(entry.legacyCaseId);
    for (const id of entry.transactionIds ?? []) coveredTxIds.add(id);
    for (const alertId of entry.alertIds ?? []) coveredAlertIds.add(alertId);
    for (const tx of entry.transactions ?? []) {
      coveredTxIds.add(tx.id);
      if (tx.alertId) coveredAlertIds.add(tx.alertId);
      if (tx.caseId) coveredCaseIds.add(tx.caseId);
    }
  }

  return enterpriseTransactions.some((tx) => {
    if (
      coveredTxIds.has(tx.id) ||
      (tx.alertId && coveredAlertIds.has(tx.alertId)) ||
      (tx.caseId && coveredCaseIds.has(tx.caseId))
    ) {
      return false;
    }
    return (
      tx.scoringSource === "AI" &&
      Boolean(tx.caseId) &&
      (tx.assignedInvestigatorId ? tx.assignedInvestigatorId === previous.id : tx.assignedInvestigator === previous.name) &&
      ACTIVE_LEGACY_CASE_STATUSES.has(tx.caseStatus ?? "")
    );
  });
}

export function canSaveMember(
  actor: UserProfile,
  member: UserProfile,
  users: UserProfile[],
  enterpriseTransactions: TransactionRisk[] = [],
  investigationCases: readonly InvestigationCase[] = [],
  legacyCaseArchive: readonly LegacyCaseArchiveLike[] = [],
): boolean {
  if (actor.role !== 'SME Admin' || !actor.enterpriseId || member.enterpriseId !== actor.enterpriseId || member.id === actor.id || !['SME Admin','Operator','Investigator'].includes(member.role)) return false;
  if (!member.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) return false;
  const previous = users.find(u => u.id === member.id);
  if (previous && previous.enterpriseId !== actor.enterpriseId) return false;
  if (
    previous &&
    previous.role !== member.role &&
    hasActiveRoleAssignment(actor.enterpriseId, previous, enterpriseTransactions, investigationCases, legacyCaseArchive)
  ) {
    return false;
  }
  return !users.some(u => u.id !== member.id && (u.email.toLowerCase() === member.email.toLowerCase() || u.enterpriseId === member.enterpriseId && u.name.toLowerCase() === member.name.toLowerCase()));
}

export function canProvisionEnterpriseAdmin(actor: UserProfile, name: string, email: string, users: UserProfile[]): boolean {
  return actor.role === 'Platform Admin' && !!name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !users.some(user => user.email.toLowerCase() === email.trim().toLowerCase());
}
