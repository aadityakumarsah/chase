import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { promptPrs } from "@/lib/db/schema";
import { generatePromptPR } from "./generate";

/** Keep one reviewable change open at a time so nightly runs cannot pile up. */
export async function runNightlyPromptPrJob(businessId: string) {
  const [open] = await getDb()
    .select({ id: promptPrs.id })
    .from(promptPrs)
    .where(
      and(
        eq(promptPrs.businessId, businessId),
        eq(promptPrs.agentKey, "collections"),
        eq(promptPrs.status, "open"),
      ),
    )
    .limit(1);
  if (open) return { status: "existing" as const, id: open.id };
  const created = await generatePromptPR("collections", businessId);
  return { status: "created" as const, id: created.id };
}
