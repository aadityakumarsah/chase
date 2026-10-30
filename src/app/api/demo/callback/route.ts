import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { runTool } from "@/lib/calls/tools";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { istDay } from "@/lib/time";
export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  const [call] = await getDb()
    .select()
    .from(calls)
    .orderBy(desc(calls.createdAt))
    .limit(1);
  if (!call || Date.now() - call.createdAt.getTime() > 45 * 60_000)
    return NextResponse.json(
      { error: "Start a demo call first" },
      { status: 409 },
    );
  const result = await runTool("schedule_callback", {
    account_id: call.debtorId,
    call_token: call.callToken,
    callback_date: istDay(new Date()),
    time_window: "after_hours",
  });
  return NextResponse.json(result);
}
