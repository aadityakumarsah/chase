import { loadEnvConfig } from "@next/env";
import { z } from "zod";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { getEnv } = await import("../src/lib/env");
  const env = getEnv();
  const base = process.env.CHASE_VERIFY_BASE_URL ?? "http://localhost:3000";
  const request = (path: string, init?: RequestInit) =>
    fetch(base + path, { redirect: "manual", ...init });
  const check = (condition: boolean, label: string) => {
    if (!condition) throw new Error(label);
    console.log(`PASS ${label}`);
  };

  const login = await request("/login/session", {
    method: "POST",
    headers: {
      Origin: new URL(env.APP_BASE_URL).origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      passcode: z.string().min(1).parse(env.ADMIN_PASSCODE),
    }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  check(login.status === 303 && Boolean(cookie), "admin session established");
  const auth = { Cookie: cookie };

  const page = await request("/brief", { headers: auth });
  check(page.status === 200, "brief dashboard renders");
  const api = await request("/api/brief", { headers: auth });
  const body = (await api.json()) as {
    brief?: { forDate?: string } | null;
    history?: unknown[];
  };
  check(
    api.status === 200 &&
      Boolean(body.brief?.forDate) &&
      Array.isArray(body.history),
    "latest brief API returns persisted data",
  );
  const dated = await request(`/api/brief/${body.brief!.forDate}`, {
    headers: auth,
  });
  check(dated.status === 200, "dated brief API renders");
  const rerun = await request("/api/brief/run", {
    method: "POST",
    headers: {
      ...auth,
      Origin: new URL(env.APP_BASE_URL).origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ date: body.brief!.forDate, deliver: ["dashboard"] }),
  });
  check(rerun.status === 200, "dashboard-only rerun is idempotent");
  check(
    (await request("/api/cron/brief")).status === 401,
    "cron rejects missing bearer credentials",
  );
}

void main().catch(() => {
  console.error("Part 8 HTTP verification failed; no credentials were logged");
  process.exitCode = 1;
});
