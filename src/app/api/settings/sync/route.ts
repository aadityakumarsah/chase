import { NextRequest, NextResponse } from "next/server";
import { syncConfiguredAgents } from "@/lib/bolna/sync-configured";
import { requireMember } from "@/lib/tenancy/guard";

export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
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
