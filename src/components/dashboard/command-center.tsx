"use client";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  BanknoteArrowDown,
  CalendarCheck2,
  CircleDollarSign,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, inr } from "@/lib/dashboard/client";
import type {
  DashboardEvent,
  DashboardSummary,
  QueueItem,
} from "@/lib/dashboard/types";
import { QueuePanel } from "./queue-panel";
import { EventTicker } from "./event-ticker";
import { LiveCallPanel, PhoneMockup } from "./live-call-panel";

function Loading() {
  return (
    <div className="space-y-5 p-8">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-5 2xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-[520px]" />
      </div>
    </div>
  );
}
export function CommandCenter() {
  const summary = useSWR<DashboardSummary>("/api/dashboard/summary", apiFetch, {
    refreshInterval: 1500,
  });
  const queue = useSWR<{ items: QueueItem[] }>("/api/queue", apiFetch, {
    refreshInterval: 1500,
  });
  const feed = useSWR<{ events: DashboardEvent[] }>(
    "/api/events?limit=40",
    apiFetch,
    { refreshInterval: 1500 },
  );
  if (!summary.data || !queue.data) {
    if (summary.error || queue.error || feed.error)
      return (
        <main className="p-5 lg:p-8">
          <div role="alert" className="rounded-xl border bg-card p-8">
            <h1 className="text-xl font-semibold">Workspace unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn’t load your accounts. Check your connection and try
              again.
            </p>
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => {
                void summary.mutate();
                void queue.mutate();
                void feed.mutate();
              }}
            >
              Try again
            </Button>
          </div>
        </main>
      );
    return <Loading />;
  }
  const { business, meta, kpis, liveCall } = summary.data;
  const cards = [
    [
      "Outstanding",
      inr(kpis.outstandingPaise),
      `${kpis.debtorCount} debtors`,
      CircleDollarSign,
      "text-muted-foreground",
    ],
    [
      "Promised today",
      inr(kpis.promisedTodayPaise),
      "Pending commitments",
      CalendarCheck2,
      "text-muted-foreground",
    ],
    [
      "Collected today",
      inr(kpis.collectedTodayPaise),
      Number(kpis.simulatedCollectedTodayPaise) > 0
        ? `Includes ${inr(kpis.simulatedCollectedTodayPaise)} demo simulation`
        : "Confirmed receipts",
      BanknoteArrowDown,
      "text-emerald-500",
    ],
    [
      "Calls today",
      `${kpis.callsConnected}/${kpis.callsAttempted}`,
      `${kpis.connectRate}% connect rate`,
      PhoneCall,
      "text-muted-foreground",
    ],
    [
      "Compliance",
      `${kpis.blocked} blocked`,
      `${kpis.optOuts} opt-outs honoured`,
      ShieldCheck,
      "text-muted-foreground",
    ],
  ] as const;
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[.12em] text-muted-foreground uppercase">
            Your workspace, at a glance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {business.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "full",
              timeZone: "Asia/Kolkata",
            }).format(new Date())}
          </p>
        </div>
        <div className="flex max-w-lg flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Live
          </Badge>
          {meta.demoMode && <Badge variant="outline">Demo workspace</Badge>}
          <Badge variant="outline">Voice · Bolna</Badge>
          <span className="sr-only">
            {meta.agentMode} · {meta.llmProvider} · {meta.llmModel}
          </span>
          {business.demoOverride && (
            <Badge className="bg-amber-500/15 text-amber-500">
              Demo override
            </Badge>
          )}
        </div>
      </div>
      {(summary.error || queue.error || feed.error) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          Live data is reconnecting. The last successful snapshot remains
          visible.
        </div>
      )}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value, note, Icon, color]) => (
          <Card key={label} className="gap-4 py-5 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between px-5 pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon size={17} className={color} />
            </CardHeader>
            <CardContent className="px-5">
              <motion.p
                key={value}
                initial={{ opacity: 0.45, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-semibold tracking-tight tabular-nums"
              >
                {value}
              </motion.p>
              <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid items-start gap-5 min-[1600px]:grid-cols-[minmax(0,1.6fr)_minmax(340px,.8fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Priority queue</h2>
              <p className="text-xs text-muted-foreground">
                The accounts that need your attention, in order.
              </p>
            </div>
            <Badge variant="outline">
              {queue.data.items.filter((item) => item.allowed).length} callable
              now
            </Badge>
          </div>
          <QueuePanel items={queue.data.items.slice(0, 12)} />
        </div>
        <div className="grid min-w-0 items-start gap-5 md:grid-cols-2 min-[1600px]:grid-cols-1">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Live call</CardTitle>
            </CardHeader>
            <CardContent>
              <LiveCallPanel call={liveCall} />
            </CardContent>
          </Card>
          <Card className="overflow-hidden py-5 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <PhoneMockup call={liveCall} />
            </CardContent>
          </Card>
        </div>
      </section>
      <EventTicker events={feed.data?.events ?? []} />
    </main>
  );
}
