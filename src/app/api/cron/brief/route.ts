import { NextRequest, NextResponse } from "next/server";
import { runDailyBrief } from "@/lib/brief";
import { verifyCronAuthorization } from "@/lib/brief/cron";
import { sweepPromises } from "@/lib/chase/sweep";
import { getEnv } from "@/lib/env";
import { runNightlyPromptPrJob } from "@/lib/promptprs/nightly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const env = getEnv();
  if (
    !verifyCronAuthorization(
      request.headers.get("authorization"),
      env.CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const promises = await sweepPromises(new Date(), { includeToday: true });
    const promptPr = await runNightlyPromptPrJob();
    const result = await runDailyBrief({
      deliver: ["dashboard", "message", "call"],
    });
    return NextResponse.json({ ok: true, promises, promptPr, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brief cron failed" },
      { status: 503 },
    );
  }
}
