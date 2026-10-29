import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
// Live evals explicitly use the same local provider/database configuration as CLI
// smoke checks. Next otherwise skips .env.local when Vitest sets NODE_ENV=test.
if (process.env.RUN_LLM_EVALS === "1") {
  const previous = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "development",
    writable: true,
    enumerable: true,
    configurable: true,
  });
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} }, true);
  if (previous === undefined) delete process.env.NODE_ENV;
  else
    Object.defineProperty(process.env, "NODE_ENV", {
      value: previous,
      writable: true,
      enumerable: true,
      configurable: true,
    });
}
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/analysis.eval.ts"], testTimeout: 180000 },
});
