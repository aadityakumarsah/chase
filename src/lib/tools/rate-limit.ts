import { createHash } from "node:crypto";
// Process-local demo limiter; not a distributed production quota.
const globalLimits = globalThis as unknown as {
  chaseToolLimits?: Map<string, { count: number; until: number }>;
};
const limits = (globalLimits.chaseToolLimits ??= new Map());
export function withinRateLimit(
  kind: "ip" | "call" | "pay",
  key: string,
  now = Date.now(),
) {
  const id = kind + createHash("sha256").update(key).digest("hex");
  for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
  if (limits.size >= 10000 && !limits.has(id)) return false;
  const limit = kind === "ip" ? 120 : kind === "call" ? 40 : 15;
  const current = limits.get(id) ?? { count: 0, until: now + 60_000 };
  current.count++;
  limits.set(id, current);
  return current.count <= limit;
}
