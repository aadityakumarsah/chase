import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { paymentLinks } from "@/lib/db/schema";
import { razorpayPaidSchema, validSignature } from "@/lib/payments/razorpay";
import { recordPayment } from "@/lib/payments/service";
export async function POST(request: NextRequest) {
  const raw = await request.text(),
    env = getEnv();
  if (
    !validSignature(
      raw,
      request.headers.get("x-razorpay-signature"),
      env.RAZORPAY_WEBHOOK_SECRET,
    )
  )
    return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = razorpayPaidSchema.safeParse(JSON.parse(raw));
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
