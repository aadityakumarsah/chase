import { NextRequest, NextResponse } from "next/server";
import { getBriefPage } from "@/lib/brief";
import { requireMember } from "@/lib/tenancy/guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getBriefPage(auth.businessId), {
    headers: { "Cache-Control": "no-store" },
  });
}
