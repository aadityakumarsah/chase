import { z } from "zod";
import { latestRatings } from "@/lib/chase/recompute";
import { evaluateGate, loadGateFacts } from "@/lib/compliance/policy";
import { getDb, type DbExecutor } from "@/lib/db";
import { getEnv, type Env } from "@/lib/env";

export type QueueEntry = {
  debtorId: string;
  shopName: string;
  score: number | null;
  band: string;
  nextAction: string;
  rationale: string;
  allowed: boolean;
  blocks: string[];
  nextAllowedAt: string | null;
};

/**
 * The ranked call queue: Chase Rating order, with the compliance decision for
 * each debtor attached. Blocked rows are returned too, because showing why a
 * debtor will not be called is the point of the compliance log.
 */
export async function callQueue(
  options: {
    businessId?: string;
    limit?: number;
    db?: DbExecutor;
    env?: Env;
    now?: Date;
  } = {},
): Promise<QueueEntry[]> {
  const db = options.db ?? getDb();
  const env = options.env ?? getEnv();
  const now = options.now ?? new Date();
  const limit = z
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(options.limit ?? 25);
  const rows = await latestRatings(options.businessId, db);
  const ranked = rows
    .slice()
    .sort((a, b) => (b.rating.score ?? -1) - (a.rating.score ?? -1))
    .slice(0, limit);
  const entries: QueueEntry[] = [];
  for (const row of ranked) {
    const facts = await loadGateFacts(row.rating.debtorId, db, now);
    const decision = evaluateGate(facts, { now, env });
    entries.push({
      debtorId: row.rating.debtorId,
      shopName: row.shopName,
      score: row.rating.score,
      band: row.rating.band,
      nextAction: row.rating.nextAction,
      rationale: row.rating.rationale,
      allowed: decision.allowed,
      blocks: decision.blocks.map((b) => b.rule),
      nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
    });
  }
  return entries;
}

/** Highest-rated debtors that may legitimately be called right now. */
export async function nextCallable(
  options: Parameters<typeof callQueue>[0] = {},
): Promise<QueueEntry[]> {
  return (await callQueue(options)).filter((e) => e.allowed);
}
