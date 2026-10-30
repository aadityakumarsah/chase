import Link from "next/link";
import { getDb } from "@/lib/db";
import { debtors } from "@/lib/db/schema";
import { WebCallLab } from "@/components/web-call-lab";
import { DemoControls } from "@/components/dashboard/demo-controls";
export const dynamic = "force-dynamic";
export default async function Lab({
  searchParams,
}: {
  searchParams: Promise<{ debtorId?: string }>;
}) {
  const { debtorId } = await searchParams;
  const rows = await getDb()
    .select({
      id: debtors.id,
      shop: debtors.shopName,
      name: debtors.contactName,
    })
    .from(debtors)
    .orderBy(debtors.shopName);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <Link href="/" className="text-sm text-muted-foreground">
        ← Dashboard
      </Link>
      <div>
        <p className="text-sm font-medium text-emerald-700">
          Chase · Voice lab
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Practice the conversation
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Speak as the selected shop owner through your microphone. This browser
          call uses test tools and does not change customer balances, promises
          or contact preferences.
        </p>
      </div>
      <WebCallLab debtors={rows} initialDebtorId={debtorId} />
      <DemoControls />
    </main>
  );
}
