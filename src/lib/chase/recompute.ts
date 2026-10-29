import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import { chaseRatings, debtors, invoices } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { formatIST } from "@/lib/time";
import { computeRating, explainRating, type RatingInput } from "./rating";
import * as portfolio from "./portfolio";
export async function latestRating(debtorId: string, db: DbExecutor = getDb()) {
  z.uuid().parse(debtorId);
  return (
    (
      await db
        .select()
        .from(chaseRatings)
        .where(eq(chaseRatings.debtorId, debtorId))
        .orderBy(desc(chaseRatings.computedAt), desc(chaseRatings.id))
        .limit(1)
    )[0] ?? null
  );
}
export async function latestRatings(
  businessId?: string,
  db: DbExecutor = getDb(),
) {
  if (businessId) z.uuid().parse(businessId);
  return db
    .selectDistinctOn([chaseRatings.debtorId], {
      rating: chaseRatings,
      shopName: debtors.shopName,
    })
    .from(chaseRatings)
    .innerJoin(debtors, eq(debtors.id, chaseRatings.debtorId))
    .where(businessId ? eq(debtors.businessId, businessId) : undefined)
    .orderBy(
      chaseRatings.debtorId,
      desc(chaseRatings.computedAt),
      desc(chaseRatings.id),
    );
}
function rupees(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Portfolio money exceeds supported rating precision");
  return Number(value) / 100;
}
export async function loadRatingFeatures(
  debtorId: string,
  db: DbExecutor = getDb(),
  now = new Date(),
): Promise<RatingInput> {
  z.uuid().parse(debtorId);
  z.date().parse(now);
  const [debtor] = await db
    .select()
    .from(debtors)
    .where(eq(debtors.id, debtorId));
  if (!debtor) throw new Error("Debtor not found");
  const totals = db
    .select({
      sum: sql<string>`sum(${invoices.amountPaise}-${invoices.paidPaise})::text`.as(
        "total",
      ),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, debtor.businessId),
        sql`${invoices.status} NOT IN ('paid','written_off')`,
      ),
    )
    .groupBy(invoices.debtorId)
    .as("totals");
  const [max] = await db
    .select({ max: sql<string>`coalesce(max(${totals.sum}::bigint),0)::text` })
    .from(totals);
  const today = formatIST(now, "yyyy-MM-dd");
  const amount = await portfolio.outstandingPaise(debtorId, db);
  const stats = await portfolio.promiseStats(debtorId, db);
  const active = await portfolio.activePromise(debtorId, db, today);
  const last = await portfolio.lastOutcome(debtorId, db);
  return {
    outstanding_rupees: rupees(amount),
    portfolio_max_outstanding_rupees: rupees(BigInt(max.max)),
    dpd: await portfolio.daysPastDue(debtorId, today, db),
    attempts_7d: await portfolio.attempts(debtorId, 168, db, now),
    unanswered_streak: await portfolio.unansweredStreak(debtorId, db),
    promises: {
      made: stats.made,
      kept: stats.kept,
      broken: stats.broken,
      partially_kept: stats.partially_kept,
    },
    active_promise: active
      ? { date: active.promisedFor, amount: rupees(active.amountPaise) }
      : null,
    reason_code: last?.reason_code ?? "unknown",
    sentiment: last?.sentiment ?? "unknown",
    status: debtor.status,
    opted_out: await portfolio.isOptedOut(debtorId, db),
    today,
  };
}
export async function recomputeRating(debtorId: string, now = new Date()) {
  z.uuid().parse(debtorId);
  return getDb().transaction(async (tx) => {
    // Serialize recomputations for this debtor so from/to cannot race.
    const [debtor] = await tx
      .select({ id: debtors.id })
      .from(debtors)
      .where(eq(debtors.id, debtorId))
      .for("update");
    if (!debtor) throw new Error("Debtor not found");
    const features = await loadRatingFeatures(debtorId, tx, now);
    const result = computeRating(features);
    const previous = await latestRating(debtorId, tx);
    const [row] = await tx
      .insert(chaseRatings)
      .values({
        debtorId,
        score: result.score,
        band: result.band,
        pPay7d: result.p_pay_7d?.toString() ?? null,
        components: result.components,
        nextAction: result.next_action,
        reasons: result.reasons,
        rationale: explainRating(result),
        computedAt: now,
      })
      .returning();
    if (!previous || previous.score !== result.score)
      await emitEvent(
        "rating.changed",
        {
          debtorId,
          payload: {
            from: previous?.score ?? null,
            to: result.score,
            band: result.band,
            next_action: result.next_action,
          },
        },
        tx,
      );
    return row;
  });
}
