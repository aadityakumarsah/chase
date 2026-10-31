import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  approvePromptPR,
  rejectPromptPR,
  rollbackPromptPR,
} from "@/lib/promptprs";
import { requireMember } from "@/lib/tenancy/guard";

const bodySchema = z.object({
  action: z.enum(["approve", "reject", "rollback"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
  try {
    const id = z.uuid().parse((await params).id);
    const { action } = bodySchema.parse(await request.json());
    const result =
      action === "approve"
        ? await approvePromptPR(id)
        : action === "reject"
          ? await rejectPromptPR(id)
          : await rollbackPromptPR(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid action"
            : error instanceof Error
              ? error.message
              : "Action failed",
      },
      { status: error instanceof z.ZodError ? 400 : 409 },
    );
  }
}
