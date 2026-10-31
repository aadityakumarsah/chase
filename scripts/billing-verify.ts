import { loadEnvConfig } from "@next/env";
import DodoPayments from "dodopayments";
import { z } from "zod";
import { getEnv } from "../src/lib/env";
import { PLANS } from "../src/lib/billing/plans";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

const productSchema = z.object({
  is_recurring: z.boolean(),
  price: z.object({
    type: z.string(),
    currency: z.string(),
    price: z.number().int(),
    payment_frequency_count: z.number().int().optional(),
    payment_frequency_interval: z.string().optional(),
  }),
});
async function main() {
  const env = getEnv();
  const missing = [
    "DODO_PAYMENTS_API_KEY",
    "DODO_WEBHOOK_SECRET",
    "DODO_PRODUCT_PRO_MONTHLY",
    "DODO_PRODUCT_PRO_YEARLY",
  ].filter((key) => !env[key as keyof typeof env]);
  if (missing.length)
    throw new Error(`Missing billing keys: ${missing.join(", ")}`);
  const client = new DodoPayments({
    bearerToken: env.DODO_PAYMENTS_API_KEY!,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
    timeout: 15000,
    maxRetries: 1,
  });
  for (const interval of ["monthly", "yearly"] as const) {
    const pricing = PLANS.pro.pricing![interval];
    const raw = await client.products.retrieve(env[pricing.productEnvKey]!);
    const product = productSchema.parse(raw);
    const expectedFrequency = interval === "monthly" ? "Month" : "Year";
    const valid =
      product.is_recurring &&
      product.price.type === "recurring_price" &&
      product.price.currency === "INR" &&
      product.price.price === pricing.rupees * 100 &&
      product.price.payment_frequency_count === 1 &&
      product.price.payment_frequency_interval === expectedFrequency;
    if (!valid)
      throw new Error(
        `Pro ${interval}: Dodo product does not match displayed INR price or billing interval`,
      );
    console.log(`✓ Pro ${interval}: recurring INR price and frequency match`);
  }
  console.log(
    `✓ Dodo ${env.DODO_PAYMENTS_ENVIRONMENT} catalogue verified. No checkout or charge was created.`,
  );
}
void main().catch(() => {
  console.error(
    "Billing verification failed. Check product IDs, environment, INR price, interval, and API access; no secret values were printed.",
  );
  process.exitCode = 1;
});
