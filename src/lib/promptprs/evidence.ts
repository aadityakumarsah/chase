import { and, desc, eq, isNotNull } from "drizzle-orm";
import { CallAnalysisSchema } from "@/lib/analysis/schema";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";

export type PromptCallEvidence = {
  id: string;
  transcript: string;
  outcome: string;
  language: string;
  objections: string[];
  failed: string;
  quality: number;
};

const seededAnalysisSchema = z.object({
  outcome: z.string().min(1),
  reason_code: z.string().optional(),
  sentiment: z.string().optional(),
  simulated: z.boolean().optional(),
});

export async function promptCallEvidence() {
  const rows = await getDb()
    .select({
      id: calls.id,
      transcript: calls.transcript,
      analysis: calls.analysis,
    })
    .from(calls)
    .where(
      and(
        eq(calls.purpose, "collection"),
        eq(calls.connected, true),
        isNotNull(calls.transcript),
        isNotNull(calls.analysis),
      ),
    )
    .orderBy(desc(calls.startedAt), desc(calls.createdAt))
    .limit(30);
  const parsed = rows.flatMap((row): PromptCallEvidence[] => {
    const analysis = CallAnalysisSchema.safeParse(row.analysis);
    if (!row.transcript) return [];
    if (!analysis.success) {
      const seeded = seededAnalysisSchema.safeParse(row.analysis);
      if (!seeded.success) return [];
      return [
        {
          id: row.id,
          transcript: row.transcript,
          outcome: seeded.data.outcome,
          language: "seed",
          objections: seeded.data.reason_code ? [seeded.data.reason_code] : [],
          failed:
            "Seeded transcript: improve empathy and specificity while preserving compliance.",
          quality: seeded.data.sentiment === "negative" ? 2 : 3,
        },
      ];
    }
    return [
      {
        id: row.id,
        transcript: row.transcript,
        outcome: analysis.data.outcome,
        language: analysis.data.language_used,
        objections: analysis.data.objections,
        failed: analysis.data.agent_quality.failed,
        quality: analysis.data.agent_quality.score,
      },
    ];
  });
  return {
    recent: parsed,
    lowest: [...parsed].sort((a, b) => a.quality - b.quality).slice(0, 6),
  };
}
