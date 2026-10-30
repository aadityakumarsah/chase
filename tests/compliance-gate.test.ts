import { describe, expect, it } from "vitest";
import {
  CONTACT_RULE_IDS,
  evaluateContact,
  type ContactInput,
} from "@/lib/compliance/gate";

const atIst = (day: string, clock: string) =>
  new Date(`${day}T${clock}:00+05:30`);
const base: ContactInput = {
  purpose: "collection",
  debtor: { status: "active", firstContactDisclosedAt: new Date() },
  business: {
    callWindowStart: "09:00",
    callWindowEnd: "18:30",
    maxAttemptsPerDay: 3,
    maxAttemptsPerWeek: 8,
    minGapHours: 4,
  },
  now: atIst("2026-10-30", "18:29"),
  toNumber: "+919812345678",
  attemptsToday: 0,
  attemptsThisWeek: 0,
  lastAttemptAt: null,
  optedOut: false,
  disputeOpen: false,
  hardship: false,
  activePromise: null,
  demoMode: true,
  allowlist: ["+919812345678"],
  demoOverride: false,
};
const failed = (input: ContactInput) =>
  evaluateContact(input)
    .rules.filter((rule) => !rule.passed)
    .map((rule) => rule.id);

describe("contact compliance gate", () => {
  it("reports every rule in order", () => {
    expect(evaluateContact(base).rules.map((rule) => rule.id)).toEqual(
      CONTACT_RULE_IDS,
    );
  });

  it.each([
    ["18:29", true],
    ["18:31", false],
    ["07:59", false],
    ["19:00", false],
  ])("enforces the IST boundary at %s", (clock, allowed) => {
    expect(
      evaluateContact({ ...base, now: atIst("2026-10-30", clock) }).allowed,
    ).toBe(allowed);
  });

  it("enforces hard limits even with a wider business window", () => {
    const input = {
      ...base,
      now: atIst("2026-10-30", "19:00"),
      business: {
        ...base.business,
        callWindowStart: "00:00",
        callWindowEnd: "23:59",
      },
    };
    expect(failed(input)).toContain("R5_calling_window");
    expect(evaluateContact(input).nextAllowedAt?.toISOString()).toBe(
      atIst("2026-10-31", "08:00").toISOString(),
    );
  });

  it("blocks Sunday and chooses Monday morning", () => {
    const decision = evaluateContact({
      ...base,
      now: atIst("2026-11-01", "11:00"),
    });
    expect(decision.nextAllowedAt?.toISOString()).toBe(
      atIst("2026-11-02", "09:00").toISOString(),
    );
  });

  it.each([
    ["R1_allowlist", { allowlist: [] }],
    ["R2_opt_out", { optedOut: true }],
    ["R3_dispute_hold", { disputeOpen: true }],
    [
      "R4_wrong_number",
      { debtor: { status: "wrong_number", firstContactDisclosedAt: null } },
    ],
    ["R6_attempts_per_day", { attemptsToday: 3 }],
    ["R7_attempts_per_week", { attemptsThisWeek: 8 }],
    ["R8_min_gap", { lastAttemptAt: atIst("2026-10-30", "17:29") }],
    [
      "R9_hardship_gap",
      { hardship: true, lastAttemptAt: atIst("2026-10-29", "18:29") },
    ],
    ["R10_promise_pending", { activePromise: { date: "2026-11-05" } }],
  ] as const)("evaluates %s", (rule, patch) => {
    expect(failed({ ...base, ...patch })).toContain(rule);
  });

  it("allows a day-before promise reminder", () => {
    expect(
      evaluateContact({ ...base, activePromise: { date: "2026-10-31" } })
        .allowed,
    ).toBe(true);
  });

  it("requires a disclosure action without blocking the dial", () => {
    const decision = evaluateContact({
      ...base,
      debtor: { ...base.debtor, firstContactDisclosedAt: null },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rules.at(-1)?.detail).toBe("send before dialing");
  });

  it("returns the latest clearing time for combined time rules", () => {
    const decision = evaluateContact({
      ...base,
      now: atIst("2026-10-30", "19:30"),
      attemptsToday: 3,
      lastAttemptAt: atIst("2026-10-30", "18:00"),
      hardship: true,
    });
    expect(decision.nextAllowedAt?.toISOString()).toBe(
      atIst("2026-11-02", "18:00").toISOString(),
    );
  });

  it("uses a visible demo override only for an allowlisted number", () => {
    const decision = evaluateContact({
      ...base,
      now: atIst("2026-10-30", "21:00"),
      demoOverride: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.demoOverrideUsed).toBe(true);
    expect(decision.rules[4]?.detail).toBe("demo override: consenting tester");
  });

  it("owner briefs skip R2-R11 but still require R1", () => {
    expect(
      evaluateContact({ ...base, purpose: "owner_brief", optedOut: true })
        .allowed,
    ).toBe(true);
    expect(
      evaluateContact({ ...base, purpose: "owner_brief", allowlist: [] })
        .allowed,
    ).toBe(false);
  });
});
