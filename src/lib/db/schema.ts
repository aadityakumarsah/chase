import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  time,
  integer,
  bigint,
  bigserial,
  boolean,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

export const language = pgEnum("language", ["hi", "en", "mr"]);
export const segment = pgEnum("segment", [
  "kirana",
  "medical",
  "restaurant",
  "hardware",
  "other",
]);
export const debtorStatus = pgEnum("debtor_status", [
  "active",
  "paid",
  "dispute",
  "do_not_contact",
  "hardship",
  "wrong_number",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "open",
  "partial",
  "paid",
  "written_off",
]);
export const promiseStatus = pgEnum("promise_status", [
  "pending",
  "kept",
  "broken",
  "partially_kept",
  "cancelled",
]);
export const promiseSource = pgEnum("promise_source", [
  "tool",
  "analysis",
  "manual",
]);
export const timeWindow = pgEnum("time_window", [
  "morning",
  "afternoon",
  "evening",
]);
export const callbackStatus = pgEnum("callback_status", [
  "scheduled",
  "done",
  "cancelled",
]);
export const paymentProvider = pgEnum("payment_provider", [
  "hosted",
  "razorpay",
]);
export const linkStatus = pgEnum("payment_link_status", [
  "created",
  "opened",
  "paid",
  "expired",
  "failed",
]);
export const paymentMethod = pgEnum("payment_method", [
  "upi",
  "cash",
  "bank",
  "other",
]);
export const paymentSource = pgEnum("payment_source", [
  "razorpay_webhook",
  "simulated",
  "manual",
]);
export const callPurpose = pgEnum("call_purpose", [
  "collection",
  "owner_brief",
  "test",
]);
export const callSpeaker = pgEnum("call_speaker", [
  "agent",
  "debtor",
  "system",
]);
export const messageChannel = pgEnum("message_channel", [
  "whatsapp",
  "sms",
  "console",
]);
export const messageDirection = pgEnum("message_direction", ["out", "in"]);
export const messageStatus = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const ratingBand = pgEnum("rating_band", ["A", "B", "C", "D", "X"]);
export const complianceKind = pgEnum("compliance_kind", [
  "gate_allowed",
  "gate_blocked",
  "allowlist_block",
  "opt_out",
  "opt_out_inferred",
  "dispute_hold",
  "disclosure_sent",
  "ai_disclosed",
  "supervisor_flag",
  "supervisor_rewrite",
  "post_call_flag",
  "demo_override",
]);
export const optOutScope = pgEnum("opt_out_scope", ["call", "all"]);
export const optOutSource = pgEnum("opt_out_source", [
  "call_tool",
  "whatsapp_stop",
  "manual",
  "inferred",
]);
export const agentKey = pgEnum("agent_key", ["collections", "brief"]);
export const promptCreator = pgEnum("prompt_creator", [
  "seed",
  "prompt_pr",
  "manual",
]);
export const promptPrStatus = pgEnum("prompt_pr_status", [
  "open",
  "approved",
  "rejected",
  "rolled_back",
]);
/** Workspace roles. Only `owner` may delete the workspace or change billing. */
export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "operator",
  "viewer",
]);
export const memberStatus = pgEnum("member_status", [
  "active",
  "invited",
  "suspended",
]);
export const orgPlan = pgEnum("org_plan", [
  "trial",
  "starter",
  "growth",
  "scale",
]);
export const orgStatus = pgEnum("org_status", [
  "onboarding",
  "active",
  "suspended",
  "closed",
]);
/**
 * Billing tier a workspace is entitled to. Deliberately separate from `orgPlan`,
 * which predates billing and stays an operations field: a tier is derived from a
 * paid subscription or a sales agreement, never set by hand in the product.
 */
export const billingTier = pgEnum("billing_tier", [
  "free",
  "pro",
  "enterprise",
]);
export const billingInterval = pgEnum("billing_interval", [
  "monthly",
  "yearly",
]);
/** Mirrors Dodo Payments' own subscription states so no mapping can drift. */
export const subscriptionStatus = pgEnum("subscription_status", [
  "pending",
  "active",
  "on_hold",
  "paused",
  "cancelled",
  "failed",
  "expired",
  "past_due",
]);
export const enterpriseLeadStatus = pgEnum("enterprise_lead_status", [
  "new",
  "contacted",
  "won",
  "lost",
]);
/**
 * Why a workspace is permitted to contact a debtor. Recorded per debtor at import
 * and attested by a named user; replaces the single-tenant CALL_ALLOWLIST env var.
 */
