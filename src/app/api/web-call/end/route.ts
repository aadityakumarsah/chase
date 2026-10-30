import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { labAuthStatus } from "@/lib/calls/lab-auth";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { TERMINAL_STATUSES } from "@/lib/calls/webhook";
export async function POST(request: NextRequest) {
  const status = labAuthStatus(request, true);
  if (status !== 200)
    return NextResponse.json({ error: "Unauthorized" }, { status });
  try {
    const { run_id } = z
      .object({ run_id: z.string().min(1).max(128) })
      .parse(await request.json());
    // Only browser practice calls; this does not claim to stop an active phone call.
    await getDb()
      .update(calls)
      .set({
        // Leave final status/facts to Bolna's completed webhook.
        status: "call-disconnected",
        endedAt: new Date(),
        terminationReason: "browser_session_ended",
      })
      .where(
        and(
          eq(calls.bolnaExecutionId, run_id),
          eq(calls.purpose, "test"),
          notInArray(calls.status, [...TERMINAL_STATUSES]),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid end request" }, { status: 400 });
  }
}
