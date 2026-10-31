import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import { debtorBusinessId } from "@/lib/db/tenant";
import {
  businesses,
  calls,
  complianceEvents,
  debtors,
  optOuts,
  promises,
} from "@/lib/db/schema";
import { getEnv, type Env } from "@/lib/env";
import { outstandingPaise } from "@/lib/chase/portfolio";
import { istDay, istInstant, addIstDays } from "@/lib/time";
import {
  callWindowSchema,
  isWithinCallWindow,
  nextAllowedSlot,
  nextWindowOpening,
  toCallWindow,
  HARD_WINDOW_START,
  HARD_WINDOW_END,
  type CallWindow,
} from "./window";

/** Every reason a collection call can be refused, as logged in compliance_events. */
export const GATE_RULES = [
  "reserved_number",
  "not_allowlisted",
  "opted_out",
  "debtor_status",
  "nothing_outstanding",
  "call_in_flight",
  "outside_window",
  "daily_attempt_cap",
  "weekly_attempt_cap",
  "minimum_gap",
  "active_promise",
] as const;
export type GateRule = (typeof GATE_RULES)[number];

export type GateBlock = {
  rule: GateRule;
  detail: Record<string, string | number | boolean | null>;
  /** Earliest instant this particular block clears, when it is time-based. */
  clearsAt: Date | null;
};
export type GateDecision = {
  allowed: boolean;
  blocks: GateBlock[];
  /** Null when no amount of waiting makes the call allowed. */
  nextAllowedAt: Date | null;
  window: CallWindow;
};

const STATUS_BLOCKED = new Set([
  "paid",
  "dispute",
  "do_not_contact",
  "wrong_number",
]);
/** Genuine hardship is not a refusal, but it gets a much wider gap. */
export const HARDSHIP_MIN_GAP_HOURS = 72;

export const gateFactsSchema = z.object({
  debtorId: z.uuid(),
  phoneE164: z.string(),
  status: z.enum([
    "active",
    "paid",
    "dispute",
    "do_not_contact",
    "hardship",
    "wrong_number",
  ]),
  window: callWindowSchema,
  demoWindowOverride: z.boolean(),
  maxAttemptsPerDay: z.number().int().positive(),
  maxAttemptsPerWeek: z.number().int().positive(),
  minGapHours: z.number().int().nonnegative(),
  optedOut: z.boolean(),
  outstandingPaise: z.bigint().nonnegative(),
  attemptsToday: z.number().int().nonnegative(),
  attemptsThisWeek: z.number().int().nonnegative(),
  oldestAttemptThisWeek: z.date().nullable(),
  lastAttemptAt: z.date().nullable(),
  callInFlight: z.boolean(),
  activePromiseFor: z.union([z.iso.date(), z.null()]),
});
export type GateFacts = z.infer<typeof gateFactsSchema>;

/**
 * Pure policy. Demo mode may widen a business window up to the hard conduct
 * limits, never past them, so a demo can never dial at 21:00.
 */
export function evaluateGate(
  input: GateFacts,
  options: {
    now?: Date;
    env?: Pick<Env, "DEMO_MODE" | "CALL_ALLOWLIST">;
  } = {},
): GateDecision {
  const facts = gateFactsSchema.parse(input);
  const now = z.date().parse(options.now ?? new Date());
  const env = options.env ?? getEnv();
  const window = facts.demoWindowOverride
    ? callWindowSchema.parse({
        start: HARD_WINDOW_START,
        end: HARD_WINDOW_END,
      })
    : facts.window;
  const blocks: GateBlock[] = [];
  const block = (
    rule: GateRule,
    detail: GateBlock["detail"],
    clearsAt: Date | null = null,
  ) => blocks.push({ rule, detail, clearsAt });

  if (/^\+91900000\d{4}$/.test(facts.phoneE164))
    block("reserved_number", { reason: "fictional seed number" });
  if (env.DEMO_MODE && !env.CALL_ALLOWLIST.includes(facts.phoneE164))
    block("not_allowlisted", { demoMode: true });
  if (facts.optedOut) block("opted_out", { ledger: "active" });
  if (STATUS_BLOCKED.has(facts.status))
    block("debtor_status", { status: facts.status });
  if (facts.outstandingPaise <= 0n)
    block("nothing_outstanding", { outstandingPaise: 0 });
  if (facts.callInFlight) block("call_in_flight", { reason: "queued or live" });

  if (!isWithinCallWindow(now, window))
    block(
      "outside_window",
      {
        window: `${window.start}-${window.end}`,
        override: facts.demoWindowOverride,
      },
      nextAllowedSlot(now, window, now),
    );

  if (facts.attemptsToday >= facts.maxAttemptsPerDay)
    block(
      "daily_attempt_cap",
      { attemptsToday: facts.attemptsToday, cap: facts.maxAttemptsPerDay },
      nextWindowOpening(
        istInstant(addIstDays(istDay(now), 1), "00:00"),
        window,
      ),
    );
  if (facts.attemptsThisWeek >= facts.maxAttemptsPerWeek)
    block(
      "weekly_attempt_cap",
      {
        attemptsThisWeek: facts.attemptsThisWeek,
        cap: facts.maxAttemptsPerWeek,
      },
      facts.oldestAttemptThisWeek
        ? nextWindowOpening(
            new Date(facts.oldestAttemptThisWeek.getTime() + 7 * 86_400_000),
            window,
          )
        : null,
    );

  const gapHours =
    facts.status === "hardship"
      ? Math.max(facts.minGapHours, HARDSHIP_MIN_GAP_HOURS)
      : facts.minGapHours;
  if (facts.lastAttemptAt && gapHours > 0) {
    const clears = new Date(
      facts.lastAttemptAt.getTime() + gapHours * 3_600_000,
    );
    if (clears.getTime() > now.getTime())
      block(
        "minimum_gap",
        { gapHours, lastAttemptAt: facts.lastAttemptAt.toISOString() },
        nextWindowOpening(clears, window),
      );
  }

  if (facts.activePromiseFor && facts.activePromiseFor >= istDay(now))
    block(
      "active_promise",
      { promisedFor: facts.activePromiseFor },
      nextWindowOpening(
        istInstant(addIstDays(facts.activePromiseFor, 1), window.start),
        window,
      ),
    );

  const timeBased = blocks.every((b) => b.clearsAt);
  const nextAllowedAt = blocks.length
    ? timeBased
      ? nextAllowedSlot(
          new Date(
            Math.max(
              ...blocks.map((b) => b.clearsAt!.getTime()),
              now.getTime(),
            ),
          ),
          window,
          now,
        )
      : null
    : nextAllowedSlot(now, window, now);
  return { allowed: !blocks.length, blocks, nextAllowedAt, window };
}

