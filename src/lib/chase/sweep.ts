import { and, eq, lt, sql } from "drizzle-orm";
import { recomputeRating } from "@/lib/chase/recompute";
import { getDb } from "@/lib/db";
import { payments, promises } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { istDay } from "@/lib/time";

export function promiseResolution(paidPaise: bigint, promisedPaise: bigint) {
  if (paidPaise < 0n || promisedPaise <= 0n)
    throw new Error(
      "Promise resolution requires non-negative payment and positive promise",
    );
  return paidPaise >= promisedPaise
    ? ("kept" as const)
    : paidPaise > 0n
      ? ("partially_kept" as const)
      : ("broken" as const);
}

export async function sweepPromises(now = new Date()) {
  const db = getDb();
  const pending = await db
    .select()
    .from(promises)
    .where(
      and(
        eq(promises.status, "pending"),
        lt(promises.promisedFor, istDay(now)),
      ),
    );
  const affected = new Set<string>();
  for (const promise of pending) {
    const [paid] = await db
      .select({
        amount: sql<string>`coalesce(sum(${payments.amountPaise}),0)::text`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.debtorId, promise.debtorId),
          sql`${payments.receivedAt} >= ${promise.createdAt.toISOString()}`,
        ),
      );
    const amount = BigInt(paid?.amount ?? "0");
    const status = promiseResolution(amount, promise.amountPaise);
    await db
      .update(promises)
      .set({ status, resolvedAt: now })
      .where(and(eq(promises.id, promise.id), eq(promises.status, "pending")));
    affected.add(promise.debtorId);
    await emitEvent("promise.swept", {
      debtorId: promise.debtorId,
      callId: promise.callId ?? undefined,
      payload: { promiseId: promise.id, status, paidPaise: amount.toString() },
    });
  }
  for (const debtorId of affected) await recomputeRating(debtorId, now);
  return { swept: pending.length, affected: affected.size };
}
