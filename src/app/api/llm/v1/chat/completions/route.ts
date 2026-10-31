import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  authorizeProxy,
  chatCompletionRequestSchema,
  createProxyStream,
} from "@/lib/proxy";
import { publicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "llm-proxy", 120);
  if (limited) return limited;
  const env = getEnv();
  if (
    !authorizeProxy(request.headers.get("authorization"), env.CHASE_PROXY_KEY)
  )
    return NextResponse.json(
      { error: { message: "Unauthorized", type: "authentication_error" } },
      { status: 401 },
    );
  try {
    const input = chatCompletionRequestSchema.parse(await request.json());
    const stream = await createProxyStream(input, request.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid proxy request",
          type: "invalid_request_error",
        },
      },
      { status: 400 },
    );
  }
}
