import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

const green = (s: string) => console.log(`\u001b[32m✓ ${s}\u001b[0m`);
const red = (s: string) => console.log(`\u001b[31m✗ ${s}\u001b[0m`);

/**
 * Shows the compliance decision and the exact Bolna request for the top of the
 * call queue, without contacting Bolna and without dialling anybody.
 */
async function main() {
  const { closeDb } = await import("../src/lib/db");
  const { callQueue } = await import("../src/lib/calls/queue");
  const { previewCall } = await import("../src/lib/calls/dispatch");
  const { formatIST } = await import("../src/lib/time");
  try {
    const target = process.argv[2];
    const queue = await callQueue({ limit: 10 });
    console.table(
      queue.map((e, i) => ({
        rank: i + 1,
        shop: e.shopName,
        score: e.score ?? "excluded",
        band: e.band,
        callable: e.allowed ? "yes" : "no",
        blocked_by: e.blocks.join(",") || "-",
        next_allowed: e.nextAllowedAt
          ? formatIST(new Date(e.nextAllowedAt))
          : "-",
      })),
    );
    const debtorId = target ?? queue.find((e) => e.allowed)?.debtorId;
    if (!debtorId) {
      red("No callable debtor in the queue right now");
      return;
    }
    const preview = await previewCall(debtorId);
    green(
      `Gate for ${debtorId}: ${
        preview.decision.allowed
          ? "allowed"
          : preview.decision.rules
              .filter((rule) => !rule.passed)
              .map((rule) => rule.id)
              .join(", ")
      }${
        preview.decision.nextAllowedAt
          ? `; next allowed ${formatIST(preview.decision.nextAllowedAt)} IST`
          : ""
      }`,
    );
    console.log(JSON.stringify(preview.request, null, 2));
    green("Dry run complete: no call was placed");
  } finally {
    await closeDb();
  }
}

void main().catch((error) => {
  console.error(
    `Dry run failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
