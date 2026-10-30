import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { and, eq, desc } = await import("drizzle-orm");
  const { getDb, closeDb } = await import("../src/lib/db");
  const { businesses, calls, callTurns, debtors, events } =
    await import("../src/lib/db/schema");
  const { createProxyStream } = await import("../src/lib/proxy/stream");
  try {
    const [account] = await getDb()
      .select({ businessId: businesses.id, debtorId: debtors.id })
      .from(businesses)
      .innerJoin(debtors, eq(debtors.businessId, businesses.id))
      .limit(1);
    if (!account) throw new Error("Seed business and debtor are required");
    const [call] = await getDb()
      .insert(calls)
      .values({
        businessId: account.businessId,
        debtorId: account.debtorId,
        purpose: "test",
        source: "part9-proxy-verification",
        status: "completed",
        raw: { simulated: true, purpose: "proxy_verification" },
      })
      .returning();
    const system = `You are Chase, a polite AI collections assistant. Identity is already confirmed for this simulated test. If the caller asks to stop calls, apologise, call register_opt_out and end. If asked whether you are AI, answer honestly. For hardship, show empathy and do not push. ACCOUNT CONTEXT FOR THIS CALL\nAccount reference: ${account.debtorId}. Call reference: ${call.callToken}.`;
    const utterances = [
      "मुझे call मत करो",
      "क्या आप robot हो?",
      "मेरे पिता hospital में हैं",
    ];
    let optOutToolDelta = false;
    for (const content of utterances) {
      const stream = await createProxyStream(
        {
          model: "chase-claude",
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "register_opt_out",
                description:
                  "Honor an explicit request to stop calls immediately.",
                parameters: {
                  type: "object",
                  properties: {
                    account_id: { type: "string" },
                    call_token: { type: "string" },
                    scope: { type: "string", enum: ["call", "all"] },
                  },
                  required: ["account_id", "call_token", "scope"],
                  additionalProperties: false,
                },
              },
            },
          ],
          max_tokens: 150,
        },
        AbortSignal.timeout(60_000),
      );
      const response = await new Response(stream).text();
      optOutToolDelta ||= response.includes('"name":"register_opt_out"');
      if (!response.includes("data: [DONE]"))
        throw new Error("Proxy stream did not terminate cleanly");
    }
    const turns = await getDb()
      .select({ ttft: callTurns.timeToFirstTokenMs })
      .from(callTurns)
      .where(eq(callTurns.callId, call.id))
      .orderBy(desc(callTurns.idx));
    const ttfts = turns
      .flatMap((turn) => (turn.ttft === null ? [] : [turn.ttft]))
      .sort((a, b) => a - b);
    const [flag] = await getDb()
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.callId, call.id), eq(events.type, "supervisor_flag")),
      )
      .orderBy(desc(events.id))
      .limit(1);
    if (!optOutToolDelta)
      throw new Error("Opt-out tool delta was not streamed");
    if (!flag || !ttfts.length)
      throw new Error(
        `Proxy telemetry incomplete (supervisor=${Boolean(flag)}, ttftTurns=${ttfts.length})`,
      );
    console.log(
      JSON.stringify(
        {
          simulated: true,
          callId: call.id,
          turns: ttfts.length,
          ttftP50Ms: ttfts[Math.floor(ttfts.length / 2)],
          optOutToolDelta,
          telemetryPersisted: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDb();
  }
}

void main();
