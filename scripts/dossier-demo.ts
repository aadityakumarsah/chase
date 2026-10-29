import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { debtors } = await import("../src/lib/db/schema");
  const { compileDossier } = await import("../src/lib/dossier");
  const { LLMError } = await import("../src/lib/llm/types");
  try {
    const [debtor] = await getDb()
      .select({ id: debtors.id })
      .from(debtors)
      .where(eq(debtors.shopName, "Sharma General Store"));
    if (!debtor) throw new Error("Seed required");
    const row = await compileDossier(debtor.id);
    console.log(row.text);
  } catch (e) {
    console.error(
      e instanceof LLMError
        ? e.message
        : "Demo dossier unavailable; check seed and configuration",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
