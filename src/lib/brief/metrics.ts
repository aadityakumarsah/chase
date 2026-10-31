import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
import { addIstDays, istDay, istInstant } from "@/lib/time";
import { BriefMetricsSchema, type BriefMetrics } from "./types";

const inputSchema = z.object({
  date: z.iso.date().optional(),
  businessId: z.uuid().optional(),
  now: z.date().optional(),
});
const number = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => String(value ?? "0");
const rate = (connected: number, attempted: number) =>
  attempted ? Math.round((connected / attempted) * 1000) / 10 : 0;

type Row = Record<string, unknown>;

/** All brief figures are deterministic database facts scoped to one IST day. */
export async function getBriefMetrics(
  input: z.input<typeof inputSchema> = {},
): Promise<BriefMetrics> {
  const parsed = inputSchema.parse(input);
  const forDate = parsed.date ?? istDay(parsed.now ?? new Date());
  // Multi-tenant: the brief always belongs to an explicit workspace. Falling back
  // to "the first business" would silently report another tenant's money.
  if (!parsed.businessId)
    throw new Error("businessId is required to generate a brief");
  const [business] = await getDb()
    .select()
    .from(businesses)
    .where(eq(businesses.id, parsed.businessId));
  if (!business) throw new Error("Workspace not found");

  const sql = getSql();
  const dayStart = istInstant(forDate, "00:00").toISOString();
  const dayEnd = istInstant(addIstDays(forDate, 1), "00:00").toISOString();
  const lookbackStart = istInstant(
    addIstDays(forDate, -13),
    "00:00",
  ).toISOString();
  const historyStart = istInstant(
    addIstDays(forDate, -6),
    "00:00",
  ).toISOString();
  const forecastEnd = addIstDays(forDate, 7);

  const [
    mainRows,
    gateRows,
    supervisorRows,
    postCallRows,
    brokenRows,
    queueRows,
    hourRows,
    languageRows,
    qualityRows,
    themeRows,
    historyRows,
  ] = (await Promise.all([
    sql`
      select
        (select count(*)::int from calls where business_id=${business.id} and purpose='collection' and created_at>=${dayStart} and created_at<${dayEnd}) calls_attempted,
        (select count(*)::int from calls where business_id=${business.id} and purpose='collection' and connected and created_at>=${dayStart} and created_at<${dayEnd}) calls_connected,
        (select count(*)::int from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.created_at>=${dayStart} and p.created_at<${dayEnd}) promised_count,
        coalesce((select sum(p.amount_paise) from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.created_at>=${dayStart} and p.created_at<${dayEnd}),0)::text promised_amount,
        (select count(*)::int from payments p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.received_at>=${dayStart} and p.received_at<${dayEnd}) collected_count,
        coalesce((select sum(p.amount_paise) from payments p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.received_at>=${dayStart} and p.received_at<${dayEnd}),0)::text collected_amount,
        coalesce((select sum(p.amount_paise) from payments p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.source='simulated' and p.received_at>=${dayStart} and p.received_at<${dayEnd}),0)::text simulated_collected,
        (select count(*)::int from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='kept') due_kept_count,
        coalesce((select sum(p.amount_paise) from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='kept'),0)::text due_kept_amount,
        (select count(*)::int from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='partially_kept') due_partial_count,
        coalesce((select sum(p.amount_paise) from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='partially_kept'),0)::text due_partial_amount,
        (select count(*)::int from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='broken') due_broken_count,
        coalesce((select sum(p.amount_paise) from promises p join debtors d on d.id=p.debtor_id where d.business_id=${business.id} and p.promised_for=${forDate}::date and p.status='broken'),0)::text due_broken_amount,
        coalesce((
          select sum(round(p.amount_paise * coalesce(r.p_pay_7d,0)))::bigint
          from promises p
          join debtors d on d.id=p.debtor_id
          left join lateral (
            select cr.p_pay_7d from chase_ratings cr where cr.debtor_id=p.debtor_id
            order by cr.computed_at desc, cr.id desc limit 1
          ) r on true
          where d.business_id=${business.id} and p.status='pending'
            and p.promised_for>=${forDate}::date and p.promised_for<${forecastEnd}::date
        ),0)::text forecast_7d,
        (select count(*)::int from compliance_events ce join debtors d on d.id=ce.debtor_id where d.business_id=${business.id} and ce.kind='dispute_hold' and ce.at>=${dayStart} and ce.at<${dayEnd}) new_disputes,
        (select count(*)::int from opt_outs o join debtors d on d.id=o.debtor_id where d.business_id=${business.id} and o.at>=${dayStart} and o.at<${dayEnd}) opt_outs,
        (select count(*)::int from compliance_events ce left join debtors d on d.id=ce.debtor_id left join calls cc on cc.id=ce.call_id where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id})) and ce.kind='gate_blocked' and ce.at>=${dayStart} and ce.at<${dayEnd}) gate_blocks_total,
        (select count(*)::int from compliance_events ce left join debtors d on d.id=ce.debtor_id left join calls cc on cc.id=ce.call_id where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id})) and ce.kind in ('supervisor_flag','supervisor_rewrite') and ce.at>=${dayStart} and ce.at<${dayEnd}) supervisor_total,
        (select count(*)::int from compliance_events ce left join debtors d on d.id=ce.debtor_id left join calls cc on cc.id=ce.call_id where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id})) and ce.kind='post_call_flag' and ce.at>=${dayStart} and ce.at<${dayEnd}) post_call_total
    `,
    sql`
      select trim(part) rule, count(*)::int count
      from compliance_events ce
      left join debtors d on d.id=ce.debtor_id
      left join calls cc on cc.id=ce.call_id
      cross join lateral regexp_split_to_table(ce.rule, ',') part
      where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id})) and ce.kind='gate_blocked'
        and ce.at>=${dayStart} and ce.at<${dayEnd}
      group by trim(part) order by count(*) desc, trim(part)
    `,
    sql`
      select ce.rule, count(*)::int count from compliance_events ce
      left join debtors d on d.id=ce.debtor_id
      left join calls cc on cc.id=ce.call_id
      where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id}))
        and ce.kind in ('supervisor_flag','supervisor_rewrite') and ce.at>=${dayStart} and ce.at<${dayEnd}
      group by ce.rule order by count(*) desc, ce.rule
    `,
    sql`
      select ce.rule, count(*)::int count from compliance_events ce
      left join debtors d on d.id=ce.debtor_id
      left join calls cc on cc.id=ce.call_id
      where (d.business_id=${business.id} or cc.business_id=${business.id} or (ce.debtor_id is null and ce.call_id is null and ce.detail->>'businessId'=${business.id}))
        and ce.kind='post_call_flag' and ce.at>=${dayStart} and ce.at<${dayEnd}
      group by ce.rule order by count(*) desc, ce.rule
    `,
    sql`
      select p.debtor_id, d.shop_name, p.amount_paise::text amount_paise,
        greatest(0, ${forDate}::date-p.promised_for)::int days_late
      from promises p join debtors d on d.id=p.debtor_id
      where d.business_id=${business.id} and p.status='broken' and p.promised_for<=${forDate}::date
      order by days_late desc, p.amount_paise desc, d.shop_name limit 5
    `,
    sql`
      with ranked as (
        select distinct on (cr.debtor_id) cr.debtor_id, cr.score, cr.next_action
        from chase_ratings cr order by cr.debtor_id, cr.computed_at desc, cr.id desc
      )
      select r.debtor_id, d.shop_name, r.score, r.next_action
      from ranked r join debtors d on d.id=r.debtor_id
      where d.business_id=${business.id} and r.score is not null and d.status not in ('paid','do_not_contact','wrong_number','dispute')
      order by r.score desc, d.shop_name limit 10
    `,
    sql`
      select extract(hour from coalesce(c.started_at,c.created_at) at time zone 'Asia/Kolkata')::int hour_bucket,
        count(*)::int attempted, count(*) filter (where c.connected)::int connected
      from calls c where c.business_id=${business.id} and c.purpose='collection'
        and c.created_at>=${lookbackStart} and c.created_at<${dayEnd}
      group by 1 order by 1
    `,
    sql`
      select coalesce(c.language,d.preferred_language)::text language,
        count(*)::int attempted, count(*) filter (where c.connected)::int connected
      from calls c join debtors d on d.id=c.debtor_id
      where c.business_id=${business.id} and c.purpose='collection'
        and c.created_at>=${lookbackStart} and c.created_at<${dayEnd}
      group by 1 order by 1
    `,
    sql`
      select count(*) filter (where c.analysis #>> '{agent_quality,score}' ~ '^[1-5]$')::int scored,
        avg((c.analysis #>> '{agent_quality,score}')::numeric) filter (where c.analysis #>> '{agent_quality,score}' ~ '^[1-5]$') average
      from calls c where c.business_id=${business.id} and c.purpose='collection'
        and c.created_at>=${dayStart} and c.created_at<${dayEnd}
    `,
    sql`
      select trim(c.analysis #>> '{agent_quality,failed}') theme, count(*)::int count
      from calls c where c.business_id=${business.id} and c.purpose='collection'
        and c.created_at>=${dayStart} and c.created_at<${dayEnd}
        and nullif(trim(c.analysis #>> '{agent_quality,failed}'),'') is not null
      group by 1 order by count(*) desc, theme limit 1
    `,
    sql`
      with facts as (
        select (p.created_at at time zone 'Asia/Kolkata')::date day_bucket, sum(p.amount_paise)::bigint promised, 0::bigint collected
        from promises p join debtors d on d.id=p.debtor_id
        where d.business_id=${business.id} and p.created_at>=${historyStart} and p.created_at<${dayEnd}
        group by 1
        union all
        select (p.received_at at time zone 'Asia/Kolkata')::date day_bucket, 0::bigint promised, sum(p.amount_paise)::bigint collected
        from payments p join debtors d on d.id=p.debtor_id
        where d.business_id=${business.id} and p.received_at>=${historyStart} and p.received_at<${dayEnd}
        group by 1
      ) select day_bucket::text, sum(promised)::text promised, sum(collected)::text collected from facts group by day_bucket order by day_bucket
    `,
  ])) as unknown as Row[][];

  const main = mainRows[0] ?? {};
  const attempted = number(main.calls_attempted);
  const connected = number(main.calls_connected);
  const hourMap = new Map(
    hourRows.map((row) => [number(row.hour_bucket), row]),
  );
  const languageMap = new Map(
    languageRows.map((row) => [String(row.language), row]),
  );
  const historyMap = new Map(
    historyRows.map((row) => [String(row.day_bucket), row]),
  );
  const byRule = (rows: Row[]) =>
    rows.map((row) => ({ rule: String(row.rule), count: number(row.count) }));
  const quality = qualityRows[0] ?? {};
  const theme = themeRows[0];

  return BriefMetricsSchema.parse({
    businessId: business.id,
    date: forDate,
    timezone: "Asia/Kolkata",
    calls: { attempted, connected, connectRate: rate(connected, attempted) },
    promisedToday: {
      count: number(main.promised_count),
      amountPaise: money(main.promised_amount),
    },
    collectedToday: {
      count: number(main.collected_count),
      amountPaise: money(main.collected_amount),
      simulatedAmountPaise: money(main.simulated_collected),
    },
    promisesDueToday: {
      kept: {
        count: number(main.due_kept_count),
        amountPaise: money(main.due_kept_amount),
      },
      partiallyKept: {
        count: number(main.due_partial_count),
        amountPaise: money(main.due_partial_amount),
      },
      broken: {
        count: number(main.due_broken_count),
        amountPaise: money(main.due_broken_amount),
      },
    },
    forecast7dPaise: money(main.forecast_7d),
    compliance: {
      newDisputes: number(main.new_disputes),
      optOuts: number(main.opt_outs),
      gateBlocks: {
        total: number(main.gate_blocks_total),
        byRule: byRule(gateRows),
      },
      supervisorFlags: {
        total: number(main.supervisor_total),
        byRule: byRule(supervisorRows),
      },
      postCallFlags: {
        total: number(main.post_call_total),
        byRule: byRule(postCallRows),
      },
    },
    brokenPromises: brokenRows.map((row) => ({
      debtorId: String(row.debtor_id),
      shop: String(row.shop_name),
      amountPaise: money(row.amount_paise),
      daysLate: number(row.days_late),
    })),
    tomorrowQueue: queueRows.map((row) => ({
      debtorId: String(row.debtor_id),
      shop: String(row.shop_name),
      score: number(row.score),
      nextAction: String(row.next_action),
    })),
    connectRateByHour: Array.from({ length: 24 }, (_, hour) => {
      const row = hourMap.get(hour);
      const bucketAttempted = number(row?.attempted);
      const bucketConnected = number(row?.connected);
      return {
        hour,
        attempted: bucketAttempted,
        connected: bucketConnected,
        rate: rate(bucketConnected, bucketAttempted),
      };
    }),
    connectRateByLanguage: (["hi", "en", "mr"] as const).map((language) => {
      const row = languageMap.get(language);
      const bucketAttempted = number(row?.attempted);
      const bucketConnected = number(row?.connected);
      return {
        language,
        attempted: bucketAttempted,
        connected: bucketConnected,
        rate: rate(bucketConnected, bucketAttempted),
      };
    }),
    agentQuality: {
      averageScore:
        quality.average == null
          ? null
          : Math.round(number(quality.average) * 100) / 100,
      scoredCalls: number(quality.scored),
      mostCommonFailedTheme: theme ? String(theme.theme) : null,
      themeCount: number(theme?.count),
    },
    last7Days: Array.from({ length: 7 }, (_, index) => {
      const date = addIstDays(forDate, index - 6);
      const row = historyMap.get(date);
      return {
        date,
        promisedPaise: money(row?.promised),
        collectedPaise: money(row?.collected),
      };
    }),
  });
}

export async function ownerSummariesForDay(metrics: BriefMetrics) {
  const start = istInstant(metrics.date, "00:00").toISOString();
  const end = istInstant(addIstDays(metrics.date, 1), "00:00").toISOString();
  const rows = (await getSql()`
    select d.id debtor_id, d.shop_name, c.analysis #>> '{owner_summary}' owner_summary
    from calls c join debtors d on d.id=c.debtor_id
    where c.business_id=${metrics.businessId} and c.purpose='collection'
      and c.created_at>=${start} and c.created_at<${end}
      and nullif(c.analysis #>> '{owner_summary}','') is not null
    order by c.created_at desc, c.id
  `) as unknown as Row[];
  return rows.map((row) => ({
    debtor_id: String(row.debtor_id),
    shop: String(row.shop_name),
    summary: String(row.owner_summary),
  }));
}
