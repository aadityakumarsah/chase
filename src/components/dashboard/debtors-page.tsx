"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { FileUp, Search } from "lucide-react";
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
import { apiFetch } from "@/lib/dashboard/client";
import type { QueueItem } from "@/lib/dashboard/types";
import { PageHeading } from "@/components/page-heading";
import { QueuePanel } from "./queue-panel";

export function DebtorsPage() {
  const { data } = useSWR<{ items: QueueItem[] }>("/api/debtors", apiFetch, {
    refreshInterval: 10_000,
  });
  const [search, setSearch] = useState("");
  const [band, setBand] = useState("all");
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("all");
  const [file, setFile] = useState<File | null>(null);
  const [rejections, setRejections] = useState<
    Array<{ row?: number; reason?: string }>
  >([]);
  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) =>
          (!search ||
            `${item.shopName} ${item.contactName}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (band === "all" || item.band === band) &&
          (language === "all" || item.language === language) &&
          (status === "all" || item.status === status) &&
          (action === "all" || item.nextAction === action),
      ),
    [data, search, band, language, status, action],
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
    if (response.ok) toast.success("CSV import completed");
    else toast.error(result.error ?? "Import failed");
  }
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Portfolio"
        title="Debtors"
        description="Search, filter and inspect every receivable account."
        actions={
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
                  Rows are validated independently. Rejected rows remain visible
                  and do not partially update the ledger.
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
        }
      />
      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="relative">
          <Search
            className="absolute top-2.5 left-3 text-muted-foreground"
            size={16}
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shop or contact"
            className="pl-9"
          />
        </div>
        <Filter
          value={band}
          set={setBand}
          label="Band"
          options={["A", "B", "C", "D", "X"]}
        />
        <Filter
          value={language}
          set={setLanguage}
          label="Language"
          options={["hi", "en", "mr"]}
        />
        <Filter
          value={status}
          set={setStatus}
          label="Status"
          options={[
            "active",
            "hardship",
            "dispute",
            "do_not_contact",
            "wrong_number",
            "paid",
          ]}
        />
        <Filter
          value={action}
          set={setAction}
          label="Next action"
          options={[
            "call_today",
            "call_this_week",
            "wait_for_promise",
            "human_review",
            "do_not_contact",
            "verify_number",
            "none",
          ]}
        />
      </div>
      {!data ? (
        <Skeleton className="h-[560px]" />
      ) : (
        <QueuePanel items={items} />
      )}
    </main>
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
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={set}>
      <SelectTrigger>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
