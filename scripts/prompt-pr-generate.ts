import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { z } = await import("zod");
  const businessId = z.uuid().parse(process.argv[2]);
  const { generatePromptPR } = await import("../src/lib/promptprs/generate");
  const { closeDb } = await import("../src/lib/db");
  try {
    const row = await generatePromptPR("collections", businessId);
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
