import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { createSession, matchesPasscode, SESSION_SECONDS } from "@/lib/auth";
// Local-demo throttle. Replace with a shared store before multi-instance deployment.
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: NextRequest) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(env.APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!env.ADMIN_PASSCODE && !env.DEMO_VIEW_PASSCODE)
    return NextResponse.json(
      { error: "Dashboard authentication is not configured" },
      { status: 503 },
    );
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  // A global per-process bucket cannot be bypassed by spoofing forwarding headers.
  const bucket = attempts.get("login") ?? { count: 0, until: now + 60_000 };
  if (bucket.count >= 10)
    return NextResponse.json(
      { error: "Too many attempts; try again in a minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  attempts.set("login", { ...bucket, count: bucket.count + 1 });
  let passcode: string;
  try {
    const text = await request.text();
    if (text.length > 4096) throw new Error("Invalid body");
    passcode = z
      .string()
      .min(1)
      .max(512)
      .parse(new URLSearchParams(text).get("passcode"));
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=invalid", request.url),
      303,
    );
  }
  const isAdmin = Boolean(
    env.ADMIN_PASSCODE && matchesPasscode(passcode, env.ADMIN_PASSCODE),
  );
  const isViewer = Boolean(
    !isAdmin &&
    env.DEMO_VIEW_PASSCODE &&
    matchesPasscode(passcode, env.DEMO_VIEW_PASSCODE),
  );
  if (!isAdmin && !isViewer)
    return NextResponse.redirect(
      new URL("/login?error=invalid", request.url),
      303,
    );
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  const secret = isAdmin ? env.ADMIN_PASSCODE! : env.DEMO_VIEW_PASSCODE!;
  response.cookies.set(isAdmin ? "admin" : "demo_view", createSession(secret), {
    httpOnly: true,
    secure: new URL(env.APP_BASE_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  response.cookies.set(isAdmin ? "demo_view" : "admin", "", {
    httpOnly: true,
    secure: new URL(env.APP_BASE_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
