import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { ingestExecution, verifyWebhookSecret } from "@/lib/calls/webhook";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Bolna does not sign webhooks, so the shared secret travels in the webhook
 * URL (or an explicit header) and is compared in constant time. Source IPs are
 * documented by Bolna but are never treated as a credential.
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  const presented =
    request.headers.get("x-chase-webhook-secret") ??
    request.nextUrl.searchParams.get("token");
  if (!verifyWebhookSecret(presented, env))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
