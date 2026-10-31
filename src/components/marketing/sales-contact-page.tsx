"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChaseBrand } from "./brand";

export function SalesContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    }).catch(() => null);
    if (!response?.ok) {
      setStatus("idle");
      setError(
        response
          ? "We could not save your request. Please try again."
          : "Connection failed. Please try again.",
      );
      return;
    }
    setStatus("sent");
  }
  return (
    <main className="min-h-screen bg-[#111110] text-white">
      <header className="mx-auto max-w-5xl border-b border-white/10 px-6 py-5">
        <ChaseBrand />
      </header>
      <section className="mx-auto grid max-w-5xl gap-14 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#ffc8a9]">
            ENTERPRISE
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight">
            Let&apos;s make follow-up work for your team.
          </h1>
          <p className="mt-6 leading-7 text-neutral-400">
            Tell us about your receivables operation. We&apos;ll discuss volume,
            conduct controls, integrations and a plan that fits. No payment is
            taken here.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-block text-sm text-[#ffc8a9] hover:underline"
          >
            ← See all plans
          </Link>
        </div>
        <div className="rounded-3xl border border-white/15 bg-white/[.04] p-7">
          {status === "sent" ? (
            <div role="status">
              <h2 className="text-2xl font-semibold">Request received.</h2>
              <p className="mt-4 text-neutral-400">
                Your details are saved for the Chase team. We have not charged
                you or activated an Enterprise plan.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {(
                [
                  ["companyName", "Company name", "text"],
                  ["contactName", "Your name", "text"],
                  ["email", "Work email", "email"],
                  ["phone", "Phone (optional)", "tel"],
                  ["seats", "Expected team seats (optional)", "number"],
                ] as const
              ).map(([name, label, type]) => (
                <label key={name} className="block text-sm text-neutral-300">
                  {label}
                  <input
                    name={name}
                    type={type}
                    required={["companyName", "contactName", "email"].includes(
                      name,
                    )}
                    min={type === "number" ? 1 : undefined}
                    className="mt-2 block w-full rounded-xl border border-white/15 bg-[#1d1b1a] px-4 py-3 text-white outline-none focus:border-[#ffc8a9]"
                  />
                </label>
              ))}
              <label className="block text-sm text-neutral-300">
                What are you looking for?
                <textarea
                  name="message"
                  rows={4}
                  maxLength={2000}
                  className="mt-2 block w-full rounded-xl border border-white/15 bg-[#1d1b1a] px-4 py-3 text-white outline-none focus:border-[#ffc8a9]"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <button
                disabled={status === "sending"}
                className="min-h-12 w-full rounded-xl bg-[#ffc8a9] px-5 font-semibold text-[#201711] disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Contact Chase"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
