import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  try {
    await migrate(getDb(), { migrationsFolder: "drizzle" });
    console.log("Database migrations applied");
  } catch {
    console.error(
      "Database migration failed; check DATABASE_URL and database permissions (details suppressed to protect credentials)",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
