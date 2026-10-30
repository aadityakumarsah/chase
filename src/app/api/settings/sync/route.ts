import { NextRequest, NextResponse } from "next/server";
import { syncConfiguredAgents } from "@/lib/bolna/sync-configured";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";

export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
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
