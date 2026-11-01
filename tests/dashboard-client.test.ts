import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, DashboardRequestError } from "@/lib/dashboard/client";

afterEach(() => vi.unstubAllGlobals());

it("returns typed JSON and puts a deadline on dashboard requests", async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return new Response(JSON.stringify({ count: 3 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    apiFetch<{ count: number }>("/api/dashboard/home"),
  ).resolves.toEqual({ count: 3 });
});

it("turns HTTP and network failures into safe, recoverable errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private body", { status: 503 })),
  );
  await expect(apiFetch("/api/queue")).rejects.toMatchObject({
    name: "DashboardRequestError",
    status: 503,
    message: "Request failed (503)",
  } satisfies Partial<DashboardRequestError>);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("private network detail");
    }),
  );
  await expect(apiFetch("/api/queue")).rejects.toMatchObject({
    name: "DashboardRequestError",
    status: null,
    message: "Request timed out or network unavailable",
  } satisfies Partial<DashboardRequestError>);
});
