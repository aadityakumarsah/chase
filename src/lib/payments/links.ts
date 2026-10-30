import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  businesses,
  calls,
  debtors,
  invoices,
  paymentLinks,
} from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { sendCallEvent } from "@/lib/bolna/events";
import { createRazorpayLink } from "./razorpay";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

export async function loadPaymentPage(token: string, markOpened = false) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({
        link: paymentLinks,
        debtor: debtors,
        business: businesses,
        call: calls,
      })
      .from(paymentLinks)
      .innerJoin(debtors, eq(debtors.id, paymentLinks.debtorId))
      .innerJoin(businesses, eq(businesses.id, debtors.businessId))
      .leftJoin(calls, eq(calls.id, paymentLinks.callId))
      .where(eq(paymentLinks.token, token));
    if (
      !row ||
      row.link.expiresAt <= new Date() ||
      row.link.status === "expired" ||
      row.link.status === "failed"
    )
      return null;
    const refs = await tx
      .select({ invoiceNo: invoices.invoiceNo })
      .from(invoices)
      .where(
        and(eq(invoices.debtorId, row.debtor.id), eq(invoices.status, "open")),
      );
    if (markOpened && row.link.status === "created") {
      await tx
        .update(paymentLinks)
        .set({ status: "opened", openedAt: new Date() })
        .where(eq(paymentLinks.id, row.link.id));
      await emitEvent(
        "payment.link_opened",
        {
          debtorId: row.debtor.id,
          callId: row.call?.id,
          payload: { linkId: row.link.id },
        },
        tx,
      );
      row.link.status = "opened";
      row.link.openedAt = new Date();
      queueMicrotask(
        () =>
          void sendCallEvent(
            row.call?.bolnaExecutionId ?? null,
            "link_opened",
            { link_amount: (Number(row.link.amountPaise) / 100).toString() },
          ),
      );
    }
    return { ...row, invoiceRefs: refs.map((r) => r.invoiceNo) };
  });
}

export async function provisionPaymentLink(id: string) {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER !== "razorpay") return;
  const [row] = await getDb()
    .select({ link: paymentLinks, debtor: debtors })
    .from(paymentLinks)
    .innerJoin(debtors, eq(debtors.id, paymentLinks.debtorId))
    .where(eq(paymentLinks.id, id));
  if (!row || row.link.providerRef) return;
  try {
    const remote = await createRazorpayLink({
      id: row.link.id,
      token: row.link.token,
      amountPaise: row.link.amountPaise,
      name: row.debtor.contactName,
      contact: row.debtor.phoneE164,
      isDemo: row.link.isDemo,
    });
    await getDb()
      .update(paymentLinks)
      .set({ providerRef: remote.id, providerUrl: remote.short_url })
      .where(eq(paymentLinks.id, id));
  } catch {
    log.warn("Razorpay link provisioning failed", { linkId: id });
  }
}
