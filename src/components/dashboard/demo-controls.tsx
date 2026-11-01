"use client";

import useSWR from "swr";
import { Clock9, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/dashboard/client";
import type { DashboardSummary } from "@/lib/dashboard/types";
import { useReadOnly } from "@/components/read-only-context";

export function DemoControls() {
  const readOnly = useReadOnly();
  const { data, mutate } = useSWR<DashboardSummary>(
    "/api/dashboard/summary",
    apiFetch,
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  async function run(
    url: string,
    success: string,
    options: RequestInit = { method: "POST" },
  ) {
    const response = await fetch(url, options);
    const body = (await response.json()) as {
      error?: string;
      spoken_response?: string;
    };
    if (!response.ok)
      return toast.error(body.error ?? "Demo action unavailable");
    toast.success(body.spoken_response ?? success);
    await mutate();
  }

  const token = data?.liveCall?.paymentToken;
  const override = data?.business.demoOverride ?? false;
  if (readOnly)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="py-8 text-sm text-muted-foreground">
          Demo controls are hidden in the public read-only workspace.
        </CardContent>
      </Card>
    );
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Demo controls</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Drive the visible payment and compliance moments without pretending
            simulated effects are real.
          </p>
        </div>
        {override && (
          <Badge className="bg-amber-500/15 text-amber-500">
            Demo override
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Button
          variant="outline"
          disabled={!token}
          onClick={() =>
            token &&
            void run(`/api/pay/${token}/simulate`, "Simulated payment recorded")
          }
        >
          <WalletCards size={16} /> Simulate payment
        </Button>
        <Button
          variant="outline"
          disabled={!data?.liveCall}
          onClick={() =>
            void run(
              "/api/demo/callback",
              "9 pm request moved to the next compliant slot",
            )
          }
        >
          <Clock9 size={16} /> Request 9 pm callback
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void run(
              "/api/demo/override",
              override ? "Demo override disabled" : "Demo override enabled",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !override }),
              },
            )
          }
        >
          <ShieldCheck size={16} /> {override ? "Disable" : "Enable"} override
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (
              window.confirm(
                "Restore the fictional seeded portfolio? This removes local demo activity.",
              )
            )
              void run("/api/demo/reset", "Fictional demo portfolio restored");
          }}
        >
          <RefreshCcw size={16} /> Reset demo data
        </Button>
      </CardContent>
    </Card>
  );
}
