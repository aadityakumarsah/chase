import { NextRequest, NextResponse } from "next/server";
import { resetDemoState } from "@/lib/demo/reset";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  try {
    return NextResponse.json(await resetDemoState());
  } catch {
    return NextResponse.json(
      { error: "Reset refused by dedicated-demo safety checks" },
      { status: 409 },
    );
  }
}
