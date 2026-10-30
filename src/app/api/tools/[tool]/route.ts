import { after, NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { authorizeToolRequest, runTool, ToolError } from "@/lib/calls/tools";
import { log } from "@/lib/log";
import { withinRateLimit } from "@/lib/tools/rate-limit";
import { deliverMessage } from "@/lib/messaging";
import { failure } from "@/lib/tools/replies";
import { provisionPaymentLink } from "@/lib/payments/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Mid-call function endpoint. Bolna authenticates with its own bearer secret,
 * independent of the dashboard session, and the call is identified by the
 * single-use call token passed in user_data.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tool: string }> },
) {
  const { tool } = await context.params;
  try {
    const env = getEnv();
    authorizeToolRequest(request.headers.get("authorization"), env);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (!withinRateLimit("ip", ip)) throw new ToolError(429, "Rate limited");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
      throw new ToolError(400, "Request body too large");
    let body: unknown;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES)
        throw new Error("Too large");
      body = JSON.parse(text);
    } catch {
      throw new ToolError(400, "Invalid JSON body");
    }
    const result = await runTool(tool, body, { env });
    const messageId =
      typeof result.data.message_id === "string"
        ? result.data.message_id
        : null;
    const linkId =
      typeof result.data.link_id === "string" ? result.data.link_id : null;
    if (messageId) after(() => deliverMessage(messageId));
    if (linkId) after(() => provisionPaymentLink(linkId));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ToolError)
      return NextResponse.json(failure(), {
        status: error.httpStatus,
        headers: { "Cache-Control": "no-store" },
      });
    log.warn("Tool endpoint failed", { tool });
    return NextResponse.json(failure(), { status: 200 });
  }
}
