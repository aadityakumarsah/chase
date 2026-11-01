import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businesses, debtors, invoices, promises } from "@/lib/db/schema";
import { normalisePhone } from "@/lib/phone";
import { emitEvent } from "@/lib/events";
import { recomputeRating } from "@/lib/chase/recompute";
import { outstandingPaise } from "@/lib/chase/portfolio";
import { BillingLimitError, checkLimit } from "@/lib/billing/entitlements";
import { csvMoneySchema } from "@/lib/import/csv";

/**
 * Adding one account by hand.
 *
 * CSV import exists for a ledger export; this is the path for the shop that
 * walks in today. It deliberately reuses the import's money parsing and consent
 * attestation so a hand-typed account is held to the same rules as an imported
 * one — contact permission in particular is never implicit.
 */

export class DebtorCreateError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DebtorCreateError";
  }
}

const name = z.string().trim().min(1).max(200);

export const manualDebtorSchema = z
  .object({
    shopName: name,
    contactName: name,
    phone: z.string().transform((value, ctx) => {
      try {
        return normalisePhone(value);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid Indian mobile number",
        });
        return z.NEVER;
      }
    }),
    language: z.enum(["hi", "en", "mr"]).default("hi"),
    segment: z
      .enum(["kirana", "medical", "restaurant", "hardware", "other"])
      .default("other"),
    /** Falls back to the workspace's own city when left blank. */
    city: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
    /** Why this workspace may contact the account. Required: never implicit. */
    consentBasis: z.enum([
      "ledger_customer",
      "written_contract",
      "prior_relationship",
      "explicit_consent",
    ]),
    /** An opening invoice. Optional, so an account can be created before billing. */
    invoice: z
      .object({
        invoiceNo: name,
        issuedOn: z.iso.date(),
        dueOn: z.iso.date(),
        amountRupees: csvMoneySchema.refine(
          (v) => v > 0n,
          "Amount must be positive",
        ),
        paidRupees: csvMoneySchema.default(0n),
      })
      .refine((v) => v.paidRupees <= v.amountRupees, {
        path: ["paidRupees"],
        message: "Paid amount exceeds the invoice amount",
      })
      .refine((v) => v.dueOn >= v.issuedOn, {
        path: ["dueOn"],
        message: "Due date precedes the invoice date",
      })
      .optional(),
    /** An already-agreed promise to pay, so the queue reflects reality at once. */
    promise: z
      .object({
        amountRupees: csvMoneySchema.refine(
          (v) => v > 0n,
          "Amount must be positive",
        ),
        promisedFor: z.iso.date(),
        reasonCode: z.string().trim().min(1).max(80).default("agreed_manually"),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.promise && !value.invoice)
      ctx.addIssue({
        code: "custom",
        path: ["promise"],
        message: "Record the invoice this promise is against",
      });
    if (
      value.promise &&
      value.invoice &&
      value.promise.amountRupees > value.invoice.amountRupees
    )
      ctx.addIssue({
        code: "custom",
        path: ["promise", "amountRupees"],
        message: "Promise exceeds the invoice amount",
      });
  });

export type ManualDebtorInput = z.input<typeof manualDebtorSchema>;

export async function createDebtor(
  businessId: string,
  input: unknown,
  attestedByUserId: string | null,
): Promise<{ debtorId: string }> {
  z.uuid().parse(businessId);
  const parsed = manualDebtorSchema.safeParse(input);
  if (!parsed.success)
    throw new DebtorCreateError(
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
    );
  const value = parsed.data;

  const db = getDb();
  const [business] = await db
    .select({ id: businesses.id, city: businesses.city })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!business) throw new DebtorCreateError("Workspace not found", 404);

  const [duplicate] = await db
    .select({ id: debtors.id, shopName: debtors.shopName })
    .from(debtors)
    .where(
      and(
        eq(debtors.businessId, businessId),
        eq(debtors.phoneE164, value.phone),
      ),
    );
  if (duplicate)
    throw new DebtorCreateError(
      `That number already belongs to ${duplicate.shopName}.`,
      409,
    );

  const allowance = await checkLimit(businessId, "debtors", 1);
  if (!allowance.ok) throw new BillingLimitError(allowance);

  const debtorId = await db.transaction(async (tx) => {
    const [debtor] = await tx
      .insert(debtors)
      .values({
        businessId,
        shopName: value.shopName,
        contactName: value.contactName,
        phoneE164: value.phone,
        preferredLanguage: value.language,
        city: value.city?.trim() || business.city,
        segment: value.segment,
        notes: value.notes ?? null,
        consentBasis: value.consentBasis,
        consentAttestedAt: new Date(),
        consentAttestedBy: attestedByUserId,
        consentSource: "manual_entry",
      })
      .returning();

    if (value.invoice) {
      const invoice = value.invoice;
      const [added] = await tx
        .insert(invoices)
        .values({
          businessId,
          debtorId: debtor.id,
          invoiceNo: invoice.invoiceNo,
          issuedOn: invoice.issuedOn,
          dueOn: invoice.dueOn,
          amountPaise: invoice.amountRupees,
          paidPaise: invoice.paidRupees,
          status:
            invoice.amountRupees === invoice.paidRupees
              ? "paid"
              : invoice.paidRupees > 0n
                ? "partial"
                : "open",
        })
        .onConflictDoNothing({
          target: [invoices.businessId, invoices.invoiceNo],
        })
        .returning();
      if (!added)
        throw new DebtorCreateError(
          `Invoice ${invoice.invoiceNo} already exists in this workspace.`,
          409,
        );
      await emitEvent(
        "invoice.imported",
        {
          businessId,
          debtorId: debtor.id,
          payload: {
            invoice_no: invoice.invoiceNo,
            amount_paise: invoice.amountRupees.toString(),
            paid_paise: invoice.paidRupees.toString(),
            source: "manual_entry",
          },
        },
        tx,
      );
    }

    if (value.promise) {
      const promise = value.promise;
      await tx.insert(promises).values({
        businessId,
        debtorId: debtor.id,
        amountPaise: promise.amountRupees,
        promisedFor: promise.promisedFor,
        reasonCode: promise.reasonCode,
        source: "manual",
        confirmed: true,
      });
      await emitEvent(
        "promise.recorded",
        {
          businessId,
          debtorId: debtor.id,
          payload: {
            amount_paise: promise.amountRupees.toString(),
            promised_for: promise.promisedFor,
            source: "manual_entry",
          },
        },
        tx,
      );
    }

    if (value.invoice)
      await tx
        .update(debtors)
        .set({
          status:
            (await outstandingPaise(debtor.id, tx)) === 0n ? "paid" : "active",
        })
        .where(eq(debtors.id, debtor.id));

    await emitEvent(
      "debtor.created",
      {
        businessId,
        debtorId: debtor.id,
        payload: {
          shop_name: value.shopName,
          city: value.city?.trim() || business.city,
          segment: value.segment,
          consent_basis: value.consentBasis,
        },
      },
      tx,
    );
    return debtor.id;
  });

  // A new balance shifts the portfolio maximum, which weights every rating.
  const portfolio = await db
    .select({ id: debtors.id })
    .from(debtors)
    .where(eq(debtors.businessId, businessId));
  for (const debtor of portfolio) await recomputeRating(debtor.id);

  return { debtorId };
}
