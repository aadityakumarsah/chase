import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getAuthUser } from "@/lib/supabase/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ensureAppUser,
  listWorkspaces,
} from "@/lib/tenancy";
import { createWorkspace } from "@/lib/tenancy/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Workspaces the signed-in user belongs to. */
export async function GET() {
  const user = await getAuthUser().catch(() => null);
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureAppUser(user);
  return NextResponse.json(
    { workspaces: await listWorkspaces(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Creates a workspace for the signed-in user. Any authenticated user may create
 * one — this is self-serve signup, not an admin action — and becomes its owner.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(getEnv().APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const user = await getAuthUser().catch(() => null);
  if (!user)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureAppUser(user);

  // One workspace per account for now: a second one is a support/sales action.
  const existing = await listWorkspaces(user.id);
  if (existing.some((w) => w.role === "owner"))
    return NextResponse.json(
      { error: "You already own a workspace.", workspace: existing[0] },
      { status: 409 },
    );

  try {
    const workspace = await createWorkspace(user.id, await request.json());
    const response = NextResponse.json({
      workspace: { id: workspace.id, name: workspace.name },
    });
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(getEnv().APP_BASE_URL).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Check the highlighted fields.",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Could not create the workspace. Please try again." },
      { status: 503 },
    );
  }
}
