import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { closeDb } = await import("../src/lib/db");
  try {
    const args = process.argv.slice(2).filter((v) => v !== "--");
    if (args.some((v) => v !== "--reset"))
      throw new Error("Unknown seed option");
    const { seedPortfolio } = await import("../src/lib/chase/seed");
    const result = await seedPortfolio({ reset: args.includes("--reset") });
    console.log(
      result.created
        ? "Seeded 24 fictional debtors, invoice balances, simulated histories and initial ratings."
        : "Demo portfolio already exists; no rows changed. Use --reset for an explicit local-demo reset.",
    );
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error(
    "Seed failed; check migrations and local DEMO_MODE reset eligibility. No secret-bearing errors printed.",
  );
  process.exitCode = 1;
});
