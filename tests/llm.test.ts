import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import {
  AnthropicProvider,
  systemBlocks,
  toAnthropicTool,
} from "@/lib/llm/anthropic";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { getLLM, providerKey, type Audit } from "@/lib/llm";
import { loadEnv } from "@/lib/env";
import {
  LLMError,
  zeroUsage,
  type LLMProvider,
  type LLMResult,
  type StreamEvent,
} from "@/lib/llm/types";
import { modelFor, TASK_TIERS } from "@/lib/llm/routing";
import { assertSchemaLimits, retry } from "@/lib/llm/shared";
import { estimateCost } from "@/lib/llm/cost";
const schema = z.strictObject({
  status: z.enum(["ok"]),
  count: z.number().int().max(3),
});
const request = {
  task: "ping" as const,
  system: [{ text: "Stable", cache: true }],
  messages: [{ role: "user" as const, content: "Test" }],
  schema,
  schemaName: "test",
  maxTokens: 100,
};
const anthropicResponse = (text: string, stop = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "unit-model",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: {
    input_tokens: 12,
    output_tokens: 7,
    cache_read_input_tokens: 20,
    cache_creation_input_tokens: 10,
  },
});
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
function anthropic(body: unknown) {
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    void url;
    void init;
    return response(body);
  });
  return {
    fetch,
    provider: new AnthropicProvider(
      new Anthropic({ apiKey: "unit-key", fetch, maxRetries: 0 }),
      () => "unit-model",
    ),
  };
}
const completion = (text: string) => ({
  id: "chat-test",
  object: "chat.completion",
  created: 1,
  model: "unit-model",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 3 },
  },
});
describe("LLM adapters", () => {
  it("uses SDK parse, normalizes enums and records actual cache tokens", async () => {
    const { provider, fetch } = anthropic(
      anthropicResponse('{"status":"OK","count":2}'),
    );
    const r = await provider.generateObject(request);
    expect(r.value).toEqual({ status: "ok", count: 2 });
    expect(r.usage).toEqual({
      input: 12,
      output: 7,
      cacheRead: 20,
      cacheWrite: 10,
    });
    const sent = JSON.parse(
      String(
        fetch.mock.calls[0]?.[1] &&
          (fetch.mock.calls[0][1] as RequestInit).body,
      ),
    );
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sent.thinking.type).toBe("disabled");
  });
  it.each(["refusal", "max_tokens"])(
    "handles %s before malformed JSON parsing",
    async (stop) => {
      const { provider } = anthropic(anthropicResponse("not JSON", stop));
      await expect(provider.generateObject(request)).rejects.toMatchObject({
        kind: stop,
        usage: { input: 12 },
      });
    },
  );
  it("enforces local constraints the API cannot enforce", async () => {
    const { provider } = anthropic(
      anthropicResponse('{"status":"ok","count":999}'),
    );
    await expect(provider.generateObject(request)).rejects.toMatchObject({
      kind: "validation",
    });
  });
  it("marks only the last stable cache boundary and enforces strict-tool limits", () => {
    expect(
      systemBlocks([
        { text: "A", cache: true },
        { text: "B", cache: true },
        { text: "C" },
      ]).map((b) => !!b.cache_control),
    ).toEqual([false, true, false]);
    expect(toAnthropicTool("tool", "test", schema)).toMatchObject({
      strict: true,
      input_schema: { additionalProperties: false },
    });
    expect(() => assertSchemaLimits([], 21)).toThrow();
    expect(() =>
      assertSchemaLimits([
        {
          properties: Object.fromEntries(
            Array.from({ length: 25 }, (_, i) => [
              String(i),
              { type: "string" },
            ]),
          ),
          required: [],
        },
      ]),
    ).toThrow();
  });
  it("repairs JSON-mode validation once, preserving all usage", async () => {
    let n = 0;
    const fetch = vi.fn(async () =>
      response(
        completion(
          ++n === 1
            ? '{"status":"ok","count":99}'
            : '{"status":"OK","count":1}',
        ),
      ),
    );
    const provider = new OpenAICompatibleProvider(
      new OpenAI({ apiKey: "unit", fetch, maxRetries: 0 }),
      "custom",
      () => "unit-model",
      "json_object",
    );
    const r = await provider.generateObject(request);
    expect(r.value.count).toBe(1);
    expect(r.features).toContain("repair");
    expect(r.usage.input).toBe(20);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not repair strict-output schema failures", async () => {
    const fetch = vi.fn(async () =>
      response(completion('{"status":"ok","count":99}')),
    );
    const p = new OpenAICompatibleProvider(
      new OpenAI({ apiKey: "unit", fetch, maxRetries: 0 }),
      "openai",
      () => "unit-model",
    );
    await expect(p.generateObject(request)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("downgrades only an explicit unsupported-format response", async () => {
    let n = 0;
    const fetch = vi.fn(async () =>
      ++n === 1
        ? new Response(
            JSON.stringify({
              error: {
                message: "response_format json_schema is not supported",
                type: "invalid_request_error",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          )
        : response(completion('{"status":"ok","count":1}')),
    );
    const p = new OpenAICompatibleProvider(
      new OpenAI({ apiKey: "unit", fetch, maxRetries: 0 }),
      "openai",
      () => "unit-model",
    );
    expect((await p.generateObject(request)).features).toContain("json_mode");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("retries exactly twice for specified transient statuses", async () => {
    const fn = vi.fn(async () => {
      throw new LLMError("provider", 529);
    });
    await expect(retry(fn, AbortSignal.timeout(5000))).rejects.toMatchObject({
      status: 529,
    });
    expect(fn).toHaveBeenCalledTimes(3);
    const bad = vi.fn(async () => {
      throw new LLMError("provider", 401);
    });
    await expect(retry(bad, AbortSignal.timeout(5000))).rejects.toMatchObject({
      status: 401,
    });
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
const result: LLMResult<string> = {
  value: "ok",
  provider: "openai",
  model: "fallback-model",
  usage: zeroUsage(),
  latencyMs: 1,
  features: [],
};
function fake(error?: LLMError): LLMProvider {
  return {
    generateText: async () => {
      if (error) throw error;
      return result;
    },
    generateObject: async <T>() => {
      if (error) throw error;
      return { ...result, value: { ok: true } as T };
    },
    async *streamChat() {
      if (error) throw error;
      yield { type: "text_delta", text: "ok" };
      yield { type: "done", result: { ...result, value: null } };
    },
  };
}
describe("routing and audited fallback", () => {
  const env = loadEnv({
    LLM_FALLBACK_PROVIDER: "openai",
    LLM_FALLBACK_MODEL: "fallback-model",
  });
  it("routes every task and respects overrides", () => {
    for (const [task, tier] of Object.entries(TASK_TIERS))
      expect(modelFor(task as keyof typeof TASK_TIERS, env)).toBe(
        env[`LLM_MODEL_${tier}`],
      );
    expect(
      modelFor("chat_proxy", loadEnv({ LLM_MODEL_FOR_CHAT_PROXY: "special" })),
    ).toBe("special");
    expect(
      providerKey(loadEnv({ LLM_API_KEY: "primary" }), "openai", true),
    ).toBeUndefined();
  });
  it("logs failed primary and successful fallback separately", async () => {
    const logs: Audit[] = [];
    const businessId = "11111111-1111-4111-8111-111111111111";
    const p = getLLM(env, {
      factory: (_, fallback) =>
        fake(fallback ? undefined : new LLMError("provider", 500)),
      audit: async (a) => {
        logs.push(a);
      },
    });
    expect(
      (await p.generateText({ ...request, businessId })).features,
    ).toContain("fallback");
    expect(logs.map((l) => l.ok)).toEqual([false, true]);
    expect(logs.map((l) => l.businessId)).toEqual([businessId, businessId]);
    expect(logs[1].provider).toBe("openai");
  });
  it.each([
    "validation",
    "refusal",
    "max_tokens",
    "aborted",
    "configuration",
  ] as const)("never falls back for %s", async (kind) => {
    const factory = vi.fn(() => fake(new LLMError(kind)));
    const logs: Audit[] = [];
    await expect(
      getLLM(env, {
        factory,
        audit: async (a) => {
          logs.push(a);
        },
      }).generateObject(request),
    ).rejects.toMatchObject({ kind });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(1);
  });
  it("never replays a partially emitted stream", async () => {
    const factory = vi.fn(() => ({
      ...fake(),
      async *streamChat(): AsyncIterable<StreamEvent> {
        yield { type: "text_delta", text: "partial" };
        throw new LLMError("provider", 500);
      },
    }));
    const logs: Audit[] = [];
    const businessId = "22222222-2222-4222-8222-222222222222";
    const consume = async () => {
      for await (const e of getLLM(env, {
        factory,
        audit: async (a) => {
          logs.push(a);
        },
      }).streamChat({ ...request, businessId }))
        void e;
    };
    await expect(consume()).rejects.toMatchObject({ kind: "provider" });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(logs[0].ok).toBe(false);
    expect(logs[0].businessId).toBe(businessId);
  });
  it("records consumer cancellation once", async () => {
    const logs: Audit[] = [];
    for await (const e of getLLM(env, {
      factory: () => fake(),
      audit: async (a) => {
        logs.push(a);
      },
    }).streamChat(request)) {
      void e;
      break;
    }
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ ok: false, error: "LLM aborted" });
  });
  it("does not turn telemetry errors into duplicate provider calls", async () => {
    const factory = vi.fn(() => fake());
    await expect(
      getLLM(env, {
        factory,
        audit: async () => {
          throw new LLMError("telemetry");
        },
      }).generateText(request),
    ).rejects.toMatchObject({ kind: "telemetry" });
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("leaves unknown costs null and accounts for provider cache semantics", () => {
    const rates = JSON.stringify({
      "anthropic/m": { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
      "openai/m": { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
    });
    const u = { input: 100, output: 10, cacheRead: 50, cacheWrite: 20 };
    expect(estimateCost("anthropic", "m", u)).toBeNull();
    expect(estimateCost("anthropic", "m", u, rates)).toBe("0.000150000");
    expect(estimateCost("openai", "m", u, rates)).toBe("0.000075000");
  });
});

describe("SDK streaming", () => {
  const sse = (events: unknown[]) =>
    new Response(
      events
        .map(
          (e) =>
            `${typeof e === "object" && e !== null && "type" in e ? `event: ${e.type}\n` : ""}data: ${JSON.stringify(e)}\n\n`,
        )
        .join(""),
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  it("streams Anthropic text/tools and completion usage", async () => {
    const fetch = vi.fn(async () =>
      sse([
        {
          type: "message_start",
          message: anthropicResponse("", null as unknown as string),
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "tool_1",
            name: "lookup",
            input: {},
          },
        },
        {
          type: "content_block_delta",
          index: 1,
          delta: {
            type: "input_json_delta",
            partial_json: '{"status":"ok","count":1}',
          },
        },
        { type: "content_block_stop", index: 1 },
        {
          type: "message_delta",
          delta: { stop_reason: "tool_use", stop_sequence: null },
          usage: { output_tokens: 9 },
        },
        { type: "message_stop" },
      ]),
    );
    const p = new AnthropicProvider(
      new Anthropic({ apiKey: "unit", fetch, maxRetries: 0 }),
      () => "unit-model",
    );
    const events = [];
    for await (const e of p.streamChat({
      ...request,
      tools: [{ name: "lookup", description: "test", schema }],
    }))
      events.push(e);
    expect(events[0]).toEqual({ type: "text_delta", text: "Hello" });
    expect(events[1]).toMatchObject({ type: "tool_start", name: "lookup" });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      result: {
        usage: { output: 9, cacheRead: 20 },
        features: ["streaming", "strict_tools", "prompt_cache"],
      },
    });
  });
  it("streams compatible tool deltas and usage-only final chunks", async () => {
    const fetch = vi.fn(async () =>
      sse([
        {
          id: "c",
          object: "chat.completion.chunk",
          created: 1,
          model: "m",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "t1",
                    type: "function",
                    function: { name: "lookup", arguments: "" },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "c",
          object: "chat.completion.chunk",
          created: 1,
          model: "m",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '{"count":1}' } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
        {
          id: "c",
          object: "chat.completion.chunk",
          created: 1,
          model: "m",
          choices: [],
          usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
        },
      ]),
    );
    const p = new OpenAICompatibleProvider(
      new OpenAI({ apiKey: "unit", fetch, maxRetries: 0 }),
      "openai",
      () => "m",
    );
    const events = [];
    for await (const e of p.streamChat({
      ...request,
      tools: [{ name: "lookup", description: "test", schema }],
    }))
      events.push(e);
    expect(events[0]).toEqual({
      type: "tool_start",
      index: 0,
      id: "t1",
      name: "lookup",
    });
    expect(events[1]).toEqual({
      type: "tool_delta",
      index: 0,
      arguments: '{"count":1}',
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      result: { usage: { input: 20, output: 4 } },
    });
  });
});

describe("current Claude model controls", () => {
  it("omits removed sampling settings and preserves latency-sensitive behavior", async () => {
    const { anthropicControls } = await import("@/lib/llm/anthropic");
    expect(anthropicControls("claude-haiku-5-5", "supervisor")).toEqual({
      thinking: { type: "disabled" },
    });
    expect(anthropicControls("claude-sonnet-5-5", "chat_proxy")).toEqual({
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
    });
    expect(anthropicControls("claude-opus-5-5", "brief")).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
    expect(
      anthropicControls("claude-opus-5-5", "ping").output_config?.effort,
    ).toBe("low");
    expect(() => anthropicControls("claude-opus-5-5", "supervisor")).toThrow();
    expect(
      anthropicControls("claude-haiku-4-5", "dossier", 0.2).temperature,
    ).toBe(0.2);
  });
});
