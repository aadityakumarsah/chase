import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";
import type { LLMProvider } from "../src/lib/llm/types";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { getDb, closeDb } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { buildDossierInput, compileDossier } =
    await import("../src/lib/dossier");
  const { zeroUsage } = await import("../src/lib/llm/types");
  const { writeAudit } = await import("../src/lib/llm");
  const env = getEnv();
  assert.ok(
    env.DEMO_MODE &&
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(env.DATABASE_URL!).hostname,
      ),
  );
  const db = getDb();
  let old: typeof s.contactDossiers.$inferSelect | undefined;
  try {
    const [demo] = await db
      .select({ id: s.debtors.id })
      .from(s.debtors)
      .innerJoin(s.businesses, eq(s.businesses.id, s.debtors.businessId))
      .where(eq(s.businesses.seedKey, "chase-demo-v2"))
      .orderBy(s.debtors.createdAt);
    assert.ok(demo);
    const [target] = await db
      .select({ id: s.debtors.id })
      .from(s.debtors)
      .where(eq(s.debtors.shopName, "Sharma General Store"));
    assert.ok(target);
    const input = await buildDossierInput(target.id);
    assert.ok(
      input.promises.some(
        (p) => p.status === "broken" && p.date.endsWith("-05"),
      ),
    );
    assert.equal(input.calls.length, 1);
    assert.equal(input.pickup_stats[0].connected, 1);
    assert.equal(input.outstanding_paise, "1250000");
    [old] = await db
      .select()
      .from(s.contactDossiers)
      .where(eq(s.contactDossiers.debtorId, target.id));
    assert.ok(old);
    // Clear only the cache hash; restore the entire existing dossier in finally.
    await db
      .update(s.contactDossiers)
      .set({ sourceHash: "integration-check" })
      .where(eq(s.contactDossiers.id, old.id));
    let generations = 0;
    const provider: LLMProvider = {
      generateText: async () => {
        throw new Error("unexpected");
      },
      async *streamChat() {
        throw new Error("unexpected");
      },
      generateObject: async <T>() => {
        generations++;
        return {
          value: {
            dossier_text:
              "[SIMULATED TEST] He broke a ₹5,000 promise on the 5th due to salary delay.",
            preferred_language: "hi",
            best_time_window: "morning",
            tone_hint: "Respectful",
            open_commitments: [],
            do_not_mention: [],
          } as T,
          provider: "fixture",
          model: "fixture-only",
          usage: zeroUsage(),
          latencyMs: 0,
          features: ["simulated_test"],
        };
      },
    };
    const first = await compileDossier(target.id, provider);
    const second = await compileDossier(target.id, provider);
    assert.equal(first.sourceHash, second.sourceHash);
    assert.equal(generations, 1);
    await writeAudit({
      task: "ping",
      provider: "fixture",
      model: "fixture-only",
      features: ["simulated_test"],
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      latencyMs: 1,
      ok: true,
    });
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.llmCalls)
      .where(eq(s.llmCalls.provider, "fixture"));
    assert.ok(count.n >= 1);
    console.log(
      "Verified dossier input facts, pickup aggregation, DB cache hit, persisted dossier and explicitly labelled fixture telemetry. No live LLM result claimed.",
    );
  } finally {
    if (old)
      await db
        .update(s.contactDossiers)
        .set({
          text: old.text,
          preferredLanguage: old.preferredLanguage,
          bestTimeWindow: old.bestTimeWindow,
          toneHint: old.toneHint,
          openCommitments: old.openCommitments,
          doNotMention: old.doNotMention,
          sourceHash: old.sourceHash,
          model: old.model,
        })
        .where(eq(s.contactDossiers.id, old.id));
    await closeDb();
  }
}
void main().catch(() => {
  console.error(
    "Part 3 DB verification failed; details suppressed. Requires the local seeded demo.",
  );
  process.exitCode = 1;
});
