import { eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls, callTurns, debtors, proxyCallStates } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";

export async function proxyCallFromSystem(system: string) {
  const token = /Call reference:\s*([a-zA-Z0-9_-]{32,128})/i.exec(system)?.[1];
  if (!token) return null;
  const [row] = await getDb()
    .select({ call: calls, debtor: debtors })
    .from(calls)
    .leftJoin(debtors, eq(debtors.id, calls.debtorId))
    .where(eq(calls.callToken, token))
    .limit(1);
  return row ?? null;
}

export async function appendCallTurn(input: {
  callId: string;
  speaker: "agent" | "debtor" | "system";
  text: string;
  ttftMs?: number;
}) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`call-turn:${input.callId}`}))`,
    );
    const [latest] = await tx
      .select({ idx: max(callTurns.idx) })
      .from(callTurns)
      .where(eq(callTurns.callId, input.callId));
    const [row] = await tx
      .insert(callTurns)
      .values({
        callId: input.callId,
        idx: (latest?.idx ?? -1) + 1,
        speaker: input.speaker,
        text: input.text.slice(0, 20_000),
        timeToFirstTokenMs: input.ttftMs,
      })
      .returning();
    return row;
  });
}

export async function consumePendingSupervisor(callId: string) {
  return getDb().transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(proxyCallStates)
      .where(eq(proxyCallStates.callId, callId));
    if (!state?.pendingSupervisorNote)
      return { note: null, disabled: state?.supervisorDisabled ?? false };
    await tx
      .update(proxyCallStates)
      .set({ pendingSupervisorNote: null })
      .where(eq(proxyCallStates.callId, callId));
    return {
      note: state.pendingSupervisorNote,
      disabled: state.supervisorDisabled,
    };
  });
}

export async function savePendingSupervisor(callId: string, note: string) {
  await getDb()
    .insert(proxyCallStates)
    .values({ callId, pendingSupervisorNote: note })
    .onConflictDoUpdate({
      target: proxyCallStates.callId,
      set: { pendingSupervisorNote: note, updatedAt: new Date() },
    });
}

export async function recordProxyLatency(
  callId: string,
  debtorId: string | null,
  ttftMs: number,
) {
  const [existing] = await getDb()
    .select()
    .from(proxyCallStates)
    .where(eq(proxyCallStates.callId, callId));
  const streak = ttftMs > 1_500 ? (existing?.slowTurnStreak ?? 0) + 1 : 0;
  const disabled = existing?.supervisorDisabled || streak >= 3;
  await getDb()
    .insert(proxyCallStates)
    .values({ callId, slowTurnStreak: streak, supervisorDisabled: disabled })
    .onConflictDoUpdate({
      target: proxyCallStates.callId,
      set: {
        slowTurnStreak: streak,
        supervisorDisabled: disabled,
        updatedAt: new Date(),
      },
    });
  await emitEvent("proxy.turn_latency", {
    callId,
    ...(debtorId ? { debtorId } : {}),
    payload: { ttftMs, slowTurnStreak: streak, supervisorDisabled: disabled },
  });
  if (disabled && !existing?.supervisorDisabled)
    await emitEvent("supervisor.disabled", {
      callId,
      ...(debtorId ? { debtorId } : {}),
      payload: { reason: "three_slow_turns" },
    });
}
