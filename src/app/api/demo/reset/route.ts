import { NextRequest, NextResponse } from "next/server";
import { seedPortfolio } from "@/lib/chase/seed";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  try {
    return NextResponse.json(await seedPortfolio({ reset: true }));
  } catch {
    return NextResponse.json(
      { error: "Reset refused by local-demo safety checks" },
      { status: 409 },
    );
  }
}
