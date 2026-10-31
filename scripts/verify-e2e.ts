import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

type Row = { check: string; status: "GREEN" | "RED" | "SKIP"; detail: string };
const rows: Row[] = [];

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ check: name, status: "GREEN", detail: await run() });
  } catch {
    rows.push({
      check: name,
      status: "RED",
      // Provider and database errors can contain URLs or credentials.
      detail: "check failed",
    });
  }
}

function skip(name: string, detail: string) {
  rows.push({ check: name, status: "SKIP", detail });
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const { getBolnaClient } = await import("../src/lib/bolna/client");
  const { importantAgentFields } = await import("../src/lib/bolna/verify");
  const { previewDailyBrief } = await import("../src/lib/brief");
  const { runCampaign } = await import("../src/lib/calls/campaign");
  const { closeDb } = await import("../src/lib/db");
  const { getEnv } = await import("../src/lib/env");
  const { runSimulation } = await import("../src/lib/sim");
  const { z } = await import("zod");
  const env = getEnv();
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const businessId = process.env.E2E_BUSINESS_ID;
  if (businessId) z.uuid().parse(businessId);
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20_000),
      headers: { ...init.headers },
    });

  try {
    await check("Health", async () => {
      const response = await request("/api/health");
      const body = (await response.json()) as { ok?: boolean };
      assert(response.ok && body.ok, "health is not ready");
      return "reachable";
    });

    await check("Bolna URLs", async () => {
      assert(
        env.BOLNA_COLLECTIONS_AGENT_ID && env.BOLNA_BRIEF_AGENT_ID,
        "agent IDs are missing",
      );
      const client = getBolnaClient();
      for (const id of [
        env.BOLNA_COLLECTIONS_AGENT_ID,
        env.BOLNA_BRIEF_AGENT_ID,
      ]) {
        const fields = importantAgentFields(await client.getAgent(id));
        assert(
          fields.webhook.startsWith(`${base}/api/bolna/webhook`),
          "webhook URL mismatch",
        );
        assert(
          fields.tools.every((tool) => tool.config.url?.startsWith(base)),
          "tool URL mismatch",
        );
      }
      return "both agents point at APP_BASE_URL";
    });

    await check("Tool auth", async () => {
      assert(env.CHASE_TOOL_SECRET, "CHASE_TOOL_SECRET is missing");
      const body = JSON.stringify({});
      const good = await request("/api/tools/check_payment_status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CHASE_TOOL_SECRET}`,
          "Content-Type": "application/json",
        },
        body,
      });
      const bad = await request("/api/tools/check_payment_status", {
        method: "POST",
        headers: {
          Authorization: "Bearer deliberately-invalid",
          "Content-Type": "application/json",
        },
        body,
      });
      assert(
        good.status !== 401 && good.status < 500,
        "valid tool credential rejected",
      );
      assert(bad.status === 401, "invalid tool credential accepted");
      return "good accepted; bad rejected";
    });

    await check("Webhook auth", async () => {
      assert(env.CHASE_WEBHOOK_SECRET, "CHASE_WEBHOOK_SECRET is missing");
      const init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      };
      const good = await request(
        `/api/bolna/webhook?token=${encodeURIComponent(env.CHASE_WEBHOOK_SECRET)}`,
        init,
      );
      const bad = await request("/api/bolna/webhook?token=invalid", init);
      assert(
        good.status !== 401 && good.status < 500,
        "valid webhook credential rejected",
      );
      assert(bad.status === 401, "invalid webhook credential accepted");
      return "good accepted; bad rejected";
    });

    await check("Tenant API auth", async () => {
      const response = await request("/api/campaigns/run", {
        method: "POST",
        headers: {
          Origin: new URL(base).origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 2, dryRun: true }),
      });
      assert(response.status === 401, "anonymous campaign request accepted");
      return "anonymous campaign request denied";
    });

    if (businessId) {
      await check("Campaign dry run", async () => {
        const result = await runCampaign({
          businessId,
          limit: 2,
          dryRun: true,
        });
        assert(result.dryRun, "campaign dry run failed");
        return `${result.plan.length} candidates evaluated without dialing`;
      });
    } else
      skip("Campaign dry run", "set E2E_BUSINESS_ID for an explicit tenant");

    await check("Persona simulator", async () => {
      const result = await runSimulation({
        personas: ["angry_opt_out", "third_party_wife"],
        persist: false,
      });
      assert(result.report.passed, "a persona failed compliance checks");
      return "2 personas passed";
    });

    if (businessId) {
      await check("Brief dry run", async () => {
        const result = await previewDailyBrief({ date: "today", businessId });
        assert(
          result.narrative.headline && result.scripts.scriptHi,
          "brief preview incomplete",
        );
        return "metrics, narrative and scripts generated; no delivery";
      });
    } else skip("Brief dry run", "set E2E_BUSINESS_ID for an explicit tenant");
  } finally {
    console.table(rows);
    await closeDb();
  }
  if (rows.some((row) => row.status === "RED")) process.exitCode = 1;
}

void main().catch(() => {
  console.error("E2E verifier failed; check configuration and connectivity");
  process.exitCode = 1;
});
