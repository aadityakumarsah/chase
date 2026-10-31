import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { closeDb } = await import("../src/lib/db");
  try {
    const { resetDemoState } = await import("../src/lib/demo/reset");
    const result = await resetDemoState();
    console.table({
      "Calls today": result.callsToday,
      "DEMO rating": result.demoRating,
      "Broken promises": result.brokenPromises,
      "Open Prompt PRs": result.openPromptPrs,
      "Window override": result.demoWindowOverride ? "on" : "off",
    });
    console.log("Demo state restored and verified.");
  } finally {
    await closeDb();
  }
}

void main().catch(() => {
  console.error(
    "Demo reset failed. It only runs in DEMO_MODE on a database containing no non-demo businesses.",
  );
  process.exitCode = 1;
});
