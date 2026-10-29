import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
const globalDb = globalThis as unknown as {
  chaseSql?: ReturnType<typeof postgres>;
};
export function getSql() {
  const { DATABASE_URL } = getEnv();
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return (globalDb.chaseSql ??= postgres(DATABASE_URL, {
    max: 3,
    connect_timeout: 5,
    idle_timeout: 20,
    prepare: false,
    connection: { statement_timeout: 5000 },
    onnotice: () => {},
  }));
}
export function getDb() {
  return drizzle(getSql(), { schema });
}
export async function pingDb(): Promise<void> {
  await getSql()`select 1`;
}
export async function closeDb(): Promise<void> {
  if (globalDb.chaseSql) {
    await globalDb.chaseSql.end({ timeout: 1 });
    delete globalDb.chaseSql;
  }
}
