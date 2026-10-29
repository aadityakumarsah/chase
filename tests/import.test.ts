import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseCsv,
  csvRowSchema,
  csvMoneySchema,
  CSV_HEADERS,
} from "@/lib/import/csv";
import { assertDialAllowed } from "@/lib/compliance/guards";
import { fakePhone } from "@/lib/chase/seed";
describe("CSV boundary", () => {
  const sample = readFileSync("samples/receivables-sample.csv", "utf8");
  it("accepts all ten sample rows", () => {
    const rows = parseCsv(sample);
    expect(rows).toHaveLength(10);
    for (const row of rows)
      expect(csvRowSchema.safeParse(row.value).success).toBe(true);
  });
  it("converts decimal rupees to exact integer paise", () => {
    expect(csvMoneySchema.parse("1,85,000.01")).toBe(18500001n);
    expect(csvMoneySchema.parse("0.29")).toBe(29n);
    for (const bad of ["-1", "1e5", "1.001", "1,2", "Infinity"])
      expect(csvMoneySchema.safeParse(bad).success).toBe(false);
  });
  it("rejects bad headers, malformed quoting and invalid rows", () => {
    expect(() => parseCsv("wrong\na")).toThrow();
    expect(() => parseCsv(CSV_HEADERS.join(",") + '\n"unclosed')).toThrow();
    const row = parseCsv(sample)[0].value as Record<string, string>;
    for (const patch of [
      { phone: "oops" },
      { language: "xx" },
      { paid_rupees: "99999999" },
      { invoice_date: "2026-02-30" },
      { due_date: "2000-01-01" },
    ])
      expect(csvRowSchema.safeParse({ ...row, ...patch }).success).toBe(false);
  });
  it("blocks fictional phones even if accidentally allowlisted or demo mode is off", () => {
    for (let i = 0; i < 24; i++) {
      const phone = fakePhone(i);
      expect(() =>
        assertDialAllowed(phone, { DEMO_MODE: true, CALL_ALLOWLIST: [phone] }),
      ).toThrow();
      expect(() =>
        assertDialAllowed(phone, { DEMO_MODE: false, CALL_ALLOWLIST: [] }),
      ).toThrow();
    }
  });
});
