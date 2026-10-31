import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getAuthUser } from "@/lib/supabase/server";
import {
  getSession,
  hasAtLeast,
  type MemberRole,
  type Session,
} from "@/lib/tenancy";

export type GuardOptions = {
  /** Minimum role required. Defaults to `viewer` (any member may read). */
  minRole?: MemberRole;
  /** Marks a state-changing request: requires `operator` and a same-origin check. */
  mutation?: boolean;
};

export type Guarded =
  | { ok: true; session: Session; businessId: string; role: MemberRole }
  | { ok: false; response: NextResponse };

/**
 * The single authorization gate for every workspace API route.
 *
 * Replaces the shared-passcode guard: a caller must be a signed-in Supabase user
 * who is an active member of the workspace being acted on, with sufficient role.
 * The workspace is never taken from the request body — it comes from the
 * membership-checked session — so a caller cannot address another tenant's data.
 */
export async function requireMember(
  request: NextRequest,
  options: GuardOptions = {},
): Promise<Guarded> {
  const deny = (status: number, error: string): Guarded => ({
    ok: false,
    response: NextResponse.json({ error }, { status }),
  });

  const user = await getAuthUser().catch(() => null);
  const result = await getSession(user);
  if (!result.ok)
    return result.reason === "anonymous"
      ? deny(401, "Sign in required")
      : deny(403, "No workspace. Complete onboarding first.");

  const { session } = result;
  const minimum = options.minRole ?? (options.mutation ? "operator" : "viewer");
  if (!hasAtLeast(session.workspace.role, minimum))
    return deny(
      403,
      `This action requires the ${minimum} role; your access is ${session.workspace.role}.`,
    );

  if (session.workspace.status === "suspended")
    return deny(403, "This workspace is suspended.");

  if (options.mutation) {
    // Same-origin check: blocks a cross-site form or fetch from reusing cookies.
    const origin = request.headers.get("origin");
    const expected = new URL(getEnv().APP_BASE_URL).origin;
    if (origin && origin !== expected) return deny(403, "Invalid origin");
    if (!origin && request.method !== "GET") return deny(403, "Missing origin");
  }

  return {
    ok: true,
    session,
    businessId: session.workspace.id,
    role: session.workspace.role,
  };
}
