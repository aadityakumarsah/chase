import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { runTool } from "@/lib/calls/tools";
import { requireMember } from "@/lib/tenancy/guard";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { istDay } from "@/lib/time";
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const [call] = await getDb()
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.businessId, auth.businessId),
        eq(calls.purpose, "collection"),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(1);
  if (!call?.debtorId || Date.now() - call.createdAt.getTime() > 45 * 60_000)
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
