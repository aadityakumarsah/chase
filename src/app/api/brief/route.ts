import { NextRequest, NextResponse } from "next/server";
import { getBriefPage } from "@/lib/brief";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireDashboardAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await getBriefPage(), {
    headers: { "Cache-Control": "no-store" },
  });
}
