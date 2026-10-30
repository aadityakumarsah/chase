import { eq } from "drizzle-orm";
import { startOwnerBriefCall } from "@/lib/calls/dial";
import { getDb } from "@/lib/db";
import { briefs, businesses, messages } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { enqueueMessage, deliverMessage } from "@/lib/messaging";
import { formatINR } from "@/lib/money";
import {
  briefDeliveryStateSchema,
  BriefMetricsSchema,
  BriefNarrativeSchema,
  type BriefDeliveryState,
  type DeliveryChannel,
} from "./types";

async function loadBrief(briefId: string) {
  const [row] = await getDb()
    .select({ brief: briefs, business: businesses })
    .from(briefs)
    .innerJoin(businesses, eq(businesses.id, briefs.businessId))
    .where(eq(briefs.id, briefId));
  if (!row) throw new Error("Brief not found");
  return row;
}

function state(value: unknown): BriefDeliveryState {
  return briefDeliveryStateSchema.catch({}).parse(value);
}

async function setDelivery(
  briefId: string,
  channel: DeliveryChannel,
  entry: BriefDeliveryState[DeliveryChannel],
) {
  const row = await loadBrief(briefId);
  await getDb()
    .update(briefs)
    .set({ delivered: { ...state(row.brief.delivered), [channel]: entry } })
    .where(eq(briefs.id, briefId));
}

export async function deliverBrief(
  briefId: string,
  channels: readonly DeliveryChannel[],
) {
  const results: Partial<Record<DeliveryChannel, unknown>> = {};
  for (const channel of [...new Set(channels)]) {
    const row = await loadBrief(briefId);
    const delivered = state(row.brief.delivered);
    if (channel === "dashboard") {
      if (!delivered.dashboard)
        await setDelivery(briefId, channel, {
          at: new Date().toISOString(),
          status: "ready",
        });
      results.dashboard = { status: "ready" };
      continue;
    }
    if (channel === "message") {
      if (delivered.message?.status === "sent") {
        results.message = { status: "already_sent", id: delivered.message.id };
        continue;
      }
      const env = getEnv();
      if (!env.OWNER_PHONE) throw new Error("OWNER_PHONE is not configured");
      const metrics = BriefMetricsSchema.parse(row.brief.metrics);
      const narrative = BriefNarrativeSchema.parse(row.brief.narrative);
      const text = `${narrative.headline}\nPromised ${formatINR(Number(metrics.promisedToday.amountPaise))} · Collected ${formatINR(Number(metrics.collectedToday.amountPaise))} · Connect rate ${metrics.calls.connectRate}%\n${env.APP_BASE_URL}/brief/${row.brief.forDate}`;
      const message = await enqueueMessage(
        { to: env.OWNER_PHONE, text, kind: "daily_brief" },
        { dedupeKey: `brief-message:${briefId}` },
      );
      await deliverMessage(message.id);
      const [persisted] = await getDb()
        .select({ status: messages.status })
        .from(messages)
        .where(eq(messages.id, message.id));
      const status = persisted?.status ?? "queued";
      await setDelivery(briefId, channel, {
        at: new Date().toISOString(),
        status,
        id: message.id,
      });
      results.message = { status, id: message.id };
      continue;
    }
    if (row.brief.callId || delivered.call?.status === "queued") {
      results.call = {
        status: "already_started",
        callId: row.brief.callId ?? delivered.call?.id,
      };
      continue;
    }
    const call = await startOwnerBriefCall(briefId);
    await setDelivery(briefId, channel, {
      at: new Date().toISOString(),
      status: call.status,
      ...(call.status === "queued" || call.status === "already_started"
        ? { id: call.callId }
        : {}),
    });
    results.call = call;
  }
  return results;
}
