import type { UserRole, SecondaryView } from "@/types/fraudguard";

export function getRoleHomeView(role: UserRole): SecondaryView {
  switch (role) {
    case "Platform Admin": return "platform-health";
    case "Implementation Staff": return "rule-sets";
    case "Operator":
    case "Investigator": return "active-cases";
    default: return "risk-overview";
  }
}
