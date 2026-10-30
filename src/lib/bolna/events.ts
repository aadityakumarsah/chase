import { getBolnaClient, BolnaError } from "./client";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

export async function sendCallEvent(
  executionId: string | null,
  event: string,
  properties: Record<string, string | number>,
) {
  if (!executionId || getEnv().BOLNA_AGENT_MODE !== "graph") return;
  try {
    await getBolnaClient().sendGraphEvent(executionId, { event, properties });
  } catch (error) {
    if (error instanceof BolnaError && error.status === 404) return;
    log.warn("Bolna graph event failed", { event, executionId });
  }
}
