"use client";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import { apiFetch } from "@/lib/dashboard/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "./load-failure";

type Result = {
  persona: string;
  label: string;
  passed: boolean;
  judge: { tone: number };
};
type Detail = {
  syncAvailable: boolean;
  canManage: boolean;
  row: {
    id: string;
    title: string;
    problem: string;
    evidence: Array<{ call_id: string; quote: string; outcome: string }>;
    change: { section_id: string; old_text: string; new_text: string };
    expectedImpact: string;
    risk: string;
    confidence: string;
    status: string;
    simResults: {
      recommended: boolean;
      complianceRegressed: boolean;
      base: { results: Result[] };
      candidate: { results: Result[] };
    };
  };
  base: { version: number };
};

export function PromptPrDetailPage({ id }: { id: string }) {
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<Detail>(`/api/prompt-prs/${id}`, apiFetch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!data)
    if (loadError)
      return (
        <LoadFailure
          error={loadError}
          retry={() => void mutate()}
          title="Prompt proposal unavailable"
        />
      );
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-80" />
      </div>
    );
  const row = data.row;
  async function act(action: "approve" | "reject" | "rollback") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/prompt-prs/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const base = new Map(row.simResults.base.results.map((r) => [r.persona, r]));
  return (
    <div className="space-y-6">
      <Link
        href="/prompt-prs"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Prompt PRs
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex gap-2">
            <Badge variant="outline">{row.status.replace("_", " ")}</Badge>
            <Badge
              variant={row.simResults.recommended ? "default" : "destructive"}
            >
              {row.simResults.recommended ? "Recommended" : "Needs review"}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{row.title}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{row.problem}</p>
        </div>
        <div className="flex gap-2">
          {row.status === "open" && data.canManage && (
            <>
              {data.syncAvailable && (
                <Button
                  disabled={busy || !row.simResults.recommended}
                  onClick={() => act("approve")}
                >
                  <Check className="mr-2 size-4" />
                  Approve & sync
                </Button>
              )}
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => act("reject")}
              >
                <X className="mr-2 size-4" />
                Reject
              </Button>
            </>
          )}
          {row.status === "approved" &&
            data.canManage &&
            data.syncAvailable && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => act("rollback")}
              >
                <RotateCcw className="mr-2 size-4" />
                Roll back
              </Button>
            )}
        </div>
      </div>
      {!data.syncAvailable && (
        <p className="text-sm text-muted-foreground">
          Prompt sync is paused while Chase shares one Bolna agent across
          workspaces. You can review or reject this proposal.
        </p>
      )}
      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">
          {error}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Change · {row.change.section_id}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-sm">
            <pre className="whitespace-pre-wrap rounded-md bg-rose-500/10 p-4 text-rose-300">
              - {row.change.old_text}
            </pre>
            <pre className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-4 text-emerald-300">
              + {row.change.new_text}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Impact & risk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Expected impact</p>
              <p className="mt-1 text-muted-foreground">{row.expectedImpact}</p>
            </div>
            <div>
              <p className="font-medium">Risk</p>
              <p className="mt-1 text-muted-foreground">{row.risk}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {row.evidence.map((e) => (
            <blockquote
              key={`${e.call_id}:${e.quote}`}
              className="border-l-2 border-amber-500 pl-4 text-sm"
            >
              <p>“{e.quote}”</p>
              <Link
                className="mt-1 inline-block text-xs text-amber-500 hover:underline"
                href={`/calls/${e.call_id}`}
              >
                {e.outcome} · open call
              </Link>
            </blockquote>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            Base v{data.base.version} vs candidate simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3">Persona</th>
                  <th>Base</th>
                  <th>Candidate</th>
                  <th>Tone</th>
                </tr>
              </thead>
              <tbody>
                {row.simResults.candidate.results.map((candidate) => {
                  const before = base.get(candidate.persona);
                  return (
                    <tr key={candidate.persona} className="border-t">
                      <td className="py-3">{candidate.label}</td>
                      <td>{before?.passed ? "Pass" : "Fail"}</td>
                      <td
                        className={
                          candidate.passed
                            ? "text-emerald-500"
                            : "text-rose-500"
                        }
                      >
                        {candidate.passed ? "Pass" : "Fail"}
                      </td>
                      <td className="tabular-nums">
                        {before?.judge.tone ?? "—"} → {candidate.judge.tone}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
