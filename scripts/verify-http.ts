import { loadEnvConfig } from "@next/env";
import { z } from "zod";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { healthSchema } = await import("../src/lib/health");
  const env = getEnv();
  const base = "http://localhost:3000";
  const check = (ok: boolean, label: string) => {
    if (!ok) throw new Error(label);
    console.log(`PASS ${label}`);
  };
  const request = (path: string, options?: RequestInit) =>
    fetch(base + path, { redirect: "manual", ...options });
  check((await request("/login")).status === 200, "login page serves");
  const health = await request("/api/health");
  check(
    health.status === 200 &&
      healthSchema.safeParse(await health.json()).success,
    "public health returns typed JSON",
  );
  check((await request("/")).status === 307, "dashboard requires login");
  check(
    (await request("/api/events")).status === 401,
    "event API requires login",
  );
  check(
    (await request("/api/private.json")).status === 401,
    "file extension cannot bypass API auth",
  );
  check(
    (await request("/api/events", { headers: { Cookie: "admin=true" } }))
      .status === 401,
    "forged admin cookie rejected",
  );
  check(
    (await request("/api/tools/future")).status === 404,
    "public tool namespace bypasses dashboard auth only",
  );
  const badOrigin = await request("/login/session", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.invalid",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "passcode=invalid",
  });
  check(badOrigin.status === 403, "cross-origin login rejected");
  const passcode = z.string().min(1).parse(env.ADMIN_PASSCODE);
  const login = await request("/login/session", {
    method: "POST",
    headers: {
      Origin: new URL(env.APP_BASE_URL).origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ passcode }),
  });
  const rawCookie = login.headers.get("set-cookie") ?? "";
  check(
    login.status === 303 &&
      rawCookie.includes("HttpOnly") &&
      rawCookie.includes("SameSite=lax"),
    "login sets protected session cookie",
  );
  const cookie = rawCookie.split(";")[0];
  check(
    (await request("/", { headers: { Cookie: cookie } })).status === 200,
    "authenticated dashboard serves",
  );
  check(
    (await request("/api/events", { headers: { Cookie: cookie } })).status ===
      200,
    "authenticated event feed serves",
  );
}
void main().catch(() => {
  console.error("HTTP verification failed; no request credentials were logged");
  process.exitCode = 1;
});
