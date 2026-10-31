import { DashboardShell } from "@/components/dashboard-shell";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const env = getEnv();
  const jar = await cookies();
  const readOnly =
    !verifySession(jar.get("admin")?.value, env.ADMIN_PASSCODE) &&
    verifySession(jar.get("demo_view")?.value, env.DEMO_VIEW_PASSCODE);
  return <DashboardShell readOnly={readOnly}>{children}</DashboardShell>;
}
