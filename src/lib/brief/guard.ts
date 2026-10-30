import {
  BriefNarrativeSchema,
  type BriefMetrics,
  type BriefNarrative,
} from "./types";

const numericToken =
  /₹?\s*(?<![\p{L}\p{N}_-])\d[\d,]*(?:\.\d+)?%?(?![\p{L}\p{N}_-])/gu;
const canonical = (value: string | number) => {
  const number = Number(String(value).replace(/[₹,%\s,]/g, ""));
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(6)).toString();
};

function allowedNumbers(metrics: BriefMetrics) {
  const allowed = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "number") {
      const normalized = canonical(value);
      if (normalized) allowed.add(normalized);
      return;
    }
    if (
      typeof value === "string" &&
      /paise$/i.test(key) &&
      /^\d+$/.test(value)
    ) {
      const raw = canonical(value);
      const rupees = canonical(Number(value) / 100);
      if (raw) allowed.add(raw);
      if (rupees) allowed.add(rupees);
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (value && typeof value === "object")
      for (const [childKey, child] of Object.entries(value))
        visit(child, childKey);
  };
  visit(metrics);
  return allowed;
}

function narrativeStrings(narrative: BriefNarrative) {
  return [
    narrative.headline,
    narrative.summary,
    ...narrative.wins,
    ...narrative.risks,
    ...narrative.needs_owner.flatMap((item) => [
      item.shop,
      item.why,
      item.suggested_action,
    ]),
    ...narrative.insights.flatMap((item) => [item.text, item.evidence]),
    narrative.tomorrow_focus,
  ];
}

export function inspectNarrativeNumbers(
  narrative: BriefNarrative,
  metrics: BriefMetrics,
) {
  const allowed = allowedNumbers(metrics);
  const tokens = narrativeStrings(narrative).flatMap(
    (value) => value.match(numericToken) ?? [],
  );
  const offending = tokens.filter((token) => {
    const value = canonical(token);
    return value !== null && !allowed.has(value);
  });
  return {
    tokens: [...new Set(tokens)],
    offending: [...new Set(offending)],
  };
}

const safeText = (value: string, metrics: BriefMetrics) => {
  const parts = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value];
  return parts
    .filter(
      (part) =>
        inspectNarrativeNumbers(
          BriefNarrativeSchema.parse({
            headline: "Verified daily brief",
            summary: part.trim() || "Verified facts are available.",
            wins: [],
            risks: [],
            needs_owner: [],
            insights: [],
            tomorrow_focus: "Review the verified queue.",
          }),
          metrics,
        ).offending.length === 0,
    )
    .join(" ")
    .trim();
};

/** Last-resort safety: remove prose containing an ungrounded number, never alter a number. */
export function dropUngroundedNumbers(
  narrative: BriefNarrative,
  metrics: BriefMetrics,
): BriefNarrative {
  const valid = (value: string) => safeText(value, metrics);
  const safeItem = (...values: string[]) =>
    inspectNarrativeNumbers(
      BriefNarrativeSchema.parse({
        headline: "Verified daily brief",
        summary: "Verified facts are available.",
        wins: values,
        risks: [],
        needs_owner: [],
        insights: [],
        tomorrow_focus: "Review the verified queue.",
      }),
      metrics,
    ).offending.length === 0;
  return BriefNarrativeSchema.parse({
    headline: valid(narrative.headline) || "Your verified daily brief is ready",
    summary:
      valid(narrative.summary) || "Review today’s verified collections facts.",
    wins: narrative.wins.filter((item) => safeItem(item)),
    risks: narrative.risks.filter((item) => safeItem(item)),
    needs_owner: narrative.needs_owner.filter((item) =>
      safeItem(item.shop, item.why, item.suggested_action),
    ),
    insights: narrative.insights.filter((item) =>
      safeItem(item.text, item.evidence),
    ),
    tomorrow_focus:
      valid(narrative.tomorrow_focus) ||
      "Start with the verified priority queue.",
  });
}
