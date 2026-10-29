import { describe, expect, it, vi, afterEach } from "vitest";
import {
  toIST,
  nowIST,
  formatIST,
  isWithinWindow,
  spokenDateEn,
  spokenDateHi,
  bolnaScheduledAt,
} from "@/lib/time";
afterEach(() => vi.useRealTimers());
describe("IST time", () => {
  it("formats UTC instants in IST across midnight", () => {
    const date = new Date("2026-11-04T20:00:00Z");
    expect(formatIST(date, "yyyy-MM-dd HH:mm")).toBe("2026-11-05 01:30");
    expect(toIST(date).getDate()).toBe(5);
    vi.useFakeTimers();
    vi.setSystemTime(date);
    expect(nowIST().getHours()).toBe(1);
    expect(spokenDateHi(date)).toBe("5 नवंबर");
    expect(spokenDateEn(date)).toBe("5 November");
  });
  it("uses a half-open window and validates bounds", () => {
    expect(
      isWithinWindow(new Date("2026-11-05T03:30:00Z"), "09:00", "18:30"),
    ).toBe(true);
    expect(isWithinWindow(new Date("2026-11-05T03:29:59Z"))).toBe(false);
    expect(isWithinWindow(new Date("2026-11-05T13:00:00Z"))).toBe(false);
    expect(() => isWithinWindow(new Date(), "25:00", "26:00")).toThrow();
    expect(() => isWithinWindow(new Date(), "19:00", "08:00")).toThrow();
  });
  it("enforces minimum lead time, rounds up and emits +00:00", () => {
    const now = new Date("2026-10-29T12:08:01Z");
    expect(bolnaScheduledAt(new Date("2026-10-29T12:00:00Z"), now)).toBe(
      "2026-10-29T12:20:00+00:00",
    );
    expect(bolnaScheduledAt(new Date("2026-10-29T12:30:00Z"), now)).toBe(
      "2026-10-29T12:30:00+00:00",
    );
    expect(() => bolnaScheduledAt(new Date("invalid"), now)).toThrow();
  });
});
