import { and, eq, notInArray } from "drizzle-orm";
import { getBolnaClient, BolnaError } from "@/lib/bolna/client";
import { recomputeRating } from "@/lib/chase/recompute";
import { evaluateDebtorContact } from "@/lib/compliance/contact";
import { getDb } from "@/lib/db";
import { calls, complianceEvents, debtors, invoices } from "@/lib/db/schema";
import { compileDossier, toCallVariables } from "@/lib/dossier";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { enqueueMessage, deliverMessage } from "@/lib/messaging";
import { maskPhone } from "@/lib/phone";
import { loadCallContext } from "./context";
import { syncedCollectionsPrompt } from "./prompt";

export type CollectionCallSource = "manual" | "campaign" | "callback";

async function sendFirstContactDisclosure(
  debtor: typeof debtors.$inferSelect,
  businessName: string,
) {
  if (debtor.firstContactDisclosedAt) return;
  const row = await enqueueMessage(
    {
      to: debtor.phoneE164,
      text: `${businessName} may call you about invoice dues using Chase, an AI assistant. Reply STOP to opt out.`,
      debtorId: debtor.id,
      kind: "first_contact_disclosure",
    },
    { dedupeKey: `first-contact:${debtor.id}` },
  );
  await deliverMessage(row.id);
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx
      .update(debtors)
      .set({ firstContactDisclosedAt: now })
      .where(eq(debtors.id, debtor.id));
    await tx.insert(complianceEvents).values({
      debtorId: debtor.id,
      kind: "disclosure_sent",
      rule: "first_contact_disclosure",
      detail: { messageId: row.id, sentAt: now.toISOString() },
    });
  });
}

export async function startCollectionCall(
  debtorId: string,
  options: { source: CollectionCallSource },
) {
  const preliminary = await evaluateDebtorContact(debtorId);
  if (!preliminary.decision.allowed)
    return { status: "blocked" as const, decision: preliminary.decision };

  const open = await getDb()
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.debtorId, debtorId),
        notInArray(invoices.status, ["paid", "written_off"]),
      ),
    )
    .limit(1);
  if (!open.length) throw new Error("No outstanding invoice to collect");

  await sendFirstContactDisclosure(
    preliminary.debtor,
    preliminary.business.name,
  );
  await compileDossier(debtorId);
  await recomputeRating(debtorId);
  const prompt = await syncedCollectionsPrompt();
  const env = getEnv();

  const prepared = await getDb().transaction(async (tx) => {
    await tx
      .select({ id: debtors.id })
      .from(debtors)
      .where(eq(debtors.id, debtorId))
      .for("update");
    const checked = await evaluateDebtorContact(debtorId, { db: tx });
    if (!checked.decision.allowed)
      return { decision: checked.decision, call: null, variables: null };
    const context = await loadCallContext(debtorId, tx);
    const [call] = await tx
      .insert(calls)
      .values({
        businessId: context.business.id,
        debtorId,
        purpose: "collection",
        source: options.source,
        bolnaAgentId: env.BOLNA_COLLECTIONS_AGENT_ID,
        status: "queued",
        language: context.language,
        promptVersionId: prompt.id,
      })
      .returning();
    return {
      decision: checked.decision,
      call,
      variables: toCallVariables({
        debtor: context.callDebtor,
        dossier: { text: context.dossierText },
        rating: { score: context.ratingScore },
        callToken: call.callToken,
        language: context.language,
        today: context.today,
      }),
    };
  });
  if (!prepared.call || !prepared.variables)
    return { status: "blocked" as const, decision: prepared.decision };

  try {
    const response = await getBolnaClient().makeCall({
      agent_id: env.BOLNA_COLLECTIONS_AGENT_ID!,
      recipient_phone_number: preliminary.debtor.phoneE164,
      ...(env.BOLNA_FROM_NUMBER
        ? { from_phone_number: env.BOLNA_FROM_NUMBER }
        : {}),
      user_data: prepared.variables,
      ...(prepared.decision.demoOverrideUsed
        ? { bypass_call_guardrails: true }
        : {}),
    });
    await getDb()
      .update(calls)
      .set({
        bolnaExecutionId: response.execution_id,
        status: response.status ?? "queued",
      })
      .where(eq(calls.id, prepared.call.id));
    await emitEvent("call.queued", {
      debtorId,
      callId: prepared.call.id,
      payload: {
        executionId: response.execution_id,
        to: maskPhone(preliminary.debtor.phoneE164),
        source: options.source,
      },
    });
    return {
      status: "queued" as const,
      callId: prepared.call.id,
      executionId: response.execution_id,
    };
  } catch (error) {
    const ambiguous =
      !(error instanceof BolnaError) ||
      error.status === 0 ||
      error.status >= 500;
    await getDb()
      .update(calls)
      .set({
        status: ambiguous ? "dispatch_unknown" : "failed",
        terminationReason: ambiguous
          ? "dispatch_result_unknown"
          : "dispatch_rejected",
      })
      .where(eq(calls.id, prepared.call.id));
    throw new Error(
      ambiguous
        ? "Call dispatch result unknown; inspect Bolna history before retrying"
        : "Bolna rejected the call",
    );
  }
}

/** Part 8 supplies owner-brief content and activates this path. */
export async function startOwnerBriefCall(briefId: string): Promise<never> {
  void briefId;
  throw new Error("Owner brief dialing is implemented in Part 8");
}
