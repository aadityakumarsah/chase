import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  businesses,
  callbacks,
  calls,
  complianceEvents,
  debtors,
  optOuts,
  paymentLinks,
  promises,
  toolInvocations,
} from "@/lib/db/schema";
import { getEnv, type Env } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { toolSchemas, type ToolName } from "@/lib/bolna/tools";
import { outstandingPaise } from "@/lib/chase/portfolio";
import { recomputeRating } from "@/lib/chase/recompute";
import {
  callbackSlot,
  idempotencyKey,
  secureEqual,
  validCallContext,
  validateAmount,
  validPromiseDate,
} from "@/lib/tools/validators";
import {
  dateWords,
  failure,
  money,
  reply,
  words,
  type Language,
} from "@/lib/tools/replies";
import { enqueueMessage } from "@/lib/messaging";

export class ToolError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}
export function authorizeToolRequest(
  header: string | null,
  env: Env = getEnv(),
) {
  if (!env.CHASE_TOOL_SECRET)
    throw new ToolError(503, "Tool endpoint is not configured");
  const value = /^Bearer (.+)$/.exec(header ?? "")?.[1] ?? "";
  if (!secureEqual(value, env.CHASE_TOOL_SECRET))
    throw new ToolError(401, "Unauthorized");
}
export const toolBodySchema = z.object({
  account_id: z.uuid(),
  call_token: z.string().regex(/^[a-f0-9]{64}$/),
});
export { idempotencyKey };

