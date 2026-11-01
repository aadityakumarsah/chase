"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ChevronRight,
  GitPullRequest,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/dashboard/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/page-heading";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  title: string;
  problem: string;
  status: string;
  confidence: string;
  createdAt: string;
  simResults: { recommended?: boolean } | null;
};

/** Status styling, so a glance tells you what needs a decision. */
const STATUS_TONE: Record<string, string> = {
  open: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  approved: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  rejected: "border-rose-500/40 text-rose-700 dark:text-rose-400",
  rolled_back: "border-muted-foreground/30 text-muted-foreground",
};

const FILTERS = [
  ["all", "All"],
  ["open", "Awaiting review"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
] as const;

export function PromptPrsPage() {
  const { data } = useSWR<{ items: Row[] }>("/api/prompt-prs", apiFetch, {
    refreshInterval: 10_000,
  });
  const [filter, setFilter] = useState<string>("all");

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      all: items.length,
      open: items.filter((row) => row.status === "open").length,
      approved: items.filter((row) => row.status === "approved").length,
      rejected: items.filter((row) => row.status === "rejected").length,
    } as Record<string, number>;
  }, [data]);

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (row) => filter === "all" || row.status === filter,
      ),
    [data, filter],
  );

  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Evaluator loop"
        title="Prompt improvements"
        description="Small, evidence-backed changes to how the agent speaks, each tested against compliance personas before you approve it. Protected compliance sections can never be edited."
      />

      {data && data.items.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 tabular-nums opacity-60">
                {counts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <div className="grid gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <GitPullRequest className="mx-auto mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">
            {data.items.length === 0
              ? "No prompt improvements yet"
              : "Nothing in this view"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            {data.items.length === 0
              ? "The nightly evaluator writes one whenever analysed calls show a pattern worth fixing. Make some calls and check back tomorrow."
              : "Try another filter to see the rest."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((row) => {
            const confidence = Math.round(Number(row.confidence) * 100);
            return (
              <Link
                key={row.id}
                href={`/prompt-prs/${row.id}`}
                className="group rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{row.title}</h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] capitalize",
                          STATUS_TONE[row.status],
                        )}
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                      {row.simResults?.recommended && (
                        <Badge className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600">
                          <ShieldCheck size={10} /> Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {row.problem}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles size={12} />
                        <span className="tabular-nums">
                          {confidence}% confidence
                        </span>
                      </span>
                      <RelativeTime value={row.createdAt} />
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </div>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      confidence >= 70
                        ? "bg-emerald-500"
                        : confidence >= 40
                          ? "bg-amber-500"
                          : "bg-muted-foreground/40",
                    )}
                    style={{ width: `${Math.min(100, confidence)}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
