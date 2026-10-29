import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { closeDb } = await import("../src/lib/db");
  try {
    const args = process.argv.slice(2).filter((v) => v !== "--");
    const file = args[0];
    if (!file)
      throw new Error("Usage: pnpm import:csv <file.csv> [business UUID]");
    const { importCsv, resolveImportBusiness } =
      await import("../src/lib/import/csv");
    const result = await importCsv(
      await readFile(file, "utf8"),
      await resolveImportBusiness(args[1]),
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.rejected.length) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error(
    "CSV import failed; check file, headers, business selection and database (no raw data logged)",
  );
  process.exitCode = 1;
});
