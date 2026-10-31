import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

// Supabase's transaction pooler (6543) cannot run DDL reliably; DIRECT_URL is the
// session-mode connection and is preferred for migrations when it is configured.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

/** Removes any embedded connection credentials before an error reaches the console. */
function sanitize(message: string): string {
  return message.replace(
    /postgres(?:ql)?:\/\/[^\s"']+/gi,
    "postgres://[redacted]",
  );
}

async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  try {
    await migrate(getDb(), { migrationsFolder: "drizzle" });
    console.log("Database migrations applied");
  } catch (error) {
    console.error(
      "Database migration failed:",
      sanitize(error instanceof Error ? error.message : "unknown error"),
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
