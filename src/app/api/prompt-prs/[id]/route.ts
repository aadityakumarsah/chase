import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promptPRDetail } from "@/lib/promptprs";
import { requireMember } from "@/lib/tenancy/guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Invalid Prompt PR" }, { status: 400 });
  try {
    return NextResponse.json(await promptPRDetail(id.data));
  } catch {
    return NextResponse.json({ error: "Prompt PR not found" }, { status: 404 });
  }
}
