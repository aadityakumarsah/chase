import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { processCall } from "@/lib/analysis/process";
import { requireMember } from "@/lib/tenancy/guard";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Invalid call" }, { status: 400 });
  const [call] = await getDb()
    .update(calls)
    .set({ processedAt: null, processingStartedAt: null })
    .where(and(eq(calls.id, id.data), eq(calls.businessId, auth.businessId)))
    .returning({ id: calls.id });
  if (!call)
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  try {
    return NextResponse.json(await processCall(id.data, { force: true }));
  } catch {
    return NextResponse.json(
      { error: "Analysis failed safely" },
      { status: 503 },
    );
  }
}
