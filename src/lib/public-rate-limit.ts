import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; until: number };
const state = globalThis as unknown as {
  chasePublicLimits?: Map<string, Bucket>;
};
const buckets = (state.chasePublicLimits ??= new Map());

export function publicRequestAllowed(
  scope: string,
  identity: string,
  limit: number,
  now = Date.now(),
) {
  for (const [key, value] of buckets)
    if (value.until <= now) buckets.delete(key);
  const id = createHash("sha256").update(`${scope}:${identity}`).digest("hex");
  if (buckets.size >= 20_000 && !buckets.has(id)) return false;
  const bucket = buckets.get(id) ?? { count: 0, until: now + 60_000 };
  bucket.count += 1;
  buckets.set(id, bucket);
  return bucket.count <= limit;
}

export function publicRateLimit(
  request: NextRequest,
  scope: string,
  limit = 60,
) {
  const identity =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (publicRequestAllowed(scope, identity, limit)) return null;
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
