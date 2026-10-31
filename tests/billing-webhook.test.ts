import { afterEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import {
  parseWebhookBody,
  productInterval,
  verifyWebhook,
  WebhookRejected,
} from "@/lib/billing/webhook";
import { LIVE_STATUSES } from "@/lib/billing/subscription";

const subscription = {
  type: "subscription.active",
  timestamp: "2026-11-01T00:00:00.000Z",
  data: {
    subscription_id: "sub_fixture",
    status: "active",
    product_id: "pdt_monthly_fixture",
    metadata: { chase_business_id: "00000000-0000-4000-8000-000000000001" },
    payment_frequency_interval: "Month",
    customer: { customer_id: "cus_fixture" },
  },
};
afterEach(() => vi.unstubAllEnvs());

describe("Dodo webhook boundary", () => {
  it("accepts Dodo's subscription shape without a payload_type field", () => {
    const body = parseWebhookBody(JSON.stringify(subscription));
    expect(body.data).toMatchObject({
      subscription_id: "sub_fixture",
      status: "active",
    });
    expect(() =>
      parseWebhookBody(
        JSON.stringify({ ...subscription, data: { status: "active" } }),
      ),
    ).toThrow(WebhookRejected);
  });
  it("checks raw-body signatures before parsing or trusting metadata", () => {
    const secret = `whsec_${Buffer.from("fixture-webhook-secret").toString("base64")}`;
    vi.stubEnv("DODO_WEBHOOK_SECRET", secret);
    const raw = JSON.stringify(subscription);
    const id = "msg_fixture";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(id, timestamp, raw);
    const headers = {
      id,
      timestamp: String(Math.floor(timestamp.getTime() / 1000)),
      signature,
    };
    expect(verifyWebhook(raw, headers).type).toBe("subscription.active");
    expect(() =>
      verifyWebhook(raw.replace("active", "cancelled"), headers),
    ).toThrow(WebhookRejected);
  });
  it("only configured product ids map to paid intervals", () => {
    vi.stubEnv("DODO_PRODUCT_PRO_MONTHLY", "pdt_monthly_fixture");
    vi.stubEnv("DODO_PRODUCT_PRO_YEARLY", "pdt_yearly_fixture");
    expect(productInterval("pdt_monthly_fixture")).toBe("monthly");
    expect(productInterval("pdt_yearly_fixture")).toBe("yearly");
    expect(productInterval("pdt_other")).toBeNull();
    expect(LIVE_STATUSES).toEqual(["active", "past_due"]);
  });
});
