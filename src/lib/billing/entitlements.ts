import { ENTITLEMENTS, type BillingTier, type Entitlements } from "./plans";
import { getBillingState, getUsage, type UsageSnapshot } from "./subscription";

/**
 * Plan enforcement.
 *
 * Every check returns a structured refusal rather than throwing, so callers can
 * answer with a 402 and a message that names the limit and the tier that lifts
 * it. A customer who hits a wall should always be told exactly which wall.
 */

export type LimitKey = "debtors" | "callsPerMonth" | "seats";
export type FeatureKey = keyof Pick<
  Entitlements,
  "campaigns" | "dailyBrief" | "promptPrs" | "apiAccess"
>;

export type Denial = {
  ok: false;
  reason: string;
  limit: number | null;
  used: number;
  tier: BillingTier;
  /** The cheapest tier that would allow this, when one exists. */
  upgradeTo: BillingTier | null;
};
export type Allowance = { ok: true };
export type Decision = Allowance | Denial;

export class BillingLimitError extends Error {
  constructor(readonly denial: Denial) {
    super(denial.reason);
    this.name = "BillingLimitError";
  }
}

const LIMIT_LABEL: Record<LimitKey, string> = {
  debtors: "debtor accounts",
  callsPerMonth: "voice calls this month",
  seats: "team members",
};

const USAGE_FIELD: Record<LimitKey, keyof UsageSnapshot> = {
  debtors: "debtors",
  callsPerMonth: "callsThisMonth",
  seats: "seats",
};

const ASCENDING: BillingTier[] = ["free", "pro", "enterprise"];

/** The cheapest tier whose limit exceeds what the caller needs. */
function upgradeForLimit(
  key: LimitKey,
  current: BillingTier,
  required: number,
): BillingTier | null {
  const start = ASCENDING.indexOf(current) + 1;
  for (const tier of ASCENDING.slice(start)) {
    const limit = ENTITLEMENTS[tier][key];
    if (limit === null || limit >= required) return tier;
  }
  return null;
}

function upgradeForFeature(
  key: FeatureKey,
  current: BillingTier,
): BillingTier | null {
  const start = ASCENDING.indexOf(current) + 1;
  return ASCENDING.slice(start).find((tier) => ENTITLEMENTS[tier][key]) ?? null;
}

/**
 * Checks a metered limit, optionally for a batch of `additional` new records.
 *
 * Passing the batch size matters for CSV import: refusing the whole file up
 * front is far kinder than importing 40 rows of 100 and then stopping.
 */
export async function checkLimit(
  businessId: string,
  key: LimitKey,
  additional = 1,
): Promise<Decision> {
  const [state, usage] = await Promise.all([
    getBillingState(businessId),
    getUsage(businessId),
  ]);
  const limit = state.entitlements[key];
  const used = usage[USAGE_FIELD[key]];
  if (limit === null || used + additional <= limit) return { ok: true };

  const label = LIMIT_LABEL[key];
  const required = used + additional;
  // A trialing workspace holds the Pro tier but has bought nothing, so the
  // upgrade it needs is Pro itself rather than the tier above it.
  const from: BillingTier = state.source === "trial" ? "free" : state.tier;
  const upgradeTo = upgradeForLimit(key, from, required);
  const reason =
    additional === 1
      ? `Your ${state.tier === "free" ? "Free" : state.tier} plan allows ${limit} ${label}. You are using ${used}.`
      : `Adding ${additional} would take you past the ${limit} ${label} your plan allows (${used} in use).`;
  return { ok: false, reason, limit, used, tier: state.tier, upgradeTo };
}

/** Checks a boolean feature flag. */
export async function checkFeature(
  businessId: string,
  key: FeatureKey,
): Promise<Decision> {
  const state = await getBillingState(businessId);
  if (state.entitlements[key]) return { ok: true };
  const upgradeTo = upgradeForFeature(
    key,
    state.source === "trial" ? "free" : state.tier,
  );
  return {
    ok: false,
    reason: upgradeTo
      ? `This is available on ${upgradeTo === "pro" ? "Pro" : "Enterprise"}.`
      : "This is not available on your plan.",
    limit: null,
    used: 0,
    tier: state.tier,
    upgradeTo,
  };
}

/** The JSON body a route returns when a plan limit refuses the request. */
export function denialBody(denial: Denial) {
  return {
    ok: false as const,
    error: denial.reason,
    billing: {
      tier: denial.tier,
      limit: denial.limit,
      used: denial.used,
      upgradeTo: denial.upgradeTo,
    },
  };
}
