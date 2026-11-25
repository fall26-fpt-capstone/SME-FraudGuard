import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME } from "@/services/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSessionCookie = Boolean(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  redirect(hasSessionCookie ? "/fraud-monitoring" : "/login");
}
