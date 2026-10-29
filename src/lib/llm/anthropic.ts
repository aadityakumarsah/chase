import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  type LLMProvider,
  type TextRequest,
  type ObjectRequest,
  type StreamRequest,
  type StreamEvent,
  type SystemPart,
  type Usage,
  LLMError,
  zeroUsage,
} from "./types";
import {
  assertSchemaLimits,
  jsonSchema,
  normalizeEnums,
  requestSignal,
  retry,
  safeError,
} from "./shared";
function outputFormat<T>(schema: z.ZodType<T>) {
  try {
    return zodOutputFormat(schema);
  } catch {
    throw new LLMError("configuration");
  }
}
export function systemBlocks(parts: SystemPart[]): Anthropic.TextBlockParam[] {
  const last = parts.findLastIndex((p) => p.cache);
  return parts.map((p, i) => ({
    type: "text",
    text: p.text,
    ...(i === last ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}
export function toAnthropicTool(
  name: string,
  description: string,
  schema: z.ZodType,
): Anthropic.Tool {
  z.string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .parse(name);
  const input_schema = outputFormat(schema).schema;
  assertSchemaLimits([input_schema]);
  if (input_schema.type !== "object") throw new LLMError("configuration");
  return {
    name,
    description,
    strict: true,
    input_schema: input_schema as Anthropic.Tool.InputSchema,
  };
}
const usage = (u: Anthropic.Usage): Usage => ({
  input: u.input_tokens,
  output: u.output_tokens,
  cacheRead: u.cache_read_input_tokens ?? 0,
  cacheWrite: u.cache_creation_input_tokens ?? 0,
});
function checkStop(stop: string | null, u: Usage) {
  if (stop === "refusal") throw new LLMError("refusal", undefined, u);
  if (stop === "max_tokens") throw new LLMError("max_tokens", undefined, u);
}
export class AnthropicProvider implements LLMProvider {
  constructor(
    private client: Anthropic,
    private model: (task: TextRequest["task"]) => string,
  ) {}
  private params(i: TextRequest) {
    return {
      model: this.model(i.task),
      system: systemBlocks(i.system),
      messages: i.messages,
      max_tokens: i.maxTokens,
      temperature: i.temperature ?? 0.1,
      thinking: { type: "disabled" as const },
    };
  }
  async generateText(i: TextRequest) {
    const started = Date.now(),
      signal = requestSignal(i);
    try {
      const r = await retry(
        () => this.client.messages.create(this.params(i), { signal }),
        signal,
      );
      const u = usage(r.usage);
      checkStop(r.stop_reason, u);
      return {
        value: r.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join(""),
        provider: "anthropic",
        model: r.model,
        usage: u,
        latencyMs: Date.now() - started,
        features: i.system.some((p) => p.cache) ? ["prompt_cache"] : [],
      };
    } catch (e) {
      throw safeError(e, signal);
    }
  }
  async generateObject<T>(i: ObjectRequest<T>) {
    const started = Date.now(),
      signal = requestSignal(i);
    try {
      const format = outputFormat(i.schema);
      assertSchemaLimits([format.schema]);
      let invalid = false;
      // SDK parsing happens before stop_reason is exposed. Defer failures until after
      // refusal/truncation handling, without retaining unsafe response/error text.
      const parse = format.parse;
      format.parse = (text: string) => {
        try {
          return parse(
            JSON.stringify(
              normalizeEnums(JSON.parse(text), jsonSchema(i.schema)),
            ),
          );
        } catch {
          invalid = true;
          return null as T;
        }
      };
      const r = await retry(
        () =>
          this.client.messages.parse(
            { ...this.params(i), output_config: { format } },
            { signal },
          ),
        signal,
      );
      const u = usage(r.usage);
      checkStop(r.stop_reason, u);
      if (invalid || r.parsed_output === null)
        throw new LLMError("validation", undefined, u);
      const value = i.schema.safeParse(r.parsed_output);
      if (!value.success) throw new LLMError("validation", undefined, u);
      return {
        value: value.data,
        provider: "anthropic",
        model: r.model,
        usage: u,
        latencyMs: Date.now() - started,
        features: [
          "structured_output",
          ...(i.system.some((p) => p.cache) ? ["prompt_cache"] : []),
        ],
      };
    } catch (e) {
      throw safeError(e, signal);
    }
  }
  async *streamChat(i: StreamRequest): AsyncIterable<StreamEvent> {
    const started = Date.now(),
      signal = requestSignal(i);
    let u = zeroUsage();
    let stream:
      Awaited<ReturnType<Anthropic["messages"]["create"]>> | undefined;
    try {
      const tools = i.tools?.map((t) =>
        toAnthropicTool(t.name, t.description, t.schema),
      );
      assertSchemaLimits(
        tools?.map((t) => t.input_schema) ?? [],
        tools?.length ?? 0,
      );
      const s = await retry(
        () =>
          this.client.messages.create(
            { ...this.params(i), tools, stream: true },
            { signal },
          ),
        signal,
      );
      stream = s;
      let stop: string | null = null,
        complete = false;
      for await (const e of s) {
        if (e.type === "message_start") u = usage(e.message.usage);
        else if (
          e.type === "content_block_start" &&
          e.content_block.type === "tool_use"
        )
          yield {
            type: "tool_start",
            index: e.index,
            id: e.content_block.id,
            name: e.content_block.name,
          };
        else if (e.type === "content_block_delta") {
          if (e.delta.type === "text_delta")
            yield { type: "text_delta", text: e.delta.text };
          else if (e.delta.type === "input_json_delta")
            yield {
              type: "tool_delta",
              index: e.index,
              arguments: e.delta.partial_json,
            };
        } else if (e.type === "message_delta") {
          u.output = e.usage.output_tokens;
          stop = e.delta.stop_reason;
        } else if (e.type === "message_stop") complete = true;
      }
      if (!complete) throw new LLMError("provider", undefined, u);
      checkStop(stop, u);
      yield {
        type: "done",
        result: {
          value: null,
          provider: "anthropic",
          model: this.model(i.task),
          usage: u,
          latencyMs: Date.now() - started,
          features: [
            "streaming",
            ...(tools?.length ? ["strict_tools"] : []),
            ...(i.system.some((p) => p.cache) ? ["prompt_cache"] : []),
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
