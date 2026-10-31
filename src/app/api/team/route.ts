import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/lib/tenancy/guard";
import {
  inviteTeammate,
  listTeam,
  revokeInvite,
  TeamError,
  updateMember,
} from "@/lib/tenancy/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listTeam(auth.businessId), {
    headers: { "Cache-Control": "no-store" },
  });
}

/** Invite a teammate. Admins and owners only. */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;
  try {
    const invite = await inviteTeammate(
      auth.businessId,
      auth.session.user.id,
      await request.json(),
      getEnv().APP_BASE_URL,
    );
    return NextResponse.json({ invite });
  } catch (error) {
    return NextResponse.json(
      {
        // Only deliberate, user-facing messages are echoed back.
        error:
          error instanceof z.ZodError
            ? "Enter a valid email address and role."
            : error instanceof TeamError
              ? error.message
              : "Could not send that invitation.",
      },
      { status: 400 },
    );
  }
}

const patchSchema = z.union([
  z.object({
    memberId: z.uuid(),
    role: z.enum(["admin", "operator", "viewer"]),
  }),
  z.object({ memberId: z.uuid(), remove: z.literal(true) }),
  z.object({ inviteId: z.uuid(), revoke: z.literal(true) }),
]);

/** Change a role, remove a member, or revoke a pending invitation. */
export async function PATCH(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;
  const body = patchSchema.safeParse(await request.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    if ("inviteId" in body.data)
      await revokeInvite(auth.businessId, body.data.inviteId);
    else if ("remove" in body.data)
      await updateMember(auth.businessId, body.data.memberId, { remove: true });
    else
      await updateMember(auth.businessId, body.data.memberId, {
        role: body.data.role,
      });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof TeamError
            ? error.message
            : "Could not apply that change.",
      },
      { status: 400 },
    );
  }
}
