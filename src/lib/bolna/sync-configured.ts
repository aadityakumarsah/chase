import {
  buildBriefAgent,
  buildCollectionsAgent,
  requirePublicBaseUrl,
} from "@/lib/bolna/agent-config";
import { getBolnaClient } from "@/lib/bolna/client";
import { assertAgentRoundTrip } from "@/lib/bolna/verify";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { ensureActivePrompt } from "@/lib/prompts";

/** Settings only updates already-configured agents; CLI setup owns creation and env changes. */
export async function syncConfiguredAgents() {
  const env = getEnv();
  requirePublicBaseUrl(env.APP_BASE_URL);
  if (!env.BOLNA_COLLECTIONS_AGENT_ID || !env.BOLNA_BRIEF_AGENT_ID)
    throw new Error("Configured Bolna agent IDs are required");

  const client = getBolnaClient();
  const results = [] as Array<{
    key: "collections" | "brief";
    id: string;
    promptHash: string;
  }>;
  for (const key of ["collections", "brief"] as const) {
    const prompt = await ensureActivePrompt(key);
    const payload =
      key === "collections"
        ? buildCollectionsAgent(env, prompt.body)
        : buildBriefAgent(env, prompt.body);
    const id =
      key === "collections"
        ? env.BOLNA_COLLECTIONS_AGENT_ID
        : env.BOLNA_BRIEF_AGENT_ID;
    await client.updateAgent(id, payload);
    const promptHash = assertAgentRoundTrip(payload, await client.getAgent(id));
    await emitEvent("agent.synced", {
      payload: {
        agentKey: key,
        agentId: id,
        promptVersionId: prompt.id,
        promptHash,
      },
    });
    results.push({ key, id, promptHash });
  }
  return results;
}
