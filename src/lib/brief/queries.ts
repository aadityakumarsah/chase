import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { briefs } from "@/lib/db/schema";
import {
  briefDeliveryStateSchema,
  BriefMetricsSchema,
  BriefNarrativeSchema,
} from "./types";

const serialize = (row: typeof briefs.$inferSelect) => ({
  id: row.id,
  forDate: row.forDate,
  metrics: BriefMetricsSchema.parse(row.metrics),
  narrative: BriefNarrativeSchema.parse(row.narrative),
  scriptHi: row.scriptHi,
  scriptEn: row.scriptEn,
  delivered: briefDeliveryStateSchema.catch({}).parse(row.delivered),
  callId: row.callId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function getBriefPage(date?: string) {
  if (date) z.iso.date().parse(date);
  const rows = await getDb()
    .select()
    .from(briefs)
    .where(date ? eq(briefs.forDate, date) : undefined)
    .orderBy(desc(briefs.forDate), desc(briefs.createdAt))
    .limit(date ? 1 : 30);
  const latest = rows[0] ? serialize(rows[0]) : null;
  const historyRows = date
    ? await getDb()
        .select()
        .from(briefs)
        .orderBy(desc(briefs.forDate))
        .limit(30)
    : rows;
  return {
    brief: latest,
    history: historyRows.map((row) => ({
      id: row.id,
      forDate: row.forDate,
      headline: BriefNarrativeSchema.parse(row.narrative).headline,
    })),
  };
}
