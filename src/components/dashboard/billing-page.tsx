"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_ORDER,
  formatRupees,
  yearlySavingPercent,
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
  checkoutBlockedReason:
    "no_payment_provider" | "no_products" | "not_owner" | null;
  portalAvailable: boolean;
  billingEnvironment: "test_mode" | "live_mode";
  role: string;
};

const fetcher = async (url: string): Promise<BillingData> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load billing");
  return response.json();
};

const METERS = [
  {
    label: "Debtor accounts",
    used: "debtors",
    limit: "debtors",
    hint: "Accounts in your portfolio",
  },
  {
    label: "Voice calls",
    used: "callsThisMonth",
    limit: "callsPerMonth",
    hint: "Collection calls this month",
  },
  {
    label: "Team members",
    used: "seats",
    limit: "seats",
    hint: "Active and invited members",
  },
] as const;

const date = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const daysLeft = (value: string) =>
  Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 86_400_000));

export function BillingPage({
  checkout,
}: {
  checkout: "done" | "cancelled" | null;
}) {
  const { data, error, mutate } = useSWR("/api/billing", fetcher, {
    refreshInterval: checkout === "done" ? 5_000 : 30_000,
  });
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function navigate(endpoint: string, key: string, body?: object) {
    setBusy(key);
    setActionError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      const target = result.checkoutUrl ?? result.portalUrl;
      if (!response.ok || typeof target !== "string")
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Billing is unavailable",
        );
      const url = new URL(target);
      if (url.protocol !== "https:") throw new Error("Invalid billing link");
      window.location.assign(url.toString());
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Billing is unavailable",
      );
      setBusy(null);
    }
  }

  if (error)
    return (
      <div className="rounded-xl border bg-card p-6">
        <p role="alert" className="text-sm">
          Billing is unavailable right now.
        </p>
        <Button className="mt-4" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );

  if (!data)
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl border bg-card" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-80 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>
      </div>
    );

  const isOwner = data.role === "owner";
  /** Human explanation for a disabled upgrade button, or null when it works. */
  const blocked: string | null =
    data.checkoutBlockedReason === "not_owner" || !isOwner
      ? "Only the workspace owner can change the plan."
      : data.checkoutBlockedReason === "no_payment_provider"
        ? "Payments are not connected yet. Add your Dodo keys in Vercel."
        : data.checkoutBlockedReason === "no_products"
          ? "No Dodo product is configured for this plan yet."
          : null;
  const trialing = data.source === "trial";
  const subscribed = data.source === "subscription";
  const savings = yearlySavingPercent("pro");

  return (
    <div className="space-y-6">
      {checkout === "done" && (
        <Banner tone="pending">
          Checkout returned. Your plan activates once Dodo confirms it by signed
          webhook — this page refreshes itself.
        </Banner>
      )}
      {checkout === "cancelled" && (
        <Banner tone="muted">
          Checkout was cancelled. Your current plan is unchanged.
        </Banner>
      )}
      {trialing && data.trialEndsAt && (
        <Banner tone={daysLeft(data.trialEndsAt) <= 2 ? "warn" : "pending"}>
          <strong>
            {daysLeft(data.trialEndsAt)} day
            {daysLeft(data.trialEndsAt) === 1 ? "" : "s"} left
          </strong>{" "}
          on your Pro trial, through {date(data.trialEndsAt)}. Trial limits are
          smaller than Pro — upgrade to lift them.
        </Banner>
      )}

      {/* Current plan and consumption */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              Current plan
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <h2 className="text-2xl font-semibold">
                {PLANS[data.tier].name}
              </h2>
              {trialing && (
                <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
                  Trial
                </Badge>
              )}
              {subscribed && data.subscription && (
                <Badge variant="secondary" className="capitalize">
                  {data.subscription.status.replaceAll("_", " ")}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscribed && data.subscription
                ? `${data.subscription.interval === "yearly" ? "Yearly" : "Monthly"} · ${
                    data.subscription.cancelAtPeriodEnd ? "cancels" : "renews"
                  }${
                    data.subscription.currentPeriodEnd
                      ? ` ${date(data.subscription.currentPeriodEnd)}`
                      : ""
                  }`
                : trialing
                  ? "Pro features on trial limits"
                  : data.source === "enterprise_agreement"
                    ? "Enterprise agreement"
                    : "Free forever · no card required"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.portalAvailable && isOwner && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => void navigate("/api/billing/portal", "portal")}
              >
                {busy === "portal" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CreditCard size={15} />
                )}
                Manage billing
              </Button>
            )}
            <Button variant="ghost" asChild>
              <Link href="/pricing">
                Compare plans <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-3">
          {METERS.map((meter) => {
            const used = data.usage[meter.used];
            const limit = data.entitlements[meter.limit];
            const share =
              limit === null
                ? 0
                : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
            const tight = limit !== null && share >= 80;
            const full = limit !== null && used >= limit;
            return (
              <div key={meter.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{meter.label}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      full
                        ? "font-semibold text-rose-600 dark:text-rose-400"
                        : tight
                          ? "font-medium text-amber-600 dark:text-amber-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {used.toLocaleString("en-IN")} /{" "}
                    {limit === null ? "∞" : limit.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      full
                        ? "bg-rose-500"
                        : tight
                          ? "bg-amber-500"
                          : "bg-foreground/70",
                    )}
                    style={{ width: limit === null ? "100%" : `${share}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {full ? "Limit reached" : meter.hint}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Plan chooser */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Plans</h3>
            <p className="text-sm text-muted-foreground">
              Change or cancel at any time. Prices exclude tax.
            </p>
          </div>
          <div
            className="inline-flex rounded-lg border bg-card p-1"
            role="group"
            aria-label="Billing interval"
          >
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                aria-pressed={interval === value}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  interval === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "monthly" ? "Monthly" : "Yearly"}
                {value === "yearly" && savings !== null && (
                  <span
                    className={cn(
                      "ml-1.5",
                      interval === "yearly"
                        ? "text-background/80"
                        : "text-emerald-600 dark:text-emerald-500",
                    )}
                  >
                    −{savings}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const current = data.tier === tier && !trialing;
            const pricing = plan.pricing;
            return (
              <div
                key={tier}
                className={cn(
                  "flex flex-col rounded-xl border bg-card p-5",
                  plan.highlight &&
                    !current &&
                    "border-foreground/30 shadow-sm",
                  current && "border-foreground/50 ring-1 ring-foreground/20",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold">{plan.name}</h4>
                  {current ? (
                    <Badge variant="secondary">Current</Badge>
                  ) : (
                    plan.highlight && (
                      <Badge className="gap-1">
                        <Sparkles size={11} /> Popular
                      </Badge>
                    )
                  )}
                </div>
                <p className="mt-1.5 min-h-[2.5rem] text-xs text-muted-foreground">
                  {plan.tagline}
                </p>
                <div className="mt-3 border-y py-3">
                  {pricing ? (
                    <>
                      <span className="text-2xl font-semibold tabular-nums">
                        {formatRupees(pricing[interval].rupees)}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        /{interval === "monthly" ? "month" : "year"}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-semibold">
                      {tier === "free" ? "₹0" : "Custom"}
                    </span>
                  )}
                </div>
                <ul className="mt-4 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-xs">
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-500"
                      />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 space-y-2">
                  {tier === "enterprise" ? (
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/contact-sales">
                        {plan.cta} <ExternalLink size={13} />
                      </Link>
                    </Button>
                  ) : current || (tier === "free" && data.tier === "free") ? (
                    <p className="rounded-md bg-muted py-2 text-center text-xs font-medium text-muted-foreground">
                      This is your plan
                    </p>
                  ) : tier === "free" ? (
                    <p className="rounded-md bg-muted py-2 text-center text-xs text-muted-foreground">
                      Included in every plan
                    </p>
                  ) : (
                    <>
                      <Button
                        className="w-full"
                        disabled={blocked !== null || busy !== null}
                        onClick={() =>
                          void navigate("/api/billing/checkout", "checkout", {
                            tier: "pro",
                            interval,
                          })
                        }
                      >
                        {busy === "checkout" && (
                          <Loader2 size={15} className="animate-spin" />
                        )}
                        {plan.cta}
                      </Button>
                      {blocked && (
                        <p className="text-center text-[11px] leading-4 text-muted-foreground">
                          {blocked}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {data.billingEnvironment === "test_mode"
              ? "Test mode — no real charge is made."
              : "Payments are live and will be charged."}
          </span>
          <span>Dodo checkout shows tax and the final renewal amount.</span>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400"
          >
            {actionError}
          </p>
        )}
      </section>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "pending" | "warn" | "muted";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-xl border p-4 text-sm",
        tone === "warn" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
        tone === "pending" && "border-foreground/15 bg-muted/50",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {tone === "warn" && (
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </p>
  );
}
