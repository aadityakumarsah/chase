import { loadEnvConfig } from "@next/env";
import { z } from "zod";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getLLM } = await import("../src/lib/llm");
  const { getEnv } = await import("../src/lib/env");
  const { closeDb } = await import("../src/lib/db");
  const { LLMError } = await import("../src/lib/llm/types");
  try {
    const env = getEnv();
    for (const tier of ["FAST", "SMART", "DEEP"] as const) {
      try {
        // Disable fallback: this command must prove the selected provider/tier works.
        const llm = getLLM({
          ...env,
          LLM_MODEL_FOR_PING: env[`LLM_MODEL_${tier}`],
          LLM_FALLBACK_PROVIDER: undefined,
        });
        const r = await llm.generateObject({
          task: "ping",
          system: [{ text: "Return the requested JSON result.", cache: true }],
          messages: [{ role: "user", content: "Return ok true." }],
          schema: z.strictObject({ ok: z.literal(true) }),
          schemaName: "ping",
          maxTokens: 64,
        });
        console.log(
          JSON.stringify({
            tier,
            provider: r.provider,
            model: r.model,
            latencyMs: r.latencyMs,
            cacheRead: r.usage.cacheRead,
            cacheWrite: r.usage.cacheWrite,
          }),
        );
      } catch (e) {
        console.error(
          `${tier}: ${e instanceof LLMError ? e.message : "LLM check failed"}`,
        );
        process.exitCode = 1;
      }
    }
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error("LLM ping unavailable; check configuration");
  process.exitCode = 1;
});
