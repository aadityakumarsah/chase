import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { promptPrs } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { getLLM } from "@/lib/llm";
import { activePrompt } from "@/lib/prompts";
import { relatedPersonas } from "@/lib/sim/personas";
import { runSimulation } from "@/lib/sim/run";
import { promptCallEvidence } from "./evidence";
import { PromptPRSchema, type PromptPRDraft } from "./types";
import { complianceRegressed, validatePromptPR } from "./validation";

const confidence = { low: "0.3500", medium: "0.6500", high: "0.9000" } as const;

const system = `You improve a production voice-collections prompt using only supplied evidence.
Return one small, precise edit. Never edit a section whose id starts with protected:.
old_text must be copied exactly from the selected section and occur there once.
Every evidence quote must be copied verbatim from its transcript and must support the problem.
Preserve prompt variables, AI honesty, identity-before-dues, privacy, respectful opt-out and tool behavior.
Prefer empathy, clarity and a natural Indian SMB phone-call style over added pressure.`;

async function propose(
  businessId: string,
  base: string,
  evidence: Awaited<ReturnType<typeof promptCallEvidence>>,
  retryReasons: string[] = [],
) {
  return getLLM().generateObject({
    task: "prompt_pr",
    businessId,
    schema: PromptPRSchema,
    schemaName: "prompt_pr",
    maxTokens: 1_800,
    system: [{ text: system, cache: true }],
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          active_prompt: base,
          connected_call_analyses: evidence.recent.map((row) => ({
            id: row.id,
            outcome: row.outcome,
            language: row.language,
            objections: row.objections,
            failed: row.failed,
            quality: row.quality,
          })),
          lowest_scoring_transcripts: evidence.lowest.map((row) => ({
            call_id: row.id,
            outcome: row.outcome,
            transcript: row.transcript.slice(0, 5_000),
          })),
          retry_reasons: retryReasons,
        }),
      },
    ],
  });
}

export async function generatePromptPR(
  agentKey: "collections",
  businessId: string,
) {
  if (agentKey !== "collections")
    throw new Error("Only collections Prompt PRs are supported");
  const active = await activePrompt(agentKey);
  const evidence = await promptCallEvidence(businessId);
  if (evidence.lowest.length < 2)
    throw new Error(
      "At least two connected analyzed calls are required for a Prompt PR",
    );

  let generated = await propose(businessId, active.body, evidence);
  let draft: PromptPRDraft = generated.value;
  let validated = validatePromptPR(active.body, draft, evidence.recent);
  if (!validated.ok) {
    generated = await propose(
      businessId,
      active.body,
      evidence,
      validated.errors,
    );
    draft = generated.value;
    validated = validatePromptPR(active.body, draft, evidence.recent);
  }
  if (!validated.ok || !validated.candidate)
    throw new Error(`Prompt PR rejected: ${validated.errors.join(" ")}`);

  const personaIds = relatedPersonas(
    `${draft.problem} ${draft.expected_impact}`,
    4,
  ).map((persona) => persona.id);
  const [baseRun, candidateRun] = await Promise.all([
    runSimulation({ personas: personaIds, promptSource: active.body }),
    runSimulation({ personas: personaIds, promptSource: validated.candidate }),
  ]);
  const regressed = complianceRegressed(baseRun.report, candidateRun.report);
  const recommended = !regressed && candidateRun.report.passed;
  const simResults = {
    baseRunId: baseRun.runId,
    candidateRunId: candidateRun.runId,
    base: baseRun.report,
    candidate: candidateRun.report,
    complianceRegressed: regressed,
    recommended,
  };
  const [saved] = await getDb()
    .insert(promptPrs)
    .values({
      businessId,
      agentKey,
      baseVersionId: active.id,
      title: draft.title,
      problem: draft.problem,
      evidence: draft.evidence,
      change: draft.change,
      expectedImpact: draft.expected_impact,
      risk: draft.risk,
      confidence: confidence[draft.confidence],
      status: "open",
      simResults,
    })
    .returning();
  await emitEvent("prompt_pr.created", {
    businessId,
    payload: { id: saved.id, agentKey, recommended, baseVersionId: active.id },
  });
  return saved;
}

export async function getPromptPRCandidate(id: string, businessId: string) {
  const [row] = await getDb()
    .select()
    .from(promptPrs)
    .where(and(eq(promptPrs.id, id), eq(promptPrs.businessId, businessId)));
  if (!row) throw new Error("Prompt PR not found");
  const [base] = await getDb().query.promptVersions.findMany({
    where: (table, { eq: equal }) => equal(table.id, row.baseVersionId),
    limit: 1,
  });
  if (!base) throw new Error("Base prompt version not found");
  const draft = PromptPRSchema.parse({
    title: row.title,
    problem: row.problem,
    evidence: row.evidence,
    change: row.change,
    expected_impact: row.expectedImpact,
    risk: row.risk,
    confidence:
      Number(row.confidence) >= 0.8
        ? "high"
        : Number(row.confidence) >= 0.5
          ? "medium"
          : "low",
  });
  const validation = validatePromptPR(
    base.body,
    draft,
    (row.evidence as Array<{ call_id: string; quote: string }>).map((e) => ({
      id: e.call_id,
      transcript: e.quote,
    })),
  );
  if (!validation.candidate)
    throw new Error("Stored Prompt PR no longer validates");
  return { row, base, candidate: validation.candidate };
}
