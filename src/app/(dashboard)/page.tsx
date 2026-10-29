import Link from "next/link";
import {
  ArrowUpRight,
  AudioLines,
  CircleCheck,
  Clock3,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { getEnv, configReport } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveStatus } from "@/components/live-status";
import { EventFeed } from "@/components/event-feed";
export const dynamic = "force-dynamic";
export default function Dashboard() {
  const env = getEnv();
  const report = configReport(env);
  const integrations = [
    { name: "Voice calling", provider: "Bolna", status: report.bolna },
    { name: "Intelligence", provider: env.LLM_PROVIDER, status: report.llm },
    {
      name: "Messaging",
      provider: env.MESSAGING_PROVIDER,
      status: report.messaging,
    },
    {
      name: "Payments",
      provider: env.PAYMENTS_PROVIDER,
      status: report.payments,
    },
  ];
  return (
    <div className="min-h-screen bg-[#f6f7f5]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[#172822]"
          >
            <AudioLines size={27} />
            chase<span className="text-emerald-600">.</span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">
              {env.DEMO_MODE ? "Demo workspace" : "Live workspace"}
            </Badge>
            <LiveStatus />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium tracking-[.16em] text-stone-500 uppercase">
              Collections workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              A clearer picture of what’s due.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {env.BUSINESS_NAME ?? "Your business"} · All times in India
              Standard Time
            </p>
          </div>
          <span className="text-xs text-stone-500">
            Part 1 / 10 · Foundation
          </span>
        </div>
        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Wallet,
              title: "Outstanding dues",
              text: "Your ledger starts here",
              note: "Invoice import arrives in Part 2.",
            },
            {
              icon: Clock3,
              title: "Collection hours",
              text: "09:00 – 18:30",
              note: "Hard limits: 08:00–19:00 IST.",
            },
            {
              icon: ShieldCheck,
              title: "Demo call protection",
              text: env.CALL_ALLOWLIST.length
                ? `${env.CALL_ALLOWLIST.length} allowed numbers`
                : "No recipients enabled",
              note: "Only explicitly allowed numbers can be dialled.",
            },
          ].map(({ icon: Icon, title, text, note }) => (
            <Card key={title} className="shadow-none">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-stone-500">
                  {title}
                </CardTitle>
                <Icon size={17} className="text-stone-400" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold tracking-tight">{text}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {note}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
        <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="border-b py-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Live feed
                </Badge>
              </div>
            </CardHeader>
            <EventFeed />
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                Your connected services
              </CardTitle>
              <p className="text-xs leading-5 text-muted-foreground">
                Configuration status. Run the smoke check to verify
                connectivity.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {integrations.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.provider}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      item.status.status === "configured"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-stone-200 text-stone-500"
                    }
                  >
                    {item.status.status === "configured" ? (
                      <>
                        <CircleCheck size={12} /> Configured
                      </>
                    ) : (
                      "Needs setup"
                    )}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-xl bg-[#172822] p-7 text-white sm:flex-row sm:items-center">
          <div>
            <p className="text-lg font-medium">Less chasing. More business.</p>
            <p className="mt-2 text-sm text-stone-300">
              Next up: bring your ledger into Chase.
            </p>
          </div>
          <span className="flex items-center gap-2 text-sm text-emerald-200">
            Invoice import · Part 2 <ArrowUpRight size={17} />
          </span>
        </div>
        <footer className="flex flex-wrap justify-between gap-3 text-xs text-stone-400">
          <span>Bolna makes the call. Chase gets you paid.</span>
          <span>Bolna × YC Symphony Buildathon</span>
        </footer>
      </main>
    </div>
  );
}
