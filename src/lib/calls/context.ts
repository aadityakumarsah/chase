import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import {
  businesses,
  contactDossiers,
  debtors,
  invoices,
} from "@/lib/db/schema";
import {
  daysPastDue,
  outstandingPaise,
  promiseStats,
} from "@/lib/chase/portfolio";
import { latestRating } from "@/lib/chase/recompute";
import { type CallDebtor } from "@/lib/dossier/call-variables";
import { istDay } from "@/lib/time";

/** Everything the voice agent needs to know before the phone rings. */
export type CallContext = {
  debtor: typeof debtors.$inferSelect;
  business: typeof businesses.$inferSelect;
  callDebtor: CallDebtor;
  dossierText: string;
  ratingScore: number | null;
  language: "hi" | "en" | "mr";
  today: string;
};

export async function loadCallContext(
  debtorId: string,
  db: DbExecutor = getDb(),
  now = new Date(),
): Promise<CallContext> {
  z.uuid().parse(debtorId);
  const [row] = await db
    .select({ debtor: debtors, business: businesses })
    .from(debtors)
    .innerJoin(businesses, eq(businesses.id, debtors.businessId))
    .where(eq(debtors.id, debtorId));
  if (!row) throw new Error("Debtor not found");
  const today = istDay(now);
  const open = await db
    .select({ dueOn: invoices.dueOn })
    .from(invoices)
    .where(
      and(
        eq(invoices.debtorId, debtorId),
        notInArray(invoices.status, ["paid", "written_off"]),
      ),
    )
    .orderBy(invoices.dueOn);
  const [dossier] = await db
    .select()
    .from(contactDossiers)
    .where(eq(contactDossiers.debtorId, debtorId));
  const stats = await promiseStats(debtorId, db);
  const rating = await latestRating(debtorId, db);
  const callDebtor: CallDebtor = {
    id: row.debtor.id,
    contactName: row.debtor.contactName,
    shopName: row.debtor.shopName,
    businessName: row.business.name,
    ownerName: row.business.ownerName,
    outstandingPaise: await outstandingPaise(debtorId, db),
    daysPastDue: await daysPastDue(debtorId, today, db),
    invoices: open.map((i) => ({ dueOn: i.dueOn })),
    lastPromise: stats.lastPromise
      ? {
          promisedFor: stats.lastPromise.promisedFor,
          amountPaise: stats.lastPromise.amountPaise,
          status: stats.lastPromise.status,
        }
      : null,
  };
  return {
    debtor: row.debtor,
    business: row.business,
    callDebtor,
    // An empty dossier is valid: the prompt then opens as a first conversation.
    dossierText: dossier?.text ?? "",
    ratingScore: rating?.score ?? null,
    language: dossier?.preferredLanguage ?? row.debtor.preferredLanguage,
    today,
  };
}