export const consentBasis = pgEnum("consent_basis", [
  "ledger_customer",
  "written_contract",
  "prior_relationship",
  "explicit_consent",
]);
export const verificationPurpose = pgEnum("verification_purpose", [
  "owner_phone",
  "test_number",
]);
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const audit = () => ({
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});
const id = () => uuid("id").defaultRandom().primaryKey();
const paise = (name: string) => bigint(name, { mode: "bigint" });

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    ...audit(),
    seedKey: text("seed_key"),
    /** URL-safe workspace handle, e.g. /app/shree-ganesh-traders. */
    slug: text("slug"),
    /** The signup user who owns this workspace; always also an `owner` member. */
    ownerUserId: uuid("owner_user_id"),
    plan: orgPlan("plan").default("trial").notNull(),
    status: orgStatus("status").default("onboarding").notNull(),
    onboardedAt: ts("onboarded_at"),
    trialEndsAt: ts("trial_ends_at"),
    /**
     * Entitlement tier in force. Written only by the billing webhook or by an
     * explicit enterprise agreement; the resolver in src/lib/billing treats an
     * unexpired `trialEndsAt` as Pro so a new workspace is never crippled.
     */
    billingTier: billingTier("billing_tier").default("free").notNull(),
    billingTierUpdatedAt: ts("billing_tier_updated_at"),
    /** Dodo Payments customer handle, reused so a workspace keeps one customer. */
    dodoCustomerId: text("dodo_customer_id"),
    name: text("name").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    /** Set once the owner's own number passes OTP verification. */
    ownerPhoneVerifiedAt: ts("owner_phone_verified_at"),
    /** Each workspace collects into its own VPA; money never touches a platform account. */
    upiVpa: text("upi_vpa"),
    /** Payee name shown in the debtor's UPI app. */
    merchantName: text("merchant_name"),
    /** Timestamp of the workspace's acceptance of the contact-conduct policy. */
    contactPolicyAcceptedAt: ts("contact_policy_accepted_at"),
    contactPolicyAcceptedBy: uuid("contact_policy_accepted_by"),
    city: text("city").notNull(),
    defaultLanguage: language("default_language").default("hi").notNull(),
    callWindowStart: time("call_window_start").default("09:00").notNull(),
    callWindowEnd: time("call_window_end").default("18:30").notNull(),
    maxAttemptsPerDay: integer("max_attempts_per_day").default(3).notNull(),
    maxAttemptsPerWeek: integer("max_attempts_per_week").default(8).notNull(),
    minGapHours: integer("min_gap_hours").default(4).notNull(),
    timezone: text("timezone").default("Asia/Kolkata").notNull(),
    demoWindowOverride: boolean("demo_window_override")
      .default(false)
      .notNull(),
  },
  (t) => [
    uniqueIndex("businesses_seed_key_uq").on(t.seedKey),
    check(
      "business_window",
      sql`${t.callWindowStart} >= '08:00' AND ${t.callWindowEnd} <= '19:00' AND ${t.callWindowStart} < ${t.callWindowEnd}`,
    ),
    check(
      "business_caps",
      sql`${t.maxAttemptsPerDay} > 0 AND ${t.maxAttemptsPerWeek} > 0 AND ${t.minGapHours} >= 0`,
    ),
  ],
);

