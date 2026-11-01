import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { debtorFiltersSchema, debtorList } from "@/lib/dashboard/queries";
import { createDebtor, DebtorCreateError } from "@/lib/debtors/create";
import { BillingLimitError, denialBody } from "@/lib/billing/entitlements";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const query = debtorFiltersSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success)
    return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  return NextResponse.json(
    { items: await debtorList(auth.businessId, query.data) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Adds one account by hand, for the shop that is not in a ledger export yet. */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  try {
    const result = await createDebtor(
      auth.businessId,
      await request.json().catch(() => null),
      auth.session.user.id,
    );
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof BillingLimitError)
      return NextResponse.json(denialBody(error.denial), { status: 402 });
    if (error instanceof DebtorCreateError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    log.error("debtor.create.failed", { businessId: auth.businessId });
    return NextResponse.json(
      { error: "Could not save that account." },
      { status: 500 },
    );
  }
}
