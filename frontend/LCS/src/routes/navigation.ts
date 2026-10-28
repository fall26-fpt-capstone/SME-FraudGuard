import { canAccessView } from "@/utils/permissions";
import type { SecondaryView, UserProfile } from "@/types/fraudguard";
import type { TranslationKey } from "@/config/translations";
import type { LucideIcon } from "lucide-react";
import { Building2, Activity, AlertTriangle, Briefcase, Sliders, FolderKanban, Users, FileText, History, Server, TestTube2 } from "lucide-react";

interface NavItem {
  label: string;
  id: SecondaryView;
  icon: LucideIcon;
  badge?: string | number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function getSectionsForRole(role?: string, t?: TranslationKey): NavSection[] {
  return roleSections(role, t).map(section => ({ ...section, items: section.items.filter(item => canAccessView(role as UserProfile['role'], item.id)) })).filter(section => section.items.length);
}

function roleSections(role?: string, t?: TranslationKey): NavSection[] {
  const nav = t?.nav;
  if (role === "Platform Admin") return [{ title: nav?.sections.platformSystem || "PLATFORM", items: [
    { id: "onboarding", label: nav?.items.onboarding || "Enterprise setup", icon: Building2 },
    { id: "platform-health", label: nav?.items.platformHealth || "Platform health", icon: Server },
    { id: "rule-sets", label: nav?.items.ruleSets || "Enterprise rule sets", icon: FolderKanban },
    { id: "audit-trail", label: nav?.items.auditTrail || "Audit trail", icon: History },
  ] }];
  if (role === "Implementation Staff") return [{ title: nav?.sections.ruleLifecycle || "DEPLOYMENT", items: [
    { id: "rule-sets", label: nav?.items.ruleSets || "Enterprise rule sets", icon: FolderKanban },
    { id: "onboarding", label: nav?.items.onboarding || "Onboarding", icon: FolderKanban },
    { id: "rule-templates", label: nav?.items.ruleTemplates || "Rule library", icon: Sliders },
    { id: "rule-testing", label: nav?.items.ruleTesting || "Sandbox", icon: TestTube2 },
    { id: "projects", label: nav?.items.projects || "Projects", icon: FolderKanban },
    { id: "audit-trail", label: nav?.items.auditTrail || "Audit trail", icon: History },
  ] }];

  if (role === "Operator") {
    return [
      {
        title: nav?.sections.operationQueue || "OPERATION QUEUE",
        items: [
          { id: "risk-overview", label: nav?.items.riskOverview || "Risk Dashboard", icon: Activity },
          { id: "recent-alerts", label: nav?.items.recentAlerts || "Alert Queue", icon: AlertTriangle },
          { id: "active-cases", label: nav?.items.activeCases || "Case Queue", icon: Briefcase },
        ],
      },
      {
        title: nav?.sections.analyticsAudit || "ANALYTICS & AUDIT",
        items: [
          { id: "reports", label: nav?.items.reports || "Reports & Performance", icon: FileText },
          { id: "audit-trail", label: nav?.items.auditTrail || "Audit Trail", icon: History },
        ],
      },
    ];
  }

  if (role === "Investigator") {
    return [
      {
        title: nav?.sections.investigationPortal || "INVESTIGATION PORTAL",
        items: [
          { id: "active-cases", label: nav?.items.myCases || "My Cases", icon: Briefcase },
          { id: "reports", label: nav?.items.investigationHistory || "Investigation History", icon: FileText },
        ],
      },
    ];
  }

  if (role === "Viewer") {
    return [
      {
        title: nav?.sections.monitoring || "MONITORING (READ-ONLY)",
        items: [
          { id: "risk-overview", label: nav?.items.riskOverview || "Risk Overview", icon: Activity },
          { id: "recent-alerts", label: nav?.items.recentAlerts || "Recent Alerts", icon: AlertTriangle },
          { id: "active-cases", label: nav?.items.activeCases || "Active Cases", icon: Briefcase },
        ],
      },
      {
        title: nav?.sections.analyticsAudit || "ANALYTICS & COMPLIANCE",
        items: [
          { id: "reports", label: nav?.items.reports || "Reports & Metrics", icon: FileText },
          { id: "audit-trail", label: nav?.items.auditTrail || "Audit Trail", icon: History },
        ],
      },
    ];
  }

  // Default: SME Admin
  return [
    {
      title: nav?.sections.monitoring || "MONITORING",
      items: [
        { id: "risk-overview", label: nav?.items.riskOverview || "Executive Overview", icon: Activity },
        { id: "recent-alerts", label: nav?.items.recentAlerts || "Recent Alerts", icon: AlertTriangle },
        { id: "active-cases", label: nav?.items.activeCases || "Active Cases", icon: Briefcase },
      ],
    },
    {
      title: nav?.sections.configuration || "CONFIGURATION",
      items: [
        { id: "rule-sets", label: nav?.items.ruleSets === 'Tập rule doanh nghiệp' ? 'Quy tắc phát hiện' : 'Detection rules', icon: FolderKanban },

        { id: "projects", label: nav?.items.projects || "Projects & Integrations", icon: FolderKanban },
        { id: "members", label: t?.brandName === "FraudGuard" && nav?.items.projects?.includes("Dự án") ? "Thành viên doanh nghiệp" : "Enterprise members", icon: Users },
      ],
    },
    {
      title: nav?.sections.analyticsAudit || "ANALYTICS & COMPLIANCE",
      items: [
        { id: "reports", label: nav?.items.reports || "Reports & Performance", icon: FileText },
        { id: "audit-trail", label: nav?.items.auditTrail || "Audit Trail", icon: History },
      ],
    },
  ];
}
