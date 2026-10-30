/** Part 9 replaces this stable cron hook with the evaluator and simulator job. */
export async function runNightlyPromptPrJob() {
  return { status: "no_op" as const, reason: "Part 9 is not active" };
}