export const debtors = pgTable(
  "debtors",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    shopName: text("shop_name").notNull(),
    contactName: text("contact_name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    preferredLanguage: language("preferred_language").default("hi").notNull(),
    city: text("city").notNull(),
    segment: segment("segment").notNull(),
    status: debtorStatus("status").default("active").notNull(),
    notes: text("notes"),
    firstContactDisclosedAt: ts("first_contact_disclosed_at"),
    lastInboundAt: ts("last_inbound_at"),
    /**
     * Contact permission, attested by a named user at import. A debtor with no
     * basis is never dialled; this is the multi-tenant replacement for the
     * single-tenant CALL_ALLOWLIST environment variable.
     */
    consentBasis: consentBasis("consent_basis"),
    consentAttestedAt: ts("consent_attested_at"),
    consentAttestedBy: uuid("consent_attested_by"),
    /** Free-text provenance, e.g. "Tally export 2026-10-31" or "manual entry". */
    consentSource: text("consent_source"),
  },
  (t) => [
    uniqueIndex("debtors_business_phone_uq").on(t.businessId, t.phoneE164),
    index("debtors_consent_idx").on(t.businessId, t.consentBasis),
    unique("debtors_id_business_uq").on(t.id, t.businessId),
    index("debtors_business_status_idx").on(t.businessId, t.status),
    check("debtor_e164", sql`${t.phoneE164} ~ '^[+][1-9][0-9]{6,14}$'`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id").notNull(),
    invoiceNo: text("invoice_no").notNull(),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on").notNull(),
    amountPaise: paise("amount_paise").notNull(),
    paidPaise: paise("paid_paise")
      .default(sql`0`)
      .notNull(),
    status: invoiceStatus("status").default("open").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.debtorId, t.businessId],
      foreignColumns: [debtors.id, debtors.businessId],
      name: "invoices_debtor_business_fk",
    }),
    uniqueIndex("invoices_business_number_uq").on(t.businessId, t.invoiceNo),
    index("invoices_debtor_due_idx").on(t.debtorId, t.dueOn),
    index("invoices_debtor_status_idx").on(t.debtorId, t.status),
    check(
      "invoice_money",
      sql`${t.amountPaise} > 0 AND ${t.paidPaise} >= 0 AND ${t.paidPaise} <= ${t.amountPaise}`,
    ),
    check("invoice_dates", sql`${t.dueOn} >= ${t.issuedOn}`),
  ],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id").references(() => businesses.id),
    agentKey: agentKey("agent_key").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    protectedHash: text("protected_hash").notNull(),
    createdBy: promptCreator("created_by").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").default(false).notNull(),
  },
  (t) => [
    index("prompt_versions_business_idx").on(t.businessId),
    uniqueIndex("prompt_versions_key_version_uq").on(t.agentKey, t.version),
    uniqueIndex("prompt_versions_active_uq")
      .on(t.agentKey)
      .where(sql`${t.isActive} = true`),
    check("prompt_version_positive", sql`${t.version} > 0`),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    purpose: callPurpose("purpose").notNull(),
    bolnaExecutionId: text("bolna_execution_id"),
    bolnaAgentId: text("bolna_agent_id"),
    callToken: text("call_token")
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      )
      .notNull(),
    source: text("source").default("manual").notNull(),
    status: text("status").notNull(),
    terminationReason: text("termination_reason"),
    connected: boolean("connected").default(false).notNull(),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    durationSec: integer("duration_sec"),
    transcript: text("transcript"),
    recordingUrl: text("recording_url"),
    costCents: paise("cost_cents"),
    timeToFirstAudioMs: integer("time_to_first_audio_ms"),
    interruptionStats: jsonb("interruption_stats"),
    language: language("language"),
    promptVersionId: uuid("prompt_version_id").references(
      () => promptVersions.id,
    ),
    raw: jsonb("raw"),
    analysis: jsonb("analysis"),
    analysisModel: text("analysis_model"),
    processingStartedAt: ts("processing_started_at"),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("calls_execution_uq").on(t.bolnaExecutionId),
    uniqueIndex("calls_token_uq").on(t.callToken),
    index("calls_business_started_idx").on(t.businessId, t.startedAt),
    index("calls_debtor_started_idx").on(t.debtorId, t.startedAt.desc()),
    index("calls_prompt_idx").on(t.promptVersionId),
    index("calls_status_idx").on(t.status),
    check(
      "calls_collection_debtor",
      sql`${t.purpose} <> 'collection' OR ${t.debtorId} IS NOT NULL`,
    ),
  ],
);

