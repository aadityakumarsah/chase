import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

/**
 * Seeds the fictional 24-debtor sample portfolio.
 *
 * `--owner <email>` attaches it to an existing Chase account so the sample data
 * is reachable from the dashboard; without it the workspace has no members and
 * nobody can open it.
 */
async function main() {
  const { closeDb } = await import("../src/lib/db");
  try {
    const args = process.argv.slice(2).filter((v) => v !== "--");
    let ownerEmail: string | undefined;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--owner") ownerEmail = args[++i];
      else rest.push(args[i]!);
    }
    if (rest.some((v) => v !== "--reset"))
      throw new Error("Unknown seed option");

    let ownerUserId: string | undefined;
    if (ownerEmail) {
      const { getDb } = await import("../src/lib/db");
      const { appUsers } = await import("../src/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await getDb()
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(eq(appUsers.email, ownerEmail.toLowerCase()));
      if (!user)
        throw new Error(
          "No Chase account with that email. Sign up in the app first, then re-run.",
        );
      ownerUserId = user.id;
    }

    const { seedPortfolio } = await import("../src/lib/chase/seed");
    const result = await seedPortfolio({
      reset: rest.includes("--reset"),
      ownerUserId,
    });
    console.log(
      result.created
        ? `Seeded 24 fictional debtors, invoice balances, simulated histories and initial ratings.${
            ownerEmail
              ? ` Owner: ${ownerEmail}`
              : " No owner attached: pass --owner <email> to open it in the app."
          }`
        : "Demo portfolio already exists; no rows changed. Use --reset for an explicit local-demo reset.",
    );
  } finally {
    await closeDb();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error && !/postgres(ql)?:\/\//i.test(error.message)
      ? `Seed failed: ${error.message}`
      : "Seed failed; check migrations and local DEMO_MODE reset eligibility.",
  );
  process.exitCode = 1;
});
