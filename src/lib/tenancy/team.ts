import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { appUsers, businesses, orgInvites, orgMembers } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import type { MemberRole } from "@/lib/tenancy";

export const INVITE_TTL_HOURS = 72;

/**
 * An error whose message is safe to show the user. Anything else is reported
 * generically so database text never reaches an API response.
 */
export class TeamError extends Error {}

export const inviteSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "operator", "viewer"]),
});

export const roleChangeSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(["owner", "admin", "operator", "viewer"]),
});

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export type TeamMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  status: "active" | "invited" | "suspended";
  joinedAt: string;
  isOwner: boolean;
};

export async function listTeam(businessId: string) {
  const db = getDb();
  const [members, invites, [workspace]] = await Promise.all([
    db
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        status: orgMembers.status,
        joinedAt: orgMembers.createdAt,
        name: appUsers.fullName,
        email: appUsers.email,
      })
      .from(orgMembers)
      .innerJoin(appUsers, eq(appUsers.id, orgMembers.userId))
      .where(eq(orgMembers.businessId, businessId))
      .orderBy(asc(orgMembers.createdAt)),
    db
      .select({
        id: orgInvites.id,
        email: orgInvites.email,
        role: orgInvites.role,
        expiresAt: orgInvites.expiresAt,
        createdAt: orgInvites.createdAt,
      })
      .from(orgInvites)
      .where(
        and(
          eq(orgInvites.businessId, businessId),
          isNull(orgInvites.acceptedAt),
          isNull(orgInvites.revokedAt),
        ),
      )
      .orderBy(asc(orgInvites.createdAt)),
    db
      .select({ ownerUserId: businesses.ownerUserId })
      .from(businesses)
      .where(eq(businesses.id, businessId)),
  ]);

  return {
    members: members.map((m): TeamMember => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
      isOwner: m.userId === workspace?.ownerUserId,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

/**
 * Creates an invitation and returns the single-use link. Only the hash of the
 * token is stored, so a database leak cannot be replayed into workspace access.
 */
export async function inviteTeammate(
  businessId: string,
  invitedByUserId: string,
  input: z.input<typeof inviteSchema>,
  baseUrl: string,
) {
  const value = inviteSchema.parse(input);
  const db = getDb();

  // Already a member? Inviting again would be confusing rather than harmful.
  const [existing] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .innerJoin(appUsers, eq(appUsers.id, orgMembers.userId))
    .where(
      and(
        eq(orgMembers.businessId, businessId),
        eq(appUsers.email, value.email),
      ),
    )
    .limit(1);
  if (existing)
    throw new TeamError("That person is already in this workspace.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);

  await db
    .insert(orgInvites)
    .values({
      businessId,
      email: value.email,
      role: value.role,
      tokenHash: hashToken(token),
      expiresAt,
      invitedByUserId,
    })
    .onConflictDoUpdate({
      target: [orgInvites.businessId, orgInvites.email],
      // Matches the partial unique index: only one *pending* invite per email.
      targetWhere: sql`accepted_at IS NULL AND revoked_at IS NULL`,
      set: {
        role: value.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedByUserId,
        updatedAt: new Date(),
      },
    });

  await emitEvent("team.invited", {
    businessId,
    payload: { email: value.email, role: value.role },
  });

  return {
    email: value.email,
    role: value.role,
    expiresAt: expiresAt.toISOString(),
    url: `${baseUrl.replace(/\/$/, "")}/invite/${token}`,
  };
}

/**
 * Redeems an invitation for the signed-in user. The email must match the one the
 * invitation was issued to, so a leaked link cannot be used by a third party.
 */
export async function acceptInvite(
  token: string,
  user: { id: string; email: string },
) {
  const db = getDb();
  const [invite] = await db
    .select()
    .from(orgInvites)
    .where(eq(orgInvites.tokenHash, hashToken(token)))
    .limit(1);

  if (!invite || invite.revokedAt)
    return { ok: false as const, reason: "invalid" as const };
  if (invite.acceptedAt) return { ok: false as const, reason: "used" as const };
  if (invite.expiresAt.getTime() < Date.now())
    return { ok: false as const, reason: "expired" as const };
  if (invite.email.toLowerCase() !== user.email.toLowerCase())
    return { ok: false as const, reason: "wrong_account" as const };

  await db.transaction(async (tx) => {
    await tx
      .insert(orgMembers)
      .values({
        businessId: invite.businessId,
        userId: user.id,
        role: invite.role,
        status: "active",
        invitedByUserId: invite.invitedByUserId,
      })
      .onConflictDoUpdate({
        target: [orgMembers.businessId, orgMembers.userId],
        set: { status: "active", role: invite.role, updatedAt: new Date() },
      });
    await tx
      .update(orgInvites)
      .set({ acceptedAt: new Date(), acceptedByUserId: user.id })
      .where(eq(orgInvites.id, invite.id));
  });

  await emitEvent("team.joined", {
    businessId: invite.businessId,
    payload: { role: invite.role },
  });

  return { ok: true as const, businessId: invite.businessId };
}

export async function revokeInvite(businessId: string, inviteId: string) {
  await getDb()
    .update(orgInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(orgInvites.id, inviteId), eq(orgInvites.businessId, businessId)),
    );
}

/**
 * Changes a member's role or removes them. The workspace owner is protected:
 * they cannot be demoted or removed, so a workspace can never become ownerless.
 */
export async function updateMember(
  businessId: string,
  memberId: string,
  change: { role?: MemberRole; remove?: boolean },
) {
  const db = getDb();
  const [row] = await db
    .select({ member: orgMembers, ownerUserId: businesses.ownerUserId })
    .from(orgMembers)
    .innerJoin(businesses, eq(businesses.id, orgMembers.businessId))
    .where(
      and(eq(orgMembers.id, memberId), eq(orgMembers.businessId, businessId)),
    )
    .limit(1);
  if (!row) throw new TeamError("Member not found in this workspace.");
  if (row.member.userId === row.ownerUserId)
    throw new TeamError("The workspace owner cannot be changed or removed.");

  if (change.remove) {
    await db.delete(orgMembers).where(eq(orgMembers.id, memberId));
    await emitEvent("team.removed", { businessId, payload: { memberId } });
    return;
  }
  if (change.role) {
    await db
      .update(orgMembers)
      .set({ role: change.role, updatedAt: new Date() })
      .where(eq(orgMembers.id, memberId));
    await emitEvent("team.role_changed", {
      businessId,
      payload: { memberId, role: change.role },
    });
  }
}
