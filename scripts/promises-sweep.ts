import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { sweepPromises } = await import("../src/lib/chase/sweep");
  const { closeDb } = await import("../src/lib/db");
  try {
    const result = await sweepPromises();
    console.log(
      `Promise sweep: ${result.swept} resolved across ${result.affected} debtors`,
    );
  } finally {
    await closeDb();
  }
}

void main();
