import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { authorizeProxy } from "@/lib/proxy";
import { publicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const limited = publicRateLimit(request, "llm-models", 60);
  if (limited) return limited;
  const env = getEnv();
  if (
    !authorizeProxy(request.headers.get("authorization"), env.CHASE_PROXY_KEY)
  )
    return NextResponse.json(
      { error: { message: "Unauthorized", type: "authentication_error" } },
      { status: 401 },
    );
  return NextResponse.json({
    object: "list",
    data: [
      { id: "chase-claude", object: "model", created: 0, owned_by: "chase" },
    ],
  });
}
