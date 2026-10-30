import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { debtorFiltersSchema, debtorList } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = requireDashboardAdmin(request);
  if (denied) return denied;
  const query = debtorFiltersSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success)
    return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  return NextResponse.json(
    { items: await debtorList(query.data) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
