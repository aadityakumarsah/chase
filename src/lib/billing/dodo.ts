import DodoPayments from "dodopayments";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  PLANS,
  type BillingInterval,
  type SelfServeTier,
  type PlanPricing,
} from "./plans";

/**
 * Dodo Payments access. Billing is optional configuration: Chase runs fine with
 * no Dodo keys (every workspace simply stays on its free or trial entitlement),
 * so every entry point here reports absence rather than throwing at import time.
 */

/** Raised for conditions a caller is expected to turn into a 4xx/5xx response. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export function billingConfigured(): boolean {
  const env = getEnv();
  // Checkout must never sell a plan that cannot be activated by its webhook.
  return Boolean(env.DODO_PAYMENTS_API_KEY && env.DODO_WEBHOOK_SECRET);
}

export function billingLive(): boolean {
  return getEnv().DODO_PAYMENTS_ENVIRONMENT === "live_mode";
}

let client: DodoPayments | null = null;

function dodo(): DodoPayments {
  const env = getEnv();
  if (!billingConfigured())
    throw new BillingError("Billing is not configured.", 503);
  // The SDK reads DODO_PAYMENTS_API_KEY from the environment itself, but passing
  // it explicitly keeps the alias handling in src/lib/env.ts authoritative.
  client ??= new DodoPayments({
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
    maxRetries: 2,
    timeout: 15_000,
  });
  return client;
}

/** Resolves the configured Dodo product id for a tier and interval. */
export function productIdFor(
  tier: SelfServeTier,
  interval: BillingInterval,
): string {
  const pricing: Record<BillingInterval, PlanPricing> | null =
    PLANS[tier].pricing;
  if (!pricing) throw new BillingError(`${tier} is not sold self-serve.`, 400);
  const key = pricing[interval].productEnvKey;
  const productId = getEnv()[key];
  if (!productId)
    throw new BillingError(
      `No Dodo product is configured for ${tier} ${interval}.`,
      503,
    );
  return productId;
}

/** True when both intervals of every self-serve tier have a product id. */
export function productCatalogueComplete(): boolean {
  const env = getEnv();
  return Boolean(env.DODO_PRODUCT_PRO_MONTHLY && env.DODO_PRODUCT_PRO_YEARLY);
}

const dodoProductSchema = z.object({
  is_recurring: z.boolean(),
  price: z.object({
    type: z.string(),
    currency: z.string(),
    price: z.number().int(),
    payment_frequency_count: z.number().int().optional(),
    payment_frequency_interval: z.string().optional(),
  }),
});

/** Never send an owner to a checkout priced differently from the Chase page. */
export async function assertProductMatches(
  tier: SelfServeTier,
  interval: BillingInterval,
  productId: string,
): Promise<void> {
  const product = dodoProductSchema.safeParse(
    await dodo().products.retrieve(productId),
  );
  const pricing = PLANS[tier].pricing?.[interval];
  const price = product.data?.price;
  if (
    !product.success ||
    !pricing ||
    !product.data.is_recurring ||
    price?.type !== "recurring_price" ||
    price.currency !== "INR" ||
    price.price !== pricing.rupees * 100 ||
    price.payment_frequency_count !== 1 ||
    price.payment_frequency_interval !==
      (interval === "monthly" ? "Month" : "Year")
  )
    throw new BillingError(
      "The Dodo product price does not match this plan. Checkout is paused.",
      503,
    );
}

export type CheckoutRequest = {
  productId: string;
  returnUrl: string;
  cancelUrl: string;
  customer: { email: string; name?: string } | { customerId: string };
  /** Travels with the subscription and comes back on every webhook. */
  metadata: Record<string, string>;
  trialPeriodDays?: number;
};

/** One Dodo customer per workspace makes renewal webhooks attributable even
 * when checkout metadata is not copied onto the subscription payload. */
export async function createBillingCustomer(input: {
  email: string;
  name: string;
  businessId: string;
}): Promise<string> {
  const customer = await dodo().customers.create({
    email: input.email,
    name: input.name,
    metadata: { chase_business_id: input.businessId },
  });
  return customer.customer_id;
}

/**
 * Creates a hosted checkout session and returns the URL to send the browser to.
 *
 * Uses POST /checkouts: Dodo deprecated POST /subscriptions for new integrations
 * and routes subscription creation through a checkout session instead.
 */
export async function createCheckoutSession(
  request: CheckoutRequest,
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const session = await dodo().checkoutSessions.create({
    product_cart: [{ product_id: request.productId, quantity: 1 }],
    customer:
      "customerId" in request.customer
        ? { customer_id: request.customer.customerId }
        : { email: request.customer.email, name: request.customer.name },
    // India-first product: default the billing country so the common case is
    // one fewer field, while leaving the customer free to change it.
    billing_address: { country: "IN" },
    billing_currency: "INR",
    return_url: request.returnUrl,
    cancel_url: request.cancelUrl,
    metadata: request.metadata,
    // Always offer cards as the fallback: if every listed method is unavailable
    // the session fails outright.
    allowed_payment_method_types: [
      "upi_intent",
      "upi_collect",
      "credit",
      "debit",
    ],
    ...(request.trialPeriodDays
      ? { subscription_data: { trial_period_days: request.trialPeriodDays } }
      : {}),
  });
  if (!session.checkout_url)
    throw new BillingError("Dodo returned no checkout URL.", 502);
  return { sessionId: session.session_id, checkoutUrl: session.checkout_url };
}

/**
 * A link to Dodo's own customer portal, where a customer can change their card,
 * see invoices or cancel. Chase deliberately does not rebuild any of that.
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await dodo().customers.customerPortal.create(customerId, {
    return_url: returnUrl,
  });
  if (!session.link)
    throw new BillingError("Dodo returned no portal link.", 502);
  return session.link;
}

/** Marks a subscription to stop at the end of the period the customer paid for. */
export async function cancelAtPeriodEnd(subscriptionId: string): Promise<void> {
  await dodo().subscriptions.update(subscriptionId, {
    cancel_at_next_billing_date: true,
    cancel_reason: "cancelled_by_customer",
  });
}

/** Undoes a pending cancellation while the subscription is still live. */
export async function resumeSubscription(
  subscriptionId: string,
): Promise<void> {
  await dodo().subscriptions.update(subscriptionId, {
    cancel_at_next_billing_date: false,
  });
}

/** Authoritative current state, used to reconcile after a return from checkout. */
export async function fetchSubscription(subscriptionId: string) {
  return dodo().subscriptions.retrieve(subscriptionId);
}
