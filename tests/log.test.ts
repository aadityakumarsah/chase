import { expect, it, vi } from "vitest";
import { redact, log } from "@/lib/log";
it("preserves audit UUIDs while still hiding UUID credentials", () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  expect(redact({ agentId: id, promptVersionId: id, token: id }, [])).toEqual({
    agentId: id,
    promptVersionId: id,
    token: "[REDACTED]",
  });
  expect(redact({ message: id }, [id])).toEqual({ message: "[REDACTED]" });
  expect(redact("a".repeat(64), [])).toBe("[REDACTED]");
});
it("redacts nested credentials, bearer headers, URL credentials and known secrets", () => {
  const value = {
    apiKey: "unit-test-key",
    nested: [
      {
        Authorization: "Bearer unit-test-token",
        message: "Bearer unit-test-token password=unit-test-pass",
      },
    ],
    text: "known-short-test",
    url: "postgres://user:unit-test-pass@localhost/db",
  };
  const safe = JSON.stringify(redact(value, ["known-short-test"]));
  for (const secret of [
    "unit-test-key",
    "unit-test-token",
    "unit-test-pass",
    "known-short-test",
  ])
    expect(safe).not.toContain(secret);
});
it("handles cycles and errors without exposing raw SDK errors", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(JSON.stringify(redact(circular))).toContain("Circular");
  expect(
    JSON.stringify(redact(new Error("Bearer unit-test-token"))),
  ).not.toContain("unit-test-token");
});
it("uses structured redacted logs", () => {
  const spy = vi.spyOn(console, "info").mockImplementation(() => {});
  log.info("test", { token: "unit-test-token" });
  expect(spy.mock.calls[0][0]).not.toContain("unit-test-token");
  expect(JSON.parse(spy.mock.calls[0][0]).level).toBe("info");
  spy.mockRestore();
});
