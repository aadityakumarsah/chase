import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { runCampaign } from "@/lib/calls/campaign";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!verifySession(request.cookies.get("admin")?.value, env.ADMIN_PASSCODE))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    return NextResponse.json(await runCampaign(await request.json()));
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
