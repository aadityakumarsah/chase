import { and, desc, eq, max } from "drizzle-orm";
import { syncConfiguredAgent } from "@/lib/bolna/sync-configured";
import { getDb } from "@/lib/db";
import { promptPrs, promptVersions } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { registerPromptVersion } from "@/lib/prompts";
import { getPromptPRCandidate } from "./generate";

export async function approvePromptPR(id: string) {
  const { row, base, candidate } = await getPromptPRCandidate(id);
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
    payload: { id, version: created.version, promptVersionId: created.id },
  });
  return updated;
}

export async function rejectPromptPR(id: string) {
  const [updated] = await getDb()
    .update(promptPrs)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(promptPrs.id, id), eq(promptPrs.status, "open")))
    .returning();
  if (!updated) throw new Error("Only open Prompt PRs can be rejected");
  await emitEvent("prompt_pr.rejected", { payload: { id } });
  return updated;
}

export async function rollbackPromptPR(id: string) {
  const [row] = await getDb()
    .select()
    .from(promptPrs)
    .where(eq(promptPrs.id, id));
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
    payload: { id, restoredPromptVersionId: base.id },
  });
  return updated;
}

export async function listPromptPRs() {
  return getDb().select().from(promptPrs).orderBy(desc(promptPrs.createdAt));
}

export async function promptPRDetail(id: string) {
  return getPromptPRCandidate(id);
}
