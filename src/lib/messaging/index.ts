import { and, eq, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db";
import { messages, debtors, optOuts } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { log } from "@/lib/log";
import { messageSchema, type Message, type MessagingProvider } from "./types";
import { sendExternal } from "./adapters";
export async function enqueueMessage(
  input: Message,
  options: {
    db?: DbExecutor;
    paymentLinkId?: string;
    dedupeKey?: string;
    forceConsole?: boolean;
  } = {},
) {
  const m = messageSchema.parse(input),
    env = getEnv(),
    db = options.db ?? getDb();
  const provider = options.forceConsole ? "console" : env.MESSAGING_PROVIDER;
  const [row] = await db
    .insert(messages)
    .values({
      businessId: m.businessId,
      toE164: m.to,
      body: m.text,
      debtorId: m.debtorId,
      callId: m.callId,
      kind: m.kind,
      provider,
      channel:
        provider === "console"
          ? "console"
          : provider === "twilio_sms"
            ? "sms"
            : "whatsapp",
      direction: "out",
      status: "queued",
      paymentLinkId: options.paymentLinkId,
      dedupeKey: options.dedupeKey,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  if (!options.dedupeKey) throw new Error("Message persistence failed");
  const [old] = await db
    .select()
    .from(messages)
    .where(eq(messages.dedupeKey, options.dedupeKey));
  return old;
}
export async function deliverMessage(id: string) {
  const env = getEnv();
  // Claim once before network I/O: an ambiguous timeout must never trigger an automatic duplicate send.
  const [m] = await getDb()
    .update(messages)
    .set({ deliveryStartedAt: new Date() })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.status, "queued"),
        isNull(messages.deliveryStartedAt),
      ),
    )
    .returning();
  if (!m) return;
  let provider = m.provider,
    providerMessageId = `console:${m.id}`,
    error: string | null = null;
  let lastInbound: Date | null = null;
  if (m.debtorId) {
    const [d] = await getDb()
      .select()
      .from(debtors)
      .where(eq(debtors.id, m.debtorId));
    lastInbound = d?.lastInboundAt ?? null;
    const [stop] = await getDb()
      .select({ id: optOuts.id })
      .from(optOuts)
      .where(
        and(
          eq(optOuts.debtorId, m.debtorId),
          eq(optOuts.scope, "all"),
          isNull(optOuts.clearedAt),
        ),
      );
    if (stop && m.kind === "payment_link") {
      await getDb()
        .update(messages)
        .set({ status: "failed", error: "contact_opted_out" })
        .where(eq(messages.id, id));
      return;
    }
  }
  const reserved = /^\+91900000\d{4}$/.test(m.toE164);
  if (reserved || (env.DEMO_MODE && !env.CALL_ALLOWLIST.includes(m.toE164))) {
    provider = "console";
    error = m.provider === "console" ? null : "demo_recipient_not_allowlisted";
  }
  if (provider !== "console")
    try {
      providerMessageId = await sendExternal(
        {
          businessId: m.businessId,
          to: m.toE164,
          text: m.body,
          debtorId: m.debtorId ?? undefined,
          callId: m.callId ?? undefined,
          kind: m.kind,
        },
        {
          ...env,
          MESSAGING_PROVIDER: provider as typeof env.MESSAGING_PROVIDER,
        },
        lastInbound,
      );
    } catch (e) {
      provider = "console";
      error =
        e instanceof Error &&
        /^(meta_http_\d+|twilio_http_\d+|whatsapp_template_required|messaging_not_configured)$/.test(
          e.message,
        )
          ? e.message
          : "provider_delivery_failed";
      log.warn("Messaging fell back to console", {
        messageId: id,
        reason: error,
      });
    }
  await getDb().transaction(async (tx) => {
    await tx
      .update(messages)
      .set({
        provider,
        channel: provider === "console" ? "console" : m.channel,
        providerMessageId,
        status: "sent",
        error,
      })
      .where(eq(messages.id, id));
    await emitEvent(
      "message.sent",
      {
        debtorId: m.debtorId ?? undefined,
        callId: m.callId ?? undefined,
        payload: {
          messageId: id,
          channel: provider === "console" ? "console" : m.channel,
          simulated: provider === "console",
          fallback: error !== null,
        },
      },
      tx,
    );
  });
}
export class ConfiguredMessaging implements MessagingProvider {
  async send(input: Message) {
    const row = await enqueueMessage(input);
    try {
      await deliverMessage(row.id);
    } catch {
      log.warn("Message remains queued", { messageId: row.id });
    }
    const [sent] = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.id, row.id));
    return {
      providerMessageId: sent.providerMessageId ?? row.id,
      status:
        sent.status === "failed"
          ? ("failed" as const)
          : sent.status === "queued"
            ? ("queued" as const)
            : ("sent" as const),
    };
  }
}
