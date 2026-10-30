import { z } from "zod";

export const paiseSchema = z.string().regex(/^\d+$/);
const countMoneySchema = z.strictObject({
  count: z.number().int().nonnegative(),
  amountPaise: paiseSchema,
});
const rateSchema = z.number().finite().min(0).max(100);
const ruleCountSchema = z.strictObject({
  rule: z.string().min(1).max(120),
  count: z.number().int().nonnegative(),
});

export const BriefMetricsSchema = z.strictObject({
  businessId: z.uuid(),
  date: z.iso.date(),
  timezone: z.literal("Asia/Kolkata"),
  calls: z.strictObject({
    attempted: z.number().int().nonnegative(),
    connected: z.number().int().nonnegative(),
    connectRate: rateSchema,
  }),
  promisedToday: countMoneySchema,
  collectedToday: countMoneySchema.extend({
    simulatedAmountPaise: paiseSchema,
  }),
  promisesDueToday: z.strictObject({
    kept: countMoneySchema,
    partiallyKept: countMoneySchema,
    broken: countMoneySchema,
  }),
  forecast7dPaise: paiseSchema,
  compliance: z.strictObject({
    newDisputes: z.number().int().nonnegative(),
    optOuts: z.number().int().nonnegative(),
    gateBlocks: z.strictObject({
      total: z.number().int().nonnegative(),
      byRule: z.array(ruleCountSchema).max(50),
    }),
    supervisorFlags: z.strictObject({
      total: z.number().int().nonnegative(),
      byRule: z.array(ruleCountSchema).max(50),
    }),
    postCallFlags: z.strictObject({
      total: z.number().int().nonnegative(),
      byRule: z.array(ruleCountSchema).max(50),
    }),
  }),
  brokenPromises: z
    .array(
      z.strictObject({
        debtorId: z.uuid(),
        shop: z.string().min(1).max(200),
        amountPaise: paiseSchema,
        daysLate: z.number().int().nonnegative(),
      }),
    )
    .max(5),
  tomorrowQueue: z
    .array(
      z.strictObject({
        debtorId: z.uuid(),
        shop: z.string().min(1).max(200),
        score: z.number().int().min(0).max(100),
        nextAction: z.string().min(1).max(80),
      }),
    )
    .max(10),
  connectRateByHour: z
    .array(
      z.strictObject({
        hour: z.number().int().min(0).max(23),
        attempted: z.number().int().nonnegative(),
        connected: z.number().int().nonnegative(),
        rate: rateSchema,
      }),
    )
    .length(24),
  connectRateByLanguage: z.array(
    z.strictObject({
      language: z.enum(["hi", "en", "mr"]),
      attempted: z.number().int().nonnegative(),
      connected: z.number().int().nonnegative(),
      rate: rateSchema,
    }),
  ),
  agentQuality: z.strictObject({
    averageScore: z.number().finite().min(1).max(5).nullable(),
    scoredCalls: z.number().int().nonnegative(),
    mostCommonFailedTheme: z.string().max(400).nullable(),
    themeCount: z.number().int().nonnegative(),
  }),
  last7Days: z
    .array(
      z.strictObject({
        date: z.iso.date(),
        promisedPaise: paiseSchema,
        collectedPaise: paiseSchema,
      }),
    )
    .length(7),
});

export type BriefMetrics = z.infer<typeof BriefMetricsSchema>;

const sentenceCount = (value: string) =>
  (value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).length;
const wordCount = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).length;

export const BriefNarrativeDraftSchema = z.strictObject({
  headline: z.string().min(1).max(180),
  summary: z.string().min(1).max(900),
  wins: z.array(z.string().min(1).max(300)).max(3),
  risks: z.array(z.string().min(1).max(300)).max(3),
  needs_owner: z
    .array(
      z.strictObject({
        debtor_id: z.uuid(),
        shop: z.string().min(1).max(200),
        why: z.string().min(1).max(300),
        suggested_action: z.string().min(1).max(300),
      }),
    )
    .max(5),
  insights: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(400),
        evidence: z.string().min(1).max(400),
      }),
    )
    .max(3),
  tomorrow_focus: z.string().min(1).max(500),
});

export const BriefNarrativeSchema = BriefNarrativeDraftSchema.refine(
  (value) => wordCount(value.headline) <= 14,
  { path: ["headline"], message: "Headline must be 14 words or fewer" },
).refine((value) => sentenceCount(value.summary) <= 3, {
  path: ["summary"],
  message: "Summary must be at most three sentences",
});

export type BriefNarrative = z.infer<typeof BriefNarrativeSchema>;

export const deliveryChannelSchema = z.enum(["dashboard", "message", "call"]);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

const deliveryEntrySchema = z.object({
  at: z.iso.datetime(),
  status: z.string().min(1).max(80),
  id: z.string().max(200).optional(),
});
export const briefDeliveryStateSchema = z.strictObject({
  dashboard: deliveryEntrySchema.optional(),
  message: deliveryEntrySchema.optional(),
  call: deliveryEntrySchema.optional(),
});
export type BriefDeliveryState = z.infer<typeof briefDeliveryStateSchema>;
