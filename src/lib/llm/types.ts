import { z } from "zod";
export const tasks = [
  "dossier",
  "call_analysis",
  "rating_rationale",
  "supervisor",
  "brief",
  "prompt_pr",
  "persona_sim",
  "sim_judge",
  "chat_proxy",
  "ping",
] as const;
export type Task = (typeof tasks)[number];
export type SystemPart = { text: string; cache?: boolean };
export type Message = { role: "user" | "assistant"; content: string };
export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};
export type LLMResult<T> = {
  value: T;
  provider: string;
  model: string;
  usage: Usage;
  latencyMs: number;
  features: string[];
};
export type TextRequest = {
  task: Task;
  system: SystemPart[];
  messages: Message[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
};
export type ObjectRequest<T> = Omit<TextRequest, "temperature"> & {
  schema: z.ZodType<T>;
  schemaName: string;
};
export type Tool = { name: string; description: string; schema: z.ZodType };
export type StreamRequest = TextRequest & { tools?: Tool[] };
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; index: number; id: string; name: string }
  | { type: "tool_delta"; index: number; arguments: string }
  | { type: "done"; result: LLMResult<null> };
export interface LLMProvider {
  generateText(input: TextRequest): Promise<LLMResult<string>>;
  generateObject<T>(input: ObjectRequest<T>): Promise<LLMResult<T>>;
  streamChat(input: StreamRequest): AsyncIterable<StreamEvent>;
}
export const zeroUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});
export class LLMError extends Error {
  constructor(
    public kind:
      | "unsupported_format"
      | "provider"
      | "validation"
      | "refusal"
      | "max_tokens"
      | "aborted"
      | "configuration"
      | "telemetry",
    public status?: number,
    public usage: Usage = zeroUsage(),
  ) {
    super(`LLM ${kind}${status ? ` (HTTP ${status})` : ""}`);
  }
}
