import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { debtors } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getEnv } = await import("../src/lib/env");
  const { normalisePhone, maskPhone } = await import("../src/lib/phone");
  const { assertDialAllowed } = await import("../src/lib/compliance/guards");
  const { dispatchCall } = await import("../src/lib/calls/dispatch");
  const { getBolnaClient } = await import("../src/lib/bolna/client");
  const { ingestExecution, TERMINAL_STATUSES, hasConversation } =
    await import("../src/lib/calls/webhook");
  const { redact } = await import("../src/lib/log");
  try {
    const at = process.argv.indexOf("--to");
    if (at < 0 || !process.argv[at + 1])
      throw new Error(
        "Usage: pnpm call:test --to +91XXXXXXXXXX [--debtor demo|UUID]",
      );
    const to = normalisePhone(process.argv[at + 1]);
    assertDialAllowed(to, { ...getEnv(), DEMO_MODE: true });
    const d = process.argv.indexOf("--debtor");
    const selection = d < 0 ? "demo" : process.argv[d + 1];
    const [debtor] = await getDb()
      .select({ id: debtors.id })
      .from(debtors)
      .where(
        selection === "demo"
          ? eq(debtors.shopName, "Sharma General Store")
          : eq(debtors.id, selection),
      );
    if (!debtor) throw new Error("Debtor not found");
    console.log(`Starting authorized test call to ${maskPhone(to)}.`);
    const result = await dispatchCall(debtor.id, { to });
    if (result.status === "blocked")
      throw new Error(
        `Call blocked: ${result.decision.rules
          .filter((rule) => !rule.passed)
          .map((rule) => rule.id)
          .join(", ")}`,
      );
    const client = getBolnaClient();
    let previous = "";
    const deadline = Date.now() + 12 * 60_000;
    while (Date.now() < deadline) {
      const execution = await client.getExecution(result.executionId);
      await ingestExecution(execution);
      if (execution.status !== previous) {
        console.log(`Status: ${execution.status}`);
        previous = execution.status;
      }
      if (TERMINAL_STATUSES.has(execution.status)) {
        console.log(redact(execution.transcript ?? "(no transcript)"));
        console.log(
          JSON.stringify(
            {
              conversation_duration: execution.conversation_duration,
              total_cost_cents: execution.total_cost,
              termination_reason: execution.termination_reason,
              time_to_first_audio: execution.latency_data?.time_to_first_audio,
              conversation: hasConversation(execution),
            },
            null,
            2,
          ),
        );
        if (!hasConversation(execution)) process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error(
      "Polling timed out; call state remains available in Bolna. Do not re-dial without checking it.",
    );
  } catch (error) {
    console.error(
      error instanceof Error && error.name !== "ZodError"
        ? error.message
        : "Call verification failed",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
