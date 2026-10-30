"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { inr, sentence } from "@/lib/dashboard/client";
import type { QueueItem } from "@/lib/dashboard/types";
import { RelativeTime } from "@/components/relative-time";

const bandColor = {
  A: "bg-emerald-500",
  B: "bg-sky-500",
  C: "bg-amber-500",
  D: "bg-rose-500",
  X: "bg-slate-500",
} as const;
const plainReason = (reason: string) => {
  const [kind, value] = reason.split(":");
  if (kind === "broken_promise")
    return `${value ?? 0} broken promise${value === "1" ? "" : "s"}`;
  if (kind === "dpd") return `${value ?? 0} days overdue`;
  if (kind === "outstanding")
    return `${Number(value ?? 0).toLocaleString("en-IN")} rupees outstanding`;
  if (kind === "attempts_7d") return `${value ?? 0} attempts this week`;
  return sentence(reason);
};
export function QueuePanel({
  items,
  compact = false,
}: {
  items: QueueItem[];
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function callNow(debtorId: string) {
    setBusy(debtorId);
    try {
      const response = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debtorId }),
      });
      const body = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok || body.status === "blocked")
        throw new Error(body.error ?? "The contact gate blocked this call");
      toast.success("Call queued with Bolna");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Call could not be started",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {!compact && (
        <div className="grid grid-cols-[3rem_minmax(13rem,1.6fr)_8rem_5rem_minmax(10rem,1fr)_7rem] gap-3 border-b px-4 py-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span>Rank</span>
          <span>Account</span>
          <span>Outstanding</span>
          <span>Rating</span>
          <span>Next move</span>
          <span className="text-right">Actions</span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const blocked = item.rules.filter((rule) => !rule.passed);
          return (
            <motion.div
              layout
              key={item.debtorId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className={
                compact
                  ? "grid grid-cols-[2.5rem_1fr_5rem] items-center gap-3 border-b px-4 py-3 last:border-0"
                  : "grid grid-cols-[3rem_minmax(13rem,1.6fr)_8rem_5rem_minmax(10rem,1fr)_7rem] items-center gap-3 border-b px-4 py-3.5 last:border-0 hover:bg-muted/30"
              }
            >
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {item.rank}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/debtors/${item.debtorId}`}
                    className="truncate text-sm font-semibold hover:text-primary"
                  >
                    {item.shopName}
                  </Link>
                  {item.demoDebtor && (
                    <Badge
                      variant="outline"
                      className="h-5 border-primary/40 px-1.5 text-[9px] text-primary"
                    >
                      DEMO
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[9px] uppercase"
                  >
                    {item.language}
                  </Badge>
                </div>
                {!compact && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.contactName} · {item.daysPastDue} days overdue
                  </p>
                )}
              </div>
              {!compact && (
                <span className="text-sm font-semibold tabular-nums">
                  {inr(item.outstandingPaise)}
                </span>
              )}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold tabular-nums">
                    {item.score ?? "—"}
                  </span>
                  {item.scoreDelta !== 0 && (
                    <motion.span
                      initial={{ scale: 1.5 }}
                      animate={{ scale: 1 }}
                      className={
                        item.scoreDelta > 0
                          ? "text-[10px] text-emerald-500"
                          : "text-[10px] text-rose-500"
                      }
                    >
                      {item.scoreDelta > 0 ? "+" : ""}
                      {item.scoreDelta}
                    </motion.span>
                  )}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score ?? 0}%` }}
                    className={`h-full ${bandColor[item.band]}`}
                  />
                </div>
              </div>
              {!compact && (
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="max-w-[11rem] truncate text-[10px]"
                    >
                      {sentence(item.nextAction)}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {item.allowed ? (
                          <ShieldCheck
                            size={16}
                            className="shrink-0 text-emerald-500"
                          />
                        ) : (
                          <LockKeyhole
                            size={16}
                            className="shrink-0 text-rose-500"
                          />
                        )}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          {item.allowed
                            ? "All contact rules pass"
                            : blocked
                                .map((rule) => `${rule.id}: ${rule.detail}`)
                                .join(" · ")}
                        </p>
                        {item.nextAllowedAt && (
                          <p className="mt-1">
                            Next: <RelativeTime value={item.nextAllowedAt} />
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {item.reasons.slice(0, 2).map(plainReason).join(" · ")}
                  </p>
                </div>
              )}
              {compact ? (
                <p className="truncate text-right text-xs text-muted-foreground">
                  {item.rationale}
                </p>
              ) : (
                <div className="flex justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!item.allowed || busy === item.debtorId}
                          onClick={() => void callNow(item.debtorId)}
                          aria-label="Call now"
                        >
                          <Phone size={15} />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {item.allowed
                        ? "Call now"
                        : blocked
                            .map((rule) => `${rule.id}: ${rule.detail}`)
                            .join(" · ")}
                    </TooltipContent>
                  </Tooltip>
                  <Button size="icon" variant="ghost" asChild>
                    <Link
                      href={`/lab?debtorId=${item.debtorId}`}
                      title="Web test"
                    >
                      <ExternalLink size={15} />
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/debtors/${item.debtorId}`}>View</Link>
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!items.length && (
        <div className="p-12 text-center text-sm text-muted-foreground">
          No debtors match this view.
        </div>
      )}
    </div>
  );
}
