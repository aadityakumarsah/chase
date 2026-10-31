"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Expand,
  Keyboard,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch, inr, sentence } from "@/lib/dashboard/client";
import type { DashboardSummary, QueueItem } from "@/lib/dashboard/types";
import { LiveCallPanel } from "./live-call-panel";
import { useReadOnly } from "@/components/read-only-context";

export function StageView() {
  const readOnly = useReadOnly();
  const summary = useSWR<DashboardSummary>("/api/dashboard/summary", apiFetch, {
    refreshInterval: 1500,
  });
  const queue = useSWR<{ items: QueueItem[] }>("/api/queue", apiFetch, {
    refreshInterval: 1500,
  });
  const [legend, setLegend] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLegend(false), 5000);
    const keydown = async (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key.toLowerCase() === "f") {
        if (document.fullscreenElement) return void document.exitFullscreen?.();
        return void document.documentElement.requestFullscreen?.();
      }
      if (readOnly && ["1", "2", "3", "r", "R"].includes(event.key))
        return toast.info("This public demo is read-only");
      if (event.key === "1") {
        const debtor = queue.data?.items.find((item) => item.demoDebtor);
        if (!debtor) return toast.error("Configure DEMO_DEBTOR_PHONE first");
        const response = await fetch("/api/calls/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ debtorId: debtor.debtorId }),
        });
        return response.ok
          ? toast.success("Demo call queued")
          : toast.error("The contact gate blocked the demo call");
      }
      if (event.key === "2") {
        const token = summary.data?.liveCall?.paymentToken;
        if (!token) return toast.error("No active payment link");
        const response = await fetch(`/api/pay/${token}/simulate`, {
          method: "POST",
        });
        return response.ok
          ? toast.success("Demo payment recorded")
          : toast.error("Payment simulation unavailable");
      }
      if (event.key === "3") {
        const response = await fetch("/api/brief/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: "today",
            deliver: ["dashboard", "call"],
          }),
        });
        const body = (await response.json()) as { error?: string };
        return response.ok
          ? toast.success("Owner brief call queued")
          : toast.error(body.error ?? "Owner brief call unavailable");
      }
      if (
        event.key.toLowerCase() === "r" &&
        window.confirm("Reset the fictional demo portfolio?")
      ) {
        const response = await fetch("/api/demo/reset", { method: "POST" });
        return response.ok
          ? toast.success("Demo portfolio restored")
          : toast.error("Reset was refused by the safety checks");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", keydown);
    };
  }, [queue.data, readOnly, summary.data]);
  if (!summary.data || !queue.data)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-2xl">
        Preparing stage…
      </div>
    );
  const data = summary.data;
  const gateSlot = data.latestGateBlock
    ? String(
        data.latestGateBlock.detail.scheduled ??
          data.latestGateBlock.detail.nextAllowedAt ??
          "",
      )
    : "";
  const movedTo =
    gateSlot && Number.isFinite(Date.parse(gateSlot))
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(gateSlot))
      : null;
  return (
    <main className="h-screen min-h-[720px] overflow-hidden bg-background p-7 text-[20px] text-foreground">
      <header className="flex h-[7%] items-start justify-between">
        <div>
          <p className="text-[20px] font-semibold tracking-[.18em] text-primary uppercase">
            Chase · Live collections
          </p>
          <h1 className="mt-1 text-[30px] font-semibold">
            {data.business.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="px-3 py-1.5 text-[20px]">
            <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-emerald-500" />
            LIVE
          </Badge>
          {data.business.demoOverride && (
            <Badge className="bg-amber-500/15 px-3 py-1.5 text-[20px] text-amber-500">
              Demo override
            </Badge>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="grid h-[85%] grid-cols-2 gap-6">
        <section className="glass-panel overflow-hidden rounded-2xl border p-6">
          <p className="mb-5 text-[20px] font-semibold tracking-wider text-muted-foreground uppercase">
            Live call
          </p>
          <LiveCallPanel call={data.liveCall} stage />
        </section>
        <div className="grid min-h-0 grid-rows-[1.4fr_.6fr] gap-6">
          <section className="glass-panel min-h-0 overflow-hidden rounded-2xl border p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Chase Queue</h2>
              <Badge variant="outline" className="text-[20px]">
                Top 6
              </Badge>
            </div>
            <StageQueue items={queue.data.items.slice(0, 6)} />
          </section>
          <section className="grid grid-cols-3 gap-4">
            <div className="glass-panel rounded-2xl border p-5">
              <Banknote className="text-emerald-500" />
              <p className="mt-4 text-[20px] text-muted-foreground">
                Collected today
              </p>
              <motion.p
                key={data.kpis.collectedTodayPaise}
                initial={{ scale: 1.12 }}
                animate={{ scale: 1 }}
                className="mt-1 text-4xl font-bold text-emerald-500 tabular-nums"
              >
                {inr(data.kpis.collectedTodayPaise)}
              </motion.p>
              {Number(data.kpis.simulatedCollectedTodayPaise) > 0 && (
                <p className="mt-1 text-[20px] text-amber-500">
                  Demo simulation included
                </p>
              )}
            </div>
            <div className="glass-panel rounded-2xl border p-5">
              <ShieldAlert className="text-rose-500" />
              <p className="mt-4 text-[20px] text-muted-foreground">
                Latest gate block
              </p>
              <p className="mt-1 line-clamp-2 text-[20px] font-semibold text-rose-500">
                {data.latestGateBlock
                  ? `${sentence(data.latestGateBlock.rule)} · ${movedTo ? `moved to ${movedTo}` : (data.latestGateBlock.shopName ?? "Account")}`
                  : "No blocks today"}
              </p>
            </div>
            <div className="glass-panel rounded-2xl border p-5">
              <Sparkles className="text-primary" />
              <p className="mt-4 text-[20px] text-muted-foreground">
                AI routing
              </p>
              <p className="mt-1 text-[20px] font-semibold">
                {data.meta.llmProvider}
              </p>
              <p className="text-[20px] text-muted-foreground">
                {data.meta.agentMode} agent
              </p>
            </div>
          </section>
        </div>
      </div>
      <footer className="flex h-[8%] items-end justify-between text-[20px] text-muted-foreground">
        <p>Bolna makes the call. Chase gets you paid.</p>
        <button
          className="flex items-center gap-2"
          onClick={() => setLegend(true)}
        >
          <Keyboard size={20} /> Shortcuts
        </button>
      </footer>
      <AnimatePresence>
        {legend && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed right-8 bottom-8 flex items-center gap-5 rounded-xl border bg-card/95 px-5 py-3 text-[20px] shadow-2xl"
          >
            {!readOnly && (
              <span>
                <kbd>1</kbd> Call
              </span>
            )}
            {!readOnly && (
              <span>
                <kbd>2</kbd> Pay
              </span>
            )}
            {!readOnly && (
              <span>
                <kbd>3</kbd> Brief
              </span>
            )}
            {!readOnly && (
              <span>
                <kbd>R</kbd> Reset
              </span>
            )}
            <span className="flex items-center gap-1">
              <Expand size={20} /> F Fullscreen
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function StageQueue({ items }: { items: QueueItem[] }) {
  const changed = items.find((item) => item.scoreDelta !== 0)?.debtorId;
  return (
    <div className="overflow-hidden rounded-xl border bg-card/80">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            layout
            key={item.debtorId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_6rem] items-center gap-3 border-b px-4 py-3 last:border-0"
          >
            <span className="text-[20px] font-semibold text-muted-foreground tabular-nums">
              {item.rank}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold">
                {item.shopName}
              </p>
              {changed === item.debtorId && (
                <p className="mt-1 truncate text-[20px] text-primary">
                  {item.rationale}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-[24px] font-bold tabular-nums">
                {item.score ?? "—"}
              </span>
              {item.scoreDelta !== 0 && (
                <motion.span
                  initial={{ scale: 1.5 }}
                  animate={{ scale: 1 }}
                  className={
                    item.scoreDelta > 0
                      ? "ml-1 text-[20px] text-emerald-500"
                      : "ml-1 text-[20px] text-rose-500"
                  }
                >
                  {item.scoreDelta > 0 ? "+" : ""}
                  {item.scoreDelta}
                </motion.span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
