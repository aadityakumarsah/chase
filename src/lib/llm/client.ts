import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { getEnv, type Env } from "@/lib/env";
export interface LlmProvider {
  ping(): Promise<void>;
}
const baseUrls: Partial<Record<Env["LLM_PROVIDER"], string>> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com",
  together: "https://api.together.xyz/v1",
};
export function createLlmClient(env: Env = getEnv()): LlmProvider {
  const key =
    env.LLM_PROVIDER === "anthropic"
      ? (env.ANTHROPIC_API_KEY ?? env.LLM_API_KEY)
      : env.LLM_API_KEY;
  if (!key) throw new Error("Missing LLM API key");
  if (env.LLM_PROVIDER === "anthropic") {
    const client = new Anthropic({
      apiKey: key,
      timeout: 10_000,
      maxRetries: 0,
    });
    return {
      async ping() {
        const response = await client.messages.create({
          model: env.LLM_MODEL_FAST,
          max_tokens: 5,
          messages: [{ role: "user", content: "Say OK." }],
        });
        if (
          !z
            .object({
              id: z.string(),
              content: z.array(z.object({ type: z.string() })),
            })
            .safeParse(response).success
        )
          throw new Error("Invalid Anthropic response schema");
      },
    };
  }
  const baseURL = env.LLM_BASE_URL ?? baseUrls[env.LLM_PROVIDER];
  if (!baseURL) throw new Error("Missing LLM_BASE_URL");
  const client = new OpenAI({
    apiKey: key,
    baseURL,
    timeout: 10_000,
    maxRetries: 0,
  });
  return {
    async ping() {
      const response = await client.chat.completions.create({
        model: env.LLM_MODEL_FAST,
        max_tokens: 5,
        messages: [{ role: "user", content: "Say OK." }],
      });
      if (
        !z
          .object({
            choices: z
              .array(
                z.object({
                  message: z.object({ content: z.string().nullable() }),
                }),
              )
              .min(1),
          })
          .safeParse(response).success
      )
        throw new Error("Invalid LLM response schema");
    },
  };
}
