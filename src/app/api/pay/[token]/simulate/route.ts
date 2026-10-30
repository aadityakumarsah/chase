import { NextRequest, NextResponse } from "next/server";
import { loadPaymentPage } from "@/lib/payments/links";
import { recordPayment } from "@/lib/payments/service";
import { withinRateLimit } from "@/lib/tools/rate-limit";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params,
    ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
  if (!withinRateLimit("pay", ip))
    return NextResponse.json({ ok: false }, { status: 429 });
  const data = await loadPaymentPage(token);
  if (!data?.link.isDemo)
    return NextResponse.json({ ok: false }, { status: 404 });
  try {
    await recordPayment({
      linkId: data.link.id,
      amountPaise: data.link.amountPaise,
      source: "simulated",
      providerRef: `demo:${data.link.id}`,
    });
    return NextResponse.json({ ok: true, simulated: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 409 });
  }
}
