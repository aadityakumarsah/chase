import { z } from "zod";

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({ name: z.string().min(1), arguments: z.string() }),
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  stream: z.literal(true),
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({ role: z.literal("system"), content: z.string() }),
        z.object({ role: z.literal("user"), content: z.string() }),
        z.object({
          role: z.literal("assistant"),
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolCallSchema).optional(),
        }),
        z.object({
          role: z.literal("tool"),
          content: z.string(),
          tool_call_id: z.string().min(1),
        }),
      ]),
    )
    .min(1)
    .max(200),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
          description: z.string().default(""),
          parameters: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .max(20)
    .optional(),
  max_tokens: z.number().int().positive().max(2_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
