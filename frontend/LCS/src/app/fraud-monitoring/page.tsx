import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticatedWorkspace } from "@/components/auth/AuthenticatedWorkspace";
import { AUTH_COOKIE_NAME, resolveServerSessionFromToken } from "@/services/auth";

export const dynamic = "force-dynamic";

export default async function FraudMonitoringPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
  const resolution = await resolveServerSessionFromToken(token);

  if (resolution.status === "unauthenticated") {
    redirect("/login?reason=auth_required");
  }

  if (resolution.status === "session_expired") {
    redirect("/login?reason=session_expired");
  }

  if (resolution.status === "backend_unavailable") {
    return <AuthenticatedWorkspace initialState={{ status: "backend_unavailable" }} />;
  }

  return (
    <AuthenticatedWorkspace
      showDemoLink={process.env.NODE_ENV === "development" || process.env.FRAUDGUARD_LOCAL_DEMO === "1"}
      initialState={{ status: "authenticated", session: resolution.session }}
    />
  );
}
