import { spokenAmountEn, spokenAmountHi } from "@/lib/money";
import {
  BriefMetricsSchema,
  BriefNarrativeSchema,
  type BriefMetrics,
  type BriefNarrative,
} from "./types";

const rupees = (paise: string) => Number(BigInt(paise)) / 100;
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);
const capWords = (value: string, close: string) => {
  const all = words(value);
  if (all.length <= 170) return value.trim();
  return `${all.slice(0, 168).join(" ")} ${close}`;
};
const shops = (narrative: BriefNarrative) =>
  narrative.needs_owner
    .slice(0, 3)
    .map((item) => item.shop)
    .join(", ");

export function buildBriefScripts(
  metricsInput: BriefMetrics,
  narrativeInput: BriefNarrative,
  ownerName: string,
) {
  const metrics = BriefMetricsSchema.parse(metricsInput);
  const narrative = BriefNarrativeSchema.parse(narrativeInput);
  const broken = metrics.brokenPromises[0];
  const ownerAccounts = shops(narrative);
  const insight = narrative.insights[0]?.text;

  const scriptHi = capWords(
    [
      `नमस्ते ${ownerName} जी। आज का Chase brief: ${metrics.calls.attempted} calls, जिनमें ${metrics.calls.connected} connect हुए।`,
      `${spokenAmountHi(rupees(metrics.promisedToday.amountPaise))} के promises मिले और ${spokenAmountHi(rupees(metrics.collectedToday.amountPaise))} collect हुए।`,
      narrative.headline,
      broken
        ? `${broken.shop} का ${spokenAmountHi(rupees(broken.amountPaise))} promise ${broken.daysLate} दिन late है।`
        : "आज कोई पुराना broken promise priority list में नहीं है।",
      ownerAccounts
        ? `आपकी मदद चाहिए: ${ownerAccounts}।`
        : "अभी owner intervention की कोई verified जरूरत नहीं है।",
      insight
        ? `एक insight: ${insight}`
        : "आज कोई additional verified insight नहीं है।",
      `कल का focus: ${narrative.tomorrow_focus}`,
      "Dashboard में पूरी list और evidence तैयार है। धन्यवाद।",
    ].join(" "),
    "धन्यवाद।",
  );

  const scriptEn = capWords(
    [
      `Hello ${ownerName}. Today’s Chase brief: ${metrics.calls.attempted} calls, with ${metrics.calls.connected} connected.`,
      `We received ${spokenAmountEn(rupees(metrics.promisedToday.amountPaise))} in new promises and collected ${spokenAmountEn(rupees(metrics.collectedToday.amountPaise))}.`,
      narrative.headline,
      broken
        ? `${broken.shop} has a ${spokenAmountEn(rupees(broken.amountPaise))} promise that is ${broken.daysLate} days late.`
        : "There is no older broken promise in today’s priority list.",
      ownerAccounts
        ? `Your help is needed with ${ownerAccounts}.`
        : "There is no verified owner intervention needed right now.",
      insight
        ? `One insight: ${insight}`
        : "There is no additional verified insight today.",
      `Tomorrow’s focus: ${narrative.tomorrow_focus}`,
      "The full list and evidence are ready on the dashboard. Thank you.",
    ].join(" "),
    "Thank you.",
  );

  return { scriptHi, scriptEn };
}

export function buildBriefFacts(
  metricsInput: BriefMetrics,
  narrativeInput: BriefNarrative,
) {
  const metrics = BriefMetricsSchema.parse(metricsInput);
  const narrative = BriefNarrativeSchema.parse(narrativeInput);
  const lines = [
    `Date ${metrics.date} IST. Calls ${metrics.calls.attempted}; connected ${metrics.calls.connected}; connect rate ${metrics.calls.connectRate}%.`,
    `New promises ${spokenAmountEn(rupees(metrics.promisedToday.amountPaise))} across ${metrics.promisedToday.count}. Collected ${spokenAmountEn(rupees(metrics.collectedToday.amountPaise))} across ${metrics.collectedToday.count}.`,
    `Promise forecast ${spokenAmountEn(rupees(metrics.forecast7dPaise))}. Gate blocks ${metrics.compliance.gateBlocks.total}; disputes ${metrics.compliance.newDisputes}; opt-outs ${metrics.compliance.optOuts}.`,
  ];
  const add = (line: string) => {
    if ([...lines, line].join("\n").length <= 1500) lines.push(line);
  };
  for (const item of metrics.brokenPromises)
    add(
      `Broken: ${item.shop}; ${spokenAmountEn(rupees(item.amountPaise))}; ${item.daysLate} days late.`,
    );
  for (const item of narrative.needs_owner)
    add(
      `Owner: ${item.shop}; why ${item.why}; action ${item.suggested_action}.`,
    );
  for (const item of metrics.tomorrowQueue)
    add(
      `Queue: ${item.shop}; score ${item.score}; ${item.nextAction.replaceAll("_", " ")}.`,
    );
  const facts = lines.join("\n");
  if (facts.length > 1500)
    throw new Error("Brief facts exceed 1,500 characters");
  return facts;
}

export function scriptWordCount(script: string) {
  return words(script).length;
}
