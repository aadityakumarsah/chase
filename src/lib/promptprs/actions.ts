import { and, desc, eq, max } from "drizzle-orm";
import { syncConfiguredAgent } from "@/lib/bolna/sync-configured";
import { getDb } from "@/lib/db";
import { businesses, promptPrs, promptVersions } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { registerPromptVersion } from "@/lib/prompts";
import { getPromptPRCandidate } from "./generate";
import { canSyncSharedPrompt } from "./policy";

/** The shared Bolna agent can be changed only in an isolated single-workspace demo. */
export async function sharedPromptSyncAvailable(businessId: string) {
  if (!getEnv().DEMO_MODE) return false;
  const rows = await getDb()
    .select({ id: businesses.id })
    .from(businesses)
    .limit(2);
  return canSyncSharedPrompt(
    getEnv().DEMO_MODE,
    rows.map((row) => row.id),
    businessId,
  );
}

export async function approvePromptPR(id: string, businessId: string) {
  const { row, base, candidate } = await getPromptPRCandidate(id, businessId);
  if (!(await sharedPromptSyncAvailable(businessId)))
    throw new Error(
      "Shared-agent prompt sync is unavailable for this workspace",
    );
  if (row.status !== "open")
    throw new Error("Only open Prompt PRs can be approved");
  const sim = row.simResults as {
    recommended?: boolean;
    complianceRegressed?: boolean;
  } | null;
  if (!sim?.recommended || sim.complianceRegressed)
    throw new Error("Prompt PR is not recommended by the compliance simulator");
  const [latest] = await getDb()
    .select({ version: max(promptVersions.version) })
    .from(promptVersions)
    .where(eq(promptVersions.agentKey, row.agentKey));
  const created = await registerPromptVersion({
    agentKey: row.agentKey,
    source: candidate,
    version: (latest?.version ?? base.version) + 1,
    createdBy: "prompt_pr",
    notes: `prompt-pr:${row.id}`,
    activate: true,
  });
  try {
    await syncConfiguredAgent(row.agentKey);
  } catch (error) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(promptVersions)
        .set({ isActive: false })
        .where(eq(promptVersions.id, created.id));
      await tx
        .update(promptVersions)
        .set({ isActive: true })
        .where(eq(promptVersions.id, base.id));
    });
    throw error;
  }
  const [updated] = await getDb()
    .update(promptPrs)
    .set({ status: "approved", decidedAt: new Date() })
    .where(eq(promptPrs.id, id))
    .returning();
  await emitEvent("prompt_pr.approved", {
    businessId,
    payload: { id, version: created.version, promptVersionId: created.id },
  });
  return updated;
}

export async function rejectPromptPR(id: string, businessId: string) {
  const [updated] = await getDb()
    .update(promptPrs)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(
      and(
        eq(promptPrs.id, id),
        eq(promptPrs.businessId, businessId),
        eq(promptPrs.status, "open"),
      ),
    )
    .returning();
  if (!updated) throw new Error("Only open Prompt PRs can be rejected");
  await emitEvent("prompt_pr.rejected", { businessId, payload: { id } });
  return updated;
}

export async function rollbackPromptPR(id: string, businessId: string) {
  const [row] = await getDb()
    .select()
    .from(promptPrs)
    .where(and(eq(promptPrs.id, id), eq(promptPrs.businessId, businessId)));
  if (!(await sharedPromptSyncAvailable(businessId)))
    throw new Error(
      "Shared-agent prompt sync is unavailable for this workspace",
    );
  if (!row || row.status !== "approved")
    throw new Error("Only approved Prompt PRs can be rolled back");
  const [current] = await getDb()
    .select()
    .from(promptVersions)
    .where(
      and(
        eq(promptVersions.agentKey, row.agentKey),
        eq(promptVersions.isActive, true),
      ),
    );
  const [base] = await getDb()
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.id, row.baseVersionId));
  if (!current || !base) throw new Error("Prompt versions are unavailable");
  await getDb().transaction(async (tx) => {
    await tx
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.id, current.id));
    await tx
      .update(promptVersions)
      .set({ isActive: true })
      .where(eq(promptVersions.id, base.id));
  });
  try {
    await syncConfiguredAgent(row.agentKey);
  } catch (error) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(promptVersions)
        .set({ isActive: false })
        .where(eq(promptVersions.id, base.id));
      await tx
        .update(promptVersions)
        .set({ isActive: true })
        .where(eq(promptVersions.id, current.id));
    });
    throw error;
  }
  const [updated] = await getDb()
    .update(promptPrs)
    .set({ status: "rolled_back", decidedAt: new Date() })
    .where(eq(promptPrs.id, id))
    .returning();
  await emitEvent("prompt_pr.rolled_back", {
    businessId,
    payload: { id, restoredPromptVersionId: base.id },
  });
  return updated;
}

export async function listPromptPRs(businessId: string) {
  return getDb()
    .select()
    .from(promptPrs)
    .where(eq(promptPrs.businessId, businessId))
    .orderBy(desc(promptPrs.createdAt));
}

export async function promptPRDetail(id: string, businessId: string) {
  const detail = await getPromptPRCandidate(id, businessId);
  return {
    ...detail,
    syncAvailable: await sharedPromptSyncAvailable(businessId),
  };
}
