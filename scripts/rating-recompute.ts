import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { debtors } = await import("../src/lib/db/schema");
  const { recomputeRating } = await import("../src/lib/chase/recompute");
  try {
    const rows = await getDb()
      .select({ id: debtors.id, name: debtors.shopName })
      .from(debtors);
    const ranked = [];
    for (const debtor of rows) {
      const rating = await recomputeRating(debtor.id);
      ranked.push({
        shop: debtor.name,
        score: rating.score,
        band: rating.band,
        next: rating.nextAction,
      });
    }
    ranked.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    console.table(
      ranked.map((row, i) => ({
        rank: i + 1,
        ...row,
        score: row.score ?? "excluded",
      })),
    );
    console.log(
      `Recomputed ${ranked.length} debtors; rating history preserved.`,
    );
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error(
    "Rating recomputation failed; check database migrations and portfolio inputs (details suppressed)",
  );
  process.exitCode = 1;
});
