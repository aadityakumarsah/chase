import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import { getDb } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const body = z
    .object({ enabled: z.boolean() })
    .safeParse(await request.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  await getDb()
    .update(businesses)
    .set({ demoWindowOverride: body.data.enabled })
    .where(eq(businesses.id, auth.businessId));
  return NextResponse.json({ enabled: body.data.enabled });
}
