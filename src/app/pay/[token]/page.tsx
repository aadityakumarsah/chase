import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { loadPaymentPage } from "@/lib/payments/links";
import { formatINR } from "@/lib/money";
import { SimulatePayment } from "@/components/simulate-payment";
export const dynamic = "force-dynamic";
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const data = await loadPaymentPage(token, true);
  if (!data) notFound();
  const { link, debtor, business, invoiceRefs } = data,
    amount = (Number(link.amountPaise) / 100).toFixed(2),
    vpa = business.upiVpa;
  const upi = vpa
    ? `upi://pay?${new URLSearchParams({ pa: vpa, pn: business.name, am: amount, cu: "INR", tn: invoiceRefs.join(", ").slice(0, 80), tr: token }).toString()}`
    : null;
  const qr = upi
    ? await QRCode.toString(upi, { type: "svg", margin: 1, width: 240 })
    : null;
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-10">
      <section className="mx-auto max-w-md rounded-3xl border bg-white p-7 shadow-sm">
        <p className="text-sm text-emerald-700">Secure payment request</p>
        <h1 className="mt-2 text-2xl font-semibold">{business.name}</h1>
        <p className="mt-1 text-muted-foreground">
          For {debtor.contactName} · {invoiceRefs.join(", ")}
        </p>
        <p className="my-7 text-4xl font-semibold">
          {formatINR(Number(link.amountPaise))}
        </p>
        {qr && (
          <div
            className="mx-auto w-60"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        )}
        <div className="mt-6 grid gap-3">
          {upi && (
            <a
              className="rounded-xl bg-emerald-700 px-5 py-3 text-center font-medium text-white"
              href={upi}
            >
              Pay with UPI
            </a>
          )}
          {link.providerUrl && (
            <a
              className="rounded-xl border px-5 py-3 text-center font-medium"
              href={link.providerUrl}
            >
              Pay with Razorpay
            </a>
          )}
          {link.isDemo && (
            <SimulatePayment token={token} paid={link.status === "paid"} />
          )}
        </div>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Chase is an AI assistant acting for {business.name}. Verify the
          business and amount before paying.
        </p>
      </section>
    </main>
  );
}
