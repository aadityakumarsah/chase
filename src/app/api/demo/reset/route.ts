import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
import { resetDemoState } from "@/lib/demo/reset";
import { requireMember } from "@/lib/tenancy/guard";

export const runtime = "nodejs";

/**
 * Restores the fictional sample portfolio.
 *
 * This is destructive — it truncates the application tables — so it is gated
 * three ways: the caller must own the workspace, the workspace must be the
 * seeded sample one, and `resetDemoState` itself refuses to run if the database
 * holds any business that is not the sample. On a real multi-tenant deployment
 * that last check is what makes this endpoint unreachable.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "owner",
  });
  if (!auth.ok) return auth.response;

  const [workspace] = await getDb()
    .select({ seedKey: businesses.seedKey })
    .from(businesses)
    .where(eq(businesses.id, auth.businessId));
  if (!workspace?.seedKey)
    return NextResponse.json(
      { error: "This workspace holds real data and cannot be reset." },
      { status: 409 },
    );

  try {
    return NextResponse.json(await resetDemoState());
  } catch {
    return NextResponse.json(
      { error: "Reset refused by dedicated-demo safety checks" },
      { status: 409 },
    );
  }
}
