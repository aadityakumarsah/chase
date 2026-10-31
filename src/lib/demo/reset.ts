import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { seedPortfolio } from "@/lib/chase/seed";
import { getDb } from "@/lib/db";
import {
  businesses,
  calls,
  chaseRatings,
  debtors,
  promptPrs,
  promises,
} from "@/lib/db/schema";
import { addIstDays, istDay, istInstant } from "@/lib/time";

export async function resetDemoState(now = new Date()) {
  const seeded = await seedPortfolio({ reset: true, now });
  const day = istDay(now);
  const start = istInstant(day, "00:00");
  const end = istInstant(addIstDays(day, 1), "00:00");
  const [todayCalls, broken, openPr, demo, business] = await Promise.all([
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(calls)
      .where(and(gte(calls.createdAt, start), lt(calls.createdAt, end))),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(promises)
      .innerJoin(debtors, eq(debtors.id, promises.debtorId))
      .where(
        and(
          eq(promises.status, "broken"),
          eq(debtors.shopName, "Sharma General Store"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(promptPrs)
      .where(eq(promptPrs.status, "open")),
    getDb()
      .select({ score: chaseRatings.score })
      .from(debtors)
      .innerJoin(chaseRatings, eq(chaseRatings.debtorId, debtors.id))
      .where(eq(debtors.shopName, "Sharma General Store"))
      .orderBy(desc(chaseRatings.computedAt))
      .limit(1),
    getDb()
      .select({ override: businesses.demoWindowOverride })
      .from(businesses)
      .where(eq(businesses.id, seeded.businessId))
      .limit(1),
  ]);
  const score = demo[0]?.score ?? null;
  if (
    todayCalls[0]?.count !== 0 ||
    !score ||
    score < 75 ||
    score > 80 ||
    broken[0]?.count !== 1 ||
    openPr[0]?.count !== 1
  )
    throw new Error("Demo reset verification failed");
  return {
    ...seeded,
    callsToday: todayCalls[0].count,
    demoRating: score,
    brokenPromises: broken[0].count,
    openPromptPrs: openPr[0].count,
    demoWindowOverride: business[0]?.override ?? false,
  };
}
