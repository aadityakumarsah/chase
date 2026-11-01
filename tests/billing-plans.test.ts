import { describe, expect, it } from "vitest";
import {
  ENTITLEMENTS,
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  TRIAL_ENTITLEMENTS,
  tierAtLeast,
  yearlySaving,
  yearlySavingPercent,
} from "@/lib/billing/plans";
import { manualDebtorSchema } from "@/lib/debtors/create";

describe("plan ladder", () => {
  it("never lets a lower tier out-spend a higher one", () => {
    const metered = ["debtors", "callsPerMonth", "seats"] as const;
    for (const key of metered) {
      const free = ENTITLEMENTS.free[key];
      const pro = ENTITLEMENTS.pro[key];
      expect(free).not.toBeNull();
      // Enterprise is unlimited, expressed as null.
      expect(ENTITLEMENTS.enterprise[key]).toBeNull();
      expect(pro === null || (free !== null && pro > free)).toBe(true);
    }
  });

  it("keeps the trial above free but well below Pro", () => {
    for (const key of ["debtors", "callsPerMonth", "seats"] as const) {
      const free = ENTITLEMENTS.free[key]!;
      const pro = ENTITLEMENTS.pro[key]!;
      const trial = TRIAL_ENTITLEMENTS[key]!;
      expect(trial).toBeGreaterThanOrEqual(free);
      expect(trial).toBeLessThan(pro);
    }
  });

  it("gives the trial Pro features so the product can be judged", () => {
    expect(TRIAL_ENTITLEMENTS.campaigns).toBe(true);
    expect(TRIAL_ENTITLEMENTS.dailyBrief).toBe(true);
    expect(TRIAL_ENTITLEMENTS.promptPrs).toBe(true);
  });

  it("keeps the trial short", () => {
    expect(TRIAL_DAYS).toBeGreaterThan(0);
    expect(TRIAL_DAYS).toBeLessThanOrEqual(14);
  });

  it("orders tiers by authority", () => {
    expect(tierAtLeast("pro", "free")).toBe(true);
    expect(tierAtLeast("free", "pro")).toBe(false);
    expect(tierAtLeast("enterprise", "pro")).toBe(true);
    expect(tierAtLeast("pro", "pro")).toBe(true);
  });

  it("prices the year below twelve months", () => {
    const saving = yearlySaving("pro");
    expect(saving).not.toBeNull();
    expect(saving!).toBeGreaterThan(0);
    expect(yearlySavingPercent("pro")!).toBeGreaterThan(0);
    // Tiers that are not sold self-serve have no interval pricing at all.
    expect(yearlySaving("free")).toBeNull();
    expect(yearlySaving("enterprise")).toBeNull();
  });

  it("only sells a tier that has both intervals configured", () => {
    for (const tier of PLAN_ORDER) {
      const pricing = PLANS[tier].pricing;
      if (!pricing) continue;
      expect(pricing.monthly.rupees).toBeGreaterThan(0);
      expect(pricing.yearly.rupees).toBeGreaterThan(0);
    }
  });
});

describe("adding an account by hand", () => {
  const base = {
    shopName: "Shree Ganesh Kirana",
    contactName: "Rakesh Agarwal",
    phone: "9876543210",
    consentBasis: "ledger_customer" as const,
  };

  it("normalises a bare Indian mobile number", () => {
    expect(manualDebtorSchema.parse(base).phone).toBe("+919876543210");
  });

  it("defaults language and segment but demands a consent basis", () => {
    const parsed = manualDebtorSchema.parse(base);
    expect(parsed.language).toBe("hi");
    expect(parsed.segment).toBe("other");
    expect(() =>
      manualDebtorSchema.parse({ ...base, consentBasis: undefined }),
    ).toThrow();
  });

  it("rejects a number that is not a valid Indian mobile", () => {
    expect(() =>
      manualDebtorSchema.parse({ ...base, phone: "12345" }),
    ).toThrow();
  });

  it("converts rupee input to paise", () => {
    const parsed = manualDebtorSchema.parse({
      ...base,
      invoice: {
        invoiceNo: "INV-1",
        issuedOn: "2026-10-01",
        dueOn: "2026-10-15",
        amountRupees: "1,250.50",
      },
    });
    expect(parsed.invoice!.amountRupees).toBe(125_050n);
    // Omitted paid amount means nothing has been received yet.
    expect(parsed.invoice!.paidRupees).toBe(0n);
  });

  it("refuses an invoice whose due date precedes its issue date", () => {
    expect(() =>
      manualDebtorSchema.parse({
        ...base,
        invoice: {
          invoiceNo: "INV-2",
          issuedOn: "2026-10-15",
          dueOn: "2026-10-01",
          amountRupees: "100",
        },
      }),
    ).toThrow();
  });

  it("refuses a paid amount above the invoice", () => {
    expect(() =>
      manualDebtorSchema.parse({
        ...base,
        invoice: {
          invoiceNo: "INV-3",
          issuedOn: "2026-10-01",
          dueOn: "2026-10-15",
          amountRupees: "100",
          paidRupees: "200",
        },
      }),
    ).toThrow();
  });

  it("will not record a promise with no invoice to promise against", () => {
    expect(() =>
      manualDebtorSchema.parse({
        ...base,
        promise: { amountRupees: "500", promisedFor: "2026-11-10" },
      }),
    ).toThrow();
  });

  it("will not let a promise exceed the invoice it covers", () => {
    expect(() =>
      manualDebtorSchema.parse({
        ...base,
        invoice: {
          invoiceNo: "INV-4",
          issuedOn: "2026-10-01",
          dueOn: "2026-10-15",
          amountRupees: "1000",
        },
        promise: { amountRupees: "5000", promisedFor: "2026-11-10" },
      }),
    ).toThrow();
  });
});

describe("account list filters", () => {
  it("defaults to the rating order and no promise filter", async () => {
    const { debtorFiltersSchema } = await import("@/lib/dashboard/queries");
    const parsed = debtorFiltersSchema.parse({});
    expect(parsed.sort).toBe("score");
    expect(parsed.direction).toBe("desc");
    expect(parsed.promise).toBe("any");
  });

  it("coerces rupee bounds and rejects nonsense", async () => {
    const { debtorFiltersSchema } = await import("@/lib/dashboard/queries");
    expect(debtorFiltersSchema.parse({ minRupees: "500" }).minRupees).toBe(500);
    expect(() => debtorFiltersSchema.parse({ minRupees: "abc" })).toThrow();
    expect(() => debtorFiltersSchema.parse({ minRupees: "-5" })).toThrow();
  });

  it("only accepts known sort keys", async () => {
    const { debtorFiltersSchema } = await import("@/lib/dashboard/queries");
    // A stale bookmark must not silently fall back to an arbitrary order.
    expect(() => debtorFiltersSchema.parse({ sort: "whatever" })).toThrow();
  });
});
