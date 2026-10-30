import {
  buildBriefAgent,
  buildCollectionsAgent,
  requirePublicBaseUrl,
} from "@/lib/bolna/agent-config";
import { getBolnaClient } from "@/lib/bolna/client";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { assertAgentRoundTrip } from "@/lib/bolna/verify";
import { getEnv } from "@/lib/env";
import type { Env } from "@/lib/env";
import type { BolnaProvider } from "@/lib/bolna/client";
import { emitEvent } from "@/lib/events";
import { ensureActivePrompt } from "@/lib/prompts";

/** Settings only updates already-configured agents; CLI setup owns creation and env changes. */
export async function syncConfiguredAgent(key: "collections" | "brief") {
  const env = getEnv();
  requirePublicBaseUrl(env.APP_BASE_URL);
  const id =
    key === "collections"
      ? env.BOLNA_COLLECTIONS_AGENT_ID
      : env.BOLNA_BRIEF_AGENT_ID;
  if (!id) throw new Error(`Configured Bolna ${key} agent ID is required`);

  const client = getBolnaClient();
  if (key === "collections") await ensureProxyModelRegistered(client, env);
  const prompt = await ensureActivePrompt(key);
  const payload =
    key === "collections"
      ? buildCollectionsAgent(env, prompt.body)
      : buildBriefAgent(env, prompt.body);
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
  return { key, id, promptHash };
}

export async function ensureProxyModelRegistered(
  client: BolnaProvider,
  env: Env,
) {
  if (env.CHASE_LLM_MODE !== "proxy") return false;
  if (!env.CHASE_PROXY_KEY)
    throw new Error("CHASE_PROXY_KEY is required in proxy mode");
  const [registered] = await getDb()
    .select({ id: events.id })
    .from(events)
    .where(eq(events.type, "agent.custom_model_registered"))
    .limit(1);
  if (registered) return false;
  await client.addCustomModel({
    custom_model_name: "chase-claude",
    custom_model_url: `${requirePublicBaseUrl(env.APP_BASE_URL)}/api/llm/v1`,
    custom_model_key: env.CHASE_PROXY_KEY,
    custom_model_family: "openai",
  });
  await emitEvent("agent.custom_model_registered", {
    payload: { model: "chase-claude", family: "openai" },
  });
  return true;
}

export async function syncConfiguredAgents() {
  const results = [];
  for (const key of ["collections", "brief"] as const)
    results.push(await syncConfiguredAgent(key));
  return results;
}