export const promises = pgTable(
  "promises",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    amountPaise: paise("amount_paise").notNull(),
    promisedFor: date("promised_for").notNull(),
    reasonCode: text("reason_code").notNull(),
    source: promiseSource("source").notNull(),
    confirmed: boolean("confirmed").default(false).notNull(),
    status: promiseStatus("status").default("pending").notNull(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    index("promises_business_idx").on(t.businessId),
    index("promises_debtor_status_date_idx").on(
      t.debtorId,
      t.status,
      t.promisedFor,
    ),
    index("promises_debtor_created_idx").on(t.debtorId, t.createdAt.desc()),
    index("promises_call_idx").on(t.callId),
    check("promise_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);
export const callbacks = pgTable(
  "callbacks",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    requestedFor: ts("requested_for").notNull(),
    scheduledFor: ts("scheduled_for").notNull(),
    window: timeWindow("window").notNull(),
    status: callbackStatus("status").default("scheduled").notNull(),
    note: text("note"),
  },
  (t) => [
    index("callbacks_business_idx").on(t.businessId),
    index("callbacks_debtor_idx").on(t.debtorId),
    index("callbacks_call_idx").on(t.callId),
    index("callbacks_status_schedule_idx").on(t.status, t.scheduledFor),
  ],
);
export const paymentLinks = pgTable(
  "payment_links",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    isDemo: boolean("is_demo").default(false).notNull(),
    token: text("token")
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      )
      .notNull(),
    amountPaise: paise("amount_paise").notNull(),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref"),
    providerUrl: text("provider_url"),
    status: linkStatus("status").default("created").notNull(),
    openedAt: ts("opened_at"),
    paidAt: ts("paid_at"),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [
    index("payment_links_business_idx").on(t.businessId),
    uniqueIndex("payment_links_token_uq").on(t.token),
    index("payment_links_debtor_idx").on(t.debtorId),
    index("payment_links_call_idx").on(t.callId),
    uniqueIndex("payment_links_active_call_uq")
      .on(t.callId)
      .where(sql`${t.status} IN ('created', 'opened')`),
    index("payment_links_provider_ref_idx").on(t.provider, t.providerRef),
    index("payment_links_expiry_idx").on(t.status, t.expiresAt),
    check("payment_link_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);
export const payments = pgTable(
  "payments",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    paymentLinkId: uuid("payment_link_id").references(() => paymentLinks.id),
    amountPaise: paise("amount_paise").notNull(),
    method: paymentMethod("method").notNull(),
    unappliedPaise: paise("unapplied_paise")
      .default(sql`0`)
      .notNull(),
    providerRef: text("provider_ref"),
    receivedAt: ts("received_at").notNull(),
    source: paymentSource("source").notNull(),
  },
  (t) => [
    index("payments_business_idx").on(t.businessId),
    index("payments_debtor_received_idx").on(t.debtorId, t.receivedAt),
    index("payments_link_idx").on(t.paymentLinkId),
    uniqueIndex("payments_source_ref_uq").on(t.source, t.providerRef),
    check("payment_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);
export const callTurns = pgTable(
  "call_turns",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id),
    idx: integer("idx").notNull(),
    speaker: callSpeaker("speaker").notNull(),
    text: text("text").notNull(),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    index("call_turns_business_idx").on(t.businessId),
    uniqueIndex("call_turns_call_idx_uq").on(t.callId, t.idx),
    check("turn_idx_nonnegative", sql`${t.idx} >= 0`),
  ],
);

export const proxyCallStates = pgTable("proxy_call_states", {
  callId: uuid("call_id")
    .primaryKey()
    .references(() => calls.id),
  ...audit(),
  pendingSupervisorNote: text("pending_supervisor_note"),
  slowTurnStreak: integer("slow_turn_streak").default(0).notNull(),
  supervisorDisabled: boolean("supervisor_disabled").default(false).notNull(),
});
export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    callId: uuid("call_id").references(() => calls.id),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").notNull(),
    result: jsonb("result"),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    index("tool_invocations_business_idx").on(t.businessId),
    index("tool_invocations_call_idx").on(t.callId),
    index("tool_invocations_debtor_idx").on(t.debtorId),
    index("tool_invocations_idempotency_idx").on(t.idempotencyKey),
  ],
);
export const messages = pgTable(
  "messages",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    toE164: text("to_e164").notNull(),
    kind: text("kind").default("general").notNull(),
    paymentLinkId: uuid("payment_link_id").references(() => paymentLinks.id),
    deliveryStartedAt: ts("delivery_started_at"),
    dedupeKey: text("dedupe_key"),
    channel: messageChannel("channel").notNull(),
    direction: messageDirection("direction").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    body: text("body").notNull(),
    status: messageStatus("status").default("queued").notNull(),
    error: text("error"),
  },
  (t) => [
    index("messages_business_idx").on(t.businessId),
    index("messages_debtor_created_idx").on(t.debtorId, t.createdAt),
    index("messages_call_idx").on(t.callId),
    uniqueIndex("messages_provider_id_uq").on(t.provider, t.providerMessageId),
    uniqueIndex("messages_dedupe_uq").on(t.dedupeKey),
  ],
);
export const contactDossiers = pgTable(
  "contact_dossiers",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    text: text("text").notNull(),
    preferredLanguage: language("preferred_language").notNull(),
    bestTimeWindow: timeWindow("best_time_window"),
    toneHint: text("tone_hint"),
    openCommitments: jsonb("open_commitments").default([]).notNull(),
    doNotMention: jsonb("do_not_mention").default([]).notNull(),
    sourceHash: text("source_hash").notNull(),
    model: text("model").notNull(),
  },
  (t) => [
    index("contact_dossiers_business_idx").on(t.businessId),
    uniqueIndex("dossiers_debtor_uq").on(t.debtorId),
    check("dossier_length", sql`char_length(${t.text}) <= 600`),
  ],
);
export const chaseRatings = pgTable(
  "chase_ratings",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    score: integer("score"),
    band: ratingBand("band").notNull(),
    pPay7d: numeric("p_pay_7d", { precision: 8, scale: 6 }),
    components: jsonb("components").notNull(),
    nextAction: text("next_action").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull(),
    rationale: text("rationale").notNull(),
    computedAt: ts("computed_at").defaultNow().notNull(),
  },
  (t) => [
    index("chase_ratings_business_idx").on(t.businessId),
    index("ratings_debtor_computed_idx").on(
      t.debtorId,
      t.computedAt.desc(),
      t.id.desc(),
    ),
    check(
      "rating_score_band",
      sql`(${t.score} IS NULL AND ${t.band} = 'X') OR (${t.score} BETWEEN 0 AND 100 AND ${t.band} <> 'X')`,
    ),
  ],
);
export const complianceEvents = pgTable(
  "compliance_events",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    kind: complianceKind("kind").notNull(),
    rule: text("rule").notNull(),
    detail: jsonb("detail").notNull(),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    index("compliance_events_business_idx").on(t.businessId),
    index("compliance_debtor_at_idx").on(t.debtorId, t.at),
    index("compliance_call_idx").on(t.callId),
    index("compliance_kind_at_idx").on(t.kind, t.at),
  ],
);
export const optOuts = pgTable(
  "opt_outs",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    scope: optOutScope("scope").notNull(),
    reason: text("reason").notNull(),
    source: optOutSource("source").notNull(),
    at: ts("at").defaultNow().notNull(),
    clearedAt: ts("cleared_at"),
    clearedBy: text("cleared_by"),
  },
  (t) => [
    index("opt_outs_business_idx").on(t.businessId),
    index("opt_outs_debtor_active_idx").on(t.debtorId, t.clearedAt),
  ],
);
export const promptPrs = pgTable(
  "prompt_prs",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id").references(() => businesses.id),
    agentKey: agentKey("agent_key").notNull(),
    baseVersionId: uuid("base_version_id")
      .notNull()
      .references(() => promptVersions.id),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    evidence: jsonb("evidence").notNull(),
    change: jsonb("change")
      .$type<{ section_id: string; old_text: string; new_text: string }>()
      .notNull(),
    expectedImpact: text("expected_impact").notNull(),
    risk: text("risk").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    status: promptPrStatus("status").default("open").notNull(),
    simResults: jsonb("sim_results"),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    index("prompt_prs_business_idx").on(t.businessId),
    index("prompt_prs_base_idx").on(t.baseVersionId),
    index("prompt_prs_agent_status_idx").on(t.agentKey, t.status),
    check("prompt_pr_confidence", sql`${t.confidence} BETWEEN 0 AND 1`),
  ],
);
export const simRuns = pgTable(
  "sim_runs",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id").references(() => businesses.id),
    promptVersionId: uuid("prompt_version_id").references(
      () => promptVersions.id,
    ),
    promptHash: text("prompt_hash").notNull(),
    personas: text("personas").array().notNull(),
    report: jsonb("report").notNull(),
    passed: boolean("passed").notNull(),
    model: text("model").notNull(),
    completedAt: ts("completed_at").defaultNow().notNull(),
  },
  (t) => [
    index("sim_runs_business_idx").on(t.businessId),
    index("sim_runs_prompt_completed_idx").on(
      t.promptVersionId,
      t.completedAt.desc(),
    ),
    index("sim_runs_completed_idx").on(t.completedAt.desc()),
  ],
);
export const briefs = pgTable(
  "briefs",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    forDate: date("for_date").notNull(),
    metrics: jsonb("metrics").notNull(),
    narrative: jsonb("narrative").notNull(),
    scriptHi: text("script_hi").notNull(),
    scriptEn: text("script_en").notNull(),
    delivered: jsonb("delivered").default({}).notNull(),
    callId: uuid("call_id").references(() => calls.id),
  },
  (t) => [
    uniqueIndex("briefs_business_date_uq").on(t.businessId, t.forDate),
    index("briefs_call_idx").on(t.callId),
  ],
);
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id").references(() => businesses.id),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 18,
      scale: 9,
    }),
    pricingSource: text("pricing_source"),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    features: text("features").array().notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    index("llm_calls_business_idx").on(t.businessId),
    index("llm_calls_task_at_idx").on(t.task, t.at),
  ],
);
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ...audit(),
    businessId: uuid("business_id").references(() => businesses.id),
    legacyId: uuid("legacy_id"),
    type: text("type").notNull(),
    entityId: text("entity_id"),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    index("events_business_idx").on(t.businessId),
    index("events_id_desc_idx").on(t.id.desc()),
    uniqueIndex("events_legacy_id_uq").on(t.legacyId),
    index("events_created_at_idx").on(t.createdAt),
    index("events_debtor_idx").on(t.debtorId, t.id.desc()),
    index("events_call_idx").on(t.callId),
  ],
);

