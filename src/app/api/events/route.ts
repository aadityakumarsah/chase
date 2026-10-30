import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import { dashboardEvents } from "@/lib/dashboard/queries";
export const dynamic = "force-dynamic";
const querySchema = z.object({
  after: z
    .string()
    .regex(/^\d+$/)
    .max(19)
    .refine((value) => BigInt(value) <= 9223372036854775807n)
    .optional(),
  afterId: z
    .string()
    .regex(/^\d+$/)
    .max(19)
    .refine((value) => BigInt(value) <= 9223372036854775807n)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  callId: z.uuid().optional(),
  debtorId: z.uuid().optional(),
});
export async function GET(request: NextRequest) {
  const denied = requireDashboardAdmin(request);
  if (denied) return denied;
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid event query" }, { status: 400 });
  const rows = await dashboardEvents({
    after: parsed.data.after ?? parsed.data.afterId,
    limit: parsed.data.limit,
    callId: parsed.data.callId,
    debtorId: parsed.data.debtorId,
  });
  return NextResponse.json(
    {
      events: rows,
      nextCursor:
        rows.at(-1)?.id ?? parsed.data.after ?? parsed.data.afterId ?? "0",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
