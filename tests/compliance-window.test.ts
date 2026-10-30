import { expect, it } from "vitest";
import {
  callWindowSchema,
  isWithinCallWindow,
  istWindowBucket,
  nextAllowedSlot,
  nextWindowOpening,
  toCallWindow,
} from "@/lib/compliance/window";
import { formatIST } from "@/lib/time";

const window = callWindowSchema.parse({ start: "09:00", end: "18:30" });
const ist = (value: string) => new Date(`${value}+05:30`);

it("refuses any window outside the hard conduct limits", () => {
  expect(() =>
    callWindowSchema.parse({ start: "07:59", end: "18:30" }),
  ).toThrow();
  expect(() =>
    callWindowSchema.parse({ start: "09:00", end: "19:01" }),
  ).toThrow();
  expect(() =>
    callWindowSchema.parse({ start: "18:30", end: "09:00" }),
  ).toThrow();
  expect(
    toCallWindow({ callWindowStart: "09:00:00", callWindowEnd: "18:30:00" }),
  ).toEqual({ start: "09:00", end: "18:30" });
});

it("treats the closing minute as closed", () => {
  expect(isWithinCallWindow(ist("2026-10-29T18:29:59"), window)).toBe(true);
  expect(isWithinCallWindow(ist("2026-10-29T18:30:00"), window)).toBe(false);
  expect(isWithinCallWindow(ist("2026-10-29T08:59:59"), window)).toBe(false);
});

it("moves a late-evening callback request to the next allowed slot", () => {
  const requested = ist("2026-10-29T21:00:00");
  const slot = nextAllowedSlot(requested, window, ist("2026-10-29T18:45:00"));
  expect(formatIST(slot, "yyyy-MM-dd HH:mm")).toBe("2026-10-30 09:00");
});

it("keeps an in-window request, rounded up to Bolna's ten-minute grid", () => {
  const now = ist("2026-10-29T11:00:00");
  const slot = nextAllowedSlot(ist("2026-10-29T15:03:00"), window, now);
  expect(formatIST(slot, "HH:mm")).toBe("15:10");
  // A slot under two minutes away is pushed forward by Bolna's own rule.
  const soon = nextAllowedSlot(ist("2026-10-29T11:00:30"), window, now);
  expect(soon.getTime()).toBeGreaterThanOrEqual(now.getTime() + 120_000);
});

it("pushes a rounded slot that would cross closing time to the next morning", () => {
  const now = ist("2026-10-29T18:20:00");
  const slot = nextAllowedSlot(ist("2026-10-29T18:25:00"), window, now);
  expect(formatIST(slot, "yyyy-MM-dd HH:mm")).toBe("2026-10-30 09:00");
});

it("returns the same instant when the window is already open", () => {
  const inside = ist("2026-10-29T10:00:00");
  expect(nextWindowOpening(inside, window)).toEqual(inside);
  expect(
    formatIST(nextWindowOpening(ist("2026-10-29T06:00:00"), window), "HH:mm"),
  ).toBe("09:00");
});

it("buckets IST hours for callbacks and dossiers", () => {
  expect(istWindowBucket(ist("2026-10-29T09:30:00"))).toBe("morning");
  expect(istWindowBucket(ist("2026-10-29T13:00:00"))).toBe("afternoon");
  expect(istWindowBucket(ist("2026-10-29T18:00:00"))).toBe("evening");
});
