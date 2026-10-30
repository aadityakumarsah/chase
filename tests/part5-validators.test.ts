import { describe, expect, it } from "vitest";
import {
  callbackSlot,
  idempotencyKey,
  secureEqual,
  validCallContext,
  validateAmount,
  validPromiseDate,
} from "@/lib/tools/validators";
describe("Part 5 tool validation", () => {
  it("compares tokens and binds fresh calls to their debtor", () => {
    const now = new Date("2026-10-30T06:00:00Z"),
      call = {
        callToken: "a".repeat(64),
        debtorId: "11111111-1111-4111-8111-111111111111",
        createdAt: new Date(now.getTime() - 44 * 60_000),
      };
    expect(secureEqual("x", "x")).toBe(true);
    expect(
      validCallContext(
        call,
        { call_token: call.callToken, account_id: call.debtorId },
        now,
      ),
    ).toBe(true);
    expect(
      validCallContext(
        { ...call, createdAt: new Date(now.getTime() - 46 * 60_000) },
        { call_token: call.callToken, account_id: call.debtorId },
        now,
      ),
    ).toBe(false);
  });
  it("normalizes idempotency arguments", () => {
    expect(idempotencyKey("x", "call", { b: 2, a: 1, call_token: "x" })).toBe(
      idempotencyKey("x", "call", { a: 1, b: 2, account_id: "y" }),
    );
  });
  it("enforces minimum and outstanding amounts", () => {
    expect(validateAmount(2000, 1250000n).valid).toBe(true);
    expect(validateAmount(100, 1250000n).valid).toBe(false);
    expect(validateAmount(12500, 1250000n).valid).toBe(true);
    expect(validateAmount(13000, 1250000n).valid).toBe(false);
  });
  it("accepts only today through thirty IST days", () => {
    const now = new Date("2026-10-30T06:00:00Z");
    expect(validPromiseDate("2026-10-30", now)).toBe(true);
    expect(validPromiseDate("2026-11-29", now)).toBe(true);
    expect(validPromiseDate("2026-11-30", now)).toBe(false);
  });
  it("moves Sunday and after-window callbacks to an allowed slot", () => {
    const now = new Date("2026-10-30T06:00:00Z"),
      slot = callbackSlot(
        "2026-11-01",
        "evening",
        { start: "09:00", end: "18:30" },
        now,
      );
    expect(slot.adjusted).toBe(true);
    expect(slot.scheduled.getUTCDay()).not.toBe(0);
  });
  it("moves a 9 pm request to the next allowed morning", () => {
    const slot = callbackSlot(
      "2026-10-30",
      "after_hours",
      { start: "09:00", end: "18:30" },
      new Date("2026-10-30T06:00:00Z"),
    );
    expect(slot.adjusted).toBe(true);
    expect(slot.requested.toISOString()).toBe("2026-10-30T15:30:00.000Z");
    expect(slot.scheduled.toISOString()).toBe("2026-10-31T04:30:00.000Z");
    expect(slot.window).toBe("morning");
  });
});
