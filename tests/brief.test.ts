import { describe, expect, it } from "vitest";
import { verifyCronAuthorization } from "@/lib/brief/cron";
import {
  dropUngroundedNumbers,
  inspectNarrativeNumbers,
} from "@/lib/brief/guard";
import {
  buildBriefFacts,
  buildBriefScripts,
  scriptWordCount,
} from "@/lib/brief/scripts";
import {
  BriefMetricsSchema,
  BriefNarrativeSchema,
  type BriefMetrics,
  type BriefNarrative,
} from "@/lib/brief/types";
import { evaluateContact } from "@/lib/compliance/gate";

const metrics: BriefMetrics = BriefMetricsSchema.parse({
  businessId: "11111111-1111-4111-8111-111111111111",
  date: "2026-10-31",
  timezone: "Asia/Kolkata",
  calls: { attempted: 18, connected: 11, connectRate: 61.1 },
  promisedToday: { count: 4, amountPaise: "4200000" },
  collectedToday: {
    count: 2,
    amountPaise: "950000",
    simulatedAmountPaise: "0",
  },
  promisesDueToday: {
    kept: { count: 1, amountPaise: "200000" },
    partiallyKept: { count: 1, amountPaise: "100000" },
    broken: { count: 1, amountPaise: "500000" },
  },
  forecast7dPaise: "1800000",
  compliance: {
    newDisputes: 1,
    optOuts: 0,
    gateBlocks: { total: 3, byRule: [{ rule: "R5_calling_window", count: 3 }] },
    supervisorFlags: { total: 0, byRule: [] },
    postCallFlags: { total: 1, byRule: [{ rule: "disclosure", count: 1 }] },
  },
  brokenPromises: [
    {
      debtorId: "22222222-2222-4222-8222-222222222222",
      shop: "Sharma General Store",
      amountPaise: "500000",
      daysLate: 5,
    },
  ],
  tomorrowQueue: [
    {
      debtorId: "22222222-2222-4222-8222-222222222222",
      shop: "Sharma General Store",
      score: 84,
      nextAction: "call_today",
    },
  ],
  connectRateByHour: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    attempted: hour === 12 ? 18 : 0,
    connected: hour === 12 ? 11 : 0,
    rate: hour === 12 ? 61.1 : 0,
  })),
  connectRateByLanguage: [
    { language: "hi", attempted: 18, connected: 11, rate: 61.1 },
    { language: "en", attempted: 0, connected: 0, rate: 0 },
    { language: "mr", attempted: 0, connected: 0, rate: 0 },
  ],
  agentQuality: {
    averageScore: 4,
    scoredCalls: 11,
    mostCommonFailedTheme: "Late identity check",
    themeCount: 1,
  },
  last7Days: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${25 + index}`,
    promisedPaise: index === 6 ? "4200000" : "0",
    collectedPaise: index === 6 ? "950000" : "0",
  })),
});

const narrative: BriefNarrative = BriefNarrativeSchema.parse({
  headline: "Cash promises rose while one account needs attention",
  summary:
    "Collections were steady. Calling-hour blocks protected customer trust.",
  wins: ["Calling-hour controls held back 3 calls."],
  risks: ["One broken promise needs owner attention."],
  needs_owner: [
    {
      debtor_id: "22222222-2222-4222-8222-222222222222",
      shop: "Sharma General Store",
      why: "The promise is 5 days late.",
      suggested_action: "Call and agree a new date.",
    },
  ],
  insights: [
    { text: "Midday connected best.", evidence: "11 of 18 calls connected." },
  ],
  tomorrow_focus: "Start with Sharma General Store.",
});

describe("daily management brief", () => {
  it("catches an injected number that does not exist in metrics", () => {
    const unsafe = { ...narrative, summary: "Collected ₹9,999 today." };
    expect(inspectNarrativeNumbers(unsafe, metrics).offending).toContain(
      "₹9,999",
    );
    expect(dropUngroundedNumbers(unsafe, metrics).summary).not.toContain(
      "9,999",
    );
  });

  it("keeps both scripts under 170 words and facts under 1,500 characters", () => {
    const scripts = buildBriefScripts(metrics, narrative, "Rakesh");
    expect(scriptWordCount(scripts.scriptHi)).toBeLessThanOrEqual(170);
    expect(scriptWordCount(scripts.scriptEn)).toBeLessThanOrEqual(170);
    expect(buildBriefFacts(metrics, narrative).length).toBeLessThanOrEqual(
      1500,
    );
  });

  it("exempts owner briefs from debtor rules but never the allowlist", () => {
    const base = {
      purpose: "owner_brief" as const,
      debtor: { status: "active", firstContactDisclosedAt: null },
      business: {
        callWindowStart: "09:00",
        callWindowEnd: "18:30",
        maxAttemptsPerDay: 3,
        maxAttemptsPerWeek: 8,
        minGapHours: 4,
      },
      now: new Date("2026-10-31T16:30:00Z"),
      toNumber: "+919876543210",
      attemptsToday: 99,
      attemptsThisWeek: 99,
      lastAttemptAt: new Date(),
      optedOut: true,
      disputeOpen: true,
      hardship: true,
      activePromise: { date: "2026-11-04" },
      demoMode: true,
      demoOverride: false,
    };
    expect(evaluateContact({ ...base, allowlist: [] }).allowed).toBe(false);
    const allowed = evaluateContact({ ...base, allowlist: [base.toNumber] });
    expect(allowed.allowed).toBe(true);
    expect(allowed.rules.slice(1).every((rule) => rule.passed)).toBe(true);
  });

  it("checks cron bearer credentials in constant-time form", () => {
    const secret = "sixteen-character-cron-secret";
    expect(verifyCronAuthorization(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyCronAuthorization("Bearer wrong", secret)).toBe(false);
    expect(verifyCronAuthorization(null, secret)).toBe(false);
  });
});
