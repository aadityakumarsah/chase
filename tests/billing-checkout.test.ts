import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import {
  createCheckoutSession,
  createBillingCustomer,
} from "@/lib/billing/dodo";
import {
  getBillingState,
  recordPendingCheckout,
  setDodoCustomerId,
} from "@/lib/billing/subscription";

const workspace = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/tenancy/guard", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_BASE_URL: "https://chase.example.com" }),
}));
vi.mock("@/lib/billing/dodo", () => ({
  BillingError: class BillingError extends Error {
    status = 400;
  },
  productIdFor: vi.fn(() => "pdt_monthly_fixture"),
  assertProductMatches: vi.fn(async () => {}),
  createBillingCustomer: vi.fn(async () => "cus_fixture"),
  createCheckoutSession: vi.fn(async () => ({
    sessionId: "cks_fixture",
    checkoutUrl: "https://checkout.dodopayments.com/session/fixture",
  })),
}));
vi.mock("@/lib/billing/subscription", () => ({
  getBillingState: vi.fn(async () => ({
    source: "free",
    subscription: null,
    dodoCustomerId: null,
  })),
  setDodoCustomerId: vi.fn(async () => "cus_fixture"),
  recordPendingCheckout: vi.fn(async () => {}),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireMember).mockResolvedValue({
    ok: true,
    businessId: workspace,
    role: "owner",
    session: {
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "owner@example.com",
        fullName: "Owner",
      },
      workspace: { name: "Fixture Traders" },
    },
  } as never);
});

describe("Dodo checkout boundary", () => {
  it("uses only the membership-checked workspace and waits for a webhook", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new NextRequest("https://chase.example.com/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          tier: "pro",
          interval: "monthly",
          businessId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkoutUrl: "https://checkout.dodopayments.com/session/fixture",
    });
    expect(createBillingCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: workspace }),
    );
    expect(setDodoCustomerId).toHaveBeenCalledWith(workspace, "cus_fixture");
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ chase_business_id: workspace }),
        customer: { customerId: "cus_fixture" },
      }),
    );
    expect(recordPendingCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: workspace,
        checkoutSessionId: "cks_fixture",
      }),
    );
    expect(requireMember).toHaveBeenCalledWith(expect.anything(), {
      mutation: true,
      minRole: "owner",
    });
  });
  it("does not create another checkout for a paid workspace", async () => {
    vi.mocked(getBillingState).mockResolvedValueOnce({
      source: "subscription",
      subscription: { status: "active" },
      dodoCustomerId: "cus_fixture",
    } as never);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(
      new NextRequest("https://chase.example.com/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "pro", interval: "yearly" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
