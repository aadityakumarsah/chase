import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Narrow production cutover.
 *
 * The old .env still holds single-tenant and Neon-era values, so this never
 * bulk-syncs: it copies an explicit list and nothing else. Values are piped to
 * the Vercel CLI on stdin and are never printed, logged or echoed on failure.
 */

/** Required: production cannot serve the app without these. */
const REQUIRED = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

/**
 * Optional: subscription billing. Absent locally simply means checkout stays
 * switched off in production rather than failing the sync.
 */
const OPTIONAL = [
  "SUPABASE_SECRET_KEY",
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_ENVIRONMENT",
  "DODO_WEBHOOK_SECRET",
  "DODO_PRODUCT_PRO_MONTHLY",
  "DODO_PRODUCT_PRO_YEARLY",
  "SALES_CONTACT_EMAIL",
] as const;

/** Values Vercel should store encrypted and never show again. */
const SENSITIVE = new Set([
  "DATABASE_URL",
  "SUPABASE_SECRET_KEY",
  "DODO_PAYMENTS_API_KEY",
  "DODO_WEBHOOK_SECRET",
]);

const entries = new Map<string, string>();
// Later files win, so .env.local overrides .env as it does at runtime.
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
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
    if (value) entries.set(key, value);
  }
}

for (const key of REQUIRED)
  if (!entries.get(key)) throw new Error(`Missing ${key} in .env/.env.local`);

const db = new URL(entries.get("DATABASE_URL")!);
if (
  !["postgres:", "postgresql:"].includes(db.protocol) ||
  !db.hostname.endsWith(".supabase.com")
)
  throw new Error("DATABASE_URL must point to the Supabase pooler");

// Billing is all-or-nothing: a half-configured catalogue would show an upgrade
// button that fails at checkout, which is worse than no button at all.
const billingKeys = [
  "DODO_PAYMENTS_API_KEY",
  "DODO_WEBHOOK_SECRET",
  "DODO_PRODUCT_PRO_MONTHLY",
  "DODO_PRODUCT_PRO_YEARLY",
] as const;
const billingPresent = billingKeys.filter((key) => entries.get(key));
if (billingPresent.length && billingPresent.length !== billingKeys.length) {
  const missing = billingKeys.filter((key) => !entries.get(key));
  throw new Error(
    `Billing is partially configured; missing ${missing.join(", ")}`,
  );
}

const planned = [...REQUIRED, ...OPTIONAL.filter((key) => entries.get(key))];
const mode = entries.get("DODO_PAYMENTS_ENVIRONMENT");

if (!process.argv.includes("--apply")) {
  console.log(`Dry run: would set ${planned.length} variables for production:`);
  for (const key of planned)
    console.log(`  ${key}${SENSITIVE.has(key) ? " (sensitive)" : ""}`);
  if (mode === "live_mode")
    console.log(
      "\nDODO_PAYMENTS_ENVIRONMENT is live_mode: checkout will take real payments.",
    );
  console.log("\nRun pnpm vercel:env:sync -- --apply to apply.");
  process.exit(0);
}

for (const key of planned) {
  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      key,
      "production",
      "--force",
      "--yes",
      ...(SENSITIVE.has(key) ? ["--sensitive"] : []),
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
  console.log(`Set ${key} for production.`);
}
console.log("\nRedeploy for these to take effect: vercel deploy --prod");
