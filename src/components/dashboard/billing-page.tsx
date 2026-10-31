"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PLANS,
  type BillingInterval,
  type BillingTier,
} from "@/lib/billing/plans";

type BillingData = {
  tier: BillingTier;
  source: "subscription" | "trial" | "enterprise_agreement" | "free";
  trialEndsAt: string | null;
  entitlements: {
    debtors: number | null;
    callsPerMonth: number | null;
    seats: number | null;
    campaigns: boolean;
    dailyBrief: boolean;
    promptPrs: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
  };
  usage: { debtors: number; callsThisMonth: number; seats: number };
  subscription: {
    status: string;
    interval: BillingInterval;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    amountMinor: string | null;
    currency: string;
  } | null;
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  billingEnvironment: "test_mode" | "live_mode";
  role: string;
};
const fetcher = async (url: string): Promise<BillingData> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load billing");
  return response.json();
};
const usageItems = [
  { label: "Debtor accounts", used: "debtors", limit: "debtors" },
  {
    label: "Voice calls this month",
    used: "callsThisMonth",
    limit: "callsPerMonth",
  },
  { label: "Team members", used: "seats", limit: "seats" },
] as const;

export function BillingPage({
  checkout,
}: {
  checkout: "done" | "cancelled" | null;
}) {
  const { data, error, mutate } = useSWR("/api/billing", fetcher, {
    refreshInterval: checkout === "done" ? 5000 : 30000,
  });
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  async function navigate(endpoint: string, body?: object) {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (
        !response.ok ||
        (typeof result.checkoutUrl !== "string" &&
          typeof result.portalUrl !== "string")
      )
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Billing is unavailable",
        );
      const url = new URL(result.checkoutUrl ?? result.portalUrl);
      if (url.protocol !== "https:") throw new Error("Invalid billing link");
      window.location.assign(url.toString());
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Billing is unavailable",
      );
      setBusy(false);
    }
  }
  if (error)
    return (
      <Card>
        <CardContent className="py-6">
          <p role="alert">Billing is unavailable right now.</p>
          <Button className="mt-4" onClick={() => void mutate()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  if (!data)
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading your plan…
        </CardContent>
      </Card>
    );
  const isOwner = data.role === "owner";
  const price = PLANS.pro.pricing![interval].rupees;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-3xl font-semibold">{PLANS[data.tier].name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.source === "trial"
                ? `Pro trial${data.trialEndsAt ? ` through ${new Date(data.trialEndsAt).toLocaleDateString("en-IN")}` : ""}`
                : data.source === "subscription"
                  ? `Dodo subscription · ${data.subscription?.status}`
                  : data.source === "enterprise_agreement"
                    ? "Enterprise agreement"
                    : "Free forever · no card required"}
            </p>
          </div>
          {checkout === "done" && (
            <p
              role="status"
              className="rounded-md border border-amber-400/40 bg-amber-100/10 p-3 text-sm"
            >
              Checkout returned. We will activate your plan after Dodo confirms
              it by signed webhook. This page refreshes automatically.
            </p>
          )}
          {checkout === "cancelled" && (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              Checkout was cancelled. Your current plan is unchanged.
            </p>
          )}
          {data.subscription && (
            <p className="text-sm text-muted-foreground">
              {data.subscription.interval} ·{" "}
              {data.subscription.cancelAtPeriodEnd
                ? "Cancels at period end"
                : "Renews automatically"}
              {data.subscription.currentPeriodEnd
                ? ` · ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString("en-IN")}`
                : ""}
            </p>
          )}
          {data.portalAvailable && isOwner && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void navigate("/api/billing/portal")}
            >
              Manage billing in Dodo
            </Button>
          )}
          <div className="space-y-4 border-t pt-5">
            {usageItems.map((item) => {
              const used = data.usage[item.used],
                limit = data.entitlements[item.limit];
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span>
                      {used} / {limit ?? "Unlimited"}
                    </span>
                  </div>
                  {limit !== null && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, Math.round((used / Math.max(1, limit)) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {data.source === "subscription"
              ? "Your subscription"
              : "Upgrade to Pro"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.source === "subscription" ? (
            <p className="text-sm text-muted-foreground">
              Change your payment method, download invoices, or cancel renewal
              in Dodo&apos;s secure customer portal.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                For daily follow-ups: up to 2,000 debtor accounts, 1,500 monthly
                calls and 10 team members, plus campaigns, owner brief and
                Prompt PRs.
              </p>
              <div
                className="flex gap-2"
                role="group"
                aria-label="Billing interval"
              >
                {(["monthly", "yearly"] as const).map((value) => (
                  <Button
                    key={value}
                    variant={interval === value ? "default" : "outline"}
                    onClick={() => setInterval(value)}
                    aria-pressed={interval === value}
                  >
                    {value === "monthly" ? "Monthly" : "Yearly"}
                  </Button>
                ))}
              </div>
              <p className="text-2xl font-semibold">
                ₹{price.toLocaleString("en-IN")}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  /{interval === "monthly" ? "month" : "year"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Dodo checkout shows tax and final renewal amount.{" "}
                {data.billingEnvironment === "test_mode"
                  ? "Test mode: no real charge."
                  : "Live mode: payment charges are real."}
              </p>
              <Button
                disabled={!isOwner || !data.checkoutAvailable || busy}
                onClick={() =>
                  void navigate("/api/billing/checkout", {
                    tier: "pro",
                    interval,
                  })
                }
              >
                Continue to secure checkout
              </Button>
              {!data.checkoutAvailable && (
                <p className="text-sm text-muted-foreground">
                  Checkout is not configured yet. Your current access remains
                  available.
                </p>
              )}
              {!isOwner && (
                <p className="text-sm text-muted-foreground">
                  Only the workspace owner can change billing.
                </p>
              )}
            </>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <div className="border-t pt-5 text-sm text-muted-foreground">
            <Link href="/pricing" className="underline underline-offset-4">
              Compare all plans
            </Link>
            <span className="mx-3">·</span>
            <Link
              href="/contact-sales"
              className="underline underline-offset-4"
            >
              Talk about Enterprise
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
