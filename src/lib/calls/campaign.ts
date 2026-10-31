import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { getBolnaClient } from "@/lib/bolna/client";
import { latestRatings } from "@/lib/chase/recompute";
import { evaluateDebtorContact } from "@/lib/compliance/contact";
import { getDb } from "@/lib/db";
import { callbacks, debtors } from "@/lib/db/schema";
import { maskPhone } from "@/lib/phone";
import { startCollectionCall } from "./dial";

export const campaignInputSchema = z.object({
  /** The workspace whose queue is being worked. Never taken from the client. */
  businessId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  dryRun: z.boolean().default(true),
});

function concurrencyLimit(value: unknown) {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const max = Number(record.max ?? record.limit ?? record.total ?? 1);
    const current = Number(record.current ?? record.active ?? record.used ?? 0);
    if (Number.isFinite(max) && Number.isFinite(current))
      return Math.max(0, Math.floor(max - current));
  }
  return 1;
}

export async function runCampaign(input: z.input<typeof campaignInputSchema>) {
  const parsed = campaignInputSchema.parse(input);
  const now = new Date();
  const ratingRows = (await latestRatings(parsed.businessId))
    .filter(({ rating }) =>
      ["call_today", "call_this_week"].includes(rating.nextAction),
    )
    .sort((a, b) => (b.rating.score ?? -1) - (a.rating.score ?? -1));
  const due = await getDb()
    .select({ callback: callbacks, shopName: debtors.shopName })
    .from(callbacks)
    .innerJoin(debtors, eq(debtors.id, callbacks.debtorId))
    .where(
      and(
        eq(callbacks.businessId, parsed.businessId),
        eq(callbacks.status, "scheduled"),
        lte(callbacks.scheduledFor, now),
      ),
    )
    .orderBy(asc(callbacks.scheduledFor));

  const candidates = new Map<
    string,
    { debtorId: string; shopName: string; source: "campaign" | "callback" }
  >();
  for (const row of due)
    candidates.set(row.callback.debtorId, {
      debtorId: row.callback.debtorId,
      shopName: row.shopName,
      source: "callback",
    });
  for (const row of ratingRows)
    if (!candidates.has(row.rating.debtorId))
      candidates.set(row.rating.debtorId, {
        debtorId: row.rating.debtorId,
        shopName: row.shopName,
        source: "campaign",
      });

  const plan = [];
  for (const candidate of [...candidates.values()].slice(0, parsed.limit)) {
    const checked = await evaluateDebtorContact(candidate.debtorId);
    plan.push({
      ...candidate,
      to: maskPhone(checked.debtor.phoneE164),
      allowed: checked.decision.allowed,
      blockedBy: checked.decision.rules
        .filter((rule) => !rule.passed)
        .map((rule) => rule.id),
      nextAllowedAt: checked.decision.nextAllowedAt?.toISOString() ?? null,
    });
  }
  if (parsed.dryRun) return { dryRun: true, plan, dialed: [] };

  const me = await getBolnaClient().getMe();
  const capacity = concurrencyLimit(me.concurrency);
  const selected = plan.filter((item) => item.allowed).slice(0, capacity);
  const dialed: Array<Record<string, unknown>> = [];
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i]!;
    const result = await startCollectionCall(item.debtorId, {
      source: item.source,
      businessId: parsed.businessId,
    });
    if (item.source === "callback" && result.status === "queued")
      await getDb()
        .update(callbacks)
        .set({ status: "done" })
        .where(
          and(
            eq(callbacks.debtorId, item.debtorId),
            eq(callbacks.status, "scheduled"),
            lte(callbacks.scheduledFor, now),
          ),
        );
    dialed.push({ debtorId: item.debtorId, status: result.status });
    if (i < selected.length - 1)
      await new Promise((resolve) =>
        setTimeout(resolve, 3_000 + Math.floor(Math.random() * 2_001)),
      );
  }
  return { dryRun: false, capacity, plan, dialed };
}
