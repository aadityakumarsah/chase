import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { afterAll, expect, test } from "vitest";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const cases = [
  {
    file: "promise",
    outcome: "ptp_made",
    made: true,
    amount: 5000,
    date: "2026-11-05",
  },
  { file: "partial", outcome: "partial_paid", made: false },
  { file: "dispute", outcome: "dispute_raised", made: false },
  { file: "hardship", outcome: "hardship", made: false },
  { file: "stop", outcome: "opted_out", made: false, action: "stop_contact" },
  {
    file: "wrong",
    outcome: "wrong_number",
    made: false,
    action: "verify_number",
  },
];
test.skipIf(process.env.RUN_LLM_EVALS !== "1")(
  "at least five of six analysis fixtures; opt-out is mandatory",
  async () => {
    const { analyzeCall } = await import("@/lib/analysis");
    let passed = 0;
    let optout = false;
    for (const c of cases) {
      try {
        const { value } = await analyzeCall(
          await readFile(`tests/fixtures/transcripts/${c.file}.txt`, "utf8"),
          "2026-10-29",
        );
        const ok =
          value.outcome === c.outcome &&
          value.promise.made === c.made &&
          value.promise.amount_rupees === (c.amount ?? 0) &&
          value.promise.date === (c.date ?? "") &&
          (!c.action || value.next_best_action === c.action);
        if (ok) passed++;
        if (c.file === "stop") optout = ok;
        console.log(`${c.file}: ${ok ? "PASS" : "FAIL"}`);
      } catch {
        console.log(`${c.file}: FAIL (provider/schema error)`);
      }
    }
    expect(optout, "Opt-out must never be missed").toBe(true);
    expect(passed).toBeGreaterThanOrEqual(5);
  },
);
afterAll(async () => {
  const { closeDb } = await import("@/lib/db");
  await closeDb();
});
