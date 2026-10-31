import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { paymentLinks } from "@/lib/db/schema";
import { razorpayPaidSchema, validSignature } from "@/lib/payments/razorpay";
import { recordPayment } from "@/lib/payments/service";
import { publicRateLimit } from "@/lib/public-rate-limit";
const MAX_BODY_BYTES = 256 * 1024;
export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "razorpay-webhook", 120);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });
  const raw = await request.text(),
    env = getEnv();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });
  if (
    !validSignature(
      raw,
      request.headers.get("x-razorpay-signature"),
      env.RAZORPAY_WEBHOOK_SECRET,
    )
  )
    return NextResponse.json({ ok: false }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = razorpayPaidSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: true, ignored: true });
  const entity = parsed.data.payload.payment_link.entity,
    payment = parsed.data.payload.payment.entity;
  const [link] = await getDb()
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, entity.reference_id));
  if (!link || entity.id !== link.providerRef)
    return NextResponse.json({ ok: false }, { status: 400 });
  await recordPayment({
    linkId: link.id,
    amountPaise: BigInt(payment.amount),
    source: "razorpay_webhook",
    providerRef: payment.id,
  });
  return NextResponse.json({ ok: true });
}
