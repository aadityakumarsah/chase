"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp } from "lucide-react";
import { ChaseBrand } from "./brand";
import {
  PLANS,
  PLAN_ORDER,
  yearlySaving,
  type BillingInterval,
} from "@/lib/billing/plans";

const money = (rupees: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return (
    <main className="min-h-screen bg-[#111110] text-[#f2f0ed]">
      <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-6 py-5">
        <ChaseBrand />
        <nav
          className="flex items-center gap-6 text-sm text-neutral-300"
          aria-label="Pricing navigation"
        >
          <Link href="/" className="hover:text-white">
            Product
          </Link>
          <Link href="/docs" className="hover:text-white">
            Docs
          </Link>
          <Link href="/login" className="hover:text-white">
            Log in
          </Link>
        </nav>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#ffc8a9]">
          PRICING THAT GROWS WITH YOU
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Less chasing. <span className="text-[#ffc8a9]">More business.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-neutral-400">
          Start with your ledger and a small team. Upgrade when follow-ups
          become a daily operation. Your customers pay your business directly.
        </p>
        <div
          className="mt-10 inline-flex rounded-full border border-white/15 bg-white/5 p-1"
          role="group"
          aria-label="Billing frequency"
        >
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${interval === value ? "bg-[#ffc8a9] text-[#201711]" : "text-neutral-300 hover:text-white"}`}
            >
              {value === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const price = plan.pricing?.[interval];
            const href =
              tier === "enterprise"
                ? "/contact-sales"
                : tier === "free"
                  ? "/signup"
                  : "/signup?next=%2Fsettings%2Fbilling";
            return (
              <article
                key={tier}
                className={`flex flex-col rounded-3xl border p-7 ${plan.highlight ? "border-[#ffc8a9]/70 bg-[#211a16]" : "border-white/12 bg-white/[.03]"}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">{plan.name}</h2>
                  {plan.highlight && (
                    <span className="rounded-full bg-[#ffc8a9]/15 px-3 py-1 text-xs font-semibold text-[#ffc8a9]">
                      MOST POPULAR
                    </span>
                  )}
                </div>
                <p className="mt-3 min-h-14 text-sm leading-6 text-neutral-400">
                  {plan.tagline}
                </p>
                <p className="mt-8 min-h-18">
                  <strong className="text-4xl font-semibold">
                    {price
                      ? money(price.rupees)
                      : tier === "free"
                        ? "₹0"
                        : "Custom"}
                  </strong>
                  {price && (
                    <span className="ml-1 text-neutral-400">
                      /{interval === "monthly" ? "month" : "year"}
                    </span>
                  )}
                </p>
                {price && interval === "yearly" && (
                  <p className="mb-4 text-sm text-[#ffc8a9]">
                    Save {money(yearlySaving(tier) ?? 0)} compared with monthly
                  </p>
                )}
                <Link
                  href={href}
                  className={`mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition ${plan.highlight ? "bg-[#ffc8a9] text-[#201711] hover:bg-[#ffd8c0]" : "border border-white/20 text-white hover:bg-white/10"}`}
                >
                  {plan.cta}
                  <ArrowRight size={16} />
                </Link>
                <div className="mt-8 border-t border-white/10 pt-7">
                  <p className="mb-5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Included
                  </p>
                  <ul className="space-y-4">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex gap-3 text-sm leading-5 text-neutral-200"
                      >
                        <Check
                          size={16}
                          className="mt-0.5 shrink-0 text-[#ffc8a9]"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-8 flex max-w-3xl gap-2 text-sm leading-6 text-neutral-400">
          <CircleHelp size={18} className="mt-1 shrink-0" />
          Subscription charges are collected by Dodo Payments. Bolna voice and
          external messaging costs may depend on your setup. Checkout shows the
          final amount, tax and renewal terms before payment. The free plan
          needs no card.
        </p>
      </section>
    </main>
  );
}
