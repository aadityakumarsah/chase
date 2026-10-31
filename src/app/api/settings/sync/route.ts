import { NextRequest, NextResponse } from "next/server";
import { syncConfiguredAgents } from "@/lib/bolna/sync-configured";
import { requireMember } from "@/lib/tenancy/guard";
import { sharedPromptSyncAvailable } from "@/lib/promptprs/actions";

export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;
  if (!(await sharedPromptSyncAvailable(auth.businessId)))
    return NextResponse.json(
      {
        error: "Agent sync is paused while agents are shared across workspaces",
      },
      { status: 403 },
    );
  try {
    const agents = await syncConfiguredAgents();
    return NextResponse.json({ ok: true, agents: agents.length });
  } catch {
    return NextResponse.json(
      {
        error:
          "Agent sync failed; verify the public HTTPS origin and Bolna configuration",
      },
      { status: 503 },
    );
  }
}