export async function runTool(
  name: string,
  body: unknown,
  options: { env?: Env; now?: Date } = {},
) {
  if (!Object.hasOwn(toolSchemas, name)) return failure();
  const tool = name as ToolName,
    parsed = toolSchemas[tool].safeParse(body);
  if (!parsed.success) return failure();
  const args = parsed.data,
    now = options.now ?? new Date(),
    env = options.env ?? getEnv(),
    started = Date.now();
  let refresh: string | null = null;
  const result = await getDb().transaction(async (tx) => {
    const [call] = await tx
      .select()
      .from(calls)
      .where(eq(calls.callToken, args.call_token))
      .for("update");
    if (!call || !validCallContext(call, args, now))
      throw new ToolError(403, "Invalid call context");
    const [debtor] = await tx
      .select()
      .from(debtors)
      .where(eq(debtors.id, args.account_id))
      .for("update");
    if (!debtor) throw new ToolError(403, "Invalid call context");
    const [business] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.id, debtor.businessId));
    const lang = (call.language ?? debtor.preferredLanguage) as Language,
      key = idempotencyKey(tool, call.id, args);
    const [prior] = await tx
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.idempotencyKey, key))
      .orderBy(sql`${toolInvocations.createdAt} desc`)
      .limit(1);
    if (prior?.result) {
      const response = prior.result as ReturnType<typeof reply>;
      const { call_token: _, ...safe } = args;
      void _;
      await tx.insert(toolInvocations).values({
        callId: call.id,
        debtorId: debtor.id,
        toolName: tool,
        args: safe,
        result: response,
        ok: response.ok,
        latencyMs: Date.now() - started,
        idempotencyKey: key,
      });
      await emitEvent(
        `tool.${tool}`,
        {
          debtorId: debtor.id,
          callId: call.id,
          payload: {
            ok: response.ok,
            idempotent: true,
            latencyMs: Date.now() - started,
            args: safe,
          },
        },
        tx,
      );
      return response;
    }
    const outstanding = await outstandingPaise(debtor.id, tx);
    let response: ReturnType<typeof reply>;
    if (tool === "send_payment_link") {
      const input = toolSchemas.send_payment_link.parse(args),
        amount = validateAmount(input.amount_rupees, outstanding);
      if (!amount.valid)
        response = reply(
          false,
          words(
            lang,
            `Choose between ${money(amount.minimum, lang)} and ${money(outstanding, lang)}.`,
            `कृपया ${money(amount.minimum, lang)} से ${money(outstanding, lang)} के बीच amount बताइए।`,
            `कृपया ${money(amount.minimum, lang)} ते ${money(outstanding, lang)} रक्कम सांगा.`,
          ),
          {
            minimum_paise: amount.minimum.toString(),
            maximum_paise: outstanding.toString(),
          },
        );
      else {
        await tx
          .update(paymentLinks)
          .set({ status: "expired" })
          .where(
            and(
              eq(paymentLinks.callId, call.id),
              inArray(paymentLinks.status, ["created", "opened"]),
            ),
          );
        const [link] = await tx
          .insert(paymentLinks)
          .values({
            debtorId: debtor.id,
            callId: call.id,
            amountPaise: amount.amount,
            provider: env.PAYMENTS_PROVIDER,
            isDemo: env.DEMO_MODE,
            expiresAt: new Date(now.getTime() + 86400000),
          })
          .returning();
        const url = `${env.APP_BASE_URL}/pay/${link.token}`,
          text =
            lang === "en"
              ? `Hello ${debtor.contactName}, pay ${money(amount.amount, lang)} to ${business.name}: ${url} — Chase (AI assistant)`
              : `नमस्ते ${debtor.contactName} जी, ${business.name} को ${money(amount.amount, lang)} payment करने के लिए: ${url} — Chase (AI assistant)`;
        const message = await enqueueMessage(
          {
            to: debtor.phoneE164,
            text,
            debtorId: debtor.id,
            callId: call.id,
            kind: "payment_link",
          },
          {
            db: tx,
            paymentLinkId: link.id,
            dedupeKey: `payment-link:${link.id}`,
          },
        );
        await emitEvent(
          "payment.link_created",
          {
            debtorId: debtor.id,
            callId: call.id,
            payload: {
              linkId: link.id,
              amountPaise: amount.amount.toString(),
              simulated: env.DEMO_MODE,
            },
          },
          tx,
        );
        response = reply(
          true,
          words(
            lang,
            `I’m sending the ${money(amount.amount, lang)} link now. Please open it when it arrives.`,
            `मैं ${money(amount.amount, lang)} का link अभी भेज रही हूँ। आते ही खोलिए।`,
            `मी ${money(amount.amount, lang)} ची link पाठवत आहे. आल्यावर उघडा.`,
          ),
          { link_id: link.id, message_id: message.id, status: "queued" },
        );
      }
    } else if (tool === "record_promise_to_pay") {
      const input = toolSchemas.record_promise_to_pay.parse(args),
        amount = validateAmount(input.amount_rupees, outstanding);
      if (!amount.valid || !validPromiseDate(input.promise_date, now))
        response = reply(
          false,
          words(
            lang,
            "Choose a valid amount and date within 30 days.",
            "सही amount और अगले 30 दिनों की date बताइए।",
            "योग्य रक्कम आणि 30 दिवसांची तारीख सांगा.",
          ),
        );
      else {
        await tx
          .update(promises)
          .set({ status: "cancelled", resolvedAt: now })
          .where(
            and(
              eq(promises.debtorId, debtor.id),
              eq(promises.status, "pending"),
            ),
          );
        await tx.insert(promises).values({
          debtorId: debtor.id,
          callId: call.id,
          amountPaise: amount.amount,
          promisedFor: input.promise_date,
          reasonCode: input.reason_code,
          source: "tool",
          confirmed: true,
        });
        refresh = debtor.id;
        response = reply(
          true,
          words(
            lang,
            `Okay, ${money(amount.amount, lang)} on ${dateWords(input.promise_date, lang)} is noted.`,
            `ठीक है, ${dateWords(input.promise_date, lang)} को ${money(amount.amount, lang)}, मैंने note कर लिया है।`,
            `ठीक आहे, ${dateWords(input.promise_date, lang)} रोजी ${money(amount.amount, lang)} नोंदवले.`,
          ),
          {
            promise_date: input.promise_date,
            amount_paise: amount.amount.toString(),
          },
        );
      }
    } else if (tool === "check_payment_status") {
      const [link] = await tx
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.callId, call.id))
        .orderBy(sql`${paymentLinks.createdAt} desc`)
        .limit(1);
      if (!link)
        response = reply(
          false,
          words(
            lang,
            "No payment link exists yet.",
            "अभी payment link नहीं है।",
            "अजून payment link नाही.",
          ),
        );
      else if (link.status === "paid")
        response = reply(
          true,
          link.isDemo
            ? words(
                lang,
                `The demo recorded ${money(link.amountPaise, lang)}. ${money(outstanding, lang)} remains.`,
                `Demo में ${money(link.amountPaise, lang)} record हुए हैं। ${money(outstanding, lang)} बाकी हैं।`,
                `Demo मध्ये ${money(link.amountPaise, lang)} नोंदले. ${money(outstanding, lang)} बाकी आहेत.`,
              )
            : words(
                lang,
                `Yes, ${money(link.amountPaise, lang)} arrived. Thank you. ${money(outstanding, lang)} remains.`,
                `हाँ, ${money(link.amountPaise, lang)} मिल गए, धन्यवाद! ${money(outstanding, lang)} बाकी हैं।`,
                `हो, ${money(link.amountPaise, lang)} मिळाले. ${money(outstanding, lang)} बाकी आहेत.`,
              ),
          {
            status: "paid",
            remaining_paise: outstanding.toString(),
            simulated: link.isDemo,
          },
        );
      else if (link.status === "opened")
        response = reply(
          true,
          words(
            lang,
            "Tap Pay, choose your UPI app, and approve.",
            "Link खुल गया है। Pay दबाकर UPI app चुनिए।",
            "Link उघडली आहे. Pay दाबून UPI app निवडा.",
          ),
          { status: "opened" },
        );
      else
        response = reply(
          true,
          words(
            lang,
            "Payment is not visible yet. The link is in your message.",
            "अभी payment नहीं दिखा। Link message में है।",
            "अजून payment दिसत नाही. Link message मध्ये आहे.",
          ),
          { status: link.status },
        );
    } else if (tool === "schedule_callback") {
      const input = toolSchemas.schedule_callback.parse(args),
        slot = callbackSlot(
          input.callback_date,
          input.time_window,
          {
            start: business.callWindowStart.slice(0, 5),
            end: business.callWindowEnd.slice(0, 5),
          },
          now,
        );
      await tx.insert(callbacks).values({
        debtorId: debtor.id,
        callId: call.id,
        requestedFor: slot.requested,
        scheduledFor: slot.scheduled,
        window: slot.window,
      });
      if (slot.adjusted) {
        await tx.insert(complianceEvents).values({
          debtorId: debtor.id,
          callId: call.id,
          kind: "gate_blocked",
          rule: "calling_window",
          detail: {
            requested: slot.requested.toISOString(),
            scheduled: slot.scheduled.toISOString(),
          },
        });
        await emitEvent(
          "gate.blocked",
          {
            debtorId: debtor.id,
            callId: call.id,
            payload: {
              rules: ["R5_calling_window"],
              requested: slot.requested.toISOString(),
              scheduled: slot.scheduled.toISOString(),
            },
          },
          tx,
        );
      }
      response = reply(
        true,
        slot.adjusted
          ? input.time_window === "after_hours"
            ? words(
                lang,
                "We do not call after 6:30 pm. Would tomorrow at 10 am work?",
                "शाम 6:30 के बाद हम call नहीं करते। कल सुबह 10 बजे ठीक रहेगा?",
                "संध्याकाळी 6:30 नंतर call करत नाही. उद्या सकाळी 10 वाजता चालेल?",
              )
            : words(
                lang,
                "We call only during allowed hours. Would the next available slot work?",
                "Allowed hours के बाहर call नहीं करते। अगला slot ठीक रहेगा?",
                "परवानगीच्या वेळेतच call करतो. पुढची वेळ चालेल?",
              )
          : words(
              lang,
              "Okay, the callback is scheduled.",
              "ठीक है, callback schedule हो गया।",
              "Callback schedule झाला.",
            ),
        {
          scheduled_for: slot.scheduled.toISOString(),
          adjusted: slot.adjusted,
        },
      );
    } else if (tool === "flag_dispute") {
      const input = toolSchemas.flag_dispute.parse(args);
      await tx
        .update(debtors)
        .set({ status: "dispute" })
        .where(eq(debtors.id, debtor.id));
      await tx.insert(complianceEvents).values({
        debtorId: debtor.id,
        callId: call.id,
        kind: "dispute_hold",
        rule: "caller_dispute",
        detail: { type: input.dispute_type, details: input.details },
      });
      refresh = debtor.id;
      if (env.OWNER_PHONE)
        await enqueueMessage(
          {
            to: env.OWNER_PHONE,
            text: `Dispute from ${debtor.shopName}: ${input.details}. Review in Chase.`,
            debtorId: debtor.id,
            callId: call.id,
            kind: "owner_dispute",
          },
          { db: tx, dedupeKey: `dispute:${key}` },
        );
      response = reply(
        true,
        words(
          lang,
          "The owner will review this within 24 hours. Payment calls are paused.",
          "Owner 24 घंटे में check करेंगे। तब तक payment calls बंद रहेंगी।",
          "Owner 24 तासांत तपासतील. Payment calls बंद राहतील.",
        ),
        { status: "dispute" },
      );
    } else {
      const input = toolSchemas.register_opt_out.parse(args),
        [old] = await tx
          .select()
          .from(optOuts)
          .where(
            and(
              eq(optOuts.debtorId, debtor.id),
              eq(optOuts.scope, input.scope),
              isNull(optOuts.clearedAt),
            ),
          );
      if (!old)
        await tx.insert(optOuts).values({
          debtorId: debtor.id,
          scope: input.scope,
          reason: "Caller requested stop",
          source: "call_tool",
          at: now,
        });
      if (input.scope === "all")
        await tx
          .update(debtors)
          .set({ status: "do_not_contact" })
          .where(eq(debtors.id, debtor.id));
      await tx.insert(complianceEvents).values({
        debtorId: debtor.id,
        callId: call.id,
        kind: "opt_out",
        rule: "explicit_stop",
        detail: { scope: input.scope },
      });
      refresh = debtor.id;
      response = reply(
        true,
        words(
          lang,
          "We will not call again. Sorry for the trouble.",
          "अब हम आपको call नहीं करेंगे। परेशानी के लिए माफ़ कीजिए।",
          "आता आम्ही call करणार नाही. त्रासाबद्दल माफ करा.",
        ),
        { scope: input.scope },
      );
    }
    const { call_token: _, ...safe } = args;
    void _;
    await tx.insert(toolInvocations).values({
      callId: call.id,
      debtorId: debtor.id,
      toolName: tool,
      args: safe,
      result: response,
      ok: response.ok,
      latencyMs: Date.now() - started,
      idempotencyKey: key,
    });
    await emitEvent(
      `tool.${tool}`,
      {
        debtorId: debtor.id,
        callId: call.id,
        payload: {
          ok: response.ok,
          latencyMs: Date.now() - started,
          args: safe,
        },
      },
      tx,
    );
    return response;
  });
  if (refresh) await recomputeRating(refresh, now);
  return result;
}
