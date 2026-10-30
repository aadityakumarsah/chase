import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { activePrompt } from "@/lib/prompts";

export async function syncedCollectionsPrompt(db: DbExecutor = getDb()) {
  const env = getEnv();
  if (!env.BOLNA_COLLECTIONS_AGENT_ID)
    throw new Error("Run pnpm bolna:sync first");
  const prompt = await activePrompt("collections", db);
  const [sync] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      sql`${events.type} = 'agent.synced' and ${events.payload}->>'agentId' = ${env.BOLNA_COLLECTIONS_AGENT_ID}`,
    )
    .orderBy(sql`${events.id} desc`)
    .limit(1);
  if (sync?.payload?.promptVersionId !== prompt.id)
    throw new Error(
      "Active prompt has not been verified on Bolna; run pnpm bolna:sync",
    );
  return prompt;
}
