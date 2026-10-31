import { describe, expect, it } from "vitest";
import { publicRequestAllowed } from "@/lib/public-rate-limit";

describe("public route rate limiting", () => {
  it("allows the configured minute budget and rejects the next request", () => {
    const now = Date.now();
    const scope = `unit-${now}`;
    expect(publicRequestAllowed(scope, "198.51.100.9", 2, now)).toBe(true);
    expect(publicRequestAllowed(scope, "198.51.100.9", 2, now)).toBe(true);
    expect(publicRequestAllowed(scope, "198.51.100.9", 2, now)).toBe(false);
    expect(publicRequestAllowed(scope, "198.51.100.9", 2, now + 60_001)).toBe(
      true,
    );
  });

  it("keeps identities and route scopes isolated", () => {
    const scope = `unit-isolation-${Date.now()}`;
    expect(publicRequestAllowed(scope, "one", 1)).toBe(true);
    expect(publicRequestAllowed(scope, "one", 1)).toBe(false);
    expect(publicRequestAllowed(scope, "two", 1)).toBe(true);
    expect(publicRequestAllowed(`${scope}-other`, "one", 1)).toBe(true);
  });
});
