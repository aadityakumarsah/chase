import { and, eq, isNull, lt, or } from "drizzle-orm";
import { analyzeCall } from "@/lib/analysis";
import { CallAnalysisSchema, type CallAnalysis } from "@/lib/analysis/schema";
import { recomputeRating, latestRating } from "@/lib/chase/recompute";
import { compileDossier } from "@/lib/dossier";
import { getDb } from "@/lib/db";
import {
  businesses,
  calls,
  chaseRatings,
  complianceEvents,
  debtors,
  optOuts,
  promises,
  toolInvocations,
} from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { getLLM, type LLMProvider } from "@/lib/llm";
import { ConfiguredMessaging } from "@/lib/messaging";
import { formatIST } from "@/lib/time";

function noConversationAnalysis(
  voicemail: boolean,
  language: "hi" | "en" | "mr" | null,
): CallAnalysis {
  return CallAnalysisSchema.parse({
    connected: false,
    outcome: voicemail ? "voicemail" : "no_conversation",
    language_used: language ?? "mixed",
    promise: { made: false, amount_rupees: 0, date: "" },
    reason_code: "unknown",
    sentiment: "neutral",
    debtor_statements: [],
    objections: [],
    ai_disclosed: false,
    identity_confirmed_before_dues: false,
    compliance_flags: [],
    agent_quality: {
      score: 1,
      worked: "No conversation occurred.",
      failed: "The debtor did not engage.",
    },
    next_best_action: "call_back",
    owner_summary: voicemail
      ? "The call reached voicemail; no conversation occurred."
      : "No conversation occurred.",
    dossier_update: "No new debtor facts.",
  });
}

const words = (value: string) =>
  value.trim().replace(/\s+/g, " ").split(" ").slice(0, 20).join(" ");

