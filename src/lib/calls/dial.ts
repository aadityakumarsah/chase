import { and, eq, notInArray } from "drizzle-orm";
import { getBolnaClient, BolnaError } from "@/lib/bolna/client";
import { buildBriefFacts } from "@/lib/brief/scripts";
import { BriefMetricsSchema, BriefNarrativeSchema } from "@/lib/brief/types";
import { recomputeRating } from "@/lib/chase/recompute";
import { evaluateDebtorContact } from "@/lib/compliance/contact";
import { evaluateContact } from "@/lib/compliance/gate";
import { getDb } from "@/lib/db";
import {
  briefs,
  businesses,
  calls,
  complianceEvents,
  debtors,
  invoices,
} from "@/lib/db/schema";
import { compileDossier, toCallVariables } from "@/lib/dossier";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { enqueueMessage, deliverMessage } from "@/lib/messaging";
import { maskPhone } from "@/lib/phone";
import { loadCallContext } from "./context";
import { syncedBriefPrompt, syncedCollectionsPrompt } from "./prompt";

export type CollectionCallSource = "manual" | "campaign" | "callback";

async function sendFirstContactDisclosure(
  debtor: typeof debtors.$inferSelect,
  businessName: string,
) {
  if (debtor.firstContactDisclosedAt) return;
  const row = await enqueueMessage(
    {
      businessId: debtor.businessId,
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
      businessId: debtor.businessId,
      debtorId: debtor.id,
      kind: "disclosure_sent",
      rule: "first_contact_disclosure",
      detail: { messageId: row.id, sentAt: now.toISOString() },
    });
  });
}

export async function startCollectionCall(
  debtorId: string,
  options: { source: CollectionCallSource; businessId?: string },
) {
  const preliminary = await evaluateDebtorContact(debtorId);
  // Tenant check before any side effect: a debtor id from another workspace must
  // never be dialled, even though the id itself is a valid uuid.
  if (
    options.businessId &&
    preliminary.debtor.businessId !== options.businessId
  )
    throw new Error("Debtor not found in this workspace");
  if (!preliminary.decision.allowed)
    return { status: "blocked" as const, decision: preliminary.decision };

  const { BillingLimitError, checkLimit } =
    await import("@/lib/billing/entitlements");
  const callAllowance = await checkLimit(
    preliminary.debtor.businessId,
    "callsPerMonth",
  );
  if (!callAllowance.ok) throw new BillingLimitError(callAllowance);

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

export async function startOwnerBriefCall(briefId: string) {
  const env = getEnv();
  if (!env.BOLNA_BRIEF_AGENT_ID)
    throw new Error("BOLNA_BRIEF_AGENT_ID is not configured");
  const [record] = await getDb()
    .select({ brief: briefs, business: businesses })
    .from(briefs)
    .innerJoin(businesses, eq(businesses.id, briefs.businessId))
    .where(eq(briefs.id, briefId));
  if (!record) throw new Error("Brief not found");
  if (record.brief.callId)
    return { status: "already_started" as const, callId: record.brief.callId };

  // The number belongs to the workspace, not the deployment. A legacy
  // OWNER_PHONE is only a fallback for the original single-tenant demo.
  const ownerPhone = record.business.ownerPhone || env.OWNER_PHONE;
  if (!ownerPhone)
    throw new Error("This workspace has no owner phone number configured");

  const decision = evaluateContact({
    purpose: "owner_brief",
    debtor: { status: "active", firstContactDisclosedAt: new Date() },
    business: record.business,
    now: new Date(),
    toNumber: ownerPhone,
    attemptsToday: 0,
    attemptsThisWeek: 0,
    lastAttemptAt: null,
    optedOut: false,
    disputeOpen: false,
    hardship: false,
    activePromise: null,
    demoMode: env.DEMO_MODE,
    allowlist: env.CALL_ALLOWLIST,
    demoOverride: false,
    ownerPhoneVerified: Boolean(record.business.ownerPhoneVerifiedAt),
  });
  if (!decision.allowed) {
    await getDb()
      .insert(complianceEvents)
      .values({
        businessId: record.business.id,
        kind: "gate_blocked",
        rule: decision.rules
          .filter((rule) => !rule.passed)
          .map((rule) => rule.id)
          .join(","),
        detail: {
          businessId: record.business.id,
          purpose: "owner_brief",
          rules: decision.rules,
        },
      });
    await emitEvent("gate.blocked", {
      payload: {
        purpose: "owner_brief",
        rules: decision.rules
          .filter((rule) => !rule.passed)
          .map((rule) => rule.id),
      },
    });
    return { status: "blocked" as const, decision };
  }

  const prompt = await syncedBriefPrompt();
  const metrics = BriefMetricsSchema.parse(record.brief.metrics);
  const narrative = BriefNarrativeSchema.parse(record.brief.narrative);
  const language = record.business.defaultLanguage === "en" ? "en" : "hi";
  const prepared = await getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(briefs)
      .where(eq(briefs.id, briefId))
      .for("update");
    if (!locked) throw new Error("Brief not found");
    if (locked.callId) return { existingCallId: locked.callId, call: null };
    const [call] = await tx
      .insert(calls)
      .values({
        businessId: record.business.id,
        debtorId: null,
        purpose: "owner_brief",
        source: "daily_brief",
        bolnaAgentId: env.BOLNA_BRIEF_AGENT_ID,
        status: "queued",
        language,
        promptVersionId: prompt.id,
      })
      .returning();
    await tx
      .update(briefs)
      .set({ callId: call.id })
      .where(eq(briefs.id, briefId));
    await tx.insert(complianceEvents).values({
      businessId: record.business.id,
      callId: call.id,
      kind: "gate_allowed",
      rule: "R1_allowlist",
      detail: { purpose: "owner_brief", rules: decision.rules },
    });
    return { existingCallId: null, call };
  });
  if (!prepared.call)
    return {
      status: "already_started" as const,
      callId: prepared.existingCallId!,
    };

  try {
    const response = await getBolnaClient().makeCall({
      agent_id: env.BOLNA_BRIEF_AGENT_ID,
      recipient_phone_number: ownerPhone,
      ...(env.BOLNA_FROM_NUMBER
        ? { from_phone_number: env.BOLNA_FROM_NUMBER }
        : {}),
      user_data: {
        owner_name: record.business.ownerName,
        language,
        brief_script:
          language === "en" ? record.brief.scriptEn : record.brief.scriptHi,
        brief_facts: buildBriefFacts(metrics, narrative),
        business_name: record.business.name,
        call_token: prepared.call.callToken,
      },
      agent_data: { language },
    });
    await getDb()
      .update(calls)
      .set({
        bolnaExecutionId: response.execution_id,
        status: response.status ?? "queued",
      })
      .where(eq(calls.id, prepared.call.id));
    await emitEvent("call.queued", {
      callId: prepared.call.id,
      payload: {
        purpose: "owner_brief",
        executionId: response.execution_id,
        to: maskPhone(ownerPhone),
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
        ? "Owner call dispatch result unknown; inspect Bolna before retrying"
        : "Bolna rejected the owner brief call",
    );
  }
}
