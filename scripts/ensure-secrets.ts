import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const keys = [
  "CHASE_TOOL_SECRET",
  "CHASE_WEBHOOK_SECRET",
  "CHASE_PROXY_KEY",
  "CRON_SECRET",
  "ADMIN_PASSCODE",
] as const;
const added: string[] = [];
const original = existsSync(".env") ? readFileSync(".env", "utf8") : "";
for (const key of keys) {
  if (!process.env[key]?.trim()) {
    appendFileSync(".env", `\n${key}=${randomBytes(32).toString("hex")}\n`, {
      mode: 0o600,
    });
    added.push(key);
  }
}
if (existsSync(".env") && !readFileSync(".env", "utf8").startsWith(original))
  throw new Error("Append-only invariant failed");
console.log(
  `Added security key names: ${added.length ? added.join(", ") : "none (all already set)"}`,
);
