import { NextRequest, NextResponse } from "next/server";
import { generatePromptPR, listPromptPRs } from "@/lib/promptprs";
import { requireMember } from "@/lib/tenancy/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ items: await listPromptPRs() });
}

export async function POST(request: NextRequest) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
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
