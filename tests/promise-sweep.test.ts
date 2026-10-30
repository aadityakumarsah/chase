import { describe, expect, it } from "vitest";
import { promiseResolution } from "@/lib/chase/sweep";

describe("promise resolution", () => {
  it.each([
    [0n, 500_000n, "broken"],
    [200_000n, 500_000n, "partially_kept"],
    [500_000n, 500_000n, "kept"],
    [600_000n, 500_000n, "kept"],
  ] as const)("maps %s paid against %s", (paid, promised, expected) => {
    expect(promiseResolution(paid, promised)).toBe(expected);
  });
});
