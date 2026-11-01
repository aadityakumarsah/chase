import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import {
  dashboardEvents,
  dashboardQueue,
  dashboardSummary,
} from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  // The overview needs these together. One request avoids repeating Supabase
  // user verification and workspace membership checks three times on mount.
  const [summary, queue, events] = await Promise.all([
    dashboardSummary(auth.businessId),
    dashboardQueue(auth.businessId),
    dashboardEvents(auth.businessId, { limit: 40 }),
  ]);
  return NextResponse.json(
    { summary, queue, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
