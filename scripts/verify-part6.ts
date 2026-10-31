import { strict as assert } from "node:assert";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { eq, sql } = await import("drizzle-orm");
  const { processCall } = await import("../src/lib/analysis/process");
  const { runCampaign } = await import("../src/lib/calls/campaign");
  const { ingestExecution } = await import("../src/lib/calls/webhook");
  const { getDb, closeDb } = await import("../src/lib/db");
  const { businesses, calls, debtors, events } =
    await import("../src/lib/db/schema");
  const db = getDb();
  const executionId = "part6-replay-fixture";
  try {
    const [account] = await db
      .select({ debtor: debtors, business: businesses })
      .from(debtors)
      .innerJoin(businesses, eq(businesses.id, debtors.businessId))
      .orderBy(debtors.createdAt)
      .limit(1);
    assert(account, "Run pnpm seed first");
    let [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.bolnaExecutionId, executionId));
    if (!call)
      [call] = await db
        .insert(calls)
        .values({
          businessId: account.business.id,
          debtorId: account.debtor.id,
          purpose: "collection",
          source: "manual",
          bolnaExecutionId: executionId,
          status: "queued",
          language: account.debtor.preferredLanguage,
        })
        .returning();

    const payload = {
      id: executionId,
      status: "completed",
      termination_reason: "voicemail_detected",
      answered_by_voice_mail: true,
      conversation_duration: 12,
      transcript: "assistant: Hello, this is Chase.\n",
      total_cost: 3,
      created_at: "2026-10-30T10:00:00+00:00",
      updated_at: "2026-10-30T10:00:20+00:00",
      telephony_data: {
        recording_url: "https://api.bolna.ai/recordings/call/fixture",
      },
      latency_data: {
        time_to_first_audio: 241,
        interruption_stats: { total_interruptions: 0 },
      },
    };
    for (let i = 0; i < 3; i++) await ingestExecution(payload);
    for (let i = 0; i < 3; i++) await processCall(call.id);

    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(calls)
      .where(eq(calls.bolnaExecutionId, executionId));
    const [saved] = await db.select().from(calls).where(eq(calls.id, call.id));
    const [analyzed] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(events)
      .where(
        sql`${events.callId} = ${call.id} and ${events.type} = 'call.analyzed'`,
      );
    assert.equal(count?.value, 1);
    assert.equal(analyzed?.value, 1);
    assert(saved?.processedAt);
    assert.equal((saved.analysis as { outcome?: string }).outcome, "voicemail");
    assert.equal(saved.costCents, 3n);
    assert.equal(saved.timeToFirstAudioMs, 241);
    assert.deepEqual(saved.interruptionStats, { total_interruptions: 0 });

    const campaign = await runCampaign({
      businessId: account.business.id,
      limit: 5,
      dryRun: true,
    });
    assert(Array.isArray(campaign.plan));
    console.log(
      `Part 6 verification: replay=1 call/1 analysis; campaign plan=${campaign.plan.length}`,
    );
  } finally {
    await closeDb();
  }
}

void main();
