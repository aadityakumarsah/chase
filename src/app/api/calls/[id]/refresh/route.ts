import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { processCall } from "@/lib/analysis/process";
import { verifySession } from "@/lib/auth";
import { getBolnaClient } from "@/lib/bolna/client";
import { ingestExecution } from "@/lib/calls/webhook";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  if (!verifySession(request.cookies.get("admin")?.value, env.ADMIN_PASSCODE))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const id = z.uuid().parse((await params).id);
    const [call] = await getDb().select().from(calls).where(eq(calls.id, id));
    if (!call?.bolnaExecutionId)
      return NextResponse.json(
        { error: "Execution not available" },
        { status: 404 },
      );
    const result = await ingestExecution(
      await getBolnaClient().getExecution(call.bolnaExecutionId),
    );
    if ("terminal" in result && result.terminal) await processCall(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError ? "Invalid call id" : "Refresh failed",
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
