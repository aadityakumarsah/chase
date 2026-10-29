import { z } from "zod";
import type { Usage } from "./types";
import { LLMError } from "./types";
const rate = z.number().finite().nonnegative();
const prices = z.record(
  z.string(),
  z.strictObject({
    input: rate,
    output: rate,
    cacheRead: rate,
    cacheWrite: rate,
  }),
);
// Estimates use operator-supplied prices, never a guessed or silently stale tariff.
export function estimateCost(
  provider: string,
  model: string,
  usage: Usage,
  config?: string,
): string | null {
  if (!config) return null;
  let parsed: z.infer<typeof prices>;
  try {
    parsed = prices.parse(JSON.parse(config));
  } catch {
    throw new LLMError("configuration");
  }
  const r = parsed[`${provider}/${model}`];
  if (!r) return null;
  const uncached =
    provider === "anthropic"
      ? usage.input
      : Math.max(0, usage.input - usage.cacheRead);
  return (
    (uncached * r.input +
      usage.output * r.output +
      usage.cacheRead * r.cacheRead +
      usage.cacheWrite * r.cacheWrite) /
    1_000_000
  ).toFixed(9);
}
