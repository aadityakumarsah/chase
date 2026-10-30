import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  approvePromptPR,
  rejectPromptPR,
  rollbackPromptPR,
} from "@/lib/promptprs";
import { requireDashboardAdmin } from "@/lib/dashboard/auth";

const bodySchema = z.object({
  action: z.enum(["approve", "reject", "rollback"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireDashboardAdmin(request, { mutation: true });
  if (denied) return denied;
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
