import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { briefs } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { istDay } from "@/lib/time";
import { deliverBrief } from "./delivery";
import { getBriefMetrics, ownerSummariesForDay } from "./metrics";
import { generateBriefNarrative } from "./narrative";
import { buildBriefScripts } from "./scripts";
import {
  briefDeliveryStateSchema,
  BriefMetricsSchema,
  BriefNarrativeSchema,
  deliveryChannelSchema,
  type DeliveryChannel,
} from "./types";

const runSchema = z.object({
  date: z.union([z.iso.date(), z.literal("today")]).optional(),
  deliver: z.array(deliveryChannelSchema).min(1).max(3).default(["dashboard"]),
  businessId: z.uuid().optional(),
});

export async function runDailyBrief(input: z.input<typeof runSchema> = {}) {
  const parsed = runSchema.parse(input);
  const date =
    !parsed.date || parsed.date === "today" ? istDay(new Date()) : parsed.date;
  const existing = await findBrief(date, parsed.businessId);
  let brief = existing;
  const existingDelivery = existing
    ? briefDeliveryStateSchema.catch({}).parse(existing.delivered)
    : {};
  const externallyDelivered = Boolean(
    existing?.callId ||
    existingDelivery.message ||
    (existingDelivery.call && existingDelivery.call.status !== "blocked"),
  );
  let generation:
    | { provider: string; model: string; guard: Record<string, unknown> }
    | undefined;
  if (!brief || !externallyDelivered) {
    const metrics = await getBriefMetrics({
      date,
      businessId: parsed.businessId,
    });
    const summaries = await ownerSummariesForDay(metrics);
    const generated = await generateBriefNarrative(metrics, summaries);
    const scripts = buildBriefScripts(
      metrics,
      generated.narrative,
      await ownerName(metrics.businessId),
    );
    generation = {
      provider: generated.provider,
      model: generated.model,
      guard: generated.guard,
    };
    const values = {
      businessId: metrics.businessId,
      forDate: metrics.date,
      metrics,
      narrative: generated.narrative,
      scriptHi: scripts.scriptHi,
      scriptEn: scripts.scriptEn,
    };
    if (brief) {
      const [updated] = await getDb()
        .update(briefs)
        .set(values)
        .where(eq(briefs.id, brief.id))
        .returning();
      brief = updated;
    } else {
      const [inserted] = await getDb()
        .insert(briefs)
        .values(values)
        .onConflictDoNothing()
        .returning();
      brief = inserted ?? (await findBrief(metrics.date, metrics.businessId));
    }
    if (!brief) throw new Error("Brief persistence failed");
    await emitEvent("brief.ready", {
      payload: {
        briefId: brief.id,
        date: brief.forDate,
        provider: generated.provider,
        model: generated.model,
        refreshed: Boolean(existing),
      },
    });
  }
  const deliveries = await deliverBrief(
    brief.id,
    parsed.deliver as DeliveryChannel[],
  );
  const refreshed = (await findBrief(brief.forDate, brief.businessId))!;
  return {
    brief: {
      ...refreshed,
      metrics: BriefMetricsSchema.parse(refreshed.metrics),
      narrative: BriefNarrativeSchema.parse(refreshed.narrative),
    },
    generation,
    deliveries,
  };
}

async function ownerName(businessId: string) {
  const { businesses } = await import("@/lib/db/schema");
  const [business] = await getDb()
    .select({ ownerName: businesses.ownerName })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!business) throw new Error("Business not found");
  return business.ownerName;
}

async function findBrief(date: string, businessId?: string) {
  const conditions = [eq(briefs.forDate, date)];
  if (businessId) conditions.push(eq(briefs.businessId, businessId));
  const [row] = await getDb()
    .select()
    .from(briefs)
    .where(and(...conditions))
    .orderBy(desc(briefs.createdAt))
    .limit(1);
  return row;
}
