import type { UserProfile, UserRole, SecondaryView, RolePermissions, TransactionRisk } from "@/types/fraudguard";

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

export function canSaveMember(actor: UserProfile, member: UserProfile, users: UserProfile[], enterpriseTransactions: TransactionRisk[] = []): boolean {
  if (actor.role !== 'SME Admin' || !actor.enterpriseId || member.enterpriseId !== actor.enterpriseId || member.id === actor.id || !['SME Admin','Operator','Investigator'].includes(member.role)) return false;
  if (!member.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) return false;
  const previous = users.find(u => u.id === member.id);
  if (previous && previous.enterpriseId !== actor.enterpriseId) return false;
  if (previous && previous.role !== member.role && enterpriseTransactions.some(tx =>
    tx.scoringSource === 'AI' && !!tx.caseId &&
    (tx.assignedInvestigatorId ? tx.assignedInvestigatorId === previous.id : tx.assignedInvestigator === previous.name) &&
    ['Assigned', 'Investigating', 'Reported'].includes(tx.caseStatus ?? '')
  )) return false;
  return !users.some(u => u.id !== member.id && (u.email.toLowerCase() === member.email.toLowerCase() || u.enterpriseId === member.enterpriseId && u.name.toLowerCase() === member.name.toLowerCase()));
}

export function canProvisionEnterpriseAdmin(actor: UserProfile, name: string, email: string, users: UserProfile[]): boolean {
  return actor.role === 'Platform Admin' && !!name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !users.some(user => user.email.toLowerCase() === email.trim().toLowerCase());
}
