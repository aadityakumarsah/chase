import { NextRequest, NextResponse } from "next/server";
import { generatePromptPR, listPromptPRs } from "@/lib/promptprs";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireDashboardAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ items: await listPromptPRs() });
}

export async function POST(request: NextRequest) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
  try {
    return NextResponse.json(await generatePromptPR("collections"), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Prompt PR generation failed",
      },
      { status: 503 },
    );
  }
}
