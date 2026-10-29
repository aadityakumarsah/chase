import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb, getSql } = await import("../src/lib/db");
  const { debtors, events, chaseRatings } =
    await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { loadRatingFeatures, recomputeRating } =
    await import("../src/lib/chase/recompute");
  const { computeRating } = await import("../src/lib/chase/rating");
  const { SEED_PORTFOLIO, fixtureRatingInput } =
    await import("../src/lib/chase/seed-portfolio");
  const { formatIST } = await import("../src/lib/time");
  try {
    const now = new Date(),
      db = getDb();
    const rows = await db
      .select({ id: debtors.id, shop: debtors.shopName })
      .from(debtors);
    assert.equal(rows.length, 24, "Run against the freshly seeded local demo");
    for (const profile of SEED_PORTFOLIO) {
      const row = rows.find((r) => r.shop === profile.shop)!;
      const features = await loadRatingFeatures(row.id, db, now);
      const fixture = fixtureRatingInput(profile, formatIST(now, "yyyy-MM-dd"));
      assert.deepEqual(features, fixture, profile.shop);
      assert.deepEqual(computeRating(features), computeRating(fixture));
    }
    const id = rows.find((r) => r.shop === "Sharma General Store")!.id;
    const countEvents = async () =>
      (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(events)
          .where(eq(events.type, "rating.changed"))
      )[0].n;
    const before = await countEvents();
    await recomputeRating(id, now);
    assert.equal(
      await countEvents(),
      before,
      "Unchanged score must not emit rating.changed",
    );
    const history = await db
      .select({ id: chaseRatings.id })
      .from(chaseRatings)
      .where(eq(chaseRatings.debtorId, id));
    assert.ok(history.length >= 2);
    // Each rejected statement runs in its own transaction and leaves the audit log intact.
    for (const statement of [
      "UPDATE events SET type = type",
      "DELETE FROM events",
      "TRUNCATE events",
    ]) {
      await assert.rejects(
        getSql().begin(async (tx) => {
          await tx.unsafe(statement);
        }),
      );
    }
    console.log(
      "Verified all 24 database feature sets against fixtures, rating history, unchanged-score event suppression and append-only audit guards.",
    );
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error(
    "Part 2 verification failed; run against a fresh seed (details suppressed to protect database metadata).",
  );
  process.exitCode = 1;
});
