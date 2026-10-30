/** Offline-provider acceptance: real local DB + HTTP, no Bolna mint or phone dial. */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { calls, debtors, toolInvocations, events } =
    await import("../src/lib/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { getEnv } = await import("../src/lib/env");
  const { createSession } = await import("../src/lib/auth");
  const { runTool, ToolError } = await import("../src/lib/calls/tools");
  const env = getEnv();
  const base = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
  let callId: string | undefined;
  try {
    const [demo] = await getDb()
      .select()
      .from(debtors)
      .where(eq(debtors.shopName, "Sharma General Store"));
    assert(demo);
    const [call] = await getDb()
      .insert(calls)
      .values({
        businessId: demo.businessId,
        debtorId: demo.id,
        purpose: "test",
        status: "web_session",
        language: "hi",
        raw: { verification: "part4 offline fixture; no provider call" },
      })
      .returning();
    callId = call.id;
    const args = {
      account_id: demo.id,
      call_token: call.callToken,
    };
    const first = await runTool("check_payment_status", args);
    assert.equal(first.ok, false);
    await runTool("check_payment_status", args);
    const logs = await getDb()
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.callId, call.id));
    assert.equal(logs.length, 1);
    assert(!JSON.stringify(logs).includes(call.callToken));
    const [unchanged] = await getDb()
      .select()
      .from(debtors)
      .where(eq(debtors.id, demo.id));
    assert.equal(unchanged.status, demo.status);
    await assert.rejects(
      runTool("check_payment_status", {
        ...args,
        account_id: "11111111-1111-4111-8111-111111111111",
      }),
      ToolError,
    );
    await assert.rejects(
      runTool("send_payment_link", { ...args, amount_rupees: -10 }),
      ToolError,
    );
    const post = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        redirect: "manual",
      });
    assert.equal(
      (await post("/api/tools/check_payment_status", args)).status,
      401,
    );
    const ok = await post("/api/tools/check_payment_status", args, {
      Authorization: `Bearer ${env.CHASE_TOOL_SECRET}`,
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).simulated, true);
    assert.equal(
      (
        await post("/api/web-call/session", {
          user_data: { debtor_id: demo.id },
        })
      ).status,
      401,
    );
    const cookie = `admin=${createSession(env.ADMIN_PASSCODE!)}`;
    assert.equal(
      (
        await post(
          "/api/web-call/session",
          {},
          { Cookie: cookie, Origin: "https://wrong.invalid" },
        )
      ).status,
      403,
    );
    try {
      await (await import("../src/lib/calls/dispatch")).previewCall(demo.id);
    } catch (e) {
      console.error(
        "Preview error type",
        (e as Error).name,
        (e as { cause?: { code?: string; name?: string } }).cause?.name,
        (e as { cause?: { code?: string } }).cause?.code,
        (e as Error).stack?.split("\n").find((l) => l.includes("src/lib/")),
      );
      throw new Error("Preview failed");
    }
    const preview = await fetch(
      base + `/api/web-call/context?debtorId=${demo.id}`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(preview.status, 200);
    const data = await preview.json();
    assert.equal(data.call_token, "<generated server-side>");
    assert(
      data.dossier.includes("5") || data.last_promise_spoken.includes("5"),
    );
    const feed = await getDb()
      .select()
      .from(events)
      .where(
        and(eq(events.callId, call.id), sql`${events.type} like 'tool.%'`),
      );
    assert.equal(feed.length, 2);
    assert(
      !JSON.stringify(feed, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ).includes(call.callToken),
    );
    await getDb()
      .update(calls)
      .set({ status: "stopped", endedAt: new Date() })
      .where(eq(calls.id, call.id));
    await assert.rejects(runTool("check_payment_status", args), ToolError);
    console.log(
      "Part 4 DB/HTTP checks passed: authentication, CSRF, token binding/revocation, idempotency, simulated effects, audit and preview. No provider call made.",
    );
  } finally {
    if (callId)
      await getDb()
        .update(calls)
        .set({
          status: "stopped",
          endedAt: new Date(),
          terminationReason: "offline_verification",
        })
        .where(eq(calls.id, callId));
    await closeDb();
  }
}
void main().catch((error) => {
  console.error(
    "Part 4 verification failed:",
    error?.name,
    error?.stack
      ?.split("\n")
      .find((line: string) => line.includes("verify-part4.ts"))
      ?.trim(),
  );
  process.exitCode = 1;
});