/**
 * Mirror of Supabase `auth.users`. Chase never stores passwords: identity,
 * password hashing, OAuth and email verification all live in Supabase Auth, and
 * this row is upserted from the verified JWT on each sign-in so that application
 * tables can carry real foreign keys to a user.
 */
export const appUsers = pgTable(
  "app_users",
  {
    // Deliberately not defaultRandom(): the id is the Supabase auth user id.
    id: uuid("id").primaryKey(),
    ...audit(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [uniqueIndex("app_users_email_uq").on(t.email)],
);

/** Which users may act inside which workspace, and with what authority. */
export const orgMembers = pgTable(
  "org_members",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: memberRole("role").default("operator").notNull(),
    status: memberStatus("status").default("active").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => appUsers.id),
    lastActiveAt: ts("last_active_at"),
  },
  (t) => [
    uniqueIndex("org_members_business_user_uq").on(t.businessId, t.userId),
    index("org_members_user_idx").on(t.userId, t.status),
    index("org_members_business_role_idx").on(t.businessId, t.role),
  ],
);

/** Pending teammate invitations. Only the SHA-256 of the token is stored. */
export const orgInvites = pgTable(
  "org_invites",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").default("operator").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => appUsers.id),
    acceptedAt: ts("accepted_at"),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => appUsers.id),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("org_invites_token_uq").on(t.tokenHash),
    index("org_invites_business_idx").on(t.businessId),
    uniqueIndex("org_invites_pending_uq")
      .on(t.businessId, t.email)
      .where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
  ],
);

