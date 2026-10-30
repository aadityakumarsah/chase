import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { secureEqual } from "@/lib/tools/validators";
import { getDb } from "@/lib/db";
import { debtors, messages, optOuts } from "@/lib/db/schema";
import { normalisePhone } from "@/lib/phone";
export function GET(request: NextRequest) {
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
  const raw = await request.text(),
    env = getEnv(),
    signature = request.headers.get("x-hub-signature-256");
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
      const [debtor] = await getDb()
        .select()
        .from(debtors)
        .where(eq(debtors.phoneE164, phone));
      if (!debtor) continue;
      const text = inbound.text?.body ?? "";
      await getDb().transaction(async (tx) => {
        await tx
          .update(debtors)
          .set({ lastInboundAt: new Date() })
          .where(eq(debtors.id, debtor.id));
        await tx
          .insert(messages)
          .values({
            debtorId: debtor.id,
            toE164: phone,
            channel: "whatsapp",
            direction: "in",
            provider: "meta_whatsapp",
            providerMessageId: inbound.id,
            body: text,
            status: "delivered",
            kind: "inbound",
          })
          .onConflictDoNothing();
        if (/^(stop|बंद करो|call mat karo)$/i.test(text.trim())) {
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
            eq(messages.providerMessageId, status.id),
          ),
        );
  }
  return NextResponse.json({ ok: true });
}
