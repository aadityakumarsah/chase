import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/lib/tenancy/guard";
import {
  billingConfigured,
  productCatalogueComplete,
} from "@/lib/billing/dodo";
import {
  expireStalePendingCheckouts,
  getBillingState,
  getUsage,
} from "@/lib/billing/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current plan, usage against limits, and whether checkout is available. */
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;

  await expireStalePendingCheckouts(auth.businessId);
  const [state, usage] = await Promise.all([
    getBillingState(auth.businessId),
    getUsage(auth.businessId),
  ]);

  return NextResponse.json(
    {
      tier: state.tier,
      source: state.source,
      trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
      entitlements: state.entitlements,
      usage,
      subscription: state.subscription
        ? {
            status: state.subscription.status,
            interval: state.subscription.interval,
            currentPeriodEnd:
              state.subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: state.subscription.cancelAtPeriodEnd,
            amountMinor: state.subscription.amountMinor?.toString() ?? null,
            currency: state.subscription.currency,
          }
        : null,
      /** False when Dodo is not configured, so the UI can hide upgrade buttons. */
      checkoutAvailable: billingConfigured() && productCatalogueComplete(),
      portalAvailable: billingConfigured() && Boolean(state.dodoCustomerId),
      billingEnvironment: getEnv().DODO_PAYMENTS_ENVIRONMENT,
      role: auth.role,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
