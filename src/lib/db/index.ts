import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
const createDb = (client: ReturnType<typeof postgres>) =>
  drizzle(client, { schema });
export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Transaction;
const globalDb = globalThis as unknown as {
  chaseSql?: ReturnType<typeof postgres>;
  chaseDb?: Database;
};
export function getSql() {
  const { DATABASE_URL } = getEnv();
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");
  // A small pool per warm function: the dashboard issues several requests at
  // once, and a single socket made them queue behind each other. Still well
  // within what a transaction pooler expects from one serverless instance.
  return (globalDb.chaseSql ??= postgres(DATABASE_URL, {
    max: 3,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
    connection: { statement_timeout: 10_000 },
    onnotice: () => {},
  }));
}
export function getDb(): Database {
  return (globalDb.chaseDb ??= createDb(getSql()));
}
export async function pingDb(): Promise<void> {
  await getSql()`select 1`;
}
export async function closeDb(): Promise<void> {
  if (globalDb.chaseSql) await globalDb.chaseSql.end({ timeout: 1 });
  delete globalDb.chaseSql;
  delete globalDb.chaseDb;
}
