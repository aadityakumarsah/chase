import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/log";
import { publicRateLimit } from "@/lib/public-rate-limit";
import {
  applyWebhook,
  verifyWebhook,
  WebhookRejected,
} from "@/lib/billing/webhook";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Dodo Payments subscription webhook.
 *
 * Authenticated by its Standard Webhooks signature, not by a dashboard session,
 * so it is listed as a public path in src/lib/auth.ts. The raw body must reach
 * the verifier byte for byte, which is why it is read with `text()`.
 */
export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "dodo-webhook", 240);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });

  const webhookId = request.headers.get("webhook-id");
  try {
    const body = verifyWebhook(raw, {
      id: webhookId,
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    });
    const result = await applyWebhook(body, webhookId!);
    return NextResponse.json({ ok: true, handled: result.handled });
  } catch (error) {
    if (error instanceof WebhookRejected)
      return NextResponse.json({ ok: false }, { status: error.status });
    if (error instanceof SyntaxError)
      return NextResponse.json({ ok: false }, { status: 400 });
    // A 5xx asks Dodo to retry, which is what we want for a transient fault.
    log.error("billing.webhook.failed", { webhookId });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
