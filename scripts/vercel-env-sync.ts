import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Production cutover is intentionally narrow. The old .env still contains
// single-tenant and Neon-era values; bulk syncing it could undo tenant isolation.
const keys = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;
const source = readFileSync(".env.local", "utf8");
const entries = new Map<string, string>();
for (const line of source.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 1) continue;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  entries.set(key, value);
}

for (const key of keys) {
  if (!entries.get(key)) throw new Error(`Missing ${key} in .env.local`);
}
const db = new URL(entries.get("DATABASE_URL")!);
if (
  !["postgres:", "postgresql:"].includes(db.protocol) ||
  !db.hostname.endsWith(".supabase.com")
)
  throw new Error("DATABASE_URL must point to the Supabase pooler");

if (!process.argv.includes("--apply")) {
  console.log(`Dry run: would set ${keys.join(", ")} for Vercel production.`);
  console.log("Run pnpm vercel:env:sync -- --apply to apply.");
  process.exit(0);
}

for (const key of keys) {
  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      key,
      "production",
      "--force",
      "--yes",
      ...(key === "DATABASE_URL" ? ["--sensitive"] : []),
    ],
    {
      input: entries.get(key),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    console.error(`Failed to set ${key}; no value was printed.`);
    process.exit(1);
  }
  console.log(`Set ${key} for Vercel production.`);
}
