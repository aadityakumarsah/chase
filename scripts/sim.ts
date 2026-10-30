import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

function value(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main() {
  const { PERSONAS, runSimulation } = await import("../src/lib/sim");
  const { PersonaIdSchema } = await import("../src/lib/sim/types");
  const { closeDb } = await import("../src/lib/db");
  try {
    const requested = value("--personas", "all");
    const personas =
      requested === "all"
        ? PERSONAS.map((persona) => persona.id)
        : requested.split(",").map((id) => PersonaIdSchema.parse(id.trim()));
    const { runId, report } = await runSimulation({
      personas,
      prompt: value("--prompt", "active"),
    });
    console.table(
      report.results.map((result) => ({
        persona: result.label,
        pass: result.passed ? "PASS" : "FAIL",
        tool: result.toolCalls.map((tool) => tool.name).join(", ") || "—",
        turns: result.judge.turn_count,
        tone: result.judge.tone,
      })),
    );
    console.log(JSON.stringify({ runId, report }, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
