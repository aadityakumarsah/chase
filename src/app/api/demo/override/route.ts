import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { getDb } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  const body = z
    .object({ enabled: z.boolean() })
    .safeParse(await request.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  const [business] = await getDb()
    .select()
    .from(businesses)
    .orderBy(businesses.createdAt)
    .limit(1);
  if (!business)
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  await getDb()
    .update(businesses)
    .set({ demoWindowOverride: body.data.enabled })
    .where(eq(businesses.id, business.id));
  return NextResponse.json({ enabled: body.data.enabled });
}
