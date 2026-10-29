import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { z } from "zod";
export const IST = "Asia/Kolkata";
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const valid = (date: Date): Date => z.date().parse(date);
// These wall-clock Date objects are display-only; persist the original UTC instant.
export const toIST = (date: Date): Date => toZonedTime(valid(date), IST);
export const nowIST = (): Date => toIST(new Date());
export const formatIST = (date: Date, pattern = "dd MMM yyyy, HH:mm"): string =>
  formatInTimeZone(valid(date), IST, pattern);
export function isWithinWindow(
  date: Date,
  start = "09:00",
  end = "18:30",
): boolean {
  clock.parse(start);
  clock.parse(end);
  if (start >= end)
    throw new Error(
      "Call window must start before it ends on the same IST day",
    );
  const time = formatIST(date, "HH:mm");
  return time >= start && time < end;
}
export const spokenDateHi = (date: Date): string =>
  new Intl.DateTimeFormat("hi-IN", {
    timeZone: IST,
    day: "numeric",
    month: "long",
  }).format(valid(date));
export const spokenDateEn = (date: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "numeric",
    month: "long",
  }).format(valid(date));
export function bolnaScheduledAt(date: Date, now = new Date()): string {
  const earliest = Math.max(
    valid(date).getTime(),
    valid(now).getTime() + 120_000,
  );
  // Match Bolna's upward rounding before compliance checks inspect the actual slot.
  const rounded = new Date(Math.ceil(earliest / 600_000) * 600_000);
  return rounded.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
