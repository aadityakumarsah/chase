import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

function argument(name: string) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main() {
  const { runDailyBrief } = await import("../src/lib/brief");
  const { closeDb } = await import("../src/lib/db");
  try {
    const date = argument("--date") ?? "today";
    const result = await runDailyBrief({ date, deliver: ["dashboard"] });
    console.log("METRICS");
    console.log(JSON.stringify(result.brief.metrics, null, 2));
    console.log("NARRATIVE");
    console.log(JSON.stringify(result.brief.narrative, null, 2));
    console.log("SCRIPT_HI");
    console.log(result.brief.scriptHi);
    console.log("SCRIPT_EN");
    console.log(result.brief.scriptEn);
  } finally {
    await closeDb();
  }
}

void main();
