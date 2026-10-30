import { createHmac } from "node:crypto";
import { z } from "zod";
import { getEnv, type Env } from "@/lib/env";
import { secureEqual } from "@/lib/tools/validators";
export function validSignature(
  raw: string,
  signature: string | null,
  secret: string | undefined,
) {
  return (
    !!secret &&
    !!signature &&
    /^[a-f0-9]{64}$/i.test(signature) &&
    secureEqual(
      createHmac("sha256", secret).update(raw).digest("hex"),
      signature.toLowerCase(),
    )
  );
}
export const razorpayPaidSchema = z.object({
  event: z.literal("payment_link.paid"),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount: z.number().int().positive().safe(),
        currency: z.literal("INR"),
        status: z.literal("captured"),
      }),
    }),
    payment_link: z.object({
      entity: z.object({
        id: z.string().min(1),
        reference_id: z.uuid(),
        amount: z.number().int().positive().safe(),
        amount_paid: z.number().int().positive().safe(),
        currency: z.literal("INR"),
        status: z.literal("paid"),
      }),
    }),
  }),
});
export function razorpayRequest(
  input: {
    id: string;
    token: string;
    amountPaise: bigint;
    name: string;
    contact: string;
    isDemo: boolean;
  },
  env: Env = getEnv(),
) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)
    throw new Error("Razorpay not configured");
  if (input.isDemo && !env.RAZORPAY_KEY_ID.startsWith("rzp_test_"))
    throw new Error("Demo requires Razorpay test mode");
  const amount = z
    .number()
    .int()
    .positive()
    .safe()
    .parse(Number(input.amountPaise));
  return {
    amount,
    currency: "INR",
    accept_partial: false,
    reference_id: input.id,
    customer: { name: input.name, contact: input.contact },
    notify: { sms: false, email: false },
    reminder_enable: false,
    callback_url: `${env.APP_BASE_URL}/pay/${input.token}/done`,
    callback_method: "get",
    expire_by: Math.floor(Date.now() / 1000) + 24 * 3600,
  };
}
export async function createRazorpayLink(
  input: Parameters<typeof razorpayRequest>[0],
) {
  const env = getEnv();
  const body = razorpayRequest(input, env);
  const r = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("Razorpay create failed");
  return z
    .object({ id: z.string(), short_url: z.url({ protocol: /^https$/ }) })
    .parse(await r.json());
}
export async function cancelRazorpayLink(id: string) {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return;
  await fetch(
    `https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
          ).toString("base64"),
      },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
}
