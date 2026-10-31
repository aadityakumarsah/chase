import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { aiOps } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await aiOps(auth.businessId), {
    headers: { "Cache-Control": "no-store" },
  });
}
