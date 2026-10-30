"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  BarChart3,
  Banknote,
  Lightbulb,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, inr, sentence } from "@/lib/dashboard/client";
import type {
  BriefDeliveryState,
  BriefMetrics,
  BriefNarrative,
} from "@/lib/brief/types";

type Brief = {
  id: string;
  forDate: string;
  metrics: BriefMetrics;
  narrative: BriefNarrative;
  delivered: BriefDeliveryState;
  callId: string | null;
  createdAt: string;
};
type Data = {
  brief: Brief | null;
  history: Array<{ id: string; forDate: string; headline: string }>;
};

export function BriefPage({ date }: { date?: string }) {
  const endpoint = date ? `/api/brief/${date}` : "/api/brief";
  const { data, mutate } = useSWR<Data>(endpoint, apiFetch, {
    refreshInterval: 10_000,
  });
  const [running, setRunning] = useState(false);
  const run = async (deliver: Array<"dashboard" | "call">) => {
    setRunning(true);
    try {
      const response = await fetch("/api/brief/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: date ?? "today", deliver }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Brief unavailable");
      toast.success(
        deliver.includes("call") ? "Owner brief call queued" : "Brief ready",
      );
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Brief unavailable");
    } finally {
      setRunning(false);
    }
  };
  if (!data)
    return (
      <main className="space-y-5 p-5 lg:p-8">
        <Skeleton className="h-24" />
        <Skeleton className="h-[620px]" />
      </main>
    );
  if (!data.brief)
    return (
      <main className="p-5 lg:p-8">
        <PageHeading
          eyebrow="Management intelligence"
          title="Daily brief"
          description="A verified view of cash, promises, risk and tomorrow’s queue."
        />
        <Card className="mt-6 border-dashed py-14 text-center shadow-none">
          <CardContent>
            <BarChart3 className="mx-auto mb-4 text-primary" />
            <h2 className="text-lg font-semibold">
              No brief has been generated yet
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate today’s brief from deterministic ledger facts and guarded
              Claude narrative.
            </p>
            <Button
              className="mt-5"
              disabled={running}
              onClick={() => void run(["dashboard"])}
            >
              {running ? "Generating…" : "Generate today’s brief"}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  const { brief } = data;
  const chart = brief.metrics.last7Days.map((day) => ({
    date: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(new Date(`${day.date}T12:00:00+05:30`)),
    promised: Number(day.promisedPaise) / 100,
    collected: Number(day.collectedPaise) / 100,
  }));
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          eyebrow={`${brief.forDate} · IST`}
          title="Daily management brief"
          description="Every figure comes from the deterministic daily metrics ledger."
        />
        <div className="flex items-center gap-2">
          {brief.delivered.message && (
            <Badge variant="outline">Message sent</Badge>
          )}
          {brief.callId ? (
            <Button asChild variant="outline">
              <Link href={`/calls/${brief.callId}`}>View owner call</Link>
            </Button>
          ) : (
            <Button
              disabled={running}
              onClick={() => void run(["dashboard", "call"])}
            >
              <PhoneCall /> Call owner
            </Button>
          )}
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/[.04] shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck size={18} /> Verified daily narrative
          </div>
          <CardTitle className="text-2xl leading-tight">
            {brief.narrative.headline}
          </CardTitle>
        </CardHeader>
        <CardContent className="max-w-4xl leading-7 text-muted-foreground">
          {brief.narrative.summary}
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MoneyCard
          label="Promised today"
          amount={brief.metrics.promisedToday.amountPaise}
          count={brief.metrics.promisedToday.count}
          tone="text-primary"
        />
        <MoneyCard
          label="Collected today"
          amount={brief.metrics.collectedToday.amountPaise}
          count={brief.metrics.collectedToday.count}
          tone="text-emerald-500"
        />
        <MoneyCard
          label="7-day forecast"
          amount={brief.metrics.forecast7dPaise}
          count={null}
          tone="text-foreground"
        />
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Calls connected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {brief.metrics.calls.connected}/{brief.metrics.calls.attempted}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {brief.metrics.calls.connectRate}% connect rate
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Promised versus collected · 7 days</CardTitle>
          </CardHeader>
          <CardContent className="h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  formatter={(value) =>
                    new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(Number(value))
                  }
                />
                <Legend />
                <Bar
                  dataKey="promised"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="collected"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Connect rate by hour · 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-2">
              {brief.metrics.connectRateByHour.map((bucket) => (
                <div
                  key={bucket.hour}
                  className="rounded-md border p-2 text-center"
                  style={{
                    backgroundColor: bucket.attempted
                      ? `color-mix(in oklab, var(--primary) ${Math.max(8, bucket.rate)}%, transparent)`
                      : undefined,
                  }}
                  title={`${bucket.attempted} attempted · ${bucket.connected} connected`}
                >
                  <p className="text-[10px] text-muted-foreground">
                    {String(bucket.hour).padStart(2, "0")}:00
                  </p>
                  <p className="mt-1 text-xs font-semibold tabular-nums">
                    {bucket.attempted ? `${bucket.rate}%` : "—"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Needs owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.narrative.needs_owner.length ? (
              brief.narrative.needs_owner.map((item) => (
                <OwnerAccount key={item.debtor_id} item={item} />
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No verified owner intervention is needed today.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="text-primary" size={18} /> Insights with
              evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {brief.narrative.insights.length ? (
              brief.narrative.insights.map((item) => (
                <div
                  key={`${item.text}-${item.evidence}`}
                  className="rounded-lg border p-4"
                >
                  <p className="font-medium">{item.text}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Evidence: {item.evidence}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No additional verified pattern today.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Brief history</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {data.history.map((item) => (
            <Link
              key={item.id}
              href={`/brief/${item.forDate}`}
              className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/50"
            >
              <div>
                <p className="font-medium">{item.headline}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.forDate}
                </p>
              </div>
              <Badge
                variant={item.forDate === brief.forDate ? "default" : "outline"}
              >
                {item.forDate === brief.forDate ? "Open" : "View"}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

function MoneyCard({
  label,
  amount,
  count,
  tone,
}: {
  label: string;
  amount: string;
  count: number | null;
  tone: string;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        <Banknote size={17} className={tone} />
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-semibold tabular-nums ${tone}`}>
          {inr(amount)}
        </p>
        {count !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {count} {count === 1 ? "entry" : "entries"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OwnerAccount({
  item,
}: {
  item: BriefNarrative["needs_owner"][number];
}) {
  const [calling, setCalling] = useState(false);
  const call = async () => {
    setCalling(true);
    try {
      const response = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debtorId: item.debtor_id }),
      });
      if (!response.ok) throw new Error();
      toast.success(`Call queued for ${item.shop}`);
    } catch {
      toast.error("The contact gate blocked this call");
    } finally {
      setCalling(false);
    }
  };
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-semibold">{item.shop}</p>
        <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
        <p className="mt-2 text-xs text-primary">
          {sentence(item.suggested_action)}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={calling}
        onClick={() => void call()}
      >
        <PhoneCall /> Call now
      </Button>
    </div>
  );
}
