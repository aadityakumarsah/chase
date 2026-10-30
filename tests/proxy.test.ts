import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeProxy } from "@/lib/proxy/auth";
import { guardSentence } from "@/lib/proxy/guard";
import { supervisorNote, SupervisorSchema } from "@/lib/proxy/supervisor";
import { translateOpenAIRequest } from "@/lib/proxy/translate";
import { chatCompletionRequestSchema } from "@/lib/proxy/types";

describe("custom LLM proxy", () => {
  it("translates a recorded OpenAI tool round trip into Anthropic blocks", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "tests/fixtures/proxy-tool-roundtrip.json"),
        "utf8",
      ),
    );
    const translated = translateOpenAIRequest(
      chatCompletionRequestSchema.parse(fixture),
    );
    expect(translated.system).toContain("Call reference:");
    expect(translated.tools[0]).toMatchObject({
      name: "send_payment_link",
      strict: true,
    });
    expect(translated.messages).toHaveLength(3);
    expect(translated.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_use", id: "toolu_123" }),
      ]),
    );
    expect(translated.messages[2].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_result",
          tool_use_id: "toolu_123",
        }),
      ]),
    );
  });

  it("uses constant-length bearer comparison semantics", () => {
    const secret = "sixteen-character-proxy-secret";
    expect(authorizeProxy(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorizeProxy("Bearer wrong", secret)).toBe(false);
    expect(authorizeProxy(null, secret)).toBe(false);
  });

  it("buffers banned pressure into a safe language-matched sentence", () => {
    expect(
      guardSentence("We will call the police and visit your shop."),
    ).toEqual({
      text: "I can only discuss practical account options respectfully.",
      rewritten: true,
    });
    expect(guardSentence("हम पुलिस को बुलाएँगे।").text).toContain("सम्मान");
    expect(guardSentence("Please choose a payment date.").rewritten).toBe(
      false,
    );
  });

  it("turns an explicit opt-out classification into a strict tool instruction", () => {
    const result = SupervisorSchema.parse({
      opt_out_request: true,
      asks_if_ai: false,
      third_party_answered: false,
      distress_or_hardship: false,
      dispute_claim: false,
      abusive: false,
      wants_human: false,
      note: "Caller asked to stop.",
    });
    expect(supervisorNote(result)).toContain("register_opt_out");
  });
});
