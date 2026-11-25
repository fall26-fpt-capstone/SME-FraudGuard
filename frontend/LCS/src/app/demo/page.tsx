import { notFound } from "next/navigation";
import { FraudGuardDashboard } from "@/components/fraudguard-dashboard/FraudGuardDashboard";
import { fraudGuardTransactions } from "@/data/fraudguard-transactions";
import { fraudGuardRules } from "@/data/fraudguard-rules";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (process.env.NODE_ENV !== "development" && process.env.FRAUDGUARD_LOCAL_DEMO !== "1") notFound();
  return <FraudGuardDashboard initialTransactions={fraudGuardTransactions} initialRules={fraudGuardRules} />;
}
