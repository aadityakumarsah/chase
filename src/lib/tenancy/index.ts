import { cookies } from "next/headers";
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appUsers, businesses, orgMembers } from "@/lib/db/schema";
import type { AuthUser } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "chase_ws";

export type MemberRole = "owner" | "admin" | "operator" | "viewer";

/** Authority ordering. Every guard is expressed as a minimum rank. */
const RANK: Record<MemberRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

export function hasAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return RANK[role] >= RANK[minimum];
}

/** What each role is allowed to do, used by both the API guards and the UI. */
export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  owner: "Full control, including billing, danger-zone actions and deletion.",
  admin: "Manage settings, teammates, agents and prompt approvals.",
  operator: "Work the queue: call, message, record promises and payments.",
  viewer: "Read-only access to the workspace.",
};

export type Workspace = {
  id: string;
  name: string;
  slug: string | null;
  role: MemberRole;
  status: "onboarding" | "active" | "suspended" | "closed";
  plan: "trial" | "starter" | "growth" | "scale";
  onboardedAt: Date | null;
};

/**
 * Mirrors the verified Supabase identity into app_users so that application
 * tables can hold real foreign keys to a user. Called on every authenticated
 * entry point; it is an upsert, never a trust boundary.
 */
export async function ensureAppUser(user: AuthUser): Promise<void> {
  await getDb()
    .insert(appUsers)
    .values({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appUsers.id,
      set: {
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

/** Every workspace this user may enter, oldest membership first. */
export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = await getDb()
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      role: orgMembers.role,
      status: businesses.status,
      plan: businesses.plan,
      onboardedAt: businesses.onboardedAt,
    })
    .from(orgMembers)
    .innerJoin(businesses, eq(businesses.id, orgMembers.businessId))
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active")))
    .orderBy(asc(orgMembers.createdAt));
  return rows.filter((r) => r.status !== "closed");
}

/**
 * Resolves which workspace the request is acting in: the one named by the
 * active-workspace cookie when the user is still a member of it, otherwise the
 * user's first workspace. Membership is always re-checked against the database,
 * so a stale or forged cookie cannot widen access.
 */
export async function resolveWorkspace(
  userId: string,
  requestedId?: string | null,
): Promise<Workspace | null> {
  const all = await listWorkspaces(userId);
  if (!all.length) return null;
  if (requestedId) {
    const match = all.find((w) => w.id === requestedId);
    if (match) return match;
  }
  return all[0];
}

export type Session = {
  user: AuthUser;
  workspace: Workspace;
  workspaces: Workspace[];
};

/**
 * The signed-in user's current workspace context, or a reason there is none.
 * `reason` lets callers route correctly: unauthenticated users go to sign-in,
 * authenticated users with no workspace go to onboarding.
 */
export async function getSession(
  user: AuthUser | null,
): Promise<
  | { ok: true; session: Session }
  | { ok: false; reason: "anonymous" | "no-workspace" }
> {
  if (!user) return { ok: false, reason: "anonymous" };
  await ensureAppUser(user);
  const workspaces = await listWorkspaces(user.id);
  if (!workspaces.length) return { ok: false, reason: "no-workspace" };
  const store = await cookies();
  const requested = store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspace = workspaces.find((w) => w.id === requested) ?? workspaces[0];
  return { ok: true, session: { user, workspace, workspaces } };
}

/**
 * Every workspace that should receive automated work (the 19:15 brief, sweeps).
 * Suspended, closed and still-onboarding workspaces are deliberately excluded.
 */
export async function listActiveWorkspaceIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.status, "active"))
    .orderBy(asc(businesses.createdAt));
  return rows.map((row) => row.id);
}