/** Idempotent completed-call processing; tool rows always outrank model output. */
export async function processCall(
  callId: string,
  options: { provider?: LLMProvider; force?: boolean } = {},
) {
  const db = getDb();
  const [row] = await db
    .select({ call: calls, debtor: debtors, business: businesses })
    .from(calls)
    .innerJoin(debtors, eq(debtors.id, calls.debtorId))
    .innerJoin(businesses, eq(businesses.id, calls.businessId))
    .where(eq(calls.id, callId));
  if (!row) throw new Error("Call not found");
  if (row.call.processedAt) return { status: "already_processed" as const };

  const claimedAt = new Date();
  const [claim] = await db
    .update(calls)
    .set({ processingStartedAt: claimedAt })
    .where(
      and(
        eq(calls.id, callId),
        isNull(calls.processedAt),
        or(
          isNull(calls.processingStartedAt),
          lt(
            calls.processingStartedAt,
            new Date(claimedAt.getTime() - 15 * 60_000),
          ),
        ),
      ),
    )
    .returning({ id: calls.id });
  if (!claim) return { status: "processing" as const };

  try {
    const tools = await db
      .select()
      .from(toolInvocations)
      .where(
        and(eq(toolInvocations.callId, callId), eq(toolInvocations.ok, true)),
      )
      .orderBy(toolInvocations.createdAt, toolInvocations.id);
    const provider = row.call.connected
      ? (options.provider ?? getLLM())
      : options.provider;
    const voicemail = Boolean(
      (row.call.raw as Record<string, unknown> | null)?.answered_by_voice_mail,
    );
    let analysis: CallAnalysis;
    let model = row.call.analysisModel ?? "deterministic:no-conversation";
    const savedAnalysis = options.force
      ? { success: false as const }
      : CallAnalysisSchema.safeParse(row.call.analysis);
    if (savedAnalysis.success) analysis = savedAnalysis.data;
    else if (!row.call.connected) {
      analysis = noConversationAnalysis(voicemail, row.call.language);
    } else {
      if (!provider) throw new Error("Connected-call analysis requires an LLM");
      const result = await analyzeCall(
        row.call.transcript ?? "",
        formatIST(row.call.endedAt ?? new Date(), "yyyy-MM-dd"),
        provider,
        {
          account_context: {
            business: row.business.name,
            debtor: row.debtor.shopName,
            call_time: row.call.startedAt?.toISOString() ?? null,
            prompt_version_id: row.call.promptVersionId,
          },
          tool_invocations: tools.map((tool) => ({
            name: tool.toolName,
            args: tool.args,
            result: tool.result,
          })),
        },
      );
      analysis = CallAnalysisSchema.parse(result.value);
      model = result.model;
    }

    const toolNames = new Set(tools.map((tool) => tool.toolName));
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ processedAt: calls.processedAt })
        .from(calls)
        .where(eq(calls.id, callId))
        .for("update");
      if (fresh?.processedAt) return;

      if (analysis.promise.made && !toolNames.has("record_promise_to_pay")) {
        const [existingPromise] = await tx
          .select({ id: promises.id })
          .from(promises)
          .where(
            and(eq(promises.callId, callId), eq(promises.source, "analysis")),
          )
          .limit(1);
        if (!existingPromise)
          await tx.insert(promises).values({
            businessId: row.debtor.businessId,
            debtorId: row.debtor.id,
            callId,
            amountPaise: BigInt(analysis.promise.amount_rupees) * 100n,
            promisedFor: analysis.promise.date,
            reasonCode: analysis.reason_code,
            source: "analysis",
            confirmed: false,
            status: "pending",
          });
      }

      if (
        (analysis.outcome === "opted_out" ||
          analysis.next_best_action === "stop_contact") &&
        !toolNames.has("register_opt_out")
      ) {
        const [existing] = await tx
          .select({ id: optOuts.id })
          .from(optOuts)
          .where(
            and(eq(optOuts.debtorId, row.debtor.id), isNull(optOuts.clearedAt)),
          )
          .limit(1);
        if (!existing) {
          await tx.insert(optOuts).values({
            businessId: row.debtor.businessId,
            debtorId: row.debtor.id,
            scope: "all",
            reason: "Inferred from completed call transcript",
            source: "inferred",
          });
          await tx
            .update(debtors)
            .set({ status: "do_not_contact" })
            .where(eq(debtors.id, row.debtor.id));
          await tx.insert(complianceEvents).values({
            businessId: row.debtor.businessId,
            debtorId: row.debtor.id,
            callId,
            kind: "opt_out_inferred",
            rule: "safe_default",
            detail: { evidence: analysis.owner_summary },
          });
        }
      }

      if (
        (analysis.outcome === "dispute_raised" ||
          analysis.reason_code === "dispute") &&
        !toolNames.has("flag_dispute")
      ) {
        await tx
          .update(debtors)
          .set({ status: "dispute" })
          .where(eq(debtors.id, row.debtor.id));
        const [existingDispute] = await tx
          .select({ id: complianceEvents.id })
          .from(complianceEvents)
          .where(
            and(
              eq(complianceEvents.callId, callId),
              eq(complianceEvents.kind, "dispute_hold"),
              eq(complianceEvents.rule, "post_call_inferred"),
            ),
          )
          .limit(1);
        if (!existingDispute)
          await tx.insert(complianceEvents).values({
            businessId: row.debtor.businessId,
            debtorId: row.debtor.id,
            callId,
            kind: "dispute_hold",
            rule: "post_call_inferred",
            detail: { evidence: analysis.owner_summary },
          });
      }

      for (const flag of analysis.compliance_flags) {
        const [existingFlag] = await tx
          .select({ id: complianceEvents.id })
          .from(complianceEvents)
          .where(
            and(
              eq(complianceEvents.callId, callId),
              eq(complianceEvents.kind, "post_call_flag"),
              eq(complianceEvents.rule, flag.type),
            ),
          )
          .limit(1);
        if (!existingFlag)
          await tx.insert(complianceEvents).values({
            businessId: row.debtor.businessId,
            debtorId: row.debtor.id,
            callId,
            kind: "post_call_flag",
            rule: flag.type,
            detail: { evidence: flag.evidence, severity: flag.severity },
          });
      }
      await tx
        .update(calls)
        .set({ analysis, analysisModel: model })
        .where(eq(calls.id, callId));
    });

    for (const flag of analysis.compliance_flags.filter(
      (item) => item.severity === "high",
    ))
      try {
        await new ConfiguredMessaging().send({
          to: row.business.ownerPhone,
          text: `High-severity call review for ${row.debtor.shopName}: ${flag.type}. Review in Chase.`,
          businessId: row.debtor.businessId,
          debtorId: row.debtor.id,
          callId,
          kind: "compliance_alert",
        });
      } catch {
        // The audit flag is durable; owner delivery can be retried independently.
      }

    const before = await latestRating(row.debtor.id);
    if (row.call.connected) {
      if (!provider) throw new Error("Connected-call dossier requires an LLM");
      await compileDossier(row.debtor.id, provider);
    }
    const rating = await recomputeRating(row.debtor.id);
    let rationale = rating.rationale;
    if (row.call.connected && provider)
      try {
        const result = await provider.generateText({
          task: "rating_rationale",
          maxTokens: 80,
          system: [
            {
              text: "Write one literal collections-priority rationale under 20 words. No score calculation, threats, or invented facts.",
            },
          ],
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                components: rating.components,
                analysis,
              }),
            },
          ],
        });
        rationale = words(result.value);
      } catch {
        rationale = words(rating.rationale);
      }
    else
      rationale = words(
        "No conversation; unanswered streak increased; try again within contact limits.",
      );
    await db
      .update(chaseRatings)
      .set({ rationale })
      .where(eq(chaseRatings.id, rating.id));
    await emitEvent("rating.changed", {
      businessId: row.debtor.businessId,
      debtorId: row.debtor.id,
      callId,
      payload: { from: before?.score ?? null, to: rating.score, rationale },
    });
    await db
      .update(calls)
      .set({ processedAt: new Date(), processingStartedAt: null })
      .where(and(eq(calls.id, callId), isNull(calls.processedAt)));
    await emitEvent("call.analyzed", {
      businessId: row.debtor.businessId,
      debtorId: row.debtor.id,
      callId,
      payload: { ownerSummary: analysis.owner_summary },
    });
    return { status: "processed" as const, analysis, rationale };
  } catch (error) {
    await db
      .update(calls)
      .set({ processingStartedAt: null })
      .where(and(eq(calls.id, callId), isNull(calls.processedAt)));
    throw error;
  }
}
