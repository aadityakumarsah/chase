import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, isNull, like, or } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { secureEqual } from "@/lib/tools/validators";
import { getDb } from "@/lib/db";
import { debtors, messages, optOuts } from "@/lib/db/schema";
import { normalisePhone } from "@/lib/phone";
import { publicRateLimit } from "@/lib/public-rate-limit";
const MAX_BODY_BYTES = 512 * 1024;
export function GET(request: NextRequest) {
  const limited = publicRateLimit(request, "whatsapp-verify", 30);
  if (limited) return limited;
  const env = getEnv(),
    q = request.nextUrl.searchParams;
  if (
    q.get("hub.mode") === "subscribe" &&
    env.META_WA_VERIFY_TOKEN &&
    secureEqual(q.get("hub.verify_token") ?? "", env.META_WA_VERIFY_TOKEN)
  )
    return new NextResponse(q.get("hub.challenge") ?? "");
  return NextResponse.json({ ok: false }, { status: 403 });
}
export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "whatsapp-webhook", 120);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });
  const raw = await request.text(),
    env = getEnv(),
    signature = request.headers.get("x-hub-signature-256");
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });
  if (env.META_APP_SECRET) {
    const expected =
      "sha256=" +
      createHmac("sha256", env.META_APP_SECRET).update(raw).digest("hex");
    if (!signature || !secureEqual(signature, expected))
      return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const changes =
    (
      body as {
        entry?: {
          changes?: {
            value?: {
              messages?: {
                from: string;
                text?: { body?: string };
                id: string;
              }[];
              statuses?: { id: string; status: string }[];
            };
          }[];
        }[];
      }
    ).entry?.flatMap((e) => e.changes ?? []) ?? [];
  for (const change of changes) {
    for (const inbound of change.value?.messages ?? []) {
      let phone: string;
      try {
        phone = normalisePhone(inbound.from);
      } catch {
        continue;
      }
      // One phone number can be a customer of several workspaces. An inbound
      // message arrives on the platform's WhatsApp sender, so it cannot be
      // attributed to one tenant: record it for every workspace that holds the
      // number, and honour STOP in all of them. Over-applying an opt-out is the
      // only safe direction to be wrong in.
      const matches = await getDb()
        .select()
        .from(debtors)
        .where(eq(debtors.phoneE164, phone));
      if (!matches.length) continue;
      const text = inbound.text?.body ?? "";
      const isStop = /^(stop|बंद करो|call mat karo)$/i.test(text.trim());
      for (const debtor of matches)
        await getDb().transaction(async (tx) => {
          await tx
            .update(debtors)
            .set({ lastInboundAt: new Date() })
            .where(eq(debtors.id, debtor.id));
          await tx
            .insert(messages)
            .values({
              businessId: debtor.businessId,
              debtorId: debtor.id,
              toE164: phone,
              channel: "whatsapp",
              direction: "in",
              provider: "meta_whatsapp",
              // Scoped per workspace so one provider id can fan out to each tenant.
              providerMessageId: `${inbound.id}:${debtor.businessId}`,
              body: text,
              status: "delivered",
              kind: "inbound",
            })
            .onConflictDoNothing();
          if (isStop) {
            const [old] = await tx
              .select()
              .from(optOuts)
              .where(
                and(
                  eq(optOuts.debtorId, debtor.id),
                  eq(optOuts.scope, "all"),
                  isNull(optOuts.clearedAt),
                ),
              );
            if (!old)
              await tx.insert(optOuts).values({
                businessId: debtor.businessId,
                debtorId: debtor.id,
                scope: "all",
                reason: "WhatsApp STOP",
                source: "whatsapp_stop",
              });
            await tx
              .update(debtors)
              .set({ status: "do_not_contact" })
              .where(eq(debtors.id, debtor.id));
          }
        });
    }
    for (const status of change.value?.statuses ?? [])
      await getDb()
        .update(messages)
        .set({
          status: ["sent", "delivered", "read", "failed"].includes(
            status.status,
          )
            ? (status.status as "sent" | "delivered" | "read" | "failed")
            : "sent",
        })
        .where(
          and(
            eq(messages.provider, "meta_whatsapp"),
            // Outbound ids are stored verbatim; inbound ones carry a tenant suffix.
            or(
              eq(messages.providerMessageId, status.id),
              like(messages.providerMessageId, `${status.id}:%`),
            ),
          ),
        );
  }
  return NextResponse.json({ ok: true });
}
