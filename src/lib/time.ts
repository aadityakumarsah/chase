import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
export const IST = "Asia/Kolkata";
export const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const clock = clockSchema;
const day = z.iso.date();
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
/** IST calendar day of an instant, as yyyy-MM-dd. */
export const istDay = (date: Date): string => formatIST(date, "yyyy-MM-dd");
/** The instant at an IST wall-clock day and time. */
export function istInstant(isoDay: string, time: string): Date {
  day.parse(isoDay);
  clock.parse(time);
  return fromZonedTime(`${isoDay}T${time}:00`, IST);
}
export function addIstDays(isoDay: string, days: number): string {
  day.parse(isoDay);
  z.number().int().min(-3650).max(3650).parse(days);
  return formatInTimeZone(
    new Date(`${isoDay}T06:30:00Z`).getTime() + days * 86_400_000,
    IST,
    "yyyy-MM-dd",
  );
}
/**
 * Bolna rounds scheduled_at up to the next ten-minute mark and rejects a slot
 * under two minutes away, so Chase rounds first and checks the real slot.
 */
export function bolnaSlot(date: Date, now = new Date()): Date {
  const earliest = Math.max(
    valid(date).getTime(),
    valid(now).getTime() + 120_000,
  );
  return new Date(Math.ceil(earliest / 600_000) * 600_000);
}
export function bolnaScheduledAt(date: Date, now = new Date()): string {
  // Bolna rejects a trailing "Z" on scheduled_at; send an explicit +00:00 offset.
  return bolnaSlot(date, now)
    .toISOString()
    .replace(/\.\d{3}Z$/, "+00:00");
}
