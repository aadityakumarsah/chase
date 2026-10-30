"use client";
import useSWR from "swr";
import { Download, ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/page-heading";
import { RelativeTime } from "@/components/relative-time";
import { apiFetch, sentence } from "@/lib/dashboard/client";
import type { complianceDashboard } from "@/lib/dashboard/queries";
type Data = Awaited<ReturnType<typeof complianceDashboard>>;
const rules = [
  ["R1", "Demo calls require an allowlisted, consenting tester."],
  ["R2", "An active opt-out blocks contact."],
  ["R3", "Open disputes pause collection calls."],
  ["R4", "Wrong numbers stay blocked until verified."],
  ["R5", "Business hours, hard 08:00–19:00 limits, and Sundays off."],
  ["R6", "Maximum attempts per day."],
  ["R7", "Maximum attempts per rolling week."],
  ["R8", "At least four hours between attempts."],
  ["R9", "Hardship accounts receive a 72-hour gap."],
  ["R10", "Wait for a pending promise, except the day-before reminder."],
  ["R11", "Send first-contact disclosure before dialing."],
];
export function CompliancePage() {
  const { data } = useSWR<Data>("/api/compliance", apiFetch, {
    refreshInterval: 10_000,
  });
  if (!data)
    return (
      <main className="space-y-5 p-8">
        <Skeleton className="h-28" />
        <Skeleton className="h-[600px]" />
      </main>
    );
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Conduct by construction"
        title="Compliance ledger"
        description="Engineering safeguards modeled on respectful recovery conduct. This console is not a legal certification."
        actions={
          <Button variant="outline" asChild>
            <a href="/api/compliance?format=csv">
              <Download size={15} /> Export CSV
            </a>
          </Button>
        }
      />
      <Card className="shadow-none">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Contact policy</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Window {data.policy?.window} · hard limits{" "}
              {data.policy?.hardLimits} · {data.policy?.dailyCap}/day ·{" "}
              {data.policy?.weeklyCap}/week · minimum gap{" "}
              {data.policy?.minGapHours}h · hardship gap{" "}
              {data.policy?.hardshipGapHours}h
            </p>
          </div>
          <ShieldCheck className="text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {rules.map(([id, text]) => (
              <div key={id} className="rounded-lg border bg-muted/25 p-3">
                <Badge variant="outline">{id}</Badge>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
          <a
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary"
            href="https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12378&Mode=0"
            target="_blank"
            rel="noreferrer"
          >
            RBI circular dated 12 August 2022 <ExternalLink size={12} />
          </a>
        </CardContent>
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_.7fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Decision ledger</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[700px] divide-y overflow-auto p-0">
            {data.ledger.map((row) => (
              <div key={row.id} className="flex gap-3 px-5 py-4">
                <LockKeyhole
                  size={16}
                  className={
                    row.kind === "gate_blocked"
                      ? "mt-0.5 text-rose-500"
                      : "mt-0.5 text-emerald-500"
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {row.shopName ?? "System"} · {sentence(row.kind)}
                    </p>
                    <RelativeTime
                      value={row.at}
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.rule}
                  </p>
                </div>
              </div>
            ))}
            {!data.ledger.length && (
              <Empty text="No gate decisions recorded." />
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Active opt-outs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.optOuts.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-rose-500/20 p-3"
                >
                  <p className="text-sm font-medium">{item.shopName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.scope} · {item.source}
                  </p>
                </div>
              ))}
              {!data.optOuts.length && <Empty text="No active opt-outs." />}
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Disputes on hold</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.disputes.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-amber-500/20 p-3 text-sm font-medium"
                >
                  {item.shopName}
                </div>
              ))}
              {!data.disputes.length && <Empty text="No open disputes." />}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
  );
}
