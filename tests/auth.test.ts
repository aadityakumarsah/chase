import { expect, it } from "vitest";
import {
  createSession,
  verifySession,
  isPublicPath,
  matchesPasscode,
  SESSION_SECONDS,
} from "@/lib/auth";
const secret = "unit-test-session-secret-only";
it("verifies signed sessions and rejects tampering, expiry, missing and rotated credentials", () => {
  const now = Date.now();
  const token = createSession(secret, now);
  expect(verifySession(token, secret, now)).toBe(true);
  expect(verifySession("true", secret, now)).toBe(false);
  expect(
    verifySession(`${token.split(".")[0]}.${"é".repeat(43)}`, secret, now),
  ).toBe(false);
  expect(verifySession(token + ".extra", secret, now)).toBe(false);
  expect(verifySession("x" + token, secret, now)).toBe(false);
  expect(verifySession(token, secret, now + SESSION_SECONDS * 1000)).toBe(
    false,
  );
  expect(verifySession(token, "rotated-unit-secret", now)).toBe(false);
  expect(verifySession(token, undefined, now)).toBe(false);
  expect(matchesPasscode(secret, secret)).toBe(true);
  expect(matchesPasscode("wrong", secret)).toBe(false);
});
it("exempts exact public routes without prefix or extension bypasses", () => {
  for (const route of [
    "/",
    "/assets/chase-mascot.webp",
    "/audio/walkthrough-01.mp3",
    "/opengraph-image.png",
    "/robots.txt",
    "/sitemap.xml",
    "/login",
    "/pricing",
    "/contact-sales",
    "/api/enterprise",
    "/login/session",
    "/docs",
    "/docs/quickstart",
    "/pay/abc",
    "/api/tools/pay",
    "/api/bolna/webhook",
    "/api/webhooks/test",
    "/api/llm/v1/chat/completions",
    "/api/cron/daily",
    "/api/web-call/session",
    "/api/health",
    "/_next/static/a.js",
    "/favicon.ico",
  ])
    expect(isPublicPath(route), route).toBe(true);
  for (const route of [
    "/dashboard",
    "/assets-private/file.png",
    "/dashboard/private",
    "/stage",
    "/api/events",
    "/api/tools-admin",
    "/login-admin",
    "/docs-private",
    "/api/private.json",
    "/api/health/admin",
  ])
    expect(isPublicPath(route), route).toBe(false);
});
