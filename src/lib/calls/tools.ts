import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  calls,
  debtors,
  optOuts,
  complianceEvents,
  toolInvocations,
} from "@/lib/db/schema";
import { getEnv, type Env } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { toolSchemas, type ToolName } from "@/lib/bolna/tools";
import { TERMINAL_STATUSES } from "./webhook";

export const TOOL_CALL_MAX_AGE_MS = 15 * 60 * 1000;
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
  const presented = /^Bearer (.+)$/.exec(header ?? "")?.[1] ?? "";
  const hash = (v: string) => createHash("sha256").update(v).digest();
  if (
    !presented ||
    !timingSafeEqual(hash(presented), hash(env.CHASE_TOOL_SECRET))
  )
    throw new ToolError(401, "Unauthorized");
}
export const toolBodySchema = z.object({
  account_id: z.uuid(),
  call_token: z.string().regex(/^[a-f0-9]{64}$/),
});
export function idempotencyKey(
  name: string,
  callId: string,
  args: Record<string, unknown>,
) {
  const safe = Object.entries(args)
    .filter(([key]) => !["call_token", "account_id"].includes(key))
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256")
    .update(JSON.stringify([name, callId, safe]))
    .digest("hex");
}
const stubLines: Record<ToolName, { en: string; hi: string }> = {
  send_payment_link: {
    en: "This is a test: no payment link has been sent.",
    hi: "यह test है, अभी कोई payment link नहीं भेजा गया है।",
  },
  record_promise_to_pay: {
    en: "I noted that in this test. A payment promise has not been booked yet.",
    hi: "मैंने इस test में आपकी बात note की है, अभी payment promise दर्ज नहीं हुआ है।",
  },
  check_payment_status: {
    en: "This is a test; no payment has been confirmed.",
    hi: "यह test है, अभी कोई payment confirm नहीं हुआ है।",
  },
  schedule_callback: {
    en: "I noted your request in this test. A callback has not been scheduled yet.",
    hi: "इस test में आपकी request note की है। अभी callback schedule नहीं हुआ है।",
  },
  flag_dispute: {
    en: "I have flagged this for the owner to review. We will pause collection calls.",
    hi: "मैंने owner के review के लिए आपकी बात note कर ली है। अभी collection calls रोक रहे हैं।",
  },
  register_opt_out: {
    en: "I am sorry. Your request is recorded and we will stop calling.",
    hi: "माफ़ कीजिए। आपकी request दर्ज है, अब आपको call नहीं करेंगे।",
  },
};
/** Part 4 stubs, except durable stop/dispute holds required before any real call. */
export async function runTool(
  name: string,
  body: unknown,
  options: { env?: Env; now?: Date } = {},
) {
  if (!Object.hasOwn(toolSchemas, name))
    throw new ToolError(404, "Unknown tool");
  const tool = name as ToolName;
  const parsed = toolSchemas[tool].safeParse(body);
  if (!parsed.success) throw new ToolError(400, "Invalid tool arguments");
  const args = parsed.data;
  const now = options.now ?? new Date();
  const started = Date.now();
  return getDb().transaction(async (tx) => {
    // Share the debtor lock with dispatch, so a stop request wins before the next reservation.
    const [debtor] = await tx
      .select()
      .from(debtors)
      .where(eq(debtors.id, args.account_id))
      .for("update");
    const [call] = await tx
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.callToken, args.call_token),
          eq(calls.debtorId, args.account_id),
        ),
      );
    if (!call || !debtor) throw new ToolError(401, "Invalid call context");
    if (
      !["collection", "test"].includes(call.purpose) ||
      TERMINAL_STATUSES.has(call.status) ||
      call.status === "call-disconnected" ||
      now.getTime() - call.createdAt.getTime() > TOOL_CALL_MAX_AGE_MS
    )
      throw new ToolError(409, "Call is no longer active");
    const key = idempotencyKey(tool, call.id, args);
    const [existing] = await tx
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.idempotencyKey, key));
    if (existing) return existing.result as { say: string; simulated: boolean };
    const isLab = call.purpose === "test";
    if (tool === "register_opt_out" && !isLab) {
      const scope = toolSchemas.register_opt_out.parse(args).scope;
      const [existingStop] = await tx
        .select({ id: optOuts.id })
        .from(optOuts)
        .where(
          and(
            eq(optOuts.debtorId, debtor.id),
            eq(optOuts.scope, scope),
            isNull(optOuts.clearedAt),
          ),
        );
      if (!existingStop)
        await tx.insert(optOuts).values({
          debtorId: debtor.id,
          scope,
          reason: "Caller requested stop",
          source: "call_tool",
          at: now,
        });
      await tx
        .update(debtors)
        .set({ status: "do_not_contact" })
        .where(eq(debtors.id, debtor.id));
      await tx.insert(complianceEvents).values({
        debtorId: debtor.id,
        callId: call.id,
        kind: "opt_out",
        rule: "explicit_stop",
        detail: { scope },
        at: now,
      });
    }
    if (tool === "flag_dispute" && !isLab) {
      // A dispute must never undo a permanent opt-out.
      await tx
        .update(debtors)
        .set({ status: "dispute" })
        .where(
          and(
            eq(debtors.id, debtor.id),
            sql`${debtors.status} <> 'do_not_contact'`,
          ),
        );
      await tx.insert(complianceEvents).values({
        debtorId: debtor.id,
        callId: call.id,
        kind: "dispute_hold",
        rule: "caller_dispute",
        detail: { ...args, call_token: undefined },
        at: now,
      });
    }
    const simulated =
      isLab || !["register_opt_out", "flag_dispute"].includes(tool);
    const line = stubLines[tool][call.language === "en" ? "en" : "hi"];
    const say =
      isLab && ["register_opt_out", "flag_dispute"].includes(tool)
        ? call.language === "en"
          ? "This practice request was noted; no customer account was changed."
          : "इस practice की request note की है; customer account नहीं बदला है।"
        : line;
    const result = { say, simulated };
    const { call_token: omitted, ...safeArgs } = args;
    void omitted;
    await tx.insert(toolInvocations).values({
      callId: call.id,
      debtorId: debtor.id,
      toolName: tool,
      args: safeArgs,
      result,
      ok: true,
      latencyMs: Date.now() - started,
      idempotencyKey: key,
    });
    await emitEvent(
      `tool.${tool}`,
      {
        debtorId: debtor.id,
        callId: call.id,
        payload: { simulated, ok: true },
      },
      tx,
    );
    return result;
  });
}
