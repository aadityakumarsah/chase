import { z } from "zod";
import {
  addIstDays,
  bolnaSlot,
  clockSchema,
  istDay,
  istInstant,
  isWithinWindow,
} from "@/lib/time";

/** Hard conduct limits. A business window can be narrower, never wider. */
export const HARD_WINDOW_START = "08:00";
export const HARD_WINDOW_END = "19:00";

export const callWindowSchema = z
  .object({ start: clockSchema, end: clockSchema })
  .refine((w) => w.start < w.end, "Call window must start before it ends")
  .refine(
    (w) => w.start >= HARD_WINDOW_START && w.end <= HARD_WINDOW_END,
    `Call window must stay inside ${HARD_WINDOW_START}-${HARD_WINDOW_END} IST`,
  );
export type CallWindow = z.infer<typeof callWindowSchema>;

/** Postgres `time` columns arrive as HH:MM:SS. */
export function toCallWindow(input: {
  callWindowStart: string;
  callWindowEnd: string;
}): CallWindow {
  return callWindowSchema.parse({
    start: input.callWindowStart.slice(0, 5),
    end: input.callWindowEnd.slice(0, 5),
  });
}

export function isWithinCallWindow(date: Date, window: CallWindow): boolean {
  const w = callWindowSchema.parse(window);
  return isWithinWindow(date, w.start, w.end);
}

/**
 * First instant at or after `from` that falls inside the IST call window.
 * Returns `from` itself when the call window is already open.
 */
export function nextWindowOpening(from: Date, window: CallWindow): Date {
  const w = callWindowSchema.parse(window);
  let day = istDay(z.date().parse(from));
  for (let i = 0; i <= 8; i++) {
    const open = istInstant(day, w.start);
    const close = istInstant(day, w.end);
    if (from.getTime() < open.getTime()) return open;
    if (from.getTime() < close.getTime()) return from;
    day = addIstDays(day, 1);
  }
  throw new Error("No call window found in the next eight days");
}

/**
 * The slot Bolna will actually use: inside the window, at least two minutes
 * ahead, on the ten-minute grid. Rounding can cross the closing boundary, so
 * the rounded slot is re-checked and pushed to the next opening if needed.
 */
export function nextAllowedSlot(
  requestedAt: Date,
  window: CallWindow,
  now = new Date(),
): Date {
  const w = callWindowSchema.parse(window);
  let candidate = z.date().parse(requestedAt);
  for (let i = 0; i < 3; i++) {
    const opening = nextWindowOpening(
      new Date(Math.max(candidate.getTime(), now.getTime())),
      w,
    );
    const slot = bolnaSlot(opening, now);
    if (isWithinCallWindow(slot, w)) return slot;
    // Rounded past closing time: try from the next day's opening.
    candidate = istInstant(addIstDays(istDay(slot), 1), w.start);
  }
  throw new Error("Could not find an allowed call slot");
}

/** morning / afternoon / evening bucket used by callbacks and dossiers. */
export function istWindowBucket(
  date: Date,
): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(z.date().parse(date)),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
