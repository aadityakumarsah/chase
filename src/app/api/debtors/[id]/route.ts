import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import { debtorDetail } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Invalid debtor" }, { status: 400 });
  const result = await debtorDetail(auth.businessId, id.data);
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
