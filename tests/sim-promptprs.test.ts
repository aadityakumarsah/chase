import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { InMemoryToolMock } from "@/lib/sim/tools";
import {
  complianceRegressed,
  validatePromptPR,
} from "@/lib/promptprs/validation";
import { PromptPRSchema } from "@/lib/promptprs/types";

const base = readFileSync(
  path.join(process.cwd(), "prompts/collections.v1.md"),
  "utf8",
);
const callId = "11111111-1111-4111-8111-111111111111";

function draft(overrides: Record<string, unknown> = {}) {
  return PromptPRSchema.parse({
    title: "Lead with empathy before the amount",
    problem: "The agent moved to the amount before acknowledging the caller.",
    evidence: [
      { call_id: callId, quote: "Please listen first", outcome: "hardship" },
      {
        call_id: callId,
        quote: "I need some time",
        outcome: "callback_requested",
      },
    ],
    change: {
      section_id: "flow",
      old_text:
        "3. Ask an open question about what is possible for them today or by a date.",
      new_text:
        "3. Acknowledge what they said, then ask an open question about what is possible today or by a date.",
    },
    expected_impact: "More callers feel heard before discussing options.",
    risk: "The acknowledgement could make one turn slightly longer.",
    confidence: "medium",
    ...overrides,
  });
}

const evidence = [
  { id: callId, transcript: "Please listen first. I need some time." },
];

describe("persona simulator and Prompt PR guardrails", () => {
  it("reuses real tool validators in the in-memory mock", () => {
    const mock = new InMemoryToolMock();
    const common = {
      account_id: mock.defaults().account_id,
      call_token: mock.defaults().call_token,
    };
    expect(
      mock.run("send_payment_link", { ...common, amount_rupees: 2000 }).ok,
    ).toBe(true);
    expect(
      mock.run("record_promise_to_pay", {
        ...common,
        amount_rupees: 3000,
        promise_date: "2026-11-07",
        reason_code: "salary_delay",
      }).ok,
    ).toBe(true);
    expect(() =>
      mock.run("send_payment_link", { ...common, amount_rupees: -1 }),
    ).toThrow();
  });

  it("accepts a small non-protected evidence-backed edit", () => {
    const result = validatePromptPR(base, draft(), evidence);
    expect(result.ok).toBe(true);
    expect(result.candidate).toContain("Acknowledge what they said");
  });

  it("rejects protected edits, removed variables and invented quotes", () => {
    const protectedEdit = draft({
      change: {
        section_id: "protected:compliance",
        old_text: "NON-NEGOTIABLE RULES.",
        new_text: "RULES.",
      },
    });
    expect(validatePromptPR(base, protectedEdit, evidence).errors).toContain(
      "Protected sections cannot be edited.",
    );
    const fakeQuote = draft({
      evidence: [
        { call_id: callId, quote: "invented quote", outcome: "hardship" },
        {
          call_id: callId,
          quote: "I need some time",
          outcome: "callback_requested",
        },
      ],
    });
    expect(
      validatePromptPR(base, fakeQuote, evidence).errors.some((error) =>
        error.includes("not verbatim"),
      ),
    ).toBe(true);
  });

  it("detects any compliance or tone regression", () => {
    const passing = {
      results: [
        {
          persona: "angry_opt_out",
          judge: { opt_out_respected: true, tone: 5 },
        },
      ],
    };
    const regressed = {
      results: [
        {
          persona: "angry_opt_out",
          judge: { opt_out_respected: false, tone: 4 },
        },
      ],
    };
    expect(complianceRegressed(passing, regressed)).toBe(true);
    expect(complianceRegressed(passing, passing)).toBe(false);
  });
});
