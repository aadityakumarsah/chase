import { describe, expect, it, vi } from "vitest";
import { BolnaClient, BolnaError } from "@/lib/bolna/client";
const apiKey = "unit-test-bolna-secret";
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
describe("Bolna client", () => {
  it("uses official endpoints, authenticates and strips unrelated fields", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          name: "Test",
          wallet: 500,
          concurrency: { max: 2, current: 0 },
          email: "private",
        }),
      )
      .mockResolvedValueOnce(
        json([{ id: "test-agent", agent_name: "Collections" }]),
      )
      .mockResolvedValueOnce(
        json({ id: "test-agent", agent_name: "Collections" }),
      );
    const client = new BolnaClient({ apiKey, fetch: request });
    expect(await client.getMe()).not.toHaveProperty("email");
    expect((await client.listAgents())[0].id).toBe("test-agent");
    await client.getAgent("test-agent");
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      "https://api.bolna.ai/user/me",
      "https://api.bolna.ai/v2/agent/all",
      "https://api.bolna.ai/v2/agent/test-agent",
    ]);
    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${apiKey}`,
    });
  });
  it("retries 429 and 5xx with retry hints and jitter", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ retry_after_seconds: 2 }, 429))
      .mockResolvedValueOnce(json({}, 503, { "Retry-After": "3" }))
      .mockResolvedValueOnce(json([]));
    const sleep = vi.fn(async () => {});
    const client = new BolnaClient({
      apiKey,
      fetch: request,
      sleep,
      random: () => 0.5,
    });
    await expect(client.listAgents()).resolves.toEqual([]);
    expect(sleep.mock.calls).toEqual([[2125], [3125]]);
  });
  it("does not retry authentication errors and sanitises response bodies", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ message: `Bearer ${apiKey}`, echoed: apiKey }, 401),
      );
    const client = new BolnaClient({ apiKey, fetch: request });
    try {
      await client.getMe();
      expect.fail();
    } catch (error) {
      expect(error).toBeInstanceOf(BolnaError);
      expect((error as BolnaError).status).toBe(401);
      expect(JSON.stringify(error)).not.toContain(apiKey);
    }
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed success payloads without echoing their content", async () => {
    const client = new BolnaClient({
      apiKey,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(json({ name: apiKey })),
    });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 200,
      body: { error: "Invalid response schema" },
    });
  });
  it("bounds retry count", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({}, 500));
    const client = new BolnaClient({
      apiKey,
      fetch: request,
      sleep: async () => {},
    });
    await expect(client.getMe()).rejects.toMatchObject({ status: 500 });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("aborts a slow response within timeout", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("timeout")),
          );
        }),
    );
    const client = new BolnaClient({ apiKey, fetch: request, timeoutMs: 5 });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 0,
      body: { error: "Request timed out" },
    });
  });
});
