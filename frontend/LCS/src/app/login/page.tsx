import type { Metadata } from "next";
import { LoginPage } from "@/components/auth/LoginPage";
import { parseLoginNoticeReason } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Enterprise Sign in | FraudGuard",
  description: "Sign in to your FraudGuard enterprise workspace",
};

export default async function EnterpriseLoginRoute(props: {
  searchParams?: Promise<{ reason?: string | string[] }>;
}) {
  const resolved = props.searchParams ? await props.searchParams : undefined;
  const initialReason = parseLoginNoticeReason(resolved?.reason);

  return <LoginPage portal="ENTERPRISE" initialReason={initialReason} />;
}
