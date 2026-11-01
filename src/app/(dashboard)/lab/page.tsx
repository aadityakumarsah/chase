import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { debtors } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/supabase/server";
import { getSession } from "@/lib/tenancy";
import { PageHeading } from "@/components/page-heading";
import { WebCallLab } from "@/components/web-call-lab";
import { DemoControls } from "@/components/dashboard/demo-controls";

export const dynamic = "force-dynamic";

export default async function Lab({
  searchParams,
}: {
  searchParams: Promise<{ debtorId?: string }>;
}) {
  const { debtorId } = await searchParams;
  // The lab lists real accounts, so it must be scoped to the caller's
  // workspace like every other tenant query.
  const result = await getSession(await getAuthUser().catch(() => null));
  if (!result.ok)
    redirect(result.reason === "anonymous" ? "/login" : "/onboarding");
  const rows = await getDb()
    .select({
      id: debtors.id,
      shop: debtors.shopName,
      name: debtors.contactName,
    })
    .from(debtors)
    .where(eq(debtors.businessId, result.session.workspace.id))
    .orderBy(debtors.shopName);

  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Voice lab"
        title="Practice the conversation"
        description="Speak as the selected shop owner through your microphone. This browser call uses test tools and never changes customer balances, promises or contact preferences."
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-sm font-medium">
            No accounts to practise with yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
            Add an account or import your ledger, then come back here to
            rehearse the call before Chase makes a real one.
          </p>
        </div>
      ) : (
        <WebCallLab debtors={rows} initialDebtorId={debtorId} />
      )}
      <DemoControls />
    </main>
  );
}
