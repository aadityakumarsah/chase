import { expect, it } from "vitest";
import { normalisePhone, maskPhone } from "@/lib/phone";
it("normalises Indian mobile variants", () => {
  for (const phone of [
    "9876543210",
    "09876543210",
    "91 98765 43210",
    "+91 (98765) 43210",
    "00919876543210",
  ])
    expect(normalisePhone(phone)).toBe("+919876543210");
  expect(maskPhone("9876543210")).toBe("+91 98XXX XX210");
});
it("rejects ambiguous and invalid phone input", () => {
  for (const phone of [
    "",
    "12345",
    "+119876543210",
    "+91+9876543210",
    "call9876543210",
    "1234567890",
  ])
    expect(() => normalisePhone(phone)).toThrow();
});
