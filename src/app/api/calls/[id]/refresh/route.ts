import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { processCall } from "@/lib/analysis/process";
import { requireMember } from "@/lib/tenancy/guard";
import { getBolnaClient } from "@/lib/bolna/client";
import { ingestExecution } from "@/lib/calls/webhook";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  try {
    const id = z.uuid().parse((await params).id);
    const [call] = await getDb()
      .select()
      .from(calls)
      .where(and(eq(calls.id, id), eq(calls.businessId, auth.businessId)));
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
