import { estimateCost } from "./cost";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getEnv, type Env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { llmCalls } from "@/lib/db/schema";
import { AnthropicProvider } from "./anthropic";
import { BASE_URLS, OpenAICompatibleProvider } from "./openai-compatible";
import { modelFor } from "./routing";
import { safeError, requestSignal } from "./shared";
import {
  LLMError,
  zeroUsage,
  type LLMProvider,
  type LLMResult,
  type TextRequest,
  type ObjectRequest,
  type StreamRequest,
  type StreamEvent,
  type Task,
} from "./types";
export type Audit = {
  task: Task;
  businessId?: string;
  provider: string;
  model: string;
  features: string[];
  usage: LLMResult<unknown>["usage"];
  latencyMs: number;
  ok: boolean;
  error?: string;
};
export async function writeAudit(a: Audit) {
  try {
    await getDb()
      .insert(llmCalls)
      .values({
        businessId: a.businessId,
        estimatedCostUsd: estimateCost(
          a.provider,
          a.model,
          a.usage,
          getEnv().LLM_PRICING_JSON,
        ),
        pricingSource: getEnv().LLM_PRICING_JSON
          ? "env:LLM_PRICING_JSON"
          : null,
        task: a.task,
        provider: a.provider,
        model: a.model,
        features: a.features,
        inputTokens: a.usage.input,
        outputTokens: a.usage.output,
        cacheReadTokens: a.usage.cacheRead,
        cacheWriteTokens: a.usage.cacheWrite,
        latencyMs: a.latencyMs,
        ok: a.ok,
        error: a.error,
      });
  } catch {
    throw new LLMError("telemetry");
  }
}
const keyNames = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  together: "TOGETHER_API_KEY",
  openai_compatible: "LLM_API_KEY",
} as const;
export function providerKey(
  env: Env,
  provider: Env["LLM_PROVIDER"],
  fallback = false,
): string | undefined {
  // Generic primary credentials must never be sent to a different fallback host.
  return (
    (fallback ? env.LLM_FALLBACK_API_KEY : env.LLM_API_KEY) ??
    (provider === "openai_compatible" && fallback
      ? undefined
      : env[keyNames[provider]])
  );
}
export function createProvider(env: Env, fallback = false): LLMProvider {
  const provider = fallback ? env.LLM_FALLBACK_PROVIDER : env.LLM_PROVIDER;
  if (!provider || (fallback && !env.LLM_FALLBACK_MODEL))
    throw new LLMError("configuration");
  const apiKey = providerKey(env, provider, fallback);
  if (!apiKey) throw new LLMError("configuration");
  const model = (task: Task) =>
    fallback ? env.LLM_FALLBACK_MODEL! : modelFor(task, env);
  const baseURL = fallback ? env.LLM_FALLBACK_BASE_URL : env.LLM_BASE_URL;
  if (provider === "anthropic")
    return new AnthropicProvider(
      new Anthropic({ apiKey, maxRetries: 0, baseURL }),
      model,
    );
  const url =
    baseURL ??
    (provider !== "openai_compatible" ? BASE_URLS[provider] : undefined);
  if (!url) throw new LLMError("configuration");
  return new OpenAICompatibleProvider(
    new OpenAI({ apiKey, baseURL: url, maxRetries: 0 }),
    provider,
    model,
    fallback ? env.LLM_FALLBACK_JSON_MODE : env.LLM_JSON_MODE,
  );
}
export function getLLM(
  env: Env = getEnv(),
  dependencies: {
    factory?: (env: Env, fallback: boolean) => LLMProvider;
    audit?: (a: Audit) => Promise<void>;
  } = {},
): LLMProvider {
  const factory = dependencies.factory ?? createProvider,
    audit = dependencies.audit ?? writeAudit;
  const identity = (task: Task, fallback: boolean) => ({
    task,
    provider: fallback ? env.LLM_FALLBACK_PROVIDER! : env.LLM_PROVIDER,
    model: fallback ? env.LLM_FALLBACK_MODEL! : modelFor(task, env),
  });
  const canFallback = (e: LLMError, signal?: AbortSignal) =>
    e.kind === "provider" &&
    !signal?.aborted &&
    !!env.LLM_FALLBACK_PROVIDER &&
    !!env.LLM_FALLBACK_MODEL;
  async function run<T>(
    input: TextRequest,
    features: string[],
    call: (p: LLMProvider, i: TextRequest) => Promise<LLMResult<T>>,
  ): Promise<LLMResult<T>> {
    const signal = requestSignal(input);
    for (const fallback of [false, true]) {
      const start = Date.now();
      let result: LLMResult<T> | undefined, error: LLMError | undefined;
      try {
        result = await call(factory(env, fallback), { ...input, signal });
      } catch (e) {
        error = safeError(e, signal);
      }
      const flags = [
        ...(result?.features ?? features),
        ...(fallback ? ["fallback"] : []),
      ];
      await audit({
        ...identity(input.task, fallback),
        businessId: input.businessId,
        model: result?.model ?? identity(input.task, fallback).model,
        features: flags,
        usage: result?.usage ?? error?.usage ?? zeroUsage(),
        latencyMs: Date.now() - start,
        ok: !error,
        error: error?.message,
      });
      if (result) return { ...result, features: flags };
      if (!fallback && canFallback(error!, signal)) continue;
      throw error;
    }
    throw new LLMError("provider");
  }
  return {
    generateText: (i) => run(i, [], (p, r) => p.generateText(r)),
    generateObject: <T>(i: ObjectRequest<T>) =>
      run(i, ["structured_output"], (p, r) =>
        p.generateObject({ ...i, signal: r.signal }),
      ),
    async *streamChat(i: StreamRequest): AsyncIterable<StreamEvent> {
      const signal = requestSignal(i);
      for (const fallback of [false, true]) {
        const start = Date.now();
        let emitted = false,
          completed = false,
          logged = false;
        let result: LLMResult<null> | undefined, error: LLMError | undefined;
        try {
          for await (const event of factory(env, fallback).streamChat({
            ...i,
            signal,
          })) {
            if (event.type === "done") {
              result = event.result;
              completed = true;
            } else {
              emitted = true;
              yield event;
            }
          }
          if (!completed) throw new LLMError("provider");
        } catch (e) {
          error = safeError(e, signal);
        } finally {
          if (!completed && !error) error = new LLMError("aborted");
          await audit({
            ...identity(i.task, fallback),
            businessId: i.businessId,
            features: [
              ...(result?.features ?? ["streaming"]),
              ...(fallback ? ["fallback"] : []),
            ],
            usage: result?.usage ?? error?.usage ?? zeroUsage(),
            latencyMs: Date.now() - start,
            ok: completed && !error,
            error: error?.message,
          });
          logged = true;
        }
        if (result && logged) {
          yield {
            type: "done",
            result: {
              ...result,
              features: [...result.features, ...(fallback ? ["fallback"] : [])],
            },
          };
          return;
        }
        // Never replay a partially emitted answer/tool call on another provider.
        if (!fallback && !emitted && canFallback(error!, signal)) continue;
        throw error;
      }
    },
  };
}
export * from "./types";
