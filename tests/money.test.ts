import { describe, expect, it } from "vitest";
import {
  formatINR,
  paiseToRupees,
  rupeesToPaise,
  spokenAmountHi,
  spokenAmountEn,
} from "@/lib/money";
describe("money", () => {
  it("converts exact decimal rupees to safe integer paise", () => {
    expect(rupeesToPaise("1234.56")).toBe(123456);
    expect(rupeesToPaise(0.29)).toBe(29);
    expect(rupeesToPaise(-0.01)).toBe(-1);
    expect(paiseToRupees(12500)).toBe(125);
  });
  it("rejects fractional paise, nonfinite and unsafe values", () => {
    for (const value of [1.001, NaN, Infinity, 1e20])
      expect(() => rupeesToPaise(value)).toThrow();
    expect(() => paiseToRupees(1.5)).toThrow();
    expect(() => rupeesToPaise("1,000")).toThrow();
  });
  it("formats Indian lakh grouping and explicit rupee speech inputs", () => {
    expect(formatINR(123456789)).toBe("₹12,34,568");
    expect(formatINR(12550, 2)).toBe("₹125.50");
    expect(spokenAmountHi(12500)).toBe("12,500 रुपये");
    expect(spokenAmountEn(12500)).toBe("12,500 rupees");
  });
});
