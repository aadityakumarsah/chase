import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import { anthropicControls } from "@/lib/llm/anthropic";
import { providerKey, writeAudit } from "@/lib/llm";
import { modelFor } from "@/lib/llm/routing";
import type { Usage } from "@/lib/llm/types";
import { getDb } from "@/lib/db";
import { callBusinessId } from "@/lib/db/tenant";
import { complianceEvents } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { guardSentence, takeCompleteSentences } from "./guard";
import {
  appendCallTurn,
  consumePendingSupervisor,
  proxyCallFromSystem,
  recordProxyLatency,
} from "./persistence";
import { supervisorWithinBudget } from "./supervisor";
import { splitCacheableSystem, translateOpenAIRequest } from "./translate";
import type { ChatCompletionRequest } from "./types";

const encoder = new TextEncoder();
const usage = (value: Anthropic.Usage): Usage => ({
  input: value.input_tokens,
  output: value.output_tokens,
  cacheRead: value.cache_read_input_tokens ?? 0,
  cacheWrite: value.cache_creation_input_tokens ?? 0,
});

const chunk = (
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finish_reason: string | null = null,
) =>
  `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`;

async function logRewrite(callId: string, debtorId: string | null) {
  await getDb()
    .insert(complianceEvents)
    .values({
      businessId: callBusinessId(callId),
      debtorId,
      callId,
      kind: "supervisor_rewrite",
      rule: "banned_content",
      detail: { action: "sentence_replaced" },
    });
  await emitEvent("supervisor_rewrite", {
    callId,
    ...(debtorId ? { debtorId } : {}),
    payload: { action: "sentence_replaced" },
  });
}

export async function createProxyStream(
  input: ChatCompletionRequest,
  signal: AbortSignal,
) {
  const started = Date.now();
  const translated = translateOpenAIRequest(input);
  const linked = await proxyCallFromSystem(translated.system);
  if (!linked) throw new Error("Call reference is missing or unknown");
  const latestUser = input.messages.findLast(
    (message) => message.role === "user",
  );
  if (latestUser)
    await appendCallTurn({
      callId: linked.call.id,
      speaker: "debtor",
      text: latestUser.content,
    });

  const pending = await consumePendingSupervisor(linked.call.id);
  const currentNote =
    latestUser && !pending.disabled
      ? await supervisorWithinBudget({
          callId: linked.call.id,
          debtorId: linked.call.debtorId,
          utterance: latestUser.content,
        })
      : null;
  const note = currentNote ?? pending.note;

  const env = getEnv();
  const apiKey =
    env.ANTHROPIC_API_KEY ??
    (env.LLM_PROVIDER === "anthropic"
      ? providerKey(env, "anthropic")
      : undefined);
  if (!apiKey)
    throw new Error("Anthropic is not configured for the Chase proxy");
  const model = modelFor("chat_proxy", env);
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    baseURL: env.LLM_BASE_URL,
  });
  const id = `chatcmpl-${crypto.randomUUID()}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let firstTokenAt = 0;
      let textBuffer = "";
      let assistantText = "";
      let providerUsage: Usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      };
      let stopReason: string | null = null;
      const send = (value: string) => controller.enqueue(encoder.encode(value));
      const sendSafe = async (text: string) => {
        for (const sentence of text.match(
          /[^.!?।\n]*[.!?।\n]+|[^.!?।\n]+$/gu,
        ) ?? []) {
          const guarded = guardSentence(sentence);
          if (guarded.rewritten)
            await logRewrite(linked.call.id, linked.call.debtorId);
          assistantText += guarded.text;
          send(chunk(id, model, { content: guarded.text }));
        }
      };
      try {
        send(chunk(id, model, { role: "assistant" }));
        const stream = await client.messages.create(
          {
            model,
            system: splitCacheableSystem(translated.system, note),
            messages: translated.messages,
            tools: translated.tools.length ? translated.tools : undefined,
            max_tokens: Math.min(input.max_tokens ?? 150, 300),
            ...anthropicControls(model, "chat_proxy", input.temperature ?? 0.3),
            stream: true,
          },
          { signal },
        );
        for await (const event of stream) {
          if (event.type === "message_start")
            providerUsage = usage(event.message.usage);
          else if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            if (textBuffer) {
              await sendSafe(textBuffer);
              textBuffer = "";
            }
            send(
              chunk(id, model, {
                tool_calls: [
                  {
                    index: event.index,
                    id: event.content_block.id,
                    type: "function",
                    function: { name: event.content_block.name, arguments: "" },
                  },
                ],
              }),
            );
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            textBuffer += event.delta.text;
            const parts = takeCompleteSentences(textBuffer);
            if (parts.complete) await sendSafe(parts.complete);
            textBuffer = parts.remainder;
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "input_json_delta"
          ) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            send(
              chunk(id, model, {
                tool_calls: [
                  {
                    index: event.index,
                    function: { arguments: event.delta.partial_json },
                  },
                ],
              }),
            );
          } else if (event.type === "message_delta") {
            providerUsage.output = event.usage.output_tokens;
            stopReason = event.delta.stop_reason;
          }
        }
        if (textBuffer) await sendSafe(textBuffer);
        const ttftMs = Math.max(0, (firstTokenAt || Date.now()) - started);
        if (assistantText)
          await appendCallTurn({
            callId: linked.call.id,
            speaker: "agent",
            text: assistantText,
            ttftMs,
          });
        await recordProxyLatency(linked.call.id, linked.call.debtorId, ttftMs);
        await writeAudit({
          task: "chat_proxy",
          provider: "anthropic",
          model,
          features: [
            "streaming",
            "strict_tools",
            "prompt_cache",
            ...(note ? ["live_supervisor"] : []),
          ],
          usage: providerUsage,
          latencyMs: Date.now() - started,
          ok: true,
        });
        send(
          chunk(
            id,
            model,
            {},
            stopReason === "tool_use" ? "tool_calls" : "stop",
          ),
        );
        send("data: [DONE]\n\n");
        controller.close();
      } catch {
        await writeAudit({
          task: "chat_proxy",
          provider: "anthropic",
          model,
          features: ["streaming"],
          usage: providerUsage,
          latencyMs: Date.now() - started,
          ok: false,
          error: "LLM provider",
        }).catch(() => {});
        send(
          `data: ${JSON.stringify({ error: { message: "Proxy generation failed", type: "server_error" } })}\n\n`,
        );
        send("data: [DONE]\n\n");
        controller.close();
      }
    },
    cancel() {},
  });
}
