import { NextRequest, NextResponse } from "next/server";
import { runDailyBrief } from "@/lib/brief";
import { verifyCronAuthorization } from "@/lib/brief/cron";
import { sweepPromises } from "@/lib/chase/sweep";
import { getEnv } from "@/lib/env";
import { runNightlyPromptPrJob } from "@/lib/promptprs/nightly";
import { listActiveWorkspaceIds } from "@/lib/tenancy";
import { publicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const limited = publicRateLimit(request, "brief-cron", 10);
  if (limited) return limited;
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
    // Multi-tenant: every active workspace gets its own brief. One workspace
    // failing must not stop the others from being briefed.
    const workspaces = await listActiveWorkspaceIds();
    const results: Array<{
      businessId: string;
      ok: boolean;
      promptPr?: unknown;
      result?: unknown;
      error?: string;
    }> = [];
    for (const businessId of workspaces)
      try {
        // Prompt proposals only see this workspace's calls. Lack of usable
        // evidence does not stop the owner brief for the same workspace.
        const promptPr = await runNightlyPromptPrJob(businessId).catch(() => ({
          status: "skipped" as const,
        }));
        results.push({
          businessId,
          ok: true,
          promptPr,
          result: await runDailyBrief({
            businessId,
            deliver: ["dashboard", "message", "call"],
          }),
        });
      } catch (error) {
        results.push({
          businessId,
          ok: false,
          error: error instanceof Error ? error.message : "brief failed",
        });
      }
    return NextResponse.json({
      ok: results.every((entry) => entry.ok),
      workspaces: results.length,
      promises,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brief cron failed" },
      { status: 503 },
    );
  }
}
