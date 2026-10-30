import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { executionSchema, type BolnaExecution } from "@/lib/bolna/client";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { getEnv, type Env } from "@/lib/env";
import { emitEvent } from "@/lib/events";

export const TERMINAL_STATUSES = new Set([
  "completed",
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "stopped",
  "error",
  "balance-low",
]);
export function verifyWebhookSecret(
  presented: string | null | undefined,
  env: Env = getEnv(),
) {
  if (!presented || !env.CHASE_WEBHOOK_SECRET) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(presented), hash(env.CHASE_WEBHOOK_SECRET));
}
export function hasConversation(execution: BolnaExecution) {
  return (
    (execution.conversation_duration ?? 0) > 0 &&
    /^user:\s*\S/im.test(execution.transcript ?? "")
  );
}
const ranks: Record<string, number> = {
  scheduled: 0,
  queued: 1,
  rescheduled: 1,
  initiated: 2,
  ringing: 3,
  "in-progress": 4,
  in_progress: 4,
  "call-disconnected": 5,
};
export function isStaleExecution(current: string, incoming: string) {
  if (TERMINAL_STATUSES.has(current)) return incoming !== current;
  return (ranks[incoming] ?? 6) < (ranks[current] ?? -1);
}
export async function ingestExecution(
  payload: unknown,
  options: { now?: Date } = {},
) {
  const execution = executionSchema.parse(payload);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(calls)
      .where(eq(calls.bolnaExecutionId, execution.id))
      .for("update");
    if (!existing)
      return { status: "unknown_execution", executionId: execution.id };
    if (isStaleExecution(existing.status, execution.status))
      return { status: "stale", callId: existing.id };
    const update = mapExecutionToCall(execution, options.now ?? new Date());
    // Same-status deliveries can enrich final facts. Do not emit duplicate lifecycle events.
    await tx.update(calls).set(update).where(eq(calls.id, existing.id));
    if (existing.status !== execution.status)
      await emitEvent(
        `call.${execution.status.replaceAll("-", "_")}`,
        {
          debtorId: existing.debtorId ?? undefined,
          callId: existing.id,
          payload: {
            status: execution.status,
            connected: update.connected,
            durationSec: update.durationSec ?? null,
          },
        },
        tx,
      );
    return {
      status: existing.status === execution.status ? "duplicate" : "updated",
      callId: existing.id,
      callStatus: execution.status,
      terminal: TERMINAL_STATUSES.has(execution.status),
    };
  });
}
export function mapExecutionToCall(execution: BolnaExecution, now: Date) {
  const terminal = TERMINAL_STATUSES.has(execution.status);
  return {
    status: execution.status,
    connected: hasConversation(execution),
    startedAt: date(execution.created_at),
    endedAt: terminal ? (date(execution.updated_at) ?? now) : undefined,
    durationSec:
      execution.conversation_duration == null
        ? undefined
        : Math.round(execution.conversation_duration),
    transcript: execution.transcript ?? undefined,
    recordingUrl: execution.telephony_data?.recording_url ?? undefined,
    // Official API reports cents, already. The ledger column is integer cents.
    costCents:
      execution.total_cost == null
        ? undefined
        : BigInt(Math.round(execution.total_cost)),
    terminationReason:
      execution.termination_reason ??
      execution.error_message ??
      execution.telephony_data?.hangup_reason ??
      undefined,
    timeToFirstAudioMs:
      execution.latency_data?.time_to_first_audio == null
        ? undefined
        : Math.round(execution.latency_data.time_to_first_audio),
    raw: scrubCredentials(execution) as Record<string, unknown>,
  };
}
function date(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value)
    : undefined;
}
function scrubCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubCredentials);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/token|secret|password|authorization/i.test(key))
        .map(([key, v]) => [key, scrubCredentials(v)]),
    );
  return value;
}
