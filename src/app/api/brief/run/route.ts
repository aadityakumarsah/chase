import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDailyBrief } from "@/lib/brief";
import { deliveryChannelSchema } from "@/lib/brief/types";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  date: z.union([z.iso.date(), z.literal("today")]).optional(),
  deliver: z.array(deliveryChannelSchema).min(1).max(3).default(["dashboard"]),
});

export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  try {
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await runDailyBrief(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid brief request"
            : error instanceof Error
              ? error.message
              : "Brief generation failed",
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
