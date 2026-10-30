import { z } from "zod";
import { spokenAmountEn, spokenAmountHi, paiseToRupees } from "@/lib/money";
const debtorSchema = z.object({
  id: z.uuid(),
  contactName: z.string().min(1).max(120),
  shopName: z.string().min(1).max(160),
  businessName: z.string().min(1).max(160),
  ownerName: z.string().min(1).max(120),
  outstandingPaise: z
    .bigint()
    .nonnegative()
    .max(BigInt(Number.MAX_SAFE_INTEGER)),
  daysPastDue: z.number().int().nonnegative(),
  invoices: z.array(z.object({ dueOn: z.iso.date() })),
  lastPromise: z
    .object({
      promisedFor: z.iso.date(),
      amountPaise: z.bigint().positive().max(BigInt(Number.MAX_SAFE_INTEGER)),
      status: z.enum([
        "pending",
        "kept",
        "broken",
        "partially_kept",
        "cancelled",
      ]),
    })
    .nullable(),
});
export type CallDebtor = z.infer<typeof debtorSchema>;
export function toCallVariables(input: {
  debtor: CallDebtor;
  dossier: { text: string };
  rating: { score: number | null };
  callToken: string;
  language: "hi" | "en" | "mr";
  today: string;
}) {
  const d = debtorSchema.parse(input.debtor);
  z.iso.date().parse(input.today);
  z.enum(["hi", "en", "mr"]).parse(input.language);
  z.string().min(16).max(256).parse(input.callToken);
  z.string().max(600).parse(input.dossier.text);
  z.number().int().min(0).max(100).nullable().parse(input.rating.score);
  const locale = { hi: "hi-IN", en: "en-IN", mr: "mr-IN" }[input.language];
  const spoken = (amount: number) =>
    input.language === "en"
      ? spokenAmountEn(amount)
      : input.language === "hi"
        ? spokenAmountHi(amount)
        : `${new Intl.NumberFormat("en-IN").format(amount)} रुपये`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date(`${value}T06:30:00Z`));
  const exact = paiseToRupees(Number(d.outstandingPaise)),
    whole = Math.floor(exact);
  const oldest = d.invoices.map((i) => i.dueOn).sort()[0];
  const last = d.lastPromise;
  const status = last
    ? {
        en: {
          pending: "pending",
          kept: "kept",
          broken: "not kept",
          partially_kept: "partly kept",
          cancelled: "cancelled",
        },
        hi: {
          pending: "बाकी",
          kept: "पूरा हुआ",
          broken: "पूरा नहीं हुआ",
          partially_kept: "कुछ पूरा हुआ",
          cancelled: "रद्द",
        },
        mr: {
          pending: "बाकी",
          kept: "पूर्ण झाले",
          broken: "पूर्ण झाले नाही",
          partially_kept: "अंशतः पूर्ण",
          cancelled: "रद्द",
        },
      }[input.language][last.status]
    : "";
  return {
    debtor_name: d.contactName,
    shop_name: d.shopName,
    business_name: d.businessName,
    owner_name: d.ownerName,
    outstanding_rupees: whole,
    outstanding_spoken: spoken(exact),
    invoice_summary: oldest
      ? `${d.invoices.length} invoices, oldest due ${date(oldest)}`
      : "No unpaid invoices",
    days_past_due: d.daysPastDue,
    last_promise_spoken: last
      ? `${date(last.promisedFor)}: ${spoken(paiseToRupees(Number(last.amountPaise)))}; ${status}`
      : "",
    dossier: input.dossier.text,
    min_payment_rupees: Math.min(
      whole,
      Math.max(500, Math.round((whole * 0.15) / 500) * 500),
    ),
    today_date: input.today,
    today_spoken: date(input.today),
    language: input.language,
    account_id: d.id,
    call_token: input.callToken,
  };
}
