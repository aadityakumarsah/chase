import { z } from "zod";
import { addIstDays, istDay, istInstant, isWithinWindow } from "@/lib/time";

export const CONTACT_RULE_IDS = [
  "R1_allowlist",
  "R2_opt_out",
  "R3_dispute_hold",
  "R4_wrong_number",
  "R5_calling_window",
  "R6_attempts_per_day",
  "R7_attempts_per_week",
  "R8_min_gap",
  "R9_hardship_gap",
  "R10_promise_pending",
  "R11_first_contact_disclosure",
] as const;

export type ContactRuleId = (typeof CONTACT_RULE_IDS)[number];
export type ContactPurpose = "collection" | "owner_brief";
export type ContactRule = {
  id: ContactRuleId;
  passed: boolean;
  detail: string;
};
export type ContactInput = {
  purpose: ContactPurpose;
  debtor: { status: string; firstContactDisclosedAt: Date | null };
  business: {
    callWindowStart: string;
    callWindowEnd: string;
    maxAttemptsPerDay: number;
    maxAttemptsPerWeek: number;
    minGapHours: number;
    sundayCalls?: boolean;
  };
  now: Date;
  toNumber: string;
  attemptsToday: number;
  attemptsThisWeek: number;
  lastAttemptAt: Date | null;
  optedOut: boolean;
  disputeOpen: boolean;
  hardship: boolean;
  activePromise: { date: string } | null;
  demoMode: boolean;
  /** Demo-mode safety list. Production permission comes from `consentBasis`. */
  allowlist: readonly string[];
  demoOverride: boolean;
  /**
   * Why this workspace may contact this debtor, attested at import. Outside demo
   * mode a debtor with no recorded basis is never called.
   */
  consentBasis?: string | null;
  /** For owner briefs: the workspace proved control of the number by OTP. */
  ownerPhoneVerified?: boolean;
};
export type ContactDecision = {
  allowed: boolean;
  rules: ContactRule[];
  nextAllowedAt: Date | null;
  demoOverrideUsed: boolean;
};

const permanentRules = new Set<ContactRuleId>([
  "R1_allowlist",
  "R2_opt_out",
  "R3_dispute_hold",
  "R4_wrong_number",
]);
const isSunday = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(date) === "Sun";

function nextBusinessOpening(
  from: Date,
  start: string,
  end: string,
  sundayCalls: boolean,
) {
  let day = istDay(from);
  for (let i = 0; i < 9; i++) {
    const open = istInstant(day, start);
    const close = istInstant(day, end);
    if (sundayCalls || !isSunday(open)) {
      if (from < open) return open;
      if (from < close) return from;
    }
    day = addIstDays(day, 1);
  }
  throw new Error("No contact window found in the next eight days");
}

