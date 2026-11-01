/**
 * The plan catalogue: the one place prices, limits and features are defined.
 *
 * Displayed prices live here, but the amount actually charged is whatever the
 * matching Dodo Payments product is priced at. Keep the two in step — the
 * `pnpm billing:verify` script compares them against the live Dodo catalogue so
 * a mismatch is caught before a customer sees it.
 */
export const BILLING_TIERS = ["free", "pro", "enterprise"] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Tiers a customer can buy without talking to a human. */
export const SELF_SERVE_TIERS = [
  "pro",
] as const satisfies readonly BillingTier[];
export type SelfServeTier = (typeof SELF_SERVE_TIERS)[number];

export function isSelfServeTier(value: string): value is SelfServeTier {
  return (SELF_SERVE_TIERS as readonly string[]).includes(value);
}

/**
 * What a tier is allowed to do. `null` means unlimited.
 *
 * Caps are per workspace. `callsPerMonth` counts collection calls placed in the
 * current calendar month in Asia/Kolkata, which is how the dashboard reports it.
 */
export type Entitlements = {
  debtors: number | null;
  callsPerMonth: number | null;
  seats: number | null;
  campaigns: boolean;
  dailyBrief: boolean;
  promptPrs: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
};

/**
 * How long a new workspace may evaluate Chase on Pro features.
 *
 * Short on purpose: the trial exists to prove the product on a few real
 * accounts, not to run a book on for free.
 */
export const TRIAL_DAYS = 7;

/**
 * Caps that apply while a workspace is trialing.
 *
 * Pro features are unlocked so the product can be judged honestly, but the
 * metered limits stay small so the trial cannot replace a subscription.
 */
export const TRIAL_ENTITLEMENTS: Entitlements = {
  debtors: 50,
  callsPerMonth: 25,
  seats: 3,
  campaigns: true,
  dailyBrief: true,
  promptPrs: true,
  apiAccess: false,
  prioritySupport: false,
};

export const ENTITLEMENTS: Record<BillingTier, Entitlements> = {
  free: {
    debtors: 10,
    callsPerMonth: 10,
    seats: 2,
    campaigns: false,
    dailyBrief: false,
    promptPrs: false,
    apiAccess: false,
    prioritySupport: false,
  },
  pro: {
    debtors: 2_000,
    callsPerMonth: 1_500,
    seats: 10,
    campaigns: true,
    dailyBrief: true,
    promptPrs: true,
    apiAccess: true,
    prioritySupport: false,
  },
  enterprise: {
    debtors: null,
    callsPerMonth: null,
    seats: null,
    campaigns: true,
    dailyBrief: true,
    promptPrs: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

export type PlanPricing = {
  /** Display price in whole rupees for one interval. */
  rupees: number;
  /** Environment variable holding the Dodo product id for this interval. */
  productEnvKey: "DODO_PRODUCT_PRO_MONTHLY" | "DODO_PRODUCT_PRO_YEARLY";
};

export type PlanDefinition = {
  tier: BillingTier;
  name: string;
  tagline: string;
  /** Null for tiers that are not self-serve (free, enterprise). */
  pricing: Record<BillingInterval, PlanPricing> | null;
  features: string[];
  /** Shown with a highlight on the pricing table. */
  highlight?: boolean;
  cta: string;
};

export const PLANS: Record<BillingTier, PlanDefinition> = {
  free: {
    tier: "free",
    name: "Free",
    tagline: "Keep a handful of accounts moving, free forever.",
    pricing: null,
    cta: "Start free",
    features: [
      "Up to 10 debtor accounts",
      "10 voice calls a month",
      "2 team members",
      "Chase Rating queue and dossiers",
      "UPI payment links to your own VPA",
      "Compliance guardrails and opt-out ledger",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    tagline: "For a business that chases money every single day.",
    highlight: true,
    cta: "Upgrade to Pro",
    pricing: {
      monthly: { rupees: 2_499, productEnvKey: "DODO_PRODUCT_PRO_MONTHLY" },
      yearly: { rupees: 24_990, productEnvKey: "DODO_PRODUCT_PRO_YEARLY" },
    },
    features: [
      "Up to 2,000 debtor accounts",
      "1,500 voice calls a month",
      "10 team members",
      "Bulk calling campaigns",
      "Daily owner brief (verified phone required for calls)",
      "Workspace-scoped Prompt PR review",
      "Mid-call tools and call history",
    ],
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    tagline: "A sales-assisted plan for larger receivables teams.",
    pricing: null,
    cta: "Talk to us",
    features: [
      "Account, call and seat limits agreed with your team",
      "Conduct and security review before launch",
      "Integration and migration planning",
      "Priority support terms by agreement",
      "Custom commercial terms after a sales call",
    ],
  },
};

/** Ordered for display: cheapest first. */
export const PLAN_ORDER: BillingTier[] = ["free", "pro", "enterprise"];

/** Yearly saving as a whole-rupee amount, for the "save ₹x" badge. */
export function yearlySaving(tier: BillingTier): number | null {
  const pricing = PLANS[tier].pricing;
  if (!pricing) return null;
  return pricing.monthly.rupees * 12 - pricing.yearly.rupees;
}

/** Yearly saving rounded to a whole percentage. */
export function yearlySavingPercent(tier: BillingTier): number | null {
  const pricing = PLANS[tier].pricing;
  const saving = yearlySaving(tier);
  if (!pricing || saving === null) return null;
  return Math.round((saving / (pricing.monthly.rupees * 12)) * 100);
}

/** Authority ordering, so an upgrade can be told from a downgrade. */
const RANK: Record<BillingTier, number> = { free: 0, pro: 1, enterprise: 2 };
export function tierAtLeast(tier: BillingTier, minimum: BillingTier): boolean {
  return RANK[tier] >= RANK[minimum];
}

export function formatRupees(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}
