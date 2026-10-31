import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewCall } from "@/lib/calls/dispatch";
import { labAuthStatus } from "@/lib/calls/lab-auth";
import { publicRateLimit } from "@/lib/public-rate-limit";
export async function GET(request: NextRequest) {
  const limited = publicRateLimit(request, "web-call-context", 60);
  if (limited) return limited;
  const status = labAuthStatus(request);
  if (status !== 200)
    return NextResponse.json({ error: "Unauthorized" }, { status });
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("debtorId"));
  if (!id.success)
    return NextResponse.json({ error: "Invalid debtor" }, { status: 400 });
  try {
    return NextResponse.json((await previewCall(id.data)).request.user_data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 503 });
  }
}
