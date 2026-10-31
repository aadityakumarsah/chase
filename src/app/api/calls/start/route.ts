import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import { startCollectionCall } from "@/lib/calls/dial";

export const runtime = "nodejs";
const bodySchema = z.object({ debtorId: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  try {
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await startCollectionCall(body.debtorId, {
        source: "manual",
        businessId: auth.businessId,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError ? "Invalid request" : "Call unavailable",
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
