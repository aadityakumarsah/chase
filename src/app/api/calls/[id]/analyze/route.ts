import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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
  await getDb()
    .update(calls)
    .set({ processedAt: null, processingStartedAt: null })
    .where(eq(calls.id, id.data));
  try {
    return NextResponse.json(await processCall(id.data, { force: true }));
  } catch {
    return NextResponse.json(
      { error: "Analysis failed safely" },
      { status: 503 },
    );
  }
}
