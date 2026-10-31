import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBriefPage } from "@/lib/brief";
import { requireMember } from "@/lib/tenancy/guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/brief/[date]">,
) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  try {
    const { date } = await context.params;
    return NextResponse.json(await getBriefPage(z.iso.date().parse(date)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Invalid brief date" }, { status: 400 });
  }
}
