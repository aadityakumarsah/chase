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
    name: text("name").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    upiVpa: text("upi_vpa"),
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
  },
  (t) => [
    uniqueIndex("debtors_business_phone_uq").on(t.businessId, t.phoneE164),
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
    agentKey: agentKey("agent_key").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    protectedHash: text("protected_hash").notNull(),
    createdBy: promptCreator("created_by").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").default(false).notNull(),
  },
  (t) => [
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
    language: language("language"),
    promptVersionId: uuid("prompt_version_id").references(
      () => promptVersions.id,
    ),
    raw: jsonb("raw"),
    analysis: jsonb("analysis"),
    analysisModel: text("analysis_model"),
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
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
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
    uniqueIndex("payment_links_token_uq").on(t.token),
    index("payment_links_debtor_idx").on(t.debtorId),
    index("payment_links_call_idx").on(t.callId),
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
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    paymentLinkId: uuid("payment_link_id").references(() => paymentLinks.id),
    amountPaise: paise("amount_paise").notNull(),
    method: paymentMethod("method").notNull(),
    providerRef: text("provider_ref"),
    receivedAt: ts("received_at").notNull(),
    source: paymentSource("source").notNull(),
  },
  (t) => [
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
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id),
    idx: integer("idx").notNull(),
    speaker: callSpeaker("speaker").notNull(),
    text: text("text").notNull(),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("call_turns_call_idx_uq").on(t.callId, t.idx),
    check("turn_idx_nonnegative", sql`${t.idx} >= 0`),
  ],
);
export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: id(),
    ...audit(),
    callId: uuid("call_id").references(() => calls.id),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => debtors.id),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").notNull(),
    result: jsonb("result"),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    index("tool_invocations_call_idx").on(t.callId),
    index("tool_invocations_debtor_idx").on(t.debtorId),
    uniqueIndex("tool_invocations_idempotency_uq").on(t.idempotencyKey),
  ],
);
export const messages = pgTable(
  "messages",
  {
    id: id(),
    ...audit(),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    toE164: text("to_e164").notNull(),
    channel: messageChannel("channel").notNull(),
    direction: messageDirection("direction").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    body: text("body").notNull(),
    status: messageStatus("status").default("queued").notNull(),
    error: text("error"),
  },
  (t) => [
    index("messages_debtor_created_idx").on(t.debtorId, t.createdAt),
    index("messages_call_idx").on(t.callId),
    index("messages_provider_id_idx").on(t.provider, t.providerMessageId),
  ],
);
export const contactDossiers = pgTable(
  "contact_dossiers",
  {
    id: id(),
    ...audit(),
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
    uniqueIndex("dossiers_debtor_uq").on(t.debtorId),
    check("dossier_length", sql`char_length(${t.text}) <= 600`),
  ],
);
export const chaseRatings = pgTable(
  "chase_ratings",
  {
    id: id(),
    ...audit(),
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
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    kind: complianceKind("kind").notNull(),
    rule: text("rule").notNull(),
    detail: jsonb("detail").notNull(),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
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
  (t) => [index("opt_outs_debtor_active_idx").on(t.debtorId, t.clearedAt)],
);
export const promptPrs = pgTable(
  "prompt_prs",
  {
    id: id(),
    ...audit(),
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
    index("prompt_prs_base_idx").on(t.baseVersionId),
    index("prompt_prs_agent_status_idx").on(t.agentKey, t.status),
    check("prompt_pr_confidence", sql`${t.confidence} BETWEEN 0 AND 1`),
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
  (t) => [index("llm_calls_task_at_idx").on(t.task, t.at)],
);
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ...audit(),
    legacyId: uuid("legacy_id"),
    type: text("type").notNull(),
    entityId: text("entity_id"),
    debtorId: uuid("debtor_id").references(() => debtors.id),
    callId: uuid("call_id").references(() => calls.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    at: ts("at").defaultNow().notNull(),
  },
  (t) => [
    index("events_id_desc_idx").on(t.id.desc()),
    uniqueIndex("events_legacy_id_uq").on(t.legacyId),
    index("events_created_at_idx").on(t.createdAt),
    index("events_debtor_idx").on(t.debtorId, t.id.desc()),
    index("events_call_idx").on(t.callId),
  ],
);
