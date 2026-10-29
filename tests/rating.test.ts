import { describe, expect, it } from "vitest";
import {
  computeRating,
  bandForScore,
  calibratedScore,
  explainRating,
  type RatingInput,
} from "@/lib/chase/rating";
import { fixtureRatingInput, SEED_PORTFOLIO } from "@/lib/chase/seed-portfolio";
const base = fixtureRatingInput(SEED_PORTFOLIO[0]);
const rate = (patch: Partial<RatingInput> = {}) =>
  computeRating({ ...base, ...patch });
describe("Chase Rating", () => {
  it.each([
    [{ opted_out: true }, "do_not_contact"],
    [{ status: "do_not_contact" }, "do_not_contact"],
    [{ status: "dispute" }, "human_review"],
    [{ reason_code: "dispute" }, "human_review"],
    [{ status: "wrong_number" }, "verify_number"],
    [{ reason_code: "wrong_number" }, "verify_number"],
    [{ status: "paid" }, "none"],
    [{ outstanding_rupees: 0 }, "none"],
  ] as [Partial<RatingInput>, string][])("hard routes %j", (input, action) => {
    expect(rate(input)).toMatchObject({
      score: null,
      band: "X",
      next_action: action,
    });
  });
  it("gives opt-out priority over every other route", () => {
    expect(rate({ opted_out: true, status: "dispute" }).next_action).toBe(
      "do_not_contact",
    );
  });
  it("preserves the supplied probability and raw formula", () => {
    const r = rate();
    expect(r.p_pay_7d).toBeCloseTo(0.4);
    expect(r.components.A).toBeCloseTo(Math.log10(12501) / Math.log10(185001));
    expect(r.components.U).toBeCloseTo(0.35 + 34 / 120);
    expect(r.components.E).toBe(1.3);
    expect(r.components.raw).toBeCloseTo(
      (0.4 * (0.35 + 0.65 * r.components.A) * (0.45 + 0.55 * r.components.U)) /
        1.3,
    );
    expect(explainRating(r)).toContain("globally calibrated");
  });
  it("never increases with broken promises or attempts, nor decreases with kept ratio", () => {
    for (const profile of SEED_PORTFOLIO.filter((p) => p.kind === "ordinary")) {
      const input = fixtureRatingInput(profile);
      let brokenPrevious = 101,
        attemptPrevious = 101,
        keptPrevious = -1;
      for (let n = 0; n <= 10; n++) {
        const broken = computeRating({
          ...input,
          promises: { made: 10, kept: 0, broken: n, partially_kept: 0 },
        }).score!;
        const kept = computeRating({
          ...input,
          promises: { made: 10, kept: n, broken: 0, partially_kept: 0 },
        }).score!;
        const attempts = computeRating({ ...input, attempts_7d: n }).score!;
        expect(broken).toBeLessThanOrEqual(brokenPrevious);
        expect(kept).toBeGreaterThanOrEqual(keptPrevious);
        expect(attempts).toBeLessThanOrEqual(attemptPrevious);
        brokenPrevious = broken;
        keptPrevious = kept;
        attemptPrevious = attempts;
      }
    }
  });
  it("clamps probabilities, components and display scores", () => {
    expect(
      rate({
        dpd: 140,
        reason_code: "avoidance",
        sentiment: "hostile",
        promises: { made: 20, kept: 0, broken: 20, partially_kept: 0 },
      }).p_pay_7d,
    ).toBe(0.02);
    const high = rate({
      dpd: 0,
      reason_code: "salary_delay",
      sentiment: "positive",
      promises: { made: 1, kept: 1, broken: 0, partially_kept: 0 },
      portfolio_max_outstanding_rupees: 1,
    });
    expect(high.p_pay_7d).toBeCloseTo(0.93);
    expect(high.components.A).toBe(1);
    expect(rate({ dpd: 999 }).components.U).toBe(1);
    expect(rate({ portfolio_max_outstanding_rupees: 0 }).components.A).toBe(0);
    expect(calibratedScore(0)).toBe(0);
    expect(calibratedScore(999)).toBe(100);
  });
  it.each([
    [0, "D"],
    [24, "D"],
    [25, "C"],
    [44, "C"],
    [45, "B"],
    [69, "B"],
    [70, "A"],
    [100, "A"],
  ] as const)("bands %i as %s", (score, band) =>
    expect(bandForScore(score)).toBe(band),
  );
  it("waits for future promises and allows only the one-day reminder", () => {
    const tomorrow = rate({
      active_promise: { date: "2026-10-30", amount: 5000 },
    });
    expect(tomorrow).toMatchObject({
      score: 20,
      band: "D",
      next_action: "wait_for_promise",
    });
    expect(tomorrow.reasons).toContain("reminder_allowed:1");
    expect(
      rate({ active_promise: { date: "2026-10-31", amount: 5000 } }).reasons,
    ).not.toContain("reminder_allowed:1");
    expect(
      rate({ active_promise: { date: base.today, amount: 5000 } }).next_action,
    ).not.toBe("wait_for_promise");
  });
  it("routes unanswered and hardship contacts", () => {
    expect(rate({ unanswered_streak: 3 }).next_action).toBe("whatsapp_first");
    const r = rate({ status: "hardship", unanswered_streak: 5 });
    expect(r.next_action).toBe("gentle_checkin");
    expect(r.reasons).toContain("minimum_gap_hours:72");
  });
  it("calibrates the demo to 75–80 and spreads the fictional portfolio roughly 10–90", () => {
    const demo = rate();
    expect(demo.score).toBeGreaterThanOrEqual(75);
    expect(demo.score).toBeLessThanOrEqual(80);
    expect(demo.band).toBe("A");
    const scores = SEED_PORTFOLIO.map(
      (p) => computeRating(fixtureRatingInput(p)).score,
    ).filter((s): s is number => s !== null);
    expect(
      scores.filter((score) => score > demo.score!).length,
    ).toBeLessThanOrEqual(4);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(8);
    expect(Math.min(...scores)).toBeLessThanOrEqual(15);
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(85);
    expect(Math.max(...scores)).toBeLessThanOrEqual(95);
  });
  it("rejects invalid external features", () => {
    expect(() => rate({ outstanding_rupees: NaN })).toThrow();
    expect(() => rate({ attempts_7d: -1 })).toThrow();
    expect(() => rate({ today: "2026-02-30" })).toThrow();
    expect(() =>
      rate({ promises: { made: 1, kept: 2, broken: 0, partially_kept: 0 } }),
    ).toThrow();
  });
});
