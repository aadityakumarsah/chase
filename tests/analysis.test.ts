import { describe, it, expect } from "vitest";
import { CallAnalysisSchema } from "@/lib/analysis/schema";
import { DossierSchema } from "@/lib/dossier/schema";
import { dossierHash } from "@/lib/dossier";
import { toCallVariables, type CallDebtor } from "@/lib/dossier/call-variables";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  assertSchemaLimits,
  normalizeEnums,
  jsonSchema,
} from "@/lib/llm/shared";
const analysis = {
  connected: true,
  outcome: "opted_out",
  language_used: "hi",
  promise: { made: false, amount_rupees: 0, date: "" },
  reason_code: "unknown",
  sentiment: "negative",
  debtor_statements: ["Stop calling"],
  objections: [],
  ai_disclosed: true,
  identity_confirmed_before_dues: false,
  compliance_flags: [],
  agent_quality: { score: 4, worked: "Honored opt-out.", failed: "" },
  next_best_action: "stop_contact",
  owner_summary: "The debtor asked to stop contact.",
  dossier_update: "Requested no more calls.",
};
describe("analysis and dossier boundaries", () => {
  it("accepts explicit empty values and SDK-compatible strict schemas", () => {
    expect(CallAnalysisSchema.parse(analysis)).toEqual(analysis);
    for (const schema of [CallAnalysisSchema, DossierSchema]) {
      const format = zodOutputFormat(schema);
      expect(format.schema.additionalProperties).toBe(false);
      expect(() => assertSchemaLimits([format.schema])).not.toThrow();
    }
  });
  it("validates dates, promise consistency, sizes and quality", () => {
    for (const patch of [
      { promise: { made: true, amount_rupees: 0, date: "" } },
      { promise: { made: false, amount_rupees: 1, date: "" } },
      { promise: { made: true, amount_rupees: 50, date: "2026-02-30" } },
      { debtor_statements: Array(6).fill("fact") },
      { agent_quality: { score: 6, worked: "", failed: "" } },
      { owner_summary: "One. Two. Three." },
      { dossier_update: "1\n2\n3\n4" },
    ])
      expect(
        CallAnalysisSchema.safeParse({ ...analysis, ...patch }).success,
      ).toBe(false);
  });
  it("normalizes enum casing without altering quoted evidence", () => {
    const parsed = CallAnalysisSchema.parse(
      normalizeEnums(
        {
          ...analysis,
          outcome: "OPTED_OUT",
          debtor_statements: ["STOP Calling"],
        },
        jsonSchema(CallAnalysisSchema),
      ),
    );
    expect(parsed.outcome).toBe("opted_out");
    expect(parsed.debtor_statements[0]).toBe("STOP Calling");
  });
  it("caps dossier length and invalidates hashes when evidence changes", () => {
    const d = {
      dossier_text: "He has one broken promise.",
      preferred_language: "hi",
      best_time_window: "unknown",
      tone_hint: "Respectful",
      open_commitments: [],
      do_not_mention: [],
    };
    expect(DossierSchema.safeParse(d).success).toBe(true);
    expect(
      DossierSchema.safeParse({ ...d, dossier_text: "a".repeat(601) }).success,
    ).toBe(false);
    expect(dossierHash(d)).toBe(dossierHash({ ...d }));
    expect(dossierHash({ ...d, tone_hint: "Gentle" })).not.toBe(dossierHash(d));
  });
});
const debtor: CallDebtor = {
  id: "00000000-0000-4000-8000-000000000001",
  contactName: "Suresh Sharma",
  shopName: "Sharma General Store",
  businessName: "Shree Ganesh Traders",
  ownerName: "Rakesh Agarwal",
  outstandingPaise: 1250000n,
  daysPastDue: 34,
  invoices: [{ dueOn: "2026-09-25" }, { dueOn: "2026-10-01" }],
  lastPromise: {
    promisedFor: "2026-10-05",
    amountPaise: 500000n,
    status: "broken",
  },
};
const variables = (amount = 1250000n, language: "hi" | "en" | "mr" = "hi") =>
  toCallVariables({
    debtor: { ...debtor, outstandingPaise: amount },
    dossier: { text: "He broke a promise on the 5th." },
    rating: { score: 77 },
    callToken: "unit-test-call-token",
    language,
    today: "2026-10-29",
  });
describe("Bolna user_data", () => {
  it("returns exactly the requested short keys", () => {
    const v = variables();
    expect(Object.keys(v)).toEqual([
      "debtor_name",
      "shop_name",
      "business_name",
      "owner_name",
      "outstanding_rupees",
      "outstanding_spoken",
      "invoice_summary",
      "days_past_due",
      "last_promise_spoken",
      "dossier",
      "min_payment_rupees",
      "today_date",
      "today_spoken",
      "language",
      "account_id",
      "call_token",
    ]);
    expect(v.outstanding_rupees).toBe(12500);
    expect(v.min_payment_rupees).toBe(2500);
    expect(v.last_promise_spoken).toContain("पूरा नहीं हुआ");
    expect(v.outstanding_spoken).toBe("12,500 रुपये");
  });
  it("never asks for more than outstanding and preserves paise in speech", () => {
    for (const amount of [0n, 99n, 100n, 49999n, 50000n, 1249999n]) {
      const v = variables(amount);
      expect(v.min_payment_rupees).toBeLessThanOrEqual(Number(amount) / 100);
      expect(Number.isInteger(v.outstanding_rupees)).toBe(true);
    }
    expect(variables(1250050n).outstanding_spoken).toContain("12,500.5");
  });
  it("speaks dates and amounts in the selected language", () => {
    expect(variables(undefined, "en").today_spoken).toBe("29 October");
    expect(variables(undefined, "mr").today_spoken).toContain("ऑक्टोबर");
    expect(variables(undefined, "en").invoice_summary).toBe(
      "2 invoices, oldest due 25 September",
    );
  });
});
