import { expect, it } from "vitest";
import {
  evaluateGate,
  HARDSHIP_MIN_GAP_HOURS,
  type GateFacts,
} from "@/lib/compliance/policy";
import { formatIST } from "@/lib/time";

const ist = (value: string) => new Date(`${value}+05:30`);
const phone = "+919876543210";
const env = { DEMO_MODE: true, CALL_ALLOWLIST: [phone] };
const now = ist("2026-10-29T11:00:00");

const facts = (overrides: Partial<GateFacts> = {}): GateFacts => ({
  debtorId: "11111111-1111-4111-8111-111111111111",
  phoneE164: phone,
  status: "active",
  window: { start: "09:00", end: "18:30" },
  demoWindowOverride: false,
  maxAttemptsPerDay: 3,
  maxAttemptsPerWeek: 8,
  minGapHours: 4,
  optedOut: false,
  outstandingPaise: 1_250_000n,
  attemptsToday: 0,
  attemptsThisWeek: 0,
  oldestAttemptThisWeek: null,
  lastAttemptAt: null,
  callInFlight: false,
  activePromiseFor: null,
  ...overrides,
});

const rules = (input: Partial<GateFacts>, at = now) =>
  evaluateGate(facts(input), { now: at, env }).blocks.map((b) => b.rule);

it("allows a clean, in-window, allowlisted debtor", () => {
  const decision = evaluateGate(facts(), { now, env });
  expect(decision.allowed).toBe(true);
  expect(decision.blocks).toEqual([]);
  expect(decision.nextAllowedAt).not.toBeNull();
});

it("refuses an opt-out, a blocking status and a settled account", () => {
  expect(rules({ optedOut: true })).toContain("opted_out");
  expect(rules({ status: "do_not_contact" })).toContain("debtor_status");
  expect(rules({ status: "dispute" })).toContain("debtor_status");
  expect(rules({ status: "wrong_number" })).toContain("debtor_status");
  expect(rules({ outstandingPaise: 0n })).toContain("nothing_outstanding");
  // These never clear with time.
  expect(
    evaluateGate(facts({ optedOut: true }), { now, env }).nextAllowedAt,
  ).toBeNull();
});

it("never dials a number missing from the demo allowlist or a seed number", () => {
  expect(rules({ phoneE164: "+919812345678" })).toEqual(["not_allowlisted"]);
  expect(rules({ phoneE164: "+919000001234" })).toEqual(
    expect.arrayContaining(["reserved_number", "not_allowlisted"]),
  );
  expect(
    evaluateGate(facts({ phoneE164: "+919812345678" }), {
      now,
      env: { DEMO_MODE: false, CALL_ALLOWLIST: [] },
    }).blocks.map((b) => b.rule),
  ).toEqual([]);
});

it("enforces caps, the minimum gap and an in-flight call", () => {
  expect(rules({ attemptsToday: 3 })).toContain("daily_attempt_cap");
  expect(rules({ attemptsThisWeek: 8 })).toContain("weekly_attempt_cap");
  expect(rules({ callInFlight: true })).toContain("call_in_flight");
  expect(rules({ lastAttemptAt: ist("2026-10-29T09:00:00") })).toContain(
    "minimum_gap",
  );
  expect(rules({ lastAttemptAt: ist("2026-10-29T06:00:00") })).not.toContain(
    "minimum_gap",
  );
});

it("gives hardship a much wider gap than an ordinary account", () => {
  const lastAttemptAt = ist("2026-10-28T11:00:00");
  expect(rules({ lastAttemptAt })).not.toContain("minimum_gap");
  const hardship = evaluateGate(facts({ status: "hardship", lastAttemptAt }), {
    now,
    env,
  });
  expect(hardship.blocks.map((b) => b.rule)).toContain("minimum_gap");
  expect(hardship.blocks[0].detail.gapHours).toBe(HARDSHIP_MIN_GAP_HOURS);
});

it("waits for a pending promise instead of chasing it early", () => {
  const decision = evaluateGate(facts({ activePromiseFor: "2026-11-05" }), {
    now,
    env,
  });
  expect(decision.blocks.map((b) => b.rule)).toContain("active_promise");
  expect(formatIST(decision.nextAllowedAt!, "yyyy-MM-dd HH:mm")).toBe(
    "2026-11-06 09:00",
  );
});

it("blocks a call outside the window and reports the next allowed slot", () => {
  const evening = ist("2026-10-29T21:00:00");
  const decision = evaluateGate(facts(), { now: evening, env });
  expect(decision.blocks.map((b) => b.rule)).toEqual(["outside_window"]);
  expect(formatIST(decision.nextAllowedAt!, "yyyy-MM-dd HH:mm")).toBe(
    "2026-10-30 09:00",
  );
});

it("lets a demo override widen only up to the hard conduct limits", () => {
  const early = ist("2026-10-29T08:30:00");
  expect(rules({}, early)).toContain("outside_window");
  expect(rules({ demoWindowOverride: true }, early)).toEqual([]);
  // 19:30 IST is outside the hard limit, so the override cannot reach it.
  expect(
    rules({ demoWindowOverride: true }, ist("2026-10-29T19:30:00")),
  ).toContain("outside_window");
});
