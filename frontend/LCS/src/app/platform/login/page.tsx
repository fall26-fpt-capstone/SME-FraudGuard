import type { Metadata } from "next";
import { LoginPage } from "@/components/auth/LoginPage";
import { parseLoginNoticeReason } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Platform Sign in | FraudGuard",
  description: "Sign in to FraudGuard platform administration",
};

export default async function PlatformLoginRoute(props: {
  searchParams?: Promise<{ reason?: string | string[] }>;
}) {
  const resolved = props.searchParams ? await props.searchParams : undefined;
  const initialReason = parseLoginNoticeReason(resolved?.reason);

  return <LoginPage portal="PLATFORM" initialReason={initialReason} />;
}
