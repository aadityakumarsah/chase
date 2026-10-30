"use client";
import Link from "next/link";
import useSWR from "swr";
import { GitPullRequest, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/dashboard/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Row = {
  id: string;
  title: string;
  problem: string;
  status: string;
  confidence: string;
  createdAt: string;
  simResults: { recommended?: boolean } | null;
};

export function PromptPrsPage() {
  const { data } = useSWR<{ items: Row[] }>("/api/prompt-prs", apiFetch, {
    refreshInterval: 10_000,
  });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-500">
          Evaluator loop
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Prompt PRs</h1>
        <p className="mt-2 text-muted-foreground">
          Small evidence-backed changes, tested against compliance personas
          before approval.
        </p>
      </div>
      {!data ? (
        <div className="grid gap-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
            <GitPullRequest className="mb-4 size-8 text-muted-foreground" />
            <p className="font-medium">No Prompt PRs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The nightly evaluator will create one once analyzed calls are
              available.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.items.map((row) => (
            <Link key={row.id} href={`/prompt-prs/${row.id}`}>
              <Card className="transition-colors hover:border-amber-500/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-lg">{row.title}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {row.status.replace("_", " ")}
                      </Badge>
                      {row.simResults?.recommended && (
                        <Badge className="bg-emerald-600">
                          <ShieldCheck className="mr-1 size-3" />
                          Recommended
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{row.problem}</p>
                  <p className="mt-3 text-xs tabular-nums text-muted-foreground">
                    Confidence {Math.round(Number(row.confidence) * 100)}% ·{" "}
                    {new Date(row.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
