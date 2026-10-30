import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { and, isNotNull, lt, notInArray } = await import("drizzle-orm");
  const { processCall } = await import("../src/lib/analysis/process");
  const { getBolnaClient } = await import("../src/lib/bolna/client");
  const { ingestExecution, TERMINAL_STATUSES } =
    await import("../src/lib/calls/webhook");
  const { getDb, closeDb } = await import("../src/lib/db");
  const { calls } = await import("../src/lib/db/schema");
  try {
    const stale = await getDb()
      .select()
      .from(calls)
      .where(
        and(
          isNotNull(calls.bolnaExecutionId),
          lt(calls.updatedAt, new Date(Date.now() - 3 * 60_000)),
          notInArray(calls.status, [...TERMINAL_STATUSES]),
        ),
      );
    let terminal = 0;
    for (const call of stale) {
      const result = await ingestExecution(
        await getBolnaClient().getExecution(call.bolnaExecutionId!),
      );
      if (
        call.purpose === "collection" &&
        "terminal" in result &&
        result.terminal
      ) {
        await processCall(call.id);
        terminal++;
      }
    }
    console.log(`Call poll: ${stale.length} checked, ${terminal} terminal`);
  } finally {
    await closeDb();
  }
}

void main();
