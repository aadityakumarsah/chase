import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { activePrompt, type AgentKey } from "@/lib/prompts";

async function syncedPrompt(
  agentKey: AgentKey,
  agentId: string | undefined,
  db: DbExecutor = getDb(),
) {
  if (!agentId) throw new Error("Run pnpm bolna:sync first");
  const prompt = await activePrompt(agentKey, db);
  const [sync] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      sql`${events.type} = 'agent.synced' and ${events.payload}->>'agentId' = ${agentId}`,
    )
    .orderBy(sql`${events.id} desc`)
    .limit(1);
  if (sync?.payload?.promptVersionId !== prompt.id)
    throw new Error(
      "Active prompt has not been verified on Bolna; run pnpm bolna:sync",
    );
  return prompt;
}

export async function syncedCollectionsPrompt(db: DbExecutor = getDb()) {
  const env = getEnv();
  return syncedPrompt("collections", env.BOLNA_COLLECTIONS_AGENT_ID, db);
}

export async function syncedBriefPrompt(db: DbExecutor = getDb()) {
  const env = getEnv();
  return syncedPrompt("brief", env.BOLNA_BRIEF_AGENT_ID, db);
}
