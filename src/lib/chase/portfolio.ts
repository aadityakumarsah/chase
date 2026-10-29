import { and, desc, eq, gte, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import { calls, invoices, promises, optOuts } from "@/lib/db/schema";
import { formatIST } from "@/lib/time";
import { isoDateSchema, reasonCodeSchema, sentimentSchema } from "./rating";
const uuid = (value: string) => z.uuid().parse(value);
export async function outstandingPaise(
  debtorId: string,
  db: DbExecutor = getDb(),
): Promise<bigint> {
  const [row] = await db
    .select({
      value: sql<string>`coalesce(sum(${invoices.amountPaise} - ${invoices.paidPaise}),0)::text`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.debtorId, uuid(debtorId)),
        notInArray(invoices.status, ["paid", "written_off"]),
      ),
    );
  return BigInt(row.value);
}
export async function daysPastDue(
  debtorId: string,
  today: string | Date = formatIST(new Date(), "yyyy-MM-dd"),
  db: DbExecutor = getDb(),
): Promise<number> {
  const day = isoDateSchema.parse(
    today instanceof Date ? formatIST(today, "yyyy-MM-dd") : today,
  );
  const [row] = await db
    .select({ due: sql<string | null>`min(${invoices.dueOn})::text` })
    .from(invoices)
    .where(
      and(
        eq(invoices.debtorId, uuid(debtorId)),
        notInArray(invoices.status, ["paid", "written_off"]),
        sql`${invoices.amountPaise} > ${invoices.paidPaise}`,
      ),
    );
  return row.due
    ? Math.max(
        0,
        Math.round((Date.parse(day) - Date.parse(row.due)) / 86_400_000),
      )
    : 0;
}
export async function attempts(
  debtorId: string,
  sinceHours: number,
  db: DbExecutor = getDb(),
  now = new Date(),
): Promise<number> {
  z.number().positive().finite().parse(sinceHours);
  z.date().parse(now);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calls)
    .where(
      and(
        eq(calls.debtorId, uuid(debtorId)),
        eq(calls.purpose, "collection"),
        gte(calls.startedAt, new Date(now.getTime() - sinceHours * 3_600_000)),
      ),
    );
  return row.count;
}
export async function unansweredStreak(
  debtorId: string,
  db: DbExecutor = getDb(),
): Promise<number> {
  const rows = await db
    .select({ connected: calls.connected, status: calls.status })
    .from(calls)
    .where(
      and(
        eq(calls.debtorId, uuid(debtorId)),
        eq(calls.purpose, "collection"),
        sql`${calls.startedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(calls.startedAt), desc(calls.id));
  let count = 0;
  for (const row of rows) {
    if (row.connected) break;
    if (["no-answer", "busy"].includes(row.status)) count++;
  }
  return count;
}
export async function promiseStats(debtorId: string, db: DbExecutor = getDb()) {
  const rows = await db
    .select()
    .from(promises)
    .where(
      and(
        eq(promises.debtorId, uuid(debtorId)),
        eq(promises.confirmed, true),
        sql`${promises.status} <> 'cancelled'`,
      ),
    )
    .orderBy(desc(promises.createdAt), desc(promises.id));
  return {
    made: rows.length,
    kept: rows.filter((p) => p.status === "kept").length,
    broken: rows.filter((p) => p.status === "broken").length,
    partially_kept: rows.filter((p) => p.status === "partially_kept").length,
    lastPromise: rows[0] ?? null,
  };
}
export async function activePromise(
  debtorId: string,
  db: DbExecutor = getDb(),
  today = formatIST(new Date(), "yyyy-MM-dd"),
) {
  isoDateSchema.parse(today);
  const [row] = await db
    .select()
    .from(promises)
    .where(
      and(
        eq(promises.debtorId, uuid(debtorId)),
        eq(promises.confirmed, true),
        eq(promises.status, "pending"),
        gte(promises.promisedFor, today),
      ),
    )
    .orderBy(promises.promisedFor, desc(promises.createdAt))
    .limit(1);
  return row ?? null;
}
const analysisSchema = z.object({
  outcome: z.string().optional(),
  reason_code: reasonCodeSchema.default("unknown"),
  sentiment: sentimentSchema.default("unknown"),
});
export async function lastOutcome(debtorId: string, db: DbExecutor = getDb()) {
  const [row] = await db
    .select({
      analysis: calls.analysis,
      status: calls.status,
      startedAt: calls.startedAt,
    })
    .from(calls)
    .where(
      and(
        eq(calls.debtorId, uuid(debtorId)),
        eq(calls.purpose, "collection"),
        sql`${calls.startedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(calls.startedAt), desc(calls.id))
    .limit(1);
  if (!row) return null;
  const parsed = analysisSchema.safeParse(row.analysis);
  return {
    outcome: parsed.success ? (parsed.data.outcome ?? row.status) : row.status,
    reason_code: parsed.success
      ? parsed.data.reason_code
      : ("unknown" as const),
    sentiment: parsed.success ? parsed.data.sentiment : ("unknown" as const),
    at: row.startedAt,
  };
}
export async function isOptedOut(
  debtorId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const [row] = await db
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(and(eq(optOuts.debtorId, uuid(debtorId)), isNull(optOuts.clearedAt)))
    .limit(1);
  return !!row;
}
