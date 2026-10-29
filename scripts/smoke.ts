import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const green = (s: string) => console.log(`\u001b[32m✓ ${s}\u001b[0m`);
const red = (s: string) => console.log(`\u001b[31m✗ ${s}\u001b[0m`);
async function main() {
  const { getEnv, configReport } = await import("../src/lib/env");
  const { redact } = await import("../src/lib/log");
  const { pingDb, closeDb } = await import("../src/lib/db");
  const { getBolnaClient, BolnaError } =
    await import("../src/lib/bolna/client");
  const { createLlmClient } = await import("../src/lib/llm/client");
  try {
    const env = getEnv();
    const report = configReport(env);
    console.log("Chase configuration (status and missing key names only)");
    console.log(JSON.stringify(report, null, 2));
    if (env.DATABASE_URL) {
      try {
        await pingDb();
        green("Database reachable");
      } catch {
        red("Database unreachable; check DATABASE_URL");
        process.exitCode = 1;
      }
    } else red("Database skipped: DATABASE_URL missing");
    if (env.BOLNA_API_KEY) {
      const bolna = getBolnaClient();
      try {
        const me = await bolna.getMe();
        green(
          `Bolna reachable: ${JSON.stringify(redact({ name: me.name, wallet: me.wallet, concurrency: me.concurrency }))}`,
        );
        const agents = await bolna.listAgents();
        green(
          `Agents: ${JSON.stringify(redact(agents.map((a) => ({ name: a.agent_name, id: a.id }))))}`,
        );
      } catch (error) {
        red(
          `Bolna failed${error instanceof BolnaError ? ` (HTTP ${error.status}; ${JSON.stringify(error.body)})` : ""}`,
        );
        process.exitCode = 1;
      }
    } else red("Bolna skipped: BOLNA_API_KEY missing");
    if (report.llm.status === "configured") {
      try {
        await createLlmClient(env).ping();
        green("LLM 5-token ping succeeded");
      } catch (error) {
        // SDK errors may contain request metadata; emit status only, never raw errors.
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : "unknown";
        red(
          `LLM ping failed (HTTP ${status}); check selected provider, model, billing and key`,
        );
        process.exitCode = 1;
      }
    } else red("LLM skipped: selected provider credentials missing");
  } catch (error) {
    red(
      error instanceof Error &&
        error.message.startsWith("Invalid environment keys:")
        ? error.message
        : "Configuration failed; review canonical key names in .env.example",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
