import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { debtorFiltersSchema, debtorList } from "@/lib/dashboard/queries";
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
