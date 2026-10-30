import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
import assert from "node:assert/strict";
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { calls, debtors, paymentLinks, messages, payments, toolInvocations } =
    await import("../src/lib/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const { getEnv } = await import("../src/lib/env");
  const env = getEnv(),
    base = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
  let callId: string | undefined;
  try {
    const [debtor] = await getDb()
      .select()
      .from(debtors)
      .where(eq(debtors.shopName, "Sharma General Store"));
    assert(debtor);
    const [call] = await getDb()
      .insert(calls)
      .values({
        businessId: debtor.businessId,
        debtorId: debtor.id,
        purpose: "test",
        status: "web_session",
        language: "hi",
      })
      .returning();
    callId = call.id;
    const post = async (
      tool: string,
      args: object,
      secret = env.CHASE_TOOL_SECRET,
    ) => {
      const r = await fetch(`${base}/api/tools/${tool}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_id: debtor.id,
          call_token: call.callToken,
          ...args,
        }),
      });
      return {
        status: r.status,
        body: (await r.json()) as {
          ok: boolean;
          data: Record<string, unknown>;
        },
      };
    };
    assert.equal(
      (await post("check_payment_status", {}, "wrong-secret-value")).status,
      401,
    );
    assert.equal(
      (await post("send_payment_link", { amount_rupees: "100" })).body.ok,
      false,
    );
    const sent = await post("send_payment_link", { amount_rupees: "2000" });
    assert.equal(sent.body.ok, true);
    const repeat = await post("send_payment_link", { amount_rupees: "2000" });
    assert.deepEqual(repeat.body, sent.body);
    const [link] = await getDb()
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.callId, call.id))
      .orderBy(desc(paymentLinks.createdAt));
    assert(link);
    const opened = await fetch(`${base}/pay/${link.token}`);
    assert.equal(opened.status, 200);
    const simulated = await fetch(`${base}/api/pay/${link.token}/simulate`, {
      method: "POST",
    });
    assert.equal(simulated.status, 200);
    const status = await post("check_payment_status", {});
    assert.equal(status.body.data.status, "paid");
    const [message] = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.paymentLinkId, link.id));
    assert.equal(message.status, "sent");
    const [payment] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.paymentLinkId, link.id));
    assert(payment);
    const invocations = await getDb()
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.callId, call.id));
    assert.equal(
      invocations.filter((i) => i.toolName === "send_payment_link").length,
      3,
    );
    console.log(
      "Part 5 flow passed: auth, amount guard, idempotency, console message, open tracking, simulated payment, invoice allocation, and paid status.",
    );
  } finally {
    if (callId)
      await getDb()
        .update(calls)
        .set({
          status: "stopped",
          endedAt: new Date(),
          terminationReason: "part5_verification",
        })
        .where(eq(calls.id, callId));
    await closeDb();
  }
}
void main().catch((error) => {
  console.error(
    "Part 5 verification failed:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
