import { z } from "zod";
import { type Env } from "@/lib/env";
import { e164Schema } from "@/lib/phone";
import { isWithinWindow } from "@/lib/time";
export function assertDialAllowed(
  phone: string,
  env: Pick<Env, "DEMO_MODE" | "CALL_ALLOWLIST">,
): void {
  e164Schema.parse(phone);
  if (/^\+91900000\d{4}$/.test(phone))
    throw new Error("Call blocked: reserved fictional seed number");
  if (env.DEMO_MODE && !env.CALL_ALLOWLIST.includes(phone))
    throw new Error("Demo call blocked: recipient is not in CALL_ALLOWLIST");
}
export function isAllowedCollectionTime(
  date: Date,
  start = "09:00",
  end = "18:30",
): boolean {
  z.string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .parse(start);
  z.string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .parse(end);
  if (start < "08:00" || end > "19:00")
    throw new Error("Collection window exceeds hard limits 08:00–19:00 IST");
  return isWithinWindow(date, start, end);
}
