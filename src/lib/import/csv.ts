import { parse } from "csv-parse/sync";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businesses, debtors, invoices } from "@/lib/db/schema";
import { normalisePhone } from "@/lib/phone";
import { emitEvent } from "@/lib/events";
import { recomputeRating } from "@/lib/chase/recompute";
import { outstandingPaise } from "@/lib/chase/portfolio";
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 1000;
export const CSV_HEADERS = [
  "shop_name",
  "contact_name",
  "phone",
  "language",
  "invoice_no",
  "invoice_date",
  "due_date",
  "amount_rupees",
  "paid_rupees",
];
const nonempty = z.string().trim().min(1).max(200);
export const csvMoneySchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const input = value || "0";
    if (
      !/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(
        input,
      )
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid rupee amount" });
      return z.NEVER;
    }
    const [whole, decimal = ""] = input.replaceAll(",", "").split(".");
    const paise = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
    if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
      ctx.addIssue({
        code: "custom",
        message: "Amount exceeds supported range",
      });
      return z.NEVER;
    }
    return paise;
  });
export const csvDateSchema = z
  .string()
  .trim()
  .transform((v) => {
    const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(v);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  })
  .pipe(z.iso.date());
export const csvRowSchema = z
  .object({
    shop_name: nonempty,
    contact_name: nonempty,
    phone: z.string().transform((v, ctx) => {
      try {
        return normalisePhone(v);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid Indian mobile number",
        });
        return z.NEVER;
      }
    }),
    language: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "hinglish" ? "en" : v))
      .pipe(z.enum(["hi", "en", "mr"])),
    invoice_no: nonempty,
    invoice_date: csvDateSchema,
    due_date: csvDateSchema,
    amount_rupees: csvMoneySchema.refine(
      (v) => v > 0n,
      "Amount must be positive",
    ),
    paid_rupees: csvMoneySchema,
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.paid_rupees > row.amount_rupees)
      ctx.addIssue({
        code: "custom",
        path: ["paid_rupees"],
        message: "Paid amount exceeds invoice amount",
      });
    if (row.due_date < row.invoice_date)
      ctx.addIssue({
        code: "custom",
        path: ["due_date"],
        message: "Due date precedes invoice date",
      });
  });
export type ImportResult = {
  imported: number;
  updated: number;
  rejected: { row: number; reason: string }[];
};
export class CsvImportError extends Error {}
export function parseCsv(text: string): { row: number; value: unknown }[] {
  if (Buffer.byteLength(text, "utf8") > CSV_MAX_BYTES)
    throw new CsvImportError("CSV exceeds 2 MiB limit");
  try {
    const records: unknown = parse(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
      info: true,
      max_record_size: 32_768,
      columns: (headers: string[]) => {
        if (
          headers.length !== CSV_HEADERS.length ||
          new Set(headers).size !== headers.length ||
          CSV_HEADERS.some((h) => !headers.includes(h))
        )
          throw new Error("Headers");
        return headers;
      },
    });
    const rows = z
      .array(
        z.object({
          record: z.record(z.string(), z.string()),
          info: z.object({ lines: z.number().int() }),
        }),
      )
      .max(CSV_MAX_ROWS)
      .parse(records);
    if (!rows.length) throw new Error("Empty");
    return rows.map((r) => ({ row: r.info.lines, value: r.record }));
  } catch {
    throw new CsvImportError(
      "Invalid CSV: check headers, quoting, nonempty rows and 1,000-row limit",
    );
  }
}
export async function importCsv(
  text: string,
  businessId: string,
): Promise<ImportResult> {
  z.uuid().parse(businessId);
  const rows = parseCsv(text);
  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!business) throw new CsvImportError("Business not found");
  const result: ImportResult = { imported: 0, updated: 0, rejected: [] };
  const touched = new Set<string>();
  for (const row of rows) {
    const parsed = csvRowSchema.safeParse(row.value);
    if (!parsed.success) {
      result.rejected.push({
        row: row.row,
        reason: `Invalid fields: ${[...new Set(parsed.error.issues.map((i) => i.path.join(".") || "row"))].join(", ")}`,
      });
      continue;
    }
    const v = parsed.data;
    try {
      const saved = await db.transaction(async (tx) => {
        const [debtor] = await tx
          .insert(debtors)
          .values({
            businessId,
            shopName: v.shop_name,
            contactName: v.contact_name,
            phoneE164: v.phone,
            preferredLanguage: v.language,
            city: business.city,
            segment: "other",
          })
          .onConflictDoUpdate({
            target: [debtors.businessId, debtors.phoneE164],
            set: {
              shopName: v.shop_name,
              contactName: v.contact_name,
              preferredLanguage: v.language,
            },
          })
          .returning();
        const fields = {
          businessId,
          debtorId: debtor.id,
          invoiceNo: v.invoice_no,
          issuedOn: v.invoice_date,
          dueOn: v.due_date,
          amountPaise: v.amount_rupees,
          paidPaise: v.paid_rupees,
          status:
            v.amount_rupees === v.paid_rupees
              ? ("paid" as const)
              : v.paid_rupees > 0n
                ? ("partial" as const)
                : ("open" as const),
        };
        const [added] = await tx
          .insert(invoices)
          .values(fields)
          .onConflictDoNothing({
            target: [invoices.businessId, invoices.invoiceNo],
          })
          .returning();
        if (!added) {
          const [existing] = await tx
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.businessId, businessId),
                eq(invoices.invoiceNo, v.invoice_no),
              ),
            )
            .for("update");
          if (existing.debtorId !== debtor.id)
            throw new CsvImportError(
              "Invoice number already belongs to another debtor",
            );
          await tx
            .update(invoices)
            .set(fields)
            .where(eq(invoices.id, existing.id));
        }
        if (debtor.status === "active" || debtor.status === "paid")
          await tx
            .update(debtors)
            .set({
              status:
                (await outstandingPaise(debtor.id, tx)) === 0n
                  ? "paid"
                  : "active",
            })
            .where(eq(debtors.id, debtor.id));
        await emitEvent(
          added ? "invoice.imported" : "invoice.updated",
          {
            debtorId: debtor.id,
            payload: {
              invoice_no: v.invoice_no,
              amount_paise: v.amount_rupees.toString(),
              paid_paise: v.paid_rupees.toString(),
            },
          },
          tx,
        );
        return { debtorId: debtor.id, added: !!added };
      });
      touched.add(saved.debtorId);
      if (saved.added) result.imported++;
      else result.updated++;
    } catch (error) {
      result.rejected.push({
        row: row.row,
        reason:
          error instanceof CsvImportError
            ? error.message
            : "Database rejected row; no changes from this row were saved",
      });
    }
  }
  // A changed portfolio maximum affects every debtor's amount weight.
  if (touched.size) {
    const portfolio = await db
      .select({ id: debtors.id })
      .from(debtors)
      .where(eq(debtors.businessId, businessId));
    for (const debtor of portfolio) await recomputeRating(debtor.id);
  }
  return result;
}
export async function resolveImportBusiness(
  explicit?: string,
): Promise<string> {
  if (explicit) return z.uuid().parse(explicit);
  const rows = await getDb()
    .select({ id: businesses.id })
    .from(businesses)
    .limit(2);
  if (rows.length !== 1)
    throw new CsvImportError(
      "Specify businessId when there is not exactly one business",
    );
  return rows[0].id;
}
