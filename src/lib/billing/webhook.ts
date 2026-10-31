import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses, billingEvents, subscriptions } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { log } from "@/lib/log";
import type { BillingInterval } from "./plans";

/** Dodo signs the exact raw body using the Standard Webhooks headers. */
export const BUSINESS_METADATA_KEY = "chase_business_id";

const subscriptionPayloadSchema = z.looseObject({
  subscription_id: z.string().min(1),
  status: z.enum([
    "pending",
    "active",
    "on_hold",
    "paused",
    "cancelled",
    "failed",
    "expired",
    "past_due",
  ]),
  product_id: z.string().min(1),
  currency: z.string().length(3).optional(),
  recurring_pre_tax_amount: z.number().int().nonnegative().optional(),
  next_billing_date: z.string().nullable().optional(),
  cancel_at_next_billing_date: z.boolean().optional(),
  cancelled_at: z.string().nullable().optional(),
  payment_frequency_interval: z
    .enum(["Day", "Week", "Month", "Year"])
    .optional(),
  customer: z
    .object({ customer_id: z.string().min(1), email: z.string().optional() })
    .optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type SubscriptionPayload = z.infer<typeof subscriptionPayloadSchema>;
const envelopeSchema = z.looseObject({
  type: z.string().min(1),
  timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  data: z.record(z.string(), z.unknown()),
});
export type WebhookBody = {
  type: string;
  timestamp: string;
  data: SubscriptionPayload | Record<string, unknown>;
};

export class WebhookRejected extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WebhookRejected";
  }
}

export function parseWebhookBody(raw: string): WebhookBody {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new WebhookRejected("Invalid JSON", 400);
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new WebhookRejected("Unexpected payload", 400);
  if (!envelope.data.type.startsWith("subscription.")) return envelope.data;
  // Current Dodo subscription payloads have no `payload_type` discriminator.
  const parsed = subscriptionPayloadSchema.safeParse(envelope.data.data);
  if (!parsed.success)
    throw new WebhookRejected("Unexpected subscription payload", 400);
  return { ...envelope.data, data: parsed.data };
}

export function verifyWebhook(
  raw: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  },
): WebhookBody {
  const secret = getEnv().DODO_WEBHOOK_SECRET;
  if (!secret) throw new WebhookRejected("Billing webhook not configured", 503);
  if (!headers.id || !headers.timestamp || !headers.signature)
    throw new WebhookRejected("Missing signature headers", 401);
  try {
    new Webhook(secret).verify(raw, {
      "webhook-id": headers.id,
      "webhook-timestamp": headers.timestamp,
      "webhook-signature": headers.signature,
    });
  } catch {
    throw new WebhookRejected("Invalid signature", 401);
  }
  return parseWebhookBody(raw);
}

function isSubscription(
  body: WebhookBody,
): body is WebhookBody & { data: SubscriptionPayload } {
  return body.type.startsWith("subscription.");
}

/** Only an explicitly configured product can ever grant a paid plan. */
export function productInterval(productId: string): BillingInterval | null {
  const env = getEnv();
  if (
    env.DODO_PRODUCT_PRO_MONTHLY &&
    productId === env.DODO_PRODUCT_PRO_MONTHLY
  )
    return "monthly";
  if (env.DODO_PRODUCT_PRO_YEARLY && productId === env.DODO_PRODUCT_PRO_YEARLY)
    return "yearly";
  return null;
}

async function resolveBusinessId(
  payload: SubscriptionPayload,
): Promise<string | null> {
  const db = getDb();
  const [linked] = await db
    .select({ businessId: subscriptions.businessId })
    .from(subscriptions)
    .where(eq(subscriptions.dodoSubscriptionId, payload.subscription_id))
    .limit(1);
  const claimed = payload.metadata?.[BUSINESS_METADATA_KEY];
  // A subscription already linked to A must never be reassigned to B by metadata.
  if (linked)
    return claimed && claimed !== linked.businessId ? null : linked.businessId;
  const customerId = payload.customer?.customer_id;
  const matched = customerId
    ? await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.dodoCustomerId, customerId))
        .limit(2)
    : [];
  if (matched.length > 1) return null;
  if (matched.length === 1)
    return claimed && claimed !== matched[0].id ? null : matched[0].id;
  if (!claimed || !z.uuid().safeParse(claimed).success) return null;
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.id, claimed))
    .limit(1);
  return business?.id ?? null;
}

/** Active subscriptions and a still-valid past-due grace period retain access. */
const ENTITLING = new Set(["active", "past_due"]);

