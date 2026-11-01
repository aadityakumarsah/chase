"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { FileUp, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, inr } from "@/lib/dashboard/client";
import type { QueueItem } from "@/lib/dashboard/types";
import { PageHeading } from "@/components/page-heading";
import { QueuePanel } from "./queue-panel";
import { AddDebtorDialog } from "./add-debtor-dialog";

const BLANK = {
  search: "",
  city: "",
  band: "all",
  language: "all",
  status: "all",
  action: "all",
  segment: "all",
  promise: "any",
  minRupees: "",
  maxRupees: "",
  sort: "score",
  direction: "desc",
};

/**
 * The working view of the portfolio.
 *
 * Filtering and sorting happen on the server so the figures in the summary
 * strip always describe exactly the rows on screen, however large the book gets.
 */
export function DebtorsPage() {
  const [filters, setFilters] = useState(BLANK);
  const [advanced, setAdvanced] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    const add = (key: string, value: string, skip: string) => {
      if (value && value !== skip) params.set(key, value);
    };
    add("search", filters.search.trim(), "");
    add("city", filters.city.trim(), "");
    add("band", filters.band, "all");
    add("language", filters.language, "all");
    add("status", filters.status, "all");
    add("action", filters.action, "all");
    add("segment", filters.segment, "all");
    add("minRupees", filters.minRupees, "");
    add("maxRupees", filters.maxRupees, "");
    params.set("promise", filters.promise);
    params.set("sort", filters.sort);
    params.set("direction", filters.direction);
    return params.toString();
  }, [filters]);

  const { data, isLoading, mutate } = useSWR<{ items: QueueItem[] }>(
    `/api/debtors?${query}`,
    apiFetch,
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  const [file, setFile] = useState<File | null>(null);
  const [rejections, setRejections] = useState<
    Array<{ row?: number; reason?: string }>
  >([]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const summary = useMemo(() => {
    const outstanding = items.reduce(
      (total, item) => total + BigInt(item.outstandingPaise),
      0n,
    );
    const promised = items.reduce(
      (total, item) => total + BigInt(item.promisedPaise ?? "0"),
      0n,
    );
    return {
      accounts: items.length,
      outstanding: outstanding.toString(),
      promised: promised.toString(),
      callable: items.filter((item) => item.allowed).length,
      overdue: items.filter((item) => item.daysPastDue > 0).length,
    };
  }, [items]);

  const set = (key: keyof typeof BLANK) => (value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const dirty = useMemo(
    () =>
      (Object.keys(BLANK) as (keyof typeof BLANK)[]).some(
        (key) => filters[key] !== BLANK[key],
      ),
    [filters],
  );

  async function upload() {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/import/csv", { method: "POST", body });
    const result = (await response.json()) as {
      rejected?: Array<{ row?: number; reason?: string }>;
      error?: string;
    };
    setRejections(result.rejected ?? []);
    if (response.ok) {
      toast.success("CSV import completed");
      void mutate();
    } else toast.error(result.error ?? "Import failed");
  }

  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Portfolio"
        title="Accounts"
        description="Search, filter and work every receivable account."
        actions={
          <div className="flex flex-wrap gap-2">
            <AddDebtorDialog onAdded={() => void mutate()} />
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <FileUp size={16} /> Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import receivables</DialogTitle>
                  <DialogDescription>
                    Rows are validated independently. Rejected rows remain
                    visible and do not partially update the ledger.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                {file && (
                  <div className="rounded-lg bg-muted p-3 text-xs">
                    <p className="font-medium">{file.name}</p>
                    <p className="mt-1 text-muted-foreground">
                      {Math.ceil(file.size / 1024)} KB ready for validation
                    </p>
                  </div>
                )}
                <Button onClick={() => void upload()} disabled={!file}>
                  Validate and import
                </Button>
                {rejections.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-lg border border-rose-500/30 p-3">
                    <p className="mb-2 text-sm font-medium text-rose-500">
                      Rejected rows
                    </p>
                    {rejections.map((row, index) => (
                      <p key={index} className="text-xs">
                        Row {row.row ?? "?"}: {row.reason ?? "Invalid data"}
                      </p>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Accounts"
          value={summary.accounts.toLocaleString("en-IN")}
        />
        <Stat label="Outstanding" value={inr(summary.outstanding)} />
        <Stat label="Promised" value={inr(summary.promised)} />
        <Stat label="Overdue" value={summary.overdue.toLocaleString("en-IN")} />
        <Stat
          label="Callable now"
          value={summary.callable.toLocaleString("en-IN")}
        />
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div className="relative">
            <Search
              className="absolute top-2.5 left-3 text-muted-foreground"
              size={16}
            />
            <Input
              value={filters.search}
              onChange={(event) => set("search")(event.target.value)}
              placeholder="Search shop, contact, number or city"
              className="pl-9"
              aria-label="Search accounts"
            />
          </div>
          <Filter
            value={filters.status}
            set={set("status")}
            label="Status"
            options={[
              ["active", "Active"],
              ["hardship", "Hardship"],
              ["dispute", "Dispute"],
              ["do_not_contact", "Do not contact"],
              ["wrong_number", "Wrong number"],
              ["paid", "Paid"],
            ]}
          />
          <Filter
            value={filters.action}
            set={set("action")}
            label="Next action"
            options={[
              ["call_today", "Call today"],
              ["call_this_week", "Call this week"],
              ["wait_for_promise", "Wait for promise"],
              ["human_review", "Human review"],
              ["do_not_contact", "Do not contact"],
              ["verify_number", "Verify number"],
              ["none", "None"],
            ]}
          />
          <div className="flex gap-2">
            <Select
              value={`${filters.sort}:${filters.direction}`}
              onValueChange={(value) => {
                const [sort, direction] = value.split(":");
                setFilters((previous) => ({ ...previous, sort, direction }));
              }}
            >
              <SelectTrigger aria-label="Sort accounts">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score:desc">Best rating first</SelectItem>
                <SelectItem value="score:asc">Worst rating first</SelectItem>
                <SelectItem value="outstanding:desc">
                  Largest balance
                </SelectItem>
                <SelectItem value="outstanding:asc">
                  Smallest balance
                </SelectItem>
                <SelectItem value="overdue:desc">Most overdue</SelectItem>
                <SelectItem value="promise:asc">Soonest promise</SelectItem>
                <SelectItem value="name:asc">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAdvanced((value) => !value)}
              aria-expanded={advanced}
              aria-label="More filters"
              title="More filters"
            >
              <SlidersHorizontal size={16} />
            </Button>
          </div>
        </div>

        {advanced && (
          <div className="grid gap-3 border-t pt-3 md:grid-cols-3 lg:grid-cols-6">
            <Input
              value={filters.city}
              onChange={(event) => set("city")(event.target.value)}
              placeholder="City or area"
              aria-label="Filter by city"
            />
            <Filter
              value={filters.segment}
              set={set("segment")}
              label="Type"
              options={[
                ["kirana", "Kirana"],
                ["medical", "Medical"],
                ["restaurant", "Restaurant"],
                ["hardware", "Hardware"],
                ["other", "Other"],
              ]}
            />
            <Filter
              value={filters.band}
              set={set("band")}
              label="Band"
              options={[
                ["A", "A"],
                ["B", "B"],
                ["C", "C"],
                ["D", "D"],
                ["X", "X"],
              ]}
            />
            <Filter
              value={filters.language}
              set={set("language")}
              label="Language"
              options={[
                ["hi", "Hindi"],
                ["en", "English"],
                ["mr", "Marathi"],
              ]}
            />
            <Input
              value={filters.minRupees}
              onChange={(event) => set("minRupees")(event.target.value)}
              placeholder="Min ₹"
              inputMode="numeric"
              aria-label="Minimum outstanding in rupees"
            />
            <Input
              value={filters.maxRupees}
              onChange={(event) => set("maxRupees")(event.target.value)}
              placeholder="Max ₹"
              inputMode="numeric"
              aria-label="Maximum outstanding in rupees"
            />
            <Select value={filters.promise} onValueChange={set("promise")}>
              <SelectTrigger aria-label="Promise filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any promise state</SelectItem>
                <SelectItem value="with">Has a pending promise</SelectItem>
                <SelectItem value="without">No pending promise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {dirty && (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Showing {items.length.toLocaleString("en-IN")} filtered
              {items.length === 1 ? " account" : " accounts"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(BLANK)}
              className="text-xs"
            >
              <RotateCcw size={13} /> Clear filters
            </Button>
          </div>
        )}
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-[560px]" />
      ) : (
        <QueuePanel items={items} />
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Filter({
  value,
  set,
  label,
  options,
}: {
  value: string;
  set: (value: string) => void;
  label: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <Select value={value} onValueChange={set}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
