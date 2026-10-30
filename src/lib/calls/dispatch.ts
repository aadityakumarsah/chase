import { eq, sql } from "drizzle-orm";
import { getBolnaClient, BolnaError } from "@/lib/bolna/client";
import { assertDialAllowed } from "@/lib/compliance/guards";
import {
  evaluateGate,
  loadGateFacts,
  recordGateDecision,
} from "@/lib/compliance/policy";
import { getDb, type DbExecutor } from "@/lib/db";
import { calls, debtors, events } from "@/lib/db/schema";
import { compileDossier, toCallVariables } from "@/lib/dossier";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { maskPhone, normalisePhone } from "@/lib/phone";
import { activePrompt } from "@/lib/prompts";
import { loadCallContext } from "./context";

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

/** Explicit test dispatch. No automatic retries or scheduling of real calls. */
export async function dispatchCall(
  debtorId: string,
  options: { to?: string } = {},
) {
  const env = getEnv();
  const preliminary = await loadCallContext(debtorId);
  const to = normalisePhone(options.to ?? preliminary.debtor.phoneE164);
  assertDialAllowed(to, { ...env, DEMO_MODE: true });
  const prompt = await syncedCollectionsPrompt();
  const initial = evaluateGate(
    { ...(await loadGateFacts(debtorId)), phoneE164: to },
    { env: { ...env, DEMO_MODE: true } },
  );
  if (!initial.allowed) {
    await recordGateDecision(debtorId, initial);
    return { status: "blocked" as const, decision: initial };
  }
  await compileDossier(debtorId);
  // Serialize the check and reservation with other calls and opt-outs.
  const prepared = await getDb().transaction(async (tx) => {
    await tx
      .select({ id: debtors.id })
      .from(debtors)
      .where(eq(debtors.id, debtorId))
      .for("update");
    const now = new Date();
    const decision = evaluateGate(
      { ...(await loadGateFacts(debtorId, tx, now)), phoneE164: to },
      { now, env: { ...env, DEMO_MODE: true } },
    );
    await recordGateDecision(debtorId, decision, { db: tx });
    if (!decision.allowed) return { decision, call: null, variables: null };
    const context = await loadCallContext(debtorId, tx, now);
    const [call] = await tx
      .insert(calls)
      .values({
        businessId: context.business.id,
        debtorId,
        purpose: "collection",
        bolnaAgentId: env.BOLNA_COLLECTIONS_AGENT_ID,
        status: "queued",
        language: context.language,
        promptVersionId: prompt.id,
      })
      .returning();
    const variables = toCallVariables({
      debtor: context.callDebtor,
      dossier: { text: context.dossierText },
      rating: { score: context.ratingScore },
      callToken: call.callToken,
      language: context.language,
      today: context.today,
    });
    return { decision, call, variables };
  });
  if (!prepared.call || !prepared.variables)
    return { status: "blocked" as const, decision: prepared.decision };
  const call = prepared.call;
  try {
    const response = await getBolnaClient().makeCall({
      agent_id: env.BOLNA_COLLECTIONS_AGENT_ID!,
      recipient_phone_number: to,
      ...(env.BOLNA_FROM_NUMBER
        ? { from_phone_number: env.BOLNA_FROM_NUMBER }
        : {}),
      user_data: prepared.variables,
    });
    await getDb()
      .update(calls)
      .set({
        bolnaExecutionId: response.execution_id,
        status: response.status ?? "queued",
      })
      .where(eq(calls.id, call.id));
    await emitEvent("call.queued", {
      debtorId,
      callId: call.id,
      payload: { executionId: response.execution_id, to: maskPhone(to) },
    });
    return {
      status: "queued" as const,
      callId: call.id,
      executionId: response.execution_id,
    };
  } catch (error) {
    // A timeout may have reached Bolna. Keep the reservation blocked until reconciled.
    const ambiguous =
      !(error instanceof BolnaError) ||
      error.status === 0 ||
      error.status >= 500 ||
      error.status === 200;
    await getDb()
      .update(calls)
      .set({
        status: ambiguous ? "dispatch_unknown" : "failed",
        terminationReason: ambiguous
          ? "dispatch_result_unknown"
          : "dispatch_rejected",
      })
      .where(eq(calls.id, call.id));
    throw new Error(
      ambiguous
        ? "Call dispatch result unknown; inspect Bolna history before retrying"
        : "Bolna rejected the call",
    );
  }
}
export async function previewCall(debtorId: string) {
  const context = await loadCallContext(debtorId);
  const env = getEnv();
  const decision = evaluateGate(await loadGateFacts(debtorId), {
    env: { ...env, DEMO_MODE: true },
  });
  const variables = toCallVariables({
    debtor: context.callDebtor,
    dossier: { text: context.dossierText },
    rating: { score: context.ratingScore },
    callToken: "0".repeat(64),
    language: context.language,
    today: context.today,
  });
  return {
    decision,
    request: {
      agent_id: env.BOLNA_COLLECTIONS_AGENT_ID ?? null,
      recipient_phone_number: maskPhone(context.debtor.phoneE164),
      user_data: { ...variables, call_token: "<generated server-side>" },
    },
  };
}
