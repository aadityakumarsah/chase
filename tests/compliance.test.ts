import { expect, it } from "vitest";
import {
  assertDialAllowed,
  isAllowedCollectionTime,
} from "@/lib/compliance/guards";
it("fails closed with an empty allowlist and checks every recipient", () => {
  expect(() =>
    assertDialAllowed("+919876543210", { DEMO_MODE: true, CALL_ALLOWLIST: [] }),
  ).toThrow();
  expect(() =>
    assertDialAllowed("+919876543210", {
      DEMO_MODE: true,
      CALL_ALLOWLIST: ["+919876543210"],
    }),
  ).not.toThrow();
  expect(() =>
    assertDialAllowed("+919876543211", {
      DEMO_MODE: true,
      CALL_ALLOWLIST: ["+919876543210"],
    }),
  ).toThrow();
  expect(() =>
    assertDialAllowed("bad", { DEMO_MODE: false, CALL_ALLOWLIST: [] }),
  ).toThrow();
});
it("enforces hard IST boundaries and default window", () => {
  expect(() => isAllowedCollectionTime(new Date(), "07:59", "18:30")).toThrow();
  expect(() => isAllowedCollectionTime(new Date(), "08:00", "19:01")).toThrow();
  expect(isAllowedCollectionTime(new Date("2026-10-29T15:30:00Z"))).toBe(false);
  expect(isAllowedCollectionTime(new Date("2026-10-29T03:30:00Z"))).toBe(true);
});