export async function loadGateFacts(
  debtorId: string,
  db: DbExecutor = getDb(),
  now = new Date(),
): Promise<GateFacts> {
  z.uuid().parse(debtorId);
  const [row] = await db
    .select({ debtor: debtors, business: businesses })
    .from(debtors)
    .innerJoin(businesses, eq(businesses.id, debtors.businessId))
    .where(eq(debtors.id, debtorId));
  if (!row) throw new Error("Debtor not found");
  const today = istDay(now);
  const dayStart = istInstant(today, "00:00");
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  // Attempts are counted from creation so a queued or failed dial still counts.
  const [counts] = await db
    .select({
      today: sql<number>`count(*) filter (where ${calls.createdAt} >= ${dayStart.toISOString()})::int`,
      week: sql<number>`count(*) filter (where ${calls.createdAt} >= ${weekStart.toISOString()})::int`,
      oldestThisWeek: sql<Date | null>`min(${calls.createdAt}) filter (where ${calls.createdAt} >= ${weekStart.toISOString()})`,
      lastAt: sql<Date | null>`max(${calls.createdAt})`,
      inFlight: sql<number>`count(*) filter (where ${calls.status} in ('scheduled','queued','rescheduled','initiated','ringing','in-progress','in_progress','dispatch_unknown'))::int`,
    })
    .from(calls)
    .where(and(eq(calls.debtorId, debtorId), eq(calls.purpose, "collection")));
  const [promise] = await db
    .select({ promisedFor: promises.promisedFor })
    .from(promises)
    .where(
      and(
        eq(promises.debtorId, debtorId),
        eq(promises.status, "pending"),
        gte(promises.promisedFor, today),
      ),
    )
    .orderBy(promises.promisedFor)
    .limit(1);
  const [optOut] = await db
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(and(eq(optOuts.debtorId, debtorId), isNull(optOuts.clearedAt)))
    .limit(1);
  return gateFactsSchema.parse({
    debtorId,
    phoneE164: row.debtor.phoneE164,
    status: row.debtor.status,
    window: toCallWindow(row.business),
    demoWindowOverride: row.business.demoWindowOverride,
    maxAttemptsPerDay: row.business.maxAttemptsPerDay,
    maxAttemptsPerWeek: row.business.maxAttemptsPerWeek,
    minGapHours: row.business.minGapHours,
    optedOut: !!optOut,
    outstandingPaise: await outstandingPaise(debtorId, db),
    attemptsToday: counts?.today ?? 0,
    attemptsThisWeek: counts?.week ?? 0,
    oldestAttemptThisWeek: counts?.oldestThisWeek
      ? new Date(counts.oldestThisWeek)
      : null,
    lastAttemptAt: counts?.lastAt ? new Date(counts.lastAt) : null,
    callInFlight: (counts?.inFlight ?? 0) > 0,
    activePromiseFor: promise?.promisedFor ?? null,
  });
}

/** Evaluate and append the decision to the compliance log in one step. */
export async function evaluateCallGate(
  debtorId: string,
  options: {
    db?: DbExecutor;
    now?: Date;
    record?: boolean;
    callId?: string;
  } = {},
): Promise<GateDecision> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const facts = await loadGateFacts(debtorId, db, now);
  const decision = evaluateGate(facts, { now });
  if (options.record !== false)
    await recordGateDecision(debtorId, decision, {
      db,
      callId: options.callId,
    });
  return decision;
}

export async function recordGateDecision(
  debtorId: string,
  decision: GateDecision,
  options: { db?: DbExecutor; callId?: string } = {},
) {
  const db = options.db ?? getDb();
  await db.insert(complianceEvents).values({
    businessId: debtorBusinessId(debtorId),
    debtorId,
    callId: options.callId,
    kind: decision.allowed ? "gate_allowed" : "gate_blocked",
    rule: decision.allowed
      ? "call_gate"
      : decision.blocks.map((b) => b.rule).join(","),
    detail: {
      window: `${decision.window.start}-${decision.window.end}`,
      nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
      blocks: decision.blocks.map((b) => ({ rule: b.rule, ...b.detail })),
    },
  });
}

export function describeBlocks(decision: GateDecision): string {
  if (decision.allowed) return "allowed";
  return decision.blocks
    .map(
      (b) =>
        `${b.rule}(${Object.entries(b.detail)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")})`,
    )
    .join(", ");
}
