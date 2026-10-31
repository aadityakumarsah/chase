import { NextRequest, NextResponse } from "next/server";
import { generatePromptPR, listPromptPRs } from "@/lib/promptprs";
import { requireMember } from "@/lib/tenancy/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ items: await listPromptPRs(auth.businessId) });
}

export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(
      await generatePromptPR("collections", auth.businessId),
      {
        status: 201,
      },
    );
  } catch (error) {
    const insufficientEvidence =
      error instanceof Error &&
      error.message ===
        "At least two connected analyzed calls are required for a Prompt PR";
    return NextResponse.json(
      {
        error: insufficientEvidence
          ? "At least two analyzed calls are required"
          : "Prompt PR generation failed",
      },
      { status: 503 },
    );
  }
}
