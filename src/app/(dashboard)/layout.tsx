import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthUser } from "@/lib/supabase/server";
import { getSession } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser().catch(() => null);
  const result = await getSession(user);
  if (!result.ok)
    redirect(result.reason === "anonymous" ? "/login" : "/onboarding");

  const { session } = result;
  return (
    <DashboardShell
      // Viewers see the workspace but cannot act in it.
      readOnly={session.workspace.role === "viewer"}
      user={{
        name: session.user.fullName ?? session.user.email,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
      }}
      workspace={{
        id: session.workspace.id,
        name: session.workspace.name,
        role: session.workspace.role,
        plan: session.workspace.plan,
      }}
      workspaces={session.workspaces.map((w) => ({ id: w.id, name: w.name }))}
    >
      {children}
    </DashboardShell>
  );
}
