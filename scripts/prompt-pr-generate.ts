import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { generatePromptPR } = await import("../src/lib/promptprs/generate");
  const { closeDb } = await import("../src/lib/db");
  try {
    const row = await generatePromptPR("collections");
    console.log(
      JSON.stringify(
        {
          id: row.id,
          title: row.title,
          status: row.status,
          simResults: row.simResults,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDb();
  }
}

void main();
