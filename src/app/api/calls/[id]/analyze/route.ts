import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { processCall } from "@/lib/analysis/process";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
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
