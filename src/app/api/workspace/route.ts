import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/lib/tenancy/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { workspace: await getWorkspaceSettings(auth.businessId), role: auth.role },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;
  try {
    await updateWorkspaceSettings(auth.businessId, await request.json());
    return NextResponse.json({
      workspace: await getWorkspaceSettings(auth.businessId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Check the highlighted fields."
            : "Could not save those settings.",
        fields:
          error instanceof z.ZodError
            ? error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              }))
            : undefined,
      },
      { status: 400 },
    );
  }
}
