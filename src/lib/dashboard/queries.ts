import { desc, eq, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { evaluateContact } from "@/lib/compliance/gate";
import { explainRating, type RatingResult } from "@/lib/chase/rating";
import { getDb, getSql } from "@/lib/db";
import {
  businesses,
  calls,
  complianceEvents,
  contactDossiers,
  debtors,
  events,
  invoices,
  llmCalls,
  messages,
  optOuts,
  payments,
  promises,
  toolInvocations,
} from "@/lib/db/schema";
import { configReport, getEnv } from "@/lib/env";
import { istDay, istInstant } from "@/lib/time";
import type {
  DashboardEvent,
  DashboardSummary,
  LiveCall,
  QueueItem,
} from "./types";

const asInt = (value: unknown) => Number(value ?? 0);
const asMoney = (value: unknown) => String(value ?? "0");
const asDate = (value: Date | string | null) =>
  value == null ? null : value instanceof Date ? value : new Date(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type QueueDbRow = {
  debtor_id: string;
  shop_name: string;
  contact_name: string;
  phone_e164: string;
  preferred_language: "hi" | "en" | "mr";
  status: string;
  first_contact_disclosed_at: Date | string | null;
  business_id: string;
  call_window_start: string;
  call_window_end: string;
  max_attempts_per_day: number;
  max_attempts_per_week: number;
  min_gap_hours: number;
  demo_window_override: boolean;
  outstanding_paise: string;
  days_past_due: number;
  score: number | null;
  previous_score: number | null;
  band: "A" | "B" | "C" | "D" | "X";
  p_pay_7d: string | null;
  components: Record<string, number> | null;
  next_action: string;
  reasons: string[] | null;
  rationale: string;
  attempts_today: number;
  attempts_week: number;
  last_attempt_at: Date | string | null;
  opted_out: boolean;
  active_promise_for: string | null;
};

/** One ranked query supplies every gate feature, avoiding per-debtor lookups. */
export async function dashboardQueue(now = new Date()): Promise<QueueItem[]> {
  const client = getSql();
  const today = istDay(now);
  const dayStart = istInstant(today, "00:00").toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const rows = (await client`
    with rating_ranked as (
      select r.*, row_number() over (partition by debtor_id order by computed_at desc, id desc) rn
      from chase_ratings r
    ), invoice_totals as (
      select debtor_id,
        coalesce(sum(amount_paise-paid_paise) filter (where status not in ('paid','written_off')),0)::text outstanding_paise,
        greatest(0, coalesce((${today}::date - min(due_on) filter (where status not in ('paid','written_off'))),0))::int days_past_due
      from invoices group by debtor_id
    ), attempts as (
      select debtor_id,
        count(*) filter (where created_at >= ${dayStart})::int attempts_today,
        count(*) filter (where created_at >= ${weekStart})::int attempts_week,
        max(created_at) last_attempt_at
      from calls where purpose='collection' group by debtor_id
    ), active_promises as (
      select distinct on (debtor_id) debtor_id, promised_for
      from promises where status='pending' and promised_for >= ${today}
      order by debtor_id, promised_for
    ), active_optouts as (
      select debtor_id, true opted_out from opt_outs where cleared_at is null group by debtor_id
    )
    select d.id debtor_id, d.shop_name, d.contact_name, d.phone_e164,
      d.preferred_language, d.status, d.first_contact_disclosed_at,
      b.id business_id, b.call_window_start::text, b.call_window_end::text,
      b.max_attempts_per_day, b.max_attempts_per_week, b.min_gap_hours, b.demo_window_override,
      coalesce(i.outstanding_paise,'0') outstanding_paise, coalesce(i.days_past_due,0) days_past_due,
      r.score, prev.score previous_score, coalesce(r.band,'X') band, r.p_pay_7d,
      coalesce(r.components,'{}'::jsonb) components, coalesce(r.next_action,'none') next_action,
      coalesce(r.reasons,'[]'::jsonb) reasons, coalesce(r.rationale,'Not rated yet') rationale,
      coalesce(a.attempts_today,0) attempts_today, coalesce(a.attempts_week,0) attempts_week,
      a.last_attempt_at, coalesce(o.opted_out,false) opted_out, p.promised_for::text active_promise_for
    from debtors d
    join businesses b on b.id=d.business_id
    left join rating_ranked r on r.debtor_id=d.id and r.rn=1
    left join rating_ranked prev on prev.debtor_id=d.id and prev.rn=2
    left join invoice_totals i on i.debtor_id=d.id
    left join attempts a on a.debtor_id=d.id
    left join active_promises p on p.debtor_id=d.id
    left join active_optouts o on o.debtor_id=d.id
    order by r.score desc nulls last, d.shop_name
  `) as unknown as QueueDbRow[];
  const env = getEnv();
  return rows.map((row, index) => {
    const decision = evaluateContact({
      purpose: "collection",
      debtor: {
        status: row.status,
        firstContactDisclosedAt: asDate(row.first_contact_disclosed_at),
      },
      business: {
        callWindowStart: row.call_window_start,
        callWindowEnd: row.call_window_end,
        maxAttemptsPerDay: row.max_attempts_per_day,
        maxAttemptsPerWeek: row.max_attempts_per_week,
        minGapHours: row.min_gap_hours,
      },
      now,
      toNumber: row.phone_e164,
      attemptsToday: row.attempts_today,
      attemptsThisWeek: row.attempts_week,
      lastAttemptAt: asDate(row.last_attempt_at),
      optedOut: row.opted_out,
      disputeOpen: row.status === "dispute",
      hardship: row.status === "hardship",
      activePromise: row.active_promise_for
        ? { date: row.active_promise_for }
        : null,
      demoMode: env.DEMO_MODE,
      allowlist: env.CALL_ALLOWLIST,
      demoOverride: row.demo_window_override,
    });
    return {
      rank: index + 1,
      debtorId: row.debtor_id,
      shopName: row.shop_name,
      contactName: row.contact_name,
      language: row.preferred_language,
      status: row.status,
      outstandingPaise: row.outstanding_paise,
      daysPastDue: row.days_past_due,
      score: row.score,
      scoreDelta:
        row.score == null || row.previous_score == null
          ? 0
          : row.score - row.previous_score,
      band: row.band,
      pPay7d: row.p_pay_7d == null ? null : Number(row.p_pay_7d),
      components: row.components ?? {},
      nextAction: row.next_action,
      reasons: row.reasons ?? [],
      rationale: row.rationale,
      allowed: decision.allowed,
      rules: decision.rules,
      nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
      demoDebtor: Boolean(
        env.DEMO_DEBTOR_PHONE && row.phone_e164 === env.DEMO_DEBTOR_PHONE,
      ),
    };
  });
}

async function eventRows(
  options: {
    callId?: string;
    debtorId?: string;
    after?: bigint;
    limit?: number;
  } = {},
) {
  const db = getDb();
  const filters = [];
  if (options.callId) filters.push(dsql`${events.callId}=${options.callId}`);
  if (options.debtorId)
    filters.push(dsql`${events.debtorId}=${options.debtorId}`);
  if (options.after) filters.push(dsql`${events.id}>${options.after}`);
  const rows = await db
    .select({ event: events, shopName: debtors.shopName })
    .from(events)
    .leftJoin(debtors, eq(debtors.id, events.debtorId))
    .where(filters.length ? dsql.join(filters, dsql` and `) : undefined)
    .orderBy(options.after ? events.id : desc(events.id))
    .limit(options.limit ?? 80);
  return rows.map(({ event, shopName }): DashboardEvent => ({
    id: event.id.toString(),
    type: event.type,
    debtorId: event.debtorId,
    callId: event.callId,
    shopName,
    payload: event.payload,
    at: event.at.toISOString(),
  }));
}

export async function dashboardEvents(
  options: {
    after?: string;
    limit?: number;
    callId?: string;
    debtorId?: string;
  } = {},
) {
  return eventRows({
    ...options,
    after: options.after ? BigInt(options.after) : undefined,
  });
}

function ratingExplanation(
  rating: {
    score: number | null;
    band: "A" | "B" | "C" | "D" | "X";
    pPay7d: string | null;
    components: unknown;
    nextAction: string;
    reasons: string[];
  } | null,
) {
  if (!rating) return null;
  const components = record(rating.components);
  return explainRating({
    score: rating.score,
    band: rating.band,
    p_pay_7d: rating.pPay7d == null ? null : Number(rating.pPay7d),
    components: {
      A: Number(components.A ?? 0),
      U: Number(components.U ?? 0),
      E: Number(components.E ?? 1),
      raw: Number(components.raw ?? 0),
    },
    next_action: rating.nextAction as RatingResult["next_action"],
    reasons: rating.reasons,
  });
}

async function liveCall(): Promise<LiveCall | null> {
  const db = getDb();
  const [row] = await db
    .select({
      call: calls,
      shopName: debtors.shopName,
      contactName: debtors.contactName,
    })
    .from(calls)
    .innerJoin(debtors, eq(debtors.id, calls.debtorId))
    .orderBy(
      dsql`case when ${calls.status} in ('queued','initiated','ringing','in-progress','in_progress','call-disconnected') then 0 else 1 end`,
      desc(calls.createdAt),
    )
    .limit(1);
  if (!row) return null;
  const [eventList, messageList, [link]] = await Promise.all([
    eventRows({ callId: row.call.id, limit: 50 }),
    db
      .select()
      .from(messages)
      .where(eq(messages.debtorId, row.call.debtorId))
      .orderBy(desc(messages.createdAt))
      .limit(20),
    db.query.paymentLinks.findMany({
      where: (table, { eq }) => eq(table.callId, row.call.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 1,
    }),
  ]);
  const analysis = record(row.call.analysis);
  return {
    id: row.call.id,
    debtorId: row.call.debtorId,
    shopName: row.shopName,
    contactName: row.contactName,
    status: row.call.status,
    connected: row.call.connected,
    startedAt: row.call.startedAt?.toISOString() ?? null,
    endedAt: row.call.endedAt?.toISOString() ?? null,
    transcript: row.call.transcript,
    recordingUrl: row.call.recordingUrl,
    ownerSummary:
      typeof analysis.owner_summary === "string"
        ? analysis.owner_summary
        : null,
    paymentToken: link?.token ?? null,
    paymentStatus: link?.status ?? null,
    events: eventList.reverse(),
    messages: messageList.reverse().map((message) => ({
      id: message.id,
      direction: message.direction,
      channel: message.channel,
      provider: message.provider,
      body: message.body,
      status: message.status,
      at: message.createdAt.toISOString(),
    })),
  };
}

export async function dashboardSummary(
  now = new Date(),
): Promise<DashboardSummary> {
  const db = getDb();
  const env = getEnv();
  const today = istDay(now);
  const start = istInstant(today, "00:00").toISOString();
  const [[business], metrics, [block], active] = await Promise.all([
    db.select().from(businesses).orderBy(businesses.createdAt).limit(1),
    getSql()`
      select
        coalesce((select sum(amount_paise-paid_paise) from invoices where status not in ('paid','written_off')),0)::text outstanding,
        (select count(distinct debtor_id)::int from invoices where status not in ('paid','written_off')) debtors,
        coalesce((select sum(amount_paise) from promises where promised_for=${today} and status='pending'),0)::text promised,
        coalesce((select sum(amount_paise) from payments where received_at>=${start}),0)::text collected,
        coalesce((select sum(amount_paise) from payments where received_at>=${start} and source='simulated'),0)::text simulated_collected,
        (select count(*)::int from calls where created_at>=${start} and purpose='collection') calls,
        (select count(*)::int from calls where created_at>=${start} and purpose='collection' and connected) connected,
        (select count(*)::int from compliance_events where at>=${start} and kind='gate_blocked') blocked,
        (select count(*)::int from opt_outs where at>=${start}) optouts
    `,
    db
      .select({ event: complianceEvents, shopName: debtors.shopName })
      .from(complianceEvents)
      .leftJoin(debtors, eq(debtors.id, complianceEvents.debtorId))
      .where(eq(complianceEvents.kind, "gate_blocked"))
      .orderBy(desc(complianceEvents.at))
      .limit(1),
    liveCall(),
  ]);
  if (!business)
    throw new Error("Seed a business before opening the dashboard");
  const metric =
    (metrics as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const attempted = asInt(metric.calls);
  return {
    business: {
      id: business.id,
      name: business.name,
      demoOverride: business.demoWindowOverride,
      window: `${business.callWindowStart.slice(0, 5)}–${business.callWindowEnd.slice(0, 5)} IST`,
    },
    meta: {
      demoMode: env.DEMO_MODE,
      agentMode: env.BOLNA_AGENT_MODE,
      llmProvider: env.LLM_PROVIDER,
      llmModel: env.LLM_MODEL_SMART,
      today,
    },
    kpis: {
      outstandingPaise: asMoney(metric.outstanding),
      debtorCount: asInt(metric.debtors),
      promisedTodayPaise: asMoney(metric.promised),
      collectedTodayPaise: asMoney(metric.collected),
      simulatedCollectedTodayPaise: asMoney(metric.simulated_collected),
      callsAttempted: attempted,
      callsConnected: asInt(metric.connected),
      connectRate: attempted
        ? Math.round((asInt(metric.connected) / attempted) * 100)
        : 0,
      blocked: asInt(metric.blocked),
      optOuts: asInt(metric.optouts),
    },
    liveCall: active,
    latestGateBlock: block
      ? {
          rule: block.event.rule,
          detail: record(block.event.detail),
          shopName: block.shopName,
          at: block.event.at.toISOString(),
        }
      : null,
  };
}

export const debtorFiltersSchema = z.object({
  band: z.string().max(2).optional(),
  language: z.enum(["hi", "en", "mr"]).optional(),
  status: z.string().max(40).optional(),
  action: z.string().max(80).optional(),
  search: z.string().max(100).optional(),
});

export async function debtorList(input: z.input<typeof debtorFiltersSchema>) {
  const filters = debtorFiltersSchema.parse(input);
  const needle = filters.search?.trim().toLocaleLowerCase();
  return (await dashboardQueue()).filter(
    (item) =>
      (!filters.band || item.band === filters.band) &&
      (!filters.language || item.language === filters.language) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.action || item.nextAction === filters.action) &&
      (!needle ||
        item.shopName.toLocaleLowerCase().includes(needle) ||
        item.contactName.toLocaleLowerCase().includes(needle)),
  );
}

export async function debtorDetail(id: string) {
  z.uuid().parse(id);
  const db = getDb();
  const [base] = await db
    .select({ debtor: debtors, business: businesses })
    .from(debtors)
    .innerJoin(businesses, eq(businesses.id, debtors.businessId))
    .where(eq(debtors.id, id));
  if (!base) return null;
  const [
    invoiceRows,
    ratingRows,
    [dossier],
    callRows,
    promiseRows,
    paymentRows,
    messageRows,
    complianceRows,
  ] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(eq(invoices.debtorId, id))
      .orderBy(desc(invoices.dueOn)),
    db.query.chaseRatings.findMany({
      where: (table, { eq }) => eq(table.debtorId, id),
      orderBy: (table, { desc }) => [desc(table.computedAt), desc(table.id)],
      limit: 50,
    }),
    db
      .select()
      .from(contactDossiers)
      .where(eq(contactDossiers.debtorId, id))
      .limit(1),
    db
      .select()
      .from(calls)
      .where(eq(calls.debtorId, id))
      .orderBy(desc(calls.createdAt))
      .limit(50),
    db
      .select()
      .from(promises)
      .where(eq(promises.debtorId, id))
      .orderBy(desc(promises.createdAt))
      .limit(50),
    db
      .select()
      .from(payments)
      .where(eq(payments.debtorId, id))
      .orderBy(desc(payments.receivedAt))
      .limit(50),
    db
      .select()
      .from(messages)
      .where(eq(messages.debtorId, id))
      .orderBy(desc(messages.createdAt))
      .limit(50),
    db
      .select()
      .from(complianceEvents)
      .where(eq(complianceEvents.debtorId, id))
      .orderBy(desc(complianceEvents.at))
      .limit(100),
  ]);
  const timeline = [
    ...callRows.map((item) => ({
      id: item.id,
      kind: "call",
      at: item.createdAt,
      title: `Call ${item.status}`,
      detail: item.terminationReason,
    })),
    ...promiseRows.map((item) => ({
      id: item.id,
      kind: "promise",
      at: item.createdAt,
      title: `Promise ${item.status}`,
      detail: `${item.amountPaise} paise · ${item.promisedFor}`,
    })),
    ...paymentRows.map((item) => ({
      id: item.id,
      kind: "payment",
      at: item.receivedAt,
      title: "Payment received",
      detail: `${item.amountPaise} paise · ${item.source}`,
    })),
    ...messageRows.map((item) => ({
      id: item.id,
      kind: "message",
      at: item.createdAt,
      title: `${item.direction === "out" ? "Sent" : "Received"} ${item.channel}`,
      detail: item.body,
    })),
    ...complianceRows.map((item) => ({
      id: item.id,
      kind: "compliance",
      at: item.at,
      title: item.kind,
      detail: item.rule,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 150)
    .map((item) => ({ ...item, at: item.at.toISOString() }));
  const latest = ratingRows[0] ?? null;
  return {
    debtor: {
      ...base.debtor,
      createdAt: base.debtor.createdAt.toISOString(),
      updatedAt: base.debtor.updatedAt.toISOString(),
      firstContactDisclosedAt:
        base.debtor.firstContactDisclosedAt?.toISOString() ?? null,
      lastInboundAt: base.debtor.lastInboundAt?.toISOString() ?? null,
    },
    business: { id: base.business.id, name: base.business.name },
    rating: latest
      ? {
          ...latest,
          pPay7d: latest.pPay7d == null ? null : Number(latest.pPay7d),
          computedAt: latest.computedAt.toISOString(),
          createdAt: latest.createdAt.toISOString(),
          updatedAt: latest.updatedAt.toISOString(),
        }
      : null,
    ratingExplanation: ratingExplanation(latest),
    ratingHistory: ratingRows
      .slice()
      .reverse()
      .map((item) => ({
        at: item.computedAt.toISOString(),
        score: item.score,
        band: item.band,
      })),
    invoices: invoiceRows.map((item) => ({
      ...item,
      amountPaise: item.amountPaise.toString(),
      paidPaise: item.paidPaise.toString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    dossier: dossier
      ? {
          ...dossier,
          createdAt: dossier.createdAt.toISOString(),
          updatedAt: dossier.updatedAt.toISOString(),
        }
      : null,
    calls: callRows.map((item) => ({
      id: item.id,
      status: item.status,
      connected: item.connected,
      durationSec: item.durationSec,
      createdAt: item.createdAt.toISOString(),
      startedAt: item.startedAt?.toISOString() ?? null,
      analysis: item.analysis,
    })),
    timeline,
  };
}

export async function callDetail(id: string) {
  z.uuid().parse(id);
  const db = getDb();
  const [row] = await db
    .select({ call: calls, debtor: debtors, business: businesses })
    .from(calls)
    .innerJoin(debtors, eq(debtors.id, calls.debtorId))
    .innerJoin(businesses, eq(businesses.id, calls.businessId))
    .where(eq(calls.id, id));
  if (!row) return null;
  const [tools, callEvents] = await Promise.all([
    getDb()
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.callId, id))
      .orderBy(toolInvocations.createdAt),
    eventRows({ callId: id, limit: 100 }),
  ]);
  return {
    call: {
      ...row.call,
      callToken: undefined,
      costCents: row.call.costCents?.toString() ?? null,
      createdAt: row.call.createdAt.toISOString(),
      updatedAt: row.call.updatedAt.toISOString(),
      startedAt: row.call.startedAt?.toISOString() ?? null,
      endedAt: row.call.endedAt?.toISOString() ?? null,
      processedAt: row.call.processedAt?.toISOString() ?? null,
      processingStartedAt: row.call.processingStartedAt?.toISOString() ?? null,
    },
    debtor: {
      id: row.debtor.id,
      shopName: row.debtor.shopName,
      contactName: row.debtor.contactName,
    },
    business: { id: row.business.id, name: row.business.name },
    tools: tools.map((tool) => ({
      ...tool,
      createdAt: tool.createdAt.toISOString(),
      updatedAt: tool.updatedAt.toISOString(),
    })),
    events: callEvents,
  };
}

export async function complianceDashboard() {
  const db = getDb();
  const [[business], ledger, activeStops, disputes] = await Promise.all([
    db.select().from(businesses).orderBy(businesses.createdAt).limit(1),
    db
      .select({ event: complianceEvents, shopName: debtors.shopName })
      .from(complianceEvents)
      .leftJoin(debtors, eq(debtors.id, complianceEvents.debtorId))
      .orderBy(desc(complianceEvents.at))
      .limit(250),
    db
      .select({ optOut: optOuts, shopName: debtors.shopName })
      .from(optOuts)
      .innerJoin(debtors, eq(debtors.id, optOuts.debtorId))
      .where(dsql`${optOuts.clearedAt} is null`)
      .orderBy(desc(optOuts.at)),
    db
      .select({
        id: debtors.id,
        shopName: debtors.shopName,
        status: debtors.status,
      })
      .from(debtors)
      .where(eq(debtors.status, "dispute")),
  ]);
  return {
    policy: business
      ? {
          window: `${business.callWindowStart.slice(0, 5)}–${business.callWindowEnd.slice(0, 5)} IST`,
          hardLimits: "08:00–19:00 IST",
          dailyCap: business.maxAttemptsPerDay,
          weeklyCap: business.maxAttemptsPerWeek,
          minGapHours: business.minGapHours,
          hardshipGapHours: 72,
        }
      : null,
    ledger: ledger.map(({ event, shopName }) => ({
      id: event.id,
      kind: event.kind,
      rule: event.rule,
      detail: event.detail,
      shopName,
      debtorId: event.debtorId,
      callId: event.callId,
      at: event.at.toISOString(),
    })),
    optOuts: activeStops.map(({ optOut, shopName }) => ({
      id: optOut.id,
      shopName,
      scope: optOut.scope,
      reason: optOut.reason,
      source: optOut.source,
      at: optOut.at.toISOString(),
    })),
    disputes,
  };
}

const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!
    : 0;

export async function aiOps() {
  const rows = await getDb()
    .select()
    .from(llmCalls)
    .orderBy(desc(llmCalls.at))
    .limit(5000);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.task}::${row.model}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const total = rows.length;
  const ok = rows.filter((row) => row.ok).length;
  const structured = rows.filter((row) =>
    row.features.some((feature) => /structured|json.schema/i.test(feature)),
  );
  const cacheReads = rows.reduce((sum, row) => sum + row.cacheReadTokens, 0);
  const cacheWrites = rows.reduce((sum, row) => sum + row.cacheWriteTokens, 0);
  const cost = rows.reduce(
    (sum, row) => sum + Number(row.estimatedCostUsd ?? 0),
    0,
  );
  return {
    totals: {
      calls: total,
      successRate: total ? Math.round((ok / total) * 1000) / 10 : 0,
      structuredSuccessRate: structured.length
        ? Math.round(
            (structured.filter((row) => row.ok).length / structured.length) *
              1000,
          ) / 10
        : 0,
      cacheReadTokens: cacheReads,
      cacheHitRate:
        cacheReads + cacheWrites
          ? Math.round((cacheReads / (cacheReads + cacheWrites)) * 1000) / 10
          : 0,
      fallbacks: rows.filter((row) =>
        row.features.some((feature) => /fallback/i.test(feature)),
      ).length,
      estimatedCostUsd: cost,
    },
    groups: [...groups.entries()].map(([key, calls]) => {
      const [task, model] = key.split("::");
      const latencies = calls
        .map((call) => call.latencyMs)
        .sort((a, b) => a - b);
      return {
        task,
        model,
        calls: calls.length,
        successRate:
          Math.round(
            (calls.filter((call) => call.ok).length / calls.length) * 1000,
          ) / 10,
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        cacheReadTokens: calls.reduce(
          (sum, call) => sum + call.cacheReadTokens,
          0,
        ),
      };
    }),
    techniques: {
      structuredOutputs: rows.filter(
        (row) =>
          ["call_analysis", "dossier", "brief", "prompt_pr"].includes(
            row.task,
          ) && row.ok,
      ).length,
      strictTools: rows.filter((row) =>
        row.features.some((feature) => /strict.tool/i.test(feature)),
      ).length,
      promptCaching: rows.filter((row) => row.cacheReadTokens > 0).length,
      routing: new Set(rows.map((row) => row.model)).size,
      supervisor: rows.filter((row) => row.task === "supervisor").length,
      evaluator: rows.filter((row) => row.task === "prompt_pr").length,
      personaSim: rows.filter(
        (row) => row.task === "persona_sim" || row.task === "sim_judge",
      ).length,
    },
  };
}

export async function settingsDashboard() {
  const env = getEnv();
  const db = getDb();
  const [syncRows, [webhook], [tool]] = await Promise.all([
    db
      .select({ payload: events.payload, at: events.at })
      .from(events)
      .where(eq(events.type, "agent.synced"))
      .orderBy(desc(events.at))
      .limit(20),
    db
      .select({ at: events.at, payload: events.payload })
      .from(events)
      .where(eq(events.type, "webhook.received"))
      .orderBy(desc(events.at))
      .limit(1),
    db
      .select({ name: toolInvocations.toolName, at: toolInvocations.createdAt })
      .from(toolInvocations)
      .orderBy(desc(toolInvocations.createdAt))
      .limit(1),
  ]);
  const syncByKey = new Map<string, string>();
  for (const row of syncRows) {
    const payload = record(row.payload);
    const key = typeof payload.agentKey === "string" ? payload.agentKey : null;
    if (key && !syncByKey.has(key)) syncByKey.set(key, row.at.toISOString());
  }
  return {
    config: configReport(env),
    appBaseUrl: env.APP_BASE_URL,
    agents: {
      collections: {
        id: env.BOLNA_COLLECTIONS_AGENT_ID ?? null,
        lastSyncedAt: syncByKey.get("collections") ?? null,
      },
      brief: {
        id: env.BOLNA_BRIEF_AGENT_ID ?? null,
        lastSyncedAt: syncByKey.get("brief") ?? null,
      },
    },
    lastWebhook: webhook
      ? { at: webhook.at.toISOString(), status: record(webhook.payload).status }
      : null,
    lastTool: tool ? { name: tool.name, at: tool.at.toISOString() } : null,
  };
}
