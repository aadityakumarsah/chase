import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db";
import { debtorBusinessId } from "@/lib/db/tenant";
import { businesses, complianceEvents, debtors } from "@/lib/db/schema";
import { getEnv, type Env } from "@/lib/env";
import { emitEvent } from "@/lib/events";
import { loadGateFacts } from "./policy";
import {
  evaluateContact,
  type ContactDecision,
  type ContactPurpose,
} from "./gate";

export async function evaluateDebtorContact(
  debtorId: string,
  options: {
    purpose?: ContactPurpose;
    now?: Date;
    db?: DbExecutor;
    record?: boolean;
    callId?: string;
    env?: Env;
  } = {},
) {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const [row] = await db
    .select({ debtor: debtors, business: businesses })
    .from(debtors)
    .innerJoin(businesses, eq(businesses.id, debtors.businessId))
    .where(eq(debtors.id, debtorId));
  if (!row) throw new Error("Debtor not found");
  const facts = await loadGateFacts(debtorId, db, now);
  const env = options.env ?? getEnv();
  const decision = evaluateContact({
    purpose: options.purpose ?? "collection",
    debtor: {
      status: row.debtor.status,
      firstContactDisclosedAt: row.debtor.firstContactDisclosedAt,
    },
    business: row.business,
    now,
    toNumber: row.debtor.phoneE164,
    attemptsToday: facts.attemptsToday,
    attemptsThisWeek: facts.attemptsThisWeek,
    lastAttemptAt: facts.lastAttemptAt,
    optedOut: facts.optedOut,
    disputeOpen: row.debtor.status === "dispute",
    hardship: row.debtor.status === "hardship",
    activePromise: facts.activePromiseFor
      ? { date: facts.activePromiseFor }
      : null,
    demoMode: env.DEMO_MODE,
    allowlist: env.CALL_ALLOWLIST,
    demoOverride: row.business.demoWindowOverride,
    consentBasis: row.debtor.consentBasis,
    ownerPhoneVerified: Boolean(row.business.ownerPhoneVerifiedAt),
  });
  if (options.record !== false)
    await recordContactDecision(debtorId, decision, {
      db,
      callId: options.callId,
    });
  return { decision, debtor: row.debtor, business: row.business, facts };
}

export async function recordContactDecision(
  debtorId: string,
  decision: ContactDecision,
  options: { db?: DbExecutor; callId?: string } = {},
) {
  const db = options.db ?? getDb();
  const failed = decision.rules.filter((rule) => !rule.passed);
  await db.insert(complianceEvents).values({
    businessId: debtorBusinessId(debtorId),
    debtorId,
    callId: options.callId,
    kind: decision.allowed ? "gate_allowed" : "gate_blocked",
    rule: decision.allowed ? "contact_gate" : failed.map((r) => r.id).join(","),
    detail: {
      rules: decision.rules,
      nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
    },
  });
  if (decision.demoOverrideUsed)
    await db.insert(complianceEvents).values({
      businessId: debtorBusinessId(debtorId),
      debtorId,
      callId: options.callId,
      kind: "demo_override",
      rule: "calling_window",
      detail: { badge: "demo override: consenting tester" },
    });
  if (!decision.allowed)
    await emitEvent(
      "gate.blocked",
      {
        debtorId,
        callId: options.callId,
        payload: {
          rules: failed.map((rule) => rule.id),
          nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
        },
      },
      db,
    );
}
