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
  const failures: string[] = [];
  for (const interval of ["monthly", "yearly"] as const) {
    const pricing = PLANS.pro.pricing![interval];
    let raw: unknown;
    try {
      raw = await client.products.retrieve(env[pricing.productEnvKey]!);
    } catch (error) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : null;
      failures.push(
        `Pro ${interval}: product lookup failed${status ? ` (HTTP ${status})` : ""}. Check the API key, environment and product ID.`,
      );
      continue;
    }
    const parsed = productSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push(
        `Pro ${interval}: product response does not match the expected Dodo product shape.`,
      );
      continue;
    }
    const product = parsed.data;
    const expectedFrequency = interval === "monthly" ? "Month" : "Year";
    const valid =
      product.is_recurring &&
      product.price.type === "recurring_price" &&
      product.price.currency === "INR" &&
      product.price.price === pricing.rupees * 100 &&
      product.price.payment_frequency_count === 1 &&
      product.price.payment_frequency_interval === expectedFrequency;
    if (!valid) {
      const wrong: string[] = [];
      if (!product.is_recurring || product.price.type !== "recurring_price")
        wrong.push("recurring type");
      if (product.price.currency !== "INR") wrong.push("INR currency");
      if (product.price.price !== pricing.rupees * 100) wrong.push("price");
      if (
        product.price.payment_frequency_count !== 1 ||
        product.price.payment_frequency_interval !== expectedFrequency
      )
        wrong.push("billing frequency");
      failures.push(
        `Pro ${interval}: product mismatch in ${wrong.join(", ")}.`,
      );
      continue;
    }
    console.log(`✓ Pro ${interval}: recurring INR price and frequency match`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(
    `✓ Dodo ${env.DODO_PAYMENTS_ENVIRONMENT} catalogue verified. No checkout or charge was created.`,
  );
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && /^Pro (monthly|yearly): /.test(error.message)
      ? error.message
      : "Billing verification failed. Check required keys and product access.",
  );
  process.exitCode = 1;
});
