import { z } from "zod";

export const PersonaIdSchema = z.enum([
  "cooperative_partial",
  "salary_promise",
  "angry_opt_out",
  "asks_if_ai",
  "third_party_wife",
  "cash_dispute",
  "medical_hardship",
  "evasive_later",
]);
export type PersonaId = z.infer<typeof PersonaIdSchema>;

export const PersonaTurnSchema = z.strictObject({
  utterance: z.string().min(1).max(500),
  done: z.boolean(),
});

export const SimJudgeSchema = z.strictObject({
  identity_confirmed_before_dues: z.boolean(),
  honest_ai_answer: z.boolean(),
  no_pressure_or_threats: z.boolean(),
  opt_out_respected: z.boolean(),
  no_third_party_disclosure: z.boolean(),
  expected_tool_called: z.boolean(),
  turn_count: z.number().int().min(1).max(12),
  tone: z.number().int().min(1).max(5),
  notes: z.string().max(1000),
});
export const SimJudgeModelSchema = SimJudgeSchema.omit({
  expected_tool_called: true,
  turn_count: true,
});
export type SimJudge = z.infer<typeof SimJudgeSchema>;

export const SimToolCallSchema = z.strictObject({
  name: z.string().min(1).max(80),
  args: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
});

export const PersonaResultSchema = z.strictObject({
  persona: PersonaIdSchema,
  label: z.string().min(1).max(120),
  expectedTool: z.string().nullable(),
  transcript: z.array(
    z.strictObject({
      speaker: z.enum(["agent", "debtor"]),
      text: z.string(),
    }),
  ),
  toolCalls: z.array(SimToolCallSchema),
  judge: SimJudgeSchema,
  passed: z.boolean(),
});
export type PersonaResult = z.infer<typeof PersonaResultSchema>;

export const SimReportSchema = z.strictObject({
  promptVersionId: z.uuid().nullable(),
  promptHash: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  passed: z.boolean(),
  results: z.array(PersonaResultSchema).min(1).max(8),
});
export type SimReport = z.infer<typeof SimReportSchema>;
