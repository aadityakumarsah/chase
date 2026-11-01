"use client";
import Link from "next/link";
import useSWR from "swr";
import { HelpCircle } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeading } from "@/components/page-heading";
import { RelativeTime } from "@/components/relative-time";
import { apiFetch, inr, sentence } from "@/lib/dashboard/client";
import type { debtorDetail } from "@/lib/dashboard/queries";
import { LoadFailure } from "./load-failure";
type Detail = NonNullable<Awaited<ReturnType<typeof debtorDetail>>>;

export function DebtorDetail({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Detail>(
    `/api/debtors/${id}`,
    apiFetch,
    {
      refreshInterval: 10_000,
    },
  );
  if (!data)
    if (error)
      return (
        <main className="p-5 lg:p-8">
          <LoadFailure
            error={error}
            retry={() => void mutate()}
            title="Account unavailable"
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
  const rating = data.rating;
  const components = (rating?.components ?? {}) as Record<string, number>;
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Account dossier"
        title={data.debtor.shopName}
        description={`${data.debtor.contactName} · ${data.debtor.city} · ${data.debtor.preferredLanguage.toUpperCase()}`}
        actions={
          <Badge variant="outline">{sentence(data.debtor.status)}</Badge>
        }
      />
      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Chase Rating</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="How this score is computed">
                  <HelpCircle size={17} className="text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96">
                <p className="font-semibold">How this score is computed</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {data.ratingExplanation ?? "No rating has been computed."}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(components).map(([key, value]) => (
                    <div key={key} className="rounded bg-muted p-2">
                      <span className="text-muted-foreground">{key}</span>
                      <p className="font-semibold tabular-nums">
                        {Number(value).toFixed(3)}
                      </p>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-bold tabular-nums">
                {rating?.score ?? "—"}
              </span>
              <span className="mb-2 text-xl text-muted-foreground">/100</span>
            </div>
            <Progress value={rating?.score ?? 0} className="mt-4 h-2" />
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">p(pay in 7d)</span>
              <span className="font-semibold tabular-nums">
                {rating?.pPay7d == null
                  ? "—"
                  : `${Math.round(rating.pPay7d * 100)}%`}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm text-primary">
              Latest Claude rationale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl leading-8">
              “{rating?.rationale ?? "No rationale yet."}”
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              The score is deterministic. Claude explains the evidence; it never
              chooses the number.
            </p>
          </CardContent>
        </Card>
      </section>
      <Tabs defaultValue="timeline">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="dossier">Dossier</TabsTrigger>
          <TabsTrigger value="rating">Rating history</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Card className="mt-4 shadow-none">
            <CardContent className="divide-y p-0">
              {data.timeline.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="flex gap-4 px-5 py-4"
                >
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      <RelativeTime
                        value={item.at}
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                    {item.detail && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {!data.timeline.length && (
                <Empty text="No account activity yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="invoices">
          <Card className="mt-4 shadow-none">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-4">Invoice</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b">
                      <td className="p-4 font-medium">{invoice.invoiceNo}</td>
                      <td>{invoice.dueOn}</td>
                      <td>{inr(invoice.amountPaise)}</td>
                      <td className="text-emerald-500">
                        {inr(invoice.paidPaise)}
                      </td>
                      <td>
                        <Badge variant="outline">{invoice.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dossier">
          <Card className="mt-4 shadow-none">
            <CardHeader>
              <CardTitle>Contact Dossier</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dossier ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                  <p className="whitespace-pre-wrap text-base leading-8">
                    {data.dossier.text}
                  </p>
                  <div className="space-y-4 text-sm">
                    <Field label="Tone" value={data.dossier.toneHint ?? "—"} />
                    <Field
                      label="Best window"
                      value={data.dossier.bestTimeWindow ?? "Unknown"}
                    />
                    <Field label="Model" value={data.dossier.model} />
                    <Field
                      label="Updated"
                      value={<RelativeTime value={data.dossier.updatedAt} />}
                    />
                    <List
                      label="Open commitments"
                      value={data.dossier.openCommitments}
                    />
                    <List
                      label="Do not mention"
                      value={data.dossier.doNotMention}
                    />
                  </div>
                </div>
              ) : (
                <Empty text="No dossier has been compiled yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rating">
          <Card className="mt-4 shadow-none">
            <CardHeader>
              <CardTitle>Rating history</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.ratingHistory}>
                  <XAxis dataKey="at" hide />
                  <YAxis domain={[0, 100]} />
                  <ChartTooltip
                    labelFormatter={(value) =>
                      new Date(String(value)).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="calls">
          <Card className="mt-4 shadow-none">
            <CardContent className="divide-y p-0">
              {data.calls.map((call) => (
                <Link
                  href={`/calls/${call.id}`}
                  key={call.id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {sentence(call.status)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {call.connected ? "Connected" : "No conversation"} ·{" "}
                      {call.durationSec ?? 0}s
                    </p>
                  </div>
                  <RelativeTime
                    value={call.createdAt}
                    className="text-xs text-muted-foreground"
                  />
                </Link>
              ))}
              {!data.calls.length && <Empty text="No calls yet." />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
function List({ label, value }: { label: string; value: unknown }) {
  const items = Array.isArray(value) ? value : [];
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.length ? (
          items.map((item, index) => (
            <Badge key={index} variant="secondary">
              {typeof item === "string" ? item : JSON.stringify(item)}
            </Badge>
          ))
        ) : (
          <span className="text-xs">None</span>
        )}
      </div>
    </div>
  );
}
