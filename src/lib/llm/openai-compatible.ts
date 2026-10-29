import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import {
  type LLMProvider,
  type TextRequest,
  type ObjectRequest,
  type StreamRequest,
  type StreamEvent,
  type Usage,
  LLMError,
  zeroUsage,
} from "./types";
import {
  addUsage,
  assertSchemaLimits,
  jsonSchema,
  normalizeEnums,
  requestSignal,
  retry,
  safeError,
} from "./shared";
export const BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com",
  together: "https://api.together.ai/v1",
};
function usage(u: ChatCompletion["usage"]): Usage {
  return {
    input: u?.prompt_tokens ?? 0,
    output: u?.completion_tokens ?? 0,
    cacheRead: u?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWrite: 0,
  };
}
function check(r: ChatCompletion) {
  if (
    r.choices[0]?.message.refusal ||
    r.choices[0]?.finish_reason === "content_filter"
  )
    throw new LLMError("refusal", undefined, usage(r.usage));
  if (r.choices[0]?.finish_reason === "length")
    throw new LLMError("max_tokens", undefined, usage(r.usage));
  if (!r.choices[0]) throw new LLMError("provider");
}
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private client: OpenAI,
    private provider: string,
    private model: (task: TextRequest["task"]) => string,
    private mode: "auto" | "json_schema" | "json_object" = "auto",
  ) {}
  private params(i: TextRequest): ChatCompletionCreateParamsNonStreaming {
    return {
      model: this.model(i.task),
      messages: [
        { role: "system", content: i.system.map((p) => p.text).join("\n\n") },
        ...i.messages,
      ],
      max_tokens: i.maxTokens,
      temperature: i.temperature ?? 0.1,
    };
  }
  private result<T>(
    value: T,
    r: ChatCompletion,
    start: number,
    features: string[],
    u = usage(r.usage),
  ) {
    return {
      value,
      provider: this.provider,
      model: r.model,
      usage: u,
      latencyMs: Date.now() - start,
      features: [...features, ...(u.cacheRead ? ["prompt_cache"] : [])],
    };
  }
  async generateText(i: TextRequest) {
    const start = Date.now(),
      signal = requestSignal(i);
    try {
      const r = await retry(
        () => this.client.chat.completions.create(this.params(i), { signal }),
        signal,
      );
      check(r);
      return this.result(r.choices[0].message.content ?? "", r, start, []);
    } catch (e) {
      throw safeError(e, signal);
    }
  }
  async generateObject<T>(i: ObjectRequest<T>) {
    const start = Date.now(),
      signal = requestSignal(i);
    let total = zeroUsage();
    try {
      const schema = jsonSchema(i.schema);
      assertSchemaLimits([schema]);
      let strict =
        this.mode === "json_schema" ||
        (this.mode === "auto" &&
          this.provider !== "deepseek" &&
          this.provider !== "openai_compatible");
      const params = this.params(i);
      const messages: ChatCompletionMessageParam[] = [
        ...params.messages,
        {
          role: "user",
          content: `Return only a JSON object matching this schema: ${JSON.stringify(schema)}`,
        },
      ];
      let repaired = false;
      for (;;) {
        let r: ChatCompletion;
        try {
          r = await retry(
            () =>
              this.client.chat.completions.create(
                {
                  ...params,
                  messages,
                  response_format: strict
                    ? {
                        type: "json_schema",
                        json_schema: {
                          name: i.schemaName,
                          schema,
                          strict: true,
                        },
                      }
                    : { type: "json_object" },
                },
                { signal },
              ),
            signal,
          );
        } catch (e) {
          // Capability fallback is narrow: never turn auth, rate limits or a bad schema
          // into an unannounced format downgrade.
          if (
            this.mode === "auto" &&
            strict &&
            e instanceof LLMError &&
            e.kind === "unsupported_format"
          ) {
            strict = false;
            continue;
          }
          throw e;
        }
        total = addUsage(total, usage(r.usage));
        check(r);
        let parsed: unknown;
        try {
          parsed = normalizeEnums(
            JSON.parse(r.choices[0].message.content ?? ""),
            schema,
          );
        } catch {
          parsed = undefined;
        }
        const value = i.schema.safeParse(parsed);
        if (value.success)
          return this.result(
            value.data,
            r,
            start,
            [
              strict ? "structured_output" : "json_mode",
              ...(repaired ? ["repair"] : []),
            ],
            total,
          );
        if (strict || repaired)
          throw new LLMError("validation", undefined, total);
        repaired = true;
        strict = false;
        // Only field paths/codes enter the repair prompt, never Zod messages that echo input.
        const issues = value.error.issues.map((e) => ({
          path: e.path,
          code: e.code,
        }));
        messages.push(
          { role: "assistant", content: r.choices[0].message.content ?? "" },
          {
            role: "user",
            content: `Validation failed: ${JSON.stringify(issues)}. Repair the JSON to satisfy the schema. Return JSON only.`,
          },
        );
      }
    } catch (e) {
      const error = safeError(e, signal);
      if (total.input || total.output) error.usage = total;
      throw error;
    }
  }
  async *streamChat(i: StreamRequest): AsyncIterable<StreamEvent> {
    const start = Date.now(),
      signal = requestSignal(i);
    let u = zeroUsage();
    const tools = i.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: jsonSchema(t.schema),
        strict: true,
      },
    }));
    assertSchemaLimits(
      tools?.map((t) => t.function.parameters) ?? [],
      tools?.length ?? 0,
    );
    const starts = new Map<
      number,
      { id: string; name: string; started: boolean }
    >();
    let stream:
      | Awaited<ReturnType<typeof this.client.chat.completions.create>>
      | undefined;
    try {
      const s = await retry(
        () =>
          this.client.chat.completions.create(
            {
              ...this.params(i),
              tools,
              stream: true,
              stream_options: { include_usage: true },
            },
            { signal },
          ),
        signal,
      );
      stream = s;
      let finish: string | null = null;
      for await (const e of s) {
        if (e.usage) u = usage(e.usage);
        const c = e.choices[0];
        if (!c) continue;
        if (c.finish_reason) finish = c.finish_reason;
        if (c.delta.refusal) throw new LLMError("refusal", undefined, u);
        if (c.delta.content)
          yield { type: "text_delta", text: c.delta.content };
        for (const t of c.delta.tool_calls ?? []) {
          const state = starts.get(t.index) ?? {
            id: "",
            name: "",
            started: false,
          };
          state.id += t.id ?? "";
          state.name += t.function?.name ?? "";
          starts.set(t.index, state);
          if (!state.started && state.id && state.name) {
            state.started = true;
            yield {
              type: "tool_start",
              index: t.index,
              id: state.id,
              name: state.name,
            };
          }
          if (t.function?.arguments)
            yield {
              type: "tool_delta",
              index: t.index,
              arguments: t.function.arguments,
            };
        }
      }
      if (finish === "length") throw new LLMError("max_tokens", undefined, u);
      if (finish === "content_filter")
        throw new LLMError("refusal", undefined, u);
      if (!finish) throw new LLMError("provider", undefined, u);
      yield {
        type: "done",
        result: {
          value: null,
          provider: this.provider,
          model: this.model(i.task),
          usage: u,
          latencyMs: Date.now() - start,
          features: [
            "streaming",
            ...(tools?.length ? ["strict_tools"] : []),
            ...(u.cacheRead ? ["prompt_cache"] : []),
          ],
        },
      };
    } catch (e) {
      const error = safeError(e, signal);
      error.usage = u;
      throw error;
    } finally {
      if (stream && "controller" in stream) stream.controller.abort();
    }
  }
}
