import { describe, expect, it } from "vitest";
import { hasAtLeast, type MemberRole } from "@/lib/tenancy";
import { createWorkspaceSchema, upiVpaSchema } from "@/lib/tenancy/onboarding";
import { workspaceSettingsSchema } from "@/lib/tenancy/settings";
import { inviteSchema } from "@/lib/tenancy/team";
import { evaluateContact, type ContactInput } from "@/lib/compliance/gate";

describe("workspace roles", () => {
  it("orders authority owner > admin > operator > viewer", () => {
    const roles: MemberRole[] = ["owner", "admin", "operator", "viewer"];
    for (const role of roles) expect(hasAtLeast(role, "viewer")).toBe(true);
    expect(hasAtLeast("operator", "admin")).toBe(false);
    expect(hasAtLeast("admin", "operator")).toBe(true);
    expect(hasAtLeast("admin", "owner")).toBe(false);
    expect(hasAtLeast("owner", "owner")).toBe(true);
    expect(hasAtLeast("viewer", "operator")).toBe(false);
  });
});

describe("workspace creation input", () => {
  const base = {
    name: "Shree Ganesh Traders",
    ownerName: "Rakesh Agarwal",
    ownerPhone: "+919876543210",
    city: "Pune",
    contactPolicyAccepted: true as const,
  };

  it("accepts a complete workspace", () => {
    const parsed = createWorkspaceSchema.parse({
      ...base,
      upiVpa: "shop@okhdfcbank",
    });
    expect(parsed.defaultLanguage).toBe("hi");
    expect(parsed.upiVpa).toBe("shop@okhdfcbank");
  });

  it("requires an explicit contact-policy acceptance", () => {
    expect(() =>
      createWorkspaceSchema.parse({ ...base, contactPolicyAccepted: false }),
    ).toThrow();
  });

  it("rejects a non-E.164 owner number", () => {
    expect(() =>
      createWorkspaceSchema.parse({ ...base, ownerPhone: "9876543210" }),
    ).toThrow();
  });

  it("validates UPI addresses", () => {
    expect(upiVpaSchema.parse("shop.name-1@okaxis")).toBe("shop.name-1@okaxis");
    for (const bad of ["noatsign", "@okaxis", "shop@", "shop@123", "a@b"])
      expect(() => upiVpaSchema.parse(bad)).toThrow();
  });
});

describe("workspace settings", () => {
  it("keeps the calling window inside the statutory bounds", () => {
    expect(
      workspaceSettingsSchema.parse({
        callWindowStart: "09:00",
        callWindowEnd: "18:30",
      }).callWindowEnd,
    ).toBe("18:30");
    expect(() =>
      workspaceSettingsSchema.parse({ callWindowStart: "07:30" }),
    ).toThrow();
    expect(() =>
      workspaceSettingsSchema.parse({ callWindowEnd: "21:00" }),
    ).toThrow();
  });

  it("caps attempts within policy", () => {
    expect(() =>
      workspaceSettingsSchema.parse({ maxAttemptsPerDay: 9 }),
    ).toThrow();
    expect(
      workspaceSettingsSchema.parse({ maxAttemptsPerDay: 3 }).maxAttemptsPerDay,
    ).toBe(3);
  });

  it("allows clearing the merchant UPI id", () => {
    expect(workspaceSettingsSchema.parse({ upiVpa: null }).upiVpa).toBeNull();
  });
});

describe("invitations", () => {
  it("normalises the email and restricts assignable roles", () => {
    expect(
      inviteSchema.parse({ email: "Ops@Shop.IN", role: "operator" }).email,
    ).toBe("ops@shop.in");
    // Ownership transfers are deliberately not an invitation flow.
    expect(() =>
      inviteSchema.parse({ email: "a@b.in", role: "owner" }),
    ).toThrow();
  });
});

describe("contact permission is per workspace, not per deployment", () => {
  const input = (overrides: Partial<ContactInput> = {}): ContactInput => ({
    purpose: "collection",
    debtor: {
      status: "active",
      firstContactDisclosedAt: new Date("2026-01-01"),
    },
    business: {
      callWindowStart: "09:00",
      callWindowEnd: "18:30",
      maxAttemptsPerDay: 3,
      maxAttemptsPerWeek: 8,
      minGapHours: 4,
    },
    now: new Date("2026-11-02T06:00:00Z"), // 11:30 IST, a Monday
    toNumber: "+919876543210",
    attemptsToday: 0,
    attemptsThisWeek: 0,
    lastAttemptAt: null,
    optedOut: false,
    disputeOpen: false,
    hardship: false,
    activePromise: null,
    demoMode: false,
    allowlist: [],
    demoOverride: false,
    ...overrides,
  });

  const r1 = (decision: ReturnType<typeof evaluateContact>) =>
    decision.rules.find((rule) => rule.id === "R1_allowlist")!;

  it("blocks a debtor with no recorded basis to contact them", () => {
    const decision = evaluateContact(input({ consentBasis: null }));
    expect(r1(decision).passed).toBe(false);
    expect(decision.allowed).toBe(false);
  });

  it("allows a debtor the workspace attested at import", () => {
    const decision = evaluateContact(
      input({ consentBasis: "ledger_customer" }),
    );
    expect(r1(decision).passed).toBe(true);
    expect(decision.allowed).toBe(true);
  });

  it("still requires the demo allowlist while demo mode is on", () => {
    const blocked = evaluateContact(
      input({ demoMode: true, consentBasis: "ledger_customer", allowlist: [] }),
    );
    expect(r1(blocked).passed).toBe(false);
    const allowed = evaluateContact(
      input({
        demoMode: true,
        consentBasis: null,
        allowlist: ["+919876543210"],
      }),
    );
    expect(r1(allowed).passed).toBe(true);
  });

  it("requires a verified owner number before an owner brief call", () => {
    const unverified = evaluateContact(
      input({ purpose: "owner_brief", ownerPhoneVerified: false }),
    );
    expect(unverified.allowed).toBe(false);
    const verified = evaluateContact(
      input({ purpose: "owner_brief", ownerPhoneVerified: true }),
    );
    expect(verified.allowed).toBe(true);
  });
});
