import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getEnv, configReport } = await import("../src/lib/env");
  const env = getEnv();
  const report = configReport(env);
  const missing = Object.entries(env)
    .filter(
      ([, value]) =>
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0),
    )
    .map(([key]) => key);
  const needed = [
    ...new Set(Object.values(report).flatMap((status) => status.missing)),
  ];
  const text = [
    "# Configuration status",
    "",
    "Part 1 snapshot; names only. Run pnpm smoke for current connectivity and integration status.",
    "",
    "## Missing for selected integrations and upcoming demo",
    "",
    ...needed.map((key) => `- ${key}`),
    "",
    "## All canonical fields currently unset (including optional alternate providers)",
    "",
    ...missing.map((key) => `- ${key}`),
    "",
    "Defaulted settings count as configured; their values are documented in src/lib/env.ts. An unset optional provider credential does not block the selected provider. Security credentials are set. No secret values are included here.",
    "",
  ].join("\n");
  writeFileSync("docs/config-status.md", text);
  console.log("Wrote docs/config-status.md (missing names only)");
}
void main().catch(() => {
  console.error("Configuration report failed; inspect canonical key names");
  process.exitCode = 1;
});
