import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import {
  anthropicControls,
  systemBlocks,
  toAnthropicTool,
} from "@/lib/llm/anthropic";
import { modelFor } from "@/lib/llm/routing";
import { providerKey, writeAudit } from "@/lib/llm";
import type { Usage } from "@/lib/llm/types";
import { simulationTools, type InMemoryToolMock } from "./tools";

type Message = Anthropic.MessageParam;

const usage = (value: Anthropic.Usage): Usage => ({
  input: value.input_tokens,
  output: value.output_tokens,
  cacheRead: value.cache_read_input_tokens ?? 0,
  cacheWrite: value.cache_creation_input_tokens ?? 0,
});

export type AgentConversation = {
  messages: Message[];
  model: string;
};

export function createAgentConversation(): AgentConversation {
  const env = getEnv();
  return { messages: [], model: modelFor("chat_proxy", env) };
}

export async function runAgentTurn(
  conversation: AgentConversation,
  system: string,
  debtorText: string,
  mock: InMemoryToolMock,
) {
  const env = getEnv();
  const apiKey =
    env.ANTHROPIC_API_KEY ??
    (env.LLM_PROVIDER === "anthropic"
      ? providerKey(env, "anthropic")
      : undefined);
  if (!apiKey)
    throw new Error("Anthropic is required for the persona simulator");
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    baseURL: env.LLM_BASE_URL,
  });
  const tools = simulationTools().map((tool) =>
    toAnthropicTool(tool.name, tool.description, tool.schema),
  );
  conversation.messages.push({ role: "user", content: debtorText });
  let finalText = "";
  for (let round = 0; round < 4; round++) {
    const started = Date.now();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: conversation.model,
        system: systemBlocks([{ text: system, cache: true }]),
        messages: conversation.messages,
        tools,
        max_tokens: 280,
        ...anthropicControls(conversation.model, "chat_proxy", 0.2),
      });
      await writeAudit({
        task: "chat_proxy",
        provider: "anthropic",
        model: response.model,
        features: ["structured_tools", "prompt_cache", "persona_sim"],
        usage: usage(response.usage),
        latencyMs: Date.now() - started,
        ok: true,
      });
    } catch {
      await writeAudit({
        task: "chat_proxy",
        provider: "anthropic",
        model: conversation.model,
        features: ["structured_tools", "prompt_cache", "persona_sim"],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        latencyMs: Date.now() - started,
        ok: false,
        error: "LLM provider",
      });
      throw new Error("Simulator agent model failed");
    }
    const content: Anthropic.ContentBlockParam[] = response.content
      .filter((block) => block.type === "text" || block.type === "tool_use")
      .map((block) =>
        block.type === "text"
          ? { type: "text" as const, text: block.text }
          : {
              type: "tool_use" as const,
              id: block.id,
              name: block.name,
              input: block.input,
            },
      );
    conversation.messages.push({ role: "assistant", content });
    finalText += response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ");
    const toolUses = response.content.filter(
      (block) => block.type === "tool_use",
    );
    if (!toolUses.length) break;
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((block) => {
      try {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(mock.run(block.name, block.input)),
        };
      } catch {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: JSON.stringify({
            ok: false,
            say: "Tool input was invalid.",
          }),
        };
      }
    });
    conversation.messages.push({ role: "user", content: results });
  }
  return finalText.trim() || "ठीक है, धन्यवाद।";
}