export async function applyWebhook(
  body: WebhookBody,
  webhookId: string,
): Promise<{ handled: boolean; businessId: string | null }> {
  const payload = isSubscription(body) ? body.data : null;
  const interval = payload ? productInterval(payload.product_id) : null;
  const businessId =
    payload && interval ? await resolveBusinessId(payload) : null;
  const occurredAt = new Date(body.timestamp);
  const db = getDb();
  let changed = false;
  const result = await db.transaction(async (tx) => {
    // Insert and apply in one transaction: if state application fails, Dodo's
    // retry can insert this id again instead of being discarded as a duplicate.
    const [event] = await tx
      .insert(billingEvents)
      .values({
        businessId,
        dodoWebhookId: webhookId,
        type: body.type,
        payloadType: payload ? "Subscription" : null,
        dodoSubscriptionId: payload?.subscription_id ?? null,
        occurredAt,
        payload: body as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: billingEvents.dodoWebhookId })
      .returning({ id: billingEvents.id });
    if (!event) return { handled: false, businessId };
    if (!payload || !businessId || !interval) {
      await tx
        .update(billingEvents)
        .set({
          handledAt: new Date(),
          ...(payload && !interval
            ? { error: "Unrecognized billing product" }
            : {}),
        })
        .where(eq(billingEvents.id, event.id));
      return { handled: false, businessId };
    }
    const [existing] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.businessId, businessId),
          or(
            eq(subscriptions.dodoSubscriptionId, payload.subscription_id),
            and(
              eq(subscriptions.status, "pending"),
              isNull(subscriptions.dodoSubscriptionId),
              eq(subscriptions.dodoProductId, payload.product_id),
            ),
          ),
        ),
      )
      .orderBy(subscriptions.createdAt)
      .limit(1);
    if (existing?.lastDodoEventAt && existing.lastDodoEventAt > occurredAt) {
      await tx
        .update(billingEvents)
        .set({ handledAt: new Date() })
        .where(eq(billingEvents.id, event.id));
      return { handled: false, businessId };
    }
    const nextBilling = payload.next_billing_date
      ? new Date(payload.next_billing_date)
      : null;
    const cancelledAt = payload.cancelled_at
      ? new Date(payload.cancelled_at)
      : null;
    const values = {
      tier: "pro" as const,
      interval,
      status: payload.status,
      dodoSubscriptionId: payload.subscription_id,
      dodoProductId: payload.product_id,
      dodoCustomerId:
        payload.customer?.customer_id ?? existing?.dodoCustomerId ?? null,
      amountMinor:
        payload.recurring_pre_tax_amount == null
          ? null
          : BigInt(payload.recurring_pre_tax_amount),
      currency: payload.currency?.toUpperCase() ?? "INR",
      currentPeriodEnd:
        nextBilling && !Number.isNaN(nextBilling.getTime())
          ? nextBilling
          : null,
      cancelAtPeriodEnd: payload.cancel_at_next_billing_date ?? false,
      cancelledAt:
        cancelledAt && !Number.isNaN(cancelledAt.getTime())
          ? cancelledAt
          : null,
      lastDodoEventAt: occurredAt,
    };
    if (existing)
      await tx
        .update(subscriptions)
        .set(values)
        .where(eq(subscriptions.id, existing.id));
    else await tx.insert(subscriptions).values({ businessId, ...values });
    const [workspace] = await tx
      .select({ tier: businesses.billingTier })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    // An independently contracted Enterprise agreement is never downgraded by
    // an unrelated Pro subscription cancellation.
    await tx
      .update(businesses)
      .set({
        billingTier:
          workspace?.tier === "enterprise"
            ? "enterprise"
            : ENTITLING.has(payload.status)
              ? "pro"
              : "free",
        billingTierUpdatedAt: new Date(),
        ...(payload.customer?.customer_id
          ? { dodoCustomerId: payload.customer.customer_id }
          : {}),
      })
      .where(eq(businesses.id, businessId));
    await tx
      .update(billingEvents)
      .set({ handledAt: new Date() })
      .where(eq(billingEvents.id, event.id));
    changed = true;
    return { handled: true, businessId };
  });
  if (changed && payload && businessId) {
    // Audit feed failure must not cause Dodo to retry a committed billing update.
    try {
      await emitEvent("billing.subscription.updated", {
        businessId,
        payload: {
          dodoEvent: body.type,
          status: payload.status,
          tier: "pro",
          interval,
        },
      });
    } catch {
      log.warn("billing.audit_feed_failed", { businessId });
    }
  }
  return result;
}
