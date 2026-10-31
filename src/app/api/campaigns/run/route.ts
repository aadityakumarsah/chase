import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import { runCampaign } from "@/lib/calls/campaign";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    return NextResponse.json(
      // The workspace comes from the verified session, not the request body.
      await runCampaign({ ...body, businessId: auth.businessId }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid campaign request"
            : "Campaign runner unavailable",
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
