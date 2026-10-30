import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { dashboardSummary } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = requireDashboardAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await dashboardSummary(), {
    headers: { "Cache-Control": "no-store" },
  });
}
