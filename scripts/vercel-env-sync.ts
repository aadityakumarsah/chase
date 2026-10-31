import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = readFileSync(".env", "utf8");
const skip = new Set(["APP_BASE_URL", "DATABASE_URL"]);
const entries = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    return [key, value] as const;
  })
  .filter(([key, value]) => value && !skip.has(key));

for (const [key, value] of entries) {
  const sensitive = /KEY|SECRET|TOKEN|PASSCODE|ALLOWLIST|PHONE|SID|VPA/.test(
    key,
  );
  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      key,
      "production",
      "--force",
      "--yes",
      ...(sensitive ? ["--sensitive"] : []),
    ],
    { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    console.error(`Failed to set ${key}; no value was printed.`);
    process.exit(1);
  }
  console.log(`Set ${key} for production.`);
}
console.log(`Synced ${entries.length} populated deployment keys.`);
