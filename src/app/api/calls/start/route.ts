import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { startCollectionCall } from "@/lib/calls/dial";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
const bodySchema = z.object({ debtorId: z.uuid() });

export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!verifySession(request.cookies.get("admin")?.value, env.ADMIN_PASSCODE))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await startCollectionCall(body.debtorId, { source: "manual" }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError ? "Invalid request" : "Call unavailable",
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