/**
 * One-time codes used to prove that a workspace controls the number it wants
 * Chase to call (the owner's own phone, or a nominated test number).
 */
export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    purpose: verificationPurpose("purpose").default("owner_phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    verifiedAt: ts("verified_at"),
    requestedByUserId: uuid("requested_by_user_id").references(
      () => appUsers.id,
    ),
  },
  (t) => [
    index("phone_verifications_business_idx").on(t.businessId, t.phoneE164),
    index("phone_verifications_expiry_idx").on(t.expiresAt),
    check(
      "phone_verification_e164",
      sql`${t.phoneE164} ~ '^[+][1-9][0-9]{6,14}$'`,
    ),
    check("phone_verification_attempts", sql`${t.attempts} >= 0`),
  ],
);

/**
 * The paid relationship between a workspace and Dodo Payments.
 *
 * One row per Dodo subscription. A workspace may accumulate historical rows
 * (cancelled, expired) and at most one that is currently billable; the partial
 * unique index below is what enforces "at most one live subscription" in the
 * database rather than in application code.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    ...audit(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    tier: billingTier("tier").notNull(),
    interval: billingInterval("interval").notNull(),
    status: subscriptionStatus("status").default("pending").notNull(),
    /** Dodo subscription id, absent until checkout completes. */
    dodoSubscriptionId: text("dodo_subscription_id"),
    dodoCustomerId: text("dodo_customer_id"),
    dodoProductId: text("dodo_product_id").notNull(),
    /** Checkout session that created this row; how a pending row is reconciled. */
    checkoutSessionId: text("checkout_session_id"),
    /** Recurring pre-tax amount in the currency's lowest denomination. */
    amountMinor: paise("amount_minor"),
    currency: text("currency").default("INR").notNull(),
    currentPeriodEnd: ts("current_period_end"),
    /** Ignore delayed webhooks older than the latest state already applied. */
    lastDodoEventAt: ts("last_dodo_event_at"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end")
      .default(false)
      .notNull(),
    trialEndsAt: ts("trial_ends_at"),
    cancelledAt: ts("cancelled_at"),
    startedByUserId: uuid("started_by_user_id").references(() => appUsers.id),
  },
  (t) => [
    index("subscriptions_business_idx").on(t.businessId, t.status),
    uniqueIndex("subscriptions_dodo_id_uq").on(t.dodoSubscriptionId),
    uniqueIndex("subscriptions_checkout_uq").on(t.checkoutSessionId),
    // A workspace can hold only one subscription that still grants entitlement.
    uniqueIndex("subscriptions_live_uq")
      .on(t.businessId)
      .where(sql`${t.status} IN ('active', 'past_due')`),
    check(
      "subscription_amount_nonnegative",
      sql`${t.amountMinor} IS NULL OR ${t.amountMinor} >= 0`,
    ),
    check("subscription_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/**
 * Every verified billing webhook, stored before it is acted on.
 *
 * `dodoWebhookId` is the Standard Webhooks `webhook-id` header and is unique, so
 * a redelivery (Dodo retries up to eight times) cannot apply an effect twice.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: id(),
    ...audit(),
    /** Null when the payload could not be attributed to a known workspace. */
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    dodoWebhookId: text("dodo_webhook_id").notNull(),
    type: text("type").notNull(),
    payloadType: text("payload_type"),
    dodoSubscriptionId: text("dodo_subscription_id"),
    occurredAt: ts("occurred_at").notNull(),
    payload: jsonb("payload").notNull(),
    handledAt: ts("handled_at"),
    /** Set when the event verified but could not be applied; kept for triage. */
    error: text("error"),
  },
  (t) => [
    uniqueIndex("billing_events_webhook_uq").on(t.dodoWebhookId),
    index("billing_events_business_idx").on(t.businessId, t.occurredAt),
    index("billing_events_subscription_idx").on(t.dodoSubscriptionId),
  ],
);

/**
 * "Talk to us" submissions for the Enterprise tier. Enterprise is deliberately
 * sales-assisted: there is no self-serve checkout, so this is the only way that
 * tier starts.
 */
export const enterpriseLeads = pgTable(
  "enterprise_leads",
  {
    id: id(),
    ...audit(),
    /** Null when submitted from the public pricing page by a visitor. */
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => appUsers.id),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phoneE164: text("phone_e164"),
    seats: integer("seats"),
    monthlyVolume: text("monthly_volume"),
    message: text("message"),
    status: enterpriseLeadStatus("status").default("new").notNull(),
  },
  (t) => [
    index("enterprise_leads_status_idx").on(t.status, t.createdAt),
    index("enterprise_leads_business_idx").on(t.businessId),
    check("enterprise_lead_email", sql`position('@' in ${t.email}) > 1`),
    check(
      "enterprise_lead_phone",
      sql`${t.phoneE164} IS NULL OR ${t.phoneE164} ~ '^[+][1-9][0-9]{6,14}$'`,
    ),
    check("enterprise_lead_seats", sql`${t.seats} IS NULL OR ${t.seats} > 0`),
  ],
);
