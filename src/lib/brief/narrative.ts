import { z } from "zod";
import { getLLM, type LLMProvider } from "@/lib/llm";
import {
  BriefMetricsSchema,
  BriefNarrativeDraftSchema,
  BriefNarrativeSchema,
  type BriefMetrics,
} from "./types";
import { dropUngroundedNumbers, inspectNarrativeNumbers } from "./guard";

const SYSTEM = `You write the Daily Management Brief for a busy Indian small-business owner.
Use only facts and numbers present in metrics. Never estimate, calculate a new figure, or invent.
Owner summaries are qualitative evidence only; any number in them must already appear in metrics.
Money fields ending in Paise are integer paise. Express them as rupees (divide exactly by 100); never say “paise” in the narrative.
Present compliance as an operating strength, for example: “3 calls were held back outside calling hours.”
Use plain words, short sentences, and no collections jargon. Do not claim legal certification.
The deterministic application, not you, calculates every metric.`;

export async function generateBriefNarrative(
  metricsInput: BriefMetrics,
  ownerSummaries: Array<{ debtor_id: string; shop: string; summary: string }>,
  provider: LLMProvider = getLLM(),
) {
  const metrics = BriefMetricsSchema.parse(metricsInput);
  const normalize = (value: z.infer<typeof BriefNarrativeDraftSchema>) => {
    const money = (text: string) =>
      text.replace(/\b(\d[\d,]*(?:\.\d+)?)\s+paise\b/gi, (_, raw: string) => {
        const paise = Number(raw.replaceAll(",", ""));
        return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(paise / 100)} rupees`;
      });
    const normalized = {
      ...value,
      headline: money(value.headline),
      summary: money(value.summary),
      wins: value.wins.map(money),
      risks: value.risks.map(money),
      needs_owner: value.needs_owner.map((item) => ({
        ...item,
        why: money(item.why),
        suggested_action: money(item.suggested_action),
      })),
      insights: value.insights.map((item) => ({
        text: money(item.text),
        evidence: money(item.evidence),
      })),
      tomorrow_focus: money(value.tomorrow_focus),
    };
    const headlineSentences = normalized.headline.match(
      /[^.!?]+[.!?]+|[^.!?]+$/g,
    ) ?? [normalized.headline];
    const firstHeadline = headlineSentences[0]!.trim();
    const headline =
      firstHeadline.split(/\s+/).length <= 14
        ? firstHeadline
        : firstHeadline.split(/\s+/).slice(0, 14).join(" ");
    const summary = (
      normalized.summary.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [
        normalized.summary,
      ]
    )
      .slice(0, 3)
      .join(" ")
      .trim();
    return BriefNarrativeSchema.parse({ ...normalized, headline, summary });
  };
  const request = (content: string) =>
    provider.generateObject({
      task: "brief",
      schema: BriefNarrativeDraftSchema,
      schemaName: "daily_management_brief",
      maxTokens: 3000,
      system: [{ text: SYSTEM, cache: true }],
      messages: [{ role: "user" as const, content }],
    });

  const first = await request(
    JSON.stringify({ metrics, owner_summaries: ownerSummaries }),
  );
  const firstValue = normalize(first.value);
  const firstCheck = inspectNarrativeNumbers(firstValue, metrics);
  if (!firstCheck.offending.length)
    return {
      narrative: firstValue,
      provider: first.provider,
      model: first.model,
      guard: { regenerated: false, dropped: false, offending: [] as string[] },
    };

  const second = await request(
    JSON.stringify({
      metrics,
      owner_summaries: ownerSummaries,
      previous_narrative: firstValue,
      instruction:
        "Regenerate the entire narrative. Remove or replace every offending number using only an exact metric value.",
      offending_numbers: firstCheck.offending,
    }),
  );
  const secondValue = normalize(second.value);
  const secondCheck = inspectNarrativeNumbers(secondValue, metrics);
  if (!secondCheck.offending.length)
    return {
      narrative: secondValue,
      provider: second.provider,
      model: second.model,
      guard: {
        regenerated: true,
        dropped: false,
        offending: firstCheck.offending,
      },
    };

  return {
    narrative: dropUngroundedNumbers(secondValue, metrics),
    provider: second.provider,
    model: second.model,
    guard: {
      regenerated: true,
      dropped: true,
      offending: secondCheck.offending,
    },
  };
}
