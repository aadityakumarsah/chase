import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  businesses,
  debtors,
  calls,
  orgMembers,
  subscriptions,
} from "@/lib/db/schema";
import { IST } from "@/lib/time";
import {
  ENTITLEMENTS,
  type BillingInterval,
  type BillingTier,
  type Entitlements,
} from "./plans";

/** Subscription states that still entitle a workspace to its paid tier. */
export const LIVE_STATUSES = ["active", "past_due"] as const;

export type BillingState = {
  tier: BillingTier;
  /** Why the workspace holds this tier, for honest UI copy. */
  source: "subscription" | "trial" | "enterprise_agreement" | "free";
  trialEndsAt: Date | null;
  entitlements: Entitlements;
  subscription: {
    id: string;
    status: string;
    interval: BillingInterval;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    amountMinor: bigint | null;
    currency: string;
    dodoSubscriptionId: string | null;
  } | null;
  /** Present once the workspace has ever reached Dodo checkout. */
  dodoCustomerId: string | null;
};

/**
 * The effective tier for a workspace, with a fixed precedence:
 *
 *   1. a live Dodo subscription,
 *   2. an enterprise agreement recorded on the workspace,
 *   3. an unexpired trial, which grants Pro,
 *   4. free.
 *
 * Resolving it in one place is what stops the UI and the enforcement checks
 * from ever disagreeing about what a customer has paid for.
 */
export async function getBillingState(
  businessId: string,
): Promise<BillingState> {
  const db = getDb();
  const [[business], [live]] = await Promise.all([
    db
      .select({
        tier: businesses.billingTier,
        trialEndsAt: businesses.trialEndsAt,
        dodoCustomerId: businesses.dodoCustomerId,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId)),
    db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.businessId, businessId),
          inArray(subscriptions.status, [...LIVE_STATUSES]),
        ),
      )
      .limit(1),
  ]);

  if (!business)
    return {
      tier: "free",
      source: "free",
      trialEndsAt: null,
      entitlements: ENTITLEMENTS.free,
      subscription: null,
      dodoCustomerId: null,
    };

  const subscription = live
    ? {
        id: live.id,
        status: live.status,
        interval: live.interval,
        currentPeriodEnd: live.currentPeriodEnd,
        cancelAtPeriodEnd: live.cancelAtPeriodEnd,
        amountMinor: live.amountMinor,
        currency: live.currency,
        dodoSubscriptionId: live.dodoSubscriptionId,
      }
    : null;

  const trialActive = Boolean(
    business.trialEndsAt && business.trialEndsAt.getTime() > Date.now(),
  );

  const { tier, source }: Pick<BillingState, "tier" | "source"> = live
    ? { tier: live.tier, source: "subscription" }
    : business.tier === "enterprise"
      ? { tier: "enterprise", source: "enterprise_agreement" }
      : trialActive
        ? { tier: "pro", source: "trial" }
        : { tier: "free", source: "free" };

  return {
    tier,
    source,
    trialEndsAt: business.trialEndsAt,
    entitlements: ENTITLEMENTS[tier],
    subscription,
    dodoCustomerId: business.dodoCustomerId,
  };
}

export type UsageSnapshot = {
  debtors: number;
  callsThisMonth: number;
  seats: number;
};

/**
 * Current consumption for the three metered limits.
 *
 * The call count is scoped to the current calendar month in IST, computed in
 * Postgres so the boundary matches the figures shown elsewhere on the dashboard.
 */
export async function getUsage(businessId: string): Promise<UsageSnapshot> {
  const db = getDb();
  const monthStart = sql`date_trunc('month', now() AT TIME ZONE ${IST}) AT TIME ZONE ${IST}`;
  const [[debtorRow], [callRow], [seatRow]] = await Promise.all([
    db
      .select({ value: count() })
      .from(debtors)
      .where(eq(debtors.businessId, businessId)),
    db
      .select({ value: count() })
      .from(calls)
      .where(
        and(
          eq(calls.businessId, businessId),
          eq(calls.purpose, "collection"),
          gte(calls.createdAt, monthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.businessId, businessId),
          inArray(orgMembers.status, ["active", "invited"]),
        ),
      ),
  ]);
  return {
    debtors: Number(debtorRow?.value ?? 0),
    callsThisMonth: Number(callRow?.value ?? 0),
    seats: Number(seatRow?.value ?? 0),
  };
}

/** Records the intent to subscribe before the customer leaves for Dodo. */
export async function recordPendingCheckout(input: {
  businessId: string;
  tier: BillingTier;
  interval: BillingInterval;
  productId: string;
  checkoutSessionId: string;
  startedByUserId: string | null;
}): Promise<void> {
  await getDb()
    .insert(subscriptions)
    .values({
      businessId: input.businessId,
      tier: input.tier,
      interval: input.interval,
      status: "pending",
      dodoProductId: input.productId,
      checkoutSessionId: input.checkoutSessionId,
      startedByUserId: input.startedByUserId,
    })
    .onConflictDoNothing({ target: subscriptions.checkoutSessionId });
}

/** Clears pending rows that never completed, so the UI is not misleading. */
export async function expireStalePendingCheckouts(
  businessId: string,
  olderThanMinutes = 60,
): Promise<void> {
  await getDb()
    .update(subscriptions)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptions.businessId, businessId),
        eq(subscriptions.status, "pending"),
        isNull(subscriptions.dodoSubscriptionId),
        sql`${subscriptions.createdAt} < now() - make_interval(mins => ${olderThanMinutes})`,
      ),
    );
}

export async function setDodoCustomerId(
  businessId: string,
  customerId: string,
): Promise<string> {
  const [saved] = await getDb()
    .update(businesses)
    .set({ dodoCustomerId: customerId })
    .where(
      and(eq(businesses.id, businessId), isNull(businesses.dodoCustomerId)),
    )
    .returning({ customerId: businesses.dodoCustomerId });
  if (saved?.customerId) return saved.customerId;
  const [existing] = await getDb()
    .select({ customerId: businesses.dodoCustomerId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!existing?.customerId)
    throw new Error("Workspace billing customer could not be stored");
  return existing.customerId;
}
