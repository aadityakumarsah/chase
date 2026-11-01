"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  Bot,
  CheckCircle2,
  Clock,
  IndianRupee,
  Mic2,
  RefreshCw,
  ShieldAlert,
  User,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/page-heading";
import { RelativeTime } from "@/components/relative-time";
import { apiFetch, sentence } from "@/lib/dashboard/client";
import type { callDetail } from "@/lib/dashboard/queries";
import { LoadFailure } from "./load-failure";
type Detail = NonNullable<Awaited<ReturnType<typeof callDetail>>>;
const obj = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** A call that has ended will not change again, so stop polling it hard. */
const TERMINAL = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "cancelled",
  "canceled",
  "stopped",
  "balance-low",
  "error",
]);

export function CallDetail({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Detail>(`/api/calls/${id}`, apiFetch, {
    // Live while the call is on the line, then back off to an occasional check.
    refreshInterval: (latest) =>
      TERMINAL.has(latest?.call.status ?? "") ? 30_000 : 2_000,
    keepPreviousData: true,
    dedupingInterval: 1_000,
  });
  const [busy, setBusy] = useState(false);
  if (!data)
    if (error)
      return (
        <main className="p-5 lg:p-8">
          <LoadFailure
            error={error}
            retry={() => void mutate()}
            title="Call record unavailable"
          />
        </main>
      );
  if (!data)
    return (
      <main className="space-y-5 p-8">
        <Skeleton className="h-24" />
        <Skeleton className="h-[600px]" />
      </main>
    );
  const call = data.call;
  const analysis = obj(call.analysis);
  const promise = obj(analysis.promise);
  const flags = Array.isArray(analysis.compliance_flags)
    ? analysis.compliance_flags.map(obj)
    : [];
  const lines = (call.transcript ?? "").split("\n").filter(Boolean);
  const metrics: Array<{
    label: string;
    value: React.ReactNode;
    icon: LucideIcon;
  }> = [
    { label: "Status", value: sentence(call.status), icon: CheckCircle2 },
    { label: "Duration", value: `${call.durationSec ?? 0}s`, icon: Clock },
    {
      label: "Cost",
      value: call.costCents == null ? "—" : `${call.costCents}¢`,
      icon: IndianRupee,
    },
    {
      label: "First audio",
      value:
        call.timeToFirstAudioMs == null ? "—" : `${call.timeToFirstAudioMs}ms`,
      icon: Mic2,
    },
    {
      label: "Started",
      value: call.startedAt ? <RelativeTime value={call.startedAt} /> : "—",
      icon: Clock,
    },
  ];
  async function rerun() {
    setBusy(true);
    const response = await fetch(`/api/calls/${id}/analyze`, {
      method: "POST",
    });
    setBusy(false);
    if (response.ok) toast.success("Analysis refreshed");
    else toast.error("Analysis could not be refreshed");
    if (response.ok) await mutate();
  }
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Call record"
        title={data.debtor.shopName}
        description={`${data.debtor.contactName} · ${data.business.name}`}
        actions={
          <Button
            variant="outline"
            onClick={() => void rerun()}
            disabled={busy || !call.transcript || call.purpose !== "collection"}
          >
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} />{" "}
            Re-run analysis
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-2 py-4 shadow-none">
            <CardHeader className="flex-row items-center justify-between px-4 pb-0">
              <CardTitle className="text-xs text-muted-foreground">
                {label}
              </CardTitle>
              <Icon size={15} className="text-primary" />
            </CardHeader>
            <CardContent className="px-4 font-semibold tabular-nums">
              {value}
            </CardContent>
          </Card>
        ))}
      </div>
      {call.terminationReason && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm">
          <span className="font-medium">Termination:</span>{" "}
          {call.terminationReason}
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[1.35fr_.8fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Transcript and tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, index) => {
              const [speaker, ...rest] = line.split(":");
              const user = speaker?.toLowerCase() === "user";
              return (
                <div
                  key={`${index}-${line}`}
                  className={`flex gap-3 ${user ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${user ? "bg-sky-500/15" : "bg-muted"}`}
                  >
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      {user ? <User size={11} /> : <Bot size={11} />}
                      {speaker}
                    </div>
                    <p className={user ? "font-devanagari" : ""}>
                      {rest.join(":").trim()}
                    </p>
                  </div>
                </div>
              );
            })}
            {data.tools.map((tool) => (
              <div
                key={tool.id}
                className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-primary">
                    Tool · {tool.toolName}
                  </p>
                  <RelativeTime
                    value={tool.createdAt}
                    className="text-muted-foreground"
                  />
                </div>
                <p className="mt-2 text-muted-foreground">
                  {JSON.stringify(tool.args)}
                </p>
                <Badge
                  className="mt-2"
                  variant={tool.ok ? "default" : "destructive"}
                >
                  {tool.ok ? "Succeeded" : "Failed"} · {tool.latencyMs}ms
                </Badge>
              </div>
            ))}
            {!lines.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No transcript was captured.
              </p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Call analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                label="Outcome"
                value={sentence(String(analysis.outcome ?? "Not analyzed"))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Sentiment"
                  value={sentence(String(analysis.sentiment ?? "—"))}
                />
                <Field
                  label="Reason"
                  value={sentence(String(analysis.reason_code ?? "—"))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Bool
                  label="AI disclosed"
                  value={analysis.ai_disclosed === true}
                />
                <Bool
                  label="Identity before dues"
                  value={analysis.identity_confirmed_before_dues === true}
                />
              </div>
              {promise.made === true && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">Promise to pay</p>
                  <p className="mt-1 text-muted-foreground">
                    ₹
                    {Number(promise.amount_rupees ?? 0).toLocaleString("en-IN")}{" "}
                    · {String(promise.date ?? "")}
                  </p>
                </div>
              )}
              <Field
                label="Owner summary"
                value={String(analysis.owner_summary ?? "No summary yet.")}
              />
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert size={17} /> Compliance flags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags.map((flag, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-rose-500/25 bg-rose-500/8 p-3"
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium text-rose-500">
                      {sentence(String(flag.type ?? "flag"))}
                    </p>
                    <Badge variant="outline">
                      {String(flag.severity ?? "")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {String(flag.evidence ?? "")}
                  </p>
                </div>
              ))}
              {!flags.length && (
                <p className="text-sm text-muted-foreground">
                  No compliance flags found.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {call.recordingUrl && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <audio controls className="w-full" src={call.recordingUrl} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium leading-6">{value}</div>
    </div>
  );
}
function Bool({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          value
            ? "mt-1 text-sm font-semibold text-emerald-500"
            : "mt-1 text-sm font-semibold text-rose-500"
        }
      >
        {value ? "Yes" : "No"}
      </p>
    </div>
  );
}