/** Pure and exhaustive: operators see every rule, not just the first failure. */
export function evaluateContact(input: ContactInput): ContactDecision {
  z.date().parse(input.now);
  const rules: ContactRule[] = [];
  const add = (id: ContactRuleId, passed: boolean, detail: string) =>
    rules.push({ id, passed, detail });
  const allowlisted = input.allowlist.includes(input.toNumber);
  const consented = Boolean(input.consentBasis);
  // R1 is the permission rule. In demo mode it is the operator-maintained
  // allowlist; in production it is the workspace's own recorded basis for
  // contacting this customer, or a verified owner number for a brief call.
  const permitted = input.demoMode
    ? allowlisted
    : input.purpose === "owner_brief"
      ? input.ownerPhoneVerified === true
      : consented;
  add(
    "R1_allowlist",
    permitted,
    input.demoMode
      ? allowlisted
        ? "number is allowlisted"
        : "number is not allowlisted"
      : input.purpose === "owner_brief"
        ? input.ownerPhoneVerified === true
          ? "owner number verified"
          : "owner number is not verified"
        : consented
          ? `contact permitted: ${input.consentBasis}`
          : "no recorded basis to contact this customer",
  );
  if (input.purpose === "owner_brief") {
    for (const id of CONTACT_RULE_IDS.slice(1))
      add(id, true, "owner brief exemption");
    return {
      allowed: rules.every((rule) => rule.passed),
      rules,
      nextAllowedAt: null,
      demoOverrideUsed: false,
    };
  }

  const configuredStart = input.business.callWindowStart.slice(0, 5);
  const configuredEnd = input.business.callWindowEnd.slice(0, 5);
  const start = configuredStart < "08:00" ? "08:00" : configuredStart;
  const end = configuredEnd > "19:00" ? "19:00" : configuredEnd;
  const sundayCalls = input.business.sundayCalls ?? false;
  const override = input.demoMode && allowlisted && input.demoOverride;
  const insideWindow =
    isWithinWindow(input.now, start, end) &&
    (sundayCalls || !isSunday(input.now));
  const gapHours = input.lastAttemptAt
    ? (input.now.getTime() - input.lastAttemptAt.getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const promiseBlocked = Boolean(
    input.activePromise &&
    input.activePromise.date > addIstDays(istDay(input.now), 1),
  );

  add(
    "R2_opt_out",
    !input.optedOut,
    input.optedOut ? "active opt-out" : "clear",
  );
  add(
    "R3_dispute_hold",
    !input.disputeOpen,
    input.disputeOpen ? "open dispute" : "clear",
  );
  add(
    "R4_wrong_number",
    input.debtor.status !== "wrong_number",
    input.debtor.status === "wrong_number"
      ? "number is not verified"
      : "number is verified",
  );
  add(
    "R5_calling_window",
    insideWindow || override,
    override
      ? "demo override: consenting tester"
      : `${configuredStart}-${configuredEnd} IST; effective ${start}-${end}; Sunday ${sundayCalls ? "allowed" : "off"}`,
  );
  add(
    "R6_attempts_per_day",
    input.attemptsToday < input.business.maxAttemptsPerDay,
    `${input.attemptsToday}/${input.business.maxAttemptsPerDay} attempts today`,
  );
  add(
    "R7_attempts_per_week",
    input.attemptsThisWeek < input.business.maxAttemptsPerWeek,
    `${input.attemptsThisWeek}/${input.business.maxAttemptsPerWeek} attempts this week`,
  );
  add(
    "R8_min_gap",
    gapHours >= input.business.minGapHours,
    input.lastAttemptAt
      ? `${Math.max(0, gapHours).toFixed(1)}h of ${input.business.minGapHours}h`
      : "no previous attempt",
  );
  add(
    "R9_hardship_gap",
    !input.hardship || gapHours >= 72,
    input.hardship
      ? `${Math.max(0, gapHours).toFixed(1)}h of 72h`
      : "not a hardship account",
  );
  add(
    "R10_promise_pending",
    !promiseBlocked,
    input.activePromise
      ? promiseBlocked
        ? `promise due ${input.activePromise.date}; wait until day-before reminder`
        : `day-before/due reminder permitted for ${input.activePromise.date}`
      : "no active promise",
  );
  add(
    "R11_first_contact_disclosure",
    true,
    input.debtor.firstContactDisclosedAt
      ? "already sent"
      : "send before dialing",
  );

  const failed = rules.filter((rule) => !rule.passed);
  if (!failed.length)
    return {
      allowed: true,
      rules,
      nextAllowedAt: null,
      demoOverrideUsed: override,
    };
  if (failed.some((rule) => permanentRules.has(rule.id)))
    return {
      allowed: false,
      rules,
      nextAllowedAt: null,
      demoOverrideUsed: override,
    };

  const candidates = [input.now.getTime()];
  if (!rules[4]?.passed)
    candidates.push(
      nextBusinessOpening(input.now, start, end, sundayCalls).getTime(),
    );
  if (!rules[5]?.passed)
    candidates.push(
      istInstant(addIstDays(istDay(input.now), 1), start).getTime(),
    );
  if (!rules[6]?.passed)
    candidates.push(
      (input.lastAttemptAt?.getTime() ?? input.now.getTime()) + 7 * 86_400_000,
    );
  if (input.lastAttemptAt) {
    if (!rules[7]?.passed)
      candidates.push(
        input.lastAttemptAt.getTime() + input.business.minGapHours * 3_600_000,
      );
    if (!rules[8]?.passed)
      candidates.push(input.lastAttemptAt.getTime() + 72 * 3_600_000);
  }
  if (promiseBlocked)
    candidates.push(
      istInstant(addIstDays(input.activePromise!.date, -1), start).getTime(),
    );
  const clearsAt = new Date(Math.max(...candidates));
  return {
    allowed: false,
    rules,
    nextAllowedAt: override
      ? clearsAt
      : nextBusinessOpening(clearsAt, start, end, sundayCalls),
    demoOverrideUsed: override,
  };
}
