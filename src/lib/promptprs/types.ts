import { z } from "zod";

export const PromptPREvidenceSchema = z.strictObject({
  call_id: z.uuid(),
  quote: z.string().min(4).max(320),
  outcome: z.string().min(1).max(80),
});

export const PromptPRSchema = z.strictObject({
  title: z.string().min(4).max(120),
  problem: z.string().min(10).max(600),
  evidence: z.array(PromptPREvidenceSchema).min(2).max(5),
  change: z.strictObject({
    section_id: z.string().min(1).max(80),
    old_text: z.string().min(1).max(4_000),
    new_text: z.string().min(1).max(4_000),
  }),
  expected_impact: z.string().min(5).max(500),
  risk: z.string().min(3).max(500),
  confidence: z.enum(["low", "medium", "high"]),
});

export type PromptPRDraft = z.infer<typeof PromptPRSchema>;

export type PromptPRValidation = {
  ok: boolean;
  errors: string[];
  candidate: string | null;
};

export type PromptPRSimResults = {
  baseRunId: string | null;
  candidateRunId: string | null;
  base: unknown;
  candidate: unknown;
  complianceRegressed: boolean;
  recommended: boolean;
};
