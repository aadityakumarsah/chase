import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { requireMember } from "@/lib/tenancy/guard";
import { BillingError, createPortalSession } from "@/lib/billing/dodo";
import { getBillingState } from "@/lib/billing/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the customer to Dodo's own portal for cards, invoices and cancellation.
 * Chase deliberately does not rebuild any of that surface.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "owner",
  });
  if (!auth.ok) return auth.response;

  const state = await getBillingState(auth.businessId);
  if (!state.dodoCustomerId)
    return NextResponse.json(
      { error: "This workspace has no billing account yet." },
      { status: 409 },
    );

  try {
    const link = await createPortalSession(
      state.dodoCustomerId,
      new URL("/settings/billing", getEnv().APP_BASE_URL).toString(),
    );
    return NextResponse.json({ portalUrl: link });
  } catch (error) {
    if (error instanceof BillingError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    log.error("billing.portal.failed", { businessId: auth.businessId });
    return NextResponse.json(
      { error: "Could not open the billing portal." },
      { status: 502 },
    );
  }
}
