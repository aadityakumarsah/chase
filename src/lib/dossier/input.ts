import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { outstandingPaise, daysPastDue } from "@/lib/chase/portfolio";
import { formatIST } from "@/lib/time";
const analysis = z.object({
  outcome: z.string().max(80).optional(),
  owner_summary: z.string().max(500).optional(),
  debtor_statements: z.array(z.string().max(240)).max(5).optional(),
});
export async function buildDossierInput(debtorId: string) {
  z.uuid().parse(debtorId);
  const db = getDb();
  // One repeatable snapshot prevents mixing a payment with a pre-payment ledger.
  return db.transaction(
    async (tx) => {
      const [debtor] = await tx
        .select()
        .from(s.debtors)
        .where(eq(s.debtors.id, debtorId));
      if (!debtor) throw new Error("Debtor not found");
      const calls = await tx
        .select({
          id: s.calls.id,
          at: s.calls.startedAt,
          status: s.calls.status,
          analysis: s.calls.analysis,
          transcript: s.calls.transcript,
        })
        .from(s.calls)
        .where(
          and(
            eq(s.calls.debtorId, debtorId),
            eq(s.calls.purpose, "collection"),
          ),
        )
        .orderBy(desc(s.calls.startedAt), desc(s.calls.id))
        .limit(10);
      const promises = await tx
        .select({
          amount: s.promises.amountPaise,
          date: s.promises.promisedFor,
          status: s.promises.status,
          reason: s.promises.reasonCode,
          confirmed: s.promises.confirmed,
        })
        .from(s.promises)
        .where(eq(s.promises.debtorId, debtorId))
        .orderBy(desc(s.promises.createdAt), desc(s.promises.id))
        .limit(50);
      const payments = await tx
        .select({
          amount: s.payments.amountPaise,
          at: s.payments.receivedAt,
          method: s.payments.method,
          source: s.payments.source,
        })
        .from(s.payments)
        .where(eq(s.payments.debtorId, debtorId))
        .orderBy(desc(s.payments.receivedAt), desc(s.payments.id))
        .limit(50);
      const messages = await tx
        .select({
          at: s.messages.createdAt,
          body: s.messages.body,
          direction: s.messages.direction,
          status: s.messages.status,
          channel: s.messages.channel,
        })
        .from(s.messages)
        .where(eq(s.messages.debtorId, debtorId))
        .orderBy(desc(s.messages.createdAt), desc(s.messages.id))
        .limit(5);
      const optouts = await tx
        .select({ scope: s.optOuts.scope, at: s.optOuts.at })
        .from(s.optOuts)
        .where(
          and(eq(s.optOuts.debtorId, debtorId), isNull(s.optOuts.clearedAt)),
        )
        .orderBy(s.optOuts.at, s.optOuts.id);
      const callbacks = await tx
        .select({
          scheduled: s.callbacks.scheduledFor,
          status: s.callbacks.status,
        })
        .from(s.callbacks)
        .where(
          and(
            eq(s.callbacks.debtorId, debtorId),
            eq(s.callbacks.status, "scheduled"),
          ),
        )
        .orderBy(s.callbacks.scheduledFor, s.callbacks.id)
        .limit(20);
      const pickup = await tx
        .select({
          language: s.calls.language,
          window: sql<string>`case when extract(hour from ${s.calls.startedAt} at time zone 'Asia/Kolkata') < 12 then 'morning' when extract(hour from ${s.calls.startedAt} at time zone 'Asia/Kolkata') < 17 then 'afternoon' else 'evening' end`,
          attempts: sql<number>`count(*)::int`,
          connected: sql<number>`count(*) filter (where ${s.calls.connected})::int`,
        })
        .from(s.calls)
        .where(
          and(
            eq(s.calls.debtorId, debtorId),
            eq(s.calls.purpose, "collection"),
            sql`${s.calls.startedAt} is not null`,
          ),
        )
        .groupBy(s.calls.language, sql`2`)
        .orderBy(s.calls.language, sql`2`);
      const today = formatIST(new Date(), "yyyy-MM-dd");
      return {
        debtor: {
          id: debtor.id,
          name: debtor.contactName,
          shop: debtor.shopName,
          language: debtor.preferredLanguage,
          status: debtor.status,
        },
        outstanding_paise: (await outstandingPaise(debtorId, tx)).toString(),
        days_past_due: await daysPastDue(debtorId, today, tx),
        calls: calls.map((c) => {
          const a = analysis.safeParse(c.analysis);
          return {
            date: c.at?.toISOString() ?? "",
            outcome: a.success ? (a.data.outcome ?? c.status) : c.status,
            owner_summary: a.success ? (a.data.owner_summary ?? "") : "",
            debtor_statements:
              a.success && a.data.debtor_statements
                ? a.data.debtor_statements
                : (c.transcript ?? "")
                    .split("\n")
                    .filter((line) => /^(user|debtor):/i.test(line))
                    .slice(0, 5)
                    .map((line) =>
                      line.replace(/^[^:]+:\s*/, "").slice(0, 240),
                    ),
          };
        }),
        promises: promises.map((p) => ({ ...p, amount: p.amount.toString() })),
        payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })),
        messages: messages.map((m) => ({ ...m, body: m.body.slice(0, 1000) })),
        optouts,
        dispute: debtor.status === "dispute",
        callbacks,
        pickup_stats: pickup,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type DossierInput = Awaited<ReturnType<typeof buildDossierInput>>;
