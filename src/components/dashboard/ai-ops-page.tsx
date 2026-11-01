"use client";
import useSWR from "swr";
import {
  Bot,
  BrainCircuit,
  Braces,
  FlaskConical,
  GitPullRequest,
  Layers3,
  Route,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/page-heading";
import { apiFetch, sentence } from "@/lib/dashboard/client";
import type { aiOps } from "@/lib/dashboard/queries";
import { LoadFailure } from "./load-failure";
type Data = Awaited<ReturnType<typeof aiOps>>;
export function AiOpsPage() {
  const { data, error, mutate } = useSWR<Data>("/api/ai-ops", apiFetch, {
    refreshInterval: 10_000,
  });
  if (!data)
    if (error)
      return (
        <main className="p-5 lg:p-8">
          <LoadFailure
            error={error}
            retry={() => void mutate()}
            title="AI activity unavailable"
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
  const techniques: Array<{
    title: string;
    description: string;
    count: number;
    icon: LucideIcon;
  }> = [
    {
      title: "Structured outputs",
      description:
        "Call analysis, dossiers and briefs are schema-validated before writes.",
      count: data.techniques.structuredOutputs,
      icon: Braces,
    },
    {
      title: "Strict tools",
      description:
        "Claude emits constrained tool arguments at typed boundaries.",
      count: data.techniques.strictTools,
      icon: Shield,
    },
    {
      title: "Prompt caching",
      description:
        "Stable system context is cached to reduce latency and tokens.",
      count: data.techniques.promptCaching,
      icon: Sparkles,
    },
    {
      title: "FAST / SMART / DEEP",
      description:
        "Each task is routed to the appropriate intelligence and latency tier.",
      count: data.techniques.routing,
      icon: Route,
    },
    {
      title: "Live supervisor",
      description: "A parallel safety path can inspect high-risk turns.",
      count: data.techniques.supervisor,
      icon: BrainCircuit,
    },
    {
      title: "Evaluator loop",
      description: "Losing calls become evidence-backed Prompt PR candidates.",
      count: data.techniques.evaluator,
      icon: GitPullRequest,
    },
    {
      title: "Persona red-team",
      description:
        "Simulated debtors test prompts against difficult conversations.",
      count: data.techniques.personaSim,
      icon: FlaskConical,
    },
  ];
  const summary: Array<{
    label: string;
    value: React.ReactNode;
    icon: LucideIcon;
  }> = [
    { label: "LLM calls", value: data.totals.calls, icon: Bot },
    {
      label: "Structured success",
      value: `${data.totals.structuredSuccessRate}%`,
      icon: Braces,
    },
    {
      label: "Cache reads",
      value: data.totals.cacheReadTokens.toLocaleString("en-IN"),
      icon: Layers3,
    },
    {
      label: "Cache hit rate",
      value: `${data.totals.cacheHitRate}%`,
      icon: Sparkles,
    },
    { label: "Fallbacks", value: data.totals.fallbacks, icon: Route },
    {
      label: "Estimated cost",
      value: data.totals.estimatedCostUsd
        ? `$${data.totals.estimatedCostUsd.toFixed(4)}`
        : "Unknown",
      icon: BrainCircuit,
    },
  ];
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Claude observability"
        title="AI Ops"
        description="A live accounting of where intelligence, structured outputs, caching and evaluation are used."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {summary.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-2 py-4 shadow-none">
            <CardHeader className="flex-row items-center justify-between px-4 pb-0">
              <CardTitle className="text-xs text-muted-foreground">
                {label}
              </CardTitle>
              <Icon size={16} className="text-primary" />
            </CardHeader>
            <CardContent className="px-4 text-2xl font-semibold tabular-nums">
              {value}
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Latency by task and model</CardTitle>
          </CardHeader>
          <CardContent className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.groups.slice(0, 14)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="task"
                  tickFormatter={(value) => String(value).slice(0, 12)}
                  fontSize={10}
                />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="p50"
                  fill="var(--chart-1)"
                  name="p50 ms"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="p95"
                  fill="var(--chart-3)"
                  name="p95 ms"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Calls by task and model</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[380px] overflow-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-4">Task</th>
                  <th>Model</th>
                  <th>Calls</th>
                  <th>Success</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group) => (
                  <tr key={`${group.task}-${group.model}`} className="border-b">
                    <td className="p-4 font-medium">{sentence(group.task)}</td>
                    <td className="max-w-40 truncate text-xs text-muted-foreground">
                      {group.model}
                    </td>
                    <td>{group.calls}</td>
                    <td>{group.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Claude in Chase</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {techniques.map(({ title, description, count, icon: Icon }) => (
            <Card key={title} className="shadow-none">
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-sm">{title}</CardTitle>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                </div>
                <Icon size={18} className="text-primary" />
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold tabular-nums">
                  {count}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  live uses
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
