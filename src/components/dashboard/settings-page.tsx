"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Activity,
  Bot,
  CheckCircle2,
  CloudCog,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/relative-time";
import { apiFetch, sentence } from "@/lib/dashboard/client";
import type { settingsDashboard } from "@/lib/dashboard/queries";
import { LoadFailure } from "./load-failure";

type Data = Awaited<ReturnType<typeof settingsDashboard>> & {
  syncAvailable: boolean;
  canManage: boolean;
};

export function SettingsPage() {
  const { data, error, mutate } = useSWR<Data>("/api/settings", apiFetch, {
    refreshInterval: 10_000,
  });
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);

  async function syncAgents() {
    setSyncing(true);
    const response = await fetch("/api/settings/sync", { method: "POST" });
    setSyncing(false);
    if (!response.ok)
      return toast.error("Agent sync failed. Check the public HTTPS origin.");
    toast.success("Both Bolna agents synced and GET-verified");
    await mutate();
  }

  async function healthCheck() {
    setChecking(true);
    const response = await fetch("/api/health", { cache: "no-store" });
    const body = (await response.json()) as { ok?: boolean; db?: string };
    setChecking(false);
    if (body.ok)
      toast.success(`Health check passed · database ${body.db ?? "ready"}`);
    else toast.error("Health check failed");
  }

  if (!data)
    if (error)
      return (
        <LoadFailure
          error={error}
          retry={() => void mutate()}
          title="Settings unavailable"
        />
      );
  if (!data)
    return (
      <div className="space-y-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-[560px]" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Integrations & readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configuration status and integration activity. Secret values are
            never returned to the browser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void healthCheck()}
            disabled={checking}
          >
            <Activity size={15} /> Health check
          </Button>
          {data.canManage && data.syncAvailable && (
            <Button onClick={() => void syncAgents()} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />{" "}
              Sync agents
            </Button>
          )}
        </div>
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudCog size={18} /> Configuration report
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(data.config).map(([name, status]) => (
            <div key={name} className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{sentence(name)}</p>
                <Badge
                  variant="outline"
                  className={
                    status.status === "configured"
                      ? "text-emerald-500"
                      : "text-amber-500"
                  }
                >
                  {status.status === "configured" ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <XCircle size={12} />
                  )}
                  {status.status}
                </Badge>
              </div>
              {status.missing.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Missing: {status.missing.join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot size={18} /> Bolna agents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(data.agents).map(([key, agent]) => (
              <div key={key} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{sentence(key)}</p>
                  <Badge variant="secondary">
                    {agent.id ? "Configured" : "Missing"}
                  </Badge>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {agent.id ?? "No agent ID"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last sync:{" "}
                  {agent.lastSyncedAt ? (
                    <RelativeTime value={agent.lastSyncedAt} />
                  ) : (
                    "Never"
                  )}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench size={18} /> Service activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Field label="APP_BASE_URL" value={data.appBaseUrl} />
            <Field
              label="Last webhook"
              value={
                data.lastWebhook ? (
                  <>
                    <RelativeTime value={data.lastWebhook.at} /> ·{" "}
                    {String(data.lastWebhook.status ?? "accepted")}
                  </>
                ) : (
                  "No receipt audit yet"
                )
              }
            />
            <Field
              label="Last tool call"
              value={
                data.lastTool ? (
                  <>
                    <RelativeTime value={data.lastTool.at} /> ·{" "}
                    {sentence(data.lastTool.name)}
                  </>
                ) : (
                  "No tool call yet"
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 break-all font-medium">{value}</div>
    </div>
  );
}
