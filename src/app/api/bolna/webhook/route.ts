import { after, NextRequest, NextResponse } from "next/server";
import { processCall } from "@/lib/analysis/process";
import { getEnv } from "@/lib/env";
import { ingestExecution, verifyWebhookSecret } from "@/lib/calls/webhook";
import { emitEvent } from "@/lib/events";
import { log } from "@/lib/log";
import { publicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";
// Post-call analysis runs in after(); allocate enough function time for the LLM.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Bolna does not sign webhooks, so the shared secret travels in the webhook
 * URL (or an explicit header) and is compared in constant time. Source IPs are
 * documented by Bolna but are never treated as a credential.
 */
export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "bolna-webhook", 120);
  if (limited) return limited;
  const env = getEnv();
  const presented =
    request.headers.get("x-chase-webhook-secret") ??
    request.nextUrl.searchParams.get("token");
  if (!verifyWebhookSecret(presented, env))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sourceIp = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  log.info("Bolna webhook received", { sourceIp: sourceIp ?? "unknown" });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES)
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const outcome = await ingestExecution(body);
    try {
      await emitEvent("webhook.received", {
        ...("callId" in outcome ? { callId: outcome.callId } : {}),
        payload: {
          status: String(
            ("callStatus" in outcome ? outcome.callStatus : outcome.status) ??
              "accepted",
          ),
        },
      });
    } catch {
      log.warn("Webhook receipt audit failed");
    }
    if (
      "terminal" in outcome &&
      outcome.terminal &&
      "callId" in outcome &&
      "purpose" in outcome &&
      outcome.purpose === "collection"
    )
      after(async () => {
        try {
          await processCall(outcome.callId);
        } catch {
          log.warn("Post-call processing failed", { callId: outcome.callId });
        }
      });
    // Always 2xx on an accepted payload so Bolna does not retry indefinitely.
    return NextResponse.json(outcome, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError")
      return NextResponse.json(
        { error: "Unexpected execution payload" },
        { status: 400 },
      );
    log.warn("Webhook ingest failed");
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
