import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  calls,
  invoices,
  paymentLinks,
  payments,
  promises,
} from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { recomputeRating } from "@/lib/chase/recompute";
import { money } from "@/lib/tools/replies";
import { sendCallEvent } from "@/lib/bolna/events";

export const paymentInputSchema = z.object({
  linkId: z.uuid(),
  amountPaise: z.bigint().positive(),
  source: z.enum(["razorpay_webhook", "simulated", "manual"]),
  providerRef: z.string().min(1).max(200),
});

export async function recordPayment(input: z.infer<typeof paymentInputSchema>) {
  const value = paymentInputSchema.parse(input);
  const outcome = await getDb().transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.id, value.linkId))
      .for("update");
    if (!link) throw new Error("Payment link not found");
    const [existing] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.source, value.source),
          eq(payments.providerRef, value.providerRef),
        ),
      );
    if (existing)
      return { payment: existing, link, duplicate: true, remaining: 0n };
    if (link.status === "paid") throw new Error("Payment link already paid");
    if (value.amountPaise !== link.amountPaise)
      throw new Error("Payment amount mismatch");
    let remainingToApply = value.amountPaise;
    const open = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.debtorId, link.debtorId),
          inArray(invoices.status, ["open", "partial"]),
        ),
      )
      .orderBy(asc(invoices.dueOn), asc(invoices.createdAt))
      .for("update");
    for (const invoice of open) {
      if (remainingToApply <= 0n) break;
      const due = invoice.amountPaise - invoice.paidPaise;
      const applied = due < remainingToApply ? due : remainingToApply;
      const paidPaise = invoice.paidPaise + applied;
      await tx
        .update(invoices)
        .set({
          paidPaise,
          status: paidPaise === invoice.amountPaise ? "paid" : "partial",
        })
        .where(eq(invoices.id, invoice.id));
      remainingToApply -= applied;
    }
    const [payment] = await tx
      .insert(payments)
      .values({
        businessId: link.businessId,
        debtorId: link.debtorId,
        paymentLinkId: link.id,
        amountPaise: value.amountPaise,
        unappliedPaise: remainingToApply,
        method: "upi",
        providerRef: value.providerRef,
        receivedAt: new Date(),
        source: value.source,
      })
      .returning();
    await tx
      .update(paymentLinks)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(paymentLinks.id, link.id));
    await tx
      .update(promises)
      .set({ status: "kept", resolvedAt: new Date() })
      .where(
        and(
          eq(promises.debtorId, link.debtorId),
          eq(promises.status, "pending"),
          sql`${promises.amountPaise} <= ${value.amountPaise}`,
        ),
      );
    const [{ remaining }] = await tx
      .select({
        remaining: sql<string>`coalesce(sum(${invoices.amountPaise}-${invoices.paidPaise}),0)::text`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.debtorId, link.debtorId),
          inArray(invoices.status, ["open", "partial"]),
        ),
      );
    await emitEvent(
      "payment.received",
      {
        debtorId: link.debtorId,
        callId: link.callId ?? undefined,
        payload: {
          paymentId: payment.id,
          amountPaise: value.amountPaise.toString(),
          simulated: value.source === "simulated",
        },
      },
      tx,
    );
    return { payment, link, duplicate: false, remaining: BigInt(remaining) };
  });
  if (!outcome.duplicate) {
    await recomputeRating(outcome.link.debtorId);
    const [call] = outcome.link.callId
      ? await getDb()
          .select()
          .from(calls)
          .where(eq(calls.id, outcome.link.callId))
      : [];
    await sendCallEvent(call?.bolnaExecutionId ?? null, "payment_completed", {
      paid_amount_spoken: money(
        outcome.payment.amountPaise,
        call?.language ?? "hi",
      ),
      remaining_spoken: money(outcome.remaining, call?.language ?? "hi"),
      payment_ref: outcome.payment.id,
    });
  }
  return outcome;
}
