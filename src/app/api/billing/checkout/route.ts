import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { requireMember } from "@/lib/tenancy/guard";
import {
  BillingError,
  assertProductMatches,
  createBillingCustomer,
  createCheckoutSession,
  productIdFor,
} from "@/lib/billing/dodo";
import { BUSINESS_METADATA_KEY } from "@/lib/billing/webhook";
import {
  getBillingState,
  recordPendingCheckout,
  setDodoCustomerId,
} from "@/lib/billing/subscription";
import { BILLING_INTERVALS, SELF_SERVE_TIERS } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tier: z.enum(SELF_SERVE_TIERS),
  interval: z.enum(BILLING_INTERVALS),
});

/**
 * Starts a Dodo hosted checkout for the signed-in user's workspace.
 *
 * Only an owner or admin may commit the workspace to a payment. The workspace
 * id comes from the membership-checked session and is passed to Dodo as
 * metadata, which is how the webhook later attributes the subscription.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "owner",
  });
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid plan." },
      { status: 400 },
    );

  const { tier, interval } = parsed.data;
  const state = await getBillingState(auth.businessId);
  if (state.subscription || state.source === "enterprise_agreement")
    return NextResponse.json(
      { error: "This workspace already has an active subscription." },
      { status: 409 },
    );

  const base = new URL(getEnv().APP_BASE_URL);
  try {
    const productId = productIdFor(tier, interval);
    await assertProductMatches(tier, interval, productId);
    let customerId =
      state.dodoCustomerId ??
      (await createBillingCustomer({
        email: auth.session.user.email,
        name: auth.session.user.fullName ?? auth.session.workspace.name,
        businessId: auth.businessId,
      }));
    if (!state.dodoCustomerId)
      customerId = await setDodoCustomerId(auth.businessId, customerId);
    const session = await createCheckoutSession({
      productId,
      returnUrl: new URL("/settings/billing?checkout=done", base).toString(),
      cancelUrl: new URL(
        "/settings/billing?checkout=cancelled",
        base,
      ).toString(),
      customer: { customerId },
      metadata: {
        [BUSINESS_METADATA_KEY]: auth.businessId,
        chase_tier: tier,
        chase_interval: interval,
      },
    });

    await recordPendingCheckout({
      businessId: auth.businessId,
      tier,
      interval,
      productId,
      checkoutSessionId: session.sessionId,
      startedByUserId: auth.session.user.id,
    });

    return NextResponse.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    if (error instanceof BillingError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    // Dodo errors can quote request detail; never forward them verbatim.
    log.error("billing.checkout.failed", {
      businessId: auth.businessId,
      tier,
      interval,
    });
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 502 },
    );
  }
}
