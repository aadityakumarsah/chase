import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
import { z } from "zod";
export const SESSION_SECONDS = 8 * 60 * 60;
const sessionSchema = z.object({
  expires: z.number().int(),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
});
export function matchesPasscode(value: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(value).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
export function createSession(secret: string, now = Date.now()): string {
  const data = Buffer.from(
    JSON.stringify({
      expires: now + SESSION_SECONDS * 1000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}
export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!token || !secret || token.length > 1024) return false;
  const [data, signature, extra] = token.split(".");
  if (
    !data ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(data) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return false;
  try {
    const parsed = sessionSchema.safeParse(
      JSON.parse(Buffer.from(data, "base64url").toString()),
    );
    return (
      parsed.success &&
      parsed.data.expires > now &&
      parsed.data.expires <= now + SESSION_SECONDS * 1000
    );
  } catch {
    return false;
  }
}
export function isPublicPath(path: string): boolean {
  const roots = [
    "/login",
    "/pay",
    "/api/tools",
    "/api/pay",
    "/api/bolna",
    "/api/webhooks",
    "/api/llm",
    "/api/cron",
    "/api/web-call",
  ];
  return (
    roots.some((root) => path === root || path.startsWith(`${root}/`)) ||
    path === "/api/health" ||
    path.startsWith("/_next/") ||
    ["/favicon.ico", "/robots.txt", "/sitemap.xml"].includes(path) ||
    path.startsWith("/assets/")
  );
}
