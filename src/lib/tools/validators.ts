import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { addIstDays, istDay, istInstant, bolnaSlot } from "@/lib/time";
import { callWindowSchema, type CallWindow } from "@/lib/compliance/window";
export const CALL_TOKEN_MAX_AGE_MS = 45 * 60_000;
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const contextSchema = z.object({
  account_id: z.uuid(),
  call_token: tokenSchema,
});
export function secureEqual(a: string, b: string) {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return !!a && !!b && timingSafeEqual(hash(a), hash(b));
}
export function validCallContext(
  call: { callToken: string; debtorId: string | null; createdAt: Date },
  args: { call_token: string; account_id: string },
  now = new Date(),
) {
  const age = now.getTime() - call.createdAt.getTime();
  return (
    age >= 0 &&
    age <= CALL_TOKEN_MAX_AGE_MS &&
    call.debtorId === args.account_id &&
    secureEqual(call.callToken, args.call_token)
  );
}
export function idempotencyKey(
  tool: string,
  callId: string,
  args: Record<string, unknown>,
) {
  const normalized = Object.fromEntries(
    Object.entries(args)
      .filter(([k]) => !["account_id", "call_token"].includes(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return createHash("sha256")
    .update(JSON.stringify([callId, tool, normalized]))
    .digest("hex");
}
export function minPaymentPaise(outstanding: bigint) {
  const whole = Number(outstanding / 100n);
  return (
    BigInt(
      Math.min(whole, Math.max(500, Math.round((whole * 0.15) / 500) * 500)),
    ) * 100n
  );
}
export function validateAmount(rupees: number, outstanding: bigint) {
  const amount =
    BigInt(z.number().int().positive().safe().parse(rupees)) * 100n;
  const minimum = minPaymentPaise(outstanding);
  return {
    amount,
    minimum,
    valid:
      amount <= outstanding && (amount >= minimum || amount === outstanding),
  };
}
export function validPromiseDate(day: string, now = new Date()) {
  return (
    z.iso.date().safeParse(day).success &&
    day >= istDay(now) &&
    day <= addIstDays(istDay(now), 30)
  );
}
const windows = {
  morning: ["10:00", "12:00"],
  afternoon: ["14:00", "16:00"],
  evening: ["17:00", "18:30"],
} as const;
export function callbackSlot(
  day: string,
  bucket: keyof typeof windows,
  business: CallWindow,
  now = new Date(),
) {
  z.iso.date().parse(day);
  const w = callWindowSchema.parse(business);
  const requested = istInstant(day, windows[bucket][0]);
  const today = istDay(now),
    last = addIstDays(today, 7);
  const sunday = (d: string) =>
    new Date(`${d}T12:00:00+05:30`).getUTCDay() === 0;
  const find = (d: string, b: keyof typeof windows) => {
    const start = [w.start, windows[b][0]].sort().at(-1)!;
    const end = [w.end, windows[b][1]].sort()[0];
    if (start >= end || sunday(d)) return null;
    const slot = bolnaSlot(
      new Date(
        Math.max(istInstant(d, start).getTime(), now.getTime() + 120_000),
      ),
      now,
    );
    return istDay(slot) === d && slot < istInstant(d, end) ? slot : null;
  };
  const direct = day >= today && day <= last ? find(day, bucket) : null;
  if (direct)
    return {
      requested,
      scheduled: direct,
      adjusted: direct.getTime() !== requested.getTime(),
      window: bucket,
    };
  // An invalid request is moved to the next actual permitted bucket, never silently kept after hours.
  for (let n = 0; n <= 7; n++)
    for (const b of ["morning", "afternoon", "evening"] as const) {
      const d = addIstDays(today, n),
        slot = find(d, b);
      if (slot)
        return { requested, scheduled: slot, adjusted: true, window: b };
    }
  throw new Error("No callback slot in the next seven days");
}
