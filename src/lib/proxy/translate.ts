import type Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionRequest } from "./types";

export type AnthropicTranslation = {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
};

export function translateOpenAIRequest(
  input: ChatCompletionRequest,
): AnthropicTranslation {
  const system = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const raw: Anthropic.MessageParam[] = [];
  for (const message of input.messages) {
    if (message.role === "system") continue;
    if (message.role === "user")
      raw.push({ role: "user", content: message.content });
    else if (message.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.content)
        content.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(call.function.arguments);
        } catch {
          parsed = {};
        }
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input: parsed,
        });
      }
      raw.push({ role: "assistant", content });
    } else
      raw.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id,
            content: message.content,
          },
        ],
      });
  }
  const messages: Anthropic.MessageParam[] = [];
  for (const message of raw) {
    const previous = messages.at(-1);
    if (previous?.role === message.role) {
      const toBlocks = (
        content: Anthropic.MessageParam["content"],
      ): Anthropic.ContentBlockParam[] =>
        typeof content === "string"
          ? [{ type: "text", text: content }]
          : content;
      previous.content = [
        ...toBlocks(previous.content),
        ...toBlocks(message.content),
      ];
    } else messages.push(message);
  }
  return {
    system,
    messages,
    tools: (input.tools ?? []).map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      strict: true,
      input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
    })),
  };
}

export function splitCacheableSystem(
  system: string,
  supervisorNote?: string | null,
) {
  const marker = "ACCOUNT CONTEXT FOR THIS CALL";
  const index = system.indexOf(marker);
  const staticText = index >= 0 ? system.slice(0, index) : system;
  const dynamicText = index >= 0 ? system.slice(index) : "";
  return [
    {
      type: "text" as const,
      text: staticText,
      cache_control: { type: "ephemeral" as const },
    },
    ...(dynamicText ? [{ type: "text" as const, text: dynamicText }] : []),
    ...(supervisorNote
      ? [{ type: "text" as const, text: supervisorNote }]
      : []),
  ];
}
