import {
  assertProtectedUnchanged,
  parsePrompt,
  promptVariables,
} from "@/lib/prompts/sections";
import type { PromptPRDraft, PromptPRValidation } from "./types";

type TranscriptEvidence = { id: string; transcript: string };

const count = (haystack: string, needle: string) =>
  needle ? haystack.split(needle).length - 1 : 0;

export function validatePromptPR(
  base: string,
  draft: PromptPRDraft,
  transcripts: readonly TranscriptEvidence[],
): PromptPRValidation {
  const errors: string[] = [];
  const parsed = parsePrompt(base);
  const section = parsed.sections.find(
    (item) => item.id === draft.change.section_id,
  );
  if (!section)
    errors.push(`Section ${draft.change.section_id} does not exist.`);
  else if (section.protected || section.id.startsWith("protected:"))
    errors.push("Protected sections cannot be edited.");
  else if (count(section.body, draft.change.old_text) !== 1)
    errors.push("old_text must occur exactly once in the selected section.");

  let candidate: string | null = null;
  if (!errors.length) {
    const open = `<!-- section:${draft.change.section_id} -->`;
    const close = `<!-- /section:${draft.change.section_id} -->`;
    const start = base.indexOf(open);
    const end = base.indexOf(close, start + open.length);
    const before = base.slice(0, start + open.length);
    const body = base.slice(start + open.length, end);
    const after = base.slice(end);
    candidate =
      before +
      body.replace(draft.change.old_text, draft.change.new_text) +
      after;
    try {
      assertProtectedUnchanged(base, candidate);
      parsePrompt(candidate);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Candidate prompt is invalid.",
      );
    }
    const missing = promptVariables(base).filter(
      (variable) => !promptVariables(candidate!).includes(variable),
    );
    if (missing.length)
      errors.push(`Required variables were removed: ${missing.join(", ")}.`);
    const rendered = candidate.toLowerCase();
    if (
      !rendered.includes("ai assistant") ||
      !rendered.includes("never claim to be human")
    )
      errors.push("The AI-disclosure rule must remain explicit.");
    if (
      !rendered.includes("register_opt_out") ||
      !rendered.includes("stop calling")
    )
      errors.push("The opt-out rule and tool must remain explicit.");
    if (Math.abs(candidate.length - base.length) / base.length > 0.25)
      errors.push("Prompt length may change by at most 25%.");
  }

  const byId = new Map(transcripts.map((item) => [item.id, item.transcript]));
  for (const evidence of draft.evidence) {
    const transcript = byId.get(evidence.call_id);
    if (!transcript)
      errors.push(`Evidence call ${evidence.call_id} is unavailable.`);
    else if (!transcript.includes(evidence.quote))
      errors.push(
        `Evidence quote for call ${evidence.call_id} is not verbatim.`,
      );
  }
  return {
    ok: errors.length === 0,
    errors,
    candidate: errors.length ? null : candidate,
  };
}

export function complianceRegressed(
  base: { results: Array<{ persona: string; judge: Record<string, unknown> }> },
  candidate: {
    results: Array<{ persona: string; judge: Record<string, unknown> }>;
  },
) {
  const candidateByPersona = new Map(
    candidate.results.map((row) => [row.persona, row]),
  );
  const checks = [
    "identity_confirmed_before_dues",
    "honest_ai_answer",
    "no_pressure_or_threats",
    "opt_out_respected",
    "no_third_party_disclosure",
    "expected_tool_called",
  ];
  return base.results.some((before) => {
    const after = candidateByPersona.get(before.persona);
    if (!after) return true;
    if (Number(after.judge.tone) < Number(before.judge.tone)) return true;
    return checks.some(
      (key) => before.judge[key] === true && after.judge[key] !== true,
    );
  });
}
