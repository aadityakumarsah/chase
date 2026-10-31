import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { complianceDashboard } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const data = await complianceDashboard(auth.businessId);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const quote = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["at", "shop", "kind", "rule", "detail"].join(","),
      ...data.ledger.map((row) =>
        [row.at, row.shopName, row.kind, row.rule, JSON.stringify(row.detail)]
          .map(quote)
          .join(","),
      ),
    ].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=chase-compliance.csv",
      },
    });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
